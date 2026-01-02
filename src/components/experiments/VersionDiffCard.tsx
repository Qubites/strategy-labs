import { ArrowRight, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { Iteration, GateResults, MetricSnapshot } from '@/types/experiments';

interface VersionDiffCardProps {
  iteration: Iteration;
  showFullDetails?: boolean;
}

export function VersionDiffCard({ iteration, showFullDetails = false }: VersionDiffCardProps) {
  const paramDiff = iteration.param_diff || {};
  const riskDiff = iteration.risk_diff || {};
  const gateResults = iteration.gate_results as GateResults | null;
  const metricBefore = iteration.metric_before as MetricSnapshot | null;
  const metricAfter = iteration.metric_after as MetricSnapshot | null;

  const hasParamChanges = Object.keys(paramDiff).length > 0;
  const hasRiskChanges = Object.keys(riskDiff).length > 0;

  return (
    <Card className={`p-4 ${iteration.accepted ? 'border-success/30' : 'border-destructive/30'}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm">Iteration #{iteration.iteration_number}</span>
          <Badge variant={iteration.accepted ? 'default' : 'destructive'}>
            {iteration.accepted ? 'Accepted' : 'Rejected'}
          </Badge>
          <Badge variant="outline" className="text-xs">
            {iteration.trigger_type}
          </Badge>
        </div>
        {iteration.accepted ? (
          <CheckCircle className="w-5 h-5 text-success" />
        ) : (
          <XCircle className="w-5 h-5 text-destructive" />
        )}
      </div>

      {/* Parameter Changes */}
      {hasParamChanges && (
        <div className="mb-4">
          <h4 className="text-xs font-medium text-muted-foreground uppercase mb-2">Parameter Changes</h4>
          <div className="space-y-1">
            {Object.entries(paramDiff).map(([key, change]: [string, any]) => (
              <div key={key} className="flex items-center gap-2 text-sm font-mono bg-muted/30 px-2 py-1 rounded">
                <span className="text-muted-foreground">{key}:</span>
                <span className="text-destructive/70">{String(change.before)}</span>
                <ArrowRight className="w-3 h-3 text-muted-foreground" />
                <span className="text-success">{String(change.after)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Risk Changes */}
      {hasRiskChanges && (
        <div className="mb-4">
          <h4 className="text-xs font-medium text-muted-foreground uppercase mb-2">Risk Limit Changes</h4>
          <div className="space-y-1">
            {Object.entries(riskDiff).map(([key, change]: [string, any]) => (
              <div key={key} className="flex items-center gap-2 text-sm font-mono bg-muted/30 px-2 py-1 rounded">
                <span className="text-muted-foreground">{key}:</span>
                <span className="text-destructive/70">{String(change.before)}</span>
                <ArrowRight className="w-3 h-3 text-muted-foreground" />
                <span className="text-success">{String(change.after)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Metrics Comparison */}
      {metricBefore && metricAfter && (
        <div className="mb-4">
          <h4 className="text-xs font-medium text-muted-foreground uppercase mb-2">Metrics Comparison</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MetricChange 
              label="Profit Factor" 
              before={metricBefore.profit_factor} 
              after={metricAfter.profit_factor}
              higherIsBetter={true}
            />
            <MetricChange 
              label="Net PnL" 
              before={metricBefore.net_pnl_usd} 
              after={metricAfter.net_pnl_usd}
              higherIsBetter={true}
              format="currency"
            />
            <MetricChange 
              label="Max DD" 
              before={metricBefore.max_drawdown} 
              after={metricAfter.max_drawdown}
              higherIsBetter={false}
              format="percent"
            />
            <MetricChange 
              label="Win Rate" 
              before={metricBefore.win_rate} 
              after={metricAfter.win_rate}
              higherIsBetter={true}
              format="percent"
            />
          </div>
        </div>
      )}

      {/* Gate Results */}
      {gateResults && showFullDetails && (
        <div className="mb-4">
          <h4 className="text-xs font-medium text-muted-foreground uppercase mb-2">Gate Results</h4>
          <div className="grid grid-cols-3 gap-2">
            <GateResult 
              label="Min Trades" 
              required={gateResults.min_trades.required}
              actual={gateResults.min_trades.actual}
              passed={gateResults.min_trades.passed}
            />
            <GateResult 
              label="Max DD" 
              required={gateResults.max_dd.required}
              actual={gateResults.max_dd.actual}
              passed={gateResults.max_dd.passed}
              format="percent"
            />
            <GateResult 
              label="Improvement" 
              required={gateResults.improvement.required}
              actual={gateResults.improvement.actual}
              passed={gateResults.improvement.passed}
              format="percent"
            />
          </div>
        </div>
      )}

      {/* AI Rationale */}
      {iteration.ai_rationale && (
        <div className="text-sm text-muted-foreground bg-muted/30 rounded-lg p-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <p>{iteration.ai_rationale}</p>
          </div>
        </div>
      )}

      {/* Reject Reason */}
      {iteration.reject_reason && (
        <div className="text-sm text-destructive bg-destructive/10 rounded-lg p-3 mt-2">
          <strong>Rejected:</strong> {iteration.reject_reason}
        </div>
      )}
    </Card>
  );
}

interface MetricChangeProps {
  label: string;
  before: number | null;
  after: number | null;
  higherIsBetter: boolean;
  format?: 'number' | 'percent' | 'currency';
}

function MetricChange({ label, before, after, higherIsBetter, format = 'number' }: MetricChangeProps) {
  const beforeVal = before ?? 0;
  const afterVal = after ?? 0;
  const diff = afterVal - beforeVal;
  const improved = higherIsBetter ? diff > 0 : diff < 0;

  const formatValue = (val: number) => {
    switch (format) {
      case 'percent': return `${(val * 100).toFixed(1)}%`;
      case 'currency': return `$${val.toFixed(2)}`;
      default: return val.toFixed(2);
    }
  };

  return (
    <div className="bg-muted/30 rounded p-2">
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <div className="flex items-center gap-1 text-sm">
        <span className="font-mono text-muted-foreground">{formatValue(beforeVal)}</span>
        <ArrowRight className="w-3 h-3" />
        <span className={`font-mono ${improved ? 'text-success' : 'text-destructive'}`}>
          {formatValue(afterVal)}
        </span>
      </div>
    </div>
  );
}

interface GateResultProps {
  label: string;
  required: number;
  actual: number;
  passed: boolean;
  format?: 'number' | 'percent';
}

function GateResult({ label, required, actual, passed, format = 'number' }: GateResultProps) {
  const formatValue = (val: number) => {
    return format === 'percent' ? `${(val * 100).toFixed(1)}%` : val.toFixed(0);
  };

  return (
    <div className={`rounded p-2 ${passed ? 'bg-success/10 border border-success/30' : 'bg-destructive/10 border border-destructive/30'}`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs">{label}</span>
        {passed ? (
          <CheckCircle className="w-3 h-3 text-success" />
        ) : (
          <XCircle className="w-3 h-3 text-destructive" />
        )}
      </div>
      <div className="text-xs font-mono">
        {formatValue(actual)} / {formatValue(required)}
      </div>
    </div>
  );
}
