import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AIAdviceRequest {
  bot_version_id: string;
  run_id?: string;
  window: '1h' | '1d' | '7d';
  goal: 'pf' | 'dd' | 'fees' | 'execution';
  include_logs?: boolean;
}

const SYSTEM_PROMPT = `You are an expert trading strategy advisor for an automated trading bot lab. Your role is to analyze trading performance and provide actionable recommendations.

You MUST respond with ONLY valid JSON matching this exact schema:
{
  "summary": "string, 1-2 lines summarizing the analysis",
  "primary_metric": "profit_factor",
  "current_metrics": {
    "profit_factor": number,
    "net_pnl_usd": number,
    "gross_profit": number,
    "gross_loss": number,
    "max_drawdown": number,
    "trades_count": number,
    "fees_paid": number,
    "slippage_est": number
  },
  "recommendations": [
    {"priority": 1, "title": "string", "why": "string", "risk": "string", "expected_impact": "low|med|high"}
  ],
  "parameter_changes": [
    {"param": "string", "from": value, "to": value, "reason": "string"}
  ],
  "risk_actions": [
    {"action": "tighten_dd|raise_cooldown|reduce_size|pause_recommended|no_change", "reason": "string"}
  ],
  "tests_required": [
    {"test": "oos_split|friction_sweep|walk_forward|session_filter", "details": "string"}
  ],
  "confidence": number between 0 and 1,
  "do_not_do": ["string"]
}

Key rules:
- Focus on the user's specified goal (improve PF, reduce drawdown, reduce fees, or diagnose execution)
- Keep parameter changes within template schema ranges
- Maximum 3 parameter changes per recommendation
- Always suggest required tests before live deployment
- Be conservative with confidence scores
- Never recommend live trading without paper/shadow validation`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { bot_version_id, run_id, window, goal, include_logs = true } = await req.json() as AIAdviceRequest;

    if (!bot_version_id) {
      return new Response(JSON.stringify({ error: 'bot_version_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Generating AI advice for bot version ${bot_version_id}, goal: ${goal}, window: ${window}`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    
    if (!lovableApiKey) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch bot version with template
    const { data: botVersion, error: versionError } = await supabase
      .from('bot_versions')
      .select('*, bots(*, strategy_templates(*))')
      .eq('id', bot_version_id)
      .single();

    if (versionError || !botVersion) {
      throw new Error('Bot version not found');
    }

    const params = JSON.parse(botVersion.params_json || '{}');
    const riskLimits = JSON.parse(botVersion.risk_limits_json || '{}');
    const templateSchema = botVersion.bots?.strategy_templates?.param_schema_json 
      ? JSON.parse(botVersion.bots.strategy_templates.param_schema_json) 
      : null;

    // Fetch runs and metrics
    const { data: runs } = await supabase
      .from('runs')
      .select('*, run_metrics(*)')
      .eq('bot_version_id', bot_version_id)
      .eq('status', 'done')
      .order('created_at', { ascending: false })
      .limit(10);

    // Aggregate metrics
    let totalTrades = 0;
    let totalPnL = 0;
    let totalGrossProfit = 0;
    let totalGrossLoss = 0;
    let maxDD = 0;
    let totalFees = 0;
    let totalSlippage = 0;
    let weightedPF = 0;

    for (const run of runs || []) {
      if (run.run_metrics) {
        totalTrades += run.run_metrics.trades_count || 0;
        totalPnL += parseFloat(run.run_metrics.net_pnl_usd) || 0;
        totalGrossProfit += parseFloat(run.run_metrics.gross_profit) || 0;
        totalGrossLoss += parseFloat(run.run_metrics.gross_loss) || 0;
        maxDD = Math.max(maxDD, parseFloat(run.run_metrics.max_drawdown) || 0);
        totalFees += parseFloat(run.run_metrics.fees_paid) || 0;
        totalSlippage += parseFloat(run.run_metrics.slippage_est) || 0;
        if (run.run_metrics.profit_factor && run.run_metrics.trades_count) {
          weightedPF += run.run_metrics.profit_factor * run.run_metrics.trades_count;
        }
      }
    }

    const avgPF = totalTrades > 0 ? weightedPF / totalTrades : 0;

    // Fetch recent logs if requested
    let logsContext = '';
    if (include_logs) {
      const windowHours = window === '1h' ? 1 : window === '1d' ? 24 : 168;
      const cutoffTime = new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString();
      
      const { data: logs } = await supabase
        .from('logs')
        .select('*')
        .gte('ts', cutoffTime)
        .order('ts', { ascending: false })
        .limit(50);

      if (logs && logs.length > 0) {
        const errorCount = logs.filter(l => l.level === 'error').length;
        const warnCount = logs.filter(l => l.level === 'warn').length;
        logsContext = `\nRecent logs (${window}): ${logs.length} entries, ${errorCount} errors, ${warnCount} warnings.`;
        if (errorCount > 0) {
          logsContext += `\nSample errors: ${logs.filter(l => l.level === 'error').slice(0, 3).map(l => l.message).join('; ')}`;
        }
      }
    }

    // Build the context for AI
    const goalDescriptions: Record<string, string> = {
      pf: 'Improve Profit Factor',
      dd: 'Reduce Maximum Drawdown',
      fees: 'Reduce Fees and Slippage Impact',
      execution: 'Diagnose and Fix Execution Issues',
    };

    const userPrompt = `Analyze this trading bot and provide recommendations.

**Goal:** ${goalDescriptions[goal]}

**Current Bot Configuration:**
- Template: ${botVersion.bots?.strategy_templates?.name || 'Unknown'}
- Status: ${botVersion.status}
- Version: ${botVersion.version_number}

**Current Parameters:**
${JSON.stringify(params, null, 2)}

**Risk Limits:**
${JSON.stringify(riskLimits, null, 2)}

**Template Parameter Schema (allowed ranges):**
${templateSchema ? JSON.stringify(templateSchema.params, null, 2) : 'Not available'}

**Aggregated Performance (${runs?.length || 0} completed runs):**
- Total Trades: ${totalTrades}
- Net PnL: $${totalPnL.toFixed(2)}
- Gross Profit: $${totalGrossProfit.toFixed(2)}
- Gross Loss: $${totalGrossLoss.toFixed(2)}
- Avg Profit Factor: ${avgPF.toFixed(2)}
- Max Drawdown: $${maxDD.toFixed(2)}
- Total Fees: $${totalFees.toFixed(2)}
- Total Slippage: $${totalSlippage.toFixed(2)}
${logsContext}

Provide your analysis as valid JSON matching the required schema. Remember:
- Maximum 3 parameter changes
- All changes must be within template schema ranges
- Suggest required tests before live deployment`;

    // Call Lovable AI Gateway
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI Gateway error:', aiResponse.status, errorText);
      
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: 'AI credits exhausted. Please add credits.' }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      throw new Error('AI gateway error');
    }

    const aiData = await aiResponse.json();
    const aiContent = aiData.choices?.[0]?.message?.content || '';

    // Parse AI response
    let parsedAdvice;
    try {
      // Try to extract JSON from the response
      const jsonMatch = aiContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsedAdvice = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseError) {
      console.error('Failed to parse AI response:', aiContent);
      parsedAdvice = {
        summary: 'Unable to generate structured advice. Please try again.',
        recommendations: [],
        parameter_changes: [],
        risk_actions: [],
        tests_required: [],
        confidence: 0,
        do_not_do: [],
      };
    }

    // Store advice in database
    const { data: advice, error: insertError } = await supabase
      .from('ai_advice')
      .insert({
        bot_version_id,
        run_id: run_id || null,
        advice_window: window,
        goal,
        summary: parsedAdvice.summary || '',
        recommendations_json: JSON.stringify(parsedAdvice),
        confidence: parsedAdvice.confidence || 0,
        applied: false,
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error storing advice:', insertError);
    }

    // Log the AI call
    await supabase.from('logs').insert({
      run_id: run_id || null,
      level: 'info',
      category: 'ai',
      message: `AI advice generated for bot version ${bot_version_id}`,
      payload_json: JSON.stringify({
        advice_id: advice?.id,
        goal,
        window,
        confidence: parsedAdvice.confidence,
      }),
    });

    console.log('AI advice generated successfully');

    return new Response(JSON.stringify({
      success: true,
      advice_id: advice?.id,
      summary: parsedAdvice.summary,
      recommendations: parsedAdvice.recommendations || [],
      parameter_changes: parsedAdvice.parameter_changes || [],
      risk_actions: parsedAdvice.risk_actions || [],
      tests_required: parsedAdvice.tests_required || [],
      confidence: parsedAdvice.confidence || 0,
      do_not_do: parsedAdvice.do_not_do || [],
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('Error generating AI advice:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
