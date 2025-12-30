import { useState, useEffect } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge } from '@/components/ui/status-badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { Trophy, TrendingUp, TrendingDown, Medal } from 'lucide-react';
import { format } from 'date-fns';

export default function Leaderboard() {
  const [runs, setRuns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState('profit_factor');
  const [filterType, setFilterType] = useState('all');

  useEffect(() => {
    loadLeaderboard();
  }, []);

  async function loadLeaderboard() {
    try {
      const { data, error } = await supabase
        .from('runs')
        .select(`
          *,
          run_metrics!inner (*),
          bot_versions!inner (
            id,
            version_number,
            status,
            bots!inner (
              id,
              name,
              template_id
            )
          ),
          datasets (symbol, timeframe)
        `)
        .eq('status', 'done')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setRuns(data || []);
    } catch (error) {
      console.error('Error loading leaderboard:', error);
    } finally {
      setLoading(false);
    }
  }

  const sortedRuns = [...runs]
    .filter((run) => {
      if (filterType === 'all') return true;
      return run.run_type === filterType;
    })
    .sort((a, b) => {
      const aMetric = parseFloat(a.run_metrics?.[sortBy]) || 0;
      const bMetric = parseFloat(b.run_metrics?.[sortBy]) || 0;
      
      // For drawdown and losses, lower is better
      if (sortBy === 'max_drawdown' || sortBy === 'biggest_loss') {
        return aMetric - bMetric;
      }
      return bMetric - aMetric;
    });

  const getMedalColor = (index: number) => {
    if (index === 0) return 'text-yellow-400';
    if (index === 1) return 'text-gray-400';
    if (index === 2) return 'text-amber-600';
    return 'text-muted-foreground';
  };

  return (
    <MainLayout>
      <PageHeader
        title="Leaderboard"
        description="Top performing bots ranked by metrics"
      />

      <div className="px-8 pb-8 space-y-6">
        {/* Filters */}
        <div className="flex items-center gap-4">
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="profit_factor">Profit Factor</SelectItem>
              <SelectItem value="net_pnl_usd">Net PnL ($)</SelectItem>
              <SelectItem value="win_rate">Win Rate</SelectItem>
              <SelectItem value="trades_count">Trade Count</SelectItem>
              <SelectItem value="avg_trade">Avg Trade</SelectItem>
              <SelectItem value="max_drawdown">Max Drawdown (lowest)</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Run Type" />
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

        {/* Leaderboard Table */}
        <div className="terminal-card">
          {loading ? (
            <div className="text-center py-12 text-muted-foreground">Loading leaderboard...</div>
          ) : sortedRuns.length > 0 ? (
            <table className="data-table">
              <thead>
                <tr>
                  <th className="w-12">#</th>
                  <th>Bot</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Dataset</th>
                  <th className={sortBy === 'profit_factor' ? 'text-primary' : ''}>PF</th>
                  <th className={sortBy === 'net_pnl_usd' ? 'text-primary' : ''}>Net PnL</th>
                  <th className={sortBy === 'trades_count' ? 'text-primary' : ''}>Trades</th>
                  <th className={sortBy === 'win_rate' ? 'text-primary' : ''}>Win %</th>
                  <th className={sortBy === 'max_drawdown' ? 'text-primary' : ''}>Max DD</th>
                  <th>Fees</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {sortedRuns.map((run, index) => (
                  <tr key={run.id} className={index < 3 ? 'bg-muted/20' : ''}>
                    <td>
                      {index < 3 ? (
                        <Medal className={`w-5 h-5 ${getMedalColor(index)}`} />
                      ) : (
                        <span className="text-muted-foreground">{index + 1}</span>
                      )}
                    </td>
                    <td>
                      <span className="font-medium">{run.bot_versions?.bots?.name}</span>
                      <span className="text-muted-foreground ml-1">
                        v{run.bot_versions?.version_number}
                      </span>
                    </td>
                    <td className="capitalize">{run.run_type}</td>
                    <td>
                      <StatusBadge status={run.bot_versions?.status || 'draft'} />
                    </td>
                    <td className="font-mono text-sm">
                      {run.datasets?.symbol || '—'} {run.datasets?.timeframe}
                    </td>
                    <td>
                      <span
                        className={`flex items-center gap-1 ${
                          parseFloat(run.run_metrics?.profit_factor) > 1.5
                            ? 'text-success'
                            : parseFloat(run.run_metrics?.profit_factor) > 1
                            ? 'text-primary'
                            : 'text-destructive'
                        }`}
                      >
                        {parseFloat(run.run_metrics?.profit_factor) > 1 ? (
                          <TrendingUp className="w-3 h-3" />
                        ) : (
                          <TrendingDown className="w-3 h-3" />
                        )}
                        {parseFloat(run.run_metrics?.profit_factor).toFixed(2)}
                      </span>
                    </td>
                    <td
                      className={
                        parseFloat(run.run_metrics?.net_pnl_usd) >= 0
                          ? 'text-success'
                          : 'text-destructive'
                      }
                    >
                      ${parseFloat(run.run_metrics?.net_pnl_usd).toFixed(2)}
                    </td>
                    <td>{run.run_metrics?.trades_count}</td>
                    <td>{parseFloat(run.run_metrics?.win_rate).toFixed(1)}%</td>
                    <td className="text-destructive">
                      ${parseFloat(run.run_metrics?.max_drawdown).toFixed(2)}
                    </td>
                    <td className="text-muted-foreground">
                      ${parseFloat(run.run_metrics?.fees_paid || 0).toFixed(2)}
                    </td>
                    <td className="text-sm text-muted-foreground">
                      {format(new Date(run.start_ts), 'MMM d')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="text-center py-12">
              <Trophy className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">No completed runs yet</h3>
              <p className="text-muted-foreground">
                Complete some backtests to see them on the leaderboard
              </p>
            </div>
          )}
        </div>
      </div>
    </MainLayout>
  );
}
