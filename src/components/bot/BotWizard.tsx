import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
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
import { 
  ArrowLeft, 
  ArrowRight, 
  Check, 
  Loader2, 
  AlertTriangle,
  Info,
  Database,
} from 'lucide-react';
import type { StrategyTemplate, ParamSchema, ParamDefinition, RiskLimits, Dataset } from '@/types/trading';

interface BotWizardProps {
  onComplete?: (botId: string) => void;
}

const STEPS = [
  { id: 'template', label: 'Strategy Template', description: 'Choose your trading strategy' },
  { id: 'params', label: 'Parameters', description: 'Configure strategy parameters' },
  { id: 'risk', label: 'Risk Rules', description: 'Set risk management limits' },
  { id: 'data', label: 'Data Selection', description: 'Choose datasets for backtesting' },
  { id: 'create', label: 'Create Bot', description: 'Review and create your bot' },
];

const PARAM_EXPLANATIONS: Record<string, string> = {
  lookback_bars: 'Number of bars to analyze for pattern detection. Higher = more stable signals, Lower = faster reactions.',
  breakout_pct: 'Price movement threshold to trigger entry. Too high = rare trades, Too low = many false signals.',
  atr_period: 'Period for Average True Range calculation. Used for stop-loss and take-profit levels.',
  stop_atr_mult: 'Stop-loss distance as a multiple of ATR. Higher = wider stops, more room for price movement.',
  takeprofit_atr_mult: 'Take-profit distance as ATR multiple. Higher reward targets but lower win rate.',
  use_trailing_stop: 'Dynamically adjust stop-loss as price moves in your favor.',
  trade_direction: 'Restrict to long, short, or both directions.',
  session: 'Trading session filter. RTH = Regular hours only, reduces noise from low-volume periods.',
  max_trades_per_day: 'Circuit breaker to prevent overtrading. Lower = more conservative.',
  z_lookback: 'Lookback for z-score calculation. Determines what "normal" price range means.',
  entry_z: 'Z-score threshold for entry. Higher = more extreme conditions required.',
  exit_z: 'Z-score threshold for exit. When price returns to this level, close position.',
  regime_lookback: 'Bars to analyze for regime detection (trending vs ranging).',
  trend_strength_threshold: 'Minimum trend strength to activate momentum strategy.',
  volatility_threshold: 'Volatility level to determine regime type.',
};

