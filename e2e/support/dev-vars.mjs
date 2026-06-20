// @ts-check
/**
 * Re-point the dev server at LOCAL Supabase for the e2e run.
 *
 * Why a file swap (and not Playwright's `webServer.env`): under @astrojs/cloudflare
 * the dev server resolves `astro:env/server` secrets through the workerd platform
 * proxy, which reads `.dev.vars` and ignores `process.env`. So the only reliable
 * way to point the app at local Supabase is to write `.dev.vars` itself — BEFORE
 * `astro dev` boots (the webServer command runs before globalSetup, so `apply`
 * lives in that command; `restore` runs in globalTeardown, last of all).
 *
 * Non-destructive: the developer's real `.dev.vars` is backed up and restored.
 * Crash-safety: if a stale backup is found on the next `apply`, it is restored
 * first, so an interrupted run can never leave the dev's file in "test mode".
 * In CI there is no `.dev.vars`, so `apply` writes a fresh one and `restore`
 * deletes it.
 *
 * CLI: `node e2e/support/dev-vars.mjs apply | restore`
 */
import { existsSync, copyFileSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DEV_VARS = join(ROOT, ".dev.vars");
const BACKUP = join(ROOT, ".dev.vars.e2e-backup");

/** Swap in local-Supabase `.dev.vars`, backing up the developer's real file. */
export function applyLocalDevVars() {
  // Crash recovery: a leftover backup means a prior run was interrupted mid-swap.
  if (existsSync(BACKUP)) {
    copyFileSync(BACKUP, DEV_VARS);
    rmSync(BACKUP);
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_KEY;
  if (!url || !key) {
    throw new Error("dev-vars apply: SUPABASE_URL / SUPABASE_KEY missing from env (set via webServer.env)");
  }

  /** @type {string[]} */
  let preserved = [];
  if (existsSync(DEV_VARS)) {
    copyFileSync(DEV_VARS, BACKUP); // preserve the developer's real file
    preserved = readFileSync(DEV_VARS, "utf8")
      .split("\n")
      .filter((line) => line.trim() && !line.startsWith("SUPABASE_URL=") && !line.startsWith("SUPABASE_KEY="));
  }

  const lines = [...preserved, `SUPABASE_URL=${url}`, `SUPABASE_KEY=${key}`];
  writeFileSync(DEV_VARS, lines.join("\n") + "\n");
}

/** Restore the developer's `.dev.vars` (or delete the one we created in CI). */
export function restoreDevVars() {
  if (existsSync(BACKUP)) {
    copyFileSync(BACKUP, DEV_VARS);
    rmSync(BACKUP);
  } else if (existsSync(DEV_VARS)) {
    // No backup ⇒ we created the file (CI) ⇒ remove it.
    rmSync(DEV_VARS);
  }
}

// CLI shim — only when run directly (not when imported by globalTeardown).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const cmd = process.argv[2];
  if (cmd === "apply") {
    applyLocalDevVars();
  } else if (cmd === "restore") {
    restoreDevVars();
  } else {
    // eslint-disable-next-line no-console
    console.error(`dev-vars: unknown command "${cmd ?? ""}" (expected "apply" or "restore")`);
    process.exit(1);
  }
}
