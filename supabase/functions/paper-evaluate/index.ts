import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PaperEvaluateRequest {
  deployment_id: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { deployment_id } = await req.json() as PaperEvaluateRequest;

    console.log(`Evaluating paper deployment: ${deployment_id}`);

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch deployment with pass criteria
    const { data: deployment, error: deployError } = await supabase
      .from('paper_deployments')
      .select('*')
      .eq('id', deployment_id)
      .single();

    if (deployError || !deployment) throw new Error('Deployment not found');

    const passCriteria = deployment.pass_criteria || {
      max_dd: 0.1,
      max_daily_loss: 500,
      min_trades: 5
    };

    // Fetch all daily metrics
    const { data: dailyMetrics, error: metricsError } = await supabase
      .from('paper_metrics_daily')
      .select('*')
      .eq('deployment_id', deployment_id)
      .order('date', { ascending: true });

    if (metricsError) throw metricsError;

    // Fetch all position snapshots for drawdown calc
    const { data: snapshots, error: snapshotsError } = await supabase
      .from('paper_positions_snapshots')
      .select('equity, ts')
      .eq('deployment_id', deployment_id)
      .order('ts', { ascending: true });

    if (snapshotsError) throw snapshotsError;

    // Calculate aggregate metrics
    const totalTrades = (dailyMetrics || []).reduce((sum, d) => sum + d.trades_count, 0);
    const totalPnl = (dailyMetrics || []).reduce((sum, d) => sum + d.pnl, 0);
    
    // Max drawdown from snapshots
    let peak = 0;
    let maxDrawdown = 0;
    for (const snap of (snapshots || [])) {
      if (snap.equity > peak) peak = snap.equity;
      const dd = peak > 0 ? (peak - snap.equity) / peak : 0;
      if (dd > maxDrawdown) maxDrawdown = dd;
    }

    // Check daily loss breaches
    const dailyLossBreaches = (dailyMetrics || []).filter(d => d.pnl < -passCriteria.max_daily_loss);

    // Evaluate pass/fail
    const evaluationResults = {
      total_trades: totalTrades,
      total_pnl: totalPnl,
      max_drawdown: maxDrawdown,
      days_with_loss_breach: dailyLossBreaches.length,
      checks: {
        min_trades: {
          required: passCriteria.min_trades,
          actual: totalTrades,
          passed: totalTrades >= passCriteria.min_trades
        },
        max_drawdown: {
          required: passCriteria.max_dd,
          actual: maxDrawdown,
          passed: maxDrawdown <= passCriteria.max_dd
        },
        daily_loss_limit: {
          required: passCriteria.max_daily_loss,
          breaches: dailyLossBreaches.length,
          passed: dailyLossBreaches.length === 0
        },
        profitable: {
          required: true,
          actual: totalPnl > 0,
          passed: totalPnl > 0
        }
      }
    };

    const allChecksPassed = Object.values(evaluationResults.checks).every(c => c.passed);
    
    let rejectReason = null;
    if (!allChecksPassed) {
      const failedChecks = Object.entries(evaluationResults.checks)
        .filter(([_, v]) => !v.passed)
        .map(([k, _]) => k);
      rejectReason = `Failed checks: ${failedChecks.join(', ')}`;
    }

    // Update deployment
    await supabase
      .from('paper_deployments')
      .update({
        status: 'completed',
        ended_at: new Date().toISOString(),
        passed: allChecksPassed,
        reject_reason: rejectReason,
        result_summary: evaluationResults
      })
      .eq('id', deployment_id);

    // Update bot version lifecycle
    const newLifecycle = allChecksPassed ? 'LIVE_READY' : 'REJECTED';
    await supabase
      .from('bot_versions')
      .update({ lifecycle_status: newLifecycle })
      .eq('id', deployment.bot_version_id);

    // Update live_candidate
    await supabase
      .from('live_candidates')
      .update({
        approved: allChecksPassed,
        approved_at: allChecksPassed ? new Date().toISOString() : null,
        reject_reason: rejectReason
      })
      .eq('version_id', deployment.bot_version_id);

    // Log result
    await supabase.from('logs').insert({
      run_id: null,
      level: allChecksPassed ? 'info' : 'warn',
      category: 'execution',
      message: `Paper trading ${allChecksPassed ? 'PASSED' : 'FAILED'} for deployment ${deployment_id}`,
      payload_json: JSON.stringify(evaluationResults)
    });

    return new Response(JSON.stringify({
      success: true,
      deployment_id,
      passed: allChecksPassed,
      reject_reason: rejectReason,
      evaluation: evaluationResults
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in paper-evaluate:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
