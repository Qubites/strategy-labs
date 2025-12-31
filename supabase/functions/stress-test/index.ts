import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface StressTestRequest {
  version_id: string;
  dataset_id: string;
  job_id?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { version_id, dataset_id, job_id } = await req.json() as StressTestRequest;

    console.log(`Starting stress test for version: ${version_id}`);

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch version details
    const { data: version, error: versionError } = await supabase
      .from('bot_versions')
      .select(`*, bot:bots(*, template:strategy_templates(*))`)
      .eq('id', version_id)
      .single();

    if (versionError || !version) throw new Error('Version not found');

    // Fetch dataset
    const { data: dataset, error: datasetError } = await supabase
      .from('datasets')
      .select('*')
      .eq('id', dataset_id)
      .single();

    if (datasetError || !dataset) throw new Error('Dataset not found');

    // Fetch bars
    const { data: bars, error: barsError } = await supabase
      .from('market_bars')
      .select('ts, o, h, l, c, v')
      .eq('symbol', dataset.symbol)
      .eq('timeframe', dataset.timeframe)
      .gte('ts', dataset.start_ts)
      .lte('ts', dataset.end_ts)
      .order('ts', { ascending: true })
      .limit(10000);

    if (barsError || !bars || bars.length < 100) {
      throw new Error('Insufficient data for stress test');
    }

    const params = JSON.parse(version.params_json || '{}');
    const templateId = version.bot?.template?.id || 'momentum_breakout_v1';

    // Run baseline
    const baselineResult = runBacktest(bars, params, templateId, 0, 0);
    
    // Stress Test 1: +1 bps slippage
    const slippage1Result = runBacktest(bars, params, templateId, 0.0001, 0);
    
    // Stress Test 2: +3 bps slippage
    const slippage3Result = runBacktest(bars, params, templateId, 0.0003, 0);
    
    // Stress Test 3: Extra fee per trade
    const feeResult = runBacktest(bars, params, templateId, 0, 1.0);
    
    // Stress Test 4: Remove 10% of bars randomly
    const gappedBars = bars.filter(() => Math.random() > 0.1);
    const gapResult = runBacktest(gappedBars, params, templateId, 0, 0);

    const stressResults = {
      baseline: baselineResult,
      slippage_1bps: slippage1Result,
      slippage_3bps: slippage3Result,
      extra_fee: feeResult,
      data_gaps: gapResult,
      tests_passed: 0,
      tests_total: 4
    };

    // Evaluate pass/fail for each stress test
    const baselinePnl = baselineResult.net_pnl;
    const baselineDd = baselineResult.max_dd;

    let passed = 0;

    // Slippage 1bps: should still be profitable
    if (slippage1Result.net_pnl > 0) passed++;
    
    // Slippage 3bps: should still be profitable
    if (slippage3Result.net_pnl > 0) passed++;
    
    // Extra fee: PnL shouldn't drop more than 50%
    if (feeResult.net_pnl > baselinePnl * 0.5) passed++;
    
    // Data gaps: DD shouldn't be materially worse (< 1.5x)
    if (gapResult.max_dd < baselineDd * 1.5 + 0.05) passed++;

    stressResults.tests_passed = passed;
    const overallPassed = passed >= 3; // Pass if 3/4 tests pass

    // Create or update live_candidate
    const { data: candidate, error: candError } = await supabase
      .from('live_candidates')
      .upsert({
        version_id,
        job_id,
        stress_results_json: stressResults,
        stress_passed: overallPassed,
        created_at: new Date().toISOString()
      }, { onConflict: 'version_id' })
      .select()
      .single();

    // Update version lifecycle_status if passed
    if (overallPassed) {
      await supabase
        .from('bot_versions')
        .update({ lifecycle_status: 'BACKTEST_WINNER' })
        .eq('id', version_id);
    }

    // Log result
    await supabase.from('logs').insert({
      run_id: null,
      level: overallPassed ? 'info' : 'warn',
      category: 'system',
      message: `Stress test ${overallPassed ? 'PASSED' : 'FAILED'} for version ${version_id}: ${passed}/4 tests`,
      payload_json: JSON.stringify(stressResults)
    });

    return new Response(JSON.stringify({
      success: true,
      version_id,
      stress_passed: overallPassed,
      results: stressResults
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in stress-test:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function runBacktest(
  bars: any[], 
  params: any, 
  templateId: string,
  extraSlippage: number,
  extraFee: number
): { net_pnl: number; max_dd: number; trades: number; profit_factor: number } {
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
      const prev = bars[i - 1]?.c || bars[i].o;
      const tr = Math.max(
        bars[i].h - bars[i].l,
        Math.abs(bars[i].h - prev),
        Math.abs(bars[i].l - prev)
      );
      sum += tr;
    }
    return sum / atrPeriod;
  };

  for (let i = Math.max(lookback, atrPeriod) + 1; i < bars.length; i++) {
    const bar = bars[i];
    const atr = calculateATR(i);
    if (atr === 0) continue;

    if (position) {
      let pnl = position.side === 'long' ? bar.c - position.entry : position.entry - bar.c;
      const stop = atr * stopMult;
      const tp = atr * tpMult;

      if (pnl <= -stop || pnl >= tp) {
        // Apply extra costs
        pnl -= extraSlippage * bar.c * 100; // 100 shares
        pnl -= extraFee;
        trades.push({ pnl });
        position = null;
      }
    }

    if (!position) {
      const slice = bars.slice(Math.max(0, i - lookback), i);
      const recentHigh = Math.max(...slice.map((b: any) => b.h));
      const recentLow = Math.min(...slice.map((b: any) => b.l));
      
      let signal: 'long' | 'short' | null = null;

      if (templateId === 'momentum_breakout_v1') {
        const threshold = params.breakout_pct || 0.002;
        if (bar.c > recentHigh * (1 - threshold)) signal = 'long';
        else if (bar.c < recentLow * (1 + threshold)) signal = 'short';
      } else if (templateId === 'mean_reversion_extremes_v1') {
        const mean = slice.reduce((s: number, b: any) => s + b.c, 0) / slice.length;
        const std = Math.sqrt(slice.reduce((s: number, b: any) => s + Math.pow(b.c - mean, 2), 0) / slice.length);
        const z = std > 0 ? (bar.c - mean) / std : 0;
        const entryZ = params.entry_z || 2.0;
        if (z < -entryZ) signal = 'long';
        else if (z > entryZ) signal = 'short';
      } else {
        if (bar.c > recentHigh * 0.998) signal = 'long';
        else if (bar.c < recentLow * 1.002) signal = 'short';
      }

      if (signal) {
        position = { side: signal, entry: bar.c };
      }
    }
  }

  if (position && bars.length > 0) {
    let pnl = position.side === 'long' 
      ? bars[bars.length - 1].c - position.entry 
      : position.entry - bars[bars.length - 1].c;
    pnl -= extraSlippage * bars[bars.length - 1].c * 100;
    pnl -= extraFee;
    trades.push({ pnl });
  }

  const wins = trades.filter(t => t.pnl > 0);
  const losses = trades.filter(t => t.pnl <= 0);
  const grossProfit = wins.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
  const netPnl = grossProfit - grossLoss;
  const pf = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 10 : 0;

  let peak = 0, maxDd = 0, equity = 0;
  for (const t of trades) {
    equity += t.pnl;
    if (equity > peak) peak = equity;
    const dd = peak > 0 ? (peak - equity) / peak : 0;
    if (dd > maxDd) maxDd = dd;
  }

  return { net_pnl: netPnl, max_dd: maxDd, trades: trades.length, profit_factor: pf };
}
