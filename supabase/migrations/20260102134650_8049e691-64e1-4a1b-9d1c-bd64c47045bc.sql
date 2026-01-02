-- Add session column to market_bars to distinguish RTH from ALL session bars
ALTER TABLE public.market_bars ADD COLUMN IF NOT EXISTS session TEXT DEFAULT 'ALL';

-- Create index for efficient session-based queries
CREATE INDEX IF NOT EXISTS idx_market_bars_session ON public.market_bars(symbol, timeframe, session, ts);

-- Drop the old constraint and create new one including session
ALTER TABLE public.market_bars DROP CONSTRAINT IF EXISTS market_bars_symbol_timeframe_ts_key;
CREATE UNIQUE INDEX IF NOT EXISTS market_bars_symbol_timeframe_session_ts_key ON public.market_bars(symbol, timeframe, session, ts);