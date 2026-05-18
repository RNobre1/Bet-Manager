/**
 * Task 3 — Snapshot idempotente dirigido por resolve_bet
 *
 * LIMITAÇÃO CONHECIDA (exceção consciente — ver CLAUDE.md Lesson B13):
 * A verificação comportamental de 0014_banca_loop.sql (snapshot idempotente
 * pós-resolve, assert de linha em balance_snapshots, geração real pela view)
 * exige um harness Postgres/Supabase local que NÃO existe neste repo.
 * O SQL foi auditado estaticamente pela spec-review e aprovado.
 * O follow-up está em docs/tasks/loop-banca/01-followup-sql-harness.md.
 *
 * O que este arquivo testa (app-side honesto):
 *   - `resolveBetAction` chama supabase.rpc("resolve_bet") com os parâmetros
 *     corretos quando o RPC resolve com sucesso.
 *   - Idempotência ao nível da action: segunda chamada com mesmo bet_id
 *     recebe o erro do Postgres e a action lança Error (não silencia).
 *
 * O que NÃO é testado aqui (por ausência de harness SQL):
 *   - Que resolve_bet realmente cria/atualiza o ledger no Postgres.
 *   - Que generate_balance_snapshots produz as linhas corretas.
 *   - Que ON CONFLICT DO UPDATE é idempotente contra um banco real.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const rpcMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    rpc: rpcMock,
  })),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("resolveBetAction — chama supabase.rpc('resolve_bet') sem erro", () => {
  it("resolve bet won sem actual_return explícito — RPC chamado com p_bet_id e p_status", async () => {
    rpcMock.mockResolvedValue({ data: null, error: null });

    const { resolveBetAction } = await import(
      "@/app/(dashboard)/bets/actions"
    );

    const formData = new FormData();
    formData.set("bet_id", "00000000-0000-0000-0000-000000000001");
    formData.set("status", "won");

    await expect(resolveBetAction(formData)).resolves.not.toThrow();

    expect(rpcMock).toHaveBeenCalledWith("resolve_bet", expect.objectContaining({
      p_bet_id: "00000000-0000-0000-0000-000000000001",
      p_status: "won",
    }));
  });

  it("resolve bet lost — RPC chamado com p_bet_id e p_status corretos", async () => {
    rpcMock.mockResolvedValue({ data: null, error: null });

    const { resolveBetAction } = await import(
      "@/app/(dashboard)/bets/actions"
    );

    const formData = new FormData();
    formData.set("bet_id", "00000000-0000-0000-0000-000000000002");
    formData.set("status", "lost");

    await expect(resolveBetAction(formData)).resolves.not.toThrow();

    expect(rpcMock).toHaveBeenCalledWith("resolve_bet", expect.objectContaining({
      p_bet_id: "00000000-0000-0000-0000-000000000002",
      p_status: "lost",
    }));
  });

  it("idempotência app-side: segunda chamada com mesmo bet_id recebe erro do Postgres e a action lança Error", async () => {
    // Este teste cobre a borda app-side da idempotência: a action NÃO silencia
    // o erro de "already resolved" — propaga como Error para o chamador.
    // A idempotência SQL real (ON CONFLICT DO UPDATE em balance_snapshots)
    // exige harness Postgres — ver limitação no cabeçalho deste arquivo.
    rpcMock
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({
        data: null,
        error: { message: "bet already resolved (current: won)" },
      });

    const { resolveBetAction } = await import(
      "@/app/(dashboard)/bets/actions"
    );

    const formData1 = new FormData();
    formData1.set("bet_id", "00000000-0000-0000-0000-000000000003");
    formData1.set("status", "won");

    await expect(resolveBetAction(formData1)).resolves.not.toThrow();

    const formData2 = new FormData();
    formData2.set("bet_id", "00000000-0000-0000-0000-000000000003");
    formData2.set("status", "won");

    await expect(resolveBetAction(formData2)).rejects.toThrow(
      "bet already resolved",
    );
  });

  it("action lança Error quando RPC retorna erro (não silencia falhas)", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: "invalid bet_id" },
    });

    const { resolveBetAction } = await import(
      "@/app/(dashboard)/bets/actions"
    );

    const formData = new FormData();
    formData.set("bet_id", "00000000-0000-0000-0000-000000000099");
    formData.set("status", "won");

    await expect(resolveBetAction(formData)).rejects.toThrow("invalid bet_id");
  });
});
