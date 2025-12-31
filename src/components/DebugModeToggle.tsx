import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Bug, Info } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface DebugModeToggleProps {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
}

export function DebugModeToggle({ enabled, onToggle }: DebugModeToggleProps) {
  return (
    <div className="flex items-center gap-3 p-4 rounded-lg border border-border bg-muted/20">
      <Bug className={`w-5 h-5 ${enabled ? 'text-primary' : 'text-muted-foreground'}`} />
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <Label htmlFor="debug-mode" className="font-medium">
            Debug Mode
          </Label>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <Info className="w-4 h-4 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p>When enabled, logs every entry/exit decision, skipped trades, and risk halts (max loss, DD, trades/day limit).</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          Log detailed decision rationale for each bar
        </p>
      </div>
      <Switch
        id="debug-mode"
        checked={enabled}
        onCheckedChange={onToggle}
      />
    </div>
  );
}
