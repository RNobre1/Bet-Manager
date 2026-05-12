/**
 * Vitest setup file — populates the env vars that `lib/env.ts` validates
 * with Zod at import time. Without this, any test that (transitively)
 * imports a server-only module would crash with a ZodError before its own
 * `vi.stubEnv` / mocks get a chance to run.
 *
 * Individual tests can still override these via `vi.stubEnv(...)` plus
 * `vi.resetModules()` to re-import the route under specific conditions.
 *
 * `??=` preserves any value supplied by the shell — useful when running
 * a smoke test against a real Supabase project locally.
 */

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://test.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??= "test-publishable-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";
process.env.NEXT_PUBLIC_APP_URL ??= "http://localhost:3000";
process.env.ADAMCHOI_API_TOKEN ??= "test-adamchoi-token";
process.env.OPENROUTER_MODEL ??= "deepseek/deepseek-v3.2";
// OPENROUTER_API_KEY intentionally left unset so the "missing key → 503"
// path can be tested without explicit teardown.
