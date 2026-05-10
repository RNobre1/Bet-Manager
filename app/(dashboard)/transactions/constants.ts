// Plain constants — must NOT live in actions.ts because that file is
// "use server" and Next.js only allows async-function exports there.
// Importing constants from a "use server" file ships an RPC handle to
// the client bundle, which then crashes when treated as data.
import type { Database } from "@/lib/supabase/types";

type TxDirection = Database["public"]["Enums"]["transaction_direction"];

export const MANUAL_KINDS = [
  "deposit",
  "withdrawal",
  "bonus_credit",
  "bonus_rollover",
  "fee",
  "adjustment_credit",
  "adjustment_debit",
] as const;

export const KIND_DIRECTION: Record<
  (typeof MANUAL_KINDS)[number],
  TxDirection
> = {
  deposit: "in",
  withdrawal: "out",
  bonus_credit: "in",
  bonus_rollover: "in",
  fee: "out",
  adjustment_credit: "in",
  adjustment_debit: "out",
};

export const MANUAL_KIND_LABELS: Record<
  (typeof MANUAL_KINDS)[number],
  string
> = {
  deposit: "Depósito",
  withdrawal: "Saque",
  bonus_credit: "Bônus (crédito)",
  bonus_rollover: "Liberação de rollover",
  fee: "Taxa",
  adjustment_credit: "Ajuste manual (crédito)",
  adjustment_debit: "Ajuste manual (débito)",
};
