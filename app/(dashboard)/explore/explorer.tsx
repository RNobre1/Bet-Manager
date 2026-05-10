"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { loadExploreDataset, type ExploreDataset } from "./actions";

const SAMPLE_QUERIES: { label: string; sql: string }[] = [
  {
    label: "todas as apostas",
    sql: "SELECT placed_at::DATE AS dia, kind, status, total_stake, total_odds\nFROM bets\nORDER BY placed_at DESC\nLIMIT 50;",
  },
  {
    label: "P/L por casa",
    sql: "SELECT h.name AS casa,\n       COUNT(b.id) AS apostas,\n       ROUND(SUM(b.total_stake), 2) AS stake_total,\n       ROUND(SUM(COALESCE(b.actual_return, 0)) - SUM(b.total_stake), 2) AS pnl\nFROM bets b\nJOIN houses h ON h.id = b.house_id\nWHERE b.status NOT IN ('pending')\nGROUP BY h.name\nORDER BY pnl DESC;",
  },
  {
    label: "win rate por mês",
    sql: "SELECT date_trunc('month', placed_at) AS mes,\n       COUNT(*) FILTER (WHERE status IN ('won','half_won')) AS ganhas,\n       COUNT(*) FILTER (WHERE status IN ('lost','half_lost')) AS perdidas,\n       ROUND(\n         COUNT(*) FILTER (WHERE status IN ('won','half_won')) * 1.0\n         / NULLIF(COUNT(*) FILTER (WHERE status IN ('won','half_won','lost','half_lost')), 0),\n         3\n       ) AS win_rate\nFROM bets\nGROUP BY 1\nORDER BY 1 DESC;",
  },
  {
    label: "top 10 odds maiores",
    sql: "SELECT b.placed_at, h.name AS casa, b.total_odds, b.status, b.total_stake\nFROM bets b\nJOIN houses h ON h.id = b.house_id\nORDER BY b.total_odds DESC\nLIMIT 10;",
  },
];

type DuckRow = Record<string, unknown>;
type DuckResult = { columns: string[]; rows: DuckRow[] };

type DuckHandles = {
  conn: {
    query: (sql: string) => Promise<{ toArray: () => DuckRow[] }>;
    close: () => Promise<void>;
  };
};

