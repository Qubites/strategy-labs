import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { MainLayout } from '@/components/layout/MainLayout';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { FileCode2, ArrowRight, Settings2, TrendingUp, RefreshCw } from 'lucide-react';
import type { StrategyTemplate, ParamSchema } from '@/types/trading';

export default function Templates() {
  const [templates, setTemplates] = useState<StrategyTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTemplates();
  }, []);

  async function loadTemplates() {
    try {
      const { data, error } = await supabase
        .from('strategy_templates')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setTemplates(data || []);
    } catch (error) {
      console.error('Error loading templates:', error);
    } finally {
      setLoading(false);
    }
  }

  const getTemplateIcon = (id: string) => {
    switch (id) {
      case 'momentum_breakout_v1':
        return TrendingUp;
      case 'mean_reversion_extremes_v1':
        return RefreshCw;
      case 'regime_switcher_v1':
        return Settings2;
      default:
        return FileCode2;
    }
  };

  const getTemplateColor = (id: string) => {
    switch (id) {
      case 'momentum_breakout_v1':
        return 'text-primary bg-primary/10';
      case 'mean_reversion_extremes_v1':
        return 'text-warning bg-warning/10';
      case 'regime_switcher_v1':
        return 'text-success bg-success/10';
      default:
        return 'text-muted-foreground bg-muted';
    }
  };

  return (
    <MainLayout>
      <PageHeader
        title="Strategy Templates"
        description="Pre-built trading strategies with configurable parameters"
      />

      <div className="px-8 pb-8">
        {loading ? (
          <div className="text-center py-12 text-muted-foreground">Loading templates...</div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
            {templates.map((template) => {
              const Icon = getTemplateIcon(template.id);
              const colorClass = getTemplateColor(template.id);
              let schema: ParamSchema | null = null;
              
              try {
                schema = JSON.parse(template.param_schema_json);
              } catch (e) {
                console.error('Error parsing schema:', e);
              }

              return (
                <div
                  key={template.id}
                  className="terminal-card hover:border-primary/50 transition-all duration-300 group"
                >
                  <div className="p-6">
                    <div className="flex items-start gap-4 mb-4">
                      <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${colorClass}`}>
                        <Icon className="w-6 h-6" />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold text-lg text-foreground">{template.name}</h3>
                        <p className="text-xs text-muted-foreground font-mono">{template.id}</p>
                      </div>
                    </div>

                    <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
                      {template.description}
                    </p>

                    {schema && (
                      <div className="space-y-3 mb-6">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Settings2 className="w-3 h-3" />
                          <span>{schema.params.length} parameters</span>
                        </div>
                        
                        <div className="flex flex-wrap gap-1">
                          {schema.params.slice(0, 5).map((param) => (
                            <span
                              key={param.key}
                              className="px-2 py-0.5 bg-muted rounded text-xs font-mono"
                            >
                              {param.key}
                            </span>
                          ))}
                          {schema.params.length > 5 && (
                            <span className="px-2 py-0.5 bg-muted rounded text-xs">
                              +{schema.params.length - 5} more
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    <Link to={`/bots/new?template=${template.id}`}>
                      <Button className="w-full gap-2 group-hover:bg-primary group-hover:text-primary-foreground" variant="outline">
                        Create Bot
                        <ArrowRight className="w-4 h-4" />
                      </Button>
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {!loading && templates.length === 0 && (
          <div className="text-center py-12">
            <FileCode2 className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium text-foreground">No templates available</h3>
            <p className="text-muted-foreground">Strategy templates will appear here</p>
          </div>
        )}
      </div>
    </MainLayout>
  );
}
