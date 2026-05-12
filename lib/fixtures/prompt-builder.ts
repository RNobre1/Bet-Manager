import type { FixtureRow } from "@/lib/fixtures/types";

/**
 * Builds the system prompt for OpenRouter from a fixture's `detail_json`.
 * Spirit ported from `adam-stats/lib/api/prompt_builder.rb` — kept concise:
 * we serialize the highest-signal sections (team record, recent matches,
 * H2H, streaks summary, predictions) into plain text the LLM can read.
 *
 * The system prompt frames the agent (pre-game stats analyst, BR-PT,
 * disciplined about small samples + regression to the mean) and includes
 * the full data block.
 */

const SYSTEM_HEADER = `Você é um analista estatístico de futebol focado em análise pré-jogo.
Use SOMENTE os dados fornecidos abaixo (estatísticas pré-jogo de cada time) para construir sua análise.
Não invente jogadores, escalações, lesões ou históricos que não estejam explicitamente nos dados.
Quando não tiver dado suficiente, diga isso explicitamente.

Foque em: tendências (over/under, BTTS, cards, corners), confronto direto quando disponível,
e implicações pra apostas pré-jogo. Responda em português do Brasil, em markdown, com seções curtas e claras.

Convenções de leitura:
- Listas de jogos recentes e H2H estão em ordem do MAIS RECENTE para o MAIS ANTIGO.
- "form" do time foi invertido para newest-first.
- Predictions do adamchoi aparecem por último (referência) — forme opinião a partir dos dados crus antes.

Disciplina estatística obrigatória:
- Regressão à média: sequências extremas (≥85% ou ≤15%) ou amostras pequenas (<10) devem ser sinalizadas como prováveis de normalizar.
- Amostras pequenas: ratios X/Y com Y<10 merecem peso reduzido — diga "amostra pequena" ao citar.
- Calibração de confiança: cada palpite final declara confiança (baixa | média | alta) + 1 frase de "risco contrário: ...".`;

/**
 * Build the full system prompt (header + fixture context block).
 */
export function buildSystemPrompt(fixture: FixtureRow): string {
  const ctx = buildContextBlock(fixture);
  return `${SYSTEM_HEADER}\n\n--- DADOS DO JOGO ---\n${ctx}`;
}

/**
 * Default user message when the client doesn't send a question.
 */
export const DEFAULT_USER_PROMPT =
  "Faça uma análise pré-jogo objetiva a partir dos dados acima. " +
  "Considere amostras (X/Y), recortes em casa/fora, forma recente, H2H, streaks e odds. " +
  "Identifique conflitos entre tendências e dê implicações pra apostas.";

function buildContextBlock(fixture: FixtureRow): string {
  const detail = (fixture.detail_json ?? {}) as Record<string, unknown>;
  const lines: string[] = [];
  lines.push(`Jogo: ${fixture.home_team} (casa) vs ${fixture.away_team} (visitante)`);
  if (fixture.league) lines.push(`Liga: ${fixture.league}`);
  lines.push(
    `Data: ${fixture.match_date}${fixture.ko_time ? ` às ${fixture.ko_time}` : ""}`,
  );

  appendSection(lines, formatTeamRecord(detail.team_record, fixture));
  appendSection(lines, formatRecentMatches(detail.recent_matches, fixture));
  appendSection(lines, formatH2h(detail.h2h));
  appendSection(lines, formatStreaks(detail.streaks, fixture));
  appendSection(lines, formatPredictions(detail.predictions));

  return lines.join("\n");
}

