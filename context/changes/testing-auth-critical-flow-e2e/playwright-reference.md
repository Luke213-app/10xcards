# Playwright Reference — Auth & Critical-Flow E2E

Distilled from the official Playwright docs (fetched via Exa). Each section maps to a
phase in `plan.md`. Source URLs at the bottom.

---

## Phase 1 — Harness Bootstrap

### `playwright.config.ts` (defineConfig + setup project + storageState + webServer)

```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:4321',
    trace: 'on-first-retry',
  },
  projects: [
    // 1) setup project runs first, authenticates, writes storageState
    { name: 'setup', testMatch: /.*\.setup\.ts/ },
    // 2) chromium reuses the captured session + waits for setup
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], storageState: 'e2e/.auth/user.json' },
      dependencies: ['setup'],
    },
  ],
  webServer: {
    command: 'npm run dev -- --port 4321',
    url: 'http://localhost:4321',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
    env: {
      SUPABASE_URL: 'http://127.0.0.1:54321',
      SUPABASE_KEY: process.env.SUPABASE_ANON_KEY!, // local anon key, injected
    },
  },
});
```

Key facts:
- **Dependencies run first, then dependents run in parallel.** If a dependency (setup)
  fails, dependent projects don't run. `--no-deps` skips them.
- **`webServer.url`** is polled until it returns 2xx/3xx/**400/401/402/403**. A protected
  app that 401s/302s on `/` still counts as "ready".
- **`webServer.env`** *replaces nothing on disk* — it only sets env for the spawned dev
  server process (defaults to inheriting `process.env` + `PLAYWRIGHT_TEST=1`). This is how
  you re-point the dev server at local Supabase without touching `.dev.vars`.
- **`reuseExistingServer: !process.env.CI`** → reuse a locally-running dev server, but
  always boot fresh in CI.
- **`baseURL`** makes `page.goto('/dashboard')`, `page.route()`, `request.post('/api/...')`
  all resolve relative to it (via the `URL()` constructor).
- `.gitignore`: `e2e/.auth/` holds session cookies — **never commit** (impersonation risk).

### Auth setup via API request (`e2e/auth.setup.ts`)

The `request` fixture respects `baseURL` and config `use` options. `request.storageState()`
persists cookies set by the response (Set-Cookie) to a file.

```ts
import { test as setup, expect } from '@playwright/test';
import { ensureTestUsers } from './support/seed';

const authFile = 'e2e/.auth/user.json';

setup('authenticate', async ({ request, baseURL }) => {
  await ensureTestUsers();
  const res = await request.post('/api/auth/signin', {
    form: { email: USER_A.email, password: USER_A.password }, // form-encoded
    headers: { Origin: baseURL! },                            // CSRF — load-bearing
    maxRedirects: 0,                                          // observe the 302 itself
  });
  expect(res.status()).toBe(302);
  expect(res.headers()['location']).toBe('/dashboard');
  await request.storageState({ path: authFile });
});
```

- `form: {...}` sends `application/x-www-form-urlencoded` (matches the endpoint's
  `formData()`). Use `data: {...}` for JSON instead.
- **`headers: { Origin: baseURL }`** is required on every programmatic POST or Astro's
  CSRF origin check returns 403. Real browser navigation sends Origin automatically.

### Smoke spec (`e2e/smoke.spec.ts`)

```ts
import { test, expect } from '@playwright/test';

test('authed dashboard renders', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/dashboard/); // not redirected to signin
});
```

---

## Phase 2 — R#5 Auth Gate

### Opt out of stored auth (anonymous specs)

```ts
import { test, expect } from '@playwright/test';

// reset storageState for the whole file → fully anonymous
test.use({ storageState: { cookies: [], origins: [] } });

const PROTECTED = ['/dashboard', '/generate', '/cards', '/review', '/cards/new'];

for (const path of PROTECTED) {
  test(`anonymous ${path} → signin`, async ({ page }) => {
    await page.goto(path);
    await expect(page).toHaveURL(/\/auth\/signin/);
  });
}
```

### Anonymous API gate (request fixture, no storageState)

The `request` fixture in a `test.use({ storageState: {cookies:[],origins:[]} })` file (or a
freshly created `playwright.request.newContext()`) carries no session.

```ts
test('POST /api/generate → 401', async ({ request, baseURL }) => {
  const res = await request.post('/api/generate', {
    data: { /* any body */ },
    headers: { Origin: baseURL! },
  });
  expect(res.status()).toBe(401);
  expect(await res.json()).toEqual({ error: 'Unauthorized' });
});
```

Cover: `POST /api/generate`, `POST /api/flashcards`, `PATCH`/`DELETE /api/flashcards/<id>`,
`POST /api/flashcards/<id>/review`. Use a syntactically valid dummy id (auth check precedes
lookup).

### Login round-trip (drive the real UI) + signup

```ts
test('UI login', async ({ page }) => {
  await page.goto('/auth/signin');
  await page.getByLabel('Email').fill(USER_A.email);
  await page.getByLabel('Password').fill(USER_A.password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);
});
```

Prefer **role/label locators** for the forms (`getByLabel`, `getByRole`). Signup case:
submit unique email → expect `/auth/confirm-email`, then sign in (DEV auto-confirm).

---

## Phase 3 — R#4 Generation Terminal State

### `getByTestId` + custom attribute

`page.getByTestId('generate-loading')` matches `data-testid="generate-loading"` by default.
(Override via `use: { testIdAttribute: 'data-pw' }` — not needed here, keep `data-testid`.)

### Network stubbing with `page.route` / `route.fulfill`

`route.fulfill` options: `status`, `json` (sets body + `content-type: application/json`),
`body`, `headers`, `response`. Mock **before** the action that triggers the request.

```ts
test.beforeEach(async ({ page }) => { /* nothing global */ });

