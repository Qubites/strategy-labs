import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { MainLayout } from '@/components/layout/MainLayout';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/status-badge';
import { MetricCard } from '@/components/ui/metric-card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AICoachCard } from '@/components/AICoachCard';
import { AIAdviceHistory } from '@/components/AIAdviceHistory';
import { VersionTimeline } from '@/components/VersionTimeline';
import { VersionEditorDialog } from '@/components/VersionEditorDialog';
import { ExpectedBehavior } from '@/components/ExpectedBehavior';
import { LifecycleStatusBadge, PipelineProgress, type LifecycleStatus } from '@/components/LifecycleStatus';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import {
  ArrowLeft,
  Play,
  Settings2,
  History,
  FileText,
  Sparkles,
  TrendingUp,
  DollarSign,
  BarChart3,
  AlertTriangle,
  ArrowUpRight,
  Loader2,
  Brain,
  Zap,
  FileCheck,
  Plus,
} from 'lucide-react';
import type { Bot as BotType, BotVersion, Run, Trade, ParamSchema } from '@/types/trading';

export default function BotDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [bot, setBot] = useState<BotType | null>(null);
  const [versions, setVersions] = useState<BotVersion[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [schema, setSchema] = useState<ParamSchema | null>(null);
  const [loading, setLoading] = useState(true);
  const [promoting, setPromoting] = useState<string | null>(null);

  useEffect(() => {
    if (id) loadBotDetails();
  }, [id]);

  async function loadBotDetails() {
    try {
      // Load bot with template
      const { data: botData, error: botError } = await supabase
        .from('bots')
        .select(`
          *,
          strategy_templates (*)
        `)
        .eq('id', id)
        .single();

      if (botError) throw botError;
      setBot(botData);

      // Parse schema
      if (botData.strategy_templates?.param_schema_json) {
        setSchema(JSON.parse(botData.strategy_templates.param_schema_json));
      }

      // Load versions
      const { data: versionsData } = await supabase
        .from('bot_versions')
        .select('*')
        .eq('bot_id', id)
        .order('version_number', { ascending: false });

      setVersions(versionsData || []);

      // Load runs with metrics
      const { data: runsData } = await supabase
        .from('runs')
        .select(`
          *,
          run_metrics (*),
          datasets (symbol, timeframe)
        `)
        .in('bot_version_id', (versionsData || []).map((v) => v.id))
        .order('created_at', { ascending: false })
        .limit(20);

      setRuns(runsData || []);

      // Load recent trades
      if (runsData && runsData.length > 0) {
        const { data: tradesData } = await supabase
          .from('trades')
          .select('*')
          .in('run_id', runsData.map((r) => r.id))
          .order('ts_entry', { ascending: false })
          .limit(50);

        setTrades(tradesData || []);
      }
    } catch (error) {
      console.error('Error loading bot:', error);
      toast.error('Failed to load bot details');
    } finally {
      setLoading(false);
    }
  }

  async function handlePromote(versionId: string, target: string) {
    setPromoting(versionId);
    try {
      const { data, error } = await supabase.functions.invoke('promote-bot', {
        body: { bot_version_id: versionId, target },
      });

      if (error) throw error;

      if (data.error) {
        toast.error(data.error, {
          description: data.details?.join('\n'),
        });
        return;
      }

      toast.success(`Version promoted to ${target}`);
      loadBotDetails();
    } catch (error) {
      console.error('Error promoting:', error);
      toast.error('Failed to promote version');
    } finally {
      setPromoting(null);
    }
  }

  function getNextPromotion(status: string): string | null {
    switch (status) {
      case 'draft': return 'backtested';
      case 'backtested': return 'approved_paper';
      case 'approved_paper': return 'approved_live';
      default: return null;
    }
  }

  const latestVersion = versions[0];
  const latestParams = latestVersion ? JSON.parse(latestVersion.params_json) : {};
  const latestRiskLimits = latestVersion ? JSON.parse(latestVersion.risk_limits_json) : {};

  // Calculate aggregate metrics
  const completedRuns = runs.filter((r) => r.status === 'done' && r.run_metrics);
  const totalTrades = completedRuns.reduce((sum, r: any) => sum + (r.run_metrics?.trades_count || 0), 0);
  const totalPnL = completedRuns.reduce((sum, r: any) => sum + (parseFloat(r.run_metrics?.net_pnl_usd) || 0), 0);
  const avgPF = completedRuns.length > 0
    ? completedRuns.reduce((sum, r: any) => sum + (parseFloat(r.run_metrics?.profit_factor) || 0), 0) / completedRuns.length
    : 0;

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-96">
          <div className="text-muted-foreground">Loading...</div>
        </div>
      </MainLayout>
    );
  }

  if (!bot) {
    return (
      <MainLayout>
        <div className="flex flex-col items-center justify-center h-96">
          <AlertTriangle className="w-12 h-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium">Bot not found</h3>
          <Link to="/bots">
            <Button variant="outline" className="mt-4">
              Back to Bots
            </Button>
          </Link>
        </div>
      </MainLayout>
    );
  }

  const lifecycleStatus = (latestVersion as any)?.lifecycle_status as LifecycleStatus || 'DRAFT';

  return (
    <MainLayout>
      <PageHeader title={bot.name} description={`Template: ${bot.template_id}`}>
        <Button variant="outline" onClick={() => navigate('/bots')} className="gap-2">
          <ArrowLeft className="w-4 h-4" />
          Back
        </Button>
        <Link to={`/bots/${bot.id}/run`}>
          <Button className="gap-2">
            <Play className="w-4 h-4" />
            Start Run
          </Button>
        </Link>
      </PageHeader>

      <div className="px-8 pb-8 space-y-6">
        {/* Pipeline Progress */}
        <div className="terminal-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-medium">Pipeline Progress</h3>
            <div className="flex items-center gap-2">
              <Link to={`/bots/${bot.id}/tuner`}>
                <Button variant="outline" size="sm" className="gap-2">
                  <Brain className="w-4 h-4" />
                  Auto Tuner
                </Button>
              </Link>
              {lifecycleStatus === 'BACKTEST_WINNER' && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={async () => {
                    try {
                      const { data: datasets } = await supabase
                        .from('datasets')
                        .select('id')
                        .limit(1)
                        .single();
                      if (datasets) {
                        const { error } = await supabase.functions.invoke('stress-test', {
                          body: { version_id: latestVersion.id, dataset_id: datasets.id }
                        });
                        if (error) throw error;
                        toast.success('Stress test started');
                        loadBotDetails();
                      }
                    } catch (e) {
                      toast.error('Failed to start stress test');
                    }
                  }}
                >
                  <Zap className="w-4 h-4" />
                  Run Stress Test
                </Button>
              )}
              {lifecycleStatus === 'BACKTEST_WINNER' && (
                <Button
                  size="sm"
                  className="gap-2"
                  onClick={async () => {
                    try {
                      const { data, error } = await supabase.functions.invoke('paper-start', {
                        body: { bot_id: bot.id, bot_version_id: latestVersion.id }
                      });
                      if (error) throw error;
                      toast.success('Paper trading started');
                      navigate(`/paper/${data.deployment_id}`);
                    } catch (e: any) {
                      toast.error(e.message || 'Failed to start paper trading');
                    }
                  }}
                >
                  <FileCheck className="w-4 h-4" />
                  Start Paper Trading
                </Button>
              )}
            </div>
          </div>
          <PipelineProgress currentStatus={lifecycleStatus} />
        </div>

        {/* Status & Version */}
        <div className="flex items-center gap-4 flex-wrap">
          <LifecycleStatusBadge status={lifecycleStatus} />
          <StatusBadge status={latestVersion?.status || 'draft'} />
          <span className="text-sm text-muted-foreground">
            Version {latestVersion?.version_number || 1}
          </span>
          <span className="text-xs font-mono text-muted-foreground">
            Hash: {latestVersion?.version_hash?.slice(0, 8)}
          </span>
          {latestVersion && getNextPromotion(latestVersion.status) && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePromote(latestVersion.id, getNextPromotion(latestVersion.status)!)}
              disabled={promoting === latestVersion.id}
              className="gap-1 ml-auto"
            >
              {promoting === latestVersion.id ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <ArrowUpRight className="w-3 h-3" />
              )}
              Promote to {getNextPromotion(latestVersion.status)}
            </Button>
          )}
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <MetricCard
            label="Total PnL"
            value={`$${totalPnL.toFixed(2)}`}
            icon={DollarSign}
            valueClassName={totalPnL >= 0 ? 'text-success' : 'text-destructive'}
          />
          <MetricCard
            label="Avg Profit Factor"
            value={avgPF.toFixed(2)}
            icon={TrendingUp}
            valueClassName={avgPF > 1 ? 'text-success' : 'text-destructive'}
          />
          <MetricCard
            label="Total Trades"
            value={totalTrades}
            icon={BarChart3}
          />
          <MetricCard
            label="Completed Runs"
            value={completedRuns.length}
            icon={Play}
          />
        </div>

        {/* Tabs */}
        <Tabs defaultValue="params" className="space-y-6">
          <TabsList>
            <TabsTrigger value="params" className="gap-2">
              <Settings2 className="w-4 h-4" />
              Parameters
            </TabsTrigger>
            <TabsTrigger value="versions" className="gap-2">
              <History className="w-4 h-4" />
              Versions
            </TabsTrigger>
            <TabsTrigger value="runs" className="gap-2">
              <Play className="w-4 h-4" />
              Runs
            </TabsTrigger>
            <TabsTrigger value="trades" className="gap-2">
              <FileText className="w-4 h-4" />
              Trades
            </TabsTrigger>
            <TabsTrigger value="ai" className="gap-2">
              <Sparkles className="w-4 h-4" />
              AI Advice
            </TabsTrigger>
          </TabsList>

          <TabsContent value="params">
            <div className="space-y-6">
              {/* Create New Version Button */}
              <div className="flex justify-end">
                <VersionEditorDialog
                  botId={bot.id}
                  templateId={bot.template_id}
                  sourceVersion={latestVersion}
                  nextVersionNumber={Math.max(...versions.map(v => v.version_number), 0) + 1}
                  onVersionCreated={loadBotDetails}
                  trigger={
                    <Button className="gap-2">
                      <Plus className="w-4 h-4" />
                      Create New Version
                    </Button>
                  }
                />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Strategy Parameters */}
                <div className="terminal-card p-6">
                  <h3 className="font-medium mb-4">Strategy Parameters</h3>
                  <div className="space-y-3">
                    {schema?.params.map((param) => (
                      <div key={param.key} className="flex justify-between py-2 border-b border-border/50">
                        <span className="text-muted-foreground">{param.label}</span>
                        <span className="font-mono text-primary">
                          {String(latestParams[param.key] ?? param.default)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Risk Limits */}
                <div className="terminal-card p-6">
                  <h3 className="font-medium mb-4">Risk Limits</h3>
                  <div className="space-y-3">
                    <div className="flex justify-between py-2 border-b border-border/50">
                      <span className="text-muted-foreground">Preset</span>
                      <span className="font-medium">{latestRiskLimits.preset || 'Normal'}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-border/50">
                      <span className="text-muted-foreground">Max Position Size</span>
                      <span className="font-mono">${latestRiskLimits.max_position_size_usd}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-border/50">
                      <span className="text-muted-foreground">Max Daily Loss</span>
                      <span className="font-mono">${latestRiskLimits.max_daily_loss_usd}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-border/50">
                      <span className="text-muted-foreground">Max Drawdown</span>
                      <span className="font-mono">${latestRiskLimits.max_drawdown_usd}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-border/50">
                      <span className="text-muted-foreground">Max Consecutive Losses</span>
                      <span className="font-mono">{latestRiskLimits.max_consecutive_losses}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="versions">
            <div className="terminal-card p-6">
              <VersionTimeline 
                versions={versions} 
                botId={bot.id}
                templateId={bot.template_id}
                onVersionCreated={loadBotDetails}
              />
            </div>
          </TabsContent>

          <TabsContent value="runs">
            <div className="terminal-card">
              {runs.length > 0 ? (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th>Dataset</th>
                      <th>Status</th>
                      <th>PF</th>
                      <th>Net PnL</th>
                      <th>Trades</th>
                      <th>Started</th>
                    </tr>
                  </thead>
                  <tbody>
                    {runs.map((run: any) => (
                      <tr 
                        key={run.id}
                        onClick={() => navigate(`/runs/${run.id}`)}
                        className="cursor-pointer hover:bg-muted/50 transition-colors"
                      >
                        <td className="capitalize">{run.run_type}</td>
                        <td className="font-mono text-sm">
                          {run.datasets?.symbol || '—'} {run.datasets?.timeframe}
                        </td>
                        <td>
                          <StatusBadge status={run.status} />
                        </td>
                        <td className={parseFloat(run.run_metrics?.profit_factor) > 1 ? 'text-success' : 'text-destructive'}>
                          {run.run_metrics?.profit_factor?.toFixed(2) || '—'}
                        </td>
                        <td className={parseFloat(run.run_metrics?.net_pnl_usd) >= 0 ? 'text-success' : 'text-destructive'}>
                          ${run.run_metrics?.net_pnl_usd?.toFixed(2) || '—'}
                        </td>
                        <td>{run.run_metrics?.trades_count || 0}</td>
                        <td className="text-sm text-muted-foreground">
                          {format(new Date(run.start_ts), 'MMM d, HH:mm')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No runs yet. Start your first backtest!
                </div>
              )}
            </div>
          </TabsContent>

          {/* Expected Behavior Section */}
          {latestVersion && schema && (
            <div className="mt-6">
              <ExpectedBehavior 
                params={latestParams} 
                templateId={bot.template_id}
              />
            </div>
          )}

          <TabsContent value="trades">
            <div className="terminal-card">
              {trades.length > 0 ? (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Entry</th>
                      <th>Exit</th>
                      <th>Side</th>
                      <th>Qty</th>
                      <th>Entry Price</th>
                      <th>Exit Price</th>
                      <th>PnL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trades.map((trade) => (
                      <tr key={trade.id}>
                        <td className="text-sm">
                          {format(new Date(trade.ts_entry), 'MMM d, HH:mm')}
                        </td>
                        <td className="text-sm">
                          {trade.ts_exit ? format(new Date(trade.ts_exit), 'MMM d, HH:mm') : '—'}
                        </td>
                        <td className={trade.side === 'long' ? 'text-success' : 'text-destructive'}>
                          {trade.side.toUpperCase()}
                        </td>
                        <td className="font-mono">{trade.qty}</td>
                        <td className="font-mono">${trade.entry_price}</td>
                        <td className="font-mono">{trade.exit_price ? `$${trade.exit_price}` : '—'}</td>
                        <td className={Number(trade.pnl_usd) >= 0 ? 'text-success' : 'text-destructive'}>
                          {trade.pnl_usd ? `$${trade.pnl_usd}` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No trades yet. Complete a backtest to see trades.
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="ai">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <AICoachCard 
                botVersionId={latestVersion?.id || ''} 
                onAdviceApplied={loadBotDetails}
              />
              <div>
                <h3 className="font-medium mb-4">Advice History</h3>
                <AIAdviceHistory botId={id!} />
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
