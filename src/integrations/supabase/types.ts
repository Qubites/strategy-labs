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
      bot_versions: {
        Row: {
          bot_id: string
          created_at: string
          id: string
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
          id?: string
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
          id?: string
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
          market_type: string
          session: string
          source: string
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
          market_type?: string
          session?: string
          source?: string
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
          market_type?: string
          session?: string
          source?: string
          start_ts?: string
          storage_path?: string | null
          symbol?: string
          timeframe?: string
        }
        Relationships: []
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
