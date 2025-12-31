import { cn } from '@/lib/utils';

interface StatusBadgeProps {
  status: string;
  className?: string;
}

const statusConfig: Record<string, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'bg-muted text-muted-foreground' },
  backtested: { label: 'Backtested', className: 'bg-primary/20 text-primary' },
  approved_paper: { label: 'Paper', className: 'bg-warning/20 text-warning' },
  approved_live: { label: 'Live', className: 'bg-success/20 text-success' },
  queued: { label: 'Queued', className: 'bg-muted text-muted-foreground' },
  running: { label: 'Running', className: 'bg-primary/20 text-primary animate-pulse' },
  paused: { label: 'Paused', className: 'bg-warning/20 text-warning' },
  completed: { label: 'Completed', className: 'bg-success/20 text-success' },
  done: { label: 'Done', className: 'bg-success/20 text-success' },
  failed: { label: 'Failed', className: 'bg-destructive/20 text-destructive' },
  stopped: { label: 'Stopped', className: 'bg-warning/20 text-warning' },
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status] || statusConfig.draft;
  
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium',
        config.className,
        className
      )}
    >
      {status === 'running' && (
        <span className="w-1.5 h-1.5 rounded-full bg-current mr-1.5 animate-pulse" />
      )}
      {config.label}
    </span>
  );
}
