import { MainLayout } from '@/components/layout/MainLayout';
import { PageHeader } from '@/components/ui/page-header';
import { FlaskConical } from 'lucide-react';

export default function Experiments() {
  return (
    <MainLayout>
      <PageHeader
        title="Experiments"
        description="Compare bot variants and run A/B tests"
      />

      <div className="px-8 pb-8">
        <div className="terminal-card p-12 text-center">
          <FlaskConical className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-medium text-foreground mb-2">Coming in Phase 2</h3>
          <p className="text-muted-foreground max-w-md mx-auto">
            Create A/B experiments by duplicating bots with parameter variations. 
            Compare performance side-by-side and auto-rank winners by Profit Factor.
          </p>
        </div>
      </div>
    </MainLayout>
  );
}