export function Explorer() {
  const [status, setStatus] = useState<
    "idle" | "loading-data" | "loading-engine" | "ready" | "error"
  >("idle");
  const [error, setError] = useState<string | null>(null);
  const [dataset, setDataset] = useState<ExploreDataset | null>(null);
  const [sql, setSql] = useState<string>(SAMPLE_QUERIES[0].sql);
  const [result, setResult] = useState<DuckResult | null>(null);
  const [running, setRunning] = useState(false);
  const handlesRef = useRef<DuckHandles | null>(null);

  useEffect(() => {
    return () => {
      handlesRef.current?.conn.close().catch(() => {});
    };
  }, []);

  const initialize = useCallback(async () => {
    setError(null);
    setStatus("loading-data");
    try {
      const ds = await loadExploreDataset();
      setDataset(ds);

      setStatus("loading-engine");
      const duckdb = await import("@duckdb/duckdb-wasm");
      const bundle = await duckdb.selectBundle(duckdb.getJsDelivrBundles());
      const workerUrl = URL.createObjectURL(
        new Blob([`importScripts("${bundle.mainWorker}");`], {
          type: "text/javascript",
        }),
      );
      const worker = new Worker(workerUrl);
      const logger = new duckdb.ConsoleLogger();
      const db = new duckdb.AsyncDuckDB(logger, worker);
      await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
      URL.revokeObjectURL(workerUrl);

      const conn = await db.connect();

      // Register each table from a parquet-style INSERT — easier path: write
      // JSON to a virtual file, then read it via read_json_auto.
      async function loadTable(name: keyof ExploreDataset, rows: unknown[]) {
        if (!Array.isArray(rows) || rows.length === 0) {
          await conn.query(`CREATE TABLE ${name} (placeholder INTEGER);`);
          return;
        }
        const json = JSON.stringify(rows);
        await db.registerFileText(`${name}.json`, json);
        await conn.query(
          `CREATE TABLE ${name} AS SELECT * FROM read_json_auto('${name}.json');`,
        );
      }

      await loadTable("bets", ds.bets);
      await loadTable("bet_selections", ds.bet_selections);
      await loadTable("transactions", ds.transactions);
      await loadTable("houses", ds.houses);

      handlesRef.current = { conn };
      setStatus("ready");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("error");
    }
  }, []);

  const runQuery = useCallback(async () => {
    if (!handlesRef.current) return;
    setRunning(true);
    setError(null);
    try {
      const r = await handlesRef.current.conn.query(sql);
      const arr = r.toArray() as DuckRow[];
      const columns = arr.length > 0 ? Object.keys(arr[0]) : [];
      setResult({ columns, rows: arr });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setResult(null);
    } finally {
      setRunning(false);
    }
  }, [sql]);

  if (status === "idle") {
    return (
      <section className="card p-8">
        <span className="label">duckdb-wasm</span>
        <h3 className="mt-3 text-2xl">explore com SQL</h3>
        <p className="mt-3 max-w-prose text-sm text-[var(--color-ink-muted)]">
          Abre uma instância do DuckDB direto no seu navegador, carrega seus
          dados (apostas, transações, casas, seleções) como tabelas, e
          deixa você fazer perguntas em SQL. O download do motor é grande
          (~10 MB), por isso só roda quando você decide.
        </p>
        <div className="mt-6">
          <Button onClick={initialize}>↓ carregar motor + dados</Button>
        </div>
      </section>
    );
  }

  if (status === "loading-data" || status === "loading-engine") {
    return (
      <section className="card p-8">
        <p className="num text-sm text-[var(--color-ink-muted)]">
          {status === "loading-data"
            ? "buscando seus dados…"
            : "iniciando duckdb-wasm (≈10 MB)…"}
        </p>
      </section>
    );
  }

  if (status === "error") {
    return (
      <section className="card p-8">
        <p className="num text-sm" style={{ color: "var(--color-warning)" }}>
          falhou: {error}
        </p>
        <Button className="mt-4" variant="outline" onClick={initialize}>
          tentar de novo
        </Button>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <section>
        <span className="label">consultas prontas</span>
        <div className="mt-3 flex flex-wrap gap-2">
          {SAMPLE_QUERIES.map((s) => (
            <button
              key={s.label}
              type="button"
              onClick={() => setSql(s.sql)}
              className="rounded-[var(--radius-sm)] border border-[var(--color-line-strong)] px-3 py-1.5 text-xs uppercase tracking-[0.18em] text-[var(--color-ink-muted)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)]"
            >
              {s.label}
            </button>
          ))}
        </div>
      </section>

      <section>
        <span className="label">SQL</span>
        <textarea
          value={sql}
          onChange={(e) => setSql(e.target.value)}
          spellCheck={false}
          className="mt-2 min-h-[180px] w-full rounded-[var(--radius-sm)] border border-[var(--color-line-strong)] bg-[var(--color-surface-1)] p-4 font-mono text-sm text-[var(--color-ink)] outline-none focus:border-[var(--color-vermelho)]"
        />
        <div className="mt-3 flex items-center justify-between">
          <span className="num text-[10px] text-[var(--color-ink-faint)]">
            tabelas: bets · bet_selections · transactions · houses
          </span>
          <Button onClick={runQuery} disabled={running}>
            {running ? "executando…" : "▶ executar"}
          </Button>
        </div>
      </section>

      {error && (
        <p
          role="alert"
          className="num text-sm"
          style={{ color: "var(--color-warning)" }}
        >
          {error}
        </p>
      )}

      {result && (
        <section>
          <header className="mb-3 flex items-baseline justify-between">
            <span className="label">resultado</span>
            <span className="num text-xs text-[var(--color-ink-muted)]">
              {result.rows.length} {result.rows.length === 1 ? "linha" : "linhas"}
            </span>
          </header>
          {result.rows.length === 0 ? (
            <p className="card p-6 text-sm text-[var(--color-ink-muted)]">
              consulta válida, mas vazia.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-[var(--radius-sm)] border border-[var(--color-line)]">
              <table className="w-full border-collapse text-sm">
                <thead className="bg-[var(--color-surface-2)]">
                  <tr>
                    {result.columns.map((c) => (
                      <th
                        key={c}
                        className="num border-b border-[var(--color-line)] px-3 py-2 text-left text-[10px] uppercase tracking-[0.18em] text-[var(--color-ink-muted)]"
                      >
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.rows.slice(0, 500).map((r, i) => (
                    <tr
                      key={i}
                      className="border-b border-[var(--color-line-subtle)] last:border-0"
                    >
                      {result.columns.map((c) => (
                        <td
                          key={c}
                          className="num px-3 py-2 text-[var(--color-ink)]"
                        >
                          {formatCell(r[c])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {result.rows.length > 500 && (
                <p className="border-t border-[var(--color-line)] bg-[var(--color-surface-1)] px-3 py-2 text-xs italic text-[var(--color-ink-muted)]">
                  exibindo as primeiras 500 linhas — refine a query para ver
                  o restante.
                </p>
              )}
            </div>
          )}
        </section>
      )}

      {dataset && (
        <p className="num text-[10px] text-[var(--color-ink-faint)]">
          dataset capturado em{" "}
          {new Date(dataset.generatedAt).toLocaleString("pt-BR")} · bets:{" "}
          {dataset.bets.length} · selections: {dataset.bet_selections.length} ·
          transactions: {dataset.transactions.length} · houses:{" "}
          {dataset.houses.length}
        </p>
      )}
    </div>
  );
}

function formatCell(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "string") return v;
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : v.toFixed(2);
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "bigint") return v.toString();
  if (v instanceof Date) return v.toISOString();
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}
