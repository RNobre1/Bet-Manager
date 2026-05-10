/**
 * Generated via Supabase MCP `generate_typescript_types`.
 * Regenerate after migrations.
 */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: Database["public"]["Enums"]["audit_action"];
          after: Json | null;
          before: Json | null;
          context: Json | null;
          entity_id: string | null;
          entity_type: string;
          id: string;
          occurred_at: string;
          user_id: string | null;
        };
        Insert: {
          action: Database["public"]["Enums"]["audit_action"];
          after?: Json | null;
          before?: Json | null;
          context?: Json | null;
          entity_id?: string | null;
          entity_type: string;
          id?: string;
          occurred_at?: string;
          user_id?: string | null;
        };
        Update: {
          action?: Database["public"]["Enums"]["audit_action"];
          after?: Json | null;
          before?: Json | null;
          context?: Json | null;
          entity_id?: string | null;
          entity_type?: string;
          id?: string;
          occurred_at?: string;
          user_id?: string | null;
        };
        Relationships: [];
      };
      balance_snapshots: {
        Row: {
          balance: number;
          created_at: string | null;
          deposits_to_date: number;
          house_id: string;
          id: string;
          pending_stake: number;
          returned_to_date: number;
          snapshot_date: string;
          staked_to_date: number;
          user_id: string;
          withdrawals_to_date: number;
        };
        Insert: {
          balance: number;
          created_at?: string | null;
          deposits_to_date?: number;
          house_id: string;
          id?: string;
          pending_stake?: number;
          returned_to_date?: number;
          snapshot_date: string;
          staked_to_date?: number;
          user_id: string;
          withdrawals_to_date?: number;
        };
        Update: {
          balance?: number;
          created_at?: string | null;
          deposits_to_date?: number;
          house_id?: string;
          id?: string;
          pending_stake?: number;
          returned_to_date?: number;
          snapshot_date?: string;
          staked_to_date?: number;
          user_id?: string;
          withdrawals_to_date?: number;
        };
        Relationships: [];
      };
      bet_events: {
        Row: {
          bet_id: string;
          diff: Json | null;
          event_type: Database["public"]["Enums"]["bet_event_type"];
          from_status: Database["public"]["Enums"]["bet_status"] | null;
          id: string;
          occurred_at: string;
          to_status: Database["public"]["Enums"]["bet_status"] | null;
          trigger_source: string;
          user_id: string;
        };
        Insert: {
          bet_id: string;
          diff?: Json | null;
          event_type: Database["public"]["Enums"]["bet_event_type"];
          from_status?: Database["public"]["Enums"]["bet_status"] | null;
          id?: string;
          occurred_at?: string;
          to_status?: Database["public"]["Enums"]["bet_status"] | null;
          trigger_source?: string;
          user_id: string;
        };
        Update: {
          bet_id?: string;
          diff?: Json | null;
          event_type?: Database["public"]["Enums"]["bet_event_type"];
          from_status?: Database["public"]["Enums"]["bet_status"] | null;
          id?: string;
          occurred_at?: string;
          to_status?: Database["public"]["Enums"]["bet_status"] | null;
          trigger_source?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      bet_selections: {
        Row: {
          bet_id: string;
          created_at: string | null;
          event_date: string | null;
          event_label: string;
          id: string;
          market_id: string | null;
          odds: number;
          position_index: number;
          selection_label: string;
          sport_id: string | null;
          status: Database["public"]["Enums"]["bet_status"];
          user_id: string;
        };
        Insert: {
          bet_id: string;
          created_at?: string | null;
          event_date?: string | null;
          event_label: string;
          id?: string;
          market_id?: string | null;
          odds: number;
          position_index?: number;
          selection_label: string;
          sport_id?: string | null;
          status?: Database["public"]["Enums"]["bet_status"];
          user_id: string;
        };
        Update: {
          bet_id?: string;
          created_at?: string | null;
          event_date?: string | null;
          event_label?: string;
          id?: string;
          market_id?: string | null;
          odds?: number;
          position_index?: number;
          selection_label?: string;
          sport_id?: string | null;
          status?: Database["public"]["Enums"]["bet_status"];
          user_id?: string;
        };
        Relationships: [];
      };
      bets: {
        Row: {
          actual_return: number | null;
          created_at: string | null;
          expected_return: number;
          house_id: string;
          id: string;
          kind: Database["public"]["Enums"]["bet_kind"];
          note: string | null;
          placed_at: string;
          resolved_at: string | null;
          status: Database["public"]["Enums"]["bet_status"];
          tags: string[] | null;
          total_odds: number;
          total_stake: number;
          updated_at: string | null;
          user_id: string;
        };
        Insert: {
          actual_return?: number | null;
          created_at?: string | null;
          expected_return: number;
          house_id: string;
          id?: string;
          kind: Database["public"]["Enums"]["bet_kind"];
          note?: string | null;
          placed_at?: string;
          resolved_at?: string | null;
          status?: Database["public"]["Enums"]["bet_status"];
          tags?: string[] | null;
          total_odds: number;
          total_stake: number;
          updated_at?: string | null;
          user_id: string;
        };
        Update: {
          actual_return?: number | null;
          created_at?: string | null;
          expected_return?: number;
          house_id?: string;
          id?: string;
          kind?: Database["public"]["Enums"]["bet_kind"];
          note?: string | null;
          placed_at?: string;
          resolved_at?: string | null;
          status?: Database["public"]["Enums"]["bet_status"];
          tags?: string[] | null;
          total_odds?: number;
          total_stake?: number;
          updated_at?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
      houses: {
        Row: {
          archived_at: string | null;
          color_hex: string | null;
          created_at: string | null;
          id: string;
          name: string;
          notes_md: string | null;
          slug: string;
          updated_at: string | null;
          user_id: string;
          website_url: string | null;
        };
        Insert: {
          archived_at?: string | null;
          color_hex?: string | null;
          created_at?: string | null;
          id?: string;
          name: string;
          notes_md?: string | null;
          slug: string;
          updated_at?: string | null;
          user_id: string;
          website_url?: string | null;
        };
        Update: {
          archived_at?: string | null;
          color_hex?: string | null;
          created_at?: string | null;
          id?: string;
          name?: string;
          notes_md?: string | null;
          slug?: string;
          updated_at?: string | null;
          user_id?: string;
          website_url?: string | null;
        };
        Relationships: [];
      };
      markets: {
        Row: {
          created_at: string | null;
          description: string | null;
          id: string;
          name: string;
          slug: string;
        };
        Insert: {
          created_at?: string | null;
          description?: string | null;
          id?: string;
          name: string;
          slug: string;
        };
        Update: {
          created_at?: string | null;
          description?: string | null;
          id?: string;
          name?: string;
          slug?: string;
        };
        Relationships: [];
      };
      sports: {
        Row: {
          created_at: string | null;
          id: string;
          name: string;
          slug: string;
        };
        Insert: {
          created_at?: string | null;
          id?: string;
          name: string;
          slug: string;
        };
        Update: {
          created_at?: string | null;
          id?: string;
          name?: string;
          slug?: string;
        };
        Relationships: [];
      };
      transactions: {
        Row: {
          amount: number;
          created_at: string | null;
          currency: string;
          direction: Database["public"]["Enums"]["transaction_direction"];
          house_id: string;
          id: string;
          kind: Database["public"]["Enums"]["transaction_kind"];
          metadata: Json | null;
          note: string | null;
          occurred_at: string;
          related_bet_id: string | null;
          related_transaction_id: string | null;
          user_id: string;
        };
        Insert: {
          amount: number;
          created_at?: string | null;
          currency?: string;
          direction: Database["public"]["Enums"]["transaction_direction"];
          house_id: string;
          id?: string;
          kind: Database["public"]["Enums"]["transaction_kind"];
          metadata?: Json | null;
          note?: string | null;
          occurred_at?: string;
          related_bet_id?: string | null;
          related_transaction_id?: string | null;
          user_id: string;
        };
        Update: {
          amount?: number;
          created_at?: string | null;
          currency?: string;
          direction?: Database["public"]["Enums"]["transaction_direction"];
          house_id?: string;
          id?: string;
          kind?: Database["public"]["Enums"]["transaction_kind"];
          metadata?: Json | null;
          note?: string | null;
          occurred_at?: string;
          related_bet_id?: string | null;
          related_transaction_id?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
      user_profile: {
        Row: {
          created_at: string | null;
          default_currency: string;
          display_name: string | null;
          timezone: string;
          updated_at: string | null;
          user_id: string;
        };
        Insert: {
          created_at?: string | null;
          default_currency?: string;
          display_name?: string | null;
          timezone?: string;
          updated_at?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string | null;
          default_currency?: string;
          display_name?: string | null;
          timezone?: string;
          updated_at?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      bet_summary_view: {
        Row: {
          cashout_count: number | null;
          lost_count: number | null;
          partial_count: number | null;
          pending_count: number | null;
          pending_stake: number | null;
          resolved_returned: number | null;
          resolved_staked: number | null;
          total_bets: number | null;
          user_id: string | null;
          void_count: number | null;
          won_count: number | null;
        };
        Relationships: [];
      };
      daily_pl_view: {
        Row: {
          cumulative_pl: number | null;
          deposits_to_date: number | null;
          pending_stake: number | null;
          returned_to_date: number | null;
          snapshot_date: string | null;
          staked_to_date: number | null;
          total_balance: number | null;
          user_id: string | null;
          withdrawals_to_date: number | null;
        };
        Relationships: [];
      };
      house_balance_view: {
        Row: {
          archived_at: string | null;
          balance: number | null;
          bet_count: number | null;
          color_hex: string | null;
          deposits: number | null;
          house_id: string | null;
          name: string | null;
          pending_stake: number | null;
          returned: number | null;
          slug: string | null;
          staked: number | null;
          user_id: string | null;
          withdrawals: number | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      generate_balance_snapshots: {
        Args: { p_date?: string };
        Returns: number;
      };
      house_balance: {
        Args: { p_house_id: string; p_user_id: string };
        Returns: {
          balance: number;
          deposits_to_date: number;
          pending_stake: number;
          returned_to_date: number;
          staked_to_date: number;
          withdrawals_to_date: number;
        }[];
      };
    };
    Enums: {
      audit_action: "create" | "update" | "delete" | "soft_delete" | "restore";
      bet_event_type:
        | "placed"
        | "edited"
        | "resolved"
        | "voided"
        | "cashed_out"
        | "reopened";
      bet_kind: "single" | "multiple" | "system";
      bet_status:
        | "pending"
        | "won"
        | "lost"
        | "void"
        | "cashed_out"
        | "half_won"
        | "half_lost"
        | "partially_void";
      transaction_direction: "in" | "out";
      transaction_kind:
        | "deposit"
        | "withdrawal"
        | "bet_stake"
        | "bet_return"
        | "bonus_credit"
        | "bonus_rollover"
        | "fee"
        | "adjustment_credit"
        | "adjustment_debit"
        | "transfer_in"
        | "transfer_out";
    };
    CompositeTypes: Record<string, never>;
  };
};
