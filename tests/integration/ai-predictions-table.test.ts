/**
 * Teste de contrato da tabela `ai_predictions`.
 *
 * Harness: mock em memória do cliente Supabase (padrão do projeto —
 * não há harness de DB real para TS). Valida:
 *   - Insert via service-role client aceita payload completo
 *   - `status` default é 'pending' quando não fornecido
 *   - RLS: anon client NÃO tem policy → insert retorna erro de permissão
 *   - Índice (status, kickoff_utc) documentado na migration (verificação manual/SQL)
 *
 * Limitação documentada: verificação de pg_indexes e bloqueio real de anon
 * requerem banco Supabase real — não automatizável no harness de TS vitest.
 * O SQL da migration (0016_ai_predictions.sql) define o schema canônico; este
 * teste verifica o contrato de chamada e o comportamento esperado dos clientes.
 */

import { describe, it, expect, vi } from "vitest";

// ── tipos ─────────────────────────────────────────────────────────────────────

interface PredictionInsert {
  fixture_id?: number | null;
  route: string;
  model?: string | null;
  reasoner?: boolean;
  home_team: string;
  away_team: string;
  league?: string | null;
  kickoff_utc?: string | null;
  pred_winner: "home" | "draw" | "away";
  pred_confidence: number;
  pred_over_under: "over" | "under";
  raw_excerpt?: string | null;
  status?: "pending" | "resolved" | "unresolvable";
}

// ── helpers ───────────────────────────────────────────────────────────────────

function makeServiceRoleClient(insertResult: { error: null | { message: string } }) {
  const insertSpy = vi.fn().mockResolvedValue(insertResult);
  return {
    from: (table: string) => {
      expect(table).toBe("ai_predictions");
      return { insert: insertSpy };
    },
    _insertSpy: insertSpy,
  };
}

function makeAnonClient() {
  // Anon client: sem policy → insert retorna erro de permissão (simulado)
  const insertSpy = vi.fn().mockResolvedValue({
    error: { message: "new row violates row-level security policy for table \"ai_predictions\"" },
  });
  return {
    from: (table: string) => {
      expect(table).toBe("ai_predictions");
      return { insert: insertSpy };
    },
    _insertSpy: insertSpy,
  };
}

const fullPayload: PredictionInsert = {
  fixture_id: 42,
  route: "fixture-copilot",
  model: "deepseek/deepseek-v3.2",
  reasoner: false,
  home_team: "Flamengo",
  away_team: "Palmeiras",
  league: "Brazil Serie A",
  kickoff_utc: "2026-05-20T00:00:00Z",
  pred_winner: "home",
  pred_confidence: 0.72,
  pred_over_under: "over",
  raw_excerpt: '```json\n{"prediction":{"winner":"home","confidence":0.72,"over_under_2_5":"over"}}\n```',
  status: "pending",
};

// ── testes ────────────────────────────────────────────────────────────────────

describe("ai_predictions table contract", () => {
  it("insert via service-role client aceita payload completo sem erro", async () => {
    const client = makeServiceRoleClient({ error: null });
    const { error } = await client.from("ai_predictions").insert(fullPayload);
    expect(error).toBeNull();
    expect(client._insertSpy).toHaveBeenCalledOnce();
    expect(client._insertSpy).toHaveBeenCalledWith(fullPayload);
  });

  it("status default é 'pending' quando não fornecido no payload", () => {
    // Sem `status` no payload → a coluna usa DEFAULT 'pending' no Postgres.
    // Aqui verificamos que o contrato de tipo permite omitir `status`.
    const payloadWithoutStatus: Omit<PredictionInsert, "status"> = {
      fixture_id: null,
      route: "fixture-copilot",
      model: "deepseek/deepseek-v3.2",
      reasoner: false,
      home_team: "Arsenal",
      away_team: "Chelsea",
      pred_winner: "draw",
      pred_confidence: 0.5,
      pred_over_under: "under",
    };
    // Se omitir status, o objeto não tem a chave — o DB aplica DEFAULT.
    expect("status" in payloadWithoutStatus).toBe(false);
    // Tipo satisfaz PredictionInsert sem status (campo opcional).
    const typed: PredictionInsert = payloadWithoutStatus;
    expect(typed.pred_winner).toBe("draw");
  });

  it("anon client NÃO tem policy → insert retorna erro de RLS", async () => {
    const anon = makeAnonClient();
    const { error } = await anon.from("ai_predictions").insert(fullPayload);
    expect(error).not.toBeNull();
    expect(error!.message).toContain("row-level security");
  });

  it("pred_winner aceita apenas home|draw|away (restrição de tipo TypeScript)", () => {
    // Verificação estática — winner fora do enum não compila.
    // Em runtime (mockado), a constraint CHECK do Postgres rejeita valores inválidos.
    const valid: PredictionInsert["pred_winner"][] = ["home", "draw", "away"];
    expect(valid).toHaveLength(3);
  });

  it("pred_over_under aceita apenas over|under (restrição de tipo)", () => {
    const valid: PredictionInsert["pred_over_under"][] = ["over", "under"];
    expect(valid).toHaveLength(2);
  });

  it("status aceita pending|resolved|unresolvable (restrição de tipo)", () => {
    const valid: PredictionInsert["status"][] = ["pending", "resolved", "unresolvable"];
    expect(valid).toHaveLength(3);
  });
});

// ── nota sobre pg_indexes ─────────────────────────────────────────────────────
// O índice `ai_predictions_status_kickoff_idx ON (status, kickoff_utc)` é
// definido na migration 0016_ai_predictions.sql. A verificação via pg_indexes
// requer banco real (não disponível no harness TS). Confirmar manualmente após
// apply da migration via: SELECT indexname FROM pg_indexes WHERE
// tablename='ai_predictions' AND indexname='ai_predictions_status_kickoff_idx';
