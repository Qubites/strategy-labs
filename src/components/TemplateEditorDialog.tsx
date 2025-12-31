import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Plus, Trash2, GripVertical } from 'lucide-react';
import type { ParamDefinition, RiskLimits } from '@/types/trading';

interface TemplateEditorDialogProps {
  trigger: React.ReactNode;
  onTemplateCreated: () => void;
}

interface ParamFormData extends Omit<ParamDefinition, 'default'> {
  defaultValue: string;
  enumValues: string;
}

const DEFAULT_RISK_PRESETS: Record<string, RiskLimits> = {
  conservative: {
    preset: 'conservative',
    max_position_size_usd: 1000,
    max_daily_loss_usd: 100,
    max_drawdown_usd: 200,
    max_consecutive_losses: 2,
    cooldown_minutes_after_loss: 30,
    cooldown_minutes_after_vol_spike: 15,
    require_slippage_guard: true,
  },
  normal: {
    preset: 'normal',
    max_position_size_usd: 2000,
    max_daily_loss_usd: 200,
    max_drawdown_usd: 400,
    max_consecutive_losses: 3,
    cooldown_minutes_after_loss: 15,
    cooldown_minutes_after_vol_spike: 10,
    require_slippage_guard: true,
  },
  aggressive: {
    preset: 'aggressive',
    max_position_size_usd: 5000,
    max_daily_loss_usd: 500,
    max_drawdown_usd: 1000,
    max_consecutive_losses: 5,
    cooldown_minutes_after_loss: 5,
    cooldown_minutes_after_vol_spike: 5,
    require_slippage_guard: false,
  },
};

