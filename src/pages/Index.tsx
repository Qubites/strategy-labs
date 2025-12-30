import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { MainLayout } from '@/components/layout/MainLayout';
import { MetricCard } from '@/components/ui/metric-card';
import { StatusBadge } from '@/components/ui/status-badge';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import {
  Bot,
  Database,
  Play,
  Trophy,
  TrendingUp,
  AlertTriangle,
  ArrowRight,
  Plus,
} from 'lucide-react';
import type { Run, Bot as BotType, Dataset } from '@/types/trading';

export default function Dashboard() {
  const [stats, setStats] = useState({
    totalBots: 0,
    activeRuns: 0,
    datasets: 0,
    topPF: 0,
  });
  const [recentRuns, setRecentRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  async function loadDashboardData() {
    try {
      // Get counts
      const [botsRes, runsRes, datasetsRes, metricsRes] = await Promise.all([
        supabase.from('bots').select('id', { count: 'exact' }).eq('archived', false),
        supabase.from('runs').select('id', { count: 'exact' }).in('status', ['running', 'queued']),
        supabase.from('datasets').select('id', { count: 'exact' }),
        supabase.from('run_metrics').select('profit_factor').order('profit_factor', { ascending: false }).limit(1),
      ]);

      // Get recent runs with metrics
      const { data: runs } = await supabase
        .from('runs')
        .select(`
          *,
          run_metrics (*),
          bot_versions!inner (
            id,
            version_number,
            status,
            bots!inner (
              id,
              name
            )
          )
        `)
        .order('created_at', { ascending: false })
        .limit(5);

      setStats({
        totalBots: botsRes.count || 0,
        activeRuns: runsRes.count || 0,
        datasets: datasetsRes.count || 0,
        topPF: metricsRes.data?.[0]?.profit_factor || 0,
      });

      setRecentRuns(runs || []);
    } catch (error) {
      console.error('Error loading dashboard:', error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <MainLayout>
      <PageHeader
        title="Dashboard"
        description="Trading Bot Lab Overview"
      >
        <Link to="/bots/new">
          <Button className="gap-2">
            <Plus className="w-4 h-4" />
            New Bot
          </Button>
        </Link>
      </PageHeader>

      <div className="px-8 pb-8 space-y-8">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            label="Total Bots"
            value={stats.totalBots}
            icon={Bot}
          />
          <MetricCard
            label="Active Runs"
            value={stats.activeRuns}
            icon={Play}
            valueClassName={stats.activeRuns > 0 ? 'text-primary' : undefined}
          />
          <MetricCard
            label="Datasets"
            value={stats.datasets}
            icon={Database}
          />
          <MetricCard
            label="Top Profit Factor"
            value={stats.topPF ? stats.topPF.toFixed(2) : '—'}
            icon={Trophy}
            valueClassName={stats.topPF > 1.5 ? 'text-success' : undefined}
          />
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link to="/datasets" className="terminal-card p-6 hover:border-primary/50 transition-colors group">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                <Database className="w-6 h-6 text-primary" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-foreground">Dataset Playground</h3>
                <p className="text-sm text-muted-foreground">Download historical data</p>
              </div>
              <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
            </div>
          </Link>

          <Link to="/templates" className="terminal-card p-6 hover:border-primary/50 transition-colors group">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                <TrendingUp className="w-6 h-6 text-primary" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-foreground">Strategy Templates</h3>
                <p className="text-sm text-muted-foreground">Browse strategies</p>
              </div>
              <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
            </div>
          </Link>

          <Link to="/leaderboard" className="terminal-card p-6 hover:border-primary/50 transition-colors group">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                <Trophy className="w-6 h-6 text-primary" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-foreground">Leaderboard</h3>
                <p className="text-sm text-muted-foreground">View top performers</p>
              </div>
              <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
            </div>
          </Link>
        </div>

        {/* Recent Runs */}
        <div className="terminal-card">
          <div className="terminal-header">
            <Play className="w-4 h-4 text-primary" />
            <span className="font-medium">Recent Runs</span>
          </div>
          <div className="p-4">
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">Loading...</div>
            ) : recentRuns.length > 0 ? (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Bot</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>PF</th>
                    <th>Net PnL</th>
                    <th>Trades</th>
                  </tr>
                </thead>
                <tbody>
                  {recentRuns.map((run: any) => (
                    <tr key={run.id}>
                      <td className="font-medium">
                        {run.bot_versions?.bots?.name || 'Unknown'}
                        <span className="text-muted-foreground ml-1">
                          v{run.bot_versions?.version_number}
                        </span>
                      </td>
                      <td className="capitalize">{run.run_type}</td>
                      <td>
                        <StatusBadge status={run.status} />
                      </td>
                      <td className={run.run_metrics?.profit_factor > 1 ? 'text-success' : 'text-destructive'}>
                        {run.run_metrics?.profit_factor?.toFixed(2) || '—'}
                      </td>
                      <td className={Number(run.run_metrics?.net_pnl_usd) >= 0 ? 'text-success' : 'text-destructive'}>
                        ${run.run_metrics?.net_pnl_usd?.toFixed(2) || '—'}
                      </td>
                      <td>{run.run_metrics?.trades_count || 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="text-center py-8">
                <AlertTriangle className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-muted-foreground">No runs yet</p>
                <Link to="/bots/new">
                  <Button variant="outline" size="sm" className="mt-4">
                    Create your first bot
                  </Button>
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
