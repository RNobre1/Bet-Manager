"use server";

import { createClient } from "@/lib/supabase/server";

const ENTITIES = ["houses", "bets", "bet_selections", "transactions", "user_profile"] as const;
const ACTIONS = ["create", "update", "delete", "soft_delete", "restore"] as const;

function escapeCsv(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = typeof v === "string" ? v : JSON.stringify(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function exportAuditCsvAction(formData: FormData): Promise<{
  filename: string;
  csv: string;
}> {
  const entity = String(formData.get("entity") ?? "");
  const action = String(formData.get("action") ?? "");

  const supabase = await createClient();
  let q = supabase
    .from("audit_log")
    .select("occurred_at, entity_type, entity_id, action, before, after, context")
    .order("occurred_at", { ascending: false })
    .limit(5000);

  if (entity && (ENTITIES as readonly string[]).includes(entity)) {
    q = q.eq("entity_type", entity);
  }
  if (action && (ACTIONS as readonly string[]).includes(action)) {
    q = q.eq("action", action as (typeof ACTIONS)[number]);
  }

  const { data, error } = await q;
  if (error) throw new Error(error.message);

  const header = [
    "occurred_at",
    "entity_type",
    "entity_id",
    "action",
    "before",
    "after",
    "context",
  ];
  const rows = (data ?? []).map((r) =>
    [
      r.occurred_at,
      r.entity_type,
      r.entity_id ?? "",
      r.action,
      r.before,
      r.after,
      r.context,
    ]
      .map(escapeCsv)
      .join(","),
  );
  const csv = [header.join(","), ...rows].join("\n");

  const today = new Date().toISOString().slice(0, 10);
  const tag = entity || "all";
  return { filename: `abissal-audit-${tag}-${today}.csv`, csv };
}
