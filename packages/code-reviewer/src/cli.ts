import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { reviewCode } from "./review.js";

/**
 * Thin CLI wrapper around {@link reviewCode}: read a diff from a file, run the
 * review, print the contract JSON to stdout for CI to consume. Exit code is 0
 * on a clean run regardless of verdict (advisory) — CI reads `verdict` from the
 * JSON to decide labels, it does not rely on the exit code.
 *
 *   npm run review -- --diff fixtures/sample.diff --title "..." --model "..."
 */
async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      diff: { type: "string" },
      title: { type: "string" },
      description: { type: "string" },
      model: { type: "string" },
      json: { type: "boolean", default: false },
    },
  });

  if (!values.diff) {
    throw new Error("Missing --diff <file>. Usage: review --diff <file> [--title ..] [--description ..] [--model ..]");
  }

  const diff = await readFile(values.diff, "utf8");

  const result = await reviewCode({
    diff,
    title: values.title,
    description: values.description,
    model: values.model,
  });

  if (values.json) {
    process.stdout.write(JSON.stringify(result));
  } else {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }
}

main().catch((err: unknown) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 1;
});
