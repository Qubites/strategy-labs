import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Copy, Loader2 } from 'lucide-react';

interface DuplicateBotDialogProps {
  botVersionId: string;
  botName: string;
  onDuplicated?: () => void;
}

export function DuplicateBotDialog({ botVersionId, botName, onDuplicated }: DuplicateBotDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [count, setCount] = useState(2);
  const [experimentName, setExperimentName] = useState('');

  useEffect(() => {
    if (open) {
      setExperimentName(`${botName} Experiment ${new Date().toISOString().split('T')[0]}`);
    }
  }, [open, botName]);

  async function handleDuplicate() {
    if (count < 1 || count > 10) {
      toast.error('Count must be between 1 and 10');
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('duplicate-bot', {
        body: {
          bot_version_id: botVersionId,
          count,
          experiment_name: experimentName,
        },
      });

      if (error) throw error;

      if (data.error) {
        toast.error(data.error);
        return;
      }

      toast.success(`Created ${data.new_version_ids.length} new variants`);
      setOpen(false);
      onDuplicated?.();
    } catch (error) {
      console.error('Error duplicating bot:', error);
      toast.error('Failed to duplicate bot');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Copy className="w-4 h-4" />
          Duplicate
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Create Experiment Variants</DialogTitle>
          <DialogDescription>
            Duplicate this bot version to create multiple variants for A/B testing.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <Label>Experiment Name</Label>
            <Input
              value={experimentName}
              onChange={(e) => setExperimentName(e.target.value)}
              placeholder="My Experiment"
            />
          </div>
          <div className="space-y-2">
            <Label>Number of Variants</Label>
            <Input
              type="number"
              min={1}
              max={10}
              value={count}
              onChange={(e) => setCount(parseInt(e.target.value) || 1)}
            />
            <p className="text-xs text-muted-foreground">
              Creates {count} new version{count > 1 ? 's' : ''} with copied parameters
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleDuplicate} disabled={loading} className="gap-2">
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            Create Variants
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
