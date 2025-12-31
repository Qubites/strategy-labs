import { cn } from '@/lib/utils';
import { CheckCircle2, Circle, Loader2, XCircle } from 'lucide-react';

export type LifecycleStatus = 'DRAFT' | 'BACKTEST_WINNER' | 'PAPER_RUNNING' | 'PAPER_PASSED' | 'LIVE_READY' | 'REJECTED';

const statusConfig: Record<LifecycleStatus, { label: string; color: string; bgColor: string }> = {
  DRAFT: { label: 'Draft', color: 'text-muted-foreground', bgColor: 'bg-muted/50' },
  BACKTEST_WINNER: { label: 'Backtest Winner', color: 'text-warning', bgColor: 'bg-warning/10' },
  PAPER_RUNNING: { label: 'Paper Trading', color: 'text-info', bgColor: 'bg-info/10' },
  PAPER_PASSED: { label: 'Paper Passed', color: 'text-success', bgColor: 'bg-success/10' },
  LIVE_READY: { label: 'Live Ready', color: 'text-success', bgColor: 'bg-success/10' },
  REJECTED: { label: 'Rejected', color: 'text-destructive', bgColor: 'bg-destructive/10' },
};

interface LifecycleStatusBadgeProps {
  status: LifecycleStatus;
  className?: string;
}

export function LifecycleStatusBadge({ status, className }: LifecycleStatusBadgeProps) {
  const config = statusConfig[status] || statusConfig.DRAFT;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium',
        config.bgColor,
        config.color,
        className
      )}
    >
      {status === 'PAPER_RUNNING' && <Loader2 className="w-3 h-3 animate-spin" />}
      {status === 'LIVE_READY' && <CheckCircle2 className="w-3 h-3" />}
      {status === 'REJECTED' && <XCircle className="w-3 h-3" />}
      {config.label}
    </span>
  );
}

interface PipelineProgressProps {
  currentStatus: LifecycleStatus;
  className?: string;
}

const pipelineSteps: { status: LifecycleStatus; label: string }[] = [
  { status: 'DRAFT', label: 'Draft' },
  { status: 'BACKTEST_WINNER', label: 'Backtest' },
  { status: 'PAPER_RUNNING', label: 'Paper' },
  { status: 'LIVE_READY', label: 'Live Ready' },
];

export function PipelineProgress({ currentStatus, className }: PipelineProgressProps) {
  const currentIndex = pipelineSteps.findIndex(s => s.status === currentStatus);
  const isRejected = currentStatus === 'REJECTED';

  return (
    <div className={cn('flex items-center gap-2', className)}>
      {pipelineSteps.map((step, index) => {
        const isPast = index < currentIndex;
        const isCurrent = index === currentIndex;
        const isFuture = index > currentIndex;

        return (
          <div key={step.status} className="flex items-center">
            {/* Step indicator */}
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all',
                  isPast && 'bg-success border-success',
                  isCurrent && !isRejected && 'bg-primary/20 border-primary',
                  isCurrent && isRejected && 'bg-destructive/20 border-destructive',
                  isFuture && 'bg-muted border-border'
                )}
              >
                {isPast && <CheckCircle2 className="w-4 h-4 text-success-foreground" />}
                {isCurrent && !isRejected && <Circle className="w-4 h-4 text-primary fill-primary" />}
                {isCurrent && isRejected && <XCircle className="w-4 h-4 text-destructive" />}
                {isFuture && <Circle className="w-4 h-4 text-muted-foreground" />}
              </div>
              <span
                className={cn(
                  'text-xs mt-1 whitespace-nowrap',
                  isPast && 'text-success',
                  isCurrent && !isRejected && 'text-primary font-medium',
                  isCurrent && isRejected && 'text-destructive font-medium',
                  isFuture && 'text-muted-foreground'
                )}
              >
                {step.label}
              </span>
            </div>

            {/* Connector line */}
            {index < pipelineSteps.length - 1 && (
              <div
                className={cn(
                  'w-12 h-0.5 mx-1 mt-[-16px]',
                  index < currentIndex ? 'bg-success' : 'bg-border'
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
