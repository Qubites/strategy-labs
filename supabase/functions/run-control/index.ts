import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RunControlRequest {
  action: 'start' | 'pause' | 'resume' | 'stop';
  run_id?: string;
  bot_version_id?: string;
  run_type?: string;
  dataset_id?: string;
  cost_model?: {
    commission_per_share: number;
    slippage_per_share: number;
    fixed_cost_per_trade: number;
  };
  stop_rule?: {
    max_loss_usd?: number;
    max_trades?: number;
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json() as RunControlRequest;
    const { action } = body;

    console.log(`Run control action: ${action}`, body);

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    switch (action) {
      case 'start': {
        const { bot_version_id, run_type = 'backtest', dataset_id, cost_model, stop_rule } = body;
        
        if (!bot_version_id) {
          throw new Error('bot_version_id is required');
        }

        // Create run record
        const { data: run, error: runError } = await supabase
          .from('runs')
          .insert({
            bot_version_id,
            run_type,
            dataset_id,
            status: 'queued',
            cost_model_json: cost_model ? JSON.stringify(cost_model) : null,
            stop_rule_json: stop_rule ? JSON.stringify(stop_rule) : null,
          })
          .select()
          .single();

        if (runError) {
          console.error('Error creating run:', runError);
          throw new Error('Failed to create run');
        }

        // For backtest runs, trigger the backtest worker
        if (run_type === 'backtest' && dataset_id) {
          // Invoke backtest worker asynchronously
          const workerUrl = `${SUPABASE_URL}/functions/v1/backtest-worker`;
          fetch(workerUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            },
            body: JSON.stringify({ run_id: run.id }),
          }).catch(err => console.error('Failed to trigger backtest worker:', err));
        }

        return new Response(JSON.stringify({
          success: true,
          run_id: run.id,
          status: run.status,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'pause': {
        const { run_id } = body;
        
        if (!run_id) {
          throw new Error('run_id is required');
        }

        const { error } = await supabase
          .from('runs')
          .update({ 
            status: 'paused',
            paused_at: new Date().toISOString(),
          })
          .eq('id', run_id);

        if (error) {
          throw new Error('Failed to pause run');
        }

        return new Response(JSON.stringify({
          success: true,
          run_id,
          status: 'paused',
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'resume': {
        const { run_id } = body;
        
        if (!run_id) {
          throw new Error('run_id is required');
        }

        const { error } = await supabase
          .from('runs')
          .update({ 
            status: 'running',
            paused_at: null,
          })
          .eq('id', run_id);

        if (error) {
          throw new Error('Failed to resume run');
        }

        return new Response(JSON.stringify({
          success: true,
          run_id,
          status: 'running',
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'stop': {
        const { run_id } = body;
        
        if (!run_id) {
          throw new Error('run_id is required');
        }

        const { error } = await supabase
          .from('runs')
          .update({ 
            status: 'stopped',
            end_ts: new Date().toISOString(),
          })
          .eq('id', run_id);

        if (error) {
          throw new Error('Failed to stop run');
        }

        return new Response(JSON.stringify({
          success: true,
          run_id,
          status: 'stopped',
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }
  } catch (error) {
    console.error('Error in run-control:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
