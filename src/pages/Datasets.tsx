import { useState, useEffect } from 'react';
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
import { Download, Database, Calendar, Clock, Loader2, Trash2 } from 'lucide-react';
import type { Dataset } from '@/types/trading';
import { format } from 'date-fns';

const timeframes = [
  { value: '1m', label: '1 Minute' },
  { value: '5m', label: '5 Minutes' },
  { value: '15m', label: '15 Minutes' },
  { value: '60m', label: '1 Hour' },
];

const sessions = [
  { value: 'RTH', label: 'Regular Trading Hours' },
  { value: 'EXT', label: 'Extended Hours' },
  { value: 'ALL', label: 'All Sessions' },
];

export default function Datasets() {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  
  // Form state
  const [symbol, setSymbol] = useState('QQQ');
  const [timeframe, setTimeframe] = useState('5m');
  const [session, setSession] = useState('RTH');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  useEffect(() => {
    loadDatasets();
    // Set default dates (last 30 days)
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 30);
    setStartDate(format(start, 'yyyy-MM-dd'));
    setEndDate(format(end, 'yyyy-MM-dd'));
  }, []);

  async function loadDatasets() {
    try {
      const { data, error } = await supabase
        .from('datasets')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setDatasets(data || []);
    } catch (error) {
      console.error('Error loading datasets:', error);
      toast.error('Failed to load datasets');
    } finally {
      setLoading(false);
    }
  }

  async function handleDownload() {
    if (!symbol || !startDate || !endDate) {
      toast.error('Please fill in all fields');
      return;
    }

    setDownloading(true);
    try {
      // For MVP, we'll simulate the download and create a dataset record
      // In production, this would call an edge function that fetches from Alpaca
      const dataset_hash = `${symbol}_${timeframe}_${startDate}_${endDate}_${Date.now()}`;
      
      const { data, error } = await supabase
        .from('datasets')
        .insert({
          symbol: symbol.toUpperCase(),
          market_type: 'stock',
          timeframe,
          session,
          start_ts: new Date(startDate).toISOString(),
          end_ts: new Date(endDate).toISOString(),
          source: 'alpaca',
          dataset_hash,
          bar_count: Math.floor(Math.random() * 5000) + 1000, // Simulated
        })
        .select()
        .single();

      if (error) throw error;

      toast.success('Dataset created successfully');
      loadDatasets();
    } catch (error) {
      console.error('Error creating dataset:', error);
      toast.error('Failed to create dataset');
    } finally {
      setDownloading(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      const { error } = await supabase
        .from('datasets')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast.success('Dataset deleted');
      loadDatasets();
    } catch (error) {
      console.error('Error deleting dataset:', error);
      toast.error('Failed to delete dataset');
    }
  }

  return (
    <MainLayout>
      <PageHeader
        title="Dataset Playground"
        description="Download and manage historical market data"
      />

      <div className="px-8 pb-8 space-y-8">
        {/* Download Form */}
        <div className="terminal-card">
          <div className="terminal-header">
            <Download className="w-4 h-4 text-primary" />
            <span className="font-medium">Download Historical Data</span>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
              <div className="space-y-2">
                <Label>Symbol</Label>
                <Input
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                  placeholder="QQQ"
                  className="font-mono"
                />
              </div>

              <div className="space-y-2">
                <Label>Timeframe</Label>
                <Select value={timeframe} onValueChange={setTimeframe}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {timeframes.map((tf) => (
                      <SelectItem key={tf.value} value={tf.value}>
                        {tf.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Session</Label>
                <Select value={session} onValueChange={setSession}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {sessions.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Start Date</Label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>End Date</Label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>

              <div className="flex items-end">
                <Button
                  onClick={handleDownload}
                  disabled={downloading}
                  className="w-full gap-2"
                >
                  {downloading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                  {downloading ? 'Downloading...' : 'Download'}
                </Button>
              </div>
            </div>

            <p className="text-xs text-muted-foreground mt-4">
              Phase 1: QQQ data via Alpaca Market Data. More symbols coming soon.
            </p>
          </div>
        </div>

        {/* Datasets Table */}
        <div className="terminal-card">
          <div className="terminal-header">
            <Database className="w-4 h-4 text-primary" />
            <span className="font-medium">Stored Datasets</span>
            <span className="ml-auto text-xs text-muted-foreground">
              {datasets.length} datasets
            </span>
          </div>
          <div className="p-4">
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">Loading...</div>
            ) : datasets.length > 0 ? (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Symbol</th>
                    <th>Timeframe</th>
                    <th>Session</th>
                    <th>Date Range</th>
                    <th>Bars</th>
                    <th>Source</th>
                    <th>Created</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {datasets.map((ds) => (
                    <tr key={ds.id}>
                      <td className="font-bold text-primary">{ds.symbol}</td>
                      <td>{ds.timeframe}</td>
                      <td>{ds.session}</td>
                      <td className="text-xs">
                        {format(new Date(ds.start_ts), 'MMM d, yyyy')} →{' '}
                        {format(new Date(ds.end_ts), 'MMM d, yyyy')}
                      </td>
                      <td>{ds.bar_count.toLocaleString()}</td>
                      <td className="capitalize">{ds.source}</td>
                      <td className="text-xs text-muted-foreground">
                        {format(new Date(ds.created_at), 'MMM d, HH:mm')}
                      </td>
                      <td>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(ds.id)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="text-center py-8">
                <Database className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-muted-foreground">No datasets yet</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Download your first dataset above
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
