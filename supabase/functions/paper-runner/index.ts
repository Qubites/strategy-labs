import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PaperRunnerRequest {
  deployment_id?: string;
  force_trade?: 'long' | 'short'; // Force a test trade
}

interface Bar {
  t: string;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

interface Position {
  side: 'long' | 'short';
  entry_price: number;
  entry_time: string;
  qty: number;
  stop_loss: number;
  take_profit: number;
  symbol: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const ALPACA_API_KEY = Deno.env.get('ALPACA_API_KEY')!;
    const ALPACA_SECRET_KEY = Deno.env.get('ALPACA_SECRET_KEY')!;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Parse request body - may be empty for cron calls
    let requestBody: PaperRunnerRequest | null = null;
    try {
      const text = await req.text();
      if (text && text.trim()) {
        requestBody = JSON.parse(text);
      }
    } catch (e) {
      // Empty body is OK for cron calls
    }

    const deployment_id = requestBody?.deployment_id;
    const force_trade = requestBody?.force_trade;

    // If no deployment_id, run for ALL running deployments
    if (!deployment_id) {
      console.log(`[paper-runner] Cron trigger - checking all running deployments`);
      
      const { data: runningDeployments, error: listError } = await supabase
        .from('paper_deployments')
        .select('id')
        .eq('status', 'running')
        .eq('halted', false);

      if (listError || !runningDeployments?.length) {
        console.log(`[paper-runner] No running deployments found`);
        return new Response(JSON.stringify({ 
          success: true, 
          message: 'No running deployments',
          count: 0
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      console.log(`[paper-runner] Found ${runningDeployments.length} running deployments`);

      // Process each deployment
      const results = [];
      for (const dep of runningDeployments) {
        try {
          const result = await processDeployment(supabase, dep.id, ALPACA_API_KEY, ALPACA_SECRET_KEY, null);
          results.push({ deployment_id: dep.id, ...result });
        } catch (err) {
          console.error(`[paper-runner] Error processing ${dep.id}:`, err);
          results.push({ deployment_id: dep.id, error: err instanceof Error ? err.message : 'Unknown error' });
        }
      }

      return new Response(JSON.stringify({ 
        success: true, 
        processed: results.length,
        results 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Single deployment mode
    console.log(`[paper-runner] Starting execution for deployment: ${deployment_id}, force_trade: ${force_trade || 'none'}`);
    const result = await processDeployment(supabase, deployment_id, ALPACA_API_KEY, ALPACA_SECRET_KEY, force_trade || null);
    
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[paper-runner] Error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// Helper to log to both console and database
async function logToDb(
  supabase: any, 
  deployment_id: string, 
  log_type: string, 
  message: string, 
  data?: any
) {
  console.log(`[paper-runner][${log_type}] ${message}`, data ? JSON.stringify(data) : '');
  try {
    await supabase.from('paper_runner_logs').insert({
      deployment_id,
      log_type,
      message,
      data_json: data || null
    });
  } catch (e) {
    console.error('[paper-runner] Failed to write log to DB:', e);
  }
}

// Process a single deployment
async function processDeployment(
  supabase: any, 
  deployment_id: string, 
  ALPACA_API_KEY: string, 
  ALPACA_SECRET_KEY: string,
  force_trade: 'long' | 'short' | null
): Promise<any> {
  // Fetch deployment with bot version and strategy template
  const { data: deployment, error: deployError } = await supabase
    .from('paper_deployments')
    .select(`
      *,
      bot_version:bot_versions(*, bot:bots(*, template:strategy_templates(*)))
    `)
    .eq('id', deployment_id)
    .single();

  if (deployError || !deployment) {
    throw new Error('Deployment not found: ' + deployError?.message);
  }

  if (deployment.status !== 'running') {
    return { 
      success: true, 
      message: 'Deployment not running',
      status: deployment.status 
    };
  }

  if (deployment.halted) {
    return { 
      success: true, 
      message: 'Deployment halted: ' + deployment.halt_reason,
      halted: true
    };
  }

  // Check market hours (RTH: 9:30 AM - 4:00 PM ET)
  const now = new Date();
  const etTime = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const hour = etTime.getHours();
  const minute = etTime.getMinutes();
  const dayOfWeek = etTime.getDay();
  
  const isMarketOpen = dayOfWeek >= 1 && dayOfWeek <= 5 && 
    ((hour === 9 && minute >= 30) || (hour >= 10 && hour < 16));

  // Always log the run attempt even if market is closed
  await logToDb(supabase, deployment_id, 'market', 
    `Market check: ET ${hour}:${minute.toString().padStart(2, '0')}, day=${dayOfWeek}, open=${isMarketOpen}`,
    { hour, minute, dayOfWeek, isMarketOpen, force_trade }
  );

  // If market closed, exit early - including for force trades
  if (!isMarketOpen) {
    await supabase.from('paper_deployments').update({
      last_runner_log: {
        ts: new Date().toISOString(),
        message: `Market closed (ET ${hour}:${minute.toString().padStart(2, '0')})`,
        market_open: false
      }
    }).eq('id', deployment_id);

    // REJECT force trades during closed markets - orders would queue until open
    if (force_trade) {
      await logToDb(supabase, deployment_id, 'error', 
        `Cannot place test trade: market is closed (ET ${hour}:${minute.toString().padStart(2, '0')})`,
        { force_trade, hour, minute, dayOfWeek }
      );
      return { 
        success: false, 
        error: 'Market is closed - test trades are only allowed during Regular Trading Hours (9:30 AM - 4:00 PM ET, Mon-Fri)',
        market_open: false,
        et_hour: hour,
        et_minute: minute
      };
    }

    return { 
      success: true, 
      message: 'Market closed',
      market_open: false,
      et_hour: hour,
      et_minute: minute
    };
  }

  // Parse bot parameters and risk limits
  const botVersion = deployment.bot_version;
  const template = botVersion?.bot?.template;
  const templateId = template?.id || 'momentum_breakout_v1';
  
  let params: Record<string, any> = {};
  let riskLimits: Record<string, any> = {};
  
  try {
    params = typeof botVersion.params_json === 'string' 
      ? JSON.parse(botVersion.params_json) 
      : botVersion.params_json || {};
    riskLimits = typeof botVersion.risk_limits_json === 'string'
      ? JSON.parse(botVersion.risk_limits_json)
      : botVersion.risk_limits_json || {};
  } catch (e) {
    console.error('[paper-runner] Error parsing params:', e);
  }

  await logToDb(supabase, deployment_id, 'signal', 
    `Strategy: ${templateId}`,
    { params, riskLimits }
  );

  // Get current position from deployment state
  let currentPosition: Position | null = deployment.current_position as Position | null;
  const symbols = deployment.symbols || ['QQQ'];
  const symbol = symbols[0];

  // Fetch recent bars from Alpaca (last 100 bars, 5-minute timeframe)
  const barsUrl = `https://data.alpaca.markets/v2/stocks/${symbol}/bars?timeframe=5Min&limit=100`;
  
  const barsResponse = await fetch(barsUrl, {
    headers: {
      'APCA-API-KEY-ID': ALPACA_API_KEY,
      'APCA-API-SECRET-KEY': ALPACA_SECRET_KEY,
    }
  });

  if (!barsResponse.ok) {
    const errorText = await barsResponse.text();
    await logToDb(supabase, deployment_id, 'error', `Failed to fetch bars: ${barsResponse.status}`, { error: errorText });
    throw new Error(`Failed to fetch bars: ${barsResponse.status} - ${errorText}`);
  }

  const barsData = await barsResponse.json();
  const bars: Bar[] = barsData.bars || [];

  if (bars.length < 20) {
    await logToDb(supabase, deployment_id, 'market', `Not enough bars: ${bars.length}`, { bars_count: bars.length });
    return { 
      success: true, 
      message: 'Not enough data',
      bars_count: bars.length
    };
  }

  const latestBar = bars[bars.length - 1];
  await logToDb(supabase, deployment_id, 'market', 
    `Latest bar: ${symbol} @ $${latestBar.c.toFixed(2)} (${latestBar.t})`,
    { 
      symbol,
      price: latestBar.c,
      time: latestBar.t,
      open: latestBar.o,
      high: latestBar.h,
      low: latestBar.l,
      volume: latestBar.v,
      bars_count: bars.length
    }
  );

  // Calculate ATR for stops
  const atrPeriod = params.atr_period || 14;
  const stopAtrMult = params.stop_atr_mult || 1.5;
  const takeProfitAtrMult = params.takeprofit_atr_mult || 2.5;
  
  const atr = calculateATR(bars, atrPeriod);

  // Get account info for position sizing
  const accountResponse = await fetch('https://paper-api.alpaca.markets/v2/account', {
    headers: {
      'APCA-API-KEY-ID': ALPACA_API_KEY,
      'APCA-API-SECRET-KEY': ALPACA_SECRET_KEY,
    }
  });

  if (!accountResponse.ok) {
    throw new Error('Failed to fetch account');
  }

  const account = await accountResponse.json();
  const equity = parseFloat(account.equity);
  const buyingPower = parseFloat(account.buying_power);
  
  await logToDb(supabase, deployment_id, 'market', 
    `Account: equity=$${equity.toFixed(2)}, buying_power=$${buyingPower.toFixed(2)}`,
    { equity, buyingPower, cash: account.cash }
  );

  // Check daily loss limit
  const startingEquity = deployment.config_json?.starting_equity || 100000;
  const dailyPnl = equity - startingEquity;
  const maxDailyLoss = riskLimits.max_daily_loss_usd || 500;

  if (dailyPnl < -maxDailyLoss && !force_trade) {
    await logToDb(supabase, deployment_id, 'signal', `Daily loss limit hit: $${dailyPnl.toFixed(2)}`, { dailyPnl, maxDailyLoss });
    await supabase.from('paper_deployments').update({
      halted: true,
      halt_reason: `Daily loss limit hit: $${dailyPnl.toFixed(2)}`
    }).eq('id', deployment_id);

    return { 
      success: true, 
      message: 'Daily loss limit hit',
      halted: true,
      daily_pnl: dailyPnl
    };
  }

  // Generate signal based on strategy template
  const signal = force_trade 
    ? { type: force_trade === 'long' ? 'entry_long' : 'entry_short', reason: 'FORCED_TEST_TRADE' }
    : generateSignal(templateId, bars, params, currentPosition);
  
  // Calculate breakout levels for logging
  const lookback = params.lookback_bars || params.lookback_period || 20;
  const breakoutPct = params.breakout_pct || 0.002;
  const recentBars = bars.slice(-lookback - 1, -1);
  const recentHigh = Math.max(...recentBars.map(b => b.h));
  const recentLow = Math.min(...recentBars.map(b => b.l));
  const upperBreakout = recentHigh * (1 + breakoutPct);
  const lowerBreakout = recentLow * (1 - breakoutPct);

  await logToDb(supabase, deployment_id, 'signal', 
    `Signal: ${signal.type} (${signal.reason})`,
    {
      signal_type: signal.type,
      signal_reason: signal.reason,
      current_price: latestBar.c,
      lookback_high: recentHigh,
      lookback_low: recentLow,
      upper_breakout_level: upperBreakout,
      lower_breakout_level: lowerBreakout,
      breakout_pct: breakoutPct,
      atr,
      current_position: currentPosition,
      price_vs_upper: `${latestBar.c.toFixed(2)} vs ${upperBreakout.toFixed(2)} (${((latestBar.c / upperBreakout - 1) * 100).toFixed(3)}%)`,
      price_vs_lower: `${latestBar.c.toFixed(2)} vs ${lowerBreakout.toFixed(2)} (${((1 - latestBar.c / lowerBreakout) * 100).toFixed(3)}%)`
    }
  );

  let orderPlaced = false;
  let orderDetails: any = null;

  // Execute trades based on signal
  if ((signal.type === 'entry_long') && !currentPosition) {
    // Calculate position size
    const maxPositionSize = riskLimits.max_position_size_usd || 10000;
    const riskPerTrade = Math.min(maxPositionSize, buyingPower * 0.9);
    const qty = Math.floor(riskPerTrade / latestBar.c);
    
    if (qty > 0) {
      const stopLoss = latestBar.c - (atr * stopAtrMult);
      const takeProfit = latestBar.c + (atr * takeProfitAtrMult);

      await logToDb(supabase, deployment_id, 'order', 
        `Placing LONG order: ${qty} shares @ ~$${latestBar.c.toFixed(2)}`,
        { qty, price: latestBar.c, stopLoss, takeProfit, riskPerTrade, maxPositionSize }
      );

      // Place market order via Alpaca
      const orderResult = await placeOrder(ALPACA_API_KEY, ALPACA_SECRET_KEY, {
        symbol,
        qty,
        side: 'buy',
        type: 'market',
        time_in_force: 'day'
      });

      if (orderResult.success) {
        currentPosition = {
          side: 'long',
          entry_price: latestBar.c,
          entry_time: new Date().toISOString(),
          qty,
          stop_loss: stopLoss,
          take_profit: takeProfit,
          symbol
        };
        orderPlaced = true;
        orderDetails = orderResult.order;
        await logToDb(supabase, deployment_id, 'order', 
          `✓ LONG order placed: ${qty} shares, order_id=${orderResult.order?.id}`,
          { order: orderResult.order }
        );
      } else {
        await logToDb(supabase, deployment_id, 'error', 
          `✗ LONG order failed: ${orderResult.error}`,
          { error: orderResult.error }
        );
      }
    }
  } else if ((signal.type === 'entry_short') && !currentPosition) {
    // Calculate position size
    const maxPositionSize = riskLimits.max_position_size_usd || 10000;
    const riskPerTrade = Math.min(maxPositionSize, buyingPower * 0.9);
    const qty = Math.floor(riskPerTrade / latestBar.c);
    
    if (qty > 0) {
      const stopLoss = latestBar.c + (atr * stopAtrMult);
      const takeProfit = latestBar.c - (atr * takeProfitAtrMult);

      await logToDb(supabase, deployment_id, 'order', 
        `Placing SHORT order: ${qty} shares @ ~$${latestBar.c.toFixed(2)}`,
        { qty, price: latestBar.c, stopLoss, takeProfit }
      );

      const orderResult = await placeOrder(ALPACA_API_KEY, ALPACA_SECRET_KEY, {
        symbol,
        qty,
        side: 'sell',
        type: 'market',
        time_in_force: 'day'
      });

      if (orderResult.success) {
        currentPosition = {
          side: 'short',
          entry_price: latestBar.c,
          entry_time: new Date().toISOString(),
          qty,
          stop_loss: stopLoss,
          take_profit: takeProfit,
          symbol
        };
        orderPlaced = true;
        orderDetails = orderResult.order;
        await logToDb(supabase, deployment_id, 'order', 
          `✓ SHORT order placed: ${qty} shares, order_id=${orderResult.order?.id}`,
          { order: orderResult.order }
        );
      } else {
        await logToDb(supabase, deployment_id, 'error', 
          `✗ SHORT order failed: ${orderResult.error}`,
          { error: orderResult.error }
        );
      }
    }
  } else if (signal.type === 'exit' && currentPosition) {
    // Close position
    const closeSide = currentPosition.side === 'long' ? 'sell' : 'buy';
    
    await logToDb(supabase, deployment_id, 'order', 
      `Closing ${currentPosition.side.toUpperCase()} position: ${currentPosition.qty} shares`,
      { position: currentPosition, reason: signal.reason }
    );

    const orderResult = await placeOrder(ALPACA_API_KEY, ALPACA_SECRET_KEY, {
      symbol: currentPosition.symbol,
      qty: currentPosition.qty,
      side: closeSide,
      type: 'market',
      time_in_force: 'day'
    });

    if (orderResult.success) {
      const pnl = currentPosition.side === 'long' 
        ? (latestBar.c - currentPosition.entry_price) * currentPosition.qty
        : (currentPosition.entry_price - latestBar.c) * currentPosition.qty;
      
      await logToDb(supabase, deployment_id, 'order', 
        `✓ Closed ${currentPosition.side.toUpperCase()} position, P&L: $${pnl.toFixed(2)}`,
        { pnl, order: orderResult.order, reason: signal.reason }
      );
      currentPosition = null;
      orderPlaced = true;
      orderDetails = orderResult.order;
    }
  } else if (currentPosition) {
    // Check stop loss and take profit
    const price = latestBar.c;
    
    if (currentPosition.side === 'long') {
      if (price <= currentPosition.stop_loss) {
        await logToDb(supabase, deployment_id, 'order', 
          `STOP LOSS triggered for LONG @ $${price.toFixed(2)} (SL: $${currentPosition.stop_loss.toFixed(2)})`,
          { price, stop_loss: currentPosition.stop_loss }
        );
        const orderResult = await placeOrder(ALPACA_API_KEY, ALPACA_SECRET_KEY, {
          symbol: currentPosition.symbol,
          qty: currentPosition.qty,
          side: 'sell',
          type: 'market',
          time_in_force: 'day'
        });
        if (orderResult.success) {
          currentPosition = null;
          orderPlaced = true;
          orderDetails = orderResult.order;
        }
      } else if (price >= currentPosition.take_profit) {
        await logToDb(supabase, deployment_id, 'order', 
          `TAKE PROFIT triggered for LONG @ $${price.toFixed(2)} (TP: $${currentPosition.take_profit.toFixed(2)})`,
          { price, take_profit: currentPosition.take_profit }
        );
        const orderResult = await placeOrder(ALPACA_API_KEY, ALPACA_SECRET_KEY, {
          symbol: currentPosition.symbol,
          qty: currentPosition.qty,
          side: 'sell',
          type: 'market',
          time_in_force: 'day'
        });
        if (orderResult.success) {
          currentPosition = null;
          orderPlaced = true;
          orderDetails = orderResult.order;
        }
      }
    } else if (currentPosition.side === 'short') {
      if (price >= currentPosition.stop_loss) {
        await logToDb(supabase, deployment_id, 'order', 
          `STOP LOSS triggered for SHORT @ $${price.toFixed(2)} (SL: $${currentPosition.stop_loss.toFixed(2)})`,
          { price, stop_loss: currentPosition.stop_loss }
        );
        const orderResult = await placeOrder(ALPACA_API_KEY, ALPACA_SECRET_KEY, {
          symbol: currentPosition.symbol,
          qty: currentPosition.qty,
          side: 'buy',
          type: 'market',
          time_in_force: 'day'
        });
        if (orderResult.success) {
          currentPosition = null;
          orderPlaced = true;
          orderDetails = orderResult.order;
        }
      } else if (price <= currentPosition.take_profit) {
        await logToDb(supabase, deployment_id, 'order', 
          `TAKE PROFIT triggered for SHORT @ $${price.toFixed(2)} (TP: $${currentPosition.take_profit.toFixed(2)})`,
          { price, take_profit: currentPosition.take_profit }
        );
        const orderResult = await placeOrder(ALPACA_API_KEY, ALPACA_SECRET_KEY, {
          symbol: currentPosition.symbol,
          qty: currentPosition.qty,
          side: 'buy',
          type: 'market',
          time_in_force: 'day'
        });
        if (orderResult.success) {
          currentPosition = null;
          orderPlaced = true;
          orderDetails = orderResult.order;
        }
      }
    }
  }

  // Update deployment state with detailed status
  await supabase.from('paper_deployments').update({
    current_position: currentPosition,
    last_signal_at: new Date().toISOString(),
    last_signal_type: signal.type,
    daily_pnl: dailyPnl,
    daily_trades: orderPlaced ? (deployment.daily_trades || 0) + 1 : (deployment.daily_trades || 0),
    last_bar_price: latestBar.c,
    last_bar_time: latestBar.t,
    breakout_high: upperBreakout,
    breakout_low: lowerBreakout,
    last_runner_log: {
      ts: new Date().toISOString(),
      message: `${signal.type}: ${signal.reason}`,
      price: latestBar.c,
      upper_breakout: upperBreakout,
      lower_breakout: lowerBreakout,
      atr,
      market_open: isMarketOpen,
      order_placed: orderPlaced
    }
  }).eq('id', deployment_id);

  // Store position snapshot - ALWAYS record even without trades
  await supabase.from('paper_positions_snapshots').insert({
    deployment_id,
    equity,
    cash: parseFloat(account.cash),
    positions_json: currentPosition ? [currentPosition] : []
  });

  // Sync orders from Alpaca
  const ordersResponse = await fetch('https://paper-api.alpaca.markets/v2/orders?status=all&limit=50', {
    headers: {
      'APCA-API-KEY-ID': ALPACA_API_KEY,
      'APCA-API-SECRET-KEY': ALPACA_SECRET_KEY,
    }
  });

  if (ordersResponse.ok) {
    const orders = await ordersResponse.json();
    for (const order of orders) {
      await supabase.from('paper_orders').upsert({
        deployment_id,
        alpaca_order_id: order.id,
        symbol: order.symbol,
        side: order.side,
        qty: parseFloat(order.qty),
        order_type: order.type,
        status: order.status,
        submitted_at: order.submitted_at,
        filled_at: order.filled_at,
        filled_price: order.filled_avg_price ? parseFloat(order.filled_avg_price) : null,
        filled_qty: order.filled_qty ? parseFloat(order.filled_qty) : null,
        raw_json: order
      }, { onConflict: 'alpaca_order_id' });
    }
  }

  // Update daily metrics
  const today = new Date().toISOString().split('T')[0];
  const { data: todaySnapshots } = await supabase
    .from('paper_positions_snapshots')
    .select('equity')
    .eq('deployment_id', deployment_id)
    .gte('ts', today)
    .order('ts', { ascending: true });

  const dailyPeak = Math.max(startingEquity, ...((todaySnapshots || []).map((s: any) => s.equity)));
  const dailyDrawdown = dailyPeak > 0 ? (dailyPeak - equity) / dailyPeak : 0;

  await supabase.from('paper_metrics_daily').upsert({
    deployment_id,
    date: today,
    pnl: dailyPnl,
    drawdown: dailyDrawdown,
    trades_count: deployment.daily_trades || 0,
    equity_end: equity
  }, { onConflict: 'deployment_id,date' });

  return {
    success: true,
    deployment_id,
    signal: signal.type,
    signal_reason: signal.reason,
    current_position: currentPosition,
    order_placed: orderPlaced,
    order_details: orderDetails,
    equity,
    daily_pnl: dailyPnl,
    bars_analyzed: bars.length,
    latest_bar: {
      time: latestBar.t,
      price: latestBar.c,
      high: latestBar.h,
      low: latestBar.l
    },
    breakout_levels: {
      upper: upperBreakout,
      lower: lowerBreakout,
      lookback_high: recentHigh,
      lookback_low: recentLow
    },
    atr,
    market_open: isMarketOpen
  };
}

// Calculate Average True Range
function calculateATR(bars: Bar[], period: number): number {
  if (bars.length < period + 1) return 0;
  
  const trs: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const high = bars[i].h;
    const low = bars[i].l;
    const prevClose = bars[i - 1].c;
    const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    trs.push(tr);
  }
  
  const recentTRs = trs.slice(-period);
  return recentTRs.reduce((a, b) => a + b, 0) / recentTRs.length;
}

// Generate trading signal based on strategy template
function generateSignal(
  templateId: string, 
  bars: Bar[], 
  params: Record<string, any>,
  currentPosition: Position | null
): { type: 'entry_long' | 'entry_short' | 'exit' | 'hold'; reason: string } {
  
  const latestBar = bars[bars.length - 1];
  const price = latestBar.c;
  
  if (templateId === 'momentum_breakout_v1') {
    const lookback = params.lookback_bars || params.lookback_period || 20;
    const breakoutPct = params.breakout_pct || 0.002; // 0.2% default
    const tradeDirection = params.trade_direction || 'both';
    
    if (bars.length < lookback + 1) {
      return { type: 'hold', reason: 'insufficient_data' };
    }
    
    // Calculate recent high/low
    const recentBars = bars.slice(-lookback - 1, -1);
    const recentHigh = Math.max(...recentBars.map(b => b.h));
    const recentLow = Math.min(...recentBars.map(b => b.l));
    
    // Check for breakout with percentage threshold
    const upperBreakout = recentHigh * (1 + breakoutPct);
    const lowerBreakout = recentLow * (1 - breakoutPct);
    
    if (!currentPosition) {
      if (price > upperBreakout && (tradeDirection === 'both' || tradeDirection === 'long')) {
        return { type: 'entry_long', reason: `breakout_above_${recentHigh.toFixed(2)}_at_${price.toFixed(2)}` };
      }
      if (price < lowerBreakout && (tradeDirection === 'both' || tradeDirection === 'short')) {
        return { type: 'entry_short', reason: `breakout_below_${recentLow.toFixed(2)}_at_${price.toFixed(2)}` };
      }
      // More detailed hold reason
      const distToUpper = ((upperBreakout - price) / price * 100).toFixed(3);
      const distToLower = ((price - lowerBreakout) / price * 100).toFixed(3);
      return { type: 'hold', reason: `no_breakout_${distToUpper}%_to_upper_${distToLower}%_to_lower` };
    } else {
      // Exit on reversal
      if (currentPosition.side === 'long' && price < recentLow) {
        return { type: 'exit', reason: 'reversal_below_support' };
      }
      if (currentPosition.side === 'short' && price > recentHigh) {
        return { type: 'exit', reason: 'reversal_above_resistance' };
      }
    }
    
    return { type: 'hold', reason: `in_position_${currentPosition?.side || 'none'}` };
    
  } else if (templateId === 'mean_reversion_extremes_v1') {
    const rsiPeriod = params.rsi_period || 14;
    const rsiOversold = params.rsi_oversold || 30;
    const rsiOverbought = params.rsi_overbought || 70;
    
    const rsi = calculateRSI(bars, rsiPeriod);
    
    if (!currentPosition) {
      if (rsi < rsiOversold) {
        return { type: 'entry_long', reason: `rsi_oversold_${rsi.toFixed(1)}` };
      }
      if (rsi > rsiOverbought) {
        return { type: 'entry_short', reason: `rsi_overbought_${rsi.toFixed(1)}` };
      }
    } else {
      if (currentPosition.side === 'long' && rsi > 50) {
        return { type: 'exit', reason: 'rsi_normalized' };
      }
      if (currentPosition.side === 'short' && rsi < 50) {
        return { type: 'exit', reason: 'rsi_normalized' };
      }
    }
    
    return { type: 'hold', reason: `rsi_neutral_${rsi.toFixed(1)}` };
    
  } else if (templateId === 'regime_switcher_v1') {
    const volatilityThreshold = params.volatility_threshold || 0.02;
    const lookback = params.trend_lookback || 20;
    
    const returns = [];
    for (let i = 1; i < bars.length; i++) {
      returns.push((bars[i].c - bars[i-1].c) / bars[i-1].c);
    }
    const recentReturns = returns.slice(-lookback);
    const volatility = Math.sqrt(recentReturns.reduce((a, r) => a + r * r, 0) / recentReturns.length);
    
    if (volatility > volatilityThreshold) {
      return generateSignal('momentum_breakout_v1', bars, params, currentPosition);
    } else {
      return generateSignal('mean_reversion_extremes_v1', bars, params, currentPosition);
    }
  }
  
  return { type: 'hold', reason: 'unknown_template' };
}

// Calculate RSI
function calculateRSI(bars: Bar[], period: number): number {
  if (bars.length < period + 1) return 50;
  
  const changes = [];
  for (let i = 1; i < bars.length; i++) {
    changes.push(bars[i].c - bars[i-1].c);
  }
  
  const recentChanges = changes.slice(-period);
  const gains = recentChanges.filter(c => c > 0);
  const losses = recentChanges.filter(c => c < 0).map(c => Math.abs(c));
  
  const avgGain = gains.length > 0 ? gains.reduce((a, b) => a + b, 0) / period : 0;
  const avgLoss = losses.length > 0 ? losses.reduce((a, b) => a + b, 0) / period : 0;
  
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

// Place order via Alpaca API
async function placeOrder(
  apiKey: string, 
  secretKey: string, 
  order: { symbol: string; qty: number; side: string; type: string; time_in_force: string }
): Promise<{ success: boolean; order?: any; error?: string }> {
  try {
    console.log(`[paper-runner] Placing order:`, order);
    
    const response = await fetch('https://paper-api.alpaca.markets/v2/orders', {
      method: 'POST',
      headers: {
        'APCA-API-KEY-ID': apiKey,
        'APCA-API-SECRET-KEY': secretKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(order)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[paper-runner] Order failed: ${response.status} - ${errorText}`);
      return { success: false, error: errorText };
    }

    const orderResult = await response.json();
    console.log(`[paper-runner] Order placed successfully:`, orderResult.id);
    return { success: true, order: orderResult };
  } catch (error) {
    console.error(`[paper-runner] Order error:`, error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}
