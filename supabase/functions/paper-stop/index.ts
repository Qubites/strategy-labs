import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PaperStopRequest {
  deployment_id: string;
  reason?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { deployment_id, reason } = await req.json() as PaperStopRequest;

    console.log(`Stopping paper deployment: ${deployment_id}`);

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const ALPACA_API_KEY = Deno.env.get('ALPACA_API_KEY')!;
    const ALPACA_SECRET_KEY = Deno.env.get('ALPACA_SECRET_KEY')!;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch deployment
    const { data: deployment, error: deployError } = await supabase
      .from('paper_deployments')
      .select('*')
      .eq('id', deployment_id)
      .single();

    if (deployError || !deployment) throw new Error('Deployment not found');

    // Cancel all open orders in Alpaca
    try {
      await fetch('https://paper-api.alpaca.markets/v2/orders', {
        method: 'DELETE',
        headers: {
          'APCA-API-KEY-ID': ALPACA_API_KEY,
          'APCA-API-SECRET-KEY': ALPACA_SECRET_KEY,
        }
      });
    } catch (e) {
      console.log('Failed to cancel orders:', e);
    }

    // Close all positions (optional - uncomment if desired)
    // try {
    //   await fetch('https://paper-api.alpaca.markets/v2/positions', {
    //     method: 'DELETE',
    //     headers: {
    //       'APCA-API-KEY-ID': ALPACA_API_KEY,
    //       'APCA-API-SECRET-KEY': ALPACA_SECRET_KEY,
    //     }
    //   });
    // } catch (e) {
    //   console.log('Failed to close positions:', e);
    // }

    // Update deployment status
    await supabase
      .from('paper_deployments')
      .update({
        status: 'stopped',
        ended_at: new Date().toISOString(),
        reject_reason: reason || 'Manually stopped'
      })
      .eq('id', deployment_id);

    // Update version lifecycle back to BACKTEST_WINNER
    await supabase
      .from('bot_versions')
      .update({ lifecycle_status: 'BACKTEST_WINNER' })
      .eq('id', deployment.bot_version_id);

    // Log
    await supabase.from('logs').insert({
      run_id: null,
      level: 'warn',
      category: 'execution',
      message: `Paper trading stopped for deployment ${deployment_id}`,
      payload_json: JSON.stringify({ reason: reason || 'Manually stopped' })
    });

    return new Response(JSON.stringify({
      success: true,
      deployment_id,
      status: 'stopped'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in paper-stop:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
