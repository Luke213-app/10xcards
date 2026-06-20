// @ts-check
/**
 * Global teardown — runs after the web server is stopped and all tests finish.
 * Restores the developer's `.dev.vars` that the webServer command swapped out
 * (or removes the CI-created one). See `support/dev-vars.mjs`.
 */
import { restoreDevVars } from "./support/dev-vars.mjs";

export default function globalTeardown() {
  restoreDevVars();
}
