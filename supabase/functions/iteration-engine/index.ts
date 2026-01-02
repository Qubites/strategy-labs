import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

declare const EdgeRuntime: {
  waitUntil(promise: Promise<unknown>): void;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface IterationRequest {
  experiment_group_id: string;
  trigger_type?: 'manual' | 'auto_tuner' | 'ai_advice';
  max_iterations?: number;
  mutation_aggressiveness?: number;
  stop_on_failure?: boolean;
  gates?: {
    min_trades?: number;
    max_dd?: number;
    min_improvement?: number;
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const {
      experiment_group_id,
      trigger_type = 'auto_tuner',
      max_iterations = 10,
      mutation_aggressiveness = 0.5,
      stop_on_failure = false,
      gates = {},
    } = await req.json() as IterationRequest;

    // Default gates - focus on absolute score, not percentage improvement
    const gateConfig = {
      min_trades: gates.min_trades ?? 5,
      max_dd: gates.max_dd ?? 0.50,
      min_improvement: gates.min_improvement ?? 0, // Only accept equal or better
    };

    console.log(`Starting iteration engine for group: ${experiment_group_id}`);
    console.log(`Gates: min_trades=${gateConfig.min_trades}, max_dd=${gateConfig.max_dd}`);

    // Fetch experiment group with all related data
    const { data: group, error: groupError } = await supabase
      .from('experiment_groups')
      .select(`
        *,
        strategy_templates (id, name, param_schema_json),
        datasets (*)
      `)
      .eq('id', experiment_group_id)
      .single();

    if (groupError || !group) {
      throw new Error('Experiment group not found');
    }

    // Get champion version or best version if no champion set
    let championVersion;
    
    if (group.champion_version_id) {
      const { data: champ } = await supabase
        .from('bot_versions')
        .select('*, bots(*)')
        .eq('id', group.champion_version_id)
        .single();
      championVersion = champ;
    }

    // If no champion, get best performing version in this group
    if (!championVersion) {
      const { data: versions } = await supabase
        .from('bot_versions')
        .select('*, bots(*)')
        .eq('experiment_group_id', experiment_group_id)
        .order('created_at', { ascending: false })
        .limit(1);
      
      if (versions && versions.length > 0) {
        championVersion = versions[0];
      }
    }

    const template = group.strategy_templates;
    const dataset = group.datasets;
    const objectiveConfig = group.objective_config as Record<string, number>;

    if (!template) {
      throw new Error('Template not found');
    }

    // Parse schema
    const paramSchema = JSON.parse(template.param_schema_json || '{}');

    // If still no version, create a seed version
    if (!championVersion) {
      const defaultParams: Record<string, any> = {};
      
      for (const param of (paramSchema.params || [])) {
        defaultParams[param.key] = param.default;
      }

      // Create a bot for this experiment
      const { data: newBot, error: botError } = await supabase
        .from('bots')
        .insert({
          name: `${group.name} - Seed Bot`,
          template_id: group.template_id,
        })
        .select()
        .single();

      if (botError || !newBot) {
        throw new Error('Failed to create seed bot');
      }

      // Create seed version
      const { data: seedVersion, error: versionError } = await supabase
        .from('bot_versions')
        .insert({
          bot_id: newBot.id,
          experiment_group_id,
          version_number: 1,
          params_json: JSON.stringify(defaultParams),
          params_hash: hashObject(defaultParams),
          risk_limits_json: JSON.stringify(paramSchema.default_risk_limits || {}),
          version_hash: hashObject({ params: defaultParams }),
          status: 'draft',
          is_champion: true,
        })
        .select('*, bots(*)')
        .single();

      if (versionError || !seedVersion) {
        throw new Error('Failed to create seed version');
      }

      championVersion = seedVersion;

      // Set as champion
      await supabase
        .from('experiment_groups')
        .update({ champion_version_id: seedVersion.id })
        .eq('id', experiment_group_id);
    }

    // Get current champion metrics - if no runs exist, run a baseline first
    let championMetrics = await getVersionBestMetrics(supabase, championVersion.id);
    const championParams = JSON.parse(championVersion.params_json || '{}');

    // If champion has no metrics (no backtests run), run one first
    if (championMetrics.trades_count === 0) {
      console.log('Champion has no metrics - running baseline backtest first');
      
      if (dataset) {
        await runBacktestForVersion(
          supabase,
          championVersion.id,
          dataset.id,
          SUPABASE_URL,
          SUPABASE_SERVICE_ROLE_KEY
        );
      } else {
        await runSimulatedBacktest(supabase, championVersion.id, championParams);
      }
      
      // Wait a moment for metrics to be written
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Re-fetch champion metrics
      championMetrics = await getVersionBestMetrics(supabase, championVersion.id);
      console.log('Champion baseline metrics:', championMetrics);
    }

    // Get current iteration count
    const { count: iterationCount } = await supabase
      .from('iterations')
      .select('*', { count: 'exact', head: true })
      .eq('experiment_group_id', experiment_group_id);

    const currentIterNum = (iterationCount || 0) + 1;
    let successfulIterations = 0;
    const results: any[] = [];

    // Track current best for progressive improvement
    let currentBestParams = { ...championParams };
    let currentBestMetrics = { ...championMetrics };
    let currentChampionId = championVersion.id;

    // Run iterations
    for (let i = 0; i < max_iterations; i++) {
      const iterNum = currentIterNum + i;
      console.log(`Running iteration ${iterNum}`);

      // Mutate parameters from current best
      const mutatedParams = mutateParams(
        currentBestParams,
        paramSchema.params || [],
        mutation_aggressiveness
      );

      // Calculate param diff
      const paramDiff: Record<string, { before: any; after: any }> = {};
      for (const key of Object.keys(mutatedParams)) {
        if (mutatedParams[key] !== currentBestParams[key]) {
          paramDiff[key] = {
            before: currentBestParams[key],
            after: mutatedParams[key],
          };
        }
      }

      // Get current version number for this bot
      const { data: latestVersions } = await supabase
        .from('bot_versions')
        .select('version_number')
        .eq('bot_id', championVersion.bot_id)
        .order('version_number', { ascending: false })
        .limit(1);

      const nextVersionNum = ((latestVersions?.[0]?.version_number) || 0) + 1;

      // Create challenger version
      const challengerInsertResult = await supabase
        .from('bot_versions')
        .insert({
          bot_id: championVersion.bot_id,
          experiment_group_id,
          version_number: nextVersionNum,
          params_json: JSON.stringify(mutatedParams),
          params_hash: hashObject(mutatedParams),
          risk_limits_json: championVersion.risk_limits_json,
          version_hash: hashObject({ params: mutatedParams }),
          status: 'draft',
          is_champion: false,
        })
        .select()
        .single();

      if (challengerInsertResult.error || !challengerInsertResult.data) {
        console.error('Failed to create challenger:', challengerInsertResult.error);
        continue;
      }

      const challengerVersion = challengerInsertResult.data;

      // Run backtest for challenger
      if (dataset) {
        await runBacktestForVersion(
          supabase,
          challengerVersion.id,
          dataset.id,
          SUPABASE_URL,
          SUPABASE_SERVICE_ROLE_KEY
        );
      } else {
        await runSimulatedBacktest(supabase, challengerVersion.id, mutatedParams);
      }

      // Wait for backtest to complete
      await new Promise(resolve => setTimeout(resolve, 300));

      // Get challenger metrics
      const challengerMetrics = await getVersionBestMetrics(supabase, challengerVersion.id);

      // Evaluate gates comparing to current best (not original champion)
      const gateResults = evaluateGates(
        currentBestMetrics, 
        challengerMetrics, 
        objectiveConfig,
        gateConfig
      );

      // Calculate scores - accept ONLY if challenger is better
      const currentScore = calculateScore(currentBestMetrics, objectiveConfig);
      const challengerScore = calculateScore(challengerMetrics, objectiveConfig);
      
      // Simple rule: challenger must have higher score AND meet basic gates
      const tradesOk = challengerMetrics.trades_count >= gateConfig.min_trades;
      const ddOk = challengerMetrics.max_drawdown <= gateConfig.max_dd;
      const scoreOk = challengerScore >= currentScore; // Must be equal or better
      
      let accepted = tradesOk && ddOk && scoreOk;
      let rejectReason = null;

      if (!accepted) {
        const reasons: string[] = [];
        if (!tradesOk) reasons.push(`trades: ${challengerMetrics.trades_count} < ${gateConfig.min_trades}`);
        if (!ddOk) reasons.push(`dd: ${(challengerMetrics.max_drawdown * 100).toFixed(1)}% > ${(gateConfig.max_dd * 100).toFixed(1)}%`);
        if (!scoreOk) reasons.push(`score: ${challengerScore.toFixed(3)} < ${currentScore.toFixed(3)}`);
        rejectReason = reasons.join(', ');
      }

      // Create iteration record
      await supabase
        .from('iterations')
        .insert({
          experiment_group_id,
          parent_version_id: currentChampionId,
          child_version_id: challengerVersion.id,
          iteration_number: iterNum,
          trigger_type,
          param_diff: paramDiff,
          risk_diff: null,
          ai_rationale: trigger_type === 'auto_tuner' 
            ? `Auto-tuned ${Object.keys(paramDiff).length} parameters with ${(mutation_aggressiveness * 100).toFixed(0)}% aggressiveness`
            : null,
          gate_results: gateResults,
          metric_before: currentBestMetrics,
          metric_after: challengerMetrics,
          accepted,
          reject_reason: rejectReason,
        });

      results.push({
        iteration_number: iterNum,
        accepted,
        challenger_id: challengerVersion.id,
        param_diff: paramDiff,
        gate_results: gateResults,
        reject_reason: rejectReason,
        score_before: currentScore,
        score_after: challengerScore,
      });

      // If accepted, promote challenger
      if (accepted) {
        successfulIterations++;

        // Unset old champion
        await supabase
          .from('bot_versions')
          .update({ is_champion: false })
          .eq('id', currentChampionId);

        // Set new champion
        await supabase
          .from('bot_versions')
          .update({ is_champion: true, status: 'backtested' })
          .eq('id', challengerVersion.id);

        // Update experiment group
        await supabase
          .from('experiment_groups')
          .update({ 
            champion_version_id: challengerVersion.id,
            updated_at: new Date().toISOString()
          })
          .eq('id', experiment_group_id);

        // Update tracking for next iteration
        currentChampionId = challengerVersion.id;
        currentBestParams = { ...mutatedParams };
        currentBestMetrics = { ...challengerMetrics };

        console.log(`Iteration ${iterNum}: Challenger accepted! Score: ${currentScore.toFixed(3)} → ${challengerScore.toFixed(3)}`);
      } else {
        // Mark challenger as rejected
        await supabase
          .from('bot_versions')
          .update({ status: 'rejected' })
          .eq('id', challengerVersion.id);

        console.log(`Iteration ${iterNum}: Challenger rejected - ${rejectReason}`);

        if (stop_on_failure) {
          console.log('Stopping due to failure (stop_on_failure=true)');
          break;
        }
      }
    }

    return new Response(JSON.stringify({
      success: true,
      experiment_group_id,
      iterations_run: results.length,
      successful_iterations: successfulIterations,
      current_champion_id: currentChampionId,
      results,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in iteration-engine:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// Mutate params with VERY small changes - exploitation not exploration
function mutateParams(
  currentParams: Record<string, any>,
  schemaParams: any[],
  aggressiveness: number
): Record<string, any> {
  const mutated = { ...currentParams };
  
  // Only mutate 1 param at a time for fine-tuning
  const mutableParams = schemaParams.filter(p => 
    p.type === 'int' || p.type === 'float'
  );
  
  if (mutableParams.length === 0) return mutated;
  
  // Pick ONE random param to tweak
  const param = mutableParams[Math.floor(Math.random() * mutableParams.length)];
  const key = param.key;
  const current = currentParams[key] ?? param.default;

  if (param.type === 'int') {
    const step = param.step || 1;
    // Tiny change: +/- 1-2 steps
    const direction = Math.random() > 0.5 ? 1 : -1;
    const steps = Math.ceil(aggressiveness * 2);
    let newVal = current + direction * steps * step;
    newVal = Math.max(param.min, Math.min(param.max, newVal));
    mutated[key] = Math.round(newVal);
  } else if (param.type === 'float') {
    const step = param.step || 0.01;
    // Tiny change: +/- 5-10% of current value
    const pctChange = (Math.random() - 0.5) * 0.1 * aggressiveness;
    let newVal = current * (1 + pctChange);
    newVal = Math.max(param.min, Math.min(param.max, newVal));
    newVal = Math.round(newVal / step) * step;
    mutated[key] = Number(newVal.toFixed(4));
  }

  return mutated;
}

// Get best metrics for a version
async function getVersionBestMetrics(supabase: any, versionId: string) {
  const { data: runs } = await supabase
    .from('runs')
    .select('run_metrics(*)')
    .eq('bot_version_id', versionId)
    .eq('status', 'done');

  let bestPf = 0;
  let bestPnl = -Infinity;
  let bestWinRate = 0;
  let minDd = 1;
  let tradesCount = 0;

  for (const run of (runs || [])) {
    const m = run.run_metrics;
    if (!m) continue;
    
    const pf = parseFloat(m.profit_factor) || 0;
    const pnl = parseFloat(m.net_pnl_usd) || 0;
    const wr = parseFloat(m.win_rate) || 0;
    const dd = parseFloat(m.max_drawdown) || 0;
    const tc = parseInt(m.trades_count) || 0;

    if (pf > bestPf) bestPf = pf;
    if (pnl > bestPnl) bestPnl = pnl;
    if (wr > bestWinRate) bestWinRate = wr;
    if (dd < minDd && dd > 0) minDd = dd;
    if (tc > tradesCount) tradesCount = tc;
  }

  return {
    profit_factor: bestPf,
    net_pnl_usd: bestPnl === -Infinity ? 0 : bestPnl,
    win_rate: bestWinRate,
    max_drawdown: minDd === 1 ? 0 : minDd,
    trades_count: tradesCount,
  };
}

// Evaluate acceptance gates
function evaluateGates(
  championMetrics: any,
  challengerMetrics: any,
  objectiveConfig: Record<string, number>,
  gateConfig: { min_trades: number; max_dd: number; min_improvement: number }
): Record<string, { required: number; actual: number; passed: boolean }> {
  // Calculate scores
  const championScore = calculateScore(championMetrics, objectiveConfig);
  const challengerScore = calculateScore(challengerMetrics, objectiveConfig);
  const improvement = championScore > 0 
    ? (challengerScore - championScore) / championScore 
    : challengerScore > 0 ? 1 : 0;

  // Use dynamic max_dd based on champion's drawdown with some tolerance
  const championDd = championMetrics.max_drawdown || 0.5;
  const dynamicMaxDd = Math.max(gateConfig.max_dd, championDd * 1.25); // Allow 25% more DD than champion

  return {
    min_trades: {
      required: gateConfig.min_trades,
      actual: challengerMetrics.trades_count,
      passed: challengerMetrics.trades_count >= gateConfig.min_trades,
    },
    max_dd: {
      required: Number(dynamicMaxDd.toFixed(2)),
      actual: challengerMetrics.max_drawdown,
      passed: challengerMetrics.max_drawdown <= dynamicMaxDd,
    },
    improvement: {
      required: gateConfig.min_improvement,
      actual: Number(improvement.toFixed(4)),
      passed: improvement >= gateConfig.min_improvement,
    },
  };
}

function calculateScore(metrics: any, config: Record<string, number>): number {
  const pf = Math.min(metrics.profit_factor || 0, 5);
  const ret = (metrics.net_pnl_usd || 0) / 1000;
  const dd = metrics.max_drawdown || 0;
  const wr = metrics.win_rate || 0;

  // Weighted score calculation
  return (
    (config.pf_weight || 0.35) * (pf / 3) + // Normalize PF to ~0-1.67 range
    (config.return_weight || 0.25) * Math.min(Math.max(ret, -1), 2) + // Clamp return contribution
    (config.sharpe_weight || 0.25) * wr - // Use win rate as proxy for risk-adjusted
    (config.dd_penalty || 0.15) * Math.min(dd * 2, 1) // Penalize drawdown
  );
}

// Run backtest for a version
async function runBacktestForVersion(
  supabase: any,
  versionId: string,
  datasetId: string,
  supabaseUrl: string,
  supabaseKey: string
): Promise<any> {
  // Create run
  const { data: run, error: runError } = await supabase
    .from('runs')
    .insert({
      bot_version_id: versionId,
      dataset_id: datasetId,
      run_type: 'backtest',
      status: 'queued',
    })
    .select()
    .single();

  if (runError || !run) {
    console.error('Failed to create run:', runError);
    return null;
  }

  // Call backtest-worker
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/backtest-worker`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({ run_id: run.id }),
    });

    const result = await response.json();
    return result;
  } catch (error) {
    console.error('Backtest call failed:', error);
    return null;
  }
}

// Simulated backtest when no dataset - uses params to influence realistic results
async function runSimulatedBacktest(
  supabase: any, 
  versionId: string,
  params: Record<string, any>
): Promise<any> {
  // Create run
  const { data: run } = await supabase
    .from('runs')
    .insert({
      bot_version_id: versionId,
      run_type: 'backtest',
      status: 'running',
    })
    .select()
    .single();

  if (!run) return null;

  // Generate trades influenced by params
  const lookback = params.lookback_bars || 40;
  const stopMult = params.stop_atr_mult || 1.5;
  const tpMult = params.takeprofit_atr_mult || 2.5;
  const atrPeriod = params.atr_period || 14;
  
  // Simulate trade count based on params (lower lookback = more signals)
  const baseTradeCount = 25;
  const tradeCountMod = 1 + (40 - lookback) / 100; // More trades with shorter lookback
  const numTrades = Math.max(8, Math.floor(baseTradeCount * tradeCountMod + (Math.random() - 0.5) * 10));
  
  // Win rate influenced by risk/reward ratio
  const rrRatio = tpMult / stopMult;
  const baseWinRate = 0.45 + Math.random() * 0.15;
  const adjustedWinRate = Math.min(0.75, Math.max(0.35, baseWinRate + (1 / rrRatio) * 0.1));

  const trades = [];
  const baseTime = Date.now() - 30 * 24 * 60 * 60 * 1000;
  let equity = 0;
  let peak = 0;
  let maxDd = 0;

  for (let i = 0; i < numTrades; i++) {
    const isWin = Math.random() < adjustedWinRate;
    
    // Win/loss magnitude influenced by ATR multipliers
    const winMagnitude = tpMult * (0.8 + Math.random() * 0.4);
    const lossMagnitude = stopMult * (0.8 + Math.random() * 0.4);
    
    const pnlMultiplier = isWin ? winMagnitude : -lossMagnitude;
    const pnlUsd = pnlMultiplier * 50 * (0.8 + Math.random() * 0.4); // ~$50 per ATR unit
    
    trades.push({
      run_id: run.id,
      ts_entry: new Date(baseTime + i * 4 * 60 * 60 * 1000).toISOString(),
      ts_exit: new Date(baseTime + i * 4 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000).toISOString(),
      side: Math.random() > 0.5 ? 'long' : 'short',
      entry_price: 500,
      exit_price: 500 + pnlMultiplier,
      qty: 100,
      pnl_usd: pnlUsd,
      pnl_points: pnlMultiplier,
      fees: 2,
      slippage: 0.5,
      reason_code: isWin ? 'take_profit' : 'stop_loss',
    });

    // Track drawdown
    equity += pnlUsd;
    if (equity > peak) peak = equity;
    if (peak > 0) {
      const dd = (peak - equity) / peak;
      if (dd > maxDd) maxDd = dd;
    }
  }

  if (trades.length > 0) {
    await supabase.from('trades').insert(trades);
  }

  // Calculate metrics
  const wins = trades.filter(t => t.pnl_usd > 0);
  const losses = trades.filter(t => t.pnl_usd <= 0);
  const grossProfit = wins.reduce((s, t) => s + t.pnl_usd, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl_usd, 0));
  const netPnl = grossProfit - grossLoss;
  const pf = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 10 : 0;
  const winRate = trades.length > 0 ? wins.length / trades.length : 0;

  await supabase.from('run_metrics').insert({
    run_id: run.id,
    profit_factor: Number(pf.toFixed(4)),
    net_pnl_usd: Number(netPnl.toFixed(2)),
    win_rate: Number(winRate.toFixed(4)),
    max_drawdown: Number(maxDd.toFixed(4)),
    trades_count: trades.length,
    gross_profit: Number(grossProfit.toFixed(2)),
    gross_loss: Number(grossLoss.toFixed(2)),
  });

  await supabase
    .from('runs')
    .update({ status: 'done', end_ts: new Date().toISOString() })
    .eq('id', run.id);

  return { run_id: run.id, success: true };
}

function hashObject(obj: any): string {
  const str = JSON.stringify(obj);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16);
}
