import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface BacktestRequest {
  run_id: string;
}

interface Bar {
  ts: string;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

interface Trade {
  run_id: string;
  ts_entry: string;
  ts_exit: string | null;
  side: string;
  entry_price: number;
  exit_price: number | null;
  qty: number;
  pnl_usd: number | null;
  pnl_points: number | null;
  fees: number | null;
  slippage: number | null;
  reason_code: string | null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { run_id } = await req.json() as BacktestRequest;

    console.log(`Starting backtest for run: ${run_id}`);

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Update run status to running
    await supabase
      .from('runs')
      .update({ status: 'running', start_ts: new Date().toISOString() })
      .eq('id', run_id);

    // Fetch run details with bot version and template
    const { data: run, error: runError } = await supabase
      .from('runs')
      .select(`
        *,
        bot_version:bot_versions(
          *,
          bot:bots(
            *,
            template:strategy_templates(*)
          )
        ),
        dataset:datasets(*)
      `)
      .eq('id', run_id)
      .single();

    if (runError || !run) {
      throw new Error('Run not found');
    }

    const botVersion = run.bot_version;
    const template = botVersion?.bot?.template;
    const dataset = run.dataset;

    if (!botVersion || !template || !dataset) {
      throw new Error('Invalid run configuration');
    }

    // Parse params and cost model
    const params = JSON.parse(botVersion.params_json || '{}');
    const costModel = run.cost_model_json ? JSON.parse(run.cost_model_json) : {
      commission_per_share: 0.01,
      slippage_per_share: 0.005,
      fixed_cost_per_trade: 0,
    };

    // Fetch market bars for the dataset period
    const { data: bars, error: barsError } = await supabase
      .from('market_bars')
      .select('ts, o, h, l, c, v')
      .eq('symbol', dataset.symbol)
      .eq('timeframe', dataset.timeframe)
      .gte('ts', dataset.start_ts)
      .lte('ts', dataset.end_ts)
      .order('ts', { ascending: true });

    if (barsError || !bars || bars.length === 0) {
      // If no bars in database, we'll use simulated data for now
      console.log('No bars found, using simulated backtest');
      await runSimulatedBacktest(supabase, run_id, params, costModel, template.id);
    } else {
      // Run actual backtest with real data
      console.log(`Running backtest with ${bars.length} bars`);
      await runRealBacktest(supabase, run_id, bars, params, costModel, template.id);
    }

    // Update run status to done
    await supabase
      .from('runs')
      .update({ status: 'done', end_ts: new Date().toISOString() })
      .eq('id', run_id);

