// Trading Bot Lab Types - Using string types for Supabase compatibility

export interface Dataset {
  id: string;
  symbol: string;
  market_type: string;
  timeframe: string;
  start_ts: string;
  end_ts: string;
  session: string;
  source: string;
  storage_path: string | null;
  dataset_hash: string;
  bar_count: number;
  created_at: string;
}

export interface ParamDefinition {
  key: string;
  type: 'int' | 'float' | 'bool' | 'enum';
  min?: number;
  max?: number;
  step?: number;
  default: number | string | boolean;
  label: string;
  values?: string[];
  depends_on?: Record<string, boolean | string | number>;
}

export interface ParamSchema {
  template_id: string;
  name: string;
  description: string;
  params: ParamDefinition[];
  default_risk_limits: RiskLimits;
}

export interface RiskLimits {
  preset: string;
  max_position_size_usd: number;
  max_daily_loss_usd: number;
  max_drawdown_usd: number;
  max_consecutive_losses: number;
  cooldown_minutes_after_loss: number;
  cooldown_minutes_after_vol_spike: number;
  require_slippage_guard: boolean;
}

export interface StrategyTemplate {
  id: string;
  name: string;
  description: string | null;
  param_schema_json: string;
  is_active: boolean;
  created_at: string;
}

export interface Bot {
  id: string;
  name: string;
  template_id: string;
  archived: boolean;
  created_at: string;
  template?: StrategyTemplate;
  latest_version?: BotVersion;
}

export interface BotVersion {
  id: string;
  bot_id: string;
  version_number: number;
  params_json: string;
  params_hash: string;
  risk_limits_json: string;
  version_hash: string;
  status: string;
  created_at: string;
}

export interface Run {
  id: string;
  bot_version_id: string;
  run_type: string;
  dataset_id: string | null;
  start_ts: string;
  end_ts: string | null;
  stop_rule_json: string | null;
  cost_model_json: string | null;
  status: string;
  created_at: string;
  run_metrics?: RunMetrics;
  bot_version?: BotVersion;
  bot?: Bot;
  dataset?: Dataset;
}

export interface RunMetrics {
  id: string;
  run_id: string;
  profit_factor: number | null;
  net_pnl_usd: number | null;
  net_pnl_points: number | null;
  gross_profit: number | null;
  gross_loss: number | null;
  max_drawdown: number | null;
  trades_count: number;
  win_rate: number | null;
  avg_trade: number | null;
  median_trade: number | null;
  fees_paid: number | null;
  slippage_est: number | null;
  max_consecutive_losses: number;
  biggest_loss: number | null;
  updated_at: string;
}

export interface Trade {
  id: string;
  run_id: string;
  ts_entry: string;
  ts_exit: string | null;
  side: string;
  entry_price: number;
  exit_price: number | null;
  qty: number;
  pnl_usd: number | null;
  pnl_points: number | null;
  fees: number | null;
  slippage: number | null;
  reason_code: string | null;
  created_at: string;
}

export interface CostModel {
  commission_per_share: number;
  slippage_per_share: number;
  fixed_cost_per_trade: number;
}