export function BotWizard({ onComplete }: BotWizardProps) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preselectedTemplate = searchParams.get('template');

  const [currentStep, setCurrentStep] = useState(0);
  const [templates, setTemplates] = useState<StrategyTemplate[]>([]);
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<StrategyTemplate | null>(null);
  const [schema, setSchema] = useState<ParamSchema | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form state
  const [botName, setBotName] = useState('');
  const [params, setParams] = useState<Record<string, number | string | boolean>>({});
  const [riskLimits, setRiskLimits] = useState<RiskLimits>({
    preset: 'Normal',
    max_position_size_usd: 2000,
    max_daily_loss_usd: 50,
    max_drawdown_usd: 120,
    max_consecutive_losses: 5,
    cooldown_minutes_after_loss: 15,
    cooldown_minutes_after_vol_spike: 30,
    require_slippage_guard: true,
  });
  const [selectedDatasets, setSelectedDatasets] = useState<string[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (preselectedTemplate && templates.length > 0) {
      const template = templates.find((t) => t.id === preselectedTemplate);
      if (template) {
        handleTemplateSelect(template);
      }
    }
  }, [preselectedTemplate, templates]);

  async function loadData() {
    try {
      const [templatesRes, datasetsRes] = await Promise.all([
        supabase.from('strategy_templates').select('*').eq('is_active', true),
        supabase.from('datasets').select('*').order('created_at', { ascending: false }),
      ]);

      if (templatesRes.error) throw templatesRes.error;
      setTemplates(templatesRes.data || []);
      setDatasets(datasetsRes.data || []);
    } catch (error) {
      console.error('Error loading data:', error);
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  }

  function handleTemplateSelect(template: StrategyTemplate) {
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

      // Initialize risk limits from schema
      if (parsedSchema.default_risk_limits) {
        setRiskLimits({ ...parsedSchema.default_risk_limits, preset: 'Normal' });
      }

      setBotName(`${template.name} Bot`);
    } catch (e) {
      console.error('Error parsing schema:', e);
      toast.error('Invalid template schema');
    }
  }

  function updateParam(key: string, value: number | string | boolean) {
    setParams((prev) => ({ ...prev, [key]: value }));
  }

  function getParamWarnings(): string[] {
    const warnings: string[] = [];
    
    if (params.breakout_pct && Number(params.breakout_pct) > 0.008) {
      warnings.push('Breakout threshold is very high — this configuration may trade rarely.');
    }
    if (params.max_trades_per_day && Number(params.max_trades_per_day) < 2) {
      warnings.push('Max trades/day is very low — limited trading opportunities.');
    }
    if (params.stop_atr_mult && Number(params.stop_atr_mult) > 4) {
      warnings.push('Stop ATR multiplier is high — large potential losses per trade.');
    }
    if (params.entry_z && Number(params.entry_z) > 3) {
      warnings.push('Entry Z-score is very high — extremely rare trade signals.');
    }

    return warnings;
  }

  function getDataWarnings(): string[] {
    const warnings: string[] = [];
    
    selectedDatasets.forEach(dsId => {
      const ds = datasets.find(d => d.id === dsId);
      if (ds) {
        if (ds.bar_count < 500) {
          warnings.push(`${ds.symbol} ${ds.timeframe}: Only ${ds.bar_count} bars — may not be enough for reliable backtest.`);
        }
        if (ds.session !== 'RTH' && params.session === 'RTH') {
          warnings.push(`${ds.symbol}: Dataset includes extended hours but strategy filters to RTH only.`);
        }
      }
    });

    return warnings;
  }

  async function handleSave() {
    if (!selectedTemplate || !schema || !botName.trim()) {
      toast.error('Please fill in all required fields');
      return;
    }

    setSaving(true);
    try {
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
      
      if (onComplete) {
        onComplete(bot.id);
      } else {
        navigate(`/bots/${bot.id}`);
      }
    } catch (error) {
      console.error('Error creating bot:', error);
      toast.error('Failed to create bot');
    } finally {
      setSaving(false);
    }
  }

  function renderParamControl(param: ParamDefinition) {
    const value = params[param.key];
    const dependsOn = param.depends_on;

    if (dependsOn) {
      const [depKey, depValue] = Object.entries(dependsOn)[0];
      if (params[depKey] !== depValue) return null;
    }

    const explanation = PARAM_EXPLANATIONS[param.key];

    return (
      <div key={param.key} className="space-y-2 p-4 bg-muted/30 rounded-lg">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <Label className="font-medium">{param.label}</Label>
              {param.type === 'int' || param.type === 'float' ? (
                <span className="font-mono text-sm text-primary">
                  {typeof value === 'number' ? value.toFixed(param.type === 'float' ? 4 : 0) : value}
                </span>
              ) : null}
            </div>
            {explanation && (
              <p className="text-xs text-muted-foreground mt-1">{explanation}</p>
            )}
          </div>
        </div>

        {(param.type === 'int' || param.type === 'float') && (
          <>
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
          </>
        )}

        {param.type === 'bool' && (
          <Switch
            checked={Boolean(value)}
            onCheckedChange={(checked) => updateParam(param.key, checked)}
          />
        )}

        {param.type === 'enum' && (
          <Select value={String(value)} onValueChange={(v) => updateParam(param.key, v)}>
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
        )}
      </div>
    );
  }

  const paramWarnings = getParamWarnings();
  const dataWarnings = getDataWarnings();

  const canProceed = () => {
    switch (currentStep) {
      case 0: return selectedTemplate !== null;
      case 1: return Object.keys(params).length > 0;
      case 2: return true;
      case 3: return true;
      case 4: return botName.trim().length > 0;
      default: return false;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Progress Steps */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          {STEPS.map((step, i) => (
            <div key={step.id} className="flex items-center">
              <div
                className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium transition-colors ${
                  i < currentStep
                    ? 'bg-primary text-primary-foreground'
                    : i === currentStep
                    ? 'bg-primary/20 text-primary border-2 border-primary'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {i < currentStep ? <Check className="w-4 h-4" /> : i + 1}
              </div>
              {i < STEPS.length - 1 && (
                <div className={`w-12 md:w-24 h-0.5 mx-2 ${i < currentStep ? 'bg-primary' : 'bg-muted'}`} />
              )}
            </div>
          ))}
        </div>
        <div className="mt-4 text-center">
          <h3 className="font-medium">{STEPS[currentStep].label}</h3>
          <p className="text-sm text-muted-foreground">{STEPS[currentStep].description}</p>
        </div>
      </div>

      {/* Step Content */}
      <div className="space-y-6">
        {/* Step 0: Template Selection */}
        {currentStep === 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {templates.map((template) => {
              let description = template.description || '';
              try {
                const parsed = JSON.parse(template.param_schema_json);
                description = parsed.description || description;
              } catch {}
              
              return (
                <button
                  key={template.id}
                  onClick={() => handleTemplateSelect(template)}
                  className={`p-6 rounded-lg border text-left transition-all ${
                    selectedTemplate?.id === template.id
                      ? 'border-primary bg-primary/10 ring-2 ring-primary/20'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <h4 className="font-medium text-foreground text-lg">{template.name}</h4>
                  <p className="text-sm text-muted-foreground mt-2">{description}</p>
                  {selectedTemplate?.id === template.id && (
                    <div className="mt-4 flex items-center gap-2 text-primary text-sm">
                      <Check className="w-4 h-4" />
                      Selected
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Step 1: Parameters */}
        {currentStep === 1 && schema && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {schema.params.map(renderParamControl)}
            </div>

            {paramWarnings.length > 0 && (
              <div className="bg-warning/10 border border-warning/30 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-medium text-warning">Parameter Warnings</h4>
                    <ul className="mt-2 space-y-1">
                      {paramWarnings.map((w, i) => (
                        <li key={i} className="text-sm text-muted-foreground">{w}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 2: Risk Rules */}
        {currentStep === 2 && (
          <div className="space-y-6">
            {/* Presets */}
            <div>
              <Label className="mb-3 block">Risk Profile Preset</Label>
              <div className="grid grid-cols-3 gap-4">
                {(['Conservative', 'Normal', 'Aggressive'] as const).map((preset) => (
                  <button
                    key={preset}
                    onClick={() => {
                      const multiplier = preset === 'Conservative' ? 0.5 : preset === 'Aggressive' ? 2 : 1;
                      setRiskLimits(prev => ({
                        ...prev,
                        preset,
                        max_position_size_usd: 2000 * multiplier,
                        max_daily_loss_usd: 50 * multiplier,
                        max_drawdown_usd: 120 * multiplier,
                      }));
                    }}
                    className={`p-4 rounded-lg border text-center transition-all ${
                      riskLimits.preset === preset
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

            {/* Custom Risk Limits */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Max Position Size ($)</Label>
                <Input
                  type="number"
                  value={riskLimits.max_position_size_usd}
                  onChange={(e) => setRiskLimits(prev => ({ ...prev, max_position_size_usd: Number(e.target.value) }))}
                  className="font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label>Max Daily Loss ($)</Label>
                <Input
                  type="number"
                  value={riskLimits.max_daily_loss_usd}
                  onChange={(e) => setRiskLimits(prev => ({ ...prev, max_daily_loss_usd: Number(e.target.value) }))}
                  className="font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label>Max Drawdown ($)</Label>
                <Input
                  type="number"
                  value={riskLimits.max_drawdown_usd}
                  onChange={(e) => setRiskLimits(prev => ({ ...prev, max_drawdown_usd: Number(e.target.value) }))}
                  className="font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label>Max Consecutive Losses</Label>
                <Input
                  type="number"
                  value={riskLimits.max_consecutive_losses}
                  onChange={(e) => setRiskLimits(prev => ({ ...prev, max_consecutive_losses: Number(e.target.value) }))}
                  className="font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label>Cooldown After Loss (min)</Label>
                <Input
                  type="number"
                  value={riskLimits.cooldown_minutes_after_loss}
                  onChange={(e) => setRiskLimits(prev => ({ ...prev, cooldown_minutes_after_loss: Number(e.target.value) }))}
                  className="font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label>Cooldown After Vol Spike (min)</Label>
                <Input
                  type="number"
                  value={riskLimits.cooldown_minutes_after_vol_spike}
                  onChange={(e) => setRiskLimits(prev => ({ ...prev, cooldown_minutes_after_vol_spike: Number(e.target.value) }))}
                  className="font-mono"
                />
              </div>
            </div>

            <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
              <div>
                <Label>Slippage Guard</Label>
                <p className="text-xs text-muted-foreground">Reject orders during high volatility</p>
              </div>
              <Switch
                checked={riskLimits.require_slippage_guard}
                onCheckedChange={(checked) => setRiskLimits(prev => ({ ...prev, require_slippage_guard: checked }))}
              />
            </div>
          </div>
        )}

        {/* Step 3: Data Selection */}
        {currentStep === 3 && (
          <div className="space-y-4">
            <div className="bg-muted/30 p-4 rounded-lg flex items-start gap-3">
              <Info className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="font-medium">Dataset Selection (Optional)</h4>
                <p className="text-sm text-muted-foreground">
                  Select datasets you plan to backtest on. This helps estimate expected behavior.
                  You can change this when starting a run.
                </p>
              </div>
            </div>

            {datasets.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {datasets.map((ds) => (
                  <button
                    key={ds.id}
                    onClick={() => {
                      setSelectedDatasets(prev =>
                        prev.includes(ds.id)
                          ? prev.filter(id => id !== ds.id)
                          : [...prev, ds.id]
                      );
                    }}
                    className={`p-4 rounded-lg border text-left transition-all ${
                      selectedDatasets.includes(ds.id)
                        ? 'border-primary bg-primary/10'
                        : 'border-border hover:border-primary/50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Database className="w-5 h-5 text-primary" />
                      <div>
                        <div className="font-medium">{ds.symbol} {ds.timeframe}</div>
                        <div className="text-xs text-muted-foreground">
                          {ds.bar_count.toLocaleString()} bars • {ds.session}
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Database className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>No datasets available</p>
                <p className="text-sm">Download data from the Datasets page first</p>
              </div>
            )}

            {dataWarnings.length > 0 && (
              <div className="bg-warning/10 border border-warning/30 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-medium text-warning">Data Warnings</h4>
                    <ul className="mt-2 space-y-1">
                      {dataWarnings.map((w, i) => (
                        <li key={i} className="text-sm text-muted-foreground">{w}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {selectedDatasets.length > 0 && (
              <div className="bg-muted/30 p-4 rounded-lg">
                <h4 className="font-medium mb-2">Estimated Coverage</h4>
                <div className="text-sm text-muted-foreground">
                  {selectedDatasets.length} dataset(s) selected • 
                  {' '}{selectedDatasets.reduce((sum, id) => {
                    const ds = datasets.find(d => d.id === id);
                    return sum + (ds?.bar_count || 0);
                  }, 0).toLocaleString()} total bars
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 4: Create */}
        {currentStep === 4 && (
          <div className="space-y-6">
            <div className="space-y-2">
              <Label>Bot Name</Label>
              <Input
                value={botName}
                onChange={(e) => setBotName(e.target.value)}
                placeholder="My Trading Bot"
                className="text-lg"
              />
            </div>

            <div className="terminal-card p-6">
              <h3 className="font-medium mb-4">Summary</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Template:</span>
                  <span className="ml-2 font-medium">{selectedTemplate?.name}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Risk Profile:</span>
                  <span className="ml-2 font-medium">{riskLimits.preset}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Parameters:</span>
                  <span className="ml-2 font-mono">{Object.keys(params).length} configured</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Max Daily Loss:</span>
                  <span className="ml-2 font-mono">${riskLimits.max_daily_loss_usd}</span>
                </div>
              </div>
            </div>

            <div className="bg-muted/30 p-4 rounded-lg text-sm text-muted-foreground">
              <strong>Note:</strong> Creating a bot will create version 1 with status "draft". 
              You can start backtests immediately. Promote to paper/live after successful testing.
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex justify-between mt-8 pt-6 border-t border-border">
        <Button
          variant="outline"
          onClick={() => currentStep === 0 ? navigate('/bots') : setCurrentStep(prev => prev - 1)}
          className="gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          {currentStep === 0 ? 'Cancel' : 'Back'}
        </Button>

        {currentStep < STEPS.length - 1 ? (
          <Button
            onClick={() => setCurrentStep(prev => prev + 1)}
            disabled={!canProceed()}
            className="gap-2"
          >
            Next
            <ArrowRight className="w-4 h-4" />
          </Button>
        ) : (
          <Button onClick={handleSave} disabled={saving || !canProceed()} className="gap-2">
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Check className="w-4 h-4" />
            )}
            Create Bot
          </Button>
        )}
      </div>
    </div>
  );
}