// (b) review — 200 with candidates
test('review state', async ({ page }) => {
  await page.route('**/api/generate', route =>
    route.fulfill({ status: 200, json: { candidates: [{ front: 'Q', back: 'A' }] } }));
  await page.goto('/generate');
  await page.getByTestId('generate-source').fill('some source text');
  await page.getByTestId('generate-submit').click();
  await expect(page.getByTestId('generate-review')).toBeVisible();
});

// (c) empty — 200 with []
await page.route('**/api/generate', route =>
  route.fulfill({ status: 200, json: { candidates: [] } }));
// assert generate-empty visible

// (d) error — 502
await page.route('**/api/generate', route => route.fulfill({ status: 502 }));
// assert generate-error + generate-retry visible

// (a) loading — fulfill after a delay so the spinner is observable
await page.route('**/api/generate', async route => {
  await new Promise(r => setTimeout(r, 500));
  await route.fulfill({ status: 200, json: { candidates: [] } });
});
// immediately after submit: await expect(page.getByTestId('generate-loading')).toBeVisible();
```

Notes:
- Glob `**/api/generate` matches the full URL incl. host; `**` spans `/`. Use a RegExp for
  complex matching.
- No timing assertions on a "hang" — just assert the loading indicator appears after submit.
- If route-based mocks ever miss requests, set `use: { serviceWorkers: 'block' }` (not
  expected to be needed here).

---

## Phase 4 — R#1 Cross-User Isolation (API-level)

Build a second authenticated context for User A and fire raw API calls. Reuse the `request`
fixture (already authed as A via storageState) **or** create an isolated one and log in:

```ts
import { test, expect, request as pwRequest } from '@playwright/test';
import { seedFlashcard, getFlashcard } from '../support/seed';

test('A cannot touch B\'s card → 404, row unchanged', async ({ baseURL }) => {
  const card = await seedFlashcard(USER_B.id, { front: 'B-front', back: 'B-back' });

  const ctxA = await pwRequest.newContext({ baseURL });
  await ctxA.post('/api/auth/signin', {
    form: { email: USER_A.email, password: USER_A.password },
    headers: { Origin: baseURL! },
  });

  for (const call of [
    () => ctxA.patch(`/api/flashcards/${card.id}`, { data: { front: 'hax' }, headers: { Origin: baseURL! } }),
    () => ctxA.delete(`/api/flashcards/${card.id}`, { headers: { Origin: baseURL! } }),
    () => ctxA.post(`/api/flashcards/${card.id}/review`, { data: { grade: 5 }, headers: { Origin: baseURL! } }),
  ]) {
    const res = await call();
    expect(res.status()).toBe(404);
  }

  const after = await getFlashcard(card.id); // service_role read
  expect(after).toMatchObject({ front: 'B-front', back: 'B-back' });
  await ctxA.dispose();
});
```

- `playwright.request.newContext({ baseURL })` = isolated cookie jar (does not share the
  browser context's cookies). Perfect for a clean second identity.
- storageState is interchangeable between BrowserContext and APIRequestContext if you'd
  rather capture A's cookies once and reuse.

---

## Phase 5 — CI (GitHub Actions)

Canonical Playwright CI shape (adapt into existing `ci.yml`, add Supabase provisioning):

```yaml
jobs:
  e2e:
    runs-on: ubuntu-latest
    timeout-minutes: 60
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with: { node-version: lts/* }
      - run: npm ci
      - run: npx supabase start            # Docker is available on ubuntu-latest
      - run: npx supabase migration up --local
      # export local SUPABASE_URL / anon / service_role into $GITHUB_ENV here
      - run: npm run test:e2e:install       # playwright install --with-deps chromium
      - run: npm run test:e2e
      - uses: actions/upload-artifact@v4
        if: ${{ !cancelled() }}
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 30
```

- The `setup` project seeds users via the admin API at suite start (no separate CI step).
- Upload `playwright-report/` on failure to triage flakes.
- Treat report/trace artifacts as sensitive (they can contain credentials/tokens).

---

## Cross-cutting gotchas

- **Origin header** on every programmatic POST (setup login, R#1 calls) → else 403 CSRF.
- **storageState file** = session cookies → gitignore `e2e/.auth/`.
- **baseURL** drives relative `goto`/`route`/`request` paths — pin the dev port (4321).
- **Mock before navigate/submit**, not after.
- `route.fulfill({ json })` auto-sets `content-type: application/json`.
- Anonymous = `test.use({ storageState: { cookies: [], origins: [] } })`.

## Sources

- Authentication (setup project, storageState, API login, avoid-auth): https://playwright.dev/docs/auth
- Projects (dependencies, run order, testMatch): https://playwright.dev/docs/test-projects
- Web server (command/url/env/reuse/timeout, baseURL): https://playwright.dev/docs/test-webserver
- API testing (request fixture, form/data, newContext, storageState): https://playwright.dev/docs/api-testing
- Mock APIs + Network (page.route, route.fulfill status/json/body, globs): https://playwright.dev/docs/mock , https://playwright.dev/docs/network
- Locators (getByTestId, getByRole/Label, testIdAttribute): https://playwright.dev/docs/locators
- Configuration (defineConfig top-level options): https://playwright.dev/docs/test-configuration
- CI (GitHub Actions workflow shape): https://playwright.dev/docs/ci-intro
