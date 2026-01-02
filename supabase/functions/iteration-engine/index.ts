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
    } = await req.json() as IterationRequest;

    console.log(`Starting iteration engine for group: ${experiment_group_id}`);

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

    // If still no version, we need a seed version
    if (!championVersion) {
      // Create a seed version with default params
      const paramSchema = JSON.parse(group.strategy_templates?.param_schema_json || '{}');
      const defaultParams: Record<string, any> = {};
      
      for (const param of (paramSchema.params || [])) {
        defaultParams[param.key] = param.default;
      }

      // First create a bot for this experiment
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
          risk_limits_json: JSON.stringify(paramSchema.risk_limits || {}),
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

    const template = group.strategy_templates;
    const dataset = group.datasets;
    const objectiveConfig = group.objective_config as Record<string, number>;

    if (!template) {
      throw new Error('Template not found');
    }

    // Get current champion metrics for comparison
    const championParams = JSON.parse(championVersion.params_json || '{}');
    const championMetrics = await getVersionBestMetrics(supabase, championVersion.id);

    // Parse schema
    const paramSchema = JSON.parse(template.param_schema_json || '{}');

    // Get current iteration count
    const { count: iterationCount } = await supabase
      .from('iterations')
      .select('*', { count: 'exact', head: true })
      .eq('experiment_group_id', experiment_group_id);

    const currentIterNum = (iterationCount || 0) + 1;
    let successfulIterations = 0;
    const results: any[] = [];

    // Run iterations
    for (let i = 0; i < max_iterations; i++) {
      const iterNum = currentIterNum + i;
      console.log(`Running iteration ${iterNum}`);

      // Mutate parameters
      const mutatedParams = mutateParams(
        championParams,
        paramSchema.params || [],
        mutation_aggressiveness
      );

      // Calculate param diff
      const paramDiff: Record<string, { before: any; after: any }> = {};
      for (const key of Object.keys(mutatedParams)) {
        if (mutatedParams[key] !== championParams[key]) {
          paramDiff[key] = {
            before: championParams[key],
            after: mutatedParams[key],
          };
        }
      }

      // Create challenger version
      const challengerInsertResult: { data: any; error: any } = await supabase
        .from('bot_versions')
        .insert({
          bot_id: championVersion.bot_id,
          experiment_group_id,
          version_number: championVersion.version_number + iterNum,
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

      const challengerVersion: any = challengerInsertResult.data;

      // Run backtest for challenger
      let runResult;
      if (dataset) {
        runResult = await runBacktestForVersion(
          supabase,
          challengerVersion.id,
          dataset.id,
          SUPABASE_URL,
          SUPABASE_SERVICE_ROLE_KEY
        );
      } else {
        // Run simulated backtest
        runResult = await runSimulatedBacktest(supabase, challengerVersion.id);
      }

      // Get challenger metrics
      const challengerMetrics = await getVersionBestMetrics(supabase, challengerVersion.id);

      // Evaluate gates
      const gateResults = evaluateGates(championMetrics, challengerMetrics, objectiveConfig);

      // Determine acceptance
      const allGatesPassed = Object.values(gateResults).every(g => g.passed);
      let accepted = allGatesPassed;
      let rejectReason = null;

      if (!accepted) {
        const failedGates = Object.entries(gateResults)
          .filter(([_, g]: [string, any]) => !g.passed)
          .map(([k, g]: [string, any]) => `${k}: ${g.actual?.toFixed(2)} vs ${g.required}`)
          .join(', ');
        rejectReason = `Failed gates: ${failedGates}`;
      }

      // Create iteration record
      const { data: iteration } = await supabase
        .from('iterations')
        .insert({
          experiment_group_id,
          parent_version_id: championVersion.id,
          child_version_id: challengerVersion.id,
          iteration_number: iterNum,
          trigger_type,
          param_diff: paramDiff,
          risk_diff: null,
          ai_rationale: trigger_type === 'auto_tuner' 
            ? `Auto-tuned ${Object.keys(paramDiff).length} parameters with ${(mutation_aggressiveness * 100).toFixed(0)}% aggressiveness`
            : null,
          gate_results: gateResults,
          metric_before: championMetrics,
          metric_after: challengerMetrics,
          accepted,
          reject_reason: rejectReason,
        })
        .select()
        .single();

      results.push({
        iteration_number: iterNum,
        accepted,
        challenger_id: challengerVersion.id,
        param_diff: paramDiff,
        gate_results: gateResults,
        reject_reason: rejectReason,
      });

      // If accepted, promote challenger to champion
      if (accepted) {
        successfulIterations++;

        // Unset old champion
        await supabase
          .from('bot_versions')
          .update({ is_champion: false })
          .eq('id', championVersion.id);

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

        // Update champion for next iteration
        championVersion = { ...challengerVersion, bots: championVersion.bots };
        Object.assign(championParams, mutatedParams);
        Object.assign(championMetrics, challengerMetrics);

        console.log(`Iteration ${iterNum}: Challenger accepted as new champion`);
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
      current_champion_id: championVersion.id,
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

// Mutate params within schema bounds
function mutateParams(
  currentParams: Record<string, any>,
  schemaParams: any[],
  aggressiveness: number
): Record<string, any> {
  const mutated = { ...currentParams };
  
  // Number of params to mutate based on aggressiveness
  const numMutations = Math.max(1, Math.floor(schemaParams.length * aggressiveness * 0.5));
  const shuffled = [...schemaParams].sort(() => Math.random() - 0.5);

  for (let i = 0; i < Math.min(numMutations, shuffled.length); i++) {
    const param = shuffled[i];
    const key = param.key;
    const current = currentParams[key] ?? param.default;

    if (param.type === 'int' || param.type === 'float') {
      const step = param.step || 1;
      const range = (param.max - param.min);
      
      // Delta based on aggressiveness
      let delta = (Math.random() - 0.5) * range * aggressiveness * 0.3;
      
      let newVal = current + delta;
      newVal = Math.max(param.min, Math.min(param.max, newVal));

      if (param.type === 'int') {
        newVal = Math.round(newVal);
      } else {
        newVal = Math.round(newVal / step) * step;
      }

      mutated[key] = newVal;
    } else if (param.type === 'bool') {
      if (Math.random() < aggressiveness * 0.3) {
        mutated[key] = !current;
      }
    } else if (param.type === 'enum' && param.values) {
      if (Math.random() < aggressiveness * 0.3) {
        const idx = Math.floor(Math.random() * param.values.length);
        mutated[key] = param.values[idx];
      }
    }
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
    if (dd < minDd) minDd = dd;
    tradesCount += tc;
  }

  return {
    profit_factor: bestPf,
    net_pnl_usd: bestPnl === -Infinity ? 0 : bestPnl,
    win_rate: bestWinRate,
    max_drawdown: minDd,
    trades_count: tradesCount,
  };
}

// Evaluate acceptance gates
function evaluateGates(
  championMetrics: any,
  challengerMetrics: any,
  objectiveConfig: Record<string, number>
): Record<string, { required: number; actual: number; passed: boolean }> {
  const minTrades = 5;
  const maxDd = 0.20;
  const minImprovement = 0.01;

  // Calculate scores
  const championScore = calculateScore(championMetrics, objectiveConfig);
  const challengerScore = calculateScore(challengerMetrics, objectiveConfig);
  const improvement = championScore > 0 
    ? (challengerScore - championScore) / championScore 
    : challengerScore > 0 ? 1 : 0;

  return {
    min_trades: {
      required: minTrades,
      actual: challengerMetrics.trades_count,
      passed: challengerMetrics.trades_count >= minTrades,
    },
    max_dd: {
      required: maxDd,
      actual: challengerMetrics.max_drawdown,
      passed: challengerMetrics.max_drawdown <= maxDd,
    },
    improvement: {
      required: minImprovement,
      actual: improvement,
      passed: improvement >= minImprovement || challengerScore > championScore,
    },
  };
}

function calculateScore(metrics: any, config: Record<string, number>): number {
  const pf = Math.min(metrics.profit_factor || 0, 5);
  const ret = (metrics.net_pnl_usd || 0) / 1000;
  const dd = metrics.max_drawdown || 0;

  return (
    (config.pf_weight || 0.35) * (pf / 5) +
    (config.return_weight || 0.25) * Math.min(ret, 1) -
    (config.dd_penalty || 0.15) * Math.min(dd * 5, 1)
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

// Simulated backtest when no dataset
async function runSimulatedBacktest(supabase: any, versionId: string): Promise<any> {
  // Get version params
  const { data: version } = await supabase
    .from('bot_versions')
    .select('*')
    .eq('id', versionId)
    .single();

  if (!version) return null;

  const params = JSON.parse(version.params_json || '{}');
  
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

  // Generate simulated trades based on params
  const numTrades = Math.floor(Math.random() * 30) + 10;
  const trades = [];
  const baseTime = Date.now() - 30 * 24 * 60 * 60 * 1000;

  // Use params to influence results
  const lookback = params.lookback_bars || 40;
  const stopMult = params.stop_atr_mult || 1.5;
  const winBias = 0.5 + (1 / stopMult) * 0.1; // Higher stop = less wins but bigger

  for (let i = 0; i < numTrades; i++) {
    const isWin = Math.random() < winBias;
    const pnlMagnitude = Math.random() * 3 + 0.5;
    const pnlPoints = isWin ? pnlMagnitude : -pnlMagnitude * 0.8;
    
    trades.push({
      run_id: run.id,
      ts_entry: new Date(baseTime + i * 4 * 60 * 60 * 1000).toISOString(),
      ts_exit: new Date(baseTime + i * 4 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000).toISOString(),
      side: Math.random() > 0.5 ? 'long' : 'short',
      entry_price: 450,
      exit_price: 450 + pnlPoints,
      qty: 100,
      pnl_usd: pnlPoints * 100,
      pnl_points: pnlPoints,
      fees: 1,
      slippage: 0.5,
      reason_code: isWin ? 'take_profit' : 'stop_loss',
    });
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

  // Drawdown
  let peak = 0, maxDd = 0, equity = 0;
  for (const t of trades) {
    equity += t.pnl_usd;
    if (equity > peak) peak = equity;
    const dd = peak > 0 ? (peak - equity) / peak : 0;
    if (dd > maxDd) maxDd = dd;
  }

  await supabase.from('run_metrics').insert({
    run_id: run.id,
    profit_factor: pf,
    net_pnl_usd: netPnl,
    win_rate: winRate,
    max_drawdown: maxDd,
    trades_count: trades.length,
    gross_profit: grossProfit,
    gross_loss: grossLoss,
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
