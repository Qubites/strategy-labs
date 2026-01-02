import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { MainLayout } from '@/components/layout/MainLayout';
import { PageHeader } from '@/components/ui/page-header';
import { ExperimentGroupCard } from '@/components/experiments/ExperimentGroupCard';
import { CreateExperimentGroupDialog } from '@/components/experiments/CreateExperimentGroupDialog';
import { supabase } from '@/integrations/supabase/client';
import { FlaskConical, AlertTriangle } from 'lucide-react';
import type { ExperimentGroupWithDetails } from '@/types/experiments';

export default function ExperimentGroupsPage() {
  const [groups, setGroups] = useState<ExperimentGroupWithDetails[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadGroups();
  }, []);

  async function loadGroups() {
    try {
      const { data, error } = await supabase
        .from('experiment_groups')
        .select(`
          *,
          strategy_templates (id, name),
          datasets (id, symbol, timeframe, session)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Enrich with version counts and best metrics
      const enrichedGroups = await Promise.all(
        (data || []).map(async (group) => {
          // Count versions in this group
          const { count: versionsCount } = await supabase
            .from('bot_versions')
            .select('id', { count: 'exact', head: true })
            .eq('experiment_group_id', group.id);

          // Get best metrics from runs linked to versions in this group
          const { data: versions } = await supabase
            .from('bot_versions')
            .select('id')
            .eq('experiment_group_id', group.id);

          let bestPf = 0;
          let bestPnl = 0;

          if (versions && versions.length > 0) {
            const { data: metrics } = await supabase
              .from('runs')
              .select('run_metrics(profit_factor, net_pnl_usd)')
              .in('bot_version_id', versions.map((v) => v.id))
              .eq('status', 'done');

            if (metrics) {
              metrics.forEach((run: any) => {
                if (run.run_metrics) {
                  const pf = parseFloat(run.run_metrics.profit_factor) || 0;
                  const pnl = parseFloat(run.run_metrics.net_pnl_usd) || 0;
                  if (pf > bestPf) bestPf = pf;
                  if (pnl > bestPnl) bestPnl = pnl;
                }
              });
            }
          }

          return {
            ...group,
            versions_count: versionsCount || 0,
            best_pf: bestPf,
            best_pnl: bestPnl,
          } as unknown as ExperimentGroupWithDetails;
        })
      );

      setGroups(enrichedGroups);
    } catch (error) {
      console.error('Error loading experiment groups:', error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <MainLayout>
      <PageHeader
        title="Experiment Groups"
        description="Group and compare bot versions with shared optimization objectives"
      >
        <CreateExperimentGroupDialog onCreated={loadGroups} />
      </PageHeader>

      <div className="px-8 pb-8">
        {loading ? (
          <div className="text-center py-12 text-muted-foreground">Loading...</div>
        ) : groups.length === 0 ? (
          <div className="terminal-card p-12 text-center">
            <FlaskConical className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No experiment groups yet</h3>
            <p className="text-muted-foreground mb-4">
              Create an experiment group to start comparing bot versions.
            </p>
            <CreateExperimentGroupDialog onCreated={loadGroups} />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {groups.map((group) => (
              <ExperimentGroupCard key={group.id} group={group} />
            ))}
          </div>
        )}
      </div>
    </MainLayout>
  );
}
