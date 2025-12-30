-- Instruments table for market configuration
CREATE TABLE public.instruments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol TEXT NOT NULL,
  market TEXT NOT NULL DEFAULT 'stocks',
  provider TEXT NOT NULL DEFAULT 'alpaca',
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(symbol, market, provider)
);

-- Enable RLS
ALTER TABLE public.instruments ENABLE ROW LEVEL SECURITY;

-- Public read access for instruments
CREATE POLICY "Public read access to instruments"
ON public.instruments
FOR SELECT
USING (true);

-- Market data fetch jobs
CREATE TABLE public.market_data_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  start_ts TIMESTAMPTZ NOT NULL,
  end_ts TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  bar_count INTEGER DEFAULT 0,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);

-- Enable RLS
ALTER TABLE public.market_data_jobs ENABLE ROW LEVEL SECURITY;

-- Public access to market_data_jobs
CREATE POLICY "Public access to market_data_jobs"
ON public.market_data_jobs
FOR ALL
USING (true)
WITH CHECK (true);

-- Store actual bar data (for faster backtesting)
CREATE TABLE public.market_bars (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  ts TIMESTAMPTZ NOT NULL,
  o NUMERIC NOT NULL,
  h NUMERIC NOT NULL,
  l NUMERIC NOT NULL,
  c NUMERIC NOT NULL,
  v BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(symbol, timeframe, ts)
);

-- Create index for efficient queries
CREATE INDEX idx_market_bars_lookup ON public.market_bars(symbol, timeframe, ts);

-- Enable RLS
ALTER TABLE public.market_bars ENABLE ROW LEVEL SECURITY;

-- Public read access to market_bars
CREATE POLICY "Public read access to market_bars"
ON public.market_bars
FOR SELECT
USING (true);

-- Insert access for market_bars (for edge functions)
CREATE POLICY "Public insert to market_bars"
ON public.market_bars
FOR INSERT
WITH CHECK (true);

-- Bot instances for A/B parallel tracks
CREATE TABLE public.bot_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_version_id UUID REFERENCES public.bot_versions(id) ON DELETE CASCADE NOT NULL,
  label TEXT NOT NULL DEFAULT 'A',
  mode_default TEXT NOT NULL DEFAULT 'test',
  is_running BOOLEAN NOT NULL DEFAULT false,
  is_paused BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.bot_instances ENABLE ROW LEVEL SECURITY;

-- Public access to bot_instances
CREATE POLICY "Public access to bot_instances"
ON public.bot_instances
FOR ALL
USING (true)
WITH CHECK (true);

-- Add paused_at column to runs table for pause/resume tracking
ALTER TABLE public.runs ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ;

-- Insert initial instruments
INSERT INTO public.instruments (symbol, market, provider, enabled) VALUES
  ('QQQ', 'stocks', 'alpaca', true),
  ('SPY', 'stocks', 'alpaca', true),
  ('AAPL', 'stocks', 'alpaca', true),
  ('MSFT', 'stocks', 'alpaca', true),
  ('NVDA', 'stocks', 'alpaca', true),
  ('TSLA', 'stocks', 'alpaca', true);