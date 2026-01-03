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
  Zap,
  Activity,
  AlertTriangle,
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
  const [runnerLogs, setRunnerLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [forcingTrade, setForcingTrade] = useState<'long' | 'short' | null>(null);

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

      // Load runner logs
      const { data: logsData } = await supabase
        .from('paper_runner_logs')
        .select('*')
        .eq('deployment_id', id)
        .order('ts', { ascending: false })
        .limit(50);
      setRunnerLogs(logsData || []);
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

  async function handleForceTrade(side: 'long' | 'short') {
    if (!confirm(`Are you sure you want to force a TEST ${side.toUpperCase()} trade? This will place a real order in the paper account.`)) return;
    setForcingTrade(side);
    try {
      const { data, error } = await supabase.functions.invoke('paper-runner', {
        body: { deployment_id: id, force_trade: side },
      });
      if (error) throw error;
      if (data?.success === false) {
        toast.error(data.error || 'Trade not allowed');
      } else if (data?.order_placed) {
        toast.success(`Test ${side} trade placed successfully!`);
      } else {
        toast.info(`Trade not placed: ${data?.signal_reason || data?.message || 'unknown reason'}`);
      }
      loadDeployment();
    } catch (error) {
      console.error('Error forcing trade:', error);
      toast.error('Failed to force trade');
    } finally {
      setForcingTrade(null);
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

  // Parse last runner log for status display
  const lastLog = deployment?.last_runner_log;

  // Check if market is currently open (RTH: 9:30 AM - 4:00 PM ET, Mon-Fri)
  function isMarketOpen(): boolean {
    const now = new Date();
    const etOptions = { timeZone: 'America/New_York' };
    const etString = now.toLocaleString('en-US', etOptions);
    const etDate = new Date(etString);
    const hour = etDate.getHours();
    const minute = etDate.getMinutes();
    const dayOfWeek = etDate.getDay();
    
    return dayOfWeek >= 1 && dayOfWeek <= 5 && 
      ((hour === 9 && minute >= 30) || (hour >= 10 && hour < 16));
  }

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
        <Button 
          variant="outline" 
          onClick={handleSync} 
          disabled={syncing} 
          className="gap-2"
          title="Fetch latest positions and orders from Alpaca"
        >
          <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
          Sync with Alpaca
        </Button>
        {deployment.status === 'running' && !deployment.current_position && (
          <>
            <Button 
              variant="outline" 
              onClick={() => handleForceTrade('long')} 
              disabled={!!forcingTrade || !isMarketOpen()}
              className="gap-2 border-success/50 text-success hover:bg-success/10 disabled:opacity-50"
              title={isMarketOpen() ? "Force a test LONG trade to verify Alpaca connectivity" : "Market closed - testing disabled"}
            >
              {forcingTrade === 'long' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
              Test Long
            </Button>
            <Button 
              variant="outline" 
              onClick={() => handleForceTrade('short')} 
              disabled={!!forcingTrade || !isMarketOpen()}
              className="gap-2 border-destructive/50 text-destructive hover:bg-destructive/10 disabled:opacity-50"
              title={isMarketOpen() ? "Force a test SHORT trade to verify Alpaca connectivity" : "Market closed - testing disabled"}
            >
              {forcingTrade === 'short' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
              Test Short
            </Button>
          </>
        )}
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
        {/* Info Banner */}
        <div className="p-4 rounded-lg border border-primary/30 bg-primary/5">
          <h4 className="font-medium text-sm mb-1">How Paper Trading Works</h4>
          <p className="text-sm text-muted-foreground">
            Paper trading runs against Alpaca's paper trading API. The bot executes <strong>automatically every 5 minutes</strong> during 
            market hours (9:30 AM - 4:00 PM ET). Click <strong>"Sync with Alpaca"</strong> to refresh data. 
            Use <strong>"Test Long/Short"</strong> buttons to verify Alpaca order placement works.
          </p>
        </div>

        {/* Status bar */}
        <div className="flex items-center gap-4 flex-wrap">
          <StatusBadge status={deployment.status} />
          {deployment.halted && (
            <span className="text-destructive font-medium text-sm flex items-center gap-1">
              <AlertTriangle className="w-4 h-4" />
              HALTED: {deployment.halt_reason}
            </span>
          )}
          <span className="text-sm text-muted-foreground">
            Started: {deployment.started_at ? format(new Date(deployment.started_at), 'MMM d, yyyy HH:mm') : '—'}
          </span>
          <span className="text-sm text-muted-foreground">
            Target: {deployment.target_days} days
          </span>
          <span className="text-sm text-muted-foreground">
            Symbols: {deployment.symbols?.join(', ') || 'QQQ'}
          </span>
          {deployment.passed !== null && (
            <span className={deployment.passed ? 'text-success font-medium' : 'text-destructive font-medium'}>
              {deployment.passed ? '✓ PASSED' : '✗ FAILED'}
            </span>
          )}
        </div>

        {/* Live Trading Status - Enhanced with real-time data */}
        {deployment.status === 'running' && (
          <div className="p-4 rounded-lg border border-border bg-muted/30 space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <Activity className="w-4 h-4 text-primary" />
              <span className="font-medium text-sm">Live Strategy Status</span>
              {lastLog?.ts && (
                <span className="text-xs text-muted-foreground ml-auto">
                  Last update: {format(new Date(lastLog.ts), 'HH:mm:ss')}
                </span>
              )}
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <span className="text-xs text-muted-foreground">Last Signal</span>
                <p className="font-mono text-sm">
                  <span className={
                    deployment.last_signal_type === 'entry_long' ? 'text-success' :
                    deployment.last_signal_type === 'entry_short' ? 'text-destructive' :
                    'text-muted-foreground'
                  }>
                    {deployment.last_signal_type || 'none'}
                  </span>
                  {deployment.last_signal_at && (
                    <span className="text-muted-foreground ml-1">
                      @ {format(new Date(deployment.last_signal_at), 'HH:mm')}
                    </span>
                  )}
                </p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Current Position</span>
                <p className="font-mono text-sm">
                  {deployment.current_position ? (
                    <span className={deployment.current_position.side === 'long' ? 'text-success' : 'text-destructive'}>
                      {deployment.current_position.side.toUpperCase()} {deployment.current_position.qty} @ ${deployment.current_position.entry_price?.toFixed(2)}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Flat</span>
                  )}
                </p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Daily P&L</span>
                <p className={`font-mono text-sm ${(deployment.daily_pnl || 0) >= 0 ? 'text-success' : 'text-destructive'}`}>
                  ${(deployment.daily_pnl || 0).toFixed(2)}
                </p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Today's Trades</span>
                <p className="font-mono text-sm">{deployment.daily_trades || 0}</p>
              </div>
            </div>

            {/* Breakout Levels - Real-time strategy data */}
            {(deployment.last_bar_price || deployment.breakout_high) && (
              <div className="pt-3 border-t border-border/50">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div>
                    <span className="text-xs text-muted-foreground">Latest Bar Price</span>
                    <p className="font-mono text-sm">
                      ${deployment.last_bar_price?.toFixed(2) || '—'}
                      {deployment.last_bar_time && (
                        <span className="text-muted-foreground ml-1 text-xs">
                          ({format(new Date(deployment.last_bar_time), 'HH:mm')})
                        </span>
                      )}
                    </p>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">Upper Breakout</span>
                    <p className="font-mono text-sm text-success">
                      ${deployment.breakout_high?.toFixed(2) || '—'}
                    </p>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">Lower Breakout</span>
                    <p className="font-mono text-sm text-destructive">
                      ${deployment.breakout_low?.toFixed(2) || '—'}
                    </p>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">Market Status</span>
                    <p className="font-mono text-sm">
                      {lastLog?.market_open ? (
                        <span className="text-success">● Open</span>
                      ) : (
                        <span className="text-muted-foreground">● Closed</span>
                      )}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Last Signal Reason */}
            {lastLog?.message && (
              <div className="pt-3 border-t border-border/50">
                <span className="text-xs text-muted-foreground">Last Signal Reason</span>
                <p className="font-mono text-sm text-muted-foreground">{lastLog.message}</p>
              </div>
            )}
          </div>
        )}

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
            <TabsTrigger value="logs" className="gap-2">
              <Activity className="w-4 h-4" />
              Runner Logs ({runnerLogs.length})
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
              <h3 className="font-medium mb-4">Equity Curve ({snapshots.length} snapshots)</h3>
              {equityData.length > 0 ? (
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsLineChart data={equityData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="time" className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                      <YAxis className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} domain={['auto', 'auto']} />
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
                  No equity data yet. Snapshots are recorded every 5 minutes during market hours.
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="logs">
            <div className="terminal-card">
              <div className="p-4 border-b border-border">
                <h3 className="font-medium">Runner Execution Logs</h3>
                <p className="text-sm text-muted-foreground">Detailed logs from each paper-runner execution showing market data, signals, and orders.</p>
              </div>
              {runnerLogs.length > 0 ? (
                <div className="max-h-[500px] overflow-y-auto">
                  <table className="data-table">
                    <thead className="sticky top-0 bg-card">
                      <tr>
                        <th>Time</th>
                        <th>Type</th>
                        <th>Message</th>
                        <th>Data</th>
                      </tr>
                    </thead>
                    <tbody>
                      {runnerLogs.map((log) => (
                        <tr key={log.id}>
                          <td className="font-mono text-xs whitespace-nowrap">
                            {format(new Date(log.ts), 'MMM d HH:mm:ss')}
                          </td>
                          <td>
                            <span className={`text-xs px-2 py-0.5 rounded ${
                              log.log_type === 'order' ? 'bg-primary/20 text-primary' :
                              log.log_type === 'signal' ? 'bg-blue-500/20 text-blue-400' :
                              log.log_type === 'error' ? 'bg-destructive/20 text-destructive' :
                              'bg-muted text-muted-foreground'
                            }`}>
                              {log.log_type}
                            </span>
                          </td>
                          <td className="font-mono text-sm max-w-md truncate" title={log.message}>
                            {log.message}
                          </td>
                          <td className="text-xs text-muted-foreground max-w-xs">
                            {log.data_json && (
                              <details className="cursor-pointer">
                                <summary className="hover:text-foreground">View data</summary>
                                <pre className="mt-2 p-2 bg-muted rounded text-xs overflow-auto max-h-40">
                                  {JSON.stringify(log.data_json, null, 2)}
                                </pre>
                              </details>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No runner logs yet. Logs appear when paper-runner executes during market hours.
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
                  No orders yet. Use "Test Long" or "Test Short" buttons to verify order placement.
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
                        <td className="font-mono">${parseFloat(pos.avg_entry_price || pos.entry_price || 0).toFixed(2)}</td>
                        <td className="font-mono">${parseFloat(pos.current_price || 0).toFixed(2)}</td>
                        <td className="font-mono">${parseFloat(pos.market_value || 0).toFixed(2)}</td>
                        <td className={parseFloat(pos.unrealized_pl || 0) >= 0 ? 'text-success' : 'text-destructive'}>
                          ${parseFloat(pos.unrealized_pl || 0).toFixed(2)}
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
                        <td className="text-destructive">{(metric.drawdown * 100).toFixed(2)}%</td>
                        <td>{metric.trades_count}</td>
                        <td className="font-mono">${metric.equity_end.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No daily metrics yet. Metrics are recorded at the end of each trading day.
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>

        {/* Pass criteria */}
        <div className="terminal-card p-6">
          <h3 className="font-medium mb-4">Pass Criteria</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {deployment.pass_criteria?.max_dd !== undefined && (
              <div className="flex justify-between items-center p-3 bg-muted/30 rounded">
                <span className="text-sm text-muted-foreground">Max Drawdown</span>
                <span className="font-mono">{(deployment.pass_criteria.max_dd * 100).toFixed(1)}%</span>
              </div>
            )}
            {deployment.pass_criteria?.max_daily_loss !== undefined && (
              <div className="flex justify-between items-center p-3 bg-muted/30 rounded">
                <span className="text-sm text-muted-foreground">Max Daily Loss</span>
                <span className="font-mono">${deployment.pass_criteria.max_daily_loss}</span>
              </div>
            )}
            {deployment.pass_criteria?.min_trades !== undefined && (
              <div className="flex justify-between items-center p-3 bg-muted/30 rounded">
                <span className="text-sm text-muted-foreground">Min Trades Required</span>
                <span className="font-mono">{deployment.pass_criteria.min_trades}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
