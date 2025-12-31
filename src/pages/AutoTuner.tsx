import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { MainLayout } from '@/components/layout/MainLayout';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MetricCard } from '@/components/ui/metric-card';
import { StatusBadge } from '@/components/ui/status-badge';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import {
  ArrowLeft,
  Play,
  Brain,
  History,
  Settings2,
  CheckCircle,
  XCircle,
  Loader2,
  Sparkles,
  RefreshCw,
} from 'lucide-react';

export default function AutoTuner() {
  const { botId } = useParams<{ botId: string }>();
  const navigate = useNavigate();

  const [bot, setBot] = useState<any>(null);
  const [versions, setVersions] = useState<any[]>([]);
  const [datasets, setDatasets] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [trials, setTrials] = useState<any[]>([]);
  const [selectedJob, setSelectedJob] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [runningJobId, setRunningJobId] = useState<string | null>(null);

  // Form state
  const [selectedVersion, setSelectedVersion] = useState('');
  const [selectedDataset, setSelectedDataset] = useState('');
  const [instructions, setInstructions] = useState('');
  const [maxTrials, setMaxTrials] = useState(20);
  const [parsedPreview, setParsedPreview] = useState<any>(null);

  // Objective weights
  const [pfWeight, setPfWeight] = useState(0.35);
  const [sharpeWeight, setSharpeWeight] = useState(0.25);
  const [returnWeight, setReturnWeight] = useState(0.25);
  const [ddPenalty, setDdPenalty] = useState(0.15);

  useEffect(() => {
    if (botId) loadData();
  }, [botId]);

  useEffect(() => {
    if (selectedJob) loadTrials(selectedJob);
  }, [selectedJob]);

  // Parse instructions preview
  useEffect(() => {
    if (!instructions.trim()) {
      setParsedPreview(null);
      return;
    }
    // Simulate parsing on client
    const lower = instructions.toLowerCase();
    let preview: any = { summary: 'Standard optimization', weights: {} };

    if (lower.includes('minimize drawdown')) {
      preview = { summary: 'Prioritizing drawdown reduction', weights: { dd_penalty: 0.35, pf: 0.25 } };
    } else if (lower.includes('maximize return')) {
      preview = { summary: 'Prioritizing returns', weights: { return: 0.40, dd_penalty: 0.10 } };
    } else if (lower.includes('fewer trades')) {
      preview = { summary: 'Quality over quantity: stricter filters', mutation_bias: { entry_z: 'higher' } };
    } else if (lower.includes('sharpe') || lower.includes('consistency')) {
      preview = { summary: 'Risk-adjusted focus: maximizing Sharpe', weights: { sharpe: 0.40 } };
    } else if (lower.includes('opposite') || lower.includes('contrarian')) {
      preview = { summary: 'Contrarian approach: experimental', mutation_bias: { stop: 'wider', tp: 'tighter' } };
    }

    setParsedPreview(preview);
  }, [instructions]);

  async function loadData() {
    try {
      // Load bot
      const { data: botData } = await supabase
        .from('bots')
        .select('*, strategy_templates(*)')
        .eq('id', botId)
        .single();
      setBot(botData);

      // Load versions
      const { data: versionsData } = await supabase
        .from('bot_versions')
        .select('*')
        .eq('bot_id', botId)
        .order('version_number', { ascending: false });
      setVersions(versionsData || []);
      if (versionsData?.[0]) setSelectedVersion(versionsData[0].id);

      // Load datasets
      const { data: datasetsData } = await supabase
        .from('datasets')
        .select('*')
        .order('created_at', { ascending: false });
      setDatasets(datasetsData || []);
      if (datasetsData?.[0]) setSelectedDataset(datasetsData[0].id);

      // Load tuning jobs
      const { data: jobsData } = await supabase
        .from('tuning_jobs')
        .select('*')
        .eq('bot_id', botId)
        .order('created_at', { ascending: false });
      setJobs(jobsData || []);
      if (jobsData?.[0]) setSelectedJob(jobsData[0].id);
    } catch (error) {
      console.error('Error loading data:', error);
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  }

  async function loadTrials(jobId: string) {
    const { data } = await supabase
      .from('tuning_trials')
      .select('*')
      .eq('job_id', jobId)
      .order('trial_number', { ascending: false });
    setTrials(data || []);
  }

  async function handleStartJob() {
    if (!selectedVersion || !selectedDataset) {
      toast.error('Please select a version and dataset');
      return;
    }

    setStarting(true);
    try {
      const { data, error } = await supabase.functions.invoke('tuning-start', {
        body: {
          bot_id: botId,
          champion_version_id: selectedVersion,
          dataset_id: selectedDataset,
          instructions: instructions || undefined,
          max_trials: maxTrials,
          objective_config: {
            pf_weight: pfWeight,
            sharpe_weight: sharpeWeight,
            return_weight: returnWeight,
            dd_penalty: ddPenalty,
          },
        },
      });

      if (error) throw error;
      
      const jobId = data.job_id;
      setRunningJobId(jobId);
      setSelectedJob(jobId);
      toast.success('Tuning job created! Running trials in background...');
      await loadData();

      // Trigger worker in background (don't await - runs async)
      supabase.functions.invoke('tuning-worker', {
        body: { job_id: jobId },
      }).then(() => {
        setRunningJobId(null);
        loadData();
        toast.success('Tuning job completed!');
      }).catch((err) => {
        console.error('Worker error:', err);
        setRunningJobId(null);
        loadData();
      });
      
    } catch (error) {
      console.error('Error starting job:', error);
      toast.error('Failed to start tuning job');
    } finally {
      setStarting(false);
    }
  }

  async function handleContinueJob(jobId: string) {
    setRunningJobId(jobId);
    try {
      toast.info('Resuming tuning job...');
      
      // Run in background
      supabase.functions.invoke('tuning-worker', {
        body: { job_id: jobId },
      }).then(() => {
        setRunningJobId(null);
        loadData();
        toast.success('Tuning job completed!');
      }).catch((err) => {
        console.error('Worker error:', err);
        setRunningJobId(null);
        loadData();
      });
      
    } catch (error) {
      console.error('Error continuing job:', error);
      toast.error('Failed to continue job');
      setRunningJobId(null);
    }
  }

  // Check if there's a running job
  const hasRunningJob = runningJobId !== null || jobs.some(j => j.status === 'running');
  const activeRunningJob = runningJobId || jobs.find(j => j.status === 'running')?.id;

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-96">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </MainLayout>
    );
  }

  const selectedJobData = jobs.find(j => j.id === selectedJob);

  return (
    <MainLayout>
      <PageHeader
        title="Auto Tuner"
        description={bot?.name || 'Bot Training'}
      >
        <Button variant="outline" onClick={() => navigate(`/bots/${botId}`)} className="gap-2">
          <ArrowLeft className="w-4 h-4" />
          Back to Bot
        </Button>
      </PageHeader>

      <div className="px-8 pb-8 space-y-6">
        <Tabs defaultValue="new" className="space-y-6">
          <TabsList>
            <TabsTrigger value="new" className="gap-2">
              <Sparkles className="w-4 h-4" />
              New Job
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-2">
              <History className="w-4 h-4" />
              Job History ({jobs.length})
            </TabsTrigger>
            <TabsTrigger value="trials" className="gap-2">
              <Brain className="w-4 h-4" />
              Trials
            </TabsTrigger>
          </TabsList>

          <TabsContent value="new">
            {/* Running Job Banner */}
            {hasRunningJob && (
              <div className="bg-primary/10 border border-primary/20 rounded-lg p-4 mb-6 flex items-center gap-4">
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
                <div className="flex-1">
                  <p className="font-medium text-primary">Tuning Job Running</p>
                  <p className="text-sm text-muted-foreground">
                    The tuner is testing parameter mutations in the background. This may take a few minutes.
                    Check the "Job History" tab for progress.
                  </p>
                </div>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={loadData}
                  className="gap-2"
                >
                  <RefreshCw className="w-3 h-3" />
                  Refresh
                </Button>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Configuration */}
              <div className="terminal-card p-6 space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium">Job Configuration</h3>
                  <div className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
                    Step 1: Configure
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <Label>Champion Version</Label>
                    <p className="text-xs text-muted-foreground mb-1">
                      The starting point for parameter optimization
                    </p>
                    <Select value={selectedVersion} onValueChange={setSelectedVersion}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select version" />
                      </SelectTrigger>
                      <SelectContent>
                        {versions.map(v => (
                          <SelectItem key={v.id} value={v.id}>
                            v{v.version_number} - {v.status}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Dataset</Label>
                    <p className="text-xs text-muted-foreground mb-1">
                      Historical data for train/validate/test splits (60/20/20)
                    </p>
                    <Select value={selectedDataset} onValueChange={setSelectedDataset}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select dataset" />
                      </SelectTrigger>
                      <SelectContent>
                        {datasets.map(d => (
                          <SelectItem key={d.id} value={d.id}>
                            {d.symbol} {d.timeframe} ({d.bar_count} bars)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Max Trials</Label>
                    <p className="text-xs text-muted-foreground mb-1">
                      Number of parameter mutations to test
                    </p>
                    <Input
                      type="number"
                      value={maxTrials}
                      onChange={(e) => setMaxTrials(parseInt(e.target.value) || 20)}
                      min={5}
                      max={100}
                    />
                  </div>
                </div>

                <div className="pt-4 border-t border-border">
                  <h4 className="font-medium mb-2">Objective Weights</h4>
                  <p className="text-xs text-muted-foreground mb-4">
                    Adjust how the optimizer scores each trial. Total should equal 100%.
                  </p>
                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between mb-2">
                        <Label>Profit Factor</Label>
                        <span className="text-sm font-mono">{(pfWeight * 100).toFixed(0)}%</span>
                      </div>
                      <Slider
                        value={[pfWeight]}
                        onValueChange={([v]) => setPfWeight(v)}
                        min={0}
                        max={1}
                        step={0.05}
                      />
                    </div>
                    <div>
                      <div className="flex justify-between mb-2">
                        <Label>Sharpe Ratio</Label>
                        <span className="text-sm font-mono">{(sharpeWeight * 100).toFixed(0)}%</span>
                      </div>
                      <Slider
                        value={[sharpeWeight]}
                        onValueChange={([v]) => setSharpeWeight(v)}
                        min={0}
                        max={1}
                        step={0.05}
                      />
                    </div>
                    <div>
                      <div className="flex justify-between mb-2">
                        <Label>Return</Label>
                        <span className="text-sm font-mono">{(returnWeight * 100).toFixed(0)}%</span>
                      </div>
                      <Slider
                        value={[returnWeight]}
                        onValueChange={([v]) => setReturnWeight(v)}
                        min={0}
                        max={1}
                        step={0.05}
                      />
                    </div>
                    <div>
                      <div className="flex justify-between mb-2">
                        <Label>Drawdown Penalty</Label>
                        <span className="text-sm font-mono">{(ddPenalty * 100).toFixed(0)}%</span>
                      </div>
                      <Slider
                        value={[ddPenalty]}
                        onValueChange={([v]) => setDdPenalty(v)}
                        min={0}
                        max={1}
                        step={0.05}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Trainer Instructions */}
              <div className="terminal-card p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium">Trainer Instructions</h3>
                  <div className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
                    Step 2: Guide (Optional)
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  Describe your optimization goals in natural language. The system will interpret
                  and apply guardrails automatically.
                </p>

                <Textarea
                  placeholder="E.g., 'Minimize drawdown while maintaining profitability' or 'Prefer fewer, higher-quality trades'"
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  rows={4}
                />

                {parsedPreview && (
                  <div className="bg-muted/50 rounded-lg p-4 border border-border">
                    <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                      <Brain className="w-4 h-4" />
                      Interpreted As:
                    </h4>
                    <p className="text-sm text-muted-foreground">{parsedPreview.summary}</p>
                    {parsedPreview.weights && (
                      <div className="mt-2 text-xs font-mono text-muted-foreground">
                        Weights: {JSON.stringify(parsedPreview.weights)}
                      </div>
                    )}
                    {parsedPreview.mutation_bias && (
                      <div className="mt-1 text-xs font-mono text-muted-foreground">
                        Bias: {JSON.stringify(parsedPreview.mutation_bias)}
                      </div>
                    )}
                  </div>
                )}

                <div className="bg-warning/10 border border-warning/20 rounded-lg p-4">
                  <h4 className="text-sm font-medium text-warning mb-2">Safety Guardrails</h4>
                  <ul className="text-xs text-muted-foreground space-y-1">
                    <li>• Walk-forward validation always enforced (60/20/20 split)</li>
                    <li>• Parameter bounds from template schema respected</li>
                    <li>• Minimum 30 trades required for acceptance</li>
                    <li>• New version only created if improvement ≥3%</li>
                  </ul>
                </div>

                {/* Start Button with Status Info */}
                <div className="space-y-3 pt-2">
                  <Button
                    onClick={handleStartJob}
                    disabled={starting || hasRunningJob || !selectedVersion || !selectedDataset}
                    className="w-full gap-2"
                  >
                    {starting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Creating Job...
                      </>
                    ) : hasRunningJob ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Job Running - Please Wait
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4" />
                        Start Tuning Job
                      </>
                    )}
                  </Button>
                  
                  <div className="text-xs text-center text-muted-foreground">
                    {hasRunningJob ? (
                      <span className="text-primary">
                        A tuning job is currently running. Wait for it to complete or check the History tab.
                      </span>
                    ) : (
                      <span>
                        Clicking start will run {maxTrials} trials in the background. You can monitor progress in the History tab.
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="history">
            <div className="space-y-4">
              {/* Help text */}
              <div className="bg-muted/50 rounded-lg p-4 text-sm text-muted-foreground">
                <p>
                  <strong>Job History</strong> shows all tuning jobs for this bot. Click a row to view its trials in the Trials tab.
                  Jobs run in the background — you can close this page and come back later.
                </p>
              </div>

              <div className="terminal-card">
                {jobs.length > 0 ? (
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Status</th>
                        <th>Progress</th>
                        <th>Best Score</th>
                        <th>Instructions</th>
                        <th>Started</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {jobs.map((job) => {
                        const isRunning = job.status === 'running' || runningJobId === job.id;
                        const progressPct = (job.trials_completed / job.max_trials) * 100;
                        
                        return (
                          <tr
                            key={job.id}
                            className={`cursor-pointer ${selectedJob === job.id ? 'bg-muted/50' : ''}`}
                            onClick={() => setSelectedJob(job.id)}
                          >
                            <td>
                              <div className="flex items-center gap-2">
                                {isRunning && <Loader2 className="w-3 h-3 animate-spin text-primary" />}
                                <StatusBadge status={isRunning ? 'running' : job.status} />
                              </div>
                            </td>
                            <td>
                              <div className="flex items-center gap-2">
                                <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                                  <div 
                                    className="h-full bg-primary transition-all" 
                                    style={{ width: `${progressPct}%` }}
                                  />
                                </div>
                                <span className="text-xs text-muted-foreground">
                                  {job.trials_completed}/{job.max_trials}
                                </span>
                              </div>
                            </td>
                            <td className="font-mono">{job.best_score?.toFixed(3) || '—'}</td>
                            <td className="max-w-xs truncate text-sm text-muted-foreground">
                              {job.instructions || '—'}
                            </td>
                            <td className="text-sm text-muted-foreground">
                              {format(new Date(job.created_at), 'MMM d, HH:mm')}
                            </td>
                            <td>
                              {job.status === 'paused' && !runningJobId && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleContinueJob(job.id);
                                  }}
                                  className="gap-1"
                                >
                                  <RefreshCw className="w-3 h-3" />
                                  Resume
                                </Button>
                              )}
                              {isRunning && (
                                <span className="text-xs text-primary animate-pulse">Processing...</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <p className="mb-2">No tuning jobs yet</p>
                    <p className="text-xs">Go to "New Job" tab to start your first optimization run</p>
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="trials">
            {selectedJobData && (
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <h3 className="font-medium">
                    Job Trials ({selectedJobData.trials_completed})
                  </h3>
                  <StatusBadge status={selectedJobData.status} />
                </div>

                <div className="terminal-card">
                  {trials.length > 0 ? (
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Train Score</th>
                          <th>Val Score</th>
                          <th>Test Score</th>
                          <th>Accepted</th>
                          <th>Reason</th>
                        </tr>
                      </thead>
                      <tbody>
                        {trials.map((trial) => (
                          <tr key={trial.id}>
                            <td>{trial.trial_number}</td>
                            <td className="font-mono">{trial.train_score?.toFixed(3)}</td>
                            <td className="font-mono">{trial.val_score?.toFixed(3)}</td>
                            <td className="font-mono">{trial.test_score?.toFixed(3)}</td>
                            <td>
                              {trial.accepted ? (
                                <CheckCircle className="w-4 h-4 text-success" />
                              ) : (
                                <XCircle className="w-4 h-4 text-destructive" />
                              )}
                            </td>
                            <td className="text-sm text-muted-foreground max-w-xs truncate">
                              {trial.reject_reason || (trial.accepted ? 'Improved' : '—')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      No trials for this job yet
                    </div>
                  )}
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
