import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { MainLayout } from '@/components/layout/MainLayout';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Bot, Loader2, Save, ArrowLeft } from 'lucide-react';
import type { StrategyTemplate, ParamSchema, ParamDefinition, RiskLimits } from '@/types/trading';

export default function NewBot() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preselectedTemplate = searchParams.get('template');

  const [templates, setTemplates] = useState<StrategyTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<StrategyTemplate | null>(null);
  const [schema, setSchema] = useState<ParamSchema | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form state
  const [botName, setBotName] = useState('');
  const [params, setParams] = useState<Record<string, number | string | boolean>>({});
  const [riskPreset, setRiskPreset] = useState<'Conservative' | 'Normal' | 'Aggressive'>('Normal');

  useEffect(() => {
    loadTemplates();
  }, []);

  useEffect(() => {
    if (preselectedTemplate && templates.length > 0) {
      const template = templates.find((t) => t.id === preselectedTemplate);
      if (template) {
        handleTemplateSelect(template.id);
      }
    }
  }, [preselectedTemplate, templates]);

  async function loadTemplates() {
    try {
      const { data, error } = await supabase
        .from('strategy_templates')
        .select('*')
        .eq('is_active', true);

      if (error) throw error;
      setTemplates(data || []);
    } catch (error) {
      console.error('Error loading templates:', error);
    } finally {
      setLoading(false);
    }
  }

  function handleTemplateSelect(templateId: string) {
    const template = templates.find((t) => t.id === templateId);
    if (!template) return;

    setSelectedTemplate(template);

    try {
      const parsedSchema = JSON.parse(template.param_schema_json) as ParamSchema;
      setSchema(parsedSchema);

      // Initialize params with defaults
      const defaultParams: Record<string, number | string | boolean> = {};
      parsedSchema.params.forEach((param) => {
        defaultParams[param.key] = param.default;
      });
      setParams(defaultParams);

      // Set default bot name
      setBotName(`${template.name} Bot`);
    } catch (e) {
      console.error('Error parsing schema:', e);
      toast.error('Invalid template schema');
    }
  }

  function updateParam(key: string, value: number | string | boolean) {
    setParams((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    if (!selectedTemplate || !schema || !botName.trim()) {
      toast.error('Please fill in all required fields');
      return;
    }

    setSaving(true);
    try {
      // Get risk limits based on preset
      const riskLimits: RiskLimits = {
        ...schema.default_risk_limits,
        preset: riskPreset,
      };

      // Adjust risk limits based on preset
      if (riskPreset === 'Conservative') {
        riskLimits.max_position_size_usd *= 0.5;
        riskLimits.max_daily_loss_usd *= 0.5;
        riskLimits.max_drawdown_usd *= 0.5;
      } else if (riskPreset === 'Aggressive') {
        riskLimits.max_position_size_usd *= 2;
        riskLimits.max_daily_loss_usd *= 2;
        riskLimits.max_drawdown_usd *= 2;
      }

      // Create bot
      const { data: bot, error: botError } = await supabase
        .from('bots')
        .insert({
          name: botName.trim(),
          template_id: selectedTemplate.id,
        })
        .select()
        .single();

      if (botError) throw botError;

      // Create initial version
      const paramsJson = JSON.stringify(params);
      const riskLimitsJson = JSON.stringify(riskLimits);
      const paramsHash = btoa(paramsJson).slice(0, 16);
      const versionHash = btoa(paramsJson + riskLimitsJson).slice(0, 16);

      const { error: versionError } = await supabase
        .from('bot_versions')
        .insert({
          bot_id: bot.id,
          version_number: 1,
          params_json: paramsJson,
          params_hash: paramsHash,
          risk_limits_json: riskLimitsJson,
          version_hash: versionHash,
          status: 'draft',
        });

      if (versionError) throw versionError;

      toast.success('Bot created successfully');
      navigate(`/bots/${bot.id}`);
    } catch (error) {
      console.error('Error creating bot:', error);
      toast.error('Failed to create bot');
    } finally {
      setSaving(false);
    }
  }

  const renderParamControl = (param: ParamDefinition) => {
    const value = params[param.key];
    const dependsOn = param.depends_on;

    // Check if this param should be shown based on dependencies
    if (dependsOn) {
      const [depKey, depValue] = Object.entries(dependsOn)[0];
      if (params[depKey] !== depValue) {
        return null;
      }
    }

    switch (param.type) {
      case 'int':
      case 'float':
        return (
          <div key={param.key} className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>{param.label}</Label>
              <span className="font-mono text-sm text-primary">
                {typeof value === 'number' ? value.toFixed(param.type === 'float' ? 4 : 0) : value}
              </span>
            </div>
            <Slider
              value={[Number(value)]}
              min={param.min}
              max={param.max}
              step={param.step}
              onValueChange={([v]) => updateParam(param.key, v)}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{param.min}</span>
              <span>{param.max}</span>
            </div>
          </div>
        );

      case 'bool':
        return (
          <div key={param.key} className="flex items-center justify-between py-2">
            <Label>{param.label}</Label>
            <Switch
              checked={Boolean(value)}
              onCheckedChange={(checked) => updateParam(param.key, checked)}
            />
          </div>
        );

      case 'enum':
        return (
          <div key={param.key} className="space-y-2">
            <Label>{param.label}</Label>
            <Select
              value={String(value)}
              onValueChange={(v) => updateParam(param.key, v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {param.values?.map((v) => (
                  <SelectItem key={v} value={v}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <MainLayout>
      <PageHeader title="Create New Bot" description="Configure a trading bot from a strategy template">
        <Button variant="outline" onClick={() => navigate('/bots')} className="gap-2">
          <ArrowLeft className="w-4 h-4" />
          Back
        </Button>
      </PageHeader>

      <div className="px-8 pb-8">
        <div className="max-w-4xl space-y-6">
          {/* Template Selection */}
          <div className="terminal-card p-6">
            <h3 className="font-medium mb-4">Select Strategy Template</h3>
            {loading ? (
              <div className="text-muted-foreground">Loading templates...</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {templates.map((template) => (
                  <button
                    key={template.id}
                    onClick={() => handleTemplateSelect(template.id)}
                    className={`p-4 rounded-lg border text-left transition-all ${
                      selectedTemplate?.id === template.id
                        ? 'border-primary bg-primary/10'
                        : 'border-border hover:border-primary/50'
                    }`}
                  >
                    <h4 className="font-medium text-foreground">{template.name}</h4>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                      {template.description}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>

          {selectedTemplate && schema && (
            <>
              {/* Bot Name */}
              <div className="terminal-card p-6">
                <div className="space-y-2">
                  <Label>Bot Name</Label>
                  <Input
                    value={botName}
                    onChange={(e) => setBotName(e.target.value)}
                    placeholder="My Trading Bot"
                  />
                </div>
              </div>

              {/* Parameters */}
              <div className="terminal-card p-6">
                <h3 className="font-medium mb-6">Strategy Parameters</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {schema.params.map(renderParamControl)}
                </div>
              </div>

              {/* Risk Preset */}
              <div className="terminal-card p-6">
                <h3 className="font-medium mb-4">Risk Profile</h3>
                <div className="grid grid-cols-3 gap-4">
                  {(['Conservative', 'Normal', 'Aggressive'] as const).map((preset) => (
                    <button
                      key={preset}
                      onClick={() => setRiskPreset(preset)}
                      className={`p-4 rounded-lg border text-center transition-all ${
                        riskPreset === preset
                          ? 'border-primary bg-primary/10'
                          : 'border-border hover:border-primary/50'
                      }`}
                    >
                      <div className="font-medium">{preset}</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {preset === 'Conservative' && 'Lower risk, smaller positions'}
                        {preset === 'Normal' && 'Balanced risk/reward'}
                        {preset === 'Aggressive' && 'Higher risk, larger positions'}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Save Button */}
              <div className="flex justify-end gap-4">
                <Button variant="outline" onClick={() => navigate('/bots')}>
                  Cancel
                </Button>
                <Button onClick={handleSave} disabled={saving} className="gap-2">
                  {saving ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  Create Bot
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </MainLayout>
  );
}
