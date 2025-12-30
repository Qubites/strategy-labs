import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';

interface MetricCardProps {
  label: string;
  value: string | number;
  icon?: LucideIcon;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
  className?: string;
  valueClassName?: string;
}

export function MetricCard({
  label,
  value,
  icon: Icon,
  trend,
  trendValue,
  className,
  valueClassName,
}: MetricCardProps) {
  return (
    <div className={cn('terminal-card p-4', className)}>
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="metric-label">{label}</p>
          <p className={cn('metric-value', valueClassName)}>{value}</p>
          {trendValue && (
            <p
              className={cn(
                'text-xs font-mono',
                trend === 'up' && 'text-success',
                trend === 'down' && 'text-destructive',
                trend === 'neutral' && 'text-muted-foreground'
              )}
            >
              {trend === 'up' && '↑'}
              {trend === 'down' && '↓'}
              {trend === 'neutral' && '→'} {trendValue}
            </p>
          )}
        </div>
        {Icon && (
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Icon className="w-5 h-5 text-primary" />
          </div>
        )}
      </div>
    </div>
  );
}
