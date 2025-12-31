import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { MainLayout } from '@/components/layout/MainLayout';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { MetricCard } from '@/components/ui/metric-card';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import {
  ArrowLeft,
  Download,
  FileDown,
  Database,
  Clock,
  BarChart3,
  Calendar,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import type { Dataset } from '@/types/trading';

interface MarketBar {
  ts: string;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export default function DatasetDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [previewBars, setPreviewBars] = useState<{ first: MarketBar[]; last: MarketBar[] }>({ first: [], last: [] });
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<string | null>(null);

  useEffect(() => {
    if (id) loadDataset();
  }, [id]);

  async function loadDataset() {
    try {
      const { data, error } = await supabase
        .from('datasets')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      setDataset(data);

      // Load preview bars (first 5 and last 5)
      if (data) {
        const [firstBars, lastBars] = await Promise.all([
          supabase
            .from('market_bars')
            .select('ts, o, h, l, c, v')
            .eq('symbol', data.symbol)
            .eq('timeframe', data.timeframe)
            .gte('ts', data.start_ts)
            .lte('ts', data.end_ts)
            .order('ts', { ascending: true })
            .limit(5),
          supabase
            .from('market_bars')
            .select('ts, o, h, l, c, v')
            .eq('symbol', data.symbol)
            .eq('timeframe', data.timeframe)
            .gte('ts', data.start_ts)
            .lte('ts', data.end_ts)
            .order('ts', { ascending: false })
            .limit(5),
        ]);

        setPreviewBars({
          first: firstBars.data || [],
          last: (lastBars.data || []).reverse(),
        });
      }
    } catch (error) {
      console.error('Error loading dataset:', error);
      toast.error('Failed to load dataset');
    } finally {
      setLoading(false);
    }
  }

  async function handleExport(type: 'raw' | 'rth') {
    if (!dataset) return;

    setExporting(type);
    try {
      toast.info(`Preparing ${type === 'rth' ? 'RTH-only' : 'full'} CSV export...`);

      const { data, error } = await supabase.functions.invoke('export-csv', {
        body: {
          symbol: dataset.symbol,
          timeframe: dataset.timeframe,
          start: dataset.start_ts,
          end: dataset.end_ts,
          session: type === 'rth' ? 'RTH' : 'ALL',
        },
      });

      if (error) throw error;

      const blob = new Blob([data], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${dataset.symbol}_${dataset.timeframe}_${type === 'rth' ? 'RTH_' : ''}${format(new Date(dataset.start_ts), 'yyyyMMdd')}_${format(new Date(dataset.end_ts), 'yyyyMMdd')}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast.success('CSV downloaded');
    } catch (error) {
      console.error('Error exporting CSV:', error);
      toast.error('Failed to export CSV');
    } finally {
      setExporting(null);
    }
  }

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-96">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </MainLayout>
    );
  }

  if (!dataset) {
    return (
      <MainLayout>
        <div className="flex flex-col items-center justify-center h-96">
          <AlertTriangle className="w-12 h-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium">Dataset not found</h3>
          <Button variant="outline" onClick={() => navigate('/datasets')} className="mt-4">
            Back to Datasets
          </Button>
        </div>
      </MainLayout>
    );
  }

  const durationDays = Math.ceil(
    (new Date(dataset.end_ts).getTime() - new Date(dataset.start_ts).getTime()) / (1000 * 60 * 60 * 24)
  );

  return (
    <MainLayout>
      <PageHeader
        title={`${dataset.symbol} - ${dataset.timeframe}`}
        description={`Dataset from ${dataset.source}`}
      >
        <Button variant="outline" onClick={() => navigate('/datasets')} className="gap-2">
          <ArrowLeft className="w-4 h-4" />
          Back
        </Button>
      </PageHeader>

      <div className="px-8 pb-8 space-y-6">
        {/* Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <MetricCard
            label="Symbol"
            value={dataset.symbol}
            icon={BarChart3}
            valueClassName="text-primary"
          />
          <MetricCard
            label="Timeframe"
            value={dataset.timeframe}
            icon={Clock}
          />
          <MetricCard
            label="Session"
            value={dataset.session}
            icon={Calendar}
          />
          <MetricCard
            label="Total Bars"
            value={dataset.bar_count.toLocaleString()}
            icon={Database}
          />
          <MetricCard
            label="Duration"
            value={`${durationDays} days`}
            icon={Calendar}
          />
        </div>

        {/* Date Range */}
        <div className="terminal-card p-6">
          <h3 className="font-medium mb-4">Date Range</h3>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <p className="text-sm text-muted-foreground">Start</p>
              <p className="font-mono text-lg">{format(new Date(dataset.start_ts), 'yyyy-MM-dd HH:mm:ss')}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">End</p>
              <p className="font-mono text-lg">{format(new Date(dataset.end_ts), 'yyyy-MM-dd HH:mm:ss')}</p>
            </div>
          </div>
        </div>

        {/* Data Preview */}
        <div className="terminal-card">
          <div className="terminal-header">
            <Database className="w-4 h-4 text-primary" />
            <span className="font-medium">Data Preview</span>
          </div>
          <div className="p-4">
            {previewBars.first.length > 0 ? (
              <>
                <p className="text-xs text-muted-foreground mb-2">First 5 bars:</p>
                <table className="data-table mb-6">
                  <thead>
                    <tr>
                      <th>Timestamp</th>
                      <th>Open</th>
                      <th>High</th>
                      <th>Low</th>
                      <th>Close</th>
                      <th>Volume</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewBars.first.map((bar, i) => (
                      <tr key={i}>
                        <td className="text-xs">{format(new Date(bar.ts), 'yyyy-MM-dd HH:mm')}</td>
                        <td className="font-mono">${Number(bar.o).toFixed(2)}</td>
                        <td className="font-mono">${Number(bar.h).toFixed(2)}</td>
                        <td className="font-mono">${Number(bar.l).toFixed(2)}</td>
                        <td className="font-mono">${Number(bar.c).toFixed(2)}</td>
                        <td className="font-mono">{Number(bar.v).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="text-center py-2 text-muted-foreground text-sm">
                  ... {Math.max(0, dataset.bar_count - 10).toLocaleString()} more bars ...
                </div>

                <p className="text-xs text-muted-foreground mb-2 mt-4">Last 5 bars:</p>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Timestamp</th>
                      <th>Open</th>
                      <th>High</th>
                      <th>Low</th>
                      <th>Close</th>
                      <th>Volume</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewBars.last.map((bar, i) => (
                      <tr key={i}>
                        <td className="text-xs">{format(new Date(bar.ts), 'yyyy-MM-dd HH:mm')}</td>
                        <td className="font-mono">${Number(bar.o).toFixed(2)}</td>
                        <td className="font-mono">${Number(bar.h).toFixed(2)}</td>
                        <td className="font-mono">${Number(bar.l).toFixed(2)}</td>
                        <td className="font-mono">${Number(bar.c).toFixed(2)}</td>
                        <td className="font-mono">{Number(bar.v).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            ) : (
              <p className="text-center text-muted-foreground py-8">No bar data available for preview</p>
            )}
          </div>
        </div>

        {/* Export Actions */}
        <div className="terminal-card p-6">
          <h3 className="font-medium mb-4">Download Options</h3>
          <div className="flex flex-wrap gap-4">
            <Button
              onClick={() => handleExport('raw')}
              disabled={exporting !== null}
              className="gap-2"
            >
              {exporting === 'raw' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <FileDown className="w-4 h-4" />
              )}
              Download Raw CSV
            </Button>
            <Button
              variant="secondary"
              onClick={() => handleExport('rth')}
              disabled={exporting !== null}
              className="gap-2"
            >
              {exporting === 'rth' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              Download RTH-Only CSV
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-4">
            RTH = Regular Trading Hours (9:30 AM - 4:00 PM ET)
          </p>
        </div>
      </div>
    </MainLayout>
  );
}
