import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AIApplyRequest {
  advice_id: string;
  max_param_changes?: number;
}

function generateHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).substring(0, 8);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { advice_id, max_param_changes = 3 } = await req.json() as AIApplyRequest;

    if (!advice_id) {
      return new Response(JSON.stringify({ error: 'advice_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Applying AI advice ${advice_id} with max ${max_param_changes} param changes`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch the advice
    const { data: advice, error: adviceError } = await supabase
      .from('ai_advice')
      .select('*')
      .eq('id', advice_id)
      .single();

    if (adviceError || !advice) {
      throw new Error('Advice not found');
    }

    if (advice.applied) {
      return new Response(JSON.stringify({ error: 'Advice has already been applied' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Parse recommendations
    const recommendations = advice.recommendations_json 
      ? JSON.parse(advice.recommendations_json) 
      : {};
    
    const paramChanges = recommendations.parameter_changes || [];
    const riskActions = recommendations.risk_actions || [];

    if (paramChanges.length === 0 && riskActions.length === 0) {
      return new Response(JSON.stringify({ error: 'No changes to apply' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch the bot version
    const { data: botVersion, error: versionError } = await supabase
      .from('bot_versions')
      .select('*, bots(*, strategy_templates(*))')
      .eq('id', advice.bot_version_id)
      .single();

    if (versionError || !botVersion) {
      throw new Error('Bot version not found');
    }

    const currentParams = JSON.parse(botVersion.params_json || '{}');
    const currentRiskLimits = JSON.parse(botVersion.risk_limits_json || '{}');
    const templateSchema = botVersion.bots?.strategy_templates?.param_schema_json 
      ? JSON.parse(botVersion.bots.strategy_templates.param_schema_json) 
      : null;

    // Validate and apply param changes
    const newParams = { ...currentParams };
    const appliedChanges: Array<{ param: string; from: any; to: any }> = [];
    const rejectedChanges: Array<{ param: string; reason: string }> = [];

    for (const change of paramChanges.slice(0, max_param_changes)) {
      const paramDef = templateSchema?.params?.find((p: any) => p.key === change.param);
      
      if (!paramDef) {
        rejectedChanges.push({ param: change.param, reason: 'Parameter not found in schema' });
        continue;
      }

      // Validate range for numeric params
      if (paramDef.type === 'int' || paramDef.type === 'float') {
        const newValue = Number(change.to);
        if (paramDef.min !== undefined && newValue < paramDef.min) {
          rejectedChanges.push({ param: change.param, reason: `Value ${newValue} below min ${paramDef.min}` });
          continue;
        }
        if (paramDef.max !== undefined && newValue > paramDef.max) {
          rejectedChanges.push({ param: change.param, reason: `Value ${newValue} above max ${paramDef.max}` });
          continue;
        }
        newParams[change.param] = newValue;
      } else if (paramDef.type === 'enum') {
        if (paramDef.values && !paramDef.values.includes(change.to)) {
          rejectedChanges.push({ param: change.param, reason: `Value ${change.to} not in allowed values` });
          continue;
        }
        newParams[change.param] = change.to;
      } else if (paramDef.type === 'bool') {
        newParams[change.param] = Boolean(change.to);
      } else {
        newParams[change.param] = change.to;
      }

      appliedChanges.push({ param: change.param, from: currentParams[change.param], to: newParams[change.param] });
    }

    // Apply risk actions
    const newRiskLimits = { ...currentRiskLimits };
    for (const action of riskActions) {
      switch (action.action) {
        case 'tighten_dd':
          newRiskLimits.max_drawdown_usd = Math.max(50, (newRiskLimits.max_drawdown_usd || 200) * 0.8);
          break;
        case 'raise_cooldown':
          newRiskLimits.cooldown_minutes_after_loss = Math.min(60, (newRiskLimits.cooldown_minutes_after_loss || 15) + 10);
          break;
        case 'reduce_size':
          newRiskLimits.max_position_size_usd = Math.max(500, (newRiskLimits.max_position_size_usd || 2000) * 0.8);
          break;
      }
    }

    // Get next version number
    const { data: maxVersionData } = await supabase
      .from('bot_versions')
      .select('version_number')
      .eq('bot_id', botVersion.bot_id)
      .order('version_number', { ascending: false })
      .limit(1)
      .single();

    const newVersionNumber = (maxVersionData?.version_number || 0) + 1;

    // Create new bot version
    const paramsJson = JSON.stringify(newParams);
    const riskLimitsJson = JSON.stringify(newRiskLimits);
    const paramsHash = generateHash(paramsJson);
    const versionHash = generateHash(`${botVersion.bots?.template_id}_${paramsJson}_${riskLimitsJson}`);

    const { data: newVersion, error: createError } = await supabase
      .from('bot_versions')
      .insert({
        bot_id: botVersion.bot_id,
        version_number: newVersionNumber,
        params_json: paramsJson,
        params_hash: paramsHash,
        risk_limits_json: riskLimitsJson,
        version_hash: versionHash,
        status: 'draft', // Always starts as draft
      })
      .select()
      .single();

    if (createError) throw createError;

    // Mark advice as applied
    await supabase
      .from('ai_advice')
      .update({
        applied: true,
        applied_bot_version_id: newVersion.id,
      })
      .eq('id', advice_id);

    // Log the application
    await supabase.from('logs').insert({
      run_id: null,
      level: 'info',
      category: 'ai',
      message: `AI advice applied - created bot version v${newVersionNumber}`,
      payload_json: JSON.stringify({
        advice_id,
        source_version_id: advice.bot_version_id,
        new_version_id: newVersion.id,
        applied_changes: appliedChanges,
        rejected_changes: rejectedChanges,
      }),
    });

    console.log(`Created new bot version v${newVersionNumber} with ${appliedChanges.length} param changes`);

    return new Response(JSON.stringify({
      success: true,
      new_bot_version_id: newVersion.id,
      new_version_number: newVersionNumber,
      applied_changes: appliedChanges,
      rejected_changes: rejectedChanges,
      status: 'draft',
      message: 'New version created as draft. Run backtest before promotion.',
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('Error applying AI advice:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
