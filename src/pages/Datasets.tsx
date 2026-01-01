import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { MainLayout } from '@/components/layout/MainLayout';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Download, Database, Loader2, Trash2, FileDown, Combine, X, Eye, Layers } from 'lucide-react';
import type { Dataset } from '@/types/trading';
import { format, subDays, subMonths, startOfYear } from 'date-fns';

const timeframes = [
  { value: '1m', label: '1 Minute' },
  { value: '5m', label: '5 Minutes' },
  { value: '15m', label: '15 Minutes' },
  { value: '30m', label: '30 Minutes' },
  { value: '60m', label: '1 Hour' },
  { value: '1d', label: '1 Day' },
  { value: '1w', label: '1 Week' },
];

const sessions = [
  { value: 'RTH', label: 'Regular Trading Hours' },
  { value: 'EXT', label: 'Extended Hours' },
  { value: 'ALL', label: 'All Sessions' },
];

const datePresets = [
  { label: '30D', days: 30 },
  { label: '3M', months: 3 },
  { label: '6M', months: 6 },
  { label: '1Y', months: 12 },
  { label: 'YTD', ytd: true },
];

export default function Datasets() {
  const navigate = useNavigate();
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<string[]>([]);
  const [combining, setCombining] = useState(false);
  const [creatingCombined, setCreatingCombined] = useState(false);
  const [selectedDatasets, setSelectedDatasets] = useState<string[]>([]);
  
  // Form state - now supports comma-separated symbols
  const [symbols, setSymbols] = useState('QQQ');
  const [timeframe, setTimeframe] = useState('5m');
  const [session, setSession] = useState('RTH');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [activePreset, setActivePreset] = useState<string | null>('30D');

  useEffect(() => {
    loadDatasets();
    applyDatePreset('30D');
  }, []);

  function applyDatePreset(preset: string) {
    const end = new Date();
    let start: Date;

    if (preset === 'YTD') {
      start = startOfYear(end);
    } else if (preset === '30D') {
      start = subDays(end, 30);
    } else if (preset === '3M') {
      start = subMonths(end, 3);
    } else if (preset === '6M') {
      start = subMonths(end, 6);
    } else if (preset === '1Y') {
      start = subMonths(end, 12);
    } else {
      return;
    }

    setStartDate(format(start, 'yyyy-MM-dd'));
    setEndDate(format(end, 'yyyy-MM-dd'));
    setActivePreset(preset);
  }

  async function loadDatasets() {
    try {
      const { data, error } = await supabase
        .from('datasets')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      // Cast to include new optional fields
      setDatasets((data || []) as Dataset[]);
    } catch (error) {
      console.error('Error loading datasets:', error);
      toast.error('Failed to load datasets');
    } finally {
      setLoading(false);
    }
  }

  async function handleDownload() {
    const symbolList = symbols.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
    
    if (symbolList.length === 0 || !startDate || !endDate) {
      toast.error('Please fill in all fields');
      return;
    }

    setDownloading(true);
    setDownloadProgress([]);
    
    const results: { symbol: string; success: boolean; barCount?: number; error?: string }[] = [];
    
    for (const symbol of symbolList) {
      setDownloadProgress(prev => [...prev, `Downloading ${symbol}...`]);
      
      try {
        const { data, error } = await supabase.functions.invoke('fetch-bars', {
          body: {
            symbol,
            timeframe,
            session,
            start: new Date(startDate).toISOString(),
            end: new Date(endDate).toISOString(),
            provider: 'alpaca',
          },
        });

        if (error) throw error;
        if (data.error) throw new Error(data.error);

        const dataset_hash = `${symbol}_${timeframe}_${startDate}_${endDate}_${Date.now()}`;
        
        const { error: insertError } = await supabase
          .from('datasets')
          .insert({
            symbol,
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

        results.push({ symbol, success: true, barCount: data.bar_count });
        setDownloadProgress(prev => [...prev.slice(0, -1), `✓ ${symbol}: ${data.bar_count} bars`]);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        results.push({ symbol, success: false, error: errMsg });
        setDownloadProgress(prev => [...prev.slice(0, -1), `✗ ${symbol}: ${errMsg}`]);
      }
    }

    const successCount = results.filter(r => r.success).length;
    const totalBars = results.reduce((sum, r) => sum + (r.barCount || 0), 0);
    
    if (successCount === symbolList.length) {
      toast.success(`Downloaded ${totalBars.toLocaleString()} bars for ${successCount} symbol(s)`);
    } else if (successCount > 0) {
      toast.warning(`Downloaded ${successCount}/${symbolList.length} symbols. Check progress for details.`);
    } else {
      toast.error('All downloads failed');
    }
    
    setDownloading(false);
    loadDatasets();
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

  async function handleCreateCombinedDataset() {
    if (selectedDatasets.length < 2) {
      toast.error('Select at least 2 datasets to combine');
      return;
    }

    setCreatingCombined(true);
    try {
      const selected = datasets.filter(ds => selectedDatasets.includes(ds.id));
      
      // Calculate combined properties
      const symbols = [...new Set(selected.map(ds => ds.symbol))];
      const combinedSymbol = symbols.length <= 3 ? symbols.join('+') : `MULTI(${symbols.length})`;
      const timeframes = [...new Set(selected.map(ds => ds.timeframe))];
      
      if (timeframes.length > 1) {
        toast.error('All selected datasets must have the same timeframe');
        setCreatingCombined(false);
        return;
      }

      const startDates = selected.map(ds => new Date(ds.start_ts));
      const endDates = selected.map(ds => new Date(ds.end_ts));
      const minStart = new Date(Math.min(...startDates.map(d => d.getTime())));
      const maxEnd = new Date(Math.max(...endDates.map(d => d.getTime())));
      const totalBars = selected.reduce((sum, ds) => sum + ds.bar_count, 0);

      const dataset_hash = `combined_${selectedDatasets.join('_').substring(0, 50)}_${Date.now()}`;

      const { error } = await supabase
        .from('datasets')
        .insert({
          symbol: combinedSymbol,
          market_type: 'stock',
          timeframe: timeframes[0],
          session: 'RTH',
          start_ts: minStart.toISOString(),
          end_ts: maxEnd.toISOString(),
          source: 'combined',
          dataset_hash,
          bar_count: totalBars,
          is_combined: true,
          source_dataset_ids: selectedDatasets,
        });

      if (error) throw error;

      toast.success(`Created combined dataset: ${combinedSymbol}`);
      setSelectedDatasets([]);
      loadDatasets();
    } catch (error) {
      console.error('Error creating combined dataset:', error);
      toast.error('Failed to create combined dataset');
    } finally {
      setCreatingCombined(false);
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

  // Get source symbols for a combined dataset
  function getSourceSymbols(ds: Dataset): string[] {
    if (!ds.is_combined || !ds.source_dataset_ids) return [];
    return datasets
      .filter(d => ds.source_dataset_ids?.includes(d.id))
      .map(d => d.symbol);
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
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="space-y-2 lg:col-span-1">
                <Label>Symbols (comma-separated)</Label>
                <Input
                  value={symbols}
                  onChange={(e) => setSymbols(e.target.value.toUpperCase())}
                  placeholder="QQQ, SPY, AAPL"
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  Enter multiple symbols to download at once
                </p>
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
            </div>

            {/* Date Range with Presets */}
            <div className="space-y-2">
              <Label>Date Range</Label>
              <div className="flex flex-wrap items-center gap-2">
                {datePresets.map((preset) => (
                  <Button
                    key={preset.label}
                    variant={activePreset === preset.label ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => applyDatePreset(preset.label)}
                    className="min-w-[50px]"
                  >
                    {preset.label}
                  </Button>
                ))}
                <Button
                  variant={activePreset === 'custom' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setActivePreset('custom')}
                >
                  Custom
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Start Date</Label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    setActivePreset('custom');
                  }}
                />
              </div>

              <div className="space-y-2">
                <Label>End Date</Label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => {
                    setEndDate(e.target.value);
                    setActivePreset('custom');
                  }}
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
                  {downloading ? 'Downloading...' : 'Download All'}
                </Button>
              </div>
            </div>

            {/* Download Progress */}
            {downloadProgress.length > 0 && (
              <div className="bg-muted/50 rounded-lg p-3 space-y-1">
                <Label className="text-xs">Download Progress</Label>
                {downloadProgress.map((msg, i) => (
                  <p key={i} className="text-xs font-mono">
                    {msg}
                  </p>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Bulk Actions Toolbar */}
        {selectedDatasets.length > 0 && (
          <div className="terminal-card bg-primary/10 border-primary/30">
            <div className="p-4 flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-4 flex-wrap">
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
                  Combine & Download CSV
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleCreateCombinedDataset}
                  disabled={creatingCombined || selectedDatasets.length < 2}
                  className="gap-2"
                >
                  {creatingCombined ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Layers className="w-4 h-4" />
                  )}
                  Create Combined Dataset
                </Button>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedDatasets([])}
                className="gap-2"
              >
                <X className="w-4 h-4" />
                Clear
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
                  <TooltipProvider>
                    {datasets.map((ds) => {
                      const sourceSymbols = getSourceSymbols(ds);
                      
                      return (
                        <tr 
                          key={ds.id}
                          className={`cursor-pointer transition-colors ${selectedDatasets.includes(ds.id) ? 'bg-primary/5' : 'hover:bg-muted/50'}`}
                          onClick={() => navigate(`/datasets/${ds.id}`)}
                        >
                          <td onClick={(e) => e.stopPropagation()}>
                            <Checkbox
                              checked={selectedDatasets.includes(ds.id)}
                              onCheckedChange={() => toggleDatasetSelection(ds.id)}
                            />
                          </td>
                          <td>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-primary">{ds.symbol}</span>
                              {ds.is_combined && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Badge variant="secondary" className="text-xs gap-1">
                                      <Layers className="w-3 h-3" />
                                      Combined
                                    </Badge>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    {sourceSymbols.length > 0 
                                      ? `Sources: ${sourceSymbols.join(', ')}`
                                      : 'Combined from multiple datasets'
                                    }
                                  </TooltipContent>
                                </Tooltip>
                              )}
                            </div>
                          </td>
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
                          <td className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => navigate(`/datasets/${ds.id}`)}
                              title="View Details"
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                            {!ds.is_combined && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleExportCsv(ds)}
                                title="Export CSV"
                              >
                                <FileDown className="w-4 h-4" />
                              </Button>
                            )}
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
                      );
                    })}
                  </TooltipProvider>
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
