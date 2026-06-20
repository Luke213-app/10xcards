/**
 * R#5, gate 2 (APIs): protected API routes reject unauthenticated callers with a
 * 401 JSON body. This is the separate gate a UI-redirect test cannot see — these
 * checks live inline in each route handler (`context.locals.user`), NOT in the
 * middleware's `PROTECTED_ROUTES`, so they can drift independently of the page gate.
 *
 * Empty storageState makes the `request` fixture anonymous. The `Origin` header is
 * sent so Astro's CSRF origin check can't pre-empt the 401 with a 403; the auth
 * check runs before any id lookup or body parse, so a dummy id and empty body are
 * fine.
 */
import { test, expect } from "@playwright/test";
import { BASE_URL } from "../support/local-supabase";

test.use({ storageState: { cookies: [], origins: [] } });

// Syntactically-valid UUID; the auth gate returns before the route ever looks it up.
const DUMMY_ID = "00000000-0000-0000-0000-000000000000";

const PROTECTED_CALLS = [
  { method: "post", url: "/api/generate" },
  { method: "post", url: "/api/flashcards" },
  { method: "patch", url: `/api/flashcards/${DUMMY_ID}` },
  { method: "delete", url: `/api/flashcards/${DUMMY_ID}` },
  { method: "post", url: `/api/flashcards/${DUMMY_ID}/review` },
] as const;

for (const { method, url } of PROTECTED_CALLS) {
  test(`${method.toUpperCase()} ${url} returns 401 when unauthenticated`, async ({ request }) => {
    const res = await request[method](url, { headers: { Origin: BASE_URL } });

    expect(res.status()).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });
}
