-- Create table for paper trading debug logs
CREATE TABLE public.paper_runner_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  deployment_id UUID NOT NULL REFERENCES public.paper_deployments(id) ON DELETE CASCADE,
  ts TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  log_type TEXT NOT NULL, -- 'signal', 'market', 'order', 'error'
  message TEXT NOT NULL,
  data_json JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.paper_runner_logs ENABLE ROW LEVEL SECURITY;

-- Policy for reading logs (public for now since no auth)
CREATE POLICY "Anyone can read paper_runner_logs" 
  ON public.paper_runner_logs 
  FOR SELECT 
  USING (true);

-- Policy for inserting logs (service role only via edge function)
CREATE POLICY "Service can insert paper_runner_logs"
  ON public.paper_runner_logs
  FOR INSERT
  WITH CHECK (true);

-- Index for efficient querying by deployment
CREATE INDEX idx_paper_runner_logs_deployment_ts 
  ON public.paper_runner_logs(deployment_id, ts DESC);

-- Add last_runner_log field to paper_deployments for quick status
ALTER TABLE public.paper_deployments 
  ADD COLUMN IF NOT EXISTS last_runner_log JSONB,
  ADD COLUMN IF NOT EXISTS last_bar_price DECIMAL,
  ADD COLUMN IF NOT EXISTS last_bar_time TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS breakout_high DECIMAL,
  ADD COLUMN IF NOT EXISTS breakout_low DECIMAL;