import { useState } from 'react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/status-badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { GitBranch, GitCompare } from 'lucide-react';
import type { BotVersion } from '@/types/trading';
import { VersionEditorDialog } from './VersionEditorDialog';

interface VersionTimelineProps {
  versions: BotVersion[];
  botId: string;
  templateId: string;
  onVersionCreated: () => void;
}

export function VersionTimeline({ versions, botId, templateId, onVersionCreated }: VersionTimelineProps) {
  const [comparing, setComparing] = useState<string[]>([]);
  const [showCompare, setShowCompare] = useState(false);

  const nextVersionNumber = Math.max(...versions.map(v => v.version_number), 0) + 1;

  function toggleCompare(versionId: string) {
    setComparing(prev => {
      if (prev.includes(versionId)) {
        return prev.filter(id => id !== versionId);
      }
      if (prev.length >= 2) {
        return [prev[1], versionId];
      }
      return [...prev, versionId];
    });
  }

  const compareVersions = versions.filter(v => comparing.includes(v.id));
  
  function renderComparison() {
    if (compareVersions.length !== 2) return null;
    
    const [v1, v2] = compareVersions;
    const params1 = JSON.parse(v1.params_json);
    const params2 = JSON.parse(v2.params_json);
    const risk1 = JSON.parse(v1.risk_limits_json);
    const risk2 = JSON.parse(v2.risk_limits_json);
    
    const allParamKeys = [...new Set([...Object.keys(params1), ...Object.keys(params2)])];
    const allRiskKeys = [...new Set([...Object.keys(risk1), ...Object.keys(risk2)])];
    
    return (
      <div className="space-y-6">
        <div>
          <h4 className="font-medium mb-3">Strategy Parameters</h4>
          <table className="data-table text-sm">
            <thead>
              <tr>
                <th>Parameter</th>
                <th className="text-center">v{v1.version_number}</th>
                <th className="text-center">v{v2.version_number}</th>
                <th>Diff</th>
              </tr>
            </thead>
            <tbody>
              {allParamKeys.map(key => {
                const val1 = params1[key];
                const val2 = params2[key];
                const isDiff = JSON.stringify(val1) !== JSON.stringify(val2);
                return (
                  <tr key={key} className={isDiff ? 'bg-primary/5' : ''}>
                    <td className="text-muted-foreground">{key}</td>
                    <td className="font-mono text-center">{String(val1 ?? '—')}</td>
                    <td className="font-mono text-center">{String(val2 ?? '—')}</td>
                    <td className={isDiff ? 'text-primary font-medium' : 'text-muted-foreground'}>
                      {isDiff ? 'Changed' : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        
        <div>
          <h4 className="font-medium mb-3">Risk Limits</h4>
          <table className="data-table text-sm">
            <thead>
              <tr>
                <th>Setting</th>
                <th className="text-center">v{v1.version_number}</th>
                <th className="text-center">v{v2.version_number}</th>
                <th>Diff</th>
              </tr>
            </thead>
            <tbody>
              {allRiskKeys.map(key => {
                const val1 = risk1[key];
                const val2 = risk2[key];
                const isDiff = JSON.stringify(val1) !== JSON.stringify(val2);
                return (
                  <tr key={key} className={isDiff ? 'bg-primary/5' : ''}>
                    <td className="text-muted-foreground">{key}</td>
                    <td className="font-mono text-center">{String(val1 ?? '—')}</td>
                    <td className="font-mono text-center">{String(val2 ?? '—')}</td>
                    <td className={isDiff ? 'text-primary font-medium' : 'text-muted-foreground'}>
                      {isDiff ? 'Changed' : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="p-3 rounded-lg bg-muted/30">
            <div className="text-muted-foreground mb-1">Version {v1.version_number}</div>
            <StatusBadge status={v1.status} />
            <div className="text-xs text-muted-foreground mt-2">
              Created: {format(new Date(v1.created_at), 'MMM d, yyyy HH:mm')}
            </div>
          </div>
          <div className="p-3 rounded-lg bg-muted/30">
            <div className="text-muted-foreground mb-1">Version {v2.version_number}</div>
            <StatusBadge status={v2.status} />
            <div className="text-xs text-muted-foreground mt-2">
              Created: {format(new Date(v2.created_at), 'MMM d, yyyy HH:mm')}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Compare Dialog */}
      <Dialog open={showCompare} onOpenChange={setShowCompare}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GitCompare className="w-5 h-5" />
              Version Comparison
            </DialogTitle>
          </DialogHeader>
          {renderComparison()}
        </DialogContent>
      </Dialog>

      {/* Actions Bar */}
      {comparing.length > 0 && (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-primary/10 border border-primary/30">
          <span className="text-sm">
            {comparing.length === 1 ? 'Select another version to compare' : `Comparing ${comparing.length} versions`}
          </span>
          {comparing.length === 2 && (
            <Button size="sm" onClick={() => setShowCompare(true)} className="gap-1">
              <GitCompare className="w-3 h-3" />
              Compare
            </Button>
          )}
          <Button 
            size="sm" 
            variant="ghost" 
            onClick={() => setComparing([])}
            className="ml-auto"
          >
            Clear
          </Button>
        </div>
      )}

      {/* Timeline */}
      <div className="relative">
        {/* Vertical Line */}
        <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-border" />

        <div className="space-y-4">
          {versions.map((version, idx) => {
            const isLatest = idx === 0;
            const isSelected = comparing.includes(version.id);
            
            return (
              <div 
                key={version.id} 
                className={`relative pl-10 pr-4 py-3 rounded-lg border transition-colors cursor-pointer ${
                  isSelected 
                    ? 'border-primary bg-primary/5' 
                    : 'border-transparent hover:bg-muted/30'
                }`}
                onClick={() => toggleCompare(version.id)}
              >
                {/* Timeline Dot */}
                <div className={`absolute left-2 top-5 w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                  isLatest 
                    ? 'bg-primary border-primary' 
                    : isSelected 
                      ? 'bg-primary/50 border-primary' 
                      : 'bg-background border-border'
                }`}>
                  {isLatest && (
                    <div className="w-2 h-2 rounded-full bg-primary-foreground" />
                  )}
                </div>

                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold">v{version.version_number}</span>
                      <StatusBadge status={version.status} />
                      {isLatest && (
                        <span className="text-xs bg-primary/20 text-primary px-2 py-0.5 rounded">
                          Latest
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {format(new Date(version.created_at), 'MMM d, yyyy HH:mm')}
                    </div>
                    <div className="text-xs font-mono text-muted-foreground mt-1">
                      Hash: {version.params_hash?.slice(0, 12)}...
                    </div>
                  </div>

                  <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                    <VersionEditorDialog
                      botId={botId}
                      templateId={templateId}
                      sourceVersion={version}
                      nextVersionNumber={nextVersionNumber}
                      onVersionCreated={onVersionCreated}
                      trigger={
                        <Button variant="ghost" size="sm" className="gap-1">
                          <GitBranch className="w-3 h-3" />
                          Fork & Edit
                        </Button>
                      }
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
