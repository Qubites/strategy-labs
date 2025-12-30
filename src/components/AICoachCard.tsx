import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Sparkles, Loader2, CheckCircle, AlertTriangle, ArrowRight } from 'lucide-react';

interface AICoachCardProps {
  botVersionId: string;
  runId?: string;
  onAdviceApplied?: () => void;
}

interface Recommendation {
  priority: number;
  title: string;
  why: string;
  risk: string;
  expected_impact: string;
}

interface ParamChange {
  param: string;
  from: any;
  to: any;
  reason: string;
}

interface AIAdviceResponse {
  success: boolean;
  advice_id: string;
  summary: string;
  recommendations: Recommendation[];
  parameter_changes: ParamChange[];
  risk_actions: Array<{ action: string; reason: string }>;
  tests_required: Array<{ test: string; details: string }>;
  confidence: number;
  do_not_do: string[];
}

export function AICoachCard({ botVersionId, runId, onAdviceApplied }: AICoachCardProps) {
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [window, setWindow] = useState<'1h' | '1d' | '7d'>('1d');
  const [goal, setGoal] = useState<'pf' | 'dd' | 'fees' | 'execution'>('pf');
  const [includeLogs, setIncludeLogs] = useState(true);
  const [suggestParams, setSuggestParams] = useState(true);
  const [advice, setAdvice] = useState<AIAdviceResponse | null>(null);

  async function handleGetAdvice() {
    setLoading(true);
    setAdvice(null);

    try {
      const { data, error } = await supabase.functions.invoke('ai-advice', {
        body: {
          bot_version_id: botVersionId,
          run_id: runId,
          window,
          goal,
          include_logs: includeLogs,
        },
      });

      if (error) throw error;

      if (data.error) {
        toast.error(data.error);
        return;
      }

      setAdvice(data);
      toast.success('AI advice generated');
    } catch (error) {
      console.error('Error getting AI advice:', error);
      toast.error('Failed to get AI advice');
    } finally {
      setLoading(false);
    }
  }

  async function handleApply() {
    if (!advice?.advice_id) return;

    setApplying(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-apply', {
        body: {
          advice_id: advice.advice_id,
          max_param_changes: 3,
        },
      });

      if (error) throw error;

      if (data.error) {
        toast.error(data.error);
        return;
      }

      toast.success(`Created new version v${data.new_version_number}`);
      onAdviceApplied?.();
    } catch (error) {
      console.error('Error applying advice:', error);
      toast.error('Failed to apply advice');
    } finally {
      setApplying(false);
    }
  }

  const hasChangesToApply = advice && (
    (advice.parameter_changes?.length > 0) || 
    (advice.risk_actions?.length > 0)
  );

  return (
    <div className="terminal-card">
      <div className="terminal-header">
        <Sparkles className="w-4 h-4 text-primary" />
        <span className="font-medium">AI Coach</span>
        {advice && (
          <span className={`ml-auto text-xs px-2 py-0.5 rounded ${
            advice.confidence >= 0.7 ? 'bg-green-500/20 text-green-400' :
            advice.confidence >= 0.5 ? 'bg-yellow-500/20 text-yellow-400' :
            'bg-red-500/20 text-red-400'
          }`}>
            {(advice.confidence * 100).toFixed(0)}% confident
          </span>
        )}
      </div>

      <div className="p-4 space-y-4">
        {/* Controls */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="space-y-2">
            <Label className="text-xs">Window</Label>
            <Select value={window} onValueChange={(v) => setWindow(v as any)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1h">Last 1 hour</SelectItem>
                <SelectItem value="1d">Last 24 hours</SelectItem>
                <SelectItem value="7d">Last 7 days</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Goal</Label>
            <Select value={goal} onValueChange={(v) => setGoal(v as any)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pf">Improve PF</SelectItem>
                <SelectItem value="dd">Reduce Drawdown</SelectItem>
                <SelectItem value="fees">Reduce Fees</SelectItem>
                <SelectItem value="execution">Fix Execution</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <Switch id="logs" checked={includeLogs} onCheckedChange={setIncludeLogs} />
            <Label htmlFor="logs" className="text-xs">Include logs</Label>
          </div>

          <div className="flex items-center gap-2">
            <Switch id="params" checked={suggestParams} onCheckedChange={setSuggestParams} />
            <Label htmlFor="params" className="text-xs">Suggest params</Label>
          </div>
        </div>

        <Button
          onClick={handleGetAdvice}
          disabled={loading}
          className="w-full gap-2"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Sparkles className="w-4 h-4" />
          )}
          {loading ? 'Analyzing...' : 'Get AI Advice'}
        </Button>

        {/* Results */}
        {advice && (
          <div className="space-y-4 pt-4 border-t border-border">
            {/* Summary */}
            <div className="p-3 rounded bg-muted/50">
              <p className="text-sm">{advice.summary}</p>
            </div>

            {/* Recommendations */}
            {advice.recommendations?.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium">Recommendations</h4>
                {advice.recommendations.slice(0, 3).map((rec, i) => (
                  <div key={i} className="p-3 rounded border border-border/50 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        rec.expected_impact === 'high' ? 'bg-green-500/20 text-green-400' :
                        rec.expected_impact === 'med' ? 'bg-yellow-500/20 text-yellow-400' :
                        'bg-muted text-muted-foreground'
                      }`}>
                        {rec.expected_impact}
                      </span>
                      <span className="font-medium text-sm">{rec.title}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{rec.why}</p>
                    {rec.risk && (
                      <p className="text-xs text-destructive/80">Risk: {rec.risk}</p>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Parameter Changes */}
            {advice.parameter_changes?.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium">Suggested Parameter Changes</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-muted-foreground">
                        <th className="pb-2">Parameter</th>
                        <th className="pb-2">From</th>
                        <th className="pb-2"></th>
                        <th className="pb-2">To</th>
                      </tr>
                    </thead>
                    <tbody>
                      {advice.parameter_changes.slice(0, 3).map((change, i) => (
                        <tr key={i} className="border-t border-border/30">
                          <td className="py-2 font-mono text-xs">{change.param}</td>
                          <td className="py-2 text-muted-foreground">{String(change.from)}</td>
                          <td className="py-2"><ArrowRight className="w-3 h-3 text-primary" /></td>
                          <td className="py-2 text-primary font-medium">{String(change.to)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Tests Required */}
            {advice.tests_required?.length > 0 && (
              <div className="p-3 rounded bg-yellow-500/10 border border-yellow-500/20">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="w-4 h-4 text-yellow-500" />
                  <span className="text-sm font-medium text-yellow-500">Required Tests</span>
                </div>
                <ul className="text-xs text-muted-foreground space-y-1">
                  {advice.tests_required.map((test, i) => (
                    <li key={i}>• {test.test}: {test.details}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Apply Button */}
            {hasChangesToApply && (
              <Button
                onClick={handleApply}
                disabled={applying}
                variant="outline"
                className="w-full gap-2"
              >
                {applying ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle className="w-4 h-4" />
                )}
                Apply Suggestions (Creates New Version)
              </Button>
            )}

            {/* Disclaimer */}
            <p className="text-xs text-muted-foreground text-center">
              This is not financial advice. Always validate changes with paper trading before live deployment.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
