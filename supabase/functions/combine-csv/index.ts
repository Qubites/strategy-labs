import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface DatasetQuery {
  symbol: string;
  timeframe: string;
  start: string;
  end: string;
}

interface CombineCsvRequest {
  datasets: DatasetQuery[];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { datasets } = await req.json() as CombineCsvRequest;

    if (!datasets || datasets.length === 0) {
      return new Response(JSON.stringify({ error: 'No datasets provided' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Combining ${datasets.length} datasets into single CSV`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const allBars: any[] = [];

    // Fetch bars for each dataset
    for (const ds of datasets) {
      console.log(`Fetching bars for ${ds.symbol} ${ds.timeframe} from ${ds.start} to ${ds.end}`);
      
      let offset = 0;
      const limit = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data: bars, error } = await supabase
          .from('market_bars')
          .select('*')
          .eq('symbol', ds.symbol)
          .eq('timeframe', ds.timeframe)
          .gte('ts', ds.start)
          .lte('ts', ds.end)
          .order('ts', { ascending: true })
          .range(offset, offset + limit - 1);

        if (error) {
          console.error(`Error fetching bars for ${ds.symbol}:`, error);
          throw error;
        }

        if (bars && bars.length > 0) {
          allBars.push(...bars.map(bar => ({
            ...bar,
            dataset_symbol: ds.symbol,
            dataset_timeframe: ds.timeframe,
          })));
          offset += limit;
          hasMore = bars.length === limit;
        } else {
          hasMore = false;
        }
      }
    }

    console.log(`Total bars collected: ${allBars.length}`);

    if (allBars.length === 0) {
      return new Response(JSON.stringify({ error: 'No bars found for the selected datasets' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Sort all bars by timestamp
    allBars.sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());

    // Generate CSV
    const header = 'symbol,timeframe,timestamp,open,high,low,close,volume';
    const rows = allBars.map(bar => 
      `${bar.symbol},${bar.timeframe},${bar.ts},${bar.o},${bar.h},${bar.l},${bar.c},${bar.v}`
    );
    
    const csv = [header, ...rows].join('\n');

    console.log(`Generated CSV with ${rows.length} rows`);

    return new Response(csv, {
      headers: { 
        ...corsHeaders, 
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="combined_datasets_${new Date().toISOString().split('T')[0]}.csv"`,
      },
    });
  } catch (error: unknown) {
    console.error('Error combining CSVs:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