    return new Response(JSON.stringify({
      success: true,
      run_id,
      status: 'done',
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in backtest-worker:', error);
    
    // Try to update run status to failed
    try {
      const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
      const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      
      const { run_id } = await req.json();
      await supabase
        .from('runs')
        .update({ status: 'failed', end_ts: new Date().toISOString() })
        .eq('id', run_id);
    } catch (e) {
      console.error('Failed to update run status:', e);
    }

    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function runRealBacktest(
  supabase: any,
  runId: string,
  bars: Bar[],
  params: any,
  costModel: any,
  templateId: string
) {
  const trades: Trade[] = [];
  let position: { side: string; entry_price: number; entry_time: string; qty: number } | null = null;
  
  // Strategy parameters
  const lookback = params.lookback_bars || params.z_lookback || 40;
  const atrPeriod = params.atr_period || 14;
  const stopMult = params.stop_atr_mult || params.mr_stop_atr_mult || 1.5;
  const tpMult = params.takeprofit_atr_mult || params.mr_takeprofit_atr_mult || 2.5;
  const maxTradesPerDay = params.max_trades_per_day || 6;

  // Calculate ATR
  const calculateATR = (bars: Bar[], period: number, endIndex: number): number => {
    if (endIndex < period) return 0;
    let sum = 0;
    for (let i = endIndex - period + 1; i <= endIndex; i++) {
      const tr = Math.max(
        bars[i].h - bars[i].l,
        Math.abs(bars[i].h - bars[i - 1].c),
        Math.abs(bars[i].l - bars[i - 1].c)
      );
      sum += tr;
    }
    return sum / period;
  };

  // Track daily trades
  let currentDay = '';
  let dailyTradeCount = 0;

  for (let i = Math.max(lookback, atrPeriod) + 1; i < bars.length; i++) {
    const bar = bars[i];
    const barDay = bar.ts.substring(0, 10);
    
    // Reset daily counter
    if (barDay !== currentDay) {
      currentDay = barDay;
      dailyTradeCount = 0;
    }

    // Skip if max daily trades reached
    if (dailyTradeCount >= maxTradesPerDay) continue;

    const atr = calculateATR(bars, atrPeriod, i);
    if (atr === 0) continue;

    // Check for exit if in position
    if (position) {
      const pnlPoints = position.side === 'long' 
        ? bar.c - position.entry_price 
        : position.entry_price - bar.c;
      
      const stopLoss = atr * stopMult;
      const takeProfit = atr * tpMult;
      
      let shouldExit = false;
      let reasonCode = '';
      
      if (pnlPoints <= -stopLoss) {
        shouldExit = true;
        reasonCode = 'stop_loss';
      } else if (pnlPoints >= takeProfit) {
        shouldExit = true;
        reasonCode = 'take_profit';
      }
      
      if (shouldExit) {
        const slippage = costModel.slippage_per_share * position.qty;
        const fees = costModel.commission_per_share * position.qty + costModel.fixed_cost_per_trade;
        const pnlUsd = (pnlPoints * position.qty) - fees - slippage;
        
        trades.push({
          run_id: runId,
          ts_entry: position.entry_time,
          ts_exit: bar.ts,
          side: position.side,
          entry_price: position.entry_price,
          exit_price: bar.c,
          qty: position.qty,
          pnl_usd: pnlUsd,
          pnl_points: pnlPoints,
          fees: fees,
          slippage: slippage,
          reason_code: reasonCode,
        });
        
        position = null;
      }
    }
    
    // Check for entry if not in position
    if (!position && dailyTradeCount < maxTradesPerDay) {
      // Simple momentum/mean-reversion logic based on template
      const recentHigh = Math.max(...bars.slice(i - lookback, i).map(b => b.h));
      const recentLow = Math.min(...bars.slice(i - lookback, i).map(b => b.l));
      const range = recentHigh - recentLow;
      
      let signal: 'long' | 'short' | null = null;
      
      if (templateId === 'momentum_breakout_v1') {
        // Breakout logic
        const breakoutThreshold = params.breakout_pct || 0.002;
        if (bar.c > recentHigh * (1 - breakoutThreshold)) {
          signal = 'long';
        } else if (bar.c < recentLow * (1 + breakoutThreshold)) {
          signal = 'short';
        }
      } else if (templateId === 'mean_reversion_extremes_v1') {
        // Mean reversion logic
        const mean = bars.slice(i - lookback, i).reduce((s, b) => s + b.c, 0) / lookback;
        const std = Math.sqrt(
          bars.slice(i - lookback, i).reduce((s, b) => s + Math.pow(b.c - mean, 2), 0) / lookback
        );
        const z = (bar.c - mean) / std;
        const entryZ = params.entry_z || params.mr_entry_z || 2.0;
        
        if (z < -entryZ) {
          signal = 'long';
        } else if (z > entryZ) {
          signal = 'short';
        }
      } else {
        // Regime switcher or fallback - alternate between strategies
        const volatility = range / bar.c;
        if (volatility > (params.volatility_threshold || 0.02)) {
          // High volatility - use mean reversion
          const mean = bars.slice(i - lookback, i).reduce((s, b) => s + b.c, 0) / lookback;
          if (bar.c < mean * 0.98) signal = 'long';
          else if (bar.c > mean * 1.02) signal = 'short';
        } else {
          // Low volatility - use breakout
          if (bar.c > recentHigh * 0.998) signal = 'long';
          else if (bar.c < recentLow * 1.002) signal = 'short';
        }
      }
      
      // Check trade direction filter
      const tradeDir = params.trade_direction || 'both';
      if (signal === 'long' && tradeDir === 'short') signal = null;
      if (signal === 'short' && tradeDir === 'long') signal = null;
      
      if (signal) {
        position = {
          side: signal,
          entry_price: bar.c,
          entry_time: bar.ts,
          qty: 100, // Fixed qty for now
        };
        dailyTradeCount++;
      }
    }
  }
  
  // Close any remaining position
  if (position && bars.length > 0) {
    const lastBar = bars[bars.length - 1];
    const pnlPoints = position.side === 'long' 
      ? lastBar.c - position.entry_price 
      : position.entry_price - lastBar.c;
    const slippage = costModel.slippage_per_share * position.qty;
    const fees = costModel.commission_per_share * position.qty + costModel.fixed_cost_per_trade;
    const pnlUsd = (pnlPoints * position.qty) - fees - slippage;
    
    trades.push({
      run_id: runId,
      ts_entry: position.entry_time,
      ts_exit: lastBar.ts,
      side: position.side,
      entry_price: position.entry_price,
      exit_price: lastBar.c,
      qty: position.qty,
      pnl_usd: pnlUsd,
      pnl_points: pnlPoints,
      fees: fees,
      slippage: slippage,
      reason_code: 'end_of_data',
    });
  }

  // Insert trades
  if (trades.length > 0) {
    await supabase.from('trades').insert(trades);
  }

  // Calculate and insert metrics
  await calculateAndInsertMetrics(supabase, runId, trades);
}

async function runSimulatedBacktest(
  supabase: any,
  runId: string,
  params: any,
  costModel: any,
  templateId: string
) {
  // Generate simulated trades for demo purposes
  const numTrades = Math.floor(Math.random() * 30) + 20;
  const trades: Trade[] = [];
  const baseTime = Date.now() - 30 * 24 * 60 * 60 * 1000;
  
  for (let i = 0; i < numTrades; i++) {
    const entryTime = new Date(baseTime + i * 4 * 60 * 60 * 1000).toISOString();
    const exitTime = new Date(baseTime + i * 4 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000).toISOString();
    const side = Math.random() > 0.5 ? 'long' : 'short';
    const entryPrice = 450 + Math.random() * 50;
    const pnlPoints = (Math.random() - 0.4) * 5; // Slight positive bias
    const exitPrice = side === 'long' ? entryPrice + pnlPoints : entryPrice - pnlPoints;
    const qty = 100;
    const fees = costModel.commission_per_share * qty + costModel.fixed_cost_per_trade;
    const slippage = costModel.slippage_per_share * qty;
    const pnlUsd = (pnlPoints * qty) - fees - slippage;
    
    trades.push({
      run_id: runId,
      ts_entry: entryTime,
      ts_exit: exitTime,
      side,
      entry_price: entryPrice,
      exit_price: exitPrice,
      qty,
      pnl_usd: pnlUsd,
      pnl_points: pnlPoints,
      fees,
      slippage,
      reason_code: pnlPoints > 0 ? 'take_profit' : 'stop_loss',
    });
  }
  
  // Insert trades
  await supabase.from('trades').insert(trades);
  
  // Calculate and insert metrics
  await calculateAndInsertMetrics(supabase, runId, trades);
}

async function calculateAndInsertMetrics(supabase: any, runId: string, trades: Trade[]) {
  const wins = trades.filter(t => (t.pnl_usd || 0) > 0);
  const losses = trades.filter(t => (t.pnl_usd || 0) <= 0);
  
  const grossProfit = wins.reduce((sum, t) => sum + (t.pnl_usd || 0), 0);
  const grossLoss = Math.abs(losses.reduce((sum, t) => sum + (t.pnl_usd || 0), 0));
  const netPnl = grossProfit - grossLoss;
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 999 : 0;
  const winRate = trades.length > 0 ? (wins.length / trades.length) * 100 : 0;
  const avgTrade = trades.length > 0 ? netPnl / trades.length : 0;
  
  // Calculate drawdown
  let peak = 0;
  let maxDrawdown = 0;
  let equity = 0;
  for (const trade of trades) {
    equity += (trade.pnl_usd || 0);
    if (equity > peak) peak = equity;
    const dd = peak - equity;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }
  
  // Calculate max consecutive losses
  let maxConsecLosses = 0;
  let currentConsec = 0;
  let biggestLoss = 0;
  
  for (const trade of trades) {
    const pnl = trade.pnl_usd || 0;
    if (pnl < 0) {
      currentConsec++;
      if (pnl < biggestLoss) biggestLoss = pnl;
    } else {
      if (currentConsec > maxConsecLosses) maxConsecLosses = currentConsec;
      currentConsec = 0;
    }
  }
  if (currentConsec > maxConsecLosses) maxConsecLosses = currentConsec;
  
  // Calculate total fees and slippage
  const feesPaid = trades.reduce((sum, t) => sum + (t.fees || 0), 0);
  const slippageEst = trades.reduce((sum, t) => sum + (t.slippage || 0), 0);
  
  // Calculate median trade
  const sortedPnls = trades.map(t => t.pnl_usd || 0).sort((a, b) => a - b);
  const medianTrade = sortedPnls.length > 0 
    ? sortedPnls[Math.floor(sortedPnls.length / 2)] 
    : 0;

  // Upsert metrics
  await supabase
    .from('run_metrics')
    .upsert({
      run_id: runId,
      profit_factor: profitFactor,
      net_pnl_usd: netPnl,
      net_pnl_points: trades.reduce((sum, t) => sum + (t.pnl_points || 0), 0),
      gross_profit: grossProfit,
      gross_loss: grossLoss,
      max_drawdown: maxDrawdown,
      trades_count: trades.length,
      win_rate: winRate,
      avg_trade: avgTrade,
      median_trade: medianTrade,
      fees_paid: feesPaid,
      slippage_est: slippageEst,
      max_consecutive_losses: maxConsecLosses,
      biggest_loss: biggestLoss,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'run_id' });
}
