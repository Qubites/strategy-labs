import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

// Declare EdgeRuntime for background task support
declare const EdgeRuntime: {
  waitUntil(promise: Promise<unknown>): void;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TuningWorkerRequest {
  job_id: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { job_id } = await req.json() as TuningWorkerRequest;

    console.log(`Processing tuning job: ${job_id}`);

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch job details
    const { data: job, error: jobError } = await supabase
      .from('tuning_jobs')
      .select(`
        *,
        champion_version:bot_versions!tuning_jobs_champion_version_id_fkey(
          *,
          bot:bots(*, template:strategy_templates(*))
        ),
        dataset:datasets(*)
      `)
      .eq('id', job_id)
      .single();

    if (jobError || !job) throw new Error('Job not found');

    // Update job status
    await supabase
      .from('tuning_jobs')
      .update({ status: 'running' })
      .eq('id', job_id);

    const championVersion = job.champion_version;
    const template = championVersion?.bot?.template;
    const dataset = job.dataset;

    if (!championVersion || !template || !dataset) {
      throw new Error('Invalid job configuration');
    }

    // Parse template schema and current params
    const paramSchema = JSON.parse(template.param_schema_json || '{}');
    const currentParams = JSON.parse(championVersion.params_json || '{}');
    const objectiveConfig = job.objective_config;
    const constraints = job.constraints;
    const mutationBias = job.instruction_parsed_json?.mutation_bias || {};

    // Fetch bars and split into train/val/test
    const { data: allBars, error: barsError } = await supabase
      .from('market_bars')
      .select('ts, o, h, l, c, v')
      .eq('symbol', dataset.symbol)
      .eq('timeframe', dataset.timeframe)
      .gte('ts', dataset.start_ts)
      .lte('ts', dataset.end_ts)
      .order('ts', { ascending: true })
      .limit(10000);

    if (barsError || !allBars || allBars.length < 100) {
      throw new Error('Insufficient data for tuning');
    }

    const totalBars = allBars.length;
    const trainEnd = Math.floor(totalBars * job.train_pct);
    const valEnd = Math.floor(totalBars * (job.train_pct + job.val_pct));

    const trainBars = allBars.slice(0, trainEnd);
    const valBars = allBars.slice(trainEnd, valEnd);
    const testBars = allBars.slice(valEnd);

    console.log(`Data split: Train=${trainBars.length}, Val=${valBars.length}, Test=${testBars.length}`);

    // Get champion baseline scores
    const championScores = await runBacktestAndScore(
      supabase, currentParams, trainBars, valBars, testBars, 
      objectiveConfig, template.id, championVersion.risk_limits_json
    );

    let bestScore = championScores.val_score;
    let bestVersion = championVersion.id;
    let trialsRun = job.trials_completed;

    // Run trials
    const maxTrials = Math.min(job.max_trials - trialsRun, 10); // Process in batches of 10

    for (let t = 0; t < maxTrials; t++) {
      trialsRun++;
      
      // Generate mutated params
      const candidateParams = mutateParams(currentParams, paramSchema.params, mutationBias);
      
      // Run backtest on all splits
      const scores = await runBacktestAndScore(
        supabase, candidateParams, trainBars, valBars, testBars,
        objectiveConfig, template.id, championVersion.risk_limits_json
      );

      // Check acceptance gates
      let accepted = false;
      let rejectReason = null;

      if (scores.val_trades < constraints.min_trades) {
        rejectReason = `Insufficient trades: ${scores.val_trades} < ${constraints.min_trades}`;
      } else if (scores.val_dd > constraints.max_dd) {
        rejectReason = `Drawdown too high: ${(scores.val_dd * 100).toFixed(1)}% > ${(constraints.max_dd * 100).toFixed(1)}%`;
      } else if (scores.val_score < bestScore * (1 + constraints.improvement_threshold)) {
        rejectReason = `Score not improved: ${scores.val_score.toFixed(3)} < ${(bestScore * 1.03).toFixed(3)}`;
      } else if (scores.test_score < championScores.test_score * 0.99) {
        rejectReason = `Test score collapse: ${scores.test_score.toFixed(3)} < ${(championScores.test_score * 0.99).toFixed(3)}`;
      } else {
        accepted = true;
      }

      // Create trial record
      const { data: trial } = await supabase
        .from('tuning_trials')
        .insert({
          job_id,
          trial_number: trialsRun,
          base_version_id: championVersion.id,
          candidate_params: candidateParams,
          train_score: scores.train_score,
          val_score: scores.val_score,
          test_score: scores.test_score,
          train_metrics: scores.train_metrics,
          val_metrics: scores.val_metrics,
          test_metrics: scores.test_metrics,
          accepted,
          reject_reason: rejectReason
        })
        .select()
        .single();

      // If accepted, create new version and update champion
      if (accepted && trial) {
        const { data: newVersion } = await supabase
          .from('bot_versions')
          .insert({
            bot_id: championVersion.bot_id,
            version_number: championVersion.version_number + trialsRun,
            params_json: JSON.stringify(candidateParams),
            params_hash: hashObject(candidateParams),
            risk_limits_json: championVersion.risk_limits_json,
            version_hash: hashObject({ params: candidateParams, risk: JSON.parse(championVersion.risk_limits_json || '{}') }),
            status: 'backtested',
            lifecycle_status: 'DRAFT'
          })
          .select()
          .single();

        if (newVersion) {
          bestScore = scores.val_score;
          bestVersion = newVersion.id;

          // Update job champion
          await supabase
            .from('tuning_jobs')
            .update({ 
              champion_version_id: newVersion.id,
              best_score: bestScore
            })
            .eq('id', job_id);

          console.log(`New champion: version ${newVersion.id} with score ${bestScore.toFixed(3)}`);
        }
      }
    }

    // Update job progress
    const isComplete = trialsRun >= job.max_trials;
    const finalStatus = isComplete ? 'completed' : 'running'; // Keep running if more trials needed
    
    await supabase
      .from('tuning_jobs')
      .update({ 
        status: finalStatus,
        trials_completed: trialsRun,
        updated_at: new Date().toISOString()
      })
      .eq('id', job_id);

    // If not complete, schedule next batch automatically
    if (!isComplete) {
      console.log(`Scheduling next batch. Completed ${trialsRun}/${job.max_trials} trials.`);
      
      // Use waitUntil to continue processing in background
      EdgeRuntime.waitUntil(
        (async () => {
          // Small delay before next batch
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // Call self to continue
          const response = await fetch(`${SUPABASE_URL}/functions/v1/tuning-worker`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            },
            body: JSON.stringify({ job_id }),
          });
          
          if (!response.ok) {
            console.error('Failed to continue batch:', await response.text());
          }
        })()
      );
    }

    return new Response(JSON.stringify({
      success: true,
      job_id,
      trials_run: trialsRun,
      best_version_id: bestVersion,
      best_score: bestScore,
      status: finalStatus,
      message: isComplete ? 'Job completed' : `Processed batch, ${job.max_trials - trialsRun} trials remaining`
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in tuning-worker:', error);
    
    // Update job status to failed
    try {
      const { job_id } = await req.json();
      const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
      const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      await supabase.from('tuning_jobs').update({ status: 'failed' }).eq('id', job_id);
    } catch (e) {
      console.error('Failed to update job status:', e);
    }

    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
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
  mutationBias: Record<string, string>
): Record<string, any> {
  const mutated = { ...currentParams };
  
  // Pick 1-3 params to mutate
  const numMutations = Math.floor(Math.random() * 3) + 1;
  const shuffled = [...schemaParams].sort(() => Math.random() - 0.5);
  
  for (let i = 0; i < Math.min(numMutations, shuffled.length); i++) {
    const param = shuffled[i];
    const key = param.key;
    const current = currentParams[key] ?? param.default;
    
    // Check if there's a bias for this param
    const bias = mutationBias[key];
    
    if (param.type === 'int' || param.type === 'float') {
      const step = param.step || 1;
      const range = (param.max - param.min) / step;
      let delta = (Math.random() - 0.5) * range * 0.2 * step; // 20% of range max
      
      // Apply bias
      if (bias === 'higher') delta = Math.abs(delta);
      else if (bias === 'lower') delta = -Math.abs(delta);
      else if (bias === 'tighter') delta = -Math.abs(delta);
      else if (bias === 'wider') delta = Math.abs(delta);
      
      let newVal = current + delta;
      newVal = Math.max(param.min, Math.min(param.max, newVal));
      
      if (param.type === 'int') {
        newVal = Math.round(newVal);
      } else {
        newVal = Math.round(newVal / step) * step;
      }
      
      mutated[key] = newVal;
    } else if (param.type === 'bool') {
      mutated[key] = Math.random() > 0.7 ? !current : current;
    } else if (param.type === 'enum' && param.values) {
      if (Math.random() > 0.7) {
        const idx = Math.floor(Math.random() * param.values.length);
        mutated[key] = param.values[idx];
      }
    }
  }
  
  return mutated;
}

// Simple backtest and scoring
async function runBacktestAndScore(
  supabase: any,
  params: Record<string, any>,
  trainBars: any[],
  valBars: any[],
  testBars: any[],
  objectiveConfig: any,
  templateId: string,
  riskLimitsJson: string
): Promise<{
  train_score: number;
  val_score: number;
  test_score: number;
  train_metrics: any;
  val_metrics: any;
  test_metrics: any;
  val_trades: number;
  val_dd: number;
}> {
  const trainMetrics = runQuickBacktest(trainBars, params, templateId);
  const valMetrics = runQuickBacktest(valBars, params, templateId);
  const testMetrics = runQuickBacktest(testBars, params, templateId);

  const computeScore = (m: any) => {
    const pf = Math.min(m.profit_factor, 5); // Cap PF
    const sharpe = m.sharpe || 0;
    const ret = m.net_return || 0;
    const dd = m.max_dd || 0;
    
    return (
      objectiveConfig.pf_weight * (pf / 5) +
      objectiveConfig.sharpe_weight * Math.min(sharpe / 3, 1) +
      objectiveConfig.return_weight * Math.min(ret * 10, 1) -
      objectiveConfig.dd_penalty * Math.min(dd * 5, 1)
    );
  };

  return {
    train_score: computeScore(trainMetrics),
    val_score: computeScore(valMetrics),
    test_score: computeScore(testMetrics),
    train_metrics: trainMetrics,
    val_metrics: valMetrics,
    test_metrics: testMetrics,
    val_trades: valMetrics.trades_count,
    val_dd: valMetrics.max_dd
  };
}

// Quick in-memory backtest
function runQuickBacktest(bars: any[], params: any, templateId: string): any {
  if (bars.length < 50) {
    return { profit_factor: 0, trades_count: 0, max_dd: 0, net_return: 0, sharpe: 0 };
  }

  const trades: { pnl: number }[] = [];
  let position: { side: string; entry: number } | null = null;
  
  const lookback = params.lookback_bars || params.z_lookback || 40;
  const atrPeriod = params.atr_period || 14;
  const stopMult = params.stop_atr_mult || 1.5;
  const tpMult = params.takeprofit_atr_mult || 2.5;

  const calculateATR = (idx: number): number => {
    if (idx < atrPeriod) return 0;
    let sum = 0;
    for (let i = idx - atrPeriod + 1; i <= idx; i++) {
      const tr = Math.max(
        bars[i].h - bars[i].l,
        Math.abs(bars[i].h - bars[i - 1]?.c || bars[i].o),
        Math.abs(bars[i].l - bars[i - 1]?.c || bars[i].o)
      );
      sum += tr;
    }
    return sum / atrPeriod;
  };

  for (let i = Math.max(lookback, atrPeriod) + 1; i < bars.length; i++) {
    const bar = bars[i];
    const atr = calculateATR(i);
    if (atr === 0) continue;

    // Check exit
    if (position) {
      const pnl = position.side === 'long' ? bar.c - position.entry : position.entry - bar.c;
      const stop = atr * stopMult;
      const tp = atr * tpMult;

      if (pnl <= -stop || pnl >= tp) {
        trades.push({ pnl });
        position = null;
      }
    }

    // Check entry
    if (!position) {
      const recentHigh = Math.max(...bars.slice(Math.max(0, i - lookback), i).map((b: any) => b.h));
      const recentLow = Math.min(...bars.slice(Math.max(0, i - lookback), i).map((b: any) => b.l));
      
      let signal: 'long' | 'short' | null = null;

      if (templateId === 'momentum_breakout_v1') {
        const threshold = params.breakout_pct || 0.002;
        if (bar.c > recentHigh * (1 - threshold)) signal = 'long';
        else if (bar.c < recentLow * (1 + threshold)) signal = 'short';
      } else if (templateId === 'mean_reversion_extremes_v1') {
        const slice = bars.slice(Math.max(0, i - lookback), i);
        const mean = slice.reduce((s: number, b: any) => s + b.c, 0) / slice.length;
        const std = Math.sqrt(slice.reduce((s: number, b: any) => s + Math.pow(b.c - mean, 2), 0) / slice.length);
        const z = std > 0 ? (bar.c - mean) / std : 0;
        const entryZ = params.entry_z || 2.0;
        if (z < -entryZ) signal = 'long';
        else if (z > entryZ) signal = 'short';
      } else {
        // Regime switcher fallback
        if (bar.c > recentHigh * 0.998) signal = 'long';
        else if (bar.c < recentLow * 1.002) signal = 'short';
      }

      if (signal) {
        position = { side: signal, entry: bar.c };
      }
    }
  }

  // Close remaining position
  if (position && bars.length > 0) {
    const lastBar = bars[bars.length - 1];
    const pnl = position.side === 'long' ? lastBar.c - position.entry : position.entry - lastBar.c;
    trades.push({ pnl });
  }

  // Calculate metrics
  const wins = trades.filter(t => t.pnl > 0);
  const losses = trades.filter(t => t.pnl <= 0);
  const grossProfit = wins.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
  const pf = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 10 : 0;

  // Drawdown
  let peak = 0, maxDd = 0, equity = 0;
  for (const t of trades) {
    equity += t.pnl;
    if (equity > peak) peak = equity;
    const dd = (peak - equity) / Math.max(peak, 1);
    if (dd > maxDd) maxDd = dd;
  }

  // Simple Sharpe proxy
  const returns = trades.map(t => t.pnl);
  const avgRet = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
  const stdRet = returns.length > 1 
    ? Math.sqrt(returns.reduce((s, r) => s + Math.pow(r - avgRet, 2), 0) / (returns.length - 1))
    : 1;
  const sharpe = stdRet > 0 ? avgRet / stdRet : 0;

  const netReturn = bars.length > 0 ? equity / bars[0].c : 0;

  return {
    profit_factor: pf,
    trades_count: trades.length,
    max_dd: maxDd,
    net_return: netReturn,
    sharpe,
    gross_profit: grossProfit,
    gross_loss: grossLoss
  };
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
