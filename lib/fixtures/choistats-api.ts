/**
 * HTTP client for the choistats widget API used by Adamchoi detail pages.
 *
 * The choistats backend exposes per-fixture widgets behind a static token
 * (X-Adamchoi-Api-Token) and a Referer pin to https://www.adamchoi.co.uk/.
 * For a fixture id we fan-out 6 widget requests in parallel and merge the
 * JSON responses into a single payload that we store in `fixtures.detail_json`.
 *
 * The `predictions` widget can legitimately 404 (for fixtures without
 * predictions data); we tolerate it by setting `predictions: null`. All other
 * widgets must return 2xx — otherwise we surface an `UpstreamError`.
 */
export class UpstreamError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UpstreamError";
  }
}

export interface DetailPayload {
  recent_matches: unknown;
  team_records: unknown;
  players: unknown;
  chances: unknown;
  odds: unknown;
  predictions: unknown | null;
}

const BASE_URL = "https://api.choistats.com";
const REFERER = "https://www.adamchoi.co.uk/";

interface WidgetSpec {
  key: keyof DetailPayload;
  path: (id: number) => string;
  tolerate404?: boolean;
}

const WIDGETS: ReadonlyArray<WidgetSpec> = [
  { key: "recent_matches", path: (id) => `/api/widget/match/${id}/recent-results` },
  { key: "team_records", path: (id) => `/api/widget/match/${id}/team-records` },
  { key: "players", path: (id) => `/api/widget/match/${id}/players` },
  { key: "chances", path: (id) => `/api/widget/chances/fixture/${id}` },
  { key: "odds", path: (id) => `/api/widget/odds/fixture/${id}` },
  {
    key: "predictions",
    path: (id) => `/api/widget/predictions/fixture/${id}`,
    tolerate404: true,
  },
];

interface FetchFixtureOpts {
  token: string;
  fetcher?: typeof fetch;
}

/**
 * Fetch all six choistats widgets for a fixture and merge them. Throws
 * `UpstreamError` if any non-tolerated request errors out (network or non-2xx
 * status).
 */
export async function fetchFixtureDetail(
  id: number,
  opts: FetchFixtureOpts,
): Promise<DetailPayload> {
  const fetcher = opts.fetcher ?? fetch;
  const headers: HeadersInit = {
    "X-Adamchoi-Api-Token": opts.token,
    Referer: REFERER,
    Accept: "application/json",
  };

  const results = await Promise.all(
    WIDGETS.map(async (w) => {
      const url = `${BASE_URL}${w.path(id)}`;
      let response: Response;
      try {
        response = await fetcher(url, { method: "GET", headers });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new UpstreamError(`network error fetching ${w.key}: ${msg}`);
      }

      if (response.status === 404 && w.tolerate404) {
        return { key: w.key, value: null };
      }

      if (!response.ok) {
        throw new UpstreamError(
          `widget ${w.key} returned HTTP ${response.status}`,
        );
      }

      let body: unknown;
      try {
        body = await response.json();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new UpstreamError(`invalid JSON from ${w.key}: ${msg}`);
      }
      return { key: w.key, value: body };
    }),
  );

  const indexed: Record<string, unknown> = {
    recent_matches: undefined,
    team_records: undefined,
    players: undefined,
    chances: undefined,
    odds: undefined,
    predictions: null,
  };
  for (const { key, value } of results) {
    indexed[key] = value;
  }
  return indexed as unknown as DetailPayload;
}
