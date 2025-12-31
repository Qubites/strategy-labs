import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PaperStartRequest {
  bot_id: string;
  bot_version_id: string;
  target_days?: number;
  symbols?: string[];
  pass_criteria?: {
    max_dd: number;
    max_daily_loss: number;
    min_trades: number;
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const request = await req.json() as PaperStartRequest;
    const {
      bot_id,
      bot_version_id,
      target_days = 5,
      symbols = ['QQQ'],
      pass_criteria = { max_dd: 0.1, max_daily_loss: 500, min_trades: 5 }
    } = request;

    console.log(`Starting paper deployment for version: ${bot_version_id}`);

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const ALPACA_API_KEY = Deno.env.get('ALPACA_API_KEY');
    const ALPACA_SECRET_KEY = Deno.env.get('ALPACA_SECRET_KEY');

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Verify version exists and is eligible
    const { data: version, error: versionError } = await supabase
      .from('bot_versions')
      .select('*, bot:bots(*)')
      .eq('id', bot_version_id)
      .single();

    if (versionError || !version) throw new Error('Version not found');

    if (version.lifecycle_status !== 'BACKTEST_WINNER') {
      throw new Error(`Version must be BACKTEST_WINNER to start paper trading. Current status: ${version.lifecycle_status}`);
    }

    // Verify Alpaca credentials
    if (!ALPACA_API_KEY || !ALPACA_SECRET_KEY) {
      throw new Error('Alpaca API credentials not configured');
    }

    // Get Alpaca account info to verify connection
    const accountResponse = await fetch('https://paper-api.alpaca.markets/v2/account', {
      headers: {
        'APCA-API-KEY-ID': ALPACA_API_KEY,
        'APCA-API-SECRET-KEY': ALPACA_SECRET_KEY,
      }
    });

    if (!accountResponse.ok) {
      throw new Error('Failed to connect to Alpaca paper trading');
    }

    const account = await accountResponse.json();

    // Create paper deployment
    const { data: deployment, error: deployError } = await supabase
      .from('paper_deployments')
      .insert({
        bot_id,
        bot_version_id,
        status: 'running',
        started_at: new Date().toISOString(),
        target_days,
        symbols,
        pass_criteria,
        config_json: {
          alpaca_account_id: account.id,
          starting_equity: parseFloat(account.equity),
          starting_cash: parseFloat(account.cash)
        }
      })
      .select()
      .single();

    if (deployError) throw deployError;

    // Create initial position snapshot
    await supabase.from('paper_positions_snapshots').insert({
      deployment_id: deployment.id,
      equity: parseFloat(account.equity),
      cash: parseFloat(account.cash),
      positions_json: []
    });

    // Update version lifecycle
    await supabase
      .from('bot_versions')
      .update({ lifecycle_status: 'PAPER_RUNNING' })
      .eq('id', bot_version_id);

    // Update live_candidate
    await supabase
      .from('live_candidates')
      .update({ paper_deployment_id: deployment.id })
      .eq('version_id', bot_version_id);

    // Log
    await supabase.from('logs').insert({
      run_id: null,
      level: 'info',
      category: 'execution',
      message: `Paper trading started for version ${bot_version_id}`,
      payload_json: JSON.stringify({
        deployment_id: deployment.id,
        starting_equity: account.equity,
        target_days,
        symbols
      })
    });

    return new Response(JSON.stringify({
      success: true,
      deployment_id: deployment.id,
      status: 'running',
      starting_equity: account.equity,
      target_days
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in paper-start:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
