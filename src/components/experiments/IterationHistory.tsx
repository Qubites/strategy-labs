import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  ChevronDown,
  ChevronRight,
  GitCommit,
  Brain,
  Zap,
  User,
  Check,
  X,
  ArrowRight,
} from 'lucide-react';
import { format } from 'date-fns';
import type { Iteration } from '@/types/experiments';

interface IterationHistoryProps {
  experimentGroupId?: string;
  versionId?: string;
  limit?: number;
}

export function IterationHistory({ experimentGroupId, versionId, limit = 20 }: IterationHistoryProps) {
  const [iterations, setIterations] = useState<Iteration[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    loadIterations();
  }, [experimentGroupId, versionId]);

  async function loadIterations() {
    try {
      let query = supabase
        .from('iterations')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (experimentGroupId) {
        query = query.eq('experiment_group_id', experimentGroupId);
      }
      if (versionId) {
        query = query.or(`parent_version_id.eq.${versionId},child_version_id.eq.${versionId}`);
      }

      const { data, error } = await query;

      if (error) throw error;
      setIterations((data || []) as unknown as Iteration[]);
    } catch (error) {
      console.error('Error loading iterations:', error);
    } finally {
      setLoading(false);
    }
  }

  function getTriggerIcon(type: string) {
    switch (type) {
      case 'auto_tuner':
        return <Zap className="w-4 h-4 text-amber-500" />;
      case 'ai_advice':
        return <Brain className="w-4 h-4 text-purple-500" />;
      default:
        return <User className="w-4 h-4 text-blue-500" />;
    }
  }

  function renderDiff(diff: Record<string, { before: any; after: any }> | null, label: string) {
    if (!diff || Object.keys(diff).length === 0) return null;

    return (
      <div className="space-y-1">
        <div className="text-xs font-medium text-muted-foreground">{label}</div>
        {Object.entries(diff).map(([key, { before, after }]) => (
          <div key={key} className="flex items-center gap-2 text-xs font-mono">
            <span className="text-muted-foreground">{key}:</span>
            <span className="text-destructive">{String(before)}</span>
            <ArrowRight className="w-3 h-3 text-muted-foreground" />
            <span className="text-success">{String(after)}</span>
          </div>
        ))}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-4 text-center text-muted-foreground">Loading iterations...</div>
    );
  }

  if (iterations.length === 0) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        <GitCommit className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p>No iterations recorded yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {iterations.map((iteration) => (
        <div
          key={iteration.id}
          className="border border-border rounded-lg overflow-hidden"
        >
          {/* Header */}
          <button
            className="w-full flex items-center gap-3 p-3 hover:bg-muted/30 transition-colors"
            onClick={() => setExpandedId(expandedId === iteration.id ? null : iteration.id)}
          >
            {expandedId === iteration.id ? (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            )}
            
            {getTriggerIcon(iteration.trigger_type)}
            
            <span className="font-medium text-sm">
              Iteration #{iteration.iteration_number}
            </span>
            
            <span className="text-xs text-muted-foreground capitalize">
              {iteration.trigger_type.replace('_', ' ')}
            </span>
            
            <span className="ml-auto flex items-center gap-2">
              {iteration.accepted ? (
                <Badge variant="outline" className="gap-1 bg-success/10 text-success border-success/30">
                  <Check className="w-3 h-3" />
                  Accepted
                </Badge>
              ) : (
                <Badge variant="outline" className="gap-1 bg-destructive/10 text-destructive border-destructive/30">
                  <X className="w-3 h-3" />
                  Rejected
                </Badge>
              )}
              <span className="text-xs text-muted-foreground">
                {format(new Date(iteration.created_at), 'MMM d, HH:mm')}
              </span>
            </span>
          </button>

          {/* Expanded Content */}
          {expandedId === iteration.id && (
            <div className="p-4 border-t border-border bg-muted/10 space-y-4">
              {/* Parameter Diff */}
              {renderDiff(iteration.param_diff, 'Parameter Changes')}
              
              {/* Risk Diff */}
              {renderDiff(iteration.risk_diff, 'Risk Limit Changes')}

              {/* Metrics Comparison */}
              {iteration.metric_before && iteration.metric_after && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 rounded-lg border border-border bg-background">
                    <div className="text-xs font-medium text-muted-foreground mb-2">Before</div>
                    <div className="space-y-1 text-xs font-mono">
                      <div>PF: {iteration.metric_before.profit_factor?.toFixed(2) || '—'}</div>
                      <div>PnL: ${iteration.metric_before.net_pnl_usd?.toFixed(2) || '—'}</div>
                      <div>DD: {((iteration.metric_before.max_drawdown || 0) * 100).toFixed(1)}%</div>
                    </div>
                  </div>
                  <div className="p-3 rounded-lg border border-border bg-background">
                    <div className="text-xs font-medium text-muted-foreground mb-2">After</div>
                    <div className="space-y-1 text-xs font-mono">
                      <div>PF: {iteration.metric_after.profit_factor?.toFixed(2) || '—'}</div>
                      <div>PnL: ${iteration.metric_after.net_pnl_usd?.toFixed(2) || '—'}</div>
                      <div>DD: {((iteration.metric_after.max_drawdown || 0) * 100).toFixed(1)}%</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Gate Results */}
              {iteration.gate_results && (
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-2">Gate Results</div>
                  <div className="flex gap-2">
                    {Object.entries(iteration.gate_results).map(([key, gate]: [string, any]) => (
                      <span
                        key={key}
                        className={`px-2 py-1 rounded text-xs ${
                          gate.passed
                            ? 'bg-success/10 text-success'
                            : 'bg-destructive/10 text-destructive'
                        }`}
                      >
                        {key}: {gate.actual?.toFixed?.(2) || gate.actual} / {gate.required}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* AI Rationale */}
              {iteration.ai_rationale && (
                <div className="p-3 rounded-lg border border-border bg-background">
                  <div className="text-xs font-medium text-muted-foreground mb-2">AI Rationale</div>
                  <p className="text-sm">{iteration.ai_rationale}</p>
                </div>
              )}

              {/* Reject Reason */}
              {iteration.reject_reason && (
                <div className="p-3 rounded-lg border border-destructive/30 bg-destructive/5">
                  <div className="text-xs font-medium text-destructive mb-1">Reject Reason</div>
                  <p className="text-sm text-destructive">{iteration.reject_reason}</p>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
