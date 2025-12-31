import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { MainLayout } from '@/components/layout/MainLayout';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/status-badge';
import { MetricCard } from '@/components/ui/metric-card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import {
  ArrowLeft,
  TrendingUp,
  DollarSign,
  BarChart3,
  AlertTriangle,
  Loader2,
  FileDown,
  Square,
  FileText,
  LineChart,
  Activity,
} from 'lucide-react';
import type { Run, Trade, RunMetrics } from '@/types/trading';

interface LogEntry {
  id: string;
  ts: string;
  level: string;
  category: string;
  message: string;
  payload_json: string | null;
}

export default function RunDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [run, setRun] = useState<any>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [stopping, setStopping] = useState(false);

  useEffect(() => {
    if (id) loadRunDetails();
  }, [id]);

  async function loadRunDetails() {
    try {
      // Load run with all related data
      const { data: runData, error: runError } = await supabase
        .from('runs')
        .select(`
          *,
          run_metrics (*),
          bot_versions!inner (
            id,
            version_number,
            params_json,
            bots!inner (id, name)
          ),
          datasets (id, symbol, timeframe, bar_count, start_ts, end_ts, session)
        `)
        .eq('id', id)
        .single();

      if (runError) throw runError;
      setRun(runData);

      // Load trades
      const { data: tradesData } = await supabase
        .from('trades')
        .select('*')
        .eq('run_id', id)
        .order('ts_entry', { ascending: true });

      setTrades(tradesData || []);

      // Load logs
      const { data: logsData } = await supabase
        .from('logs')
        .select('*')
        .eq('run_id', id)
        .order('ts', { ascending: false })
        .limit(200);

      setLogs(logsData || []);
    } catch (error) {
      console.error('Error loading run:', error);
      toast.error('Failed to load run details');
    } finally {
      setLoading(false);
    }
  }

  async function handleStop() {
    if (!run) return;
    setStopping(true);
    try {
      const { error } = await supabase
        .from('runs')
        .update({ status: 'stopped', end_ts: new Date().toISOString() })
        .eq('id', run.id);

      if (error) throw error;
      toast.success('Run stopped');
      loadRunDetails();
    } catch (error) {
      console.error('Error stopping run:', error);
      toast.error('Failed to stop run');
    } finally {
      setStopping(false);
    }
  }

  async function handleExportTrades() {
    if (trades.length === 0) {
      toast.error('No trades to export');
      return;
    }

    const botName = run?.bot_versions?.bots?.name?.replace(/\s+/g, '_') || 'bot';
    const version = run?.bot_versions?.version_number || 1;
    const datasetName = run?.datasets?.symbol || 'dataset';

    const headers = ['entry_time', 'exit_time', 'side', 'qty', 'entry_price', 'exit_price', 'pnl_usd', 'pnl_points', 'fees', 'reason'];
    const rows = trades.map(t => [
      t.ts_entry,
      t.ts_exit || '',
      t.side,
      t.qty,
      t.entry_price,
      t.exit_price || '',
      t.pnl_usd || '',
      t.pnl_points || '',
      t.fees || '',
      t.reason_code || '',
    ].join(','));

    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${botName}_v${version}_${datasetName}_${id?.slice(0, 8)}_trades.csv`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
    toast.success('Trades exported');
  }

  async function handleExportSummary() {
    if (!run) return;

    const summary = {
      run_id: run.id,
      bot_name: run.bot_versions?.bots?.name,
      bot_version: run.bot_versions?.version_number,
      run_type: run.run_type,
      status: run.status,
      dataset: run.datasets ? {
        symbol: run.datasets.symbol,
        timeframe: run.datasets.timeframe,
        bar_count: run.datasets.bar_count,
        session: run.datasets.session,
      } : null,
      metrics: run.run_metrics ? {
        profit_factor: run.run_metrics.profit_factor,
        net_pnl_usd: run.run_metrics.net_pnl_usd,
        net_pnl_points: run.run_metrics.net_pnl_points,
        trades_count: run.run_metrics.trades_count,
        win_rate: run.run_metrics.win_rate,
        max_drawdown: run.run_metrics.max_drawdown,
        gross_profit: run.run_metrics.gross_profit,
        gross_loss: run.run_metrics.gross_loss,
        fees_paid: run.run_metrics.fees_paid,
      } : null,
      timestamps: {
        start: run.start_ts,
        end: run.end_ts,
        created: run.created_at,
      },
    };

    const botName = run.bot_versions?.bots?.name?.replace(/\s+/g, '_') || 'bot';
    const version = run.bot_versions?.version_number || 1;
    const datasetName = run.datasets?.symbol || 'dataset';

    const blob = new Blob([JSON.stringify(summary, null, 2)], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${botName}_v${version}_${datasetName}_${id?.slice(0, 8)}_summary.json`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
    toast.success('Summary exported');
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

  if (!run) {
    return (
      <MainLayout>
        <div className="flex flex-col items-center justify-center h-96">
          <AlertTriangle className="w-12 h-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium">Run not found</h3>
          <Button variant="outline" onClick={() => navigate('/runs')} className="mt-4">
            Back to Runs
          </Button>
        </div>
      </MainLayout>
    );
  }

  const metrics = run.run_metrics;
  const isActive = run.status === 'running' || run.status === 'queued';

  // Calculate equity curve from trades
  const equityCurve = trades.reduce((acc: { time: string; equity: number }[], trade, i) => {
    const prevEquity = acc.length > 0 ? acc[acc.length - 1].equity : 0;
    const pnl = Number(trade.pnl_usd) || 0;
    acc.push({
      time: trade.ts_exit || trade.ts_entry,
      equity: prevEquity + pnl,
    });
    return acc;
  }, []);

  return (
    <MainLayout>
      <PageHeader
        title={`Run: ${run.bot_versions?.bots?.name} v${run.bot_versions?.version_number}`}
        description={`${run.run_type} run on ${run.datasets?.symbol || 'live'}`}
      >
        <Button variant="outline" onClick={() => navigate('/runs')} className="gap-2">
          <ArrowLeft className="w-4 h-4" />
          Back
        </Button>
        {isActive && (
          <Button
            variant="destructive"
            onClick={handleStop}
            disabled={stopping}
            className="gap-2"
          >
            {stopping ? <Loader2 className="w-4 h-4 animate-spin" /> : <Square className="w-4 h-4" />}
            Stop Run
          </Button>
        )}
      </PageHeader>

      <div className="px-8 pb-8 space-y-6">
        {/* Status Bar */}
        <div className="flex items-center gap-4 flex-wrap">
          <StatusBadge status={run.status} />
          <span className="text-sm text-muted-foreground capitalize">{run.run_type}</span>
          {run.datasets && (
            <Link to={`/datasets/${run.datasets.id}`} className="text-sm text-primary hover:underline">
              {run.datasets.symbol} {run.datasets.timeframe} ({run.datasets.bar_count} bars)
            </Link>
          )}
          <span className="text-xs text-muted-foreground ml-auto">
            Started: {format(new Date(run.start_ts), 'MMM d, yyyy HH:mm')}
            {run.end_ts && ` • Ended: ${format(new Date(run.end_ts), 'MMM d, yyyy HH:mm')}`}
          </span>
        </div>

        {/* Metrics */}
        {metrics && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <MetricCard
              label="Profit Factor"
              value={metrics.profit_factor ? Number(metrics.profit_factor).toFixed(2) : '—'}
              icon={TrendingUp}
              valueClassName={Number(metrics.profit_factor) > 1 ? 'text-success' : 'text-destructive'}
            />
            <MetricCard
              label="Net PnL"
              value={metrics.net_pnl_usd ? `$${Number(metrics.net_pnl_usd).toFixed(2)}` : '—'}
              icon={DollarSign}
              valueClassName={Number(metrics.net_pnl_usd) >= 0 ? 'text-success' : 'text-destructive'}
            />
            <MetricCard
              label="Trades"
              value={metrics.trades_count || 0}
              icon={BarChart3}
            />
            <MetricCard
              label="Win Rate"
              value={metrics.win_rate ? `${Number(metrics.win_rate).toFixed(1)}%` : '—'}
              icon={Activity}
            />
            <MetricCard
              label="Max Drawdown"
              value={metrics.max_drawdown ? `$${Number(metrics.max_drawdown).toFixed(2)}` : '—'}
              icon={AlertTriangle}
              valueClassName="text-destructive"
            />
          </div>
        )}

        {/* Tabs */}
        <Tabs defaultValue="trades" className="space-y-6">
          <TabsList>
            <TabsTrigger value="trades" className="gap-2">
              <FileText className="w-4 h-4" />
              Trades ({trades.length})
            </TabsTrigger>
            <TabsTrigger value="equity" className="gap-2">
              <LineChart className="w-4 h-4" />
              Equity Curve
            </TabsTrigger>
            <TabsTrigger value="logs" className="gap-2">
              <Activity className="w-4 h-4" />
              Logs ({logs.length})
            </TabsTrigger>
            <TabsTrigger value="export" className="gap-2">
              <FileDown className="w-4 h-4" />
              Export
            </TabsTrigger>
          </TabsList>

          <TabsContent value="trades">
            <div className="terminal-card">
              {trades.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Entry Time</th>
                        <th>Exit Time</th>
                        <th>Side</th>
                        <th>Qty</th>
                        <th>Entry</th>
                        <th>Exit</th>
                        <th>PnL ($)</th>
                        <th>PnL (pts)</th>
                        <th>Fees</th>
                        <th>Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {trades.map((trade) => (
                        <tr key={trade.id}>
                          <td className="text-xs">{format(new Date(trade.ts_entry), 'MMM d, HH:mm')}</td>
                          <td className="text-xs">{trade.ts_exit ? format(new Date(trade.ts_exit), 'MMM d, HH:mm') : '—'}</td>
                          <td className={trade.side === 'long' ? 'text-success' : 'text-destructive'}>
                            {trade.side.toUpperCase()}
                          </td>
                          <td className="font-mono">{trade.qty}</td>
                          <td className="font-mono">${Number(trade.entry_price).toFixed(2)}</td>
                          <td className="font-mono">{trade.exit_price ? `$${Number(trade.exit_price).toFixed(2)}` : '—'}</td>
                          <td className={Number(trade.pnl_usd) >= 0 ? 'text-success' : 'text-destructive'}>
                            {trade.pnl_usd ? `$${Number(trade.pnl_usd).toFixed(2)}` : '—'}
                          </td>
                          <td className="font-mono text-xs">{trade.pnl_points || '—'}</td>
                          <td className="font-mono text-xs">${Number(trade.fees || 0).toFixed(2)}</td>
                          <td className="text-xs text-muted-foreground">{trade.reason_code || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  No trades in this run
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="equity">
            <div className="terminal-card p-6">
              <h3 className="font-medium mb-4">Equity Curve</h3>
              {equityCurve.length > 0 ? (
                <div className="h-64 flex items-end gap-1">
                  {equityCurve.map((point, i) => {
                    const maxEquity = Math.max(...equityCurve.map(p => Math.abs(p.equity)), 1);
                    const height = Math.abs(point.equity) / maxEquity * 100;
                    return (
                      <div
                        key={i}
                        className={`flex-1 min-w-1 rounded-t ${point.equity >= 0 ? 'bg-success' : 'bg-destructive'}`}
                        style={{ height: `${Math.max(height, 2)}%` }}
                        title={`$${point.equity.toFixed(2)}`}
                      />
                    );
                  })}
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-8">No equity data to display</p>
              )}
              <div className="flex justify-between text-xs text-muted-foreground mt-2">
                <span>Start</span>
                <span>End</span>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="logs">
            <div className="terminal-card">
              <div className="max-h-96 overflow-y-auto">
                {logs.length > 0 ? (
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Time</th>
                        <th>Level</th>
                        <th>Category</th>
                        <th>Message</th>
                      </tr>
                    </thead>
                    <tbody>
                      {logs.map((log) => (
                        <tr key={log.id}>
                          <td className="text-xs">{format(new Date(log.ts), 'HH:mm:ss.SSS')}</td>
                          <td>
                            <span className={`text-xs font-medium ${
                              log.level === 'error' ? 'text-destructive' :
                              log.level === 'warn' ? 'text-warning' :
                              'text-muted-foreground'
                            }`}>
                              {log.level.toUpperCase()}
                            </span>
                          </td>
                          <td className="text-xs text-muted-foreground">{log.category}</td>
                          <td className="text-sm">{log.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    No logs for this run
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="export">
            <div className="terminal-card p-6">
              <h3 className="font-medium mb-4">Export Data</h3>
              <p className="text-sm text-muted-foreground mb-6">
                Download run data using the naming convention: <code className="bg-muted px-2 py-1 rounded">botName_version_dataset_runId.csv</code>
              </p>
              <div className="flex flex-wrap gap-4">
                <Button onClick={handleExportTrades} className="gap-2" disabled={trades.length === 0}>
                  <FileDown className="w-4 h-4" />
                  Export trades.csv
                </Button>
                <Button variant="secondary" onClick={handleExportSummary} className="gap-2">
                  <FileDown className="w-4 h-4" />
                  Export summary.json
                </Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
