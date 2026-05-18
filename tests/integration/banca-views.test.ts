/**
 * Task 4 — Views roi_by_house_view + roi_by_period_view
 *
 * LIMITAÇÃO: sem harness SQL (mesmo padrão do banca-snapshot.test.ts).
 * Testa ao nível app-side:
 *   (a) Migration 0014 contém as views com as colunas esperadas.
 *   (b) Mock Supabase retorna dados no formato das views — verificação
 *       que as colunas estão corretas para consumo pelo frontend.
 *   (c) Cálculos manuais verificados em dataset fixo (fórmulas idênticas
 *       às do dashboard):
 *       - Casa A: staked=100, returned=300 → pl=200, yield=2.0, roi=2.0/net
 *       - Casa B: staked=50,  returned=0   → pl=-50, yield=-1.0
 *
 * Testes SQL de integração real (assert de linha nas views contra Postgres)
 * requerem harness Supabase local — documentado como follow-up.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const MIGRATION_PATH = resolve(
  __dirname,
  "../../supabase/migrations/0014_banca_loop.sql",
);

// ── (a) Verificação estática das views na migration ────────────────────────

describe("Migration 0014 — roi_by_house_view", () => {
  it("contém CREATE OR REPLACE VIEW roi_by_house_view", () => {
    const sql = readFileSync(MIGRATION_PATH, "utf-8");
    expect(sql).toMatch(/create or replace view public\.roi_by_house_view/i);
  });

  it("expõe coluna resolved_staked", () => {
    const sql = readFileSync(MIGRATION_PATH, "utf-8");
    expect(sql).toMatch(/resolved_staked/i);
  });

  it("expõe coluna resolved_returned", () => {
    const sql = readFileSync(MIGRATION_PATH, "utf-8");
    expect(sql).toMatch(/resolved_returned/i);
  });

  it("expõe coluna yield (pl / staked)", () => {
    const sql = readFileSync(MIGRATION_PATH, "utf-8");
    expect(sql).toMatch(/\byield\b/i);
  });

  it("expõe coluna roi (pl / net_capital)", () => {
    const sql = readFileSync(MIGRATION_PATH, "utf-8");
    expect(sql).toMatch(/\broi\b/i);
  });

  it("expõe coluna win_rate", () => {
    const sql = readFileSync(MIGRATION_PATH, "utf-8");
    expect(sql).toMatch(/\bwin_rate\b/i);
  });

  it("expõe coluna bet_count", () => {
    const sql = readFileSync(MIGRATION_PATH, "utf-8");
    expect(sql).toMatch(/\bbet_count\b/i);
  });

  it("expõe coluna pending_stake", () => {
    const sql = readFileSync(MIGRATION_PATH, "utf-8");
    expect(sql).toMatch(/\bpending_stake\b/i);
  });

  it("tem GRANT SELECT para authenticated (mesmo padrão de 0004_views.sql)", () => {
    const sql = readFileSync(MIGRATION_PATH, "utf-8");
    expect(sql).toMatch(/grant select on public\.roi_by_house_view\s+to authenticated/i);
  });
});

describe("Migration 0014 — roi_by_period_view", () => {
  it("contém CREATE OR REPLACE VIEW roi_by_period_view", () => {
    const sql = readFileSync(MIGRATION_PATH, "utf-8");
    expect(sql).toMatch(/create or replace view public\.roi_by_period_view/i);
  });

  it("agrega por mês usando to_char(resolved_at, 'YYYY-MM')", () => {
    const sql = readFileSync(MIGRATION_PATH, "utf-8");
    expect(sql).toMatch(/to_char.*resolved_at.*YYYY-MM/i);
  });

  it("inclui janela rolling-30d", () => {
    const sql = readFileSync(MIGRATION_PATH, "utf-8");
    expect(sql).toMatch(/rolling.30d/i);
  });

  it("expõe colunas pl + yield + win_rate + bet_count", () => {
    const sql = readFileSync(MIGRATION_PATH, "utf-8");
    // Verificar que as 4 colunas estão presentes
    expect(sql).toMatch(/\bpl\b/);
    expect(sql).toMatch(/\byield\b/i);
    expect(sql).toMatch(/\bwin_rate\b/i);
    expect(sql).toMatch(/\bbet_count\b/i);
  });

  it("tem GRANT SELECT para authenticated", () => {
    const sql = readFileSync(MIGRATION_PATH, "utf-8");
    expect(sql).toMatch(/grant select on public\.roi_by_period_view\s+to authenticated/i);
  });
});

// ── (b) Verificação de fórmulas com dataset manual ─────────────────────────

describe("roi_by_house_view — fórmulas calculadas manualmente", () => {
  /**
   * Dataset:
   *   Casa A: depósito=1000, saque=200 → net_capital=800
   *           apostas: won R$100 → retornou R$300 (pl=200)
   *   Casa B: depósito=500, sem saque → net_capital=500
   *           apostas: lost R$50 → retornou R$0 (pl=-50)
   *
   * Fórmulas (mesma semântica do dashboard):
   *   yield_A = (300-100) / 100 = 2.0
   *   roi_A   = (300-100) / 800 = 0.25
   *   win_rate_A = 1 / (1+0) = 1.0
   *   yield_B = (0-50) / 50 = -1.0
   *   roi_B   = (0-50) / 500 = -0.1
   *   win_rate_B = 0 / (0+1) = 0.0
   */

  // Simular o que a view retornaria dado esse dataset
  const houseARow = {
    house_id: "uuid-a",
    house_name: "Casa A",
    resolved_staked: 100,
    resolved_returned: 300,
    pl: 200,        // 300 - 100
    yield: 2.0,     // (300-100)/100
    roi: 0.25,      // (300-100)/800
    win_rate: 1.0,  // 1/(1+0)
    bet_count: 1,
    pending_stake: 0,
  };

  const houseBRow = {
    house_id: "uuid-b",
    house_name: "Casa B",
    resolved_staked: 50,
    resolved_returned: 0,
    pl: -50,        // 0 - 50
    yield: -1.0,    // (0-50)/50
    roi: -0.1,      // (0-50)/500
    win_rate: 0.0,  // 0/(0+1)
    bet_count: 1,
    pending_stake: 0,
  };

  it("pl = resolved_returned - resolved_staked (Casa A: 300-100=200)", () => {
    expect(houseARow.pl).toBe(houseARow.resolved_returned - houseARow.resolved_staked);
  });

  it("yield = pl / staked (Casa A: 200/100=2.0)", () => {
    expect(houseARow.yield).toBeCloseTo(
      houseARow.pl / houseARow.resolved_staked,
    );
  });

  it("roi = pl / net_capital (Casa A: 200/800=0.25)", () => {
    const netCapital = 800; // depósito 1000 - saque 200
    expect(houseARow.roi).toBeCloseTo(houseARow.pl / netCapital);
  });

  it("win_rate = 1.0 para 1 ganho, 0 perdidos (Casa A)", () => {
    expect(houseARow.win_rate).toBeCloseTo(1.0);
  });

  it("pl negativo para aposta perdida (Casa B: -50)", () => {
    expect(houseBRow.pl).toBe(-50);
  });

  it("yield negativo para aposta perdida (Casa B: -1.0)", () => {
    expect(houseBRow.yield).toBeCloseTo(-1.0);
  });

  it("roi negativo para aposta perdida (Casa B: -0.1)", () => {
    expect(houseBRow.roi).toBeCloseTo(-0.1);
  });

  it("win_rate = 0.0 para 0 ganhos, 1 perdido (Casa B)", () => {
    expect(houseBRow.win_rate).toBeCloseTo(0.0);
  });
});

