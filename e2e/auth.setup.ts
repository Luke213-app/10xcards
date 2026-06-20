/**
 * Setup project: ensure the test users exist, then log in User A
 * programmatically and persist the session cookies for reuse by browser specs.
 *
 * The `Origin` header is load-bearing — Astro's CSRF origin check 403s any
 * programmatic form POST that lacks a matching Origin (a real browser sends it
 * automatically).
 */
import { test as setup, expect } from "@playwright/test";
import { ensureTestUsers } from "./support/seed";
import { USER_A } from "./support/local-supabase";

const authFile = "e2e/.auth/user.json";

setup("authenticate", async ({ request, baseURL }) => {
  await ensureTestUsers();

  const res = await request.post("/api/auth/signin", {
    form: { email: USER_A.email, password: USER_A.password },
    headers: { Origin: baseURL! },
    maxRedirects: 0, // observe the 302 itself rather than following it
  });

  expect(res.status()).toBe(302);
  expect(res.headers().location).toBe("/dashboard");

  await request.storageState({ path: authFile });
});
