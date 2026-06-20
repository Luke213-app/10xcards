/**
 * R#4: the generate flow always reaches a terminal state and gives immediate
 * loading feedback — never an indefinite hang. We drive the React island through
 * every branch deterministically by stubbing `/api/generate` with `page.route`,
 * so the assertions are about the state machine (loading → review / empty / error),
 * not about timing or the real LLM.
 *
 * The default (authenticated) storageState applies — `/generate` is protected, so
 * the session is what lets the island render at all. The page opens in AI mode by
 * default (CreateCard), which is exactly the GenerateView we're exercising.
 */
import { test, expect, type Locator, type Page } from "@playwright/test";

/**
 * Fill the controlled source textarea only after React owns the node. Filling
 * before hydration sets the DOM value but never reaches state, so `canGenerate`
 * stays false and the submit button is disabled forever (mirrors the auth specs).
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

const SAMPLE_SOURCE = "Mitochondria are the powerhouse of the cell. The capital of France is Paris.";

async function submitGenerate(page: Page) {
  await page.goto("/generate");
  await fillStable(page.getByTestId("generate-source"), SAMPLE_SOURCE);
  await page.getByTestId("generate-submit").click();
}

test("loading: shows immediate progress feedback while the request is in flight", async ({ page }) => {
  // Hold the response open so the loading state is observable, then resolve it.
  await page.route("**/api/generate", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 500));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ candidates: [] }),
    });
  });

  await submitGenerate(page);

  await expect(page.getByTestId("generate-loading")).toBeVisible();
});

test("review: a non-empty candidate list lands in the review state", async ({ page }) => {
  const candidates = [
    { front: "What is the powerhouse of the cell?", back: "The mitochondria." },
    { front: "What is the capital of France?", back: "Paris." },
  ];
  await page.route("**/api/generate", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ candidates }),
    }),
  );

  await submitGenerate(page);

  const review = page.getByTestId("generate-review");
  await expect(review).toBeVisible();
  await expect(review.locator("li")).toHaveCount(candidates.length);
  // The first candidate's front renders into its (controlled) textarea.
  await expect(review.getByRole("textbox").first()).toHaveValue(candidates[0].front);
});

test("empty: zero candidates is a terminal empty state, not a hang", async ({ page }) => {
  await page.route("**/api/generate", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ candidates: [] }),
    }),
  );

  await submitGenerate(page);

  await expect(page.getByTestId("generate-empty")).toBeVisible();
  await expect(page.getByTestId("generate-loading")).toBeHidden();
});

test("error: a 502 lands in a terminal error state with a retry affordance", async ({ page }) => {
  await page.route("**/api/generate", (route) =>
    route.fulfill({
      status: 502,
      contentType: "application/json",
      body: JSON.stringify({ error: "Upstream failure" }),
    }),
  );

  await submitGenerate(page);

  await expect(page.getByTestId("generate-error")).toBeVisible();
  await expect(page.getByTestId("generate-retry")).toBeVisible();
});
