import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { MainLayout } from '@/components/layout/MainLayout';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { IterationHistory } from '@/components/experiments/IterationHistory';
import { AutomationControls } from '@/components/experiments/AutomationControls';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Trophy,
  GitBranch,
  BarChart3,
  History,
  Crown,
  TrendingUp,
  TrendingDown,
  Loader2,
  Play,
  Zap,
  Settings,
} from 'lucide-react';
import type { ExperimentGroupWithDetails } from '@/types/experiments';
import type { BotVersion } from '@/types/trading';

interface VersionWithMetrics extends BotVersion {
  best_pf?: number;
  best_pnl?: number;
  best_win_rate?: number;
  runs_count?: number;
  bot?: {
    id: string;
    name: string;
  };
}

export default function ExperimentGroupDetail() {
  const { id } = useParams<{ id: string }>();
  const [group, setGroup] = useState<ExperimentGroupWithDetails | null>(null);
  const [versions, setVersions] = useState<VersionWithMetrics[]>([]);
  const [loading, setLoading] = useState(true);
  const [settingChampion, setSettingChampion] = useState<string | null>(null);
  const [runningIterations, setRunningIterations] = useState(false);
  const [iterationSettings, setIterationSettings] = useState({
    maxIterations: 5,
    aggressiveness: 0.5,
  });

  useEffect(() => {
    if (id) loadGroup();
  }, [id]);

  async function loadGroup() {
    try {
      // Load group
      const { data: groupData, error } = await supabase
        .from('experiment_groups')
        .select(`
          *,
          strategy_templates (id, name),
          datasets (id, symbol, timeframe, session)
        `)
        .eq('id', id)
        .single();

      if (error) throw error;
      setGroup(groupData as unknown as ExperimentGroupWithDetails);

      // Load versions with their best metrics
      const { data: versionsData } = await supabase
        .from('bot_versions')
        .select(`
          *,
          bots (id, name)
        `)
        .eq('experiment_group_id', id)
        .order('created_at', { ascending: false });

      if (versionsData) {
        const enrichedVersions = await Promise.all(
          versionsData.map(async (version) => {
            const { data: runs } = await supabase
              .from('runs')
              .select('run_metrics(*)')
              .eq('bot_version_id', version.id)
              .eq('status', 'done');

            let bestPf = 0;
            let bestPnl = -Infinity;
            let bestWinRate = 0;

            (runs || []).forEach((run: any) => {
              if (run.run_metrics) {
                const pf = parseFloat(run.run_metrics.profit_factor) || 0;
                const pnl = parseFloat(run.run_metrics.net_pnl_usd) || 0;
                const wr = parseFloat(run.run_metrics.win_rate) || 0;
                if (pf > bestPf) bestPf = pf;
                if (pnl > bestPnl) bestPnl = pnl;
                if (wr > bestWinRate) bestWinRate = wr;
              }
            });

            return {
              ...version,
              best_pf: bestPf,
              best_pnl: bestPnl === -Infinity ? 0 : bestPnl,
              best_win_rate: bestWinRate,
              runs_count: runs?.length || 0,
              bot: version.bots,
            } as VersionWithMetrics;
          })
        );

        // Sort by composite score (based on objective config)
        const config = (groupData.objective_config as any) || {
          pf_weight: 0.35,
          return_weight: 0.25,
          sharpe_weight: 0.25,
          dd_penalty: 0.15,
        };

        enrichedVersions.sort((a, b) => {
          const scoreA = (a.best_pf || 0) * config.pf_weight + (a.best_pnl || 0) / 1000 * config.return_weight;
          const scoreB = (b.best_pf || 0) * config.pf_weight + (b.best_pnl || 0) / 1000 * config.return_weight;
          return scoreB - scoreA;
        });

        setVersions(enrichedVersions);
      }
    } catch (error) {
      console.error('Error loading group:', error);
      toast.error('Failed to load experiment group');
    } finally {
      setLoading(false);
    }
  }

  async function setChampion(versionId: string) {
    setSettingChampion(versionId);
    try {
      // Unset previous champion
      await supabase
        .from('bot_versions')
        .update({ is_champion: false })
        .eq('experiment_group_id', id);

      // Set new champion
      await supabase
        .from('bot_versions')
        .update({ is_champion: true })
        .eq('id', versionId);

      // Update group
      await supabase
        .from('experiment_groups')
        .update({ champion_version_id: versionId })
        .eq('id', id);

      toast.success('Champion set successfully');
      loadGroup();
    } catch (error) {
      toast.error('Failed to set champion');
    } finally {
      setSettingChampion(null);
    }
  }

  async function runIterations() {
    if (!id) return;
    
    setRunningIterations(true);
    try {
      const response = await supabase.functions.invoke('iteration-engine', {
        body: {
          experiment_group_id: id,
          trigger_type: 'auto_tuner',
          max_iterations: iterationSettings.maxIterations,
          mutation_aggressiveness: iterationSettings.aggressiveness,
        },
      });

      if (response.error) throw response.error;

      const result = response.data;
      toast.success(
        `Completed ${result.iterations_run} iterations. ${result.successful_iterations} improvements found.`
      );
      loadGroup();
    } catch (error: any) {
      toast.error(error.message || 'Failed to run iterations');
    } finally {
      setRunningIterations(false);
    }
  }

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-96">
          <div className="text-muted-foreground">Loading...</div>
        </div>
      </MainLayout>
    );
  }

  if (!group) {
    return (
      <MainLayout>
        <div className="flex flex-col items-center justify-center h-96">
          <h3 className="text-lg font-medium">Experiment group not found</h3>
          <Link to="/experiment-groups">
            <Button variant="outline" className="mt-4">
              Back to Groups
            </Button>
          </Link>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <PageHeader title={group.name} description="Experiment Group Leaderboard">
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => window.history.back()} className="gap-2">
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>
          <Button
            onClick={runIterations}
            disabled={runningIterations}
            className="gap-2"
          >
            {runningIterations ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Zap className="w-4 h-4" />
            )}
            Run Auto-Iterations
          </Button>
        </div>
      </PageHeader>

      <div className="px-8 pb-8 space-y-6">
        {/* Group Info */}
        <div className="terminal-card p-4">
          <div className="flex flex-wrap gap-2 text-sm">
            <Badge variant="outline">
              <GitBranch className="w-3 h-3 mr-1" />
              {group.strategy_templates?.name || group.template_id}
            </Badge>
            <Badge variant="outline">
              {group.datasets?.symbol || 'Any Dataset'} • {group.timeframe}
            </Badge>
            <Badge variant="outline">{group.session}</Badge>
            <Badge variant="outline">{versions.length} versions</Badge>
            {group.champion_version_id && (
              <Badge className="bg-amber-500/20 text-amber-500 border-amber-500/30">
                <Trophy className="w-3 h-3 mr-1" />
                Champion Set
              </Badge>
            )}
          </div>
        </div>

        <Tabs defaultValue="leaderboard" className="space-y-6">
          <TabsList>
            <TabsTrigger value="leaderboard" className="gap-2">
              <BarChart3 className="w-4 h-4" />
              Leaderboard
            </TabsTrigger>
            <TabsTrigger value="iterations" className="gap-2">
              <History className="w-4 h-4" />
              Iterations
            </TabsTrigger>
          </TabsList>

          <TabsContent value="leaderboard">
            <div className="terminal-card overflow-hidden">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="w-12">#</th>
                    <th>Version</th>
                    <th>Bot</th>
                    <th>Status</th>
                    <th>PF</th>
                    <th>PnL</th>
                    <th>Win Rate</th>
                    <th>Runs</th>
                    <th className="w-24">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {versions.map((version, index) => {
                    const isChampion = version.id === group.champion_version_id;
                    return (
                      <tr key={version.id} className={isChampion ? 'bg-amber-500/5' : ''}>
                        <td className="font-medium">
                          {isChampion ? (
                            <Crown className="w-4 h-4 text-amber-500" />
                          ) : (
                            index + 1
                          )}
                        </td>
                        <td className="font-mono">v{version.version_number}</td>
                        <td>
                          <Link
                            to={`/bots/${version.bot?.id}`}
                            className="text-primary hover:underline"
                          >
                            {version.bot?.name || 'Unknown'}
                          </Link>
                        </td>
                        <td>
                          <Badge variant="outline" className="capitalize">
                            {version.status}
                          </Badge>
                        </td>
                        <td>
                          <span className={`flex items-center gap-1 ${
                            (version.best_pf || 0) > 1 ? 'text-success' : 'text-destructive'
                          }`}>
                            {(version.best_pf || 0) > 1 ? (
                              <TrendingUp className="w-3 h-3" />
                            ) : (
                              <TrendingDown className="w-3 h-3" />
                            )}
                            {version.best_pf?.toFixed(2) || '—'}
                          </span>
                        </td>
                        <td className={
                          (version.best_pnl || 0) >= 0 ? 'text-success' : 'text-destructive'
                        }>
                          ${(version.best_pnl || 0).toFixed(2)}
                        </td>
                        <td>{((version.best_win_rate || 0) * 100).toFixed(1)}%</td>
                        <td>{version.runs_count}</td>
                        <td>
                          {!isChampion && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setChampion(version.id)}
                              disabled={settingChampion === version.id}
                            >
                              {settingChampion === version.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Crown className="w-4 h-4" />
                              )}
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {versions.length === 0 && (
                <div className="p-8 text-center text-muted-foreground">
                  No versions in this experiment group yet.
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="iterations">
            <div className="terminal-card p-4">
              {id && <IterationHistory experimentGroupId={id} />}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
