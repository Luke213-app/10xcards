import assert from "node:assert/strict";
import path from "node:path";
import { decide } from "../src/contract.js";
import { buildResultFromText } from "../src/review.js";
import { resolveInRepo } from "../src/tools/readFile.js";

/**
 * Contract-level checks that run without an OpenRouter API key, covering the
 * Phase 2 success criteria that are not the live CLI call:
 *   - decide() veto logic (also exercised in Phase 1),
 *   - read_file path sandbox rejects out-of-repo paths (2.4),
 *   - malformed model output degrades to a `fail` verdict, never a crash (2.5).
 *
 * Run with: npm run -w @10xcards/code-reviewer check
 */

const root = "/repo/root";

// --- decide() veto (correctness/security < 5 overrides a >= 7 average) ---
{
  const d = decide({ correctness: 4, security: 10, idiomaticity: 10, complexity: 10, testCoverage: 10 });
  assert.equal(d.verdict, "fail", "correctness < 5 must veto to fail");
  assert.ok(d.average >= 7, "average is still >= 7 in the veto case");
  assert.ok(d.vetoes.length === 1 && d.vetoes[0]?.startsWith("correctness"), "veto records the offending criterion");

  const pass = decide({ correctness: 7, security: 7, idiomaticity: 7, complexity: 7, testCoverage: 7 });
  assert.equal(pass.verdict, "pass", "clean >= 7 average with no veto passes");
}

// --- read_file sandbox (2.4) ---
{
  const traversal = resolveInRepo("../secrets.txt", root);
  assert.equal(traversal.ok, false, "parent-traversal path must be refused");

  const absolute = resolveInRepo(path.join(root, "etc", "passwd"), root);
  assert.equal(absolute.ok, false, "absolute path must be refused");

  const inside = resolveInRepo("src/lib/utils.ts", root);
  assert.ok(inside.ok, "a normal repo-relative path is allowed");
  assert.equal(inside.absolute, path.join(root, "src/lib/utils.ts"));
}

// --- malformed output -> fail verdict, no crash (2.5) ---
{
  const garbage = buildResultFromText("the model forgot to answer in JSON");
  assert.equal(garbage.verdict, "fail", "unparseable output must fail");
  assert.ok(garbage.findings.length > 0, "a parse failure surfaces an explanatory finding");

  const wrongShape = buildResultFromText('{"scores": {"correctness": 11}}');
  assert.equal(wrongShape.verdict, "fail", "out-of-range / incomplete scores must fail");

  const good = buildResultFromText(
    'Here you go:\n{"scores":{"correctness":8,"security":8,"idiomaticity":8,"complexity":8,"testCoverage":8},"findings":[]}',
  );
  assert.equal(good.verdict, "pass", "a valid JSON object (even prose-wrapped) parses and passes");
  assert.equal(good.average, 8);

  // A tool-using model often emits a reasoning preamble whose braces are NOT the
  // answer; extraction must skip them and find the real JSON object.
  const prosey = buildResultFromText(
    "Now I have full context. The call decide({ correctness: 5, security: 5 }) matters.\n" +
      '{"scores":{"correctness":9,"security":9,"idiomaticity":9,"complexity":9,"testCoverage":9},"findings":[]}',
  );
  assert.equal(prosey.verdict, "pass", "prose braces before the JSON must not break extraction");
  assert.equal(prosey.average, 9);
}

process.stdout.write("All Phase 2 contract checks passed.\n");
