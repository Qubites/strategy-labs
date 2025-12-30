import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface FetchBarsRequest {
  symbol: string;
  timeframe: string;
  start: string;
  end: string;
  provider?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { symbol, timeframe, start, end, provider = 'alpaca' } = await req.json() as FetchBarsRequest;

    console.log(`Fetching bars for ${symbol} ${timeframe} from ${start} to ${end}`);

    const ALPACA_API_KEY = Deno.env.get('ALPACA_API_KEY');
    const ALPACA_SECRET_KEY = Deno.env.get('ALPACA_SECRET_KEY');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    if (!ALPACA_API_KEY || !ALPACA_SECRET_KEY) {
      throw new Error('Alpaca API keys not configured');
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Create a job record
    const { data: job, error: jobError } = await supabase
      .from('market_data_jobs')
      .insert({
        symbol,
        timeframe,
        start_ts: start,
        end_ts: end,
        status: 'running'
      })
      .select()
      .single();

    if (jobError) {
      console.error('Error creating job:', jobError);
      throw new Error('Failed to create job record');
    }

    // Map timeframe to Alpaca format
    const timeframeMap: Record<string, string> = {
      '1m': '1Min',
      '5m': '5Min',
      '15m': '15Min',
      '1h': '1Hour',
      '1d': '1Day',
      '1Min': '1Min',
      '5Min': '5Min',
      '15Min': '15Min',
      '1Hour': '1Hour',
      '1Day': '1Day',
    };
    
    const alpacaTimeframe = timeframeMap[timeframe] || '1Min';

    // Fetch from Alpaca Market Data API
    const alpacaUrl = `https://data.alpaca.markets/v2/stocks/${symbol}/bars?timeframe=${alpacaTimeframe}&start=${start}&end=${end}&limit=10000&adjustment=split`;
    
    console.log(`Calling Alpaca API: ${alpacaUrl}`);

    const alpacaResponse = await fetch(alpacaUrl, {
      headers: {
        'APCA-API-KEY-ID': ALPACA_API_KEY,
        'APCA-API-SECRET-KEY': ALPACA_SECRET_KEY,
      },
    });

    if (!alpacaResponse.ok) {
      const errorText = await alpacaResponse.text();
      console.error('Alpaca API error:', alpacaResponse.status, errorText);
      
      await supabase
        .from('market_data_jobs')
        .update({ status: 'failed', error: errorText, finished_at: new Date().toISOString() })
        .eq('id', job.id);
      
      throw new Error(`Alpaca API error: ${alpacaResponse.status} - ${errorText}`);
    }

    const alpacaData = await alpacaResponse.json();
    const bars = alpacaData.bars || [];

    console.log(`Received ${bars.length} bars from Alpaca`);

    if (bars.length > 0) {
      // Transform bars to our format
      const marketBars = bars.map((bar: any) => ({
        symbol,
        timeframe,
        ts: bar.t,
        o: bar.o,
        h: bar.h,
        l: bar.l,
        c: bar.c,
        v: bar.v,
      }));

      // Upsert bars (on conflict update)
      const { error: insertError } = await supabase
        .from('market_bars')
        .upsert(marketBars, { onConflict: 'symbol,timeframe,ts' });

      if (insertError) {
        console.error('Error inserting bars:', insertError);
        throw new Error('Failed to insert bars');
      }
    }

    // Update job as completed
    await supabase
      .from('market_data_jobs')
      .update({ 
        status: 'completed', 
        bar_count: bars.length,
        finished_at: new Date().toISOString() 
      })
      .eq('id', job.id);

    return new Response(JSON.stringify({
      success: true,
      job_id: job.id,
      bar_count: bars.length,
      symbol,
      timeframe,
      start,
      end,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in fetch-bars:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
