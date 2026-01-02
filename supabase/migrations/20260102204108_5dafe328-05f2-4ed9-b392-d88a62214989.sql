-- Add live trading state columns to paper_deployments
ALTER TABLE public.paper_deployments 
ADD COLUMN IF NOT EXISTS last_signal_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS last_signal_type text,
ADD COLUMN IF NOT EXISTS current_position jsonb DEFAULT null,
ADD COLUMN IF NOT EXISTS daily_pnl numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS daily_trades integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS halted boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS halt_reason text;