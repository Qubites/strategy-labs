-- Trading Bot Lab Database Schema

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Datasets table (for historical data storage)
CREATE TABLE public.datasets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  symbol TEXT NOT NULL,
  market_type TEXT NOT NULL DEFAULT 'stock',
  timeframe TEXT NOT NULL,
  start_ts TIMESTAMP WITH TIME ZONE NOT NULL,
  end_ts TIMESTAMP WITH TIME ZONE NOT NULL,
  session TEXT NOT NULL DEFAULT 'RTH',
  source TEXT NOT NULL DEFAULT 'alpaca',
  storage_path TEXT,
  dataset_hash TEXT NOT NULL,
  bar_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Strategy templates table
CREATE TABLE public.strategy_templates (
  id TEXT NOT NULL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  param_schema_json TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Bots table
CREATE TABLE public.bots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  template_id TEXT NOT NULL REFERENCES public.strategy_templates(id),
  archived BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Bot versions table
CREATE TABLE public.bot_versions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  bot_id UUID NOT NULL REFERENCES public.bots(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL DEFAULT 1,
  params_json TEXT NOT NULL,
  params_hash TEXT NOT NULL,
  risk_limits_json TEXT NOT NULL,
  version_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(bot_id, version_number)
);

-- Runs table
CREATE TABLE public.runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  bot_version_id UUID NOT NULL REFERENCES public.bot_versions(id) ON DELETE CASCADE,
  run_type TEXT NOT NULL,
  dataset_id UUID REFERENCES public.datasets(id),
  start_ts TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  end_ts TIMESTAMP WITH TIME ZONE,
  stop_rule_json TEXT,
  cost_model_json TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Run metrics table
CREATE TABLE public.run_metrics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id UUID NOT NULL REFERENCES public.runs(id) ON DELETE CASCADE UNIQUE,
  profit_factor DECIMAL(10, 4),
  net_pnl_usd DECIMAL(12, 2),
  net_pnl_points DECIMAL(12, 4),
  gross_profit DECIMAL(12, 2),
  gross_loss DECIMAL(12, 2),
  max_drawdown DECIMAL(12, 2),
  trades_count INTEGER DEFAULT 0,
  win_rate DECIMAL(5, 2),
  avg_trade DECIMAL(12, 2),
  median_trade DECIMAL(12, 2),
  fees_paid DECIMAL(12, 2),
  slippage_est DECIMAL(12, 2),
  max_consecutive_losses INTEGER DEFAULT 0,
  biggest_loss DECIMAL(12, 2),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Trades table
CREATE TABLE public.trades (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id UUID NOT NULL REFERENCES public.runs(id) ON DELETE CASCADE,
  ts_entry TIMESTAMP WITH TIME ZONE NOT NULL,
  ts_exit TIMESTAMP WITH TIME ZONE,
  side TEXT NOT NULL,
  entry_price DECIMAL(12, 4) NOT NULL,
  exit_price DECIMAL(12, 4),
  qty DECIMAL(12, 4) NOT NULL,
  pnl_usd DECIMAL(12, 2),
  pnl_points DECIMAL(12, 4),
  fees DECIMAL(12, 2),
  slippage DECIMAL(12, 4),
  reason_code TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Logs table
CREATE TABLE public.logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id UUID REFERENCES public.runs(id) ON DELETE CASCADE,
  ts TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  level TEXT NOT NULL DEFAULT 'info',
  category TEXT NOT NULL DEFAULT 'system',
  message TEXT NOT NULL,
  payload_json TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- AI Advice table (using advice_window instead of window)
CREATE TABLE public.ai_advice (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  bot_version_id UUID NOT NULL REFERENCES public.bot_versions(id) ON DELETE CASCADE,
  run_id UUID REFERENCES public.runs(id) ON DELETE SET NULL,
  advice_window TEXT NOT NULL DEFAULT '1d',
  goal TEXT NOT NULL DEFAULT 'pf',
  summary TEXT,
  recommendations_json TEXT,
  confidence DECIMAL(5, 4),
  applied BOOLEAN NOT NULL DEFAULT false,
  applied_bot_version_id UUID REFERENCES public.bot_versions(id),
  applied_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX idx_datasets_symbol ON public.datasets(symbol);
CREATE INDEX idx_datasets_created ON public.datasets(created_at DESC);
CREATE INDEX idx_bots_template ON public.bots(template_id);
CREATE INDEX idx_bot_versions_bot ON public.bot_versions(bot_id);
CREATE INDEX idx_bot_versions_status ON public.bot_versions(status);
CREATE INDEX idx_runs_bot_version ON public.runs(bot_version_id);
CREATE INDEX idx_runs_status ON public.runs(status);
CREATE INDEX idx_runs_type ON public.runs(run_type);
CREATE INDEX idx_trades_run ON public.trades(run_id);
CREATE INDEX idx_logs_run ON public.logs(run_id);
CREATE INDEX idx_logs_category ON public.logs(category);
CREATE INDEX idx_ai_advice_bot_version ON public.ai_advice(bot_version_id);

-- Enable RLS on all tables
ALTER TABLE public.datasets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.strategy_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.run_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_advice ENABLE ROW LEVEL SECURITY;

-- Public access policies for MVP
CREATE POLICY "Public access to datasets" ON public.datasets FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access to strategy_templates" ON public.strategy_templates FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access to bots" ON public.bots FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access to bot_versions" ON public.bot_versions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access to runs" ON public.runs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access to run_metrics" ON public.run_metrics FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access to trades" ON public.trades FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access to logs" ON public.logs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access to ai_advice" ON public.ai_advice FOR ALL USING (true) WITH CHECK (true);

-- Create storage bucket for datasets
INSERT INTO storage.buckets (id, name, public) VALUES ('datasets', 'datasets', true);
CREATE POLICY "Public access to datasets bucket" ON storage.objects FOR ALL USING (bucket_id = 'datasets') WITH CHECK (bucket_id = 'datasets');