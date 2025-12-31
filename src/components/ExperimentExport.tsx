import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import { format } from 'date-fns';
import type { RunMetrics, BotVersion, Bot } from '@/types/trading';

interface ExperimentVariant {
  version: BotVersion;
  metrics: RunMetrics | null;
  runsCount: number;
}

interface ExperimentGroup {
  bot: Bot;
  variants: ExperimentVariant[];
}

interface ExperimentExportProps {
  experiments: ExperimentGroup[];
}

export function ExperimentExport({ experiments }: ExperimentExportProps) {
  function handleExport() {
    // Build CSV
    const headers = [
      'Bot Name',
      'Version',
      'Status',
      'Runs Count',
      'Profit Factor',
      'Net PnL ($)',
      'Trades',
      'Win Rate (%)',
      'Max Drawdown ($)',
      'Avg Trade ($)',
      'Fees Paid ($)',
      'Slippage Est ($)',
    ];

    const rows: string[][] = [];

    for (const exp of experiments) {
      for (const variant of exp.variants) {
        rows.push([
          exp.bot.name,
          `v${variant.version.version_number}`,
          variant.version.status,
          String(variant.runsCount),
          variant.metrics?.profit_factor?.toFixed(2) || '',
          variant.metrics?.net_pnl_usd?.toFixed(2) || '',
          String(variant.metrics?.trades_count || 0),
          variant.metrics?.win_rate ? (variant.metrics.win_rate * 100).toFixed(1) : '',
          variant.metrics?.max_drawdown?.toFixed(2) || '',
          variant.metrics?.avg_trade?.toFixed(2) || '',
          variant.metrics?.fees_paid?.toFixed(2) || '',
          variant.metrics?.slippage_est?.toFixed(2) || '',
        ]);
      }
    }

    const csv = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(',')),
    ].join('\n');

    // Download
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `experiments_${format(new Date(), 'yyyy-MM-dd_HHmm')}.csv`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }

  if (experiments.length === 0) return null;

  return (
    <Button variant="outline" onClick={handleExport} className="gap-2">
      <Download className="w-4 h-4" />
      Export CSV
    </Button>
  );
}