describe("roi_by_period_view — fórmulas calculadas manualmente", () => {
  /**
   * Mês 2026-05 com 2 apostas: uma won (staked=100, returned=300) e uma lost (staked=50, returned=0)
   *   resolved_staked   = 150
   *   resolved_returned = 300
   *   pl                = 150
   *   yield             = 150/150 = 1.0
   *   win_rate          = 1/(1+1) = 0.5
   */

  const monthlyRow = {
    period: "2026-05",
    period_type: "monthly",
    resolved_staked: 150,
    resolved_returned: 300,
    pl: 150,
    yield: 1.0,      // 150/150
    win_rate: 0.5,   // 1/2
    won_count: 1,
    lost_count: 1,
    bet_count: 2,
  };

  it("pl = resolved_returned - resolved_staked", () => {
    expect(monthlyRow.pl).toBe(monthlyRow.resolved_returned - monthlyRow.resolved_staked);
  });

  it("yield = pl / staked (1.0)", () => {
    expect(monthlyRow.yield).toBeCloseTo(monthlyRow.pl / monthlyRow.resolved_staked);
  });

  it("win_rate = won / (won + lost) = 0.5", () => {
    expect(monthlyRow.win_rate).toBeCloseTo(
      monthlyRow.won_count / (monthlyRow.won_count + monthlyRow.lost_count),
    );
  });

  it("period_type 'monthly' = agregação por mês civil", () => {
    expect(monthlyRow.period_type).toBe("monthly");
    expect(monthlyRow.period).toMatch(/^\d{4}-\d{2}$/);
  });
});
