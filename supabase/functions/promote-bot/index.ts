import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PromoteBotRequest {
  bot_version_id: string;
  target: 'backtested' | 'approved_paper' | 'approved_live';
}

interface PromotionRule {
  from: string[];
  minTrades: number;
  minPF: number;
  maxDD: number;
  requiresPaperHistory?: boolean;
}

// Map status to lifecycle_status for pipeline visualization
const STATUS_TO_LIFECYCLE: Record<string, string> = {
  'draft': 'DRAFT',
  'backtested': 'BACKTEST_WINNER',
  'approved_paper': 'PAPER_RUNNING',
  'approved_live': 'LIVE_READY',
};

const PROMOTION_RULES: Record<string, PromotionRule> = {
  backtested: {
    from: ['draft'],
    minTrades: 10,
    minPF: 0,
    maxDD: Infinity,
  },
  approved_paper: {
    from: ['backtested'],
    minTrades: 30,
    minPF: 1.0,
    maxDD: 500,
  },
  approved_live: {
    from: ['approved_paper'],
    minTrades: 50,
    minPF: 1.2,
    maxDD: 300,
    requiresPaperHistory: true,
  },
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { bot_version_id, target } = await req.json() as PromoteBotRequest;

    if (!bot_version_id || !target) {
      return new Response(JSON.stringify({ error: 'bot_version_id and target are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const rules = PROMOTION_RULES[target];
    if (!rules) {
      return new Response(JSON.stringify({ error: 'Invalid promotion target' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Promoting bot version ${bot_version_id} to ${target}`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch the bot version
    const { data: botVersion, error: fetchError } = await supabase
      .from('bot_versions')
      .select('*')
      .eq('id', bot_version_id)
      .single();

    if (fetchError || !botVersion) {
      throw new Error('Bot version not found');
    }

    // Check current status is valid for promotion
    if (!rules.from.includes(botVersion.status)) {
      return new Response(JSON.stringify({ 
        error: `Cannot promote from '${botVersion.status}' to '${target}'. Must be one of: ${rules.from.join(', ')}` 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch runs and metrics for this bot version
    const { data: runs, error: runsError } = await supabase
      .from('runs')
      .select('*, run_metrics(*)')
      .eq('bot_version_id', bot_version_id)
      .eq('status', 'done');

    if (runsError) throw runsError;

    // Aggregate metrics
    let totalTrades = 0;
    let totalPnL = 0;
    let maxDD = 0;
    let weightedPF = 0;
    let hasPaperRun = false;

    for (const run of runs || []) {
      if (run.run_metrics) {
        totalTrades += run.run_metrics.trades_count || 0;
        totalPnL += run.run_metrics.net_pnl_usd || 0;
        maxDD = Math.max(maxDD, Math.abs(run.run_metrics.max_drawdown || 0));
        if (run.run_metrics.profit_factor && run.run_metrics.trades_count) {
          weightedPF += run.run_metrics.profit_factor * run.run_metrics.trades_count;
        }
      }
      if (run.run_type === 'paper' || run.run_type === 'shadow') {
        hasPaperRun = true;
      }
    }

    const avgPF = totalTrades > 0 ? weightedPF / totalTrades : 0;

    // Validate promotion requirements
    const errors: string[] = [];

    if (totalTrades < rules.minTrades) {
      errors.push(`Minimum ${rules.minTrades} trades required (current: ${totalTrades})`);
    }

    if (avgPF < rules.minPF) {
      errors.push(`Minimum Profit Factor ${rules.minPF} required (current: ${avgPF.toFixed(2)})`);
    }

    if (maxDD > rules.maxDD) {
      errors.push(`Maximum drawdown $${rules.maxDD} exceeded (current: $${maxDD.toFixed(2)})`);
    }

    if (rules.requiresPaperHistory && !hasPaperRun) {
      errors.push('Paper/shadow trading history required before live promotion');
    }

    if (errors.length > 0) {
      return new Response(JSON.stringify({ 
        error: 'Promotion requirements not met',
        details: errors,
        metrics: { totalTrades, avgPF, maxDD, hasPaperRun },
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Update bot version status and lifecycle_status
    const { error: updateError } = await supabase
      .from('bot_versions')
      .update({ 
        status: target,
        lifecycle_status: STATUS_TO_LIFECYCLE[target] || 'DRAFT'
      })
      .eq('id', bot_version_id);

    if (updateError) throw updateError;

    // Log the promotion
    await supabase.from('logs').insert({
      run_id: null,
      level: 'info',
      category: 'system',
      message: `Bot version promoted to ${target}`,
      payload_json: JSON.stringify({
        bot_version_id,
        from_status: botVersion.status,
        to_status: target,
        metrics: { totalTrades, avgPF, maxDD, hasPaperRun },
      }),
    });

    console.log(`Successfully promoted bot version ${bot_version_id} to ${target}`);

    return new Response(JSON.stringify({
      success: true,
      bot_version_id,
      new_status: target,
      metrics: { totalTrades, avgPF, maxDD, hasPaperRun },
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('Error promoting bot:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
