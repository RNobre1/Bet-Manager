/**
 * Panel D — Head-to-head timeline.
 *
 * Renders up to 5 mini score-cards (newest-first, as choistats returns it)
 * plus an aggregate row: home wins · draws · away wins and BTTS count.
 *
 * The "perspective" is always the upcoming fixture's home/away teams (not
 * the H2H row's home/away — adamchoi flips them based on venue). To keep
 * the panel readable the labels reflect what each card actually shows
 * (score is rendered as `homeGoals - awayGoals` of THAT past match).
 */

import { PanelShell } from "@/components/fixtures/stats/panels/_shell";
import type { RawRecentMatch } from "@/lib/fixtures/stats/detail-json-types";

interface H2HProps {
  matches: RawRecentMatch[];
  homeTeam: string;
  awayTeam: string;
}

interface Aggregate {
  homeWins: number;
  draws: number;
  awayWins: number;
  btts: number;
}

function aggregate(matches: RawRecentMatch[], homeTeam: string, awayTeam: string): Aggregate {
  const agg: Aggregate = { homeWins: 0, draws: 0, awayWins: 0, btts: 0 };
  for (const m of matches) {
    const hg = m.homeGoalsFt;
    const ag = m.awayGoalsFt;
    if (hg > 0 && ag > 0) agg.btts++;
    // Map outcome to the FIXTURE perspective (home of the upcoming fixture).
    // If the match was played at the upcoming-home's venue, we already know
    // who won by sign(hg - ag). If venue was swapped, invert.
    const upcomingHomeWasHome = m.home_team === homeTeam;
    const upcomingAwayWasHome = m.home_team === awayTeam;
    if (hg === ag) {
      agg.draws++;
    } else if (hg > ag) {
      // home of the past match won
      if (upcomingHomeWasHome) agg.homeWins++;
      else if (upcomingAwayWasHome) agg.awayWins++;
      else agg.homeWins++; // fallback — preserve raw orientation
    } else {
      if (upcomingHomeWasHome) agg.awayWins++;
      else if (upcomingAwayWasHome) agg.homeWins++;
      else agg.awayWins++;
    }
  }
  return agg;
}

export function H2H({ matches, homeTeam, awayTeam }: H2HProps) {
  if (!Array.isArray(matches) || matches.length === 0) {
    return (
      <PanelShell title="H2H">
        <p className="text-[var(--color-ink-muted)]">
          nenhum confronto direto recente
        </p>
      </PanelShell>
    );
  }

  const cards = matches.slice(0, 5);
  const agg = aggregate(matches, homeTeam, awayTeam);

  return (
    <PanelShell title="H2H" eyebrow={`${matches.length} jogos`} gap={4}>
      <ol className="flex flex-wrap gap-2">
        {cards.map((m, idx) => (
          <li
            key={`${m.id ?? idx}`}
            data-h2h-card
            className="flex min-w-[6.5rem] flex-col gap-0.5 rounded-md bg-[var(--color-surface-2)] px-3 py-2"
          >
            <span className="label text-[var(--color-ink-faint)]">
              {m.date_iso}
            </span>
            <span className="num text-lg text-[var(--color-ink-display)]">
              {m.homeGoalsFt}-{m.awayGoalsFt}
            </span>
            <span className="label text-[10px] text-[var(--color-ink-faint)]">
              {m.home_team} vs {m.away_team}
            </span>
          </li>
        ))}
      </ol>

      <footer className="grid grid-cols-2 gap-2 text-sm">
        <div data-testid="h2h-aggregate" className="flex items-baseline gap-1">
          <span className="label text-[var(--color-ink-faint)]">V-E-D</span>
          <span className="num text-[var(--color-ink-display)]">
            {agg.homeWins}-{agg.draws}-{agg.awayWins}
          </span>
        </div>
        <div data-testid="h2h-btts" className="flex items-baseline gap-1">
          <span className="label text-[var(--color-ink-faint)]">BTTS</span>
          <span className="num text-[var(--color-ink-display)]">{agg.btts}</span>
        </div>
      </footer>
    </PanelShell>
  );
}
