import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import {
  Check,
  ChevronRight,
  Database,
  Settings2,
  Play,
  FileSearch,
  RefreshCw,
  Loader2,
} from 'lucide-react';
import type { PipelineStep, PipelineState } from '@/types/experiments';

interface PipelineWizardProps {
  botId: string;
  templateId: string;
  onStepComplete?: (step: PipelineStep) => void;
}

const STEPS: { key: PipelineStep; label: string; icon: React.ElementType }[] = [
  { key: 'create', label: 'Create Bot', icon: Check },
  { key: 'dataset', label: 'Select Dataset', icon: Database },
  { key: 'configure', label: 'Configure', icon: Settings2 },
  { key: 'backtest', label: 'Run Backtest', icon: Play },
  { key: 'review', label: 'Review Results', icon: FileSearch },
  { key: 'iterate', label: 'Iterate', icon: RefreshCw },
];

export function PipelineWizard({ botId, templateId, onStepComplete }: PipelineWizardProps) {
  const [pipelineState, setPipelineState] = useState<PipelineState | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPipelineState();
  }, [botId]);

  async function loadPipelineState() {
    try {
      const { data, error } = await supabase
        .from('pipeline_states')
        .select('*')
        .eq('bot_id', botId)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error loading pipeline state:', error);
      }

      if (data) {
        setPipelineState(data as unknown as PipelineState);
      } else {
        // Create initial pipeline state
        const { data: newState } = await supabase
          .from('pipeline_states')
          .insert({
            bot_id: botId,
            current_step: 'create',
          })
          .select()
          .single();

        if (newState) {
          setPipelineState(newState as unknown as PipelineState);
        }
      }
    } finally {
      setLoading(false);
    }
  }

  async function advanceStep(nextStep: PipelineStep) {
    if (!pipelineState) return;

    const { error } = await supabase
      .from('pipeline_states')
      .update({ current_step: nextStep })
      .eq('id', pipelineState.id);

    if (!error) {
      setPipelineState({ ...pipelineState, current_step: nextStep });
      onStepComplete?.(nextStep);
    }
  }

  function getStepIndex(step: PipelineStep): number {
    return STEPS.findIndex((s) => s.key === step);
  }

  const currentIndex = pipelineState ? getStepIndex(pipelineState.current_step) : 0;

  if (loading) {
    return (
      <div className="terminal-card p-6">
        <div className="flex items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Loading pipeline...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="terminal-card p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="font-medium">Iteration Pipeline</h3>
        {pipelineState?.auto_mode && (
          <span className="px-2 py-1 text-xs font-medium bg-primary/20 text-primary rounded">
            Auto Mode
          </span>
        )}
      </div>

      {/* Step Progress */}
      <div className="flex items-center gap-2 mb-6">
        {STEPS.map((step, index) => {
          const isComplete = index < currentIndex;
          const isCurrent = index === currentIndex;
          const Icon = step.icon;

          return (
            <div key={step.key} className="flex items-center">
              <div
                className={cn(
                  'flex items-center gap-2 px-3 py-2 rounded-lg transition-colors',
                  isComplete && 'bg-success/20 text-success',
                  isCurrent && 'bg-primary/20 text-primary border border-primary/30',
                  !isComplete && !isCurrent && 'bg-muted/30 text-muted-foreground'
                )}
              >
                <Icon className="w-4 h-4" />
                <span className="text-sm font-medium hidden md:inline">{step.label}</span>
              </div>
              {index < STEPS.length - 1 && (
                <ChevronRight className="w-4 h-4 text-muted-foreground mx-1" />
              )}
            </div>
          );
        })}
      </div>

      {/* Current Step Actions */}
      <div className="p-4 rounded-lg border border-border bg-muted/20">
        {pipelineState?.current_step === 'create' && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Bot created. Select a dataset to continue.</p>
            <Link to={`/datasets`}>
              <Button size="sm" onClick={() => advanceStep('dataset')}>
                Go to Datasets
              </Button>
            </Link>
          </div>
        )}

        {pipelineState?.current_step === 'dataset' && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Download or select a dataset for backtesting.
            </p>
            <Button size="sm" onClick={() => advanceStep('configure')}>
              Dataset Ready → Configure
            </Button>
          </div>
        )}

        {pipelineState?.current_step === 'configure' && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Adjust strategy parameters and risk limits.
            </p>
            <Button size="sm" onClick={() => advanceStep('backtest')}>
              Configuration Ready → Run Backtest
            </Button>
          </div>
        )}

        {pipelineState?.current_step === 'backtest' && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Backtest in progress or ready to start.
            </p>
            <Link to={`/bots/${botId}/run`}>
              <Button size="sm" className="gap-2">
                <Play className="w-4 h-4" />
                Start Backtest
              </Button>
            </Link>
          </div>
        )}

        {pipelineState?.current_step === 'review' && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Review backtest results and AI advice.
            </p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => advanceStep('configure')}>
                Back to Configure
              </Button>
              <Button size="sm" onClick={() => advanceStep('iterate')}>
                Continue to Iteration
              </Button>
            </div>
          </div>
        )}

        {pipelineState?.current_step === 'iterate' && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Apply changes and run the next iteration.
            </p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => advanceStep('backtest')}>
                Run Another Backtest
              </Button>
              <Link to={`/bots/${botId}/tuner`}>
                <Button size="sm">Start Auto Tuner</Button>
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