export function TemplateEditorDialog({ trigger, onTemplateCreated }: TemplateEditorDialogProps) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Basic info
  const [templateId, setTemplateId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [description, setDescription] = useState('');

  // Parameters
  const [params, setParams] = useState<ParamFormData[]>([]);

  // Risk limits
  const [riskPreset, setRiskPreset] = useState<string>('normal');
  const [riskLimits, setRiskLimits] = useState<RiskLimits>(DEFAULT_RISK_PRESETS.normal);

  const resetForm = () => {
    setTemplateId('');
    setDisplayName('');
    setDescription('');
    setParams([]);
    setRiskPreset('normal');
    setRiskLimits(DEFAULT_RISK_PRESETS.normal);
  };

  const addParameter = () => {
    setParams([
      ...params,
      {
        key: '',
        type: 'int',
        label: '',
        min: 1,
        max: 100,
        step: 1,
        defaultValue: '10',
        enumValues: '',
      },
    ]);
  };

  const updateParameter = (index: number, field: keyof ParamFormData, value: any) => {
    const updated = [...params];
    updated[index] = { ...updated[index], [field]: value };
    setParams(updated);
  };

  const removeParameter = (index: number) => {
    setParams(params.filter((_, i) => i !== index));
  };

  const handleRiskPresetChange = (preset: string) => {
    setRiskPreset(preset);
    if (DEFAULT_RISK_PRESETS[preset]) {
      setRiskLimits(DEFAULT_RISK_PRESETS[preset]);
    }
  };

  const updateRiskLimit = (key: keyof RiskLimits, value: any) => {
    setRiskLimits({ ...riskLimits, [key]: value });
  };

  const validateForm = (): string | null => {
    if (!templateId.match(/^[a-z][a-z0-9_]*_v\d+$/)) {
      return 'Template ID must be snake_case ending with version (e.g., my_strategy_v1)';
    }
    if (!displayName.trim()) {
      return 'Display name is required';
    }
    if (params.length === 0) {
      return 'At least one parameter is required';
    }
    for (const param of params) {
      if (!param.key.match(/^[a-z][a-z0-9_]*$/)) {
        return `Parameter key "${param.key}" must be snake_case`;
      }
      if (!param.label.trim()) {
        return `Parameter "${param.key}" needs a label`;
      }
      if (param.type === 'int' || param.type === 'float') {
        if (param.min !== undefined && param.max !== undefined && param.min >= param.max) {
          return `Parameter "${param.key}": min must be less than max`;
        }
      }
      if (param.type === 'enum' && !param.enumValues.trim()) {
        return `Parameter "${param.key}": enum values are required`;
      }
    }
    return null;
  };

  const buildParamSchema = () => {
    const paramDefinitions: ParamDefinition[] = params.map((p) => {
      const def: ParamDefinition = {
        key: p.key,
        type: p.type,
        label: p.label,
        default: p.type === 'bool' ? p.defaultValue === 'true' : 
                 p.type === 'enum' ? p.defaultValue :
                 p.type === 'float' ? parseFloat(p.defaultValue) :
                 parseInt(p.defaultValue),
      };
      
      if (p.type === 'int' || p.type === 'float') {
        def.min = p.min;
        def.max = p.max;
        def.step = p.step;
      }
      
      if (p.type === 'enum') {
        def.values = p.enumValues.split(',').map((v) => v.trim());
      }
      
      return def;
    });

    return {
      template_id: templateId,
      name: displayName,
      description: description,
      params: paramDefinitions,
      default_risk_limits: riskLimits,
    };
  };

  const handleSave = async () => {
    const error = validateForm();
    if (error) {
      toast.error(error);
      return;
    }

    setSaving(true);
    try {
      const schema = buildParamSchema();
      
      const { error: insertError } = await supabase.from('strategy_templates').insert({
        id: templateId,
        name: displayName,
        description: description,
        param_schema_json: JSON.stringify(schema),
        is_active: true,
      });

      if (insertError) throw insertError;

      toast.success('Template created successfully');
      resetForm();
      setOpen(false);
      onTemplateCreated();
    } catch (err: any) {
      console.error('Error creating template:', err);
      if (err.code === '23505') {
        toast.error('A template with this ID already exists');
      } else {
        toast.error('Failed to create template');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Template</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Basic Info */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-foreground">Basic Info</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="templateId">Template ID</Label>
                <Input
                  id="templateId"
                  placeholder="my_strategy_v1"
                  value={templateId}
                  onChange={(e) => setTemplateId(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                />
                <p className="text-xs text-muted-foreground">snake_case with version suffix</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="displayName">Display Name</Label>
                <Input
                  id="displayName"
                  placeholder="My Strategy"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="Describe what this strategy does..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
              />
            </div>
          </div>

          {/* Parameters */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-foreground">Parameters</h3>
              <Button type="button" variant="outline" size="sm" onClick={addParameter}>
                <Plus className="w-4 h-4 mr-1" />
                Add Parameter
              </Button>
            </div>

            {params.length === 0 ? (
              <div className="text-center py-8 border border-dashed rounded-lg">
                <p className="text-sm text-muted-foreground">No parameters defined yet</p>
                <Button type="button" variant="ghost" size="sm" className="mt-2" onClick={addParameter}>
                  Add your first parameter
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {params.map((param, index) => (
                  <div key={index} className="border rounded-lg p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <GripVertical className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm font-medium">Parameter {index + 1}</span>
                      <div className="flex-1" />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeParameter(index)}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Key</Label>
                        <Input
                          placeholder="param_key"
                          value={param.key}
                          onChange={(e) =>
                            updateParameter(index, 'key', e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Label</Label>
                        <Input
                          placeholder="Display Label"
                          value={param.label}
                          onChange={(e) => updateParameter(index, 'label', e.target.value)}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Type</Label>
                        <Select
                          value={param.type}
                          onValueChange={(v) => updateParameter(index, 'type', v)}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="int">Integer</SelectItem>
                            <SelectItem value="float">Float</SelectItem>
                            <SelectItem value="bool">Boolean</SelectItem>
                            <SelectItem value="enum">Enum</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {(param.type === 'int' || param.type === 'float') && (
                      <div className="grid grid-cols-4 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs">Min</Label>
                          <Input
                            type="number"
                            value={param.min ?? ''}
                            onChange={(e) => updateParameter(index, 'min', parseFloat(e.target.value))}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Max</Label>
                          <Input
                            type="number"
                            value={param.max ?? ''}
                            onChange={(e) => updateParameter(index, 'max', parseFloat(e.target.value))}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Step</Label>
                          <Input
                            type="number"
                            value={param.step ?? ''}
                            onChange={(e) => updateParameter(index, 'step', parseFloat(e.target.value))}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Default</Label>
                          <Input
                            type="number"
                            value={param.defaultValue}
                            onChange={(e) => updateParameter(index, 'defaultValue', e.target.value)}
                          />
                        </div>
                      </div>
                    )}

                    {param.type === 'bool' && (
                      <div className="flex items-center gap-2">
                        <Label className="text-xs">Default</Label>
                        <Switch
                          checked={param.defaultValue === 'true'}
                          onCheckedChange={(v) => updateParameter(index, 'defaultValue', v ? 'true' : 'false')}
                        />
                      </div>
                    )}

                    {param.type === 'enum' && (
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs">Values (comma-separated)</Label>
                          <Input
                            placeholder="option1, option2, option3"
                            value={param.enumValues}
                            onChange={(e) => updateParameter(index, 'enumValues', e.target.value)}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Default</Label>
                          <Input
                            placeholder="option1"
                            value={param.defaultValue}
                            onChange={(e) => updateParameter(index, 'defaultValue', e.target.value)}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Risk Limits */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-foreground">Default Risk Limits</h3>
            
            <div className="space-y-2">
              <Label>Preset</Label>
              <Select value={riskPreset} onValueChange={handleRiskPresetChange}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="conservative">Conservative</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="aggressive">Aggressive</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs">Max Position Size (USD)</Label>
                <Input
                  type="number"
                  value={riskLimits.max_position_size_usd}
                  onChange={(e) => updateRiskLimit('max_position_size_usd', parseInt(e.target.value))}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Max Daily Loss (USD)</Label>
                <Input
                  type="number"
                  value={riskLimits.max_daily_loss_usd}
                  onChange={(e) => updateRiskLimit('max_daily_loss_usd', parseInt(e.target.value))}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Max Drawdown (USD)</Label>
                <Input
                  type="number"
                  value={riskLimits.max_drawdown_usd}
                  onChange={(e) => updateRiskLimit('max_drawdown_usd', parseInt(e.target.value))}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Max Consecutive Losses</Label>
                <Input
                  type="number"
                  value={riskLimits.max_consecutive_losses}
                  onChange={(e) => updateRiskLimit('max_consecutive_losses', parseInt(e.target.value))}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Cooldown After Loss (min)</Label>
                <Input
                  type="number"
                  value={riskLimits.cooldown_minutes_after_loss}
                  onChange={(e) => updateRiskLimit('cooldown_minutes_after_loss', parseInt(e.target.value))}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Cooldown After Vol Spike (min)</Label>
                <Input
                  type="number"
                  value={riskLimits.cooldown_minutes_after_vol_spike}
                  onChange={(e) => updateRiskLimit('cooldown_minutes_after_vol_spike', parseInt(e.target.value))}
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Switch
                checked={riskLimits.require_slippage_guard}
                onCheckedChange={(v) => updateRiskLimit('require_slippage_guard', v)}
              />
              <Label>Require Slippage Guard</Label>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Creating...' : 'Create Template'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
