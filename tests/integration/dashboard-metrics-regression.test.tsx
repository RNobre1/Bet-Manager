/**
 * Regressão: extração das métricas de app/(dashboard)/page.tsx para lib/banca/metrics.ts
 * não deve alterar nenhum valor exibido no dashboard.
 *
 * Dataset fixo determinístico:
 *   - 2 casas: Casa A (depósito R$1000, saque R$200, aposta ganhou R$300 de retorno por R$100 apostado)
 *              Casa B (depósito R$500, sem saque, aposta perdeu R$50 apostados)
 *   - bet_summary: resolved_staked=150, resolved_returned=300, won=1, lost=1
 *   - daily_pl: série [0, 50, 100, 60, 110] → drawdown = pico 100 → vale 60 = 40
 *
 * Cálculos manuais esperados:
 *   totalBalance    = (1000 - 200 + 300 - 100) + (500 - 50) = 1000 + 450 = 1450
 *   totalDeposits   = 1000 + 500 = 1500
 *   totalWithdrawals= 200 + 0 = 200
 *   netCapital      = 1500 - 200 = 1300
 *   cumulativePl    = 1450 - 1300 = 150
 *   roi             = 150/1300 ≈ 0.1153... → +11,54%
 *   yield           = (300 - 150) / 150 = 1.0 → +100,00%
 *   winRate         = 1 / (1+1) = 0.5 → 50,00%
 *   maxDrawdown     = 100 - 60 = 40
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";

// Sparkline usa SVG — não precisa de mock canvas, mas importamos aqui
// para evitar erros caso haja transitive imports problemáticos.

// ──────────────────────────────────────────────────────────────────────────────
// Dataset fixo
// ──────────────────────────────────────────────────────────────────────────────

const HOUSES = [
  {
    house_id: "uuid-a",
    user_id: "user-1",
    name: "Casa A",
    slug: "casa-a",
    color_hex: "#3b82f6",
    archived_at: null,
    balance: 1000,    // 1000 depósito - 200 saque + 300 retorno - 100 stake = 1000
    deposits: 1000,
    withdrawals: 200,
    staked: 100,
    returned: 300,
    pending_stake: 0,
    bet_count: 1,
  },
  {
    house_id: "uuid-b",
    user_id: "user-1",
    name: "Casa B",
    slug: "casa-b",
    color_hex: "#ef4444",
    archived_at: null,
    balance: 450,     // 500 depósito - 50 stake = 450
    deposits: 500,
    withdrawals: 0,
    staked: 50,
    returned: 0,
    pending_stake: 0,
    bet_count: 1,
  },
];

const SUMMARY = {
  user_id: "user-1",
  total_bets: 2,
  pending_count: 0,
  won_count: 1,
  lost_count: 1,
  void_count: 0,
  partial_count: 0,
  cashout_count: 0,
  resolved_staked: 150,
  resolved_returned: 300,
  pending_stake: 0,
};

// P/L acumulado — drawdown máximo: pico 100 (índice 2) → vale 60 (índice 3) = 40
const DAILY_PL = [
  { snapshot_date: "2026-05-01", cumulative_pl: 0 },
  { snapshot_date: "2026-05-02", cumulative_pl: 50 },
  { snapshot_date: "2026-05-03", cumulative_pl: 100 },
  { snapshot_date: "2026-05-04", cumulative_pl: 60 },
  { snapshot_date: "2026-05-05", cumulative_pl: 110 },
];

const TRANSACTIONS: unknown[] = [];

// ──────────────────────────────────────────────────────────────────────────────
// Mock Supabase — suporta o builder chain do dashboard
// ──────────────────────────────────────────────────────────────────────────────

type TableName = "house_balance_view" | "bet_summary_view" | "transactions" | "daily_pl_view";

function buildQueryBuilder(tableName: TableName) {
  let data: unknown = null;

  switch (tableName) {
    case "house_balance_view":
      data = HOUSES;
      break;
    case "bet_summary_view":
      data = SUMMARY;
      break;
    case "transactions":
      data = TRANSACTIONS;
      break;
    case "daily_pl_view":
      data = DAILY_PL;
      break;
  }

  const resolveData = data;

  const builder: Record<string, unknown> = {};
  // Todas as chamadas de chain retornam o mesmo builder
  builder.select = () => builder;
  builder.is = () => builder;
  builder.order = () => builder;
  builder.limit = () => builder;
  builder.eq = () => builder;
  // Terminais
  builder.maybeSingle = () =>
    Promise.resolve({ data: resolveData, error: null });
  // Promise.resolve direto (when awaited without terminal, treat as array result)
  builder.then = (resolve: (v: { data: unknown; error: null }) => unknown) =>
    Promise.resolve({ data: resolveData, error: null }).then(resolve);

  return builder;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: (table: TableName) => buildQueryBuilder(table),
  })),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/",
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

// ──────────────────────────────────────────────────────────────────────────────
// Import da página APÓS os mocks
// ──────────────────────────────────────────────────────────────────────────────

import OverviewPage from "@/app/(dashboard)/page";

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Dashboard — regressão de métricas (pré e pós extração para lib/banca/metrics)", () => {
  it("exibe ROI correto: cumulativePl=150, netCapital=1300 → +11,54%", async () => {
    const element = await OverviewPage();
    render(element);

    // roi = 150/1300 = 0.11538... → +11,54% (fmt.signedPercent)
    // Formato pt-BR: "+11,54%"
    expect(screen.getByText(/\+11,5[0-9]%/)).toBeDefined();
  });

  it("exibe yield correto: (300-150)/150 = 1.0 → +100,00%", async () => {
    const element = await OverviewPage();
    render(element);

    expect(screen.getByText("+100,00%")).toBeDefined();
  });

  it("exibe win rate correto: 1/(1+1) = 0.5 → 50,00%", async () => {
    const element = await OverviewPage();
    render(element);

    expect(screen.getByText("50,00%")).toBeDefined();
  });

  it("exibe drawdown máximo correto: pico 100 → vale 60 = 40", async () => {
    const element = await OverviewPage();
    render(element);

    // "drawdown máx: −40,00" — fmt.bare(40) = "40,00"
    expect(screen.getByText(/drawdown máx/i)).toBeDefined();
    expect(screen.getByText(/−40,00/)).toBeDefined();
  });

  it("exibe saldo total correto: 1000 + 450 = 1450", async () => {
    const element = await OverviewPage();
    render(element);

    // fmt.bare(1450) = "1.450,00"
    expect(screen.getByText("1.450,00")).toBeDefined();
  });
});
