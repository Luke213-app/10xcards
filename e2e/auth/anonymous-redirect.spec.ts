/**
 * R#5, gate 1 (pages): every protected page, hit without a session, redirects to
 * the signin page. The middleware gate (`PROTECTED_ROUTES`, prefix match) is what
 * we're proving — including that a nested path (`/cards/new`) is caught by the
 * prefix, not just the bare route.
 *
 * Empty storageState opts this whole file out of User A's captured session, so
 * every navigation is genuinely anonymous.
 */
import { test, expect } from "@playwright/test";

test.use({ storageState: { cookies: [], origins: [] } });

// The four PROTECTED_ROUTES prefixes plus one nested path to prove prefix match.
const PROTECTED_PATHS = ["/dashboard", "/generate", "/cards", "/review", "/cards/new"];

for (const path of PROTECTED_PATHS) {
  test(`anonymous visit to ${path} redirects to signin`, async ({ page }) => {
    await page.goto(path);
    await expect(page).toHaveURL(/\/auth\/signin$/);
  });
}
