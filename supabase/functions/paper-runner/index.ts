import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PaperRunnerRequest {
  deployment_id: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { deployment_id } = await req.json() as PaperRunnerRequest;

    console.log(`Running paper trading check for deployment: ${deployment_id}`);

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const ALPACA_API_KEY = Deno.env.get('ALPACA_API_KEY')!;
    const ALPACA_SECRET_KEY = Deno.env.get('ALPACA_SECRET_KEY')!;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch deployment
    const { data: deployment, error: deployError } = await supabase
      .from('paper_deployments')
      .select(`
        *,
        bot_version:bot_versions(*, bot:bots(*, template:strategy_templates(*)))
      `)
      .eq('id', deployment_id)
      .single();

    if (deployError || !deployment) throw new Error('Deployment not found');

    if (deployment.status !== 'running') {
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'Deployment not running',
        status: deployment.status 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get current account state from Alpaca
    const accountResponse = await fetch('https://paper-api.alpaca.markets/v2/account', {
      headers: {
        'APCA-API-KEY-ID': ALPACA_API_KEY,
        'APCA-API-SECRET-KEY': ALPACA_SECRET_KEY,
      }
    });

    if (!accountResponse.ok) {
      throw new Error('Failed to fetch Alpaca account');
    }

    const account = await accountResponse.json();
    const currentEquity = parseFloat(account.equity);
    const currentCash = parseFloat(account.cash);

    // Get positions
    const positionsResponse = await fetch('https://paper-api.alpaca.markets/v2/positions', {
      headers: {
        'APCA-API-KEY-ID': ALPACA_API_KEY,
        'APCA-API-SECRET-KEY': ALPACA_SECRET_KEY,
      }
    });

    const positions = positionsResponse.ok ? await positionsResponse.json() : [];

    // Get recent orders
    const ordersResponse = await fetch('https://paper-api.alpaca.markets/v2/orders?status=all&limit=50', {
      headers: {
        'APCA-API-KEY-ID': ALPACA_API_KEY,
        'APCA-API-SECRET-KEY': ALPACA_SECRET_KEY,
      }
    });

    const orders = ordersResponse.ok ? await ordersResponse.json() : [];

    // Store position snapshot
    await supabase.from('paper_positions_snapshots').insert({
      deployment_id,
      equity: currentEquity,
      cash: currentCash,
      positions_json: positions
    });

    // Store/update orders
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

    // Calculate daily metrics
    const today = new Date().toISOString().split('T')[0];
    const startingEquity = deployment.config_json?.starting_equity || currentEquity;
    const dailyPnl = currentEquity - startingEquity;
    
    // Get first snapshot of today for drawdown calc
    const { data: todaySnapshots } = await supabase
      .from('paper_positions_snapshots')
      .select('equity')
      .eq('deployment_id', deployment_id)
      .gte('ts', today)
      .order('ts', { ascending: true });

    const dailyPeak = Math.max(startingEquity, ...((todaySnapshots || []).map(s => s.equity)));
    const dailyDrawdown = dailyPeak > 0 ? (dailyPeak - currentEquity) / dailyPeak : 0;

    // Count today's filled orders
    const todayTrades = orders.filter((o: any) => 
      o.status === 'filled' && o.filled_at && o.filled_at.startsWith(today)
    ).length;

    // Upsert daily metrics
    await supabase.from('paper_metrics_daily').upsert({
      deployment_id,
      date: today,
      pnl: dailyPnl,
      drawdown: dailyDrawdown,
      trades_count: todayTrades,
      equity_end: currentEquity
    }, { onConflict: 'deployment_id,date' });

    // Check if target days reached
    const startDate = new Date(deployment.started_at);
    const now = new Date();
    const daysPassed = Math.floor((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

    if (daysPassed >= deployment.target_days) {
      // Trigger evaluation
      await supabase
        .from('paper_deployments')
        .update({ status: 'evaluating' })
        .eq('id', deployment_id);
    }

    return new Response(JSON.stringify({
      success: true,
      deployment_id,
      current_equity: currentEquity,
      daily_pnl: dailyPnl,
      daily_drawdown: dailyDrawdown,
      days_passed: daysPassed,
      positions_count: positions.length,
      orders_synced: orders.length
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in paper-runner:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
