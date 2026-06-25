import { realpathSync } from "node:fs";
import { readFile as fsReadFile } from "node:fs/promises";
import path from "node:path";
import { tool } from "@openrouter/agent";
import { z } from "zod";

/**
 * Max bytes of file content handed back to the model. Diffs in this repo are
 * small; a single oversized file should not blow up the token budget, so we
 * truncate and tell the model we did.
 */
export const MAX_CONTENT_BYTES = 64 * 1024;

/**
 * Resolve a model-supplied path against the repo root and reject anything that
 * escapes it. Returns the safe absolute path, or an error message describing
 * why the path was refused. Pure-ish (only touches the filesystem for symlink
 * resolution), so it is unit-testable without invoking the agent.
 *
 * Guards, in order:
 *  - absolute paths are refused outright (the model must use repo-relative paths),
 *  - the lexically-resolved path must stay inside `root`,
 *  - if the path exists, its real (symlink-followed) path must also stay inside
 *    `root` — defeats a symlink inside the repo pointing out of it.
 */
export function resolveInRepo(
  inputPath: string,
  root: string,
): { ok: true; absolute: string } | { ok: false; error: string } {
  if (path.isAbsolute(inputPath)) {
    return { ok: false, error: `Refused: "${inputPath}" is an absolute path. Use a path relative to the repo root.` };
  }

  const rootResolved = path.resolve(root);
  const absolute = path.resolve(rootResolved, inputPath);
  const withSep = rootResolved.endsWith(path.sep) ? rootResolved : rootResolved + path.sep;

  if (absolute !== rootResolved && !absolute.startsWith(withSep)) {
    return { ok: false, error: `Refused: "${inputPath}" resolves outside the repo root.` };
  }

  // Defeat symlinks that point outside the repo. realpathSync throws if the
  // path does not exist; a missing file is reported as a normal read error
  // below, so we only re-check containment when resolution succeeds.
  try {
    const real = realpathSync(absolute);
    if (real !== rootResolved && !real.startsWith(withSep)) {
      return { ok: false, error: `Refused: "${inputPath}" is a symlink that escapes the repo root.` };
    }
  } catch {
    // Non-existent path — let the read attempt surface a clean error.
  }

  return { ok: true, absolute };
}

/**
 * The single tool that justifies running this reviewer on the Agent SDK: it lets
 * the model pull full file contents beyond the diff for idiomaticity/correctness
 * context. Sandboxed to the repo root, size-capped, and it never throws —
 * failures come back as an `error` field so the model can recover.
 */
export const readFileTool = tool({
  name: "read_file",
  description:
    "Read a UTF-8 text file from the repository for context the diff does not show " +
    "(e.g. the full module a hunk touches). The path must be relative to the repo root. " +
    "Returns the file content, truncated if very large. Paths outside the repo are refused.",
  inputSchema: z.object({
    path: z.string().min(1).describe("Path relative to the repo root, e.g. src/lib/utils.ts"),
  }),
  outputSchema: z.object({
    content: z.string(),
    error: z.string().optional(),
  }),
  async execute({ path: inputPath }) {
    const root = process.cwd();
    const resolved = resolveInRepo(inputPath, root);
    if (!resolved.ok) {
      return { content: "", error: resolved.error };
    }

    let raw: Buffer;
    try {
      raw = await fsReadFile(resolved.absolute);
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : String(cause);
      return { content: "", error: `Could not read "${inputPath}": ${reason}` };
    }

    if (raw.byteLength > MAX_CONTENT_BYTES) {
      const truncated = raw.subarray(0, MAX_CONTENT_BYTES).toString("utf8");
      return {
        content: `${truncated}\n\n…[truncated: file is ${raw.byteLength} bytes, showing first ${MAX_CONTENT_BYTES}]`,
      };
    }

    return { content: raw.toString("utf8") };
  },
});
