import { useState, useEffect } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Download, Database, Loader2, Trash2, FileDown, Combine, X } from 'lucide-react';
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
  const [combining, setCombining] = useState(false);
  const [selectedDatasets, setSelectedDatasets] = useState<string[]>([]);
  
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
      // Call edge function to fetch bars from Alpaca
      const { data, error } = await supabase.functions.invoke('fetch-bars', {
        body: {
          symbol: symbol.toUpperCase(),
          timeframe,
          session,
          start: new Date(startDate).toISOString(),
          end: new Date(endDate).toISOString(),
          provider: 'alpaca',
        },
      });

      if (error) throw error;

      if (data.error) {
        throw new Error(data.error);
      }

      // Create dataset record linking to the fetched bars
      const dataset_hash = `${symbol}_${timeframe}_${startDate}_${endDate}_${Date.now()}`;
      
      const { error: insertError } = await supabase
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
          bar_count: data.bar_count || 0,
        });

      if (insertError) throw insertError;

      toast.success(`Downloaded ${data.bar_count} bars successfully`);
      loadDatasets();
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to fetch data');
    } finally {
      setDownloading(false);
    }
  }

  async function handleExportCsv(dataset: Dataset) {
    try {
      toast.info('Preparing CSV export...');
      
      const { data, error } = await supabase.functions.invoke('export-csv', {
        body: {
          symbol: dataset.symbol,
          timeframe: dataset.timeframe,
          start: dataset.start_ts,
          end: dataset.end_ts,
        },
      });

      if (error) throw error;

      // Create download link
      const blob = new Blob([data], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${dataset.symbol}_${dataset.timeframe}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast.success('CSV downloaded');
    } catch (error) {
      console.error('Error exporting CSV:', error);
      toast.error('Failed to export CSV. Make sure data has been fetched.');
    }
  }

  async function handleCombineExport() {
    if (selectedDatasets.length < 2) {
      toast.error('Select at least 2 datasets to combine');
      return;
    }

    setCombining(true);
    try {
      toast.info('Combining datasets...');

      const datasetsToExport = datasets
        .filter(ds => selectedDatasets.includes(ds.id))
        .map(ds => ({
          symbol: ds.symbol,
          timeframe: ds.timeframe,
          start: ds.start_ts,
          end: ds.end_ts,
        }));

      const { data, error } = await supabase.functions.invoke('combine-csv', {
        body: { datasets: datasetsToExport },
      });

      if (error) throw error;

      // Create download link
      const blob = new Blob([data], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `combined_datasets_${format(new Date(), 'yyyy-MM-dd')}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast.success(`Combined ${selectedDatasets.length} datasets`);
      setSelectedDatasets([]);
    } catch (error) {
      console.error('Error combining CSVs:', error);
      toast.error('Failed to combine CSVs');
    } finally {
      setCombining(false);
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
      setSelectedDatasets(prev => prev.filter(dsId => dsId !== id));
      loadDatasets();
    } catch (error) {
      console.error('Error deleting dataset:', error);
      toast.error('Failed to delete dataset');
    }
  }

  function toggleDatasetSelection(id: string) {
    setSelectedDatasets(prev => 
      prev.includes(id) 
        ? prev.filter(dsId => dsId !== id)
        : [...prev, id]
    );
  }

  function toggleSelectAll() {
    if (selectedDatasets.length === datasets.length) {
      setSelectedDatasets([]);
    } else {
      setSelectedDatasets(datasets.map(ds => ds.id));
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

        {/* Bulk Actions Toolbar */}
        {selectedDatasets.length > 0 && (
          <div className="terminal-card bg-primary/10 border-primary/30">
            <div className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <span className="text-sm font-medium">
                  {selectedDatasets.length} dataset{selectedDatasets.length > 1 ? 's' : ''} selected
                </span>
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleCombineExport}
                  disabled={combining || selectedDatasets.length < 2}
                  className="gap-2"
                >
                  {combining ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Combine className="w-4 h-4" />
                  )}
                  Combine and Download CSV
                </Button>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedDatasets([])}
                className="gap-2"
              >
                <X className="w-4 h-4" />
                Clear Selection
              </Button>
            </div>
          </div>
        )}

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
                    <th className="w-10">
                      <Checkbox
                        checked={selectedDatasets.length === datasets.length && datasets.length > 0}
                        onCheckedChange={toggleSelectAll}
                      />
                    </th>
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
                    <tr 
                      key={ds.id}
                      className={selectedDatasets.includes(ds.id) ? 'bg-primary/5' : ''}
                    >
                      <td>
                        <Checkbox
                          checked={selectedDatasets.includes(ds.id)}
                          onCheckedChange={() => toggleDatasetSelection(ds.id)}
                        />
                      </td>
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
                      <td className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleExportCsv(ds)}
                          title="Export CSV"
                        >
                          <FileDown className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(ds.id)}
                          className="text-destructive hover:text-destructive"
                          title="Delete"
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
