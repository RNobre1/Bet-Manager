export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-16 md:px-12 md:py-24 lg:px-20">
      <header className="flex items-baseline justify-between">
        <span className="label">Abissal · gestão de banca</span>
        <span className="label">v0.1 · pré-MVP</span>
      </header>

      <section className="mt-24 flex-1 md:mt-40">
        <p className="label mb-8">o que sustenta o que sustenta você</p>

        <h1 className="text-[var(--color-ink-display)]">
          banca,
          <br />
          <span className="italic font-[400] text-[var(--color-vermelho)]">
            habitada.
          </span>
        </h1>

        <p
          className="mt-12 max-w-2xl text-lg leading-relaxed text-[var(--color-ink)] md:text-xl"
          style={{ fontFamily: "var(--font-body)" }}
        >
          Você gerencia múltiplas casas, registra cada movimento, vê a banca
          evoluir. Tudo rastreável. Nada se perde no escuro.
        </p>
      </section>

      <section className="mt-24 grid grid-cols-1 gap-px overflow-hidden rounded-[var(--radius)] border border-[var(--color-line)] bg-[var(--color-line)] md:grid-cols-3">
        {[
          {
            label: "saldo total",
            value: "12.487,30",
            unit: "BRL",
            tone: "ink",
          },
          {
            label: "rOI 30d",
            value: "+8,42",
            unit: "%",
            tone: "depth",
          },
          {
            label: "drawdown atual",
            value: "−3,18",
            unit: "%",
            tone: "vermelho",
          },
        ].map((m) => (
          <div
            key={m.label}
            className="flex flex-col gap-3 bg-[var(--color-surface-2)] p-6"
          >
            <span className="label">{m.label}</span>
            <div className="flex items-baseline gap-2">
              <span
                className="num text-3xl md:text-4xl"
                style={{
                  color:
                    m.tone === "depth"
                      ? "var(--color-depth-hi)"
                      : m.tone === "vermelho"
                        ? "var(--color-vermelho-hi)"
                        : "var(--color-ink-display)",
                }}
              >
                {m.value}
              </span>
              <span className="num text-sm text-[var(--color-ink-muted)]">
                {m.unit}
              </span>
            </div>
          </div>
        ))}
      </section>

      <footer className="mt-24 flex items-baseline justify-between border-t border-[var(--color-line-subtle)] pt-6">
        <span className="label">design system · Abismo Habitado</span>
        <span className="label">próximo: schema + auth</span>
      </footer>
    </main>
  );
}
