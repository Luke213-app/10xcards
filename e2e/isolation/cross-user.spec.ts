/**
 * R#1 — cross-user isolation (IDOR / RLS) at the API level.
 *
 * The browser cannot even reach another user's card (`/cards` lists only the
 * caller's own rows, and there is no `GET /api/flashcards/[id]`), so the real
 * signal lives one layer down: raw authenticated calls as User A against a card
 * owned by User B. RLS scopes every query to `auth.uid()`, so B's row is simply
 * invisible to A — every mutating verb must return **404 "Flashcard not found"**
 * (indistinguishable from "missing", so no ownership is leaked), and B's row must
 * be left byte-for-byte unchanged.
 *
 * Bodies are deliberately *valid* (a real patch / a real grade) so the request
 * clears schema validation and reaches the RLS-backed lookup — that 404 is the
 * thing under test, not a 400. The `Origin` header is load-bearing on every
 * programmatic write (Astro's CSRF origin check 403s otherwise).
 *
 * This file opts out of the project's User-A storageState and logs User A in
 * explicitly, so the authenticated identity is self-evident from the test rather
 * than implied by the shared fixture.
 */
import { test, expect, type APIRequestContext } from "@playwright/test";
import { BASE_URL } from "../support/local-supabase";
import { ensureTestUsers, seedFlashcard, getFlashcard, type SeededFlashcard } from "../support/seed";

test.use({ storageState: { cookies: [], origins: [] } });

const ORIGINAL = { front: "User B private front", back: "User B private back" } as const;
const NOT_FOUND = { error: "Flashcard not found" } as const;

test.describe.configure({ mode: "serial" });

test.describe("R#1 cross-user isolation", () => {
  let card: SeededFlashcard;
  let asUserA: APIRequestContext;

  test.beforeAll(async ({ playwright }) => {
    const { a, b } = await ensureTestUsers();
    // Plant User B's card with service_role + explicit user_id (RLS bypass).
    card = await seedFlashcard(b.id, { ...ORIGINAL });

    // Build a request context authenticated as User A by logging in for real.
    asUserA = await playwright.request.newContext({ baseURL: BASE_URL });
    const login = await asUserA.post("/api/auth/signin", {
      form: { email: a.email, password: a.password },
      headers: { Origin: BASE_URL },
      maxRedirects: 0,
    });
    expect(login.status()).toBe(302);
    expect(login.headers().location).toBe("/dashboard");
  });

  test.afterAll(async () => {
    await asUserA.dispose();
  });

  test("PATCH on User B's card is 404 for User A", async () => {
    const res = await asUserA.patch(`/api/flashcards/${card.id}`, {
      headers: { Origin: BASE_URL },
      data: { front: "hijacked front" },
    });

    expect(res.status()).toBe(404);
    expect(await res.json()).toEqual(NOT_FOUND);
  });

  test("DELETE on User B's card is 404 for User A", async () => {
    const res = await asUserA.delete(`/api/flashcards/${card.id}`, {
      headers: { Origin: BASE_URL },
    });

    expect(res.status()).toBe(404);
    expect(await res.json()).toEqual(NOT_FOUND);
  });

  test("POST review on User B's card is 404 for User A", async () => {
    const res = await asUserA.post(`/api/flashcards/${card.id}/review`, {
      headers: { Origin: BASE_URL },
      data: { rating: 3 },
    });

    expect(res.status()).toBe(404);
    expect(await res.json()).toEqual(NOT_FOUND);
  });

  test("User B's row survives every attempt unchanged", async () => {
    const row = await getFlashcard(card.id);

    expect(row).not.toBeNull();
    expect(row).toMatchObject({ id: card.id, front: ORIGINAL.front, back: ORIGINAL.back });
  });
});

// Thin browser cross-check: even rendered, User A's /cards never surfaces B's
// content. Re-uses the project's User-A storageState (this block only).
test.describe("R#1 browser view", () => {
  test.use({ storageState: "e2e/.auth/user.json" });

  test("User A's /cards page never renders User B's content", async ({ page }) => {
    await page.goto("/cards");
    await expect(page.getByText(ORIGINAL.front)).toHaveCount(0);
    await expect(page.getByText(ORIGINAL.back)).toHaveCount(0);
  });
});
