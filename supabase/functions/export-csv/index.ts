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
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { symbol, timeframe, start, end } = await req.json() as ExportCsvRequest;

    console.log(`Exporting CSV for ${symbol} ${timeframe} from ${start} to ${end}`);

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch bars from database
    const { data: bars, error } = await supabase
      .from('market_bars')
      .select('ts, o, h, l, c, v')
      .eq('symbol', symbol)
      .eq('timeframe', timeframe)
      .gte('ts', start)
      .lte('ts', end)
      .order('ts', { ascending: true });

    if (error) {
      console.error('Error fetching bars:', error);
      throw new Error('Failed to fetch bars');
    }

    if (!bars || bars.length === 0) {
      return new Response(JSON.stringify({ 
        error: 'No data found for the specified range. Please fetch data first.' 
      }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Generate CSV
    const header = 'timestamp,open,high,low,close,volume';
    const rows = bars.map(bar => 
      `${bar.ts},${bar.o},${bar.h},${bar.l},${bar.c},${bar.v}`
    );
    const csv = [header, ...rows].join('\n');

    // Return CSV as downloadable file
    return new Response(csv, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${symbol}_${timeframe}_${start}_${end}.csv"`,
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
