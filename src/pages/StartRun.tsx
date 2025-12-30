import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { MainLayout } from '@/components/layout/MainLayout';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ArrowLeft, Play, Loader2 } from 'lucide-react';
import type { Bot as BotType, BotVersion, Dataset, CostModel } from '@/types/trading';

export default function StartRun() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  
  const [bot, setBot] = useState<BotType | null>(null);
  const [versions, setVersions] = useState<BotVersion[]>([]);
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);

  // Form state
  const [selectedVersion, setSelectedVersion] = useState<string>('');
  const [runType, setRunType] = useState<'backtest' | 'paper' | 'shadow'>('backtest');
  const [selectedDataset, setSelectedDataset] = useState<string>('');
  const [commissionPerShare, setCommissionPerShare] = useState('0.005');
  const [slippagePerShare, setSlippagePerShare] = useState('0.01');

  useEffect(() => {
    if (id) loadData();
  }, [id]);

  async function loadData() {
    try {
      // Load bot
      const { data: botData, error: botError } = await supabase
        .from('bots')
        .select('*')
        .eq('id', id)
        .single();

      if (botError) throw botError;
      setBot(botData);

      // Load versions
      const { data: versionsData } = await supabase
        .from('bot_versions')
        .select('*')
        .eq('bot_id', id)
        .order('version_number', { ascending: false });

      setVersions(versionsData || []);
      if (versionsData && versionsData.length > 0) {
        setSelectedVersion(versionsData[0].id);
      }

      // Load datasets
      const { data: datasetsData } = await supabase
        .from('datasets')
        .select('*')
        .order('created_at', { ascending: false });

      setDatasets(datasetsData || []);
      if (datasetsData && datasetsData.length > 0) {
        setSelectedDataset(datasetsData[0].id);
      }
    } catch (error) {
      console.error('Error loading data:', error);
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  }

  async function handleStartRun() {
    if (!selectedVersion) {
      toast.error('Please select a bot version');
      return;
    }

    if (runType === 'backtest' && !selectedDataset) {
      toast.error('Please select a dataset for backtest');
      return;
    }

    setStarting(true);
    try {
      const costModel: CostModel = {
        commission_per_share: parseFloat(commissionPerShare),
        slippage_per_share: parseFloat(slippagePerShare),
        fixed_cost_per_trade: 0,
      };

      // Create run
      const { data: run, error: runError } = await supabase
        .from('runs')
        .insert({
          bot_version_id: selectedVersion,
          run_type: runType,
          dataset_id: runType === 'backtest' ? selectedDataset : null,
          cost_model_json: JSON.stringify(costModel),
          status: 'queued',
        })
        .select()
        .single();

      if (runError) throw runError;

      // Simulate backtest completion (in production, this would be handled by a worker)
      if (runType === 'backtest') {
        await simulateBacktest(run.id);
      }

      toast.success('Run started successfully');
      navigate(`/bots/${id}`);
    } catch (error) {
      console.error('Error starting run:', error);
      toast.error('Failed to start run');
    } finally {
      setStarting(false);
    }
  }

  async function simulateBacktest(runId: string) {
    // Update status to running
    await supabase.from('runs').update({ status: 'running' }).eq('id', runId);

    // Simulate some trades
    const numTrades = Math.floor(Math.random() * 30) + 10;
    const trades = [];
    let totalPnL = 0;
    let grossProfit = 0;
    let grossLoss = 0;
    let winCount = 0;
    let currentConsecutiveLosses = 0;
    let maxConsecutiveLosses = 0;
    let biggestLoss = 0;

    const basePrice = 400 + Math.random() * 100; // QQQ range

    for (let i = 0; i < numTrades; i++) {
      const side = Math.random() > 0.5 ? 'long' : 'short';
      const entryPrice = basePrice + (Math.random() - 0.5) * 10;
      const priceChange = (Math.random() - 0.45) * 3; // Slight positive bias
      const exitPrice = side === 'long' 
        ? entryPrice + priceChange 
        : entryPrice - priceChange;
      const qty = Math.floor(Math.random() * 50) + 10;
      const pnl = side === 'long' 
        ? (exitPrice - entryPrice) * qty 
        : (entryPrice - exitPrice) * qty;
      const fees = qty * 0.005 * 2; // Commission both ways
      const netPnL = pnl - fees;

      totalPnL += netPnL;
      if (netPnL >= 0) {
        grossProfit += netPnL;
        winCount++;
        currentConsecutiveLosses = 0;
      } else {
        grossLoss += Math.abs(netPnL);
        currentConsecutiveLosses++;
        maxConsecutiveLosses = Math.max(maxConsecutiveLosses, currentConsecutiveLosses);
        biggestLoss = Math.min(biggestLoss, netPnL);
      }

      const entryTime = new Date();
      entryTime.setHours(entryTime.getHours() - numTrades + i);

      trades.push({
        run_id: runId,
        ts_entry: entryTime.toISOString(),
        ts_exit: new Date(entryTime.getTime() + Math.random() * 3600000).toISOString(),
        side,
        entry_price: entryPrice.toFixed(2),
        exit_price: exitPrice.toFixed(2),
        qty,
        pnl_usd: netPnL.toFixed(2),
        pnl_points: (netPnL / qty).toFixed(4),
        fees: fees.toFixed(2),
        slippage: (Math.random() * 0.02).toFixed(4),
        reason_code: netPnL >= 0 ? 'take_profit' : 'stop_loss',
      });
    }

    // Insert trades
    await supabase.from('trades').insert(trades);

    // Calculate metrics
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 999 : 0;
    const winRate = (winCount / numTrades) * 100;
    const avgTrade = totalPnL / numTrades;

    // Insert metrics
    await supabase.from('run_metrics').insert([{
      run_id: runId,
      profit_factor: profitFactor,
      net_pnl_usd: totalPnL,
      net_pnl_points: totalPnL / 100,
      gross_profit: grossProfit,
      gross_loss: grossLoss,
      max_drawdown: Math.random() * 100 + 20,
      trades_count: numTrades,
      win_rate: winRate,
      avg_trade: avgTrade,
      median_trade: avgTrade,
      fees_paid: numTrades * 0.5,
      slippage_est: numTrades * 0.1,
      max_consecutive_losses: maxConsecutiveLosses,
      biggest_loss: biggestLoss,
    }]);

    // Update run status and version status
    await supabase.from('runs').update({ 
      status: 'done',
      end_ts: new Date().toISOString(),
    }).eq('id', runId);

    await supabase.from('bot_versions').update({
      status: 'backtested',
    }).eq('id', selectedVersion);
  }

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-96">
          <div className="text-muted-foreground">Loading...</div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <PageHeader
        title={`Start Run: ${bot?.name}`}
        description="Configure and start a backtest, paper, or shadow run"
      >
        <Button variant="outline" onClick={() => navigate(`/bots/${id}`)} className="gap-2">
          <ArrowLeft className="w-4 h-4" />
          Back
        </Button>
      </PageHeader>

      <div className="px-8 pb-8">
        <div className="max-w-2xl space-y-6">
          {/* Version Selection */}
          <div className="terminal-card p-6 space-y-4">
            <h3 className="font-medium">Bot Version</h3>
            <Select value={selectedVersion} onValueChange={setSelectedVersion}>
              <SelectTrigger>
                <SelectValue placeholder="Select version" />
              </SelectTrigger>
              <SelectContent>
                {versions.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    Version {v.version_number} ({v.status})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Run Type */}
          <div className="terminal-card p-6 space-y-4">
            <h3 className="font-medium">Run Type</h3>
            <div className="grid grid-cols-3 gap-4">
              {(['backtest', 'paper', 'shadow'] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => setRunType(type)}
                  className={`p-4 rounded-lg border text-center transition-all ${
                    runType === type
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <div className="font-medium capitalize">{type}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {type === 'backtest' && 'Historical data'}
                    {type === 'paper' && 'Simulated live'}
                    {type === 'shadow' && 'Track only'}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Dataset Selection (for backtest) */}
          {runType === 'backtest' && (
            <div className="terminal-card p-6 space-y-4">
              <h3 className="font-medium">Dataset</h3>
              {datasets.length > 0 ? (
                <Select value={selectedDataset} onValueChange={setSelectedDataset}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select dataset" />
                  </SelectTrigger>
                  <SelectContent>
                    {datasets.map((ds) => (
                      <SelectItem key={ds.id} value={ds.id}>
                        {ds.symbol} {ds.timeframe} ({ds.bar_count} bars)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-muted-foreground text-sm">
                  No datasets available. Create one in the Datasets page first.
                </p>
              )}
            </div>
          )}

          {/* Cost Model */}
          <div className="terminal-card p-6 space-y-4">
            <h3 className="font-medium">Cost Model</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Commission/Share ($)</Label>
                <Input
                  type="number"
                  step="0.001"
                  value={commissionPerShare}
                  onChange={(e) => setCommissionPerShare(e.target.value)}
                  className="font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label>Slippage/Share ($)</Label>
                <Input
                  type="number"
                  step="0.001"
                  value={slippagePerShare}
                  onChange={(e) => setSlippagePerShare(e.target.value)}
                  className="font-mono"
                />
              </div>
            </div>
          </div>

          {/* Start Button */}
          <div className="flex justify-end gap-4">
            <Button variant="outline" onClick={() => navigate(`/bots/${id}`)}>
              Cancel
            </Button>
            <Button
              onClick={handleStartRun}
              disabled={starting || (runType === 'backtest' && !selectedDataset)}
              className="gap-2"
            >
              {starting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4" />
              )}
              {starting ? 'Starting...' : 'Start Run'}
            </Button>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
