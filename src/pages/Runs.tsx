import { useState, useEffect } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Play, Square, RefreshCw, Search } from 'lucide-react';
import { format } from 'date-fns';
import type { Run } from '@/types/trading';

export default function Runs() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({
    status: 'all',
    type: 'all',
    search: '',
  });

  useEffect(() => {
    loadRuns();
    // Set up real-time subscription
    const channel = supabase
      .channel('runs-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'runs' },
        () => {
          loadRuns();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function loadRuns() {
    try {
      const { data, error } = await supabase
        .from('runs')
        .select(`
          *,
          run_metrics (*),
          bot_versions!inner (
            id,
            version_number,
            bots!inner (
              id,
              name
            )
          ),
          datasets (symbol, timeframe)
        `)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      setRuns(data || []);
    } catch (error) {
      console.error('Error loading runs:', error);
      toast.error('Failed to load runs');
    } finally {
      setLoading(false);
    }
  }

  async function handleStopRun(runId: string) {
    try {
      const { error } = await supabase
        .from('runs')
        .update({ status: 'stopped', end_ts: new Date().toISOString() })
        .eq('id', runId);

      if (error) throw error;
      toast.success('Run stopped');
      loadRuns();
    } catch (error) {
      console.error('Error stopping run:', error);
      toast.error('Failed to stop run');
    }
  }

  const filteredRuns = runs.filter((run: any) => {
    if (filter.status !== 'all' && run.status !== filter.status) return false;
    if (filter.type !== 'all' && run.run_type !== filter.type) return false;
    if (filter.search) {
      const botName = run.bot_versions?.bots?.name?.toLowerCase() || '';
      if (!botName.includes(filter.search.toLowerCase())) return false;
    }
    return true;
  });

  return (
    <MainLayout>
      <PageHeader
        title="Runs"
        description="Monitor and manage all trading runs"
      >
        <Button onClick={loadRuns} variant="outline" className="gap-2">
          <RefreshCw className="w-4 h-4" />
          Refresh
        </Button>
      </PageHeader>

      <div className="px-8 pb-8 space-y-6">
        {/* Filters */}
        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search bots..."
              value={filter.search}
              onChange={(e) => setFilter((f) => ({ ...f, search: e.target.value }))}
              className="pl-9"
            />
          </div>
          <Select
            value={filter.status}
            onValueChange={(v) => setFilter((f) => ({ ...f, status: v }))}
          >
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="running">Running</SelectItem>
              <SelectItem value="queued">Queued</SelectItem>
              <SelectItem value="done">Done</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="stopped">Stopped</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={filter.type}
            onValueChange={(v) => setFilter((f) => ({ ...f, type: v }))}
          >
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="backtest">Backtest</SelectItem>
              <SelectItem value="paper">Paper</SelectItem>
              <SelectItem value="shadow">Shadow</SelectItem>
              <SelectItem value="live">Live</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Runs Table */}
        <div className="terminal-card">
          {loading ? (
            <div className="text-center py-12 text-muted-foreground">Loading runs...</div>
          ) : filteredRuns.length > 0 ? (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Bot</th>
                  <th>Type</th>
                  <th>Dataset</th>
                  <th>Status</th>
                  <th>PF</th>
                  <th>Net PnL</th>
                  <th>Trades</th>
                  <th>Max DD</th>
                  <th>Win Rate</th>
                  <th>Started</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filteredRuns.map((run: any) => (
                  <tr key={run.id}>
                    <td>
                      <span className="font-medium">{run.bot_versions?.bots?.name}</span>
                      <span className="text-muted-foreground ml-1">
                        v{run.bot_versions?.version_number}
                      </span>
                    </td>
                    <td className="capitalize">{run.run_type}</td>
                    <td className="font-mono text-sm">
                      {run.datasets?.symbol || '—'} {run.datasets?.timeframe}
                    </td>
                    <td>
                      <StatusBadge status={run.status} />
                    </td>
                    <td
                      className={
                        parseFloat(run.run_metrics?.profit_factor) > 1
                          ? 'text-success'
                          : parseFloat(run.run_metrics?.profit_factor) < 1
                          ? 'text-destructive'
                          : ''
                      }
                    >
                      {run.run_metrics?.profit_factor
                        ? parseFloat(run.run_metrics.profit_factor).toFixed(2)
                        : '—'}
                    </td>
                    <td
                      className={
                        parseFloat(run.run_metrics?.net_pnl_usd) >= 0
                          ? 'text-success'
                          : 'text-destructive'
                      }
                    >
                      {run.run_metrics?.net_pnl_usd
                        ? `$${parseFloat(run.run_metrics.net_pnl_usd).toFixed(2)}`
                        : '—'}
                    </td>
                    <td>{run.run_metrics?.trades_count || '—'}</td>
                    <td className="text-destructive">
                      {run.run_metrics?.max_drawdown
                        ? `$${parseFloat(run.run_metrics.max_drawdown).toFixed(2)}`
                        : '—'}
                    </td>
                    <td>
                      {run.run_metrics?.win_rate
                        ? `${parseFloat(run.run_metrics.win_rate).toFixed(1)}%`
                        : '—'}
                    </td>
                    <td className="text-sm text-muted-foreground">
                      {format(new Date(run.start_ts), 'MMM d, HH:mm')}
                    </td>
                    <td>
                      {(run.status === 'running' || run.status === 'queued') && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleStopRun(run.id)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Square className="w-4 h-4" />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="text-center py-12">
              <Play className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">No runs found</h3>
              <p className="text-muted-foreground">
                {filter.search || filter.status !== 'all' || filter.type !== 'all'
                  ? 'Try adjusting your filters'
                  : 'Start a backtest from a bot to see runs here'}
              </p>
            </div>
          )}
        </div>
      </div>
    </MainLayout>
  );
}
