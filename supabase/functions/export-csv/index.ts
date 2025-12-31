import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ExportCsvRequest {
  symbol: string;
  timeframe: string;
  start: string;
  end: string;
  session?: string; // ALL, RTH, EXT
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { symbol, timeframe, start, end, session = 'ALL' } = await req.json() as ExportCsvRequest;

    console.log(`Exporting CSV for ${symbol} ${timeframe} (${session}) from ${start} to ${end}`);

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch ALL bars using pagination (no 1000 row limit)
    const PAGE_SIZE = 1000;
    let allBars: any[] = [];
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const { data: bars, error } = await supabase
        .from('market_bars')
        .select('ts, o, h, l, c, v')
        .eq('symbol', symbol)
        .eq('timeframe', timeframe)
        .gte('ts', start)
        .lte('ts', end)
        .order('ts', { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1);

      if (error) {
        console.error('Error fetching bars:', error);
        throw new Error('Failed to fetch bars');
      }

      if (!bars || bars.length === 0) {
        hasMore = false;
      } else {
        allBars = allBars.concat(bars);
        offset += PAGE_SIZE;
        hasMore = bars.length === PAGE_SIZE;
      }
    }

    console.log(`Fetched ${allBars.length} total bars`);

    if (allBars.length === 0) {
      return new Response(JSON.stringify({ 
        error: 'No data found for the specified range. Please fetch data first.' 
      }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Filter by session if not ALL
    let filteredBars = allBars;
    if (session !== 'ALL') {
      filteredBars = allBars.filter((bar: any) => {
        const barTime = new Date(bar.ts);
        const hours = barTime.getUTCHours();
        const minutes = barTime.getUTCMinutes();
        const timeInMinutes = hours * 60 + minutes;
        
        // RTH: 13:30 - 21:00 UTC (covers EST/EDT)
        const rthStart = 13 * 60 + 30;
        const rthEnd = 21 * 60;
        
        if (session === 'RTH') {
          return timeInMinutes >= rthStart && timeInMinutes < rthEnd;
        } else if (session === 'EXT') {
          return timeInMinutes < rthStart || timeInMinutes >= rthEnd;
        }
        return true;
      });
      console.log(`Filtered to ${filteredBars.length} bars for session: ${session}`);
    }

    // Generate CSV
    const header = 'timestamp,open,high,low,close,volume';
    const rows = filteredBars.map(bar => 
      `${bar.ts},${bar.o},${bar.h},${bar.l},${bar.c},${bar.v}`
    );
    const csv = [header, ...rows].join('\n');

    // Return CSV as downloadable file
    return new Response(csv, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${symbol}_${timeframe}_${session}_${start}_${end}.csv"`,
      },
    });
  } catch (error) {
    console.error('Error in export-csv:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
