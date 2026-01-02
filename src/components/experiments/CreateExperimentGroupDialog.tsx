import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
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
import { Plus, Loader2 } from 'lucide-react';
import type { StrategyTemplate, Dataset } from '@/types/trading';

interface CreateExperimentGroupDialogProps {
  onCreated?: (groupId: string) => void;
  trigger?: React.ReactNode;
}

export function CreateExperimentGroupDialog({
  onCreated,
  trigger,
}: CreateExperimentGroupDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [templates, setTemplates] = useState<StrategyTemplate[]>([]);
  const [datasets, setDatasets] = useState<Dataset[]>([]);

  const [name, setName] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [datasetId, setDatasetId] = useState('');
  const [timeframe, setTimeframe] = useState('5m');
  const [session, setSession] = useState('RTH');
  const [pfWeight, setPfWeight] = useState(0.35);
  const [returnWeight, setReturnWeight] = useState(0.25);
  const [sharpeWeight, setSharpeWeight] = useState(0.25);
  const [ddPenalty, setDdPenalty] = useState(0.15);

  useEffect(() => {
    if (open) loadData();
  }, [open]);

  async function loadData() {
    const [templatesRes, datasetsRes] = await Promise.all([
      supabase.from('strategy_templates').select('*').eq('is_active', true),
      supabase.from('datasets').select('*').order('created_at', { ascending: false }),
    ]);

    setTemplates(templatesRes.data || []);
    setDatasets((datasetsRes.data || []) as Dataset[]);
  }

  async function handleCreate() {
    if (!name.trim()) {
      toast.error('Name is required');
      return;
    }
    if (!templateId) {
      toast.error('Template is required');
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('experiment_groups')
        .insert({
          name: name.trim(),
          template_id: templateId,
          dataset_id: datasetId && datasetId !== 'any' ? datasetId : null,
          timeframe,
          session,
          objective_config: {
            pf_weight: pfWeight,
            return_weight: returnWeight,
            sharpe_weight: sharpeWeight,
            dd_penalty: ddPenalty,
          },
        })
        .select()
        .single();

      if (error) throw error;

      toast.success('Experiment group created');
      setOpen(false);
      resetForm();
      onCreated?.(data.id);
    } catch (error: any) {
      toast.error(error.message || 'Failed to create experiment group');
    } finally {
      setLoading(false);
    }
  }

  function resetForm() {
    setName('');
    setTemplateId('');
    setDatasetId('');
    setTimeframe('5m');
    setSession('RTH');
    setPfWeight(0.35);
    setReturnWeight(0.25);
    setSharpeWeight(0.25);
    setDdPenalty(0.15);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button className="gap-2">
            <Plus className="w-4 h-4" />
            New Experiment Group
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Experiment Group</DialogTitle>
          <DialogDescription>
            Group comparable bot versions with shared criteria for leaderboard ranking.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Name */}
          <div className="space-y-2">
            <Label>Group Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., QQQ Momentum Q1 2026"
            />
          </div>

          {/* Template */}
          <div className="space-y-2">
            <Label>Strategy Template</Label>
            <Select value={templateId} onValueChange={setTemplateId}>
              <SelectTrigger>
                <SelectValue placeholder="Select template..." />
              </SelectTrigger>
              <SelectContent>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Dataset */}
          <div className="space-y-2">
            <Label>Dataset (optional)</Label>
            <Select value={datasetId} onValueChange={setDatasetId}>
              <SelectTrigger>
                <SelectValue placeholder="Any dataset..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any dataset</SelectItem>
                {datasets.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.symbol} • {d.timeframe} • {d.session}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Timeframe & Session */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Timeframe</Label>
              <Select value={timeframe} onValueChange={setTimeframe}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1m">1 minute</SelectItem>
                  <SelectItem value="5m">5 minutes</SelectItem>
                  <SelectItem value="15m">15 minutes</SelectItem>
                  <SelectItem value="30m">30 minutes</SelectItem>
                  <SelectItem value="1h">1 hour</SelectItem>
                  <SelectItem value="1d">1 day</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Session</Label>
              <Select value={session} onValueChange={setSession}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="RTH">RTH (Regular)</SelectItem>
                  <SelectItem value="ALL">ALL (Extended)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Objective Weights */}
          <div className="space-y-4 p-4 rounded-lg border border-border bg-muted/20">
            <Label className="text-sm font-medium">Objective Weights</Label>
            
            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span>Profit Factor</span>
                  <span>{(pfWeight * 100).toFixed(0)}%</span>
                </div>
                <Slider
                  value={[pfWeight]}
                  onValueChange={([v]) => setPfWeight(v)}
                  min={0}
                  max={1}
                  step={0.05}
                />
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span>Return</span>
                  <span>{(returnWeight * 100).toFixed(0)}%</span>
                </div>
                <Slider
                  value={[returnWeight]}
                  onValueChange={([v]) => setReturnWeight(v)}
                  min={0}
                  max={1}
                  step={0.05}
                />
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span>Sharpe Ratio</span>
                  <span>{(sharpeWeight * 100).toFixed(0)}%</span>
                </div>
                <Slider
                  value={[sharpeWeight]}
                  onValueChange={([v]) => setSharpeWeight(v)}
                  min={0}
                  max={1}
                  step={0.05}
                />
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-destructive">Drawdown Penalty</span>
                  <span>{(ddPenalty * 100).toFixed(0)}%</span>
                </div>
                <Slider
                  value={[ddPenalty]}
                  onValueChange={([v]) => setDdPenalty(v)}
                  min={0}
                  max={0.5}
                  step={0.05}
                />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={loading}>
            {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Create Group
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
