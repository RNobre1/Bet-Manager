"use client";

/**
 * Wrapper client da simulação pré-jogo.
 *
 * Desktop (≥768px): card recolhido por default. PanelShell padrão + toggle
 * "▸ ver" / "▾ ocultar". Body (children) só montado quando expandido — perf
 * + alinhado com a intenção de "discoverable mas fora do caminho".
 * Mobile (<768px): renderiza children direto dentro de PanelShell (a aba
 * já é o gate de clique).
 *
 * SimulationPanel passa em modo chrome="bare" (sem PanelShell interno) —
 * a casca é provida AQUI, evitando card-in-card.
 */
import { useId, useState, useSyncExternalStore, type ReactNode } from "react";
import { PanelShell } from "@/components/fixtures/stats/panels/_shell";
import { InfoPopover } from "@/components/fixtures/stats/_primitives/info-popover";

const MOBILE_QUERY = "(max-width: 767.98px)";

function subscribe(query: string) {
  return (cb: () => void) => {
    if (typeof window === "undefined") return () => {};
    const mql = window.matchMedia(query);
    if (typeof mql.addEventListener === "function") {
      mql.addEventListener("change", cb);
      return () => mql.removeEventListener("change", cb);
    }
    const legacy = mql as unknown as {
      addListener?: (cb: () => void) => void;
      removeListener?: (cb: () => void) => void;
    };
    legacy.addListener?.(cb);
    return () => legacy.removeListener?.(cb);
  };
}

function useIsMobile(): boolean {
  return useSyncExternalStore(
    subscribe(MOBILE_QUERY),
    () =>
      typeof window === "undefined"
        ? false
        : window.matchMedia(MOBILE_QUERY).matches,
    () => false,
  );
}

function MonteCarloEyebrow() {
  return (
    <span className="inline-flex items-center gap-1.5">
      Monte Carlo
      <InfoPopover label="o que é a simulação pré-jogo">
        <p>
          Resultado de uma simulação Monte Carlo (10k iterações) computada no
          scraper a partir das médias de temporada. Mostra o placar mais
          provável, probabilidades de mercado e a alocação de eventos por
          jogador. Não é palpite do mercado nem opinião — é a distribuição do
          modelo.
        </p>
      </InfoPopover>
    </span>
  );
}

export function SimulationDisclosure({ children }: { children: ReactNode }) {
  const isMobile = useIsMobile();
  const [expanded, setExpanded] = useState(false);
  const regionId = useId();

  if (isMobile) {
    return (
      <PanelShell
        title="Simulação pré-jogo"
        gap={4}
        eyebrow={<MonteCarloEyebrow />}
      >
        {children}
      </PanelShell>
    );
  }

  return (
    <PanelShell
      title="Simulação pré-jogo"
      gap={4}
      eyebrow={
        <span className="inline-flex items-center gap-3">
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls={regionId}
            onClick={() => setExpanded((v) => !v)}
            className="label inline-flex items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--color-line)] px-2 py-1 text-[var(--color-ink-muted)] transition-colors hover:text-[var(--color-ink)] focus-visible:outline-2 focus-visible:outline-[var(--color-vermelho)]"
          >
            <span aria-hidden>{expanded ? "▾" : "▸"}</span>
            {expanded ? "ocultar" : "ver"}
          </button>
          <MonteCarloEyebrow />
        </span>
      }
    >
      <div id={regionId} hidden={!expanded}>
        {expanded ? children : null}
      </div>
    </PanelShell>
  );
}
