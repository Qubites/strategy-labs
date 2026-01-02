import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/ui/status-badge';
import { Crown, ArrowUpDown, Trophy, TrendingUp, TrendingDown } from 'lucide-react';
import { format } from 'date-fns';

interface LeaderboardVersion {
  id: string;
  version_number: number;
  status: string;
  is_champion: boolean;
  params_json: string;
  created_at: string;
  metrics?: {
    profit_factor: number | null;
    net_pnl_usd: number | null;
    max_drawdown: number | null;
    trades_count: number | null;
    win_rate: number | null;
    sharpe_ratio?: number | null;
  };
}

interface LeaderboardTableProps {
  versions: LeaderboardVersion[];
  groupId: string;
  onSetChampion?: (versionId: string) => void;
  onPromote?: (versionId: string, target: string) => void;
}

type SortField = 'version_number' | 'profit_factor' | 'net_pnl_usd' | 'max_drawdown' | 'win_rate' | 'trades_count';
type SortDir = 'asc' | 'desc';

export function LeaderboardTable({ versions, groupId, onSetChampion, onPromote }: LeaderboardTableProps) {
  const [sortField, setSortField] = useState<SortField>('profit_factor');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const handleSort = (field: SortField) => {
    if (field === sortField) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir(field === 'max_drawdown' ? 'asc' : 'desc');
    }
  };

  const sortedVersions = [...versions].sort((a, b) => {
    let aVal: number, bVal: number;
    
    switch (sortField) {
      case 'version_number':
        aVal = a.version_number;
        bVal = b.version_number;
        break;
      case 'profit_factor':
        aVal = a.metrics?.profit_factor ?? 0;
        bVal = b.metrics?.profit_factor ?? 0;
        break;
      case 'net_pnl_usd':
        aVal = a.metrics?.net_pnl_usd ?? 0;
        bVal = b.metrics?.net_pnl_usd ?? 0;
        break;
      case 'max_drawdown':
        aVal = a.metrics?.max_drawdown ?? 1;
        bVal = b.metrics?.max_drawdown ?? 1;
        break;
      case 'win_rate':
        aVal = a.metrics?.win_rate ?? 0;
        bVal = b.metrics?.win_rate ?? 0;
        break;
      case 'trades_count':
        aVal = a.metrics?.trades_count ?? 0;
        bVal = b.metrics?.trades_count ?? 0;
        break;
      default:
        return 0;
    }
    
    return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
  });

  // Find best and worst for highlighting
  const bestPF = Math.max(...versions.map(v => v.metrics?.profit_factor ?? 0));
  const worstPF = Math.min(...versions.filter(v => v.metrics?.profit_factor).map(v => v.metrics!.profit_factor!));
  const bestPnL = Math.max(...versions.map(v => v.metrics?.net_pnl_usd ?? -Infinity));
  const lowestDD = Math.min(...versions.map(v => v.metrics?.max_drawdown ?? 1));

  const SortHeader = ({ field, label }: { field: SortField; label: string }) => (
    <th 
      className="cursor-pointer hover:text-primary transition-colors"
      onClick={() => handleSort(field)}
    >
      <div className="flex items-center gap-1">
        {label}
        <ArrowUpDown className={`w-3 h-3 ${sortField === field ? 'text-primary' : 'text-muted-foreground'}`} />
      </div>
    </th>
  );

  return (
    <div className="terminal-card overflow-hidden">
      <table className="data-table">
        <thead>
          <tr>
            <th className="w-12">#</th>
            <SortHeader field="version_number" label="Version" />
            <th>Status</th>
            <SortHeader field="profit_factor" label="PF" />
            <SortHeader field="net_pnl_usd" label="Net PnL" />
            <SortHeader field="max_drawdown" label="Max DD" />
            <SortHeader field="win_rate" label="Win Rate" />
            <SortHeader field="trades_count" label="Trades" />
            <th>Created</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {sortedVersions.map((version, idx) => {
            const metrics = version.metrics;
            const isBestPF = metrics?.profit_factor === bestPF && bestPF > 0;
            const isWorstPF = metrics?.profit_factor === worstPF && versions.length > 1;
            const isBestPnL = metrics?.net_pnl_usd === bestPnL && bestPnL > 0;
            const isLowestDD = metrics?.max_drawdown === lowestDD;

            return (
              <tr key={version.id} className={version.is_champion ? 'bg-primary/5' : ''}>
                <td>
                  {idx === 0 && sortField === 'profit_factor' && sortDir === 'desc' ? (
                    <Trophy className="w-4 h-4 text-warning" />
                  ) : (
                    <span className="text-muted-foreground">{idx + 1}</span>
                  )}
                </td>
                <td>
                  <div className="flex items-center gap-2">
                    <span className="font-mono">v{version.version_number}</span>
                    {version.is_champion && (
                      <Crown className="w-4 h-4 text-warning" />
                    )}
                  </div>
                </td>
                <td>
                  <StatusBadge status={version.status} />
                </td>
                <td className={`font-mono ${isBestPF ? 'text-success font-bold' : isWorstPF ? 'text-destructive' : ''}`}>
                  {metrics?.profit_factor?.toFixed(2) ?? '—'}
                  {isBestPF && <TrendingUp className="w-3 h-3 inline ml-1" />}
                  {isWorstPF && <TrendingDown className="w-3 h-3 inline ml-1" />}
                </td>
                <td className={`font-mono ${isBestPnL ? 'text-success font-bold' : (metrics?.net_pnl_usd ?? 0) < 0 ? 'text-destructive' : ''}`}>
                  ${metrics?.net_pnl_usd?.toFixed(2) ?? '—'}
                </td>
                <td className={`font-mono ${isLowestDD ? 'text-success' : (metrics?.max_drawdown ?? 0) > 0.1 ? 'text-destructive' : ''}`}>
                  {metrics?.max_drawdown != null ? `${(metrics.max_drawdown * 100).toFixed(1)}%` : '—'}
                </td>
                <td className="font-mono">
                  {metrics?.win_rate != null ? `${(metrics.win_rate * 100).toFixed(1)}%` : '—'}
                </td>
                <td className="font-mono">
                  {metrics?.trades_count ?? '—'}
                </td>
                <td className="text-sm text-muted-foreground">
                  {format(new Date(version.created_at), 'MMM d')}
                </td>
                <td>
                  <div className="flex items-center gap-1">
                    {!version.is_champion && onSetChampion && (
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => onSetChampion(version.id)}
                        title="Set as Champion"
                      >
                        <Crown className="w-3 h-3" />
                      </Button>
                    )}
                    {version.status === 'backtested' && onPromote && (
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => onPromote(version.id, 'approved_paper')}
                      >
                        Promote
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {versions.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          No versions in this experiment group yet
        </div>
      )}
    </div>
  );
}
