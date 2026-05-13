/**
 * Shimmer skeleton used as the Suspense fallback for each panel slot.
 * Pure presentational component — no client state, safe to render in
 * Server Components.
 *
 * Height is configurable so the placeholder matches the resolved panel
 * dimension, preventing layout shift when the real content hydrates.
 */

interface PanelSkeletonProps {
  /** Pixel height; passed through to inline style so Tailwind doesn't
      need to know about every possible value. */
  h?: number;
  /** Optional grid-column placement (e.g. "span 12 / span 12"). */
  colSpan?: string;
  /** A11y label exposed via aria-label. */
  label?: string;
}

export function PanelSkeleton({
  h = 240,
  colSpan,
  label = "Carregando painel",
}: PanelSkeletonProps) {
  return (
    <div
      role="status"
      aria-label={label}
      data-testid="panel-skeleton"
      className="card relative overflow-hidden"
      style={{
        height: `${h}px`,
        gridColumn: colSpan,
      }}
    >
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(110deg, transparent 30%, rgba(255,255,255,0.04) 50%, transparent 70%)",
          backgroundSize: "200% 100%",
          animation: "stats-shimmer 1.4s ease-in-out infinite",
        }}
      />
      <style>{`
        @keyframes stats-shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
      <span className="sr-only">{label}</span>
    </div>
  );
}
