import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Settings2, Play, Pause, RotateCcw, Zap } from 'lucide-react';
import type { StopConditions, ObjectiveConfig } from '@/types/experiments';

interface AutomationControlsProps {
  autoMode: boolean;
  maxIterations: number;
  mutationAggressiveness: number;
  stopConditions: StopConditions;
  objectiveConfig: ObjectiveConfig;
  currentIteration?: number;
  isRunning?: boolean;
  onAutoModeChange: (enabled: boolean) => void;
  onMaxIterationsChange: (value: number) => void;
  onAggressivenessChange: (value: number) => void;
  onStopConditionsChange: (conditions: StopConditions) => void;
  onObjectiveConfigChange: (config: ObjectiveConfig) => void;
  onStartIteration?: () => void;
  onPauseIteration?: () => void;
  onResetToChampion?: () => void;
}

export function AutomationControls({
  autoMode,
  maxIterations,
  mutationAggressiveness,
  stopConditions,
  objectiveConfig,
  currentIteration = 0,
  isRunning = false,
  onAutoModeChange,
  onMaxIterationsChange,
  onAggressivenessChange,
  onStopConditionsChange,
  onObjectiveConfigChange,
  onStartIteration,
  onPauseIteration,
  onResetToChampion,
}: AutomationControlsProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [localStopConditions, setLocalStopConditions] = useState(stopConditions);
  const [localObjective, setLocalObjective] = useState(objectiveConfig);

  const handleSaveSettings = () => {
    onStopConditionsChange(localStopConditions);
    onObjectiveConfigChange(localObjective);
    setSettingsOpen(false);
  };

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-primary" />
          <h3 className="font-medium">Automation Controls</h3>
        </div>
        <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
          <DialogTrigger asChild>
            <Button variant="ghost" size="sm">
              <Settings2 className="w-4 h-4" />
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Iteration Settings</DialogTitle>
              <DialogDescription>
                Configure stop conditions and objective weights
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-6 py-4">
              <div className="space-y-4">
                <h4 className="text-sm font-medium text-muted-foreground uppercase">Stop Conditions</h4>
                <div className="space-y-3">
                  <div>
                    <Label className="text-sm">Max Drawdown (%)</Label>
                    <Input
                      type="number"
                      value={(localStopConditions.max_dd * 100).toFixed(0)}
                      onChange={(e) => setLocalStopConditions(prev => ({
                        ...prev,
                        max_dd: parseFloat(e.target.value) / 100
                      }))}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-sm">Min Improvement (%)</Label>
                    <Input
                      type="number"
                      value={(localStopConditions.min_improvement * 100).toFixed(0)}
                      onChange={(e) => setLocalStopConditions(prev => ({
                        ...prev,
                        min_improvement: parseFloat(e.target.value) / 100
                      }))}
                      className="mt-1"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="text-sm font-medium text-muted-foreground uppercase">Objective Weights</h4>
                <div className="space-y-3">
                  <div>
                    <div className="flex justify-between mb-1">
                      <Label className="text-sm">Profit Factor</Label>
                      <span className="text-xs font-mono">{(localObjective.pf_weight * 100).toFixed(0)}%</span>
                    </div>
                    <Slider
                      value={[localObjective.pf_weight]}
                      onValueChange={([v]) => setLocalObjective(prev => ({ ...prev, pf_weight: v }))}
                      min={0}
                      max={1}
                      step={0.05}
                    />
                  </div>
                  <div>
                    <div className="flex justify-between mb-1">
                      <Label className="text-sm">Return</Label>
                      <span className="text-xs font-mono">{(localObjective.return_weight * 100).toFixed(0)}%</span>
                    </div>
                    <Slider
                      value={[localObjective.return_weight]}
                      onValueChange={([v]) => setLocalObjective(prev => ({ ...prev, return_weight: v }))}
                      min={0}
                      max={1}
                      step={0.05}
                    />
                  </div>
                  <div>
                    <div className="flex justify-between mb-1">
                      <Label className="text-sm">Sharpe Ratio</Label>
                      <span className="text-xs font-mono">{(localObjective.sharpe_weight * 100).toFixed(0)}%</span>
                    </div>
                    <Slider
                      value={[localObjective.sharpe_weight]}
                      onValueChange={([v]) => setLocalObjective(prev => ({ ...prev, sharpe_weight: v }))}
                      min={0}
                      max={1}
                      step={0.05}
                    />
                  </div>
                  <div>
                    <div className="flex justify-between mb-1">
                      <Label className="text-sm">DD Penalty</Label>
                      <span className="text-xs font-mono">{(localObjective.dd_penalty * 100).toFixed(0)}%</span>
                    </div>
                    <Slider
                      value={[localObjective.dd_penalty]}
                      onValueChange={([v]) => setLocalObjective(prev => ({ ...prev, dd_penalty: v }))}
                      min={0}
                      max={1}
                      step={0.05}
                    />
                  </div>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setSettingsOpen(false)}>Cancel</Button>
              <Button onClick={handleSaveSettings}>Save Settings</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Auto Mode Toggle */}
      <div className="flex items-center justify-between py-2 border-b border-border">
        <div>
          <Label className="text-sm">Auto Iteration Mode</Label>
          <p className="text-xs text-muted-foreground">Automatically run iterations</p>
        </div>
        <Switch
          checked={autoMode}
          onCheckedChange={onAutoModeChange}
        />
      </div>

      {/* Iteration Count */}
      <div className="space-y-2">
        <div className="flex justify-between">
          <Label className="text-sm">Max Iterations</Label>
          <span className="text-xs font-mono text-primary">{maxIterations}</span>
        </div>
        <Slider
          value={[maxIterations]}
          onValueChange={([v]) => onMaxIterationsChange(v)}
          min={5}
          max={100}
          step={5}
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>5</span>
          <span>100</span>
        </div>
      </div>

      {/* Mutation Aggressiveness */}
      <div className="space-y-2">
        <div className="flex justify-between">
          <Label className="text-sm">Mutation Aggressiveness</Label>
          <span className="text-xs font-mono text-primary">{(mutationAggressiveness * 100).toFixed(0)}%</span>
        </div>
        <Slider
          value={[mutationAggressiveness]}
          onValueChange={([v]) => onAggressivenessChange(v)}
          min={0.1}
          max={1}
          step={0.1}
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Conservative</span>
          <span>Aggressive</span>
        </div>
      </div>

      {/* Current Status */}
      <div className="bg-muted/30 rounded-lg p-3 text-sm">
        <div className="flex justify-between mb-1">
          <span className="text-muted-foreground">Current Iteration:</span>
          <span className="font-mono">{currentIteration} / {maxIterations}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Status:</span>
          <span className={isRunning ? 'text-success' : 'text-muted-foreground'}>
            {isRunning ? 'Running' : 'Idle'}
          </span>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2">
        {isRunning ? (
          <Button 
            variant="outline" 
            size="sm" 
            className="flex-1 gap-2"
            onClick={onPauseIteration}
          >
            <Pause className="w-4 h-4" />
            Pause
          </Button>
        ) : (
          <Button 
            size="sm" 
            className="flex-1 gap-2"
            onClick={onStartIteration}
          >
            <Play className="w-4 h-4" />
            Start
          </Button>
        )}
        <Button 
          variant="ghost" 
          size="sm"
          onClick={onResetToChampion}
          title="Reset to Champion"
        >
          <RotateCcw className="w-4 h-4" />
        </Button>
      </div>
    </Card>
  );
}
