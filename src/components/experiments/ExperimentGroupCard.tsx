import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Trophy,
  GitBranch,
  TrendingUp,
  DollarSign,
  BarChart3,
  ChevronRight,
} from 'lucide-react';
import type { ExperimentGroupWithDetails } from '@/types/experiments';

interface ExperimentGroupCardProps {
  group: ExperimentGroupWithDetails;
  onViewLeaderboard?: () => void;
}

export function ExperimentGroupCard({ group, onViewLeaderboard }: ExperimentGroupCardProps) {
  return (
    <div className="terminal-card overflow-hidden">
      <div className="terminal-header">
        <div className="flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-primary" />
          <span className="font-medium">{group.name}</span>
        </div>
        {group.champion_version_id && (
          <Badge variant="outline" className="gap-1 bg-amber-500/10 text-amber-500 border-amber-500/30">
            <Trophy className="w-3 h-3" />
            Champion Set
          </Badge>
        )}
      </div>

      <div className="p-4 space-y-4">
        {/* Meta Info */}
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="px-2 py-1 rounded bg-muted text-muted-foreground">
            {group.strategy_templates?.name || group.template_id}
          </span>
          <span className="px-2 py-1 rounded bg-muted text-muted-foreground">
            {group.datasets?.symbol || 'No Dataset'} • {group.timeframe}
          </span>
          <span className="px-2 py-1 rounded bg-muted text-muted-foreground">
            {group.session}
          </span>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center p-3 rounded-lg bg-muted/30">
            <BarChart3 className="w-4 h-4 mx-auto mb-1 text-muted-foreground" />
            <div className="text-lg font-semibold">{group.versions_count || 0}</div>
            <div className="text-xs text-muted-foreground">Versions</div>
          </div>
          <div className="text-center p-3 rounded-lg bg-muted/30">
            <TrendingUp className="w-4 h-4 mx-auto mb-1 text-muted-foreground" />
            <div className={`text-lg font-semibold ${(group.best_pf || 0) > 1 ? 'text-success' : 'text-destructive'}`}>
              {group.best_pf?.toFixed(2) || '—'}
            </div>
            <div className="text-xs text-muted-foreground">Best PF</div>
          </div>
          <div className="text-center p-3 rounded-lg bg-muted/30">
            <DollarSign className="w-4 h-4 mx-auto mb-1 text-muted-foreground" />
            <div className={`text-lg font-semibold ${(group.best_pnl || 0) >= 0 ? 'text-success' : 'text-destructive'}`}>
              ${(group.best_pnl || 0).toFixed(0)}
            </div>
            <div className="text-xs text-muted-foreground">Best PnL</div>
          </div>
        </div>

        {/* Objective Weights */}
        <div className="p-3 rounded-lg border border-border bg-background">
          <div className="text-xs text-muted-foreground mb-2">Objective Weights</div>
          <div className="flex gap-2 text-xs">
            <span className="px-2 py-0.5 rounded bg-primary/10 text-primary">
              PF: {((group.objective_config?.pf_weight || 0) * 100).toFixed(0)}%
            </span>
            <span className="px-2 py-0.5 rounded bg-primary/10 text-primary">
              Return: {((group.objective_config?.return_weight || 0) * 100).toFixed(0)}%
            </span>
            <span className="px-2 py-0.5 rounded bg-primary/10 text-primary">
              Sharpe: {((group.objective_config?.sharpe_weight || 0) * 100).toFixed(0)}%
            </span>
            <span className="px-2 py-0.5 rounded bg-destructive/10 text-destructive">
              DD Penalty: {((group.objective_config?.dd_penalty || 0) * 100).toFixed(0)}%
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <Link to={`/experiments/${group.id}`} className="flex-1">
            <Button variant="outline" className="w-full gap-2">
              View Leaderboard
              <ChevronRight className="w-4 h-4" />
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
