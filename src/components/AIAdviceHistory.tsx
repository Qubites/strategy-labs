import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Sparkles, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { format } from 'date-fns';
import type { AIAdvice } from '@/types/trading';

interface AIAdviceHistoryProps {
  botVersionId: string;
}

export function AIAdviceHistory({ botVersionId }: AIAdviceHistoryProps) {
  const [advice, setAdvice] = useState<AIAdvice[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    loadAdvice();
  }, [botVersionId]);

  async function loadAdvice() {
    try {
      const { data, error } = await supabase
        .from('ai_advice')
        .select('*')
        .eq('bot_version_id', botVersionId)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      setAdvice(data || []);
    } catch (error) {
      console.error('Error loading AI advice:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (advice.length === 0) {
    return (
      <div className="text-center py-8">
        <Sparkles className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
        <p className="text-muted-foreground">No AI advice yet</p>
        <p className="text-xs text-muted-foreground mt-1">
          Use the AI Coach to get recommendations
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {advice.map((item) => {
        const recommendations = item.recommendations_json 
          ? JSON.parse(item.recommendations_json) 
          : {};
        const isExpanded = expandedId === item.id;

        return (
          <div key={item.id} className="terminal-card">
            <div 
              className="p-4 cursor-pointer hover:bg-muted/30 transition-colors"
              onClick={() => setExpandedId(isExpanded ? null : item.id)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Sparkles className={`w-4 h-4 ${item.applied ? 'text-green-500' : 'text-primary'}`} />
                  <div>
                    <p className="text-sm font-medium">
                      {item.goal === 'pf' ? 'Improve Profit Factor' :
                       item.goal === 'dd' ? 'Reduce Drawdown' :
                       item.goal === 'fees' ? 'Reduce Fees' : 'Fix Execution'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(item.created_at), 'MMM d, yyyy HH:mm')} • {item.advice_window} window
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {item.applied && (
                    <span className="text-xs px-2 py-0.5 rounded bg-green-500/20 text-green-400">
                      Applied
                    </span>
                  )}
                  <span className={`text-xs px-2 py-0.5 rounded ${
                    (item.confidence || 0) >= 0.7 ? 'bg-green-500/20 text-green-400' :
                    (item.confidence || 0) >= 0.5 ? 'bg-yellow-500/20 text-yellow-400' :
                    'bg-red-500/20 text-red-400'
                  }`}>
                    {((item.confidence || 0) * 100).toFixed(0)}%
                  </span>
                  {isExpanded ? (
                    <ChevronUp className="w-4 h-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-muted-foreground" />
                  )}
                </div>
              </div>
              
              {item.summary && (
                <p className="text-sm text-muted-foreground mt-2">{item.summary}</p>
              )}
            </div>

            {isExpanded && (
              <div className="px-4 pb-4 space-y-4 border-t border-border">
                {/* Recommendations */}
                {recommendations.recommendations?.length > 0 && (
                  <div className="pt-4">
                    <h4 className="text-sm font-medium mb-2">Recommendations</h4>
                    <div className="space-y-2">
                      {recommendations.recommendations.map((rec: any, i: number) => (
                        <div key={i} className="text-sm p-2 rounded bg-muted/30">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`text-xs px-1.5 py-0.5 rounded ${
                              rec.expected_impact === 'high' ? 'bg-green-500/20 text-green-400' :
                              rec.expected_impact === 'med' ? 'bg-yellow-500/20 text-yellow-400' :
                              'bg-muted text-muted-foreground'
                            }`}>
                              {rec.expected_impact}
                            </span>
                            <span className="font-medium">{rec.title}</span>
                          </div>
                          <p className="text-xs text-muted-foreground">{rec.why}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Parameter Changes */}
                {recommendations.parameter_changes?.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium mb-2">Parameter Changes</h4>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-muted-foreground text-xs">
                          <th className="pb-1">Parameter</th>
                          <th className="pb-1">From</th>
                          <th className="pb-1">To</th>
                          <th className="pb-1">Reason</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recommendations.parameter_changes.map((change: any, i: number) => (
                          <tr key={i} className="border-t border-border/30 text-xs">
                            <td className="py-1 font-mono">{change.param}</td>
                            <td className="py-1 text-muted-foreground">{String(change.from)}</td>
                            <td className="py-1 text-primary">{String(change.to)}</td>
                            <td className="py-1 text-muted-foreground truncate max-w-[200px]">{change.reason}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Tests Required */}
                {recommendations.tests_required?.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium mb-2">Required Tests</h4>
                    <ul className="text-xs text-muted-foreground space-y-1">
                      {recommendations.tests_required.map((test: any, i: number) => (
                        <li key={i}>• <span className="font-medium">{test.test}:</span> {test.details}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
