import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Save } from 'lucide-react';
import type { BotVersion, ParamSchema, ParamDefinition, RiskLimits } from '@/types/trading';

interface VersionEditorDialogProps {
  botId: string;
  templateId: string;
  sourceVersion?: BotVersion;
  nextVersionNumber: number;
  onVersionCreated: () => void;
  trigger: React.ReactNode;
}

export function VersionEditorDialog({
  botId,
  templateId,
  sourceVersion,
  nextVersionNumber,
  onVersionCreated,
  trigger,
}: VersionEditorDialogProps) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [schema, setSchema] = useState<ParamSchema | null>(null);
  const [params, setParams] = useState<Record<string, number | string | boolean>>({});
  const [riskLimits, setRiskLimits] = useState<RiskLimits | null>(null);

  useEffect(() => {
    if (open) {
      loadSchema();
    }
  }, [open, templateId]);

  async function loadSchema() {
    try {
      const { data: template, error } = await supabase
        .from('strategy_templates')
        .select('param_schema_json')
        .eq('id', templateId)
        .single();

      if (error) throw error;

      const parsedSchema = JSON.parse(template.param_schema_json) as ParamSchema;
      setSchema(parsedSchema);

      // Initialize params from source version or defaults
      if (sourceVersion) {
        setParams(JSON.parse(sourceVersion.params_json));
        setRiskLimits(JSON.parse(sourceVersion.risk_limits_json));
      } else {
        const defaultParams: Record<string, number | string | boolean> = {};
        parsedSchema.params.forEach((param) => {
          defaultParams[param.key] = param.default;
        });
        setParams(defaultParams);
        setRiskLimits(parsedSchema.default_risk_limits);
      }
    } catch (error) {
      console.error('Error loading schema:', error);
      toast.error('Failed to load template schema');
    }
  }

  function updateParam(key: string, value: number | string | boolean) {
    setParams((prev) => ({ ...prev, [key]: value }));
  }

  function updateRiskLimit(key: keyof RiskLimits, value: number | string) {
    setRiskLimits((prev) => prev ? { ...prev, [key]: value } : null);
  }

  async function handleSave() {
    if (!schema || !riskLimits) {
      toast.error('Schema not loaded');
      return;
    }

    setSaving(true);
    try {
      const paramsJson = JSON.stringify(params);
      const riskLimitsJson = JSON.stringify(riskLimits);
      const paramsHash = btoa(paramsJson).slice(0, 16);
      const versionHash = btoa(paramsJson + riskLimitsJson + Date.now()).slice(0, 16);

      const { error } = await supabase
        .from('bot_versions')
        .insert({
          bot_id: botId,
          version_number: nextVersionNumber,
          params_json: paramsJson,
          params_hash: paramsHash,
          risk_limits_json: riskLimitsJson,
          version_hash: versionHash,
          status: 'draft',
        });

      if (error) throw error;

      toast.success(`Created version ${nextVersionNumber}`);
      setOpen(false);
      onVersionCreated();
    } catch (error) {
      console.error('Error creating version:', error);
      toast.error('Failed to create version');
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
          <div key={param.key} className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm">{param.label}</Label>
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
            <Label className="text-sm">{param.label}</Label>
            <Switch
              checked={Boolean(value)}
              onCheckedChange={(checked) => updateParam(param.key, checked)}
            />
          </div>
        );

      case 'enum':
        return (
          <div key={param.key} className="space-y-2">
            <Label className="text-sm">{param.label}</Label>
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
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger}
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {sourceVersion 
              ? `Fork Version ${sourceVersion.version_number} → v${nextVersionNumber}`
              : `Create Version ${nextVersionNumber}`
            }
          </DialogTitle>
          <DialogDescription>
            Adjust parameters and risk limits, then save as a new immutable version.
          </DialogDescription>
        </DialogHeader>

        {schema ? (
          <div className="space-y-6 py-4">
            {/* Strategy Parameters */}
            <div className="space-y-4">
              <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
                Strategy Parameters
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {schema.params.map(renderParamControl)}
              </div>
            </div>

            {/* Risk Limits */}
            {riskLimits && (
              <div className="space-y-4">
                <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
                  Risk Limits
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-sm">Max Position Size ($)</Label>
                    <Input
                      type="number"
                      value={riskLimits.max_position_size_usd}
                      onChange={(e) => updateRiskLimit('max_position_size_usd', parseFloat(e.target.value) || 0)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm">Max Daily Loss ($)</Label>
                    <Input
                      type="number"
                      value={riskLimits.max_daily_loss_usd}
                      onChange={(e) => updateRiskLimit('max_daily_loss_usd', parseFloat(e.target.value) || 0)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm">Max Drawdown ($)</Label>
                    <Input
                      type="number"
                      value={riskLimits.max_drawdown_usd}
                      onChange={(e) => updateRiskLimit('max_drawdown_usd', parseFloat(e.target.value) || 0)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm">Max Consecutive Losses</Label>
                    <Input
                      type="number"
                      value={riskLimits.max_consecutive_losses}
                      onChange={(e) => updateRiskLimit('max_consecutive_losses', parseInt(e.target.value) || 0)}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="py-8 text-center text-muted-foreground">
            <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
            Loading parameters...
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || !schema} className="gap-2">
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Save Version
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
