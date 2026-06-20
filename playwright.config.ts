import { defineConfig, devices } from "@playwright/test";
import { BASE_URL, SUPABASE_API_URL, SUPABASE_ANON_KEY } from "./e2e/support/local-supabase";

/**
 * E2E config. The `webServer` boots the app's dev server and re-points it at the
 * LOCAL Supabase stack via `env` (this only sets env for the spawned process —
 * it never touches `.dev.vars`/`.env` on disk). The `setup` project authenticates
 * once and writes storageState that the chromium project reuses.
 */
export default defineConfig({
  testDir: "e2e",
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  // Restore the developer's .dev.vars after the run (the webServer command swaps
  // in local-Supabase creds before booting — see e2e/support/dev-vars.mjs).
  globalTeardown: "./e2e/global-teardown.mjs",
  projects: [
    { name: "setup", testMatch: /.*\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: "e2e/.auth/user.json" },
      dependencies: ["setup"],
    },
  ],
  webServer: {
    // `dev-vars.mjs apply` writes local-Supabase creds into .dev.vars BEFORE
    // `astro dev` boots (workerd reads .dev.vars, not process.env). The env below
    // feeds those creds to the apply step; globalTeardown restores the original.
    command: "node e2e/support/dev-vars.mjs apply && npm run dev -- --port 4321",
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
    env: {
      SUPABASE_URL: SUPABASE_API_URL,
      SUPABASE_KEY: SUPABASE_ANON_KEY,
    },
  },
});
