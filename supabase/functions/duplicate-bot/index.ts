import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TweakPlan {
  param: string;
  variations: (number | string | boolean)[];
}

interface DuplicateBotRequest {
  bot_version_id: string;
  count: number;
  tweak_plan?: TweakPlan[];
  experiment_name?: string;
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
    const { bot_version_id, count, tweak_plan, experiment_name } = await req.json() as DuplicateBotRequest;

    if (!bot_version_id || !count || count < 1) {
      return new Response(JSON.stringify({ error: 'bot_version_id and count are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Duplicating bot version ${bot_version_id} into ${count} variants`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch the source bot version
    const { data: sourceVersion, error: fetchError } = await supabase
      .from('bot_versions')
      .select('*, bots(*)')
      .eq('id', bot_version_id)
      .single();

    if (fetchError || !sourceVersion) {
      throw new Error('Source bot version not found');
    }

    const sourceParams = JSON.parse(sourceVersion.params_json);
    const sourceRiskLimits = JSON.parse(sourceVersion.risk_limits_json);
    const bot = sourceVersion.bots;

    // Get current max version number for this bot
    const { data: maxVersionData } = await supabase
      .from('bot_versions')
      .select('version_number')
      .eq('bot_id', bot.id)
      .order('version_number', { ascending: false })
      .limit(1)
      .single();

    let nextVersion = (maxVersionData?.version_number || 0) + 1;
    const newVersionIds: string[] = [];

    // Create N new versions
    for (let i = 0; i < count; i++) {
      let newParams = { ...sourceParams };

      // Apply tweak plan if provided
      if (tweak_plan && tweak_plan.length > 0) {
        for (const tweak of tweak_plan) {
          if (tweak.variations.length > i) {
            newParams[tweak.param] = tweak.variations[i];
          } else if (tweak.variations.length > 0) {
            // Cycle through variations
            newParams[tweak.param] = tweak.variations[i % tweak.variations.length];
          }
        }
      }

      const paramsJson = JSON.stringify(newParams);
      const paramsHash = generateHash(paramsJson);
      const versionHash = generateHash(`${bot.template_id}_${paramsJson}_${JSON.stringify(sourceRiskLimits)}`);

      const { data: newVersion, error: insertError } = await supabase
        .from('bot_versions')
        .insert({
          bot_id: bot.id,
          version_number: nextVersion + i,
          params_json: paramsJson,
          params_hash: paramsHash,
          risk_limits_json: sourceVersion.risk_limits_json,
          version_hash: versionHash,
          status: 'draft',
        })
        .select()
        .single();

      if (insertError) throw insertError;
      
      newVersionIds.push(newVersion.id);
      console.log(`Created variant ${i + 1}: version ${nextVersion + i}`);
    }

    // Log the experiment creation
    await supabase.from('logs').insert({
      run_id: null,
      level: 'info',
      category: 'system',
      message: `Created experiment with ${count} variants from bot version ${bot_version_id}`,
      payload_json: JSON.stringify({
        source_version_id: bot_version_id,
        new_version_ids: newVersionIds,
        tweak_plan,
        experiment_name,
      }),
    });

    return new Response(JSON.stringify({
      success: true,
      source_version_id: bot_version_id,
      new_version_ids: newVersionIds,
      bot_id: bot.id,
      experiment_name: experiment_name || `Experiment ${new Date().toISOString().split('T')[0]}`,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('Error duplicating bot:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
