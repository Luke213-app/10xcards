import { test, expect } from "@playwright/test";

/**
 * Smoke test: proves the runner + dev server + auth wiring all work. The
 * chromium project reuses User A's captured storageState, so navigating to a
 * protected page must render it (not bounce to /auth/signin).
 */
test("authed dashboard renders", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/dashboard/);
});
