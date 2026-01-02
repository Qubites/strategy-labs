export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      ai_advice: {
        Row: {
          advice_window: string
          applied: boolean
          applied_bot_version_id: string | null
          applied_by: string | null
          bot_version_id: string
          confidence: number | null
          created_at: string
          goal: string
          id: string
          recommendations_json: string | null
          run_id: string | null
          summary: string | null
        }
        Insert: {
          advice_window?: string
          applied?: boolean
          applied_bot_version_id?: string | null
          applied_by?: string | null
          bot_version_id: string
          confidence?: number | null
          created_at?: string
          goal?: string
          id?: string
          recommendations_json?: string | null
          run_id?: string | null
          summary?: string | null
        }
        Update: {
          advice_window?: string
          applied?: boolean
          applied_bot_version_id?: string | null
          applied_by?: string | null
          bot_version_id?: string
          confidence?: number | null
          created_at?: string
          goal?: string
          id?: string
          recommendations_json?: string | null
          run_id?: string | null
          summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_advice_applied_bot_version_id_fkey"
            columns: ["applied_bot_version_id"]
            isOneToOne: false
            referencedRelation: "bot_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_advice_bot_version_id_fkey"
            columns: ["bot_version_id"]
            isOneToOne: false
            referencedRelation: "bot_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_advice_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "runs"
            referencedColumns: ["id"]
          },
        ]
      }
      bot_instances: {
        Row: {
          bot_version_id: string
          created_at: string
          id: string
          is_paused: boolean
          is_running: boolean
          label: string
          mode_default: string
        }
        Insert: {
          bot_version_id: string
          created_at?: string
          id?: string
          is_paused?: boolean
          is_running?: boolean
          label?: string
          mode_default?: string
        }
        Update: {
          bot_version_id?: string
          created_at?: string
          id?: string
          is_paused?: boolean
          is_running?: boolean
          label?: string
          mode_default?: string
        }
        Relationships: [
          {
            foreignKeyName: "bot_instances_bot_version_id_fkey"
            columns: ["bot_version_id"]
            isOneToOne: false
            referencedRelation: "bot_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      bot_versions: {
        Row: {
          bot_id: string
          created_at: string
          experiment_group_id: string | null
          id: string
          is_champion: boolean
          lifecycle_status: string
          params_hash: string
          params_json: string
          risk_limits_json: string
          status: string
          version_hash: string
          version_number: number
        }
        Insert: {
          bot_id: string
          created_at?: string
          experiment_group_id?: string | null
          id?: string
          is_champion?: boolean
          lifecycle_status?: string
          params_hash: string
          params_json: string
          risk_limits_json: string
          status?: string
          version_hash: string
          version_number?: number
        }
        Update: {
          bot_id?: string
          created_at?: string
          experiment_group_id?: string | null
          id?: string
          is_champion?: boolean
          lifecycle_status?: string
          params_hash?: string
          params_json?: string
          risk_limits_json?: string
          status?: string
          version_hash?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "bot_versions_bot_id_fkey"
            columns: ["bot_id"]
            isOneToOne: false
            referencedRelation: "bots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bot_versions_experiment_group_id_fkey"
            columns: ["experiment_group_id"]
            isOneToOne: false
            referencedRelation: "experiment_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      bots: {
        Row: {
          archived: boolean
          created_at: string
          id: string
          name: string
          template_id: string
        }
        Insert: {
          archived?: boolean
          created_at?: string
          id?: string
          name: string
          template_id: string
        }
        Update: {
          archived?: boolean
          created_at?: string
          id?: string
          name?: string
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bots_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "strategy_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      datasets: {
        Row: {
          bar_count: number | null
          created_at: string
          dataset_hash: string
          end_ts: string
          id: string
          is_combined: boolean | null
          market_type: string
          session: string
          source: string
          source_dataset_ids: string[] | null
          start_ts: string
          storage_path: string | null
          symbol: string
          timeframe: string
        }
        Insert: {
          bar_count?: number | null
          created_at?: string
          dataset_hash: string
          end_ts: string
          id?: string
          is_combined?: boolean | null
          market_type?: string
          session?: string
          source?: string
          source_dataset_ids?: string[] | null
          start_ts: string
          storage_path?: string | null
          symbol: string
          timeframe: string
        }
        Update: {
          bar_count?: number | null
          created_at?: string
          dataset_hash?: string
          end_ts?: string
          id?: string
          is_combined?: boolean | null
          market_type?: string
          session?: string
          source?: string
          source_dataset_ids?: string[] | null
          start_ts?: string
          storage_path?: string | null
          symbol?: string
          timeframe?: string
        }
        Relationships: []
      }
      experiment_groups: {
        Row: {
          champion_version_id: string | null
          created_at: string
          dataset_id: string | null
          id: string
          name: string
          objective_config: Json
          session: string
          template_id: string
          timeframe: string
          updated_at: string
        }
        Insert: {
          champion_version_id?: string | null
          created_at?: string
          dataset_id?: string | null
          id?: string
          name: string
          objective_config?: Json
          session?: string
          template_id: string
          timeframe?: string
          updated_at?: string
        }
        Update: {
          champion_version_id?: string | null
          created_at?: string
          dataset_id?: string | null
          id?: string
          name?: string
          objective_config?: Json
          session?: string
          template_id?: string
          timeframe?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "experiment_groups_champion_version_id_fkey"
            columns: ["champion_version_id"]
            isOneToOne: false
            referencedRelation: "bot_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "experiment_groups_dataset_id_fkey"
            columns: ["dataset_id"]
            isOneToOne: false
            referencedRelation: "datasets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "experiment_groups_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "strategy_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      instruments: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          market: string
          provider: string
          symbol: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          market?: string
          provider?: string
          symbol: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          market?: string
          provider?: string
          symbol?: string
        }
        Relationships: []
      }
      iterations: {
        Row: {
          accepted: boolean
          ai_rationale: string | null
          child_version_id: string
          created_at: string
          experiment_group_id: string
          gate_results: Json | null
          id: string
          iteration_number: number
          metric_after: Json | null
          metric_before: Json | null
          param_diff: Json | null
          parent_version_id: string | null
          reject_reason: string | null
          risk_diff: Json | null
          trigger_type: string
        }
        Insert: {
          accepted?: boolean
          ai_rationale?: string | null
          child_version_id: string
          created_at?: string
          experiment_group_id: string
          gate_results?: Json | null
          id?: string
          iteration_number?: number
          metric_after?: Json | null
          metric_before?: Json | null
          param_diff?: Json | null
          parent_version_id?: string | null
          reject_reason?: string | null
          risk_diff?: Json | null
          trigger_type?: string
        }
        Update: {
          accepted?: boolean
          ai_rationale?: string | null
          child_version_id?: string
          created_at?: string
          experiment_group_id?: string
          gate_results?: Json | null
          id?: string
          iteration_number?: number
          metric_after?: Json | null
          metric_before?: Json | null
          param_diff?: Json | null
          parent_version_id?: string | null
          reject_reason?: string | null
          risk_diff?: Json | null
          trigger_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "iterations_child_version_id_fkey"
            columns: ["child_version_id"]
            isOneToOne: false
            referencedRelation: "bot_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "iterations_experiment_group_id_fkey"
            columns: ["experiment_group_id"]
            isOneToOne: false
            referencedRelation: "experiment_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "iterations_parent_version_id_fkey"
            columns: ["parent_version_id"]
            isOneToOne: false
            referencedRelation: "bot_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      live_candidates: {
        Row: {
          approved: boolean
          approved_at: string | null
          created_at: string
          id: string
          job_id: string | null
          paper_deployment_id: string | null
          reject_reason: string | null
          stress_passed: boolean | null
          stress_results_json: Json | null
          version_id: string
        }
        Insert: {
          approved?: boolean
          approved_at?: string | null
          created_at?: string
          id?: string
          job_id?: string | null
          paper_deployment_id?: string | null
          reject_reason?: string | null
          stress_passed?: boolean | null
          stress_results_json?: Json | null
          version_id: string
        }
        Update: {
          approved?: boolean
          approved_at?: string | null
          created_at?: string
          id?: string
          job_id?: string | null
          paper_deployment_id?: string | null
          reject_reason?: string | null
          stress_passed?: boolean | null
          stress_results_json?: Json | null
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_candidates_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "tuning_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_candidates_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: true
            referencedRelation: "bot_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      logs: {
        Row: {
          category: string
          created_at: string
          id: string
          level: string
          message: string
          payload_json: string | null
          run_id: string | null
          ts: string
        }
        Insert: {
          category?: string
          created_at?: string
          id?: string
          level?: string
          message: string
          payload_json?: string | null
          run_id?: string | null
          ts?: string
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          level?: string
          message?: string
          payload_json?: string | null
          run_id?: string | null
          ts?: string
        }
        Relationships: [
          {
            foreignKeyName: "logs_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "runs"
            referencedColumns: ["id"]
          },
        ]
      }
      market_bars: {
        Row: {
          c: number
          created_at: string
          h: number
          id: string
          l: number
          o: number
          session: string | null
          symbol: string
          timeframe: string
          ts: string
          v: number
        }
        Insert: {
          c: number
          created_at?: string
          h: number
          id?: string
          l: number
          o: number
          session?: string | null
          symbol: string
          timeframe: string
          ts: string
          v: number
        }
        Update: {
          c?: number
          created_at?: string
          h?: number
          id?: string
          l?: number
          o?: number
          session?: string | null
          symbol?: string
          timeframe?: string
          ts?: string
          v?: number
        }
        Relationships: []
      }
      market_data_jobs: {
        Row: {
          bar_count: number | null
          created_at: string
          end_ts: string
          error: string | null
          finished_at: string | null
          id: string
          start_ts: string
          status: string
          symbol: string
          timeframe: string
        }
        Insert: {
          bar_count?: number | null
          created_at?: string
          end_ts: string
          error?: string | null
          finished_at?: string | null
          id?: string
          start_ts: string
          status?: string
          symbol: string
          timeframe: string
        }
        Update: {
          bar_count?: number | null
          created_at?: string
          end_ts?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          start_ts?: string
          status?: string
          symbol?: string
          timeframe?: string
        }
        Relationships: []
      }
      paper_deployments: {
        Row: {
          bot_id: string
          bot_version_id: string
          config_json: Json | null
          created_at: string
          ended_at: string | null
          id: string
          pass_criteria: Json
          passed: boolean | null
          reject_reason: string | null
          result_summary: Json | null
          started_at: string | null
          status: string
          symbols: string[]
          target_days: number
        }
        Insert: {
          bot_id: string
          bot_version_id: string
          config_json?: Json | null
          created_at?: string
          ended_at?: string | null
          id?: string
          pass_criteria?: Json
          passed?: boolean | null
          reject_reason?: string | null
          result_summary?: Json | null
          started_at?: string | null
          status?: string
          symbols?: string[]
          target_days?: number
        }
        Update: {
          bot_id?: string
          bot_version_id?: string
          config_json?: Json | null
          created_at?: string
          ended_at?: string | null
          id?: string
          pass_criteria?: Json
          passed?: boolean | null
          reject_reason?: string | null
          result_summary?: Json | null
          started_at?: string | null
          status?: string
          symbols?: string[]
          target_days?: number
        }
        Relationships: [
          {
            foreignKeyName: "paper_deployments_bot_id_fkey"
            columns: ["bot_id"]
            isOneToOne: false
            referencedRelation: "bots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paper_deployments_bot_version_id_fkey"
            columns: ["bot_version_id"]
            isOneToOne: false
            referencedRelation: "bot_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      paper_metrics_daily: {
        Row: {
          created_at: string
          date: string
          deployment_id: string
          drawdown: number
          equity_end: number | null
          id: string
          notes: string | null
          pnl: number
          trades_count: number
        }
        Insert: {
          created_at?: string
          date: string
          deployment_id: string
          drawdown?: number
          equity_end?: number | null
          id?: string
          notes?: string | null
          pnl?: number
          trades_count?: number
        }
        Update: {
          created_at?: string
          date?: string
          deployment_id?: string
          drawdown?: number
          equity_end?: number | null
          id?: string
          notes?: string | null
          pnl?: number
          trades_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "paper_metrics_daily_deployment_id_fkey"
            columns: ["deployment_id"]
            isOneToOne: false
            referencedRelation: "paper_deployments"
            referencedColumns: ["id"]
          },
        ]
      }
      paper_orders: {
        Row: {
          alpaca_order_id: string | null
          created_at: string
          deployment_id: string
          filled_at: string | null
          filled_price: number | null
          filled_qty: number | null
          id: string
          order_type: string
          qty: number
          raw_json: Json | null
          side: string
          status: string
          submitted_at: string
          symbol: string
        }
        Insert: {
          alpaca_order_id?: string | null
          created_at?: string
          deployment_id: string
          filled_at?: string | null
          filled_price?: number | null
          filled_qty?: number | null
          id?: string
          order_type?: string
          qty: number
          raw_json?: Json | null
          side: string
          status?: string
          submitted_at?: string
          symbol: string
        }
        Update: {
          alpaca_order_id?: string | null
          created_at?: string
          deployment_id?: string
          filled_at?: string | null
          filled_price?: number | null
          filled_qty?: number | null
          id?: string
          order_type?: string
          qty?: number
          raw_json?: Json | null
          side?: string
          status?: string
          submitted_at?: string
          symbol?: string
        }
        Relationships: [
          {
            foreignKeyName: "paper_orders_deployment_id_fkey"
            columns: ["deployment_id"]
            isOneToOne: false
            referencedRelation: "paper_deployments"
            referencedColumns: ["id"]
          },
        ]
      }
      paper_positions_snapshots: {
        Row: {
          cash: number
          created_at: string
          deployment_id: string
          equity: number
          id: string
          positions_json: Json | null
          ts: string
        }
        Insert: {
          cash: number
          created_at?: string
          deployment_id: string
          equity: number
          id?: string
          positions_json?: Json | null
          ts?: string
        }
        Update: {
          cash?: number
          created_at?: string
          deployment_id?: string
          equity?: number
          id?: string
          positions_json?: Json | null
          ts?: string
        }
        Relationships: [
          {
            foreignKeyName: "paper_positions_snapshots_deployment_id_fkey"
            columns: ["deployment_id"]
            isOneToOne: false
            referencedRelation: "paper_deployments"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_states: {
        Row: {
          auto_mode: boolean
          bot_id: string
          created_at: string
          current_step: string
          experiment_group_id: string | null
          id: string
          last_run_id: string | null
          last_version_id: string | null
          max_iterations: number
          mutation_aggressiveness: number
          stop_conditions: Json
          updated_at: string
        }
        Insert: {
          auto_mode?: boolean
          bot_id: string
          created_at?: string
          current_step?: string
          experiment_group_id?: string | null
          id?: string
          last_run_id?: string | null
          last_version_id?: string | null
          max_iterations?: number
          mutation_aggressiveness?: number
          stop_conditions?: Json
          updated_at?: string
        }
        Update: {
          auto_mode?: boolean
          bot_id?: string
          created_at?: string
          current_step?: string
          experiment_group_id?: string | null
          id?: string
          last_run_id?: string | null
          last_version_id?: string | null
          max_iterations?: number
          mutation_aggressiveness?: number
          stop_conditions?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_states_bot_id_fkey"
            columns: ["bot_id"]
            isOneToOne: true
            referencedRelation: "bots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_states_experiment_group_id_fkey"
            columns: ["experiment_group_id"]
            isOneToOne: false
            referencedRelation: "experiment_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_states_last_run_id_fkey"
            columns: ["last_run_id"]
            isOneToOne: false
            referencedRelation: "runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_states_last_version_id_fkey"
            columns: ["last_version_id"]
            isOneToOne: false
            referencedRelation: "bot_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      run_metrics: {
        Row: {
          avg_trade: number | null
          biggest_loss: number | null
          fees_paid: number | null
          gross_loss: number | null
          gross_profit: number | null
          id: string
          max_consecutive_losses: number | null
          max_drawdown: number | null
          median_trade: number | null
          net_pnl_points: number | null
          net_pnl_usd: number | null
          profit_factor: number | null
          run_id: string
          slippage_est: number | null
          trades_count: number | null
          updated_at: string
          win_rate: number | null
        }
        Insert: {
          avg_trade?: number | null
          biggest_loss?: number | null
          fees_paid?: number | null
          gross_loss?: number | null
          gross_profit?: number | null
          id?: string
          max_consecutive_losses?: number | null
          max_drawdown?: number | null
          median_trade?: number | null
          net_pnl_points?: number | null
          net_pnl_usd?: number | null
          profit_factor?: number | null
          run_id: string
          slippage_est?: number | null
          trades_count?: number | null
          updated_at?: string
          win_rate?: number | null
        }
        Update: {
          avg_trade?: number | null
          biggest_loss?: number | null
          fees_paid?: number | null
          gross_loss?: number | null
          gross_profit?: number | null
          id?: string
          max_consecutive_losses?: number | null
          max_drawdown?: number | null
          median_trade?: number | null
          net_pnl_points?: number | null
          net_pnl_usd?: number | null
          profit_factor?: number | null
          run_id?: string
          slippage_est?: number | null
          trades_count?: number | null
          updated_at?: string
          win_rate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "run_metrics_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: true
            referencedRelation: "runs"
            referencedColumns: ["id"]
          },
        ]
      }
      runs: {
        Row: {
          bot_version_id: string
          cost_model_json: string | null
          created_at: string
          dataset_id: string | null
          end_ts: string | null
          id: string
          paused_at: string | null
          run_type: string
          start_ts: string
          status: string
          stop_rule_json: string | null
        }
        Insert: {
          bot_version_id: string
          cost_model_json?: string | null
          created_at?: string
          dataset_id?: string | null
          end_ts?: string | null
          id?: string
          paused_at?: string | null
          run_type: string
          start_ts?: string
          status?: string
          stop_rule_json?: string | null
        }
        Update: {
          bot_version_id?: string
          cost_model_json?: string | null
          created_at?: string
          dataset_id?: string | null
          end_ts?: string | null
          id?: string
          paused_at?: string | null
          run_type?: string
          start_ts?: string
          status?: string
          stop_rule_json?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "runs_bot_version_id_fkey"
            columns: ["bot_version_id"]
            isOneToOne: false
            referencedRelation: "bot_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "runs_dataset_id_fkey"
            columns: ["dataset_id"]
            isOneToOne: false
            referencedRelation: "datasets"
            referencedColumns: ["id"]
          },
        ]
      }
      strategy_templates: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          param_schema_json: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id: string
          is_active?: boolean
          name: string
          param_schema_json: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          param_schema_json?: string
        }
        Relationships: []
      }
      trades: {
        Row: {
          created_at: string
          entry_price: number
          exit_price: number | null
          fees: number | null
          id: string
          pnl_points: number | null
          pnl_usd: number | null
          qty: number
          reason_code: string | null
          run_id: string
          side: string
          slippage: number | null
          ts_entry: string
          ts_exit: string | null
        }
        Insert: {
          created_at?: string
          entry_price: number
          exit_price?: number | null
          fees?: number | null
          id?: string
          pnl_points?: number | null
          pnl_usd?: number | null
          qty: number
          reason_code?: string | null
          run_id: string
          side: string
          slippage?: number | null
          ts_entry: string
          ts_exit?: string | null
        }
        Update: {
          created_at?: string
          entry_price?: number
          exit_price?: number | null
          fees?: number | null
          id?: string
          pnl_points?: number | null
          pnl_usd?: number | null
          qty?: number
          reason_code?: string | null
          run_id?: string
          side?: string
          slippage?: number | null
          ts_entry?: string
          ts_exit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trades_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "runs"
            referencedColumns: ["id"]
          },
        ]
      }
      tuning_jobs: {
        Row: {
          best_score: number | null
          bot_id: string
          champion_version_id: string | null
          constraints: Json
          created_at: string
          dataset_id: string | null
          id: string
          instruction_parsed_json: Json | null
          instructions: string | null
          max_trials: number
          objective_config: Json
          status: string
          test_pct: number
          train_pct: number
          trials_completed: number
          updated_at: string
          val_pct: number
        }
        Insert: {
          best_score?: number | null
          bot_id: string
          champion_version_id?: string | null
          constraints?: Json
          created_at?: string
          dataset_id?: string | null
          id?: string
          instruction_parsed_json?: Json | null
          instructions?: string | null
          max_trials?: number
          objective_config?: Json
          status?: string
          test_pct?: number
          train_pct?: number
          trials_completed?: number
          updated_at?: string
          val_pct?: number
        }
        Update: {
          best_score?: number | null
          bot_id?: string
          champion_version_id?: string | null
          constraints?: Json
          created_at?: string
          dataset_id?: string | null
          id?: string
          instruction_parsed_json?: Json | null
          instructions?: string | null
          max_trials?: number
          objective_config?: Json
          status?: string
          test_pct?: number
          train_pct?: number
          trials_completed?: number
          updated_at?: string
          val_pct?: number
        }
        Relationships: [
          {
            foreignKeyName: "tuning_jobs_bot_id_fkey"
            columns: ["bot_id"]
            isOneToOne: false
            referencedRelation: "bots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tuning_jobs_champion_version_id_fkey"
            columns: ["champion_version_id"]
            isOneToOne: false
            referencedRelation: "bot_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tuning_jobs_dataset_id_fkey"
            columns: ["dataset_id"]
            isOneToOne: false
            referencedRelation: "datasets"
            referencedColumns: ["id"]
          },
        ]
      }
      tuning_trials: {
        Row: {
          accepted: boolean
          base_version_id: string
          candidate_params: Json
          candidate_risk_limits: Json | null
          created_at: string
          id: string
          job_id: string
          reject_reason: string | null
          test_metrics: Json | null
          test_run_id: string | null
          test_score: number | null
          train_metrics: Json | null
          train_run_id: string | null
          train_score: number | null
          trial_number: number
          val_metrics: Json | null
          val_run_id: string | null
          val_score: number | null
        }
        Insert: {
          accepted?: boolean
          base_version_id: string
          candidate_params: Json
          candidate_risk_limits?: Json | null
          created_at?: string
          id?: string
          job_id: string
          reject_reason?: string | null
          test_metrics?: Json | null
          test_run_id?: string | null
          test_score?: number | null
          train_metrics?: Json | null
          train_run_id?: string | null
          train_score?: number | null
          trial_number: number
          val_metrics?: Json | null
          val_run_id?: string | null
          val_score?: number | null
        }
        Update: {
          accepted?: boolean
          base_version_id?: string
          candidate_params?: Json
          candidate_risk_limits?: Json | null
          created_at?: string
          id?: string
          job_id?: string
          reject_reason?: string | null
          test_metrics?: Json | null
          test_run_id?: string | null
          test_score?: number | null
          train_metrics?: Json | null
          train_run_id?: string | null
          train_score?: number | null
          trial_number?: number
          val_metrics?: Json | null
          val_run_id?: string | null
          val_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tuning_trials_base_version_id_fkey"
            columns: ["base_version_id"]
            isOneToOne: false
            referencedRelation: "bot_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tuning_trials_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "tuning_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tuning_trials_test_run_id_fkey"
            columns: ["test_run_id"]
            isOneToOne: false
            referencedRelation: "runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tuning_trials_train_run_id_fkey"
            columns: ["train_run_id"]
            isOneToOne: false
            referencedRelation: "runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tuning_trials_val_run_id_fkey"
            columns: ["val_run_id"]
            isOneToOne: false
            referencedRelation: "runs"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
