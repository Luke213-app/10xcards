/**
 * Local-Supabase wiring for the e2e suite.
 *
 * The dev server under test is re-pointed at the LOCAL Supabase stack (never the
 * remote/production project). The keys below are the well-known, deterministic
 * keys that `supabase start` mints for every local stack using the default JWT
 * secret — they are not real secrets and are safe to commit. CI (or a developer
 * with a non-default stack) can override any of them via the matching env var,
 * which is how the GitHub Actions job injects the values from `supabase status`.
 */

export const SUPABASE_API_URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";

export const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

export const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

/** Pinned dev-server origin — keep in sync with `webServer` / `baseURL` in playwright.config.ts. */
export const BASE_URL = "http://localhost:4321";

/**
 * Fixed test accounts. Created (idempotently) via the admin API in the seed
 * helper, so the same identities exist across local runs and in CI.
 */
export const USER_A = {
  email: "e2e-user-a@example.com",
  password: "e2e-test-password",
} as const;

export const USER_B = {
  email: "e2e-user-b@example.com",
  password: "e2e-test-password",
} as const;
