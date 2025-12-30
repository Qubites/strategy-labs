import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface FetchBarsRequest {
  symbol: string;
  timeframe: string;
  session?: string; // RTH, EXT, or ALL
  start: string;
  end: string;
  provider?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { symbol, timeframe, session = 'ALL', start, end, provider = 'alpaca' } = await req.json() as FetchBarsRequest;

    console.log(`Fetching bars for ${symbol} ${timeframe} (session: ${session}) from ${start} to ${end}`);

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

    // Fetch from Alpaca Market Data API with pagination
    let allBars: any[] = [];
    let pageToken: string | null = null;
    let pageCount = 0;

    do {
      let alpacaUrl = `https://data.alpaca.markets/v2/stocks/${symbol}/bars?timeframe=${alpacaTimeframe}&start=${start}&end=${end}&limit=10000&adjustment=split`;
      if (pageToken) {
        alpacaUrl += `&page_token=${pageToken}`;
      }
      
      console.log(`Calling Alpaca API (page ${pageCount + 1}): ${alpacaUrl.split('&page_token')[0]}...`);

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
      
      console.log(`Page ${pageCount + 1}: Received ${bars.length} bars`);
      
      allBars = allBars.concat(bars);
      pageToken = alpacaData.next_page_token || null;
      pageCount++;
      
    } while (pageToken);

    console.log(`Total bars fetched from Alpaca: ${allBars.length} across ${pageCount} page(s)`);

    // Filter bars by session if not ALL
    let filteredBars = allBars;
    if (session !== 'ALL') {
      filteredBars = allBars.filter((bar: any) => {
        const barTime = new Date(bar.t);
        const hours = barTime.getUTCHours();
        const minutes = barTime.getUTCMinutes();
        const timeInMinutes = hours * 60 + minutes;
        
        // RTH: 9:30 AM - 4:00 PM ET (14:30 - 21:00 UTC during EST, 13:30 - 20:00 during EDT)
        // Using approximate UTC times that cover both EST/EDT
        // Pre-market: 4:00 AM - 9:30 AM ET (9:00 - 14:30 UTC)
        // After-hours: 4:00 PM - 8:00 PM ET (21:00 - 1:00 UTC)
        
        // For simplicity, we'll use the bar's local market time
        // Alpaca returns timestamps in UTC, market opens at 9:30 ET
        // 9:30 ET = 14:30 UTC (winter) or 13:30 UTC (summer)
        // 4:00 PM ET = 21:00 UTC (winter) or 20:00 UTC (summer)
        
        // RTH window in UTC minutes (using conservative window that works for both EST/EDT)
        const rthStart = 13 * 60 + 30; // 13:30 UTC (covers DST)
        const rthEnd = 21 * 60;         // 21:00 UTC
        
        if (session === 'RTH') {
          return timeInMinutes >= rthStart && timeInMinutes < rthEnd;
        } else if (session === 'EXT') {
          return timeInMinutes < rthStart || timeInMinutes >= rthEnd;
        }
        return true;
      });
      console.log(`Filtered to ${filteredBars.length} bars for session: ${session}`);
    }

    if (filteredBars.length > 0) {
      // Transform bars to our format
      const marketBars = filteredBars.map((bar: any) => ({
        symbol,
        timeframe,
        ts: bar.t,
        o: bar.o,
        h: bar.h,
        l: bar.l,
        c: bar.c,
        v: bar.v,
      }));

      // Insert in batches of 1000 to avoid timeouts
      const BATCH_SIZE = 1000;
      for (let i = 0; i < marketBars.length; i += BATCH_SIZE) {
        const batch = marketBars.slice(i, i + BATCH_SIZE);
        const { error: insertError } = await supabase
          .from('market_bars')
          .upsert(batch, { onConflict: 'symbol,timeframe,ts' });

        if (insertError) {
          console.error(`Error inserting batch ${Math.floor(i / BATCH_SIZE) + 1}:`, insertError);
          throw new Error('Failed to insert bars');
        }
        console.log(`Inserted batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(marketBars.length / BATCH_SIZE)}`);
      }
    }

    // Update job as completed
    await supabase
      .from('market_data_jobs')
      .update({ 
        status: 'completed', 
        bar_count: filteredBars.length,
        finished_at: new Date().toISOString() 
      })
      .eq('id', job.id);

    return new Response(JSON.stringify({
      success: true,
      job_id: job.id,
      bar_count: filteredBars.length,
      symbol,
      timeframe,
      session,
      start,
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
