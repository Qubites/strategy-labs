-- Add lifecycle_status to bot_versions
ALTER TABLE public.bot_versions 
ADD COLUMN IF NOT EXISTS lifecycle_status text NOT NULL DEFAULT 'DRAFT';

-- Create tuning_jobs table
CREATE TABLE public.tuning_jobs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  bot_id uuid NOT NULL REFERENCES public.bots(id),
  champion_version_id uuid REFERENCES public.bot_versions(id),
  dataset_id uuid REFERENCES public.datasets(id),
  status text NOT NULL DEFAULT 'pending',
  objective_config jsonb NOT NULL DEFAULT '{"pf_weight": 0.35, "sharpe_weight": 0.25, "return_weight": 0.25, "dd_penalty": 0.15}'::jsonb,
  constraints jsonb NOT NULL DEFAULT '{"min_trades": 30, "max_dd": 0.15, "improvement_threshold": 0.03}'::jsonb,
  instructions text,
  instruction_parsed_json jsonb,
  max_trials integer NOT NULL DEFAULT 20,
  trials_completed integer NOT NULL DEFAULT 0,
  train_pct numeric NOT NULL DEFAULT 0.6,
  val_pct numeric NOT NULL DEFAULT 0.2,
  test_pct numeric NOT NULL DEFAULT 0.2,
  best_score numeric,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create tuning_trials table
CREATE TABLE public.tuning_trials (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id uuid NOT NULL REFERENCES public.tuning_jobs(id) ON DELETE CASCADE,
  trial_number integer NOT NULL,
  base_version_id uuid NOT NULL REFERENCES public.bot_versions(id),
  candidate_params jsonb NOT NULL,
  candidate_risk_limits jsonb,
  train_run_id uuid REFERENCES public.runs(id),
  val_run_id uuid REFERENCES public.runs(id),
  test_run_id uuid REFERENCES public.runs(id),
  train_score numeric,
  val_score numeric,
  test_score numeric,
  train_metrics jsonb,
  val_metrics jsonb,
  test_metrics jsonb,
  accepted boolean NOT NULL DEFAULT false,
  reject_reason text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create live_candidates table
CREATE TABLE public.live_candidates (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  version_id uuid NOT NULL REFERENCES public.bot_versions(id),
  job_id uuid REFERENCES public.tuning_jobs(id),
  stress_results_json jsonb,
  stress_passed boolean,
  paper_deployment_id uuid,
  approved boolean NOT NULL DEFAULT false,
  approved_at timestamp with time zone,
  reject_reason text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create paper_deployments table
CREATE TABLE public.paper_deployments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  bot_id uuid NOT NULL REFERENCES public.bots(id),
  bot_version_id uuid NOT NULL REFERENCES public.bot_versions(id),
  status text NOT NULL DEFAULT 'pending',
  started_at timestamp with time zone,
  ended_at timestamp with time zone,
  target_days integer NOT NULL DEFAULT 5,
  symbols text[] NOT NULL DEFAULT ARRAY['QQQ'],
  config_json jsonb,
  result_summary jsonb,
  pass_criteria jsonb NOT NULL DEFAULT '{"max_dd": 0.1, "max_daily_loss": 500, "min_trades": 5}'::jsonb,
  passed boolean,
  reject_reason text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create paper_orders table
CREATE TABLE public.paper_orders (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  deployment_id uuid NOT NULL REFERENCES public.paper_deployments(id) ON DELETE CASCADE,
  alpaca_order_id text,
  symbol text NOT NULL,
  side text NOT NULL,
  qty numeric NOT NULL,
  order_type text NOT NULL DEFAULT 'market',
  status text NOT NULL DEFAULT 'pending',
  submitted_at timestamp with time zone NOT NULL DEFAULT now(),
  filled_at timestamp with time zone,
  filled_price numeric,
  filled_qty numeric,
  raw_json jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create paper_positions_snapshots table
CREATE TABLE public.paper_positions_snapshots (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  deployment_id uuid NOT NULL REFERENCES public.paper_deployments(id) ON DELETE CASCADE,
  ts timestamp with time zone NOT NULL DEFAULT now(),
  equity numeric NOT NULL,
  cash numeric NOT NULL,
  positions_json jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create paper_metrics_daily table
CREATE TABLE public.paper_metrics_daily (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  deployment_id uuid NOT NULL REFERENCES public.paper_deployments(id) ON DELETE CASCADE,
  date date NOT NULL,
  pnl numeric NOT NULL DEFAULT 0,
  drawdown numeric NOT NULL DEFAULT 0,
  trades_count integer NOT NULL DEFAULT 0,
  equity_end numeric,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(deployment_id, date)
);

-- Enable RLS on all new tables
ALTER TABLE public.tuning_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tuning_trials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paper_deployments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paper_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paper_positions_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paper_metrics_daily ENABLE ROW LEVEL SECURITY;

-- Create public access policies (matching existing pattern)
CREATE POLICY "Public access to tuning_jobs" ON public.tuning_jobs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access to tuning_trials" ON public.tuning_trials FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access to live_candidates" ON public.live_candidates FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access to paper_deployments" ON public.paper_deployments FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access to paper_orders" ON public.paper_orders FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access to paper_positions_snapshots" ON public.paper_positions_snapshots FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access to paper_metrics_daily" ON public.paper_metrics_daily FOR ALL USING (true) WITH CHECK (true);

-- Add indexes for performance
CREATE INDEX idx_tuning_trials_job_id ON public.tuning_trials(job_id);
CREATE INDEX idx_tuning_trials_accepted ON public.tuning_trials(accepted);
CREATE INDEX idx_live_candidates_version_id ON public.live_candidates(version_id);
CREATE INDEX idx_paper_orders_deployment_id ON public.paper_orders(deployment_id);
CREATE INDEX idx_paper_positions_deployment_id ON public.paper_positions_snapshots(deployment_id);
CREATE INDEX idx_paper_metrics_deployment_id ON public.paper_metrics_daily(deployment_id);