import type { Finding, ReviewResult } from "./review.js";

const severities = new Set(["critical", "high", "medium", "low"]);
const categories = new Set(["correctness", "security", "performance", "architecture", "testing", "maintainability", "accessibility", "dependencies"]);

export function validateReview(result: ReviewResult, maxFindings: number, minimumConfidence: number): ReviewResult {
  const seen = new Set<string>();
  const findings: Finding[] = [];

  for (const raw of result.findings ?? []) {
    if (!raw || typeof raw.title !== "string" || typeof raw.body !== "string") continue;
    if (!severities.has(raw.severity) || !categories.has(raw.category)) continue;
    const confidence = Number(raw.confidence);
    if (!Number.isFinite(confidence) || confidence < minimumConfidence || confidence > 1) continue;
    if (raw.path !== null && raw.path !== undefined && typeof raw.path !== "string") continue;
    if (raw.line !== null && raw.line !== undefined && (!Number.isInteger(raw.line) || raw.line < 1)) continue;

    const key = [raw.path ?? "", raw.line ?? "", raw.title.trim().toLowerCase()].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    findings.push({ ...raw, confidence });
    if (findings.length >= maxFindings) break;
  }

  return {
    summary: typeof result.summary === "string" ? result.summary.trim() : "No summary provided.",
    findings,
    tests: Array.isArray(result.tests) ? result.tests.filter(t => typeof t === "string").slice(0, 20) : []
  };
}
