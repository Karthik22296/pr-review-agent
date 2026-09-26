import type { FileWalkthrough, Finding, ReviewResult } from "./review.js";

const severities = new Set(["critical", "high", "medium", "low", "good"]);
const categories = new Set(["correctness", "security", "performance", "architecture", "testing", "maintainability", "accessibility", "dependencies"]);
const validRiskLevels = new Set(["low", "medium", "high"]);

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

    let suggestion = typeof raw.suggestion === "string" && raw.suggestion.trim() ? raw.suggestion.trim() : null;
    if (suggestion) {
      suggestion = suggestion.replace(/^\s*```(?:suggestion|[a-z0-9_-]+)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
      if (!suggestion) suggestion = null;
    }

    const key = [raw.path ?? "", raw.line ?? "", raw.title.trim().toLowerCase()].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    findings.push({ ...raw, confidence, suggestion });
    if (findings.length >= maxFindings) break;
  }

  const rawRisk = typeof result.riskLevel === "string" ? result.riskLevel.toLowerCase() : "low";
  const riskLevel = (validRiskLevels.has(rawRisk) ? rawRisk : "low") as "low" | "medium" | "high";
  const riskReason = typeof result.riskReason === "string" ? result.riskReason.trim() : "";

  const fileWalkthrough: FileWalkthrough[] = [];
  if (Array.isArray(result.fileWalkthrough)) {
    for (const item of result.fileWalkthrough) {
      if (item && typeof item.path === "string" && typeof item.summary === "string" && item.path.trim()) {
        fileWalkthrough.push({
          path: item.path.trim(),
          summary: item.summary.trim()
        });
        if (fileWalkthrough.length >= 30) break;
      }
    }
  }

  return {
    summary: typeof result.summary === "string" ? result.summary.trim() : "No summary provided.",
    riskLevel,
    riskReason: riskReason || undefined,
    fileWalkthrough: fileWalkthrough.length > 0 ? fileWalkthrough : undefined,
    findings,
    tests: Array.isArray(result.tests) ? result.tests.filter(t => typeof t === "string").slice(0, 20) : []
  };
}
