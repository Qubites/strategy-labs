import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { MainLayout } from '@/components/layout/MainLayout';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MetricCard } from '@/components/ui/metric-card';
import { StatusBadge } from '@/components/ui/status-badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import {
  ArrowLeft,
  Play,
  Square,
  DollarSign,
  TrendingDown,
  BarChart3,
  LineChart,
  FileText,
  RefreshCw,
  Loader2,
} from 'lucide-react';
import {
  LineChart as RechartsLineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

export default function PaperTrading() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [deployment, setDeployment] = useState<any>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [snapshots, setSnapshots] = useState<any[]>([]);
  const [dailyMetrics, setDailyMetrics] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [stopping, setStopping] = useState(false);

  useEffect(() => {
    if (id) loadDeployment();
  }, [id]);

  async function loadDeployment() {
    try {
      const { data: dep, error } = await supabase
        .from('paper_deployments')
        .select(`
          *,
          bot:bots(*),
          bot_version:bot_versions(*)
        `)
        .eq('id', id)
        .single();

      if (error) throw error;
      setDeployment(dep);

      // Load orders
      const { data: ordersData } = await supabase
        .from('paper_orders')
        .select('*')
        .eq('deployment_id', id)
        .order('submitted_at', { ascending: false });
      setOrders(ordersData || []);

      // Load snapshots for equity curve
      const { data: snapshotsData } = await supabase
        .from('paper_positions_snapshots')
        .select('*')
        .eq('deployment_id', id)
        .order('ts', { ascending: true });
      setSnapshots(snapshotsData || []);

      // Load daily metrics
      const { data: metricsData } = await supabase
        .from('paper_metrics_daily')
        .select('*')
        .eq('deployment_id', id)
        .order('date', { ascending: true });
      setDailyMetrics(metricsData || []);
    } catch (error) {
      console.error('Error loading deployment:', error);
      toast.error('Failed to load paper trading data');
    } finally {
      setLoading(false);
    }
  }

  async function handleSync() {
    setSyncing(true);
    try {
      const { error } = await supabase.functions.invoke('paper-runner', {
        body: { deployment_id: id },
      });
      if (error) throw error;
      toast.success('Synced with Alpaca');
      loadDeployment();
    } catch (error) {
      console.error('Error syncing:', error);
      toast.error('Failed to sync');
    } finally {
      setSyncing(false);
    }
  }

  async function handleStop() {
    if (!confirm('Are you sure you want to stop this paper deployment?')) return;
    setStopping(true);
    try {
      const { error } = await supabase.functions.invoke('paper-stop', {
        body: { deployment_id: id },
      });
      if (error) throw error;
      toast.success('Paper trading stopped');
      loadDeployment();
    } catch (error) {
      console.error('Error stopping:', error);
      toast.error('Failed to stop');
    } finally {
      setStopping(false);
    }
  }

  async function handleEvaluate() {
    try {
      const { data, error } = await supabase.functions.invoke('paper-evaluate', {
        body: { deployment_id: id },
      });
      if (error) throw error;
      toast.success(data.passed ? 'Paper trading PASSED!' : 'Paper trading FAILED');
      loadDeployment();
    } catch (error) {
      console.error('Error evaluating:', error);
      toast.error('Failed to evaluate');
    }
  }

  // Calculate metrics
  const latestSnapshot = snapshots[snapshots.length - 1];
  const startingEquity = deployment?.config_json?.starting_equity || 0;
  const currentEquity = latestSnapshot?.equity || startingEquity;
  const totalPnl = currentEquity - startingEquity;
  const totalTrades = orders.filter(o => o.status === 'filled').length;
  const maxDrawdown = dailyMetrics.reduce((max, d) => Math.max(max, d.drawdown), 0);

  // Equity chart data
  const equityData = snapshots.map(s => ({
    time: format(new Date(s.ts), 'MMM d HH:mm'),
    equity: s.equity,
  }));

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-96">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </MainLayout>
    );
  }

  if (!deployment) {
    return (
      <MainLayout>
        <div className="flex flex-col items-center justify-center h-96">
          <h3 className="text-lg font-medium">Deployment not found</h3>
          <Button variant="outline" onClick={() => navigate('/bots')} className="mt-4">
            Back to Bots
          </Button>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <PageHeader
        title="Paper Trading"
        description={`${deployment.bot?.name || 'Bot'} - Version ${deployment.bot_version?.version_number}`}
      >
        <Button variant="outline" onClick={() => navigate(-1)} className="gap-2">
          <ArrowLeft className="w-4 h-4" />
          Back
        </Button>
        <Button variant="outline" onClick={handleSync} disabled={syncing} className="gap-2">
          <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
          Sync
        </Button>
        {deployment.status === 'running' && (
          <Button variant="destructive" onClick={handleStop} disabled={stopping} className="gap-2">
            {stopping ? <Loader2 className="w-4 h-4 animate-spin" /> : <Square className="w-4 h-4" />}
            Stop
          </Button>
        )}
        {deployment.status === 'evaluating' && (
          <Button onClick={handleEvaluate} className="gap-2">
            <Play className="w-4 h-4" />
            Evaluate
          </Button>
        )}
      </PageHeader>

      <div className="px-8 pb-8 space-y-6">
        {/* Status bar */}
        <div className="flex items-center gap-4 flex-wrap">
          <StatusBadge status={deployment.status} />
          <span className="text-sm text-muted-foreground">
            Started: {format(new Date(deployment.started_at), 'MMM d, yyyy HH:mm')}
          </span>
          <span className="text-sm text-muted-foreground">
            Target: {deployment.target_days} days
          </span>
          {deployment.passed !== null && (
            <span className={deployment.passed ? 'text-success font-medium' : 'text-destructive font-medium'}>
              {deployment.passed ? '✓ PASSED' : '✗ FAILED'}
            </span>
          )}
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <MetricCard
            label="Current Equity"
            value={`$${currentEquity.toFixed(2)}`}
            icon={DollarSign}
          />
          <MetricCard
            label="Total P&L"
            value={`$${totalPnl.toFixed(2)}`}
            icon={TrendingDown}
            valueClassName={totalPnl >= 0 ? 'text-success' : 'text-destructive'}
          />
          <MetricCard
            label="Total Trades"
            value={totalTrades}
            icon={BarChart3}
          />
          <MetricCard
            label="Max Drawdown"
            value={`${(maxDrawdown * 100).toFixed(1)}%`}
            icon={LineChart}
            valueClassName="text-destructive"
          />
        </div>

        {/* Tabs */}
        <Tabs defaultValue="equity" className="space-y-6">
          <TabsList>
            <TabsTrigger value="equity" className="gap-2">
              <LineChart className="w-4 h-4" />
              Equity Curve
            </TabsTrigger>
            <TabsTrigger value="orders" className="gap-2">
              <FileText className="w-4 h-4" />
              Orders ({orders.length})
            </TabsTrigger>
            <TabsTrigger value="positions" className="gap-2">
              <BarChart3 className="w-4 h-4" />
              Positions
            </TabsTrigger>
            <TabsTrigger value="daily" className="gap-2">
              <DollarSign className="w-4 h-4" />
              Daily Metrics
            </TabsTrigger>
          </TabsList>

          <TabsContent value="equity">
            <div className="terminal-card p-6">
              <h3 className="font-medium mb-4">Equity Curve</h3>
              {equityData.length > 0 ? (
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsLineChart data={equityData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="time" className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                      <YAxis className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px',
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="equity"
                        stroke="hsl(var(--primary))"
                        strokeWidth={2}
                        dot={false}
                      />
                    </RechartsLineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No equity data yet
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="orders">
            <div className="terminal-card">
              {orders.length > 0 ? (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Symbol</th>
                      <th>Side</th>
                      <th>Qty</th>
                      <th>Type</th>
                      <th>Status</th>
                      <th>Fill Price</th>
                      <th>Submitted</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((order) => (
                      <tr key={order.id}>
                        <td className="font-mono">{order.symbol}</td>
                        <td className={order.side === 'buy' ? 'text-success' : 'text-destructive'}>
                          {order.side.toUpperCase()}
                        </td>
                        <td className="font-mono">{order.qty}</td>
                        <td>{order.order_type}</td>
                        <td>
                          <StatusBadge status={order.status} />
                        </td>
                        <td className="font-mono">
                          {order.filled_price ? `$${order.filled_price}` : '—'}
                        </td>
                        <td className="text-sm text-muted-foreground">
                          {format(new Date(order.submitted_at), 'MMM d, HH:mm')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No orders yet
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="positions">
            <div className="terminal-card p-6">
              <h3 className="font-medium mb-4">Current Positions</h3>
              {latestSnapshot?.positions_json && latestSnapshot.positions_json.length > 0 ? (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Symbol</th>
                      <th>Qty</th>
                      <th>Avg Entry</th>
                      <th>Current Price</th>
                      <th>Market Value</th>
                      <th>Unrealized P&L</th>
                    </tr>
                  </thead>
                  <tbody>
                    {latestSnapshot.positions_json.map((pos: any, idx: number) => (
                      <tr key={idx}>
                        <td className="font-mono">{pos.symbol}</td>
                        <td className="font-mono">{pos.qty}</td>
                        <td className="font-mono">${parseFloat(pos.avg_entry_price).toFixed(2)}</td>
                        <td className="font-mono">${parseFloat(pos.current_price).toFixed(2)}</td>
                        <td className="font-mono">${parseFloat(pos.market_value).toFixed(2)}</td>
                        <td className={parseFloat(pos.unrealized_pl) >= 0 ? 'text-success' : 'text-destructive'}>
                          ${parseFloat(pos.unrealized_pl).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No open positions
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="daily">
            <div className="terminal-card">
              {dailyMetrics.length > 0 ? (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>P&L</th>
                      <th>Drawdown</th>
                      <th>Trades</th>
                      <th>Equity End</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dailyMetrics.map((metric) => (
                      <tr key={metric.id}>
                        <td>{metric.date}</td>
                        <td className={metric.pnl >= 0 ? 'text-success' : 'text-destructive'}>
                          ${metric.pnl.toFixed(2)}
                        </td>
                        <td className="text-destructive">
                          {(metric.drawdown * 100).toFixed(1)}%
                        </td>
                        <td>{metric.trades_count}</td>
                        <td className="font-mono">${metric.equity_end?.toFixed(2) || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No daily metrics yet
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>

        {/* Pass Criteria */}
        <div className="terminal-card p-6">
          <h3 className="font-medium mb-4">Pass Criteria</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex justify-between py-2 border-b border-border/50">
              <span className="text-muted-foreground">Max Drawdown</span>
              <span className="font-mono">{(deployment.pass_criteria?.max_dd * 100).toFixed(0)}%</span>
            </div>
            <div className="flex justify-between py-2 border-b border-border/50">
              <span className="text-muted-foreground">Max Daily Loss</span>
              <span className="font-mono">${deployment.pass_criteria?.max_daily_loss}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-border/50">
              <span className="text-muted-foreground">Min Trades</span>
              <span className="font-mono">{deployment.pass_criteria?.min_trades}</span>
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
