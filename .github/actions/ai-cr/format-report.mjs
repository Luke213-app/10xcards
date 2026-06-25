#!/usr/bin/env node
// Turn the reviewer's contract JSON into the human-facing report + comment body
// and expose verdict/average as composite-action step outputs.
//
// The report's FIRST LINE is the `<!-- ai-cr:marker -->` marker so the same file
// serves as both the committed `reviews/ai-cr.md` and the in-place-updated PR
// comment (the workflow finds its prior comment by that marker prefix).
//
// Usage: node format-report.mjs <review.json> <out-report.md>
//   env: MODEL (model slug), RUN_URL (workflow run link), GITHUB_OUTPUT (step outputs file)

import { readFileSync, writeFileSync, appendFileSync } from "node:fs";

const MARKER = "<!-- ai-cr:marker -->";

const [, , jsonPath, outPath] = process.argv;
if (!jsonPath || !outPath) {
  process.stderr.write("Usage: node format-report.mjs <review.json> <out-report.md>\n");
  process.exit(1);
}

const model = process.env.MODEL ?? "(unknown model)";
const runUrl = process.env.RUN_URL ?? "";

/** The 5 contract criteria in display order, with human labels. */
const CRITERIA = [
  ["correctness", "Correctness"],
  ["security", "Security"],
  ["idiomaticity", "Idiomaticity"],
  ["complexity", "Complexity"],
  ["testCoverage", "Test coverage"],
];

const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };

let result;
try {
  result = JSON.parse(readFileSync(jsonPath, "utf8"));
} catch (err) {
  process.stderr.write(`Could not parse reviewer JSON at ${jsonPath}: ${err.message}\n`);
  process.exit(1);
}

const verdict = result.verdict === "pass" ? "pass" : "fail";
const average = typeof result.average === "number" ? result.average : 0;
const scores = result.scores ?? {};
const findings = Array.isArray(result.findings) ? result.findings : [];
const vetoes = Array.isArray(result.vetoes) ? result.vetoes : [];

const verdictBadge = verdict === "pass" ? "✅ PASS" : "❌ FAIL";

const lines = [];
lines.push(MARKER);
lines.push("# AI Quality Review");
lines.push("");
lines.push(`**Verdict:** ${verdictBadge} &nbsp;·&nbsp; **Average:** ${average.toFixed(2)} / 10`);
lines.push("");
lines.push("## Scores");
lines.push("");
lines.push("| Criterion | Score |");
lines.push("| --- | --- |");
for (const [key, label] of CRITERIA) {
  const raw = scores[key];
  const score = Number.isInteger(raw) ? `${raw}/10` : "—";
  lines.push(`| ${label} | ${score} |`);
}
lines.push("");

if (vetoes.length > 0) {
  lines.push("## Vetoes");
  lines.push("");
  for (const v of vetoes) lines.push(`- ⛔ ${v}`);
  lines.push("");
}

lines.push("## Findings");
lines.push("");
if (findings.length === 0) {
  lines.push("_No findings reported._");
} else {
  const sorted = [...findings].sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9));
  for (const f of sorted) {
    const loc = f.location ? ` (\`${f.location}\`)` : "";
    lines.push(`- **[${f.severity ?? "info"}] ${f.criterion ?? "?"}** — ${f.summary ?? ""}${loc}`);
  }
}
lines.push("");
lines.push("---");
const runLink = runUrl ? ` · [Run details](${runUrl})` : "";
lines.push(`_Advisory only — this review does not block merge. Model: \`${model}\`.${runLink}_`);
lines.push("");

writeFileSync(outPath, lines.join("\n"));

if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `verdict=${verdict}\n`);
  appendFileSync(process.env.GITHUB_OUTPUT, `average=${average}\n`);
}

process.stdout.write(`Wrote report to ${outPath} (verdict=${verdict}, average=${average}).\n`);
