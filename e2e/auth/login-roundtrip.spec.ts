/**
 * R#5, the human path: the real auth forms work end-to-end. This is the one place
 * we drive the UI login rather than the fast programmatic `storageState` path.
 *
 * - Login: User A (created by the setup project) signs in via the form and lands
 *   on the dashboard with the authed-only account menu rendered.
 * - Signup: a fresh account registers → /auth/confirm-email, then (local Supabase
 *   has `enable_confirmations = false`, so the account is usable immediately) signs
 *   in successfully. The new user is removed in teardown to keep the DB clean.
 *
 * Empty storageState makes the whole file anonymous; selectors use roles/labels
 * (no test ids on the auth forms).
 */
import { test, expect, type Locator, type Page } from "@playwright/test";
import { USER_A } from "../support/local-supabase";
import { deleteUserByEmail } from "../support/seed";

test.use({ storageState: { cookies: [], origins: [] } });

/**
 * Fill a controlled (`client:load`) React input *after* the island has hydrated.
 *
 * The forms validate on submit against React state. Filling before React wires
 * its `onChange` sets the DOM value but leaves state empty, so the form's own
 * `validate()` calls `preventDefault()` and the native POST never fires (the page
 * just sits on `/auth/signin`). Gating on React's hydration marker (`__reactFiber`,
 * attached to a node only once React owns it) guarantees the fill reaches state.
 */
async function fillStable(field: Locator, value: string) {
  await field.evaluate(
    (el) =>
      new Promise<void>((resolve) => {
        const hydrated = () => Object.keys(el).some((k) => k.startsWith("__reactFiber"));
        const tick = () => {
          if (hydrated()) resolve();
          else requestAnimationFrame(tick);
        };
        tick();
      }),
  );
  await field.fill(value);
  await expect(field).toHaveValue(value);
}

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/auth/signin");
  await fillStable(page.getByLabel("Email"), email);
  await fillStable(page.getByLabel("Password", { exact: true }), password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

test("UI login round-trips to the dashboard", async ({ page }) => {
  await signIn(page, USER_A.email, USER_A.password);

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("button", { name: "Account menu" })).toBeVisible();
});

test.describe("signup round-trip", () => {
  // Unique per run so re-runs don't collide on an existing email.
  const email = `e2e-signup-${Date.now().toString()}@example.com`;
  const password = "e2e-test-password";

  test.afterAll(async () => {
    await deleteUserByEmail(email);
  });

  test("signup → confirm-email → login with the new account", async ({ page }) => {
    await page.goto("/auth/signup");
    await fillStable(page.getByLabel("Email"), email);
    await fillStable(page.getByLabel("Password", { exact: true }), password);
    await fillStable(page.getByLabel("Confirm password"), password);
    await page.getByRole("button", { name: "Create account" }).click();

    await expect(page).toHaveURL(/\/auth\/confirm-email$/);

    // Drop any session signup may have set, so the next step is a true login.
    await page.context().clearCookies();

    await signIn(page, email, password);

    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole("button", { name: "Account menu" })).toBeVisible();
  });
});
