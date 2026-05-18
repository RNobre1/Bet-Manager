import { createAdminClient } from "@/lib/supabase/admin";
import {
  hitRate,
  calibrationBuckets,
  type ResolvedPrediction,
} from "@/lib/ai/calibration-metrics";

// Sempre fresco — métricas de calibração mudam a cada scrape.
export const dynamic = "force-dynamic";

interface PredRow {
  id: number;
  status: "pending" | "resolved" | "unresolvable";
  model: string | null;
  route: string;
  pred_confidence: number;
  correct_winner: boolean | null;
  correct_over_under: boolean | null;
}

export default async function CalibracaoPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as unknown as { from: (t: string) => any };
  let rows: PredRow[] = [];
  let queryError: string | null = null;
  try {
    const { data, error } = await admin
      .from("ai_predictions")
      .select(
        "id, status, model, route, pred_confidence, correct_winner, correct_over_under",
      )
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message ?? "failed to fetch ai_predictions");
    rows = (data ?? []) as PredRow[];
  } catch (err) {
    queryError = err instanceof Error ? err.message : "erro desconhecido";
  }

  const resolved = rows.filter((r) => r.status === "resolved");
  const pending = rows.filter((r) => r.status === "pending");
  const unresolvable = rows.filter((r) => r.status === "unresolvable");

  const resolvedForMetrics: Array<ResolvedPrediction & { pred_confidence: number }> =
    resolved.map((r) => ({
      correct_winner: r.correct_winner ?? false,
      correct_over_under: r.correct_over_under ?? false,
      // PostgREST pode devolver numeric como string — coerce explícito aqui
      // evita que calibrationBuckets zere todos os buckets silenciosamente.
      pred_confidence: Number(r.pred_confidence),
    }));

  const rates = hitRate(resolvedForMetrics);
  const buckets = calibrationBuckets(resolvedForMetrics);

  // Breakdown por modelo (apenas predições resolvidas)
  const byModel: Record<string, { total: number; correct: number }> = {};
  for (const r of resolved) {
    const key = abbreviateModel(r.model ?? "desconhecido");
    if (!byModel[key]) byModel[key] = { total: 0, correct: 0 };
    byModel[key].total += 1;
    if (r.correct_winner) byModel[key].correct += 1;
  }

  const isEmpty = rows.length === 0;

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-12 lg:px-12 lg:py-16">
      <header className="mb-8">
        <span className="label">calibração IA</span>
        <h2 className="mt-2">acerto e calibração do copilot</h2>
        <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
          predições do fixture-copilot vs. resultado real (placar final via choistats).
        </p>
      </header>

      {queryError && (
        <p
          className="card mb-8 p-4 text-sm"
          style={{ color: "var(--color-vermelho)" }}
          role="alert"
        >
          falha ao ler predições: {queryError}
        </p>
      )}

      {isEmpty ? (
        <p className="card mt-8 p-8 text-center text-sm italic text-[var(--color-ink-muted)]">
          sem predições ainda — faça perguntas ao fixture-copilot para gerar predições.
        </p>
      ) : (
        <>
          {/* Cards de resumo */}
          <SummaryCards
            resolved={resolved.length}
            pending={pending.length}
            unresolvable={unresolvable.length}
            rates={rates}
          />

          {/* Breakdown por modelo */}
          {Object.keys(byModel).length > 0 && (
            <section className="mt-10">
              <h3 className="mb-4 text-base font-semibold">acerto por modelo</h3>
              <ModelBreakdown byModel={byModel} />
            </section>
          )}

          {/* Curva de calibração */}
          {resolved.length > 0 && (
            <section className="mt-10">
              <h3 className="mb-4 text-base font-semibold">
                curva de calibração (confiança prevista vs. acerto real)
              </h3>
              <CalibrationBucketsTable buckets={buckets} />
            </section>
          )}
        </>
      )}
    </main>
  );
}

// ── componentes ───────────────────────────────────────────────────────────────

function SummaryCards({
  resolved,
  pending,
  unresolvable,
  rates,
}: {
  resolved: number;
  pending: number;
  unresolvable: number;
  rates: ReturnType<typeof hitRate>;
}) {
  const items: Array<{ label: string; value: string }> = [
    {
      label: "resolvidas",
      value: `${resolved}`,
    },
    {
      label: "pendente",
      value: `${pending}`,
    },
    {
      label: "irresolvável",
      value: `${unresolvable}`,
    },
    {
      label: "acerto winner",
      value: rates ? `${Math.round(rates.winner * 100)}%` : "—",
    },
    {
      label: "acerto over/under",
      value: rates ? `${Math.round(rates.overUnder * 100)}%` : "—",
    },
  ];

  return (
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
      {items.map((it) => (
        <div key={it.label} className="card flex flex-col gap-1 px-4 py-3">
          <dt className="label text-[var(--color-ink-faint)]">{it.label}</dt>
          <dd className="num text-base tabular-nums text-[var(--color-ink)]">
            {it.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function ModelBreakdown({
  byModel,
}: {
  byModel: Record<string, { total: number; correct: number }>;
}) {
  return (
    <div className="overflow-x-auto rounded-[var(--radius)] border border-[var(--color-line-subtle)]">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-[var(--color-line-subtle)] text-[var(--color-ink-faint)]">
            <Th>modelo</Th>
            <Th className="num text-right">predições</Th>
            <Th className="num text-right">acertos</Th>
            <Th className="num text-right">acerto %</Th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(byModel).map(([model, s]) => (
            <tr
              key={model}
              className="border-b border-[var(--color-line-subtle)] last:border-0"
            >
              <Td>{model}</Td>
              <Td className="num text-right tabular-nums">{s.total}</Td>
              <Td className="num text-right tabular-nums">{s.correct}</Td>
              <Td className="num text-right tabular-nums">
                {Math.round((s.correct / s.total) * 100)}%
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CalibrationBucketsTable({
  buckets,
}: {
  buckets: ReturnType<typeof calibrationBuckets>;
}) {
  return (
    <div className="overflow-x-auto rounded-[var(--radius)] border border-[var(--color-line-subtle)]">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-[var(--color-line-subtle)] text-[var(--color-ink-faint)]">
            <Th>faixa confiança</Th>
            <Th className="num text-right">n</Th>
            <Th className="num text-right">previsto (médio)</Th>
            <Th className="num text-right">realizado</Th>
          </tr>
        </thead>
        <tbody>
          {buckets.map((b, i) => (
            <tr
              key={i}
              className="border-b border-[var(--color-line-subtle)] last:border-0"
            >
              <Td className="text-[var(--color-ink-muted)]">
                {Math.round(b.range[0] * 100)}%–{Math.round(b.range[1] * 100)}%
              </Td>
              <Td className="num text-right tabular-nums">
                {b.n > 0 ? b.n : "—"}
              </Td>
              <Td className="num text-right tabular-nums">
                {b.n > 0 ? `${Math.round(b.predictedAvg * 100)}%` : "—"}
              </Td>
              <Td className="num text-right tabular-nums">
                {b.n > 0 ? `${Math.round(b.realizedAccuracy * 100)}%` : "—"}
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Th({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      scope="col"
      className={`px-3 py-2 text-[11px] font-normal uppercase tracking-[0.12em] ${className}`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <td className={`px-3 py-2 align-middle ${className}`}>{children}</td>;
}

function abbreviateModel(model: string): string {
  const parts = model.split("/");
  const last = parts[parts.length - 1] ?? model;
  return last.replace(/^deepseek-/, "").replace(/-/g, " ");
}