function appendSection(lines: string[], text: string | null): void {
  if (text === null || text.length === 0) return;
  lines.push("");
  lines.push(text);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

interface TeamRecordSlot {
  position?: number;
  played?: number;
  won?: number;
  draw?: number;
  lost?: number;
  goals_for?: number;
  goals_against?: number;
  points?: number;
  points_per_game?: number;
  form?: string[];
}

function formatTeamRecord(value: unknown, fixture: FixtureRow): string | null {
  const record = asRecord(value);
  if (!record) return null;
  const home = asRecord(record.home);
  const away = asRecord(record.away);

  const out: string[] = ["Forma e classificação:"];
  if (home) {
    const overall = asRecord(home.overall) as TeamRecordSlot | null;
    const sliced = asRecord(home.home) as TeamRecordSlot | null;
    if (overall)
      out.push(
        `  ${fixture.home_team} (geral): ${formatRecordLine(overall)}`,
      );
    if (sliced)
      out.push(
        `  ${fixture.home_team} (em casa): ${formatRecordLine(sliced)}`,
      );
  }
  if (away) {
    const overall = asRecord(away.overall) as TeamRecordSlot | null;
    const sliced = asRecord(away.away) as TeamRecordSlot | null;
    if (overall)
      out.push(
        `  ${fixture.away_team} (geral): ${formatRecordLine(overall)}`,
      );
    if (sliced)
      out.push(
        `  ${fixture.away_team} (fora): ${formatRecordLine(sliced)}`,
      );
  }
  return out.length > 1 ? out.join("\n") : null;
}

function formatRecordLine(rec: TeamRecordSlot): string {
  // adamchoi devolve form em ordem oldest→newest; invertemos para newest-first.
  const form = Array.isArray(rec.form) ? [...rec.form].reverse().join(" ") : "?";
  return (
    `${rec.position ?? "?"} · ${rec.played ?? "?"}j ` +
    `${rec.won ?? "?"}W ${rec.draw ?? "?"}D ${rec.lost ?? "?"}L · ` +
    `${rec.goals_for ?? "?"}GF/${rec.goals_against ?? "?"}GA · ` +
    `${rec.points ?? "?"}pts (${rec.points_per_game ?? "?"}ppg) · ` +
    `forma [mais recente → mais antigo]: ${form}`
  );
}

interface RecentMatch {
  date_iso?: string;
  home_team?: string;
  away_team?: string;
  homeGoalsFt?: number;
  awayGoalsFt?: number;
  homeCorners?: number;
  awayCorners?: number;
}

const RECENT_MATCHES_PER_TEAM = 5;

function formatRecentMatches(
  value: unknown,
  fixture: FixtureRow,
): string | null {
  const record = asRecord(value);
  if (!record) return null;
  const homeArr = asArray(record.home).slice(0, RECENT_MATCHES_PER_TEAM) as RecentMatch[];
  const awayArr = asArray(record.away).slice(0, RECENT_MATCHES_PER_TEAM) as RecentMatch[];
  if (homeArr.length === 0 && awayArr.length === 0) return null;

  const out: string[] = ["Últimos jogos (mais recente → mais antigo):"];
  if (homeArr.length > 0) {
    out.push(`  ${fixture.home_team} (em casa, últimos ${homeArr.length}):`);
    for (const m of homeArr) out.push(`    ${formatMatchLine(m)}`);
  }
  if (awayArr.length > 0) {
    out.push(`  ${fixture.away_team} (fora, últimos ${awayArr.length}):`);
    for (const m of awayArr) out.push(`    ${formatMatchLine(m)}`);
  }
  return out.join("\n");
}

function formatMatchLine(m: RecentMatch): string {
  const date = m.date_iso ?? "?";
  const ht = m.home_team ?? "?";
  const at = m.away_team ?? "?";
  const score = `${m.homeGoalsFt ?? "?"}-${m.awayGoalsFt ?? "?"}`;
  const corners =
    m.homeCorners != null && m.awayCorners != null
      ? ` · cantos ${m.homeCorners}-${m.awayCorners}`
      : "";
  return `${date} ${ht} ${score} ${at}${corners}`;
}

function formatH2h(value: unknown): string | null {
  const arr = asArray(value).slice(0, 8) as RecentMatch[];
  if (arr.length === 0) return null;
  const out: string[] = [
    "H2H (confronto direto, mais recente → mais antigo):",
  ];
  for (const m of arr) out.push(`  ${formatMatchLine(m)}`);
  return out.join("\n");
}

interface Streak {
  desc?: string;
  stat_type?: string;
  overall_perc?: number;
  home_perc?: number;
  away_perc?: number;
  home_streak?: number;
  away_streak?: number;
  group?: string;
}

const STREAKS_PER_SIDE = 8;

function formatStreaks(value: unknown, fixture: FixtureRow): string | null {
  const record = asRecord(value);
  if (!record) return null;
  const homeArr = asArray(record.home) as Streak[];
  const awayArr = asArray(record.away) as Streak[];
  if (homeArr.length === 0 && awayArr.length === 0) return null;
  const out: string[] = [
    "Streaks (top por intensidade — streak * 5 + |perc − 50|):",
  ];
  appendStreaksSide(out, homeArr, fixture.home_team);
  appendStreaksSide(out, awayArr, fixture.away_team);
  return out.length > 1 ? out.join("\n") : null;
}

function appendStreaksSide(out: string[], arr: Streak[], label: string): void {
  if (arr.length === 0) return;
  const ranked = [...arr]
    .sort((a, b) => streakSignal(b) - streakSignal(a))
    .slice(0, STREAKS_PER_SIDE);
  out.push(`  ${label}:`);
  for (const s of ranked) out.push(`    ${formatStreakLine(s)}`);
}

function streakSignal(s: Streak): number {
  const perc = s.overall_perc ?? 50;
  const streak = s.overall_perc != null
    ? s.home_streak ?? s.away_streak ?? 0
    : 0;
  return streak * 5 + Math.abs(perc - 50);
}

function formatStreakLine(s: Streak): string {
  const desc = s.desc ?? s.stat_type ?? "?";
  const bits: string[] = [];
  if (s.overall_perc != null) bits.push(`geral ${s.overall_perc}%`);
  if (s.home_perc != null) bits.push(`casa ${s.home_perc}%`);
  if (s.away_perc != null) bits.push(`fora ${s.away_perc}%`);
  const streakCount = s.home_streak ?? s.away_streak ?? 0;
  if (streakCount > 0) bits.push(`atual sequência ${streakCount}`);
  return `${desc}${bits.length ? ` — ${bits.join(" / ")}` : ""}`;
}

interface Prediction {
  stat_type?: string;
  chance?: number;
  chance_team?: string;
  best_odds?: number;
}

function formatPredictions(value: unknown): string | null {
  const arr = asArray(value).slice(0, 5) as Prediction[];
  if (arr.length === 0) return null;
  const out: string[] = [
    "Predictions adamchoi (referência; forme opinião antes de comparar):",
  ];
  for (const p of arr) {
    const team = p.chance_team ? ` (${p.chance_team})` : "";
    const odds =
      typeof p.best_odds === "number" ? ` | odds ${p.best_odds.toFixed(2)}` : "";
    out.push(`  ${p.stat_type ?? "?"}${team}: chance ${p.chance ?? "?"}%${odds}`);
  }
  return out.join("\n");
}
