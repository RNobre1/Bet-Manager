"use server";

import { createClient } from "@/lib/supabase/server";

export type ExploreDataset = {
  bets: Array<Record<string, unknown>>;
  bet_selections: Array<Record<string, unknown>>;
  transactions: Array<Record<string, unknown>>;
  houses: Array<Record<string, unknown>>;
  generatedAt: string;
};

export async function loadExploreDataset(): Promise<ExploreDataset> {
  const supabase = await createClient();

  const [bets, selections, txs, houses] = await Promise.all([
    supabase
      .from("bets")
      .select(
        "id, house_id, kind, status, total_stake, total_odds, expected_return, actual_return, placed_at, resolved_at, note",
      )
      .order("placed_at", { ascending: false })
      .limit(5000),
    supabase
      .from("bet_selections")
      .select(
        "id, bet_id, position_index, event_label, selection_label, odds, status, sport_id, market_id, event_date",
      )
      .limit(20000),
    supabase
      .from("transactions")
      .select(
        "id, house_id, kind, direction, amount, occurred_at, related_bet_id, note",
      )
      .order("occurred_at", { ascending: false })
      .limit(20000),
    supabase
      .from("houses")
      .select("id, name, slug, color_hex, archived_at")
      .limit(500),
  ]);

  return {
    bets: bets.data ?? [],
    bet_selections: selections.data ?? [],
    transactions: txs.data ?? [],
    houses: houses.data ?? [],
    generatedAt: new Date().toISOString(),
  };
}
