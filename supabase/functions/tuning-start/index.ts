import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TuningRequest {
  bot_id: string;
  champion_version_id: string;
  dataset_id: string;
  instructions?: string;
  max_trials?: number;
  objective_config?: {
    pf_weight: number;
    sharpe_weight: number;
    return_weight: number;
    dd_penalty: number;
  };
  constraints?: {
    min_trades: number;
    max_dd: number;
    improvement_threshold: number;
  };
}

// Parse natural language instructions into objective config
function parseInstructions(instructions: string): { 
  objective_config: any; 
  mutation_bias: any; 
  parsed_summary: string;
} {
  const lower = instructions.toLowerCase();
  
  // Default weights
  let pf_weight = 0.35;
  let sharpe_weight = 0.25;
  let return_weight = 0.25;
  let dd_penalty = 0.15;
  let mutation_bias: Record<string, string> = {};
  let parsed_summary = "Standard optimization: balanced PF, Sharpe, return with DD penalty.";

  // Minimize drawdown patterns
  if (lower.includes('minimize drawdown') || lower.includes('reduce dd') || lower.includes('low drawdown')) {
    dd_penalty = 0.35;
    pf_weight = 0.25;
    sharpe_weight = 0.25;
    return_weight = 0.15;
    mutation_bias['stop_atr_mult'] = 'tighter';
    mutation_bias['takeprofit_atr_mult'] = 'tighter';
    parsed_summary = "Prioritizing drawdown reduction: tighter stops, lower position risk.";
  }

  // Maximize return patterns
  if (lower.includes('maximize return') || lower.includes('higher return') || lower.includes('more profit')) {
    return_weight = 0.40;
    pf_weight = 0.30;
    dd_penalty = 0.10;
    sharpe_weight = 0.20;
    mutation_bias['takeprofit_atr_mult'] = 'wider';
    parsed_summary = "Prioritizing returns: wider targets, accepting more risk.";
  }

  // Fewer trades / higher quality
  if (lower.includes('fewer trades') || lower.includes('less trades') || lower.includes('higher quality')) {
    mutation_bias['breakout_pct'] = 'higher';
    mutation_bias['entry_z'] = 'higher';
    mutation_bias['max_trades_per_day'] = 'lower';
    parsed_summary = "Quality over quantity: stricter entry filters, fewer trades.";
  }

  // More trades / higher frequency
  if (lower.includes('more trades') || lower.includes('higher frequency') || lower.includes('trade more often')) {
    mutation_bias['breakout_pct'] = 'lower';
    mutation_bias['entry_z'] = 'lower';
    mutation_bias['max_trades_per_day'] = 'higher';
    parsed_summary = "Higher frequency: looser entry filters, more trades.";
  }

  // Opposite of best practice (experimental)
  if (lower.includes('opposite') || lower.includes('contrarian') || lower.includes('inverse')) {
    mutation_bias['stop_atr_mult'] = 'wider';
    mutation_bias['takeprofit_atr_mult'] = 'tighter';
    parsed_summary = "Contrarian: wider stops, tighter targets. Experimental approach.";
  }

  // Maximize Sharpe
  if (lower.includes('sharpe') || lower.includes('risk-adjusted') || lower.includes('consistency')) {
    sharpe_weight = 0.40;
    pf_weight = 0.25;
    return_weight = 0.20;
    dd_penalty = 0.15;
    parsed_summary = "Risk-adjusted focus: maximizing Sharpe ratio for consistency.";
  }

  // Scalping / quick trades
  if (lower.includes('scalp') || lower.includes('quick trades') || lower.includes('fast')) {
    mutation_bias['takeprofit_atr_mult'] = 'tighter';
    mutation_bias['stop_atr_mult'] = 'tighter';
    mutation_bias['max_trades_per_day'] = 'higher';
    parsed_summary = "Scalping mode: quick entries/exits, tight targets.";
  }

  // Swing / longer holds
  if (lower.includes('swing') || lower.includes('longer hold') || lower.includes('patient')) {
    mutation_bias['takeprofit_atr_mult'] = 'wider';
    mutation_bias['lookback_bars'] = 'higher';
    mutation_bias['max_trades_per_day'] = 'lower';
    parsed_summary = "Swing mode: patient entries, wider targets.";
  }

  return {
    objective_config: { pf_weight, sharpe_weight, return_weight, dd_penalty },
    mutation_bias,
    parsed_summary
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const request = await req.json() as TuningRequest;
    const { 
      bot_id, 
      champion_version_id, 
      dataset_id, 
      instructions,
      max_trials = 20,
      objective_config,
      constraints
    } = request;

    console.log(`Starting tuning job for bot: ${bot_id}`);

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Parse instructions if provided
    let parsedInstructions = null;
    let finalObjectiveConfig = objective_config || {
      pf_weight: 0.35,
      sharpe_weight: 0.25,
      return_weight: 0.25,
      dd_penalty: 0.15
    };

    if (instructions && instructions.trim()) {
      parsedInstructions = parseInstructions(instructions);
      finalObjectiveConfig = parsedInstructions.objective_config;
    }

    // Create tuning job
    const { data: job, error: jobError } = await supabase
      .from('tuning_jobs')
      .insert({
        bot_id,
        champion_version_id,
        dataset_id,
        status: 'pending',
        instructions,
        instruction_parsed_json: parsedInstructions,
        max_trials,
        objective_config: finalObjectiveConfig,
        constraints: constraints || {
          min_trades: 30,
          max_dd: 0.15,
          improvement_threshold: 0.03
        }
      })
      .select()
      .single();

    if (jobError) throw jobError;

    // Log the start
    await supabase.from('logs').insert({
      run_id: null,
      level: 'info',
      category: 'ai',
      message: `Tuning job started: ${job.id}`,
      payload_json: JSON.stringify({ job_id: job.id, instructions, parsed: parsedInstructions })
    });

    return new Response(JSON.stringify({
      success: true,
      job_id: job.id,
      parsed_instructions: parsedInstructions,
      objective_config: finalObjectiveConfig,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in tuning-start:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
