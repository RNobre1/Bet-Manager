import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import type { Database } from "@/lib/supabase/types";

/**
 * Server-only Supabase client using the service_role key. **Bypasses RLS.**
 * Used inside API route handlers for cross-user reads/writes (fixtures are
 * reference data shared across users) and inside the scraper context.
 *
 * Never import this from a Client Component or any code that ships to the
 * browser. If `SUPABASE_SERVICE_ROLE_KEY` is missing, throws — callers
 * should surface a 500 with a clear message.
 */
export function createAdminClient() {
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set — admin client unavailable",
    );
  }
  return createSupabaseClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
