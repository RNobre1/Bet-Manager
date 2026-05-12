import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fixturesForBrtDay } from "@/lib/fixtures/repository";
import { parseDateParam, todayBrt } from "@/lib/fixtures/time";
import { DateChips } from "@/components/fixtures/date-chips";
import { FixturesList } from "@/components/fixtures/fixtures-list";

interface FixturesPageProps {
  searchParams: Promise<{ date?: string }>;
}

/**
 * /fixtures — daily fixtures listing, grouped by league. Server Component.
 *
 * The `?date` param is the source of truth (today/tomorrow/YYYY-MM-DD). When
 * the param is missing OR invalid, we redirect to ?date=today so the URL stays
 * canonical (no implicit fallback in the rendering path). Fixtures are read
 * via the admin client because `fixtures` is shared reference data — RLS
 * isn't appropriate here; an authenticated viewer is all we need.
 */
export default async function FixturesPage({ searchParams }: FixturesPageProps) {
  const { date: rawDate } = await searchParams;
  const date = parseDateParam(rawDate ?? null);

  if (!date) {
    redirect(`/fixtures?date=today`);
  }

  // Auth gate — same posture as the (dashboard) group. /fixtures is outside
  // the (dashboard) layout but still personal; redirect to /login if logged out.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const admin = createAdminClient();
  const fixtures = await fixturesForBrtDay(date, admin);

  const todayIso = todayBrt();
  const tomorrowIso = parseDateParam("tomorrow") ?? todayIso;

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-12 lg:px-12 lg:py-16">
      <header className="mb-10 flex items-end justify-between gap-6">
        <div>
          <span className="label">fixtures</span>
          <h2 className="mt-2">jogos do dia</h2>
        </div>
      </header>

      <div className="mb-10">
        <DateChips
          selected={date}
          todayIso={todayIso}
          tomorrowIso={tomorrowIso}
        />
      </div>

      <FixturesList fixtures={fixtures} />
    </main>
  );
}
