import { AlertTriangle, Info, CheckCircle } from 'lucide-react';

interface ExpectedBehaviorProps {
  params: Record<string, any>;
  templateId: string;
  barCount?: number;
  session?: string;
}

interface Warning {
  type: 'info' | 'warning' | 'success';
  message: string;
}

export function ExpectedBehavior({ params, templateId, barCount, session }: ExpectedBehaviorProps) {
  const warnings: Warning[] = [];

  // Analyze parameters and generate expectations
  const maxTradesPerDay = params.max_trades_per_day || 6;
  const breakoutPct = params.breakout_pct;
  const entryZ = params.entry_z || params.mr_entry_z;
  const stopAtrMult = params.stop_atr_mult || params.mr_stop_atr_mult;
  const tpAtrMult = params.takeprofit_atr_mult || params.mr_takeprofit_atr_mult;

  // Max trades analysis
  if (maxTradesPerDay <= 2) {
    warnings.push({
      type: 'info',
      message: `Low trade frequency: Max ${maxTradesPerDay} trades/day. Expect very few signals.`,
    });
  } else if (maxTradesPerDay >= 20) {
    warnings.push({
      type: 'warning',
      message: `High trade frequency: ${maxTradesPerDay} trades/day may increase fees impact significantly.`,
    });
  }

  // Template-specific analysis
  if (templateId === 'momentum_breakout_v1') {
    if (breakoutPct && breakoutPct >= 0.008) {
      warnings.push({
        type: 'info',
        message: `High breakout threshold (${(breakoutPct * 100).toFixed(2)}%) will trigger rarely. Expect conservative trading.`,
      });
    } else if (breakoutPct && breakoutPct <= 0.001) {
      warnings.push({
        type: 'warning',
        message: `Very low breakout threshold (${(breakoutPct * 100).toFixed(3)}%) may cause excessive whipsaws.`,
      });
    }
  }

  if (templateId === 'mean_reversion_extremes_v1' || templateId === 'regime_switcher_v1') {
    if (entryZ && entryZ >= 3.0) {
      warnings.push({
        type: 'info',
        message: `High Z-score entry (${entryZ}) means waiting for extreme moves. Very selective.`,
      });
    } else if (entryZ && entryZ <= 1.0) {
      warnings.push({
        type: 'warning',
        message: `Low Z-score entry (${entryZ}) may generate many false reversals.`,
      });
    }
  }

  // Stop/TP ratio analysis
  if (stopAtrMult && tpAtrMult) {
    const rr = tpAtrMult / stopAtrMult;
    if (rr >= 2) {
      warnings.push({
        type: 'success',
        message: `Good risk/reward ratio: ${rr.toFixed(1)}:1 (TP ${tpAtrMult}x ATR vs Stop ${stopAtrMult}x ATR).`,
      });
    } else if (rr < 1) {
      warnings.push({
        type: 'warning',
        message: `Poor risk/reward: ${rr.toFixed(1)}:1. Stops are wider than take profits.`,
      });
    }
  }

  // Dataset warnings
  if (barCount !== undefined) {
    if (barCount < 500) {
      warnings.push({
        type: 'warning',
        message: `Small dataset (${barCount} bars). Results may not be statistically significant.`,
      });
    } else if (barCount >= 5000) {
      warnings.push({
        type: 'success',
        message: `Good dataset size (${barCount.toLocaleString()} bars). Results should be reliable.`,
      });
    }
  }

  // Session warning
  if (session === 'EXT') {
    warnings.push({
      type: 'info',
      message: 'Extended hours only: Expect wider spreads and lower liquidity.', 
    });
  }

  if (warnings.length === 0) {
    warnings.push({
      type: 'success',
      message: 'Configuration looks balanced for typical intraday trading.',
    });
  }

  const iconMap = {
    info: <Info className="w-4 h-4 text-blue-400" />,
    warning: <AlertTriangle className="w-4 h-4 text-yellow-400" />,
    success: <CheckCircle className="w-4 h-4 text-green-400" />,
  };

  const bgMap = {
    info: 'bg-blue-500/5 border-blue-500/20',
    warning: 'bg-yellow-500/5 border-yellow-500/20',
    success: 'bg-green-500/5 border-green-500/20',
  };

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium text-muted-foreground">Expected Behavior</h4>
      <div className="space-y-2">
        {warnings.map((warning, idx) => (
          <div 
            key={idx} 
            className={`flex items-start gap-2 p-3 rounded-lg border ${bgMap[warning.type]}`}
          >
            {iconMap[warning.type]}
            <span className="text-sm">{warning.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
