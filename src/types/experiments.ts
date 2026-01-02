// Experiment Groups & Iteration Types

export interface ExperimentGroup {
  id: string;
  name: string;
  template_id: string;
  dataset_id: string | null;
  timeframe: string;
  session: string;
  objective_config: ObjectiveConfig;
  champion_version_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ObjectiveConfig {
  pf_weight: number;
  dd_penalty: number;
  return_weight: number;
  sharpe_weight: number;
}

export interface Iteration {
  id: string;
  experiment_group_id: string;
  parent_version_id: string | null;
  child_version_id: string;
  iteration_number: number;
  trigger_type: 'manual' | 'auto_tuner' | 'ai_advice';
  param_diff: Record<string, { before: any; after: any }> | null;
  risk_diff: Record<string, { before: any; after: any }> | null;
  ai_rationale: string | null;
  gate_results: GateResults | null;
  metric_before: MetricSnapshot | null;
  metric_after: MetricSnapshot | null;
  accepted: boolean;
  reject_reason: string | null;
  created_at: string;
}

export interface GateResults {
  min_trades: { required: number; actual: number; passed: boolean };
  max_dd: { required: number; actual: number; passed: boolean };
  improvement: { required: number; actual: number; passed: boolean };
}

export interface MetricSnapshot {
  profit_factor: number | null;
  net_pnl_usd: number | null;
  max_drawdown: number | null;
  trades_count: number | null;
  win_rate: number | null;
  sharpe_ratio?: number | null;
}

export interface PipelineState {
  id: string;
  bot_id: string;
  current_step: PipelineStep;
  experiment_group_id: string | null;
  last_run_id: string | null;
  last_version_id: string | null;
  auto_mode: boolean;
  max_iterations: number;
  mutation_aggressiveness: number;
  stop_conditions: StopConditions;
  created_at: string;
  updated_at: string;
}

export type PipelineStep = 'create' | 'dataset' | 'configure' | 'backtest' | 'review' | 'iterate';

export interface StopConditions {
  max_dd: number;
  min_improvement: number;
}

export interface ExperimentGroupWithDetails extends ExperimentGroup {
  strategy_templates?: {
    id: string;
    name: string;
  };
  datasets?: {
    id: string;
    symbol: string;
    timeframe: string;
    session: string;
  };
  champion_version?: {
    id: string;
    version_number: number;
    params_json: string;
  };
  versions_count?: number;
  best_pf?: number;
  best_pnl?: number;
}
