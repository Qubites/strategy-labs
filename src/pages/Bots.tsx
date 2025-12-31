import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { MainLayout } from '@/components/layout/MainLayout';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/status-badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Plus, Bot, MoreVertical, Play, Copy, Archive, Eye } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { format } from 'date-fns';
import type { Bot as BotType, BotVersion, StrategyTemplate } from '@/types/trading';

interface BotWithDetails extends BotType {
  strategy_templates: StrategyTemplate;
  bot_versions: BotVersion[];
}

export default function Bots() {
  const [bots, setBots] = useState<BotWithDetails[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadBots();
  }, []);

  async function loadBots() {
    try {
      const { data, error } = await supabase
        .from('bots')
        .select(`
          *,
          strategy_templates (*),
          bot_versions (
            *,
            runs (
              status,
              run_metrics (win_rate)
            )
          )
        `)
        .eq('archived', false)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setBots((data as BotWithDetails[]) || []);
    } catch (error) {
      console.error('Error loading bots:', error);
      toast.error('Failed to load bots');
    } finally {
      setLoading(false);
    }
  }

  function getBestWinRate(botVersions: any[]): number | null {
    let bestWinRate: number | null = null;
    for (const version of botVersions || []) {
      for (const run of version.runs || []) {
        if (run.status === 'done' && run.run_metrics?.win_rate != null) {
          const wr = parseFloat(run.run_metrics.win_rate);
          if (bestWinRate === null || wr > bestWinRate) {
            bestWinRate = wr;
          }
        }
      }
    }
    return bestWinRate;
  }

  async function handleDuplicate(bot: BotWithDetails) {
    try {
      const latestVersion = bot.bot_versions?.sort((a, b) => b.version_number - a.version_number)[0];
      if (!latestVersion) {
        toast.error('No version to duplicate');
        return;
      }

      // Create new bot
      const { data: newBot, error: botError } = await supabase
        .from('bots')
        .insert({
          name: `${bot.name} (Copy)`,
          template_id: bot.template_id,
        })
        .select()
        .single();

      if (botError) throw botError;

      // Create new version
      const { error: versionError } = await supabase
        .from('bot_versions')
        .insert({
          bot_id: newBot.id,
          version_number: 1,
          params_json: latestVersion.params_json,
          params_hash: `${latestVersion.params_hash}_copy_${Date.now()}`,
          risk_limits_json: latestVersion.risk_limits_json,
          version_hash: `${latestVersion.version_hash}_copy_${Date.now()}`,
          status: 'draft',
        });

      if (versionError) throw versionError;

      toast.success('Bot duplicated successfully');
      loadBots();
    } catch (error) {
      console.error('Error duplicating bot:', error);
      toast.error('Failed to duplicate bot');
    }
  }

  async function handleArchive(botId: string) {
    try {
      const { error } = await supabase
        .from('bots')
        .update({ archived: true })
        .eq('id', botId);

      if (error) throw error;
      toast.success('Bot archived');
      loadBots();
    } catch (error) {
      console.error('Error archiving bot:', error);
      toast.error('Failed to archive bot');
    }
  }

  return (
    <MainLayout>
      <PageHeader
        title="Bots"
        description="Manage your trading bots"
      >
        <Link to="/bots/new">
          <Button className="gap-2">
            <Plus className="w-4 h-4" />
            New Bot
          </Button>
        </Link>
      </PageHeader>

      <div className="px-8 pb-8">
        {loading ? (
          <div className="text-center py-12 text-muted-foreground">Loading bots...</div>
        ) : bots.length > 0 ? (
          <div className="terminal-card">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Template</th>
                  <th>Version</th>
                  <th>Status</th>
                  <th>Win Rate</th>
                  <th>Created</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {bots.map((bot) => {
                  const latestVersion = bot.bot_versions?.sort(
                    (a, b) => b.version_number - a.version_number
                  )[0];

                  return (
                    <tr key={bot.id}>
                      <td>
                        <Link
                          to={`/bots/${bot.id}`}
                          className="font-medium text-foreground hover:text-primary transition-colors"
                        >
                          {bot.name}
                        </Link>
                      </td>
                      <td className="font-mono text-sm text-muted-foreground">
                        {bot.template_id}
                      </td>
                      <td>v{latestVersion?.version_number || 1}</td>
                      <td>
                        <StatusBadge status={latestVersion?.status || 'draft'} />
                      </td>
                      <td>
                        {(() => {
                          const winRate = getBestWinRate(bot.bot_versions);
                          if (winRate === null) return <span className="text-muted-foreground">—</span>;
                          return (
                            <span className={winRate >= 0.5 ? 'text-success' : 'text-destructive'}>
                              {(winRate * 100).toFixed(1)}%
                            </span>
                          );
                        })()}
                      </td>
                      <td className="text-sm text-muted-foreground">
                        {format(new Date(bot.created_at), 'MMM d, yyyy HH:mm')}
                      </td>
                      <td>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild>
                              <Link to={`/bots/${bot.id}`}>
                                <Eye className="w-4 h-4 mr-2" />
                                View Details
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                              <Link to={`/bots/${bot.id}/run`}>
                                <Play className="w-4 h-4 mr-2" />
                                Start Run
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleDuplicate(bot)}>
                              <Copy className="w-4 h-4 mr-2" />
                              Duplicate
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => handleArchive(bot.id)}
                              className="text-destructive"
                            >
                              <Archive className="w-4 h-4 mr-2" />
                              Archive
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="terminal-card p-12 text-center">
            <Bot className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">No bots yet</h3>
            <p className="text-muted-foreground mb-6">
              Create your first trading bot from a strategy template
            </p>
            <Link to="/bots/new">
              <Button className="gap-2">
                <Plus className="w-4 h-4" />
                Create Bot
              </Button>
            </Link>
          </div>
        )}
      </div>
    </MainLayout>
  );
}
