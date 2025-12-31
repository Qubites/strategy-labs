import { useState, useEffect } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/status-badge';
import { ExperimentExport } from '@/components/ExperimentExport';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { FlaskConical, Trophy, ArrowUpRight, RefreshCw, Loader2, TrendingDown } from 'lucide-react';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import type { Bot, BotVersion, RunMetrics } from '@/types/trading';

interface ExperimentVariant {
  version: BotVersion;
  metrics: RunMetrics | null;
  runsCount: number;
}

interface ExperimentGroup {
  bot: Bot;
  variants: ExperimentVariant[];
}

export default function Experiments() {
  const navigate = useNavigate();
  const [experiments, setExperiments] = useState<ExperimentGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [promoting, setPromoting] = useState<string | null>(null);

  useEffect(() => {
    loadExperiments();
  }, []);

  async function loadExperiments() {
    try {
      // Fetch all bots with their versions
      const { data: bots, error: botsError } = await supabase
        .from('bots')
        .select('*, bot_versions(*)')
        .eq('archived', false)
        .order('created_at', { ascending: false });

      if (botsError) throw botsError;

      // Filter to only bots with 2+ versions (experiments)
      const experimentBots = (bots || []).filter(
        bot => bot.bot_versions && bot.bot_versions.length >= 2
      );

      // Fetch metrics for each version
      const experimentGroups: ExperimentGroup[] = [];

      for (const bot of experimentBots) {
        const variants: ExperimentVariant[] = [];

        for (const version of bot.bot_versions) {
          // Get runs and metrics for this version
          const { data: runs } = await supabase
            .from('runs')
            .select('*, run_metrics(*)')
            .eq('bot_version_id', version.id)
            .eq('status', 'done');

          // Get best metrics (highest PF)
          let bestMetrics: RunMetrics | null = null;
          if (runs && runs.length > 0) {
            for (const run of runs) {
              if (run.run_metrics) {
                if (!bestMetrics || (run.run_metrics.profit_factor || 0) > (bestMetrics.profit_factor || 0)) {
                  bestMetrics = run.run_metrics;
                }
              }
            }
          }

          variants.push({
            version,
            metrics: bestMetrics,
            runsCount: runs?.length || 0,
          });
        }

        // Sort variants by PF (highest first)
        variants.sort((a, b) => 
          (b.metrics?.profit_factor || 0) - (a.metrics?.profit_factor || 0)
        );

        experimentGroups.push({
          bot: { ...bot, bot_versions: undefined } as Bot,
          variants,
        });
      }

      setExperiments(experimentGroups);
    } catch (error) {
      console.error('Error loading experiments:', error);
      toast.error('Failed to load experiments');
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
      loadExperiments();
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

  return (
    <MainLayout>
      <PageHeader
        title="Experiments"
        description="Compare bot variants and run A/B tests"
      >
        <Button variant="outline" onClick={loadExperiments} className="gap-2">
          <RefreshCw className="w-4 h-4" />
          Refresh
        </Button>
        <ExperimentExport experiments={experiments} />
      </PageHeader>

      <div className="px-8 pb-8">
        {loading ? (
          <div className="text-center py-12 text-muted-foreground">
            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4" />
            Loading experiments...
          </div>
        ) : experiments.length > 0 ? (
          <div className="space-y-8">
            {experiments.map((exp) => (
              <div key={exp.bot.id} className="terminal-card">
                <div className="terminal-header">
                  <FlaskConical className="w-4 h-4 text-primary" />
                  <span className="font-medium">{exp.bot.name}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {exp.variants.length} variants
                  </span>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="ml-auto gap-1"
                    onClick={() => navigate(`/bots/${exp.bot.id}`)}
                  >
                    View Bot <ArrowUpRight className="w-3 h-3" />
                  </Button>
                </div>

                <div className="p-4">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th className="w-10"></th>
                        <th>Version</th>
                        <th>Status</th>
                        <th>Runs</th>
                        <th>Profit Factor</th>
                        <th>Net PnL</th>
                        <th>Trades</th>
                        <th>Win Rate</th>
                        <th>Max DD</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {exp.variants.map((variant, idx) => {
                        const isWinner = idx === 0 && variant.metrics?.profit_factor && variant.metrics.profit_factor > 1;
                        const isWorst = idx === exp.variants.length - 1 && exp.variants.length > 1 && variant.metrics?.profit_factor && variant.metrics.profit_factor < 1;
                        const nextPromotion = getNextPromotion(variant.version.status);

                        return (
                          <tr 
                            key={variant.version.id}
                            className={isWinner ? 'bg-green-500/5' : isWorst ? 'bg-red-500/5' : ''}
                          >
                            <td className="w-10">
                              {isWinner && (
                                <Trophy className="w-4 h-4 text-yellow-500" />
                              )}
                              {isWorst && (
                                <TrendingDown className="w-4 h-4 text-red-400" />
                              )}
                            </td>
                            <td className="font-mono font-bold">
                              v{variant.version.version_number}
                            </td>
                            <td>
                              <StatusBadge status={variant.version.status} />
                            </td>
                            <td>{variant.runsCount}</td>
                            <td className={
                              variant.metrics?.profit_factor && variant.metrics.profit_factor >= 1.5 
                                ? 'text-green-500 font-bold' 
                                : variant.metrics?.profit_factor && variant.metrics.profit_factor >= 1
                                  ? 'text-green-400'
                                  : 'text-red-400'
                            }>
                              {variant.metrics?.profit_factor?.toFixed(2) || '—'}
                            </td>
                            <td className={
                              (variant.metrics?.net_pnl_usd || 0) >= 0 
                                ? 'text-green-400' 
                                : 'text-red-400'
                            }>
                              ${variant.metrics?.net_pnl_usd?.toFixed(2) || '0.00'}
                            </td>
                            <td>{variant.metrics?.trades_count || 0}</td>
                            <td>
                              {variant.metrics?.win_rate 
                                ? `${(variant.metrics.win_rate * 100).toFixed(1)}%` 
                                : '—'}
                            </td>
                            <td className="text-red-400">
                              ${Math.abs(variant.metrics?.max_drawdown || 0).toFixed(2)}
                            </td>
                            <td>
                              {nextPromotion && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handlePromote(variant.version.id, nextPromotion)}
                                  disabled={promoting === variant.version.id}
                                  className="gap-1"
                                >
                                  {promoting === variant.version.id ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                  ) : (
                                    <ArrowUpRight className="w-3 h-3" />
                                  )}
                                  Promote
                                </Button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="terminal-card p-12 text-center">
            <FlaskConical className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">No Experiments Yet</h3>
            <p className="text-muted-foreground max-w-md mx-auto mb-6">
              Create A/B experiments by duplicating bots with parameter variations. 
              Go to a bot's detail page and use the "Duplicate" action to create variants.
            </p>
            <Button onClick={() => navigate('/bots')} className="gap-2">
              Go to Bots
            </Button>
          </div>
        )}
      </div>
    </MainLayout>
  );
}
