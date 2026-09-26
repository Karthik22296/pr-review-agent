import type { ReviewProvider } from "./providers/provider.js";
import { validateReview } from "./validation.js";

export interface Finding {
  severity: "critical" | "high" | "medium" | "low";
  category: string;
  title: string;
  body: string;
  confidence: number;
  path?: string | null;
  line?: number | null;
  suggestion?: string | null;
}

export interface FileWalkthrough {
  path: string;
  summary: string;
}

export interface ReviewResult {
  summary: string;
  riskLevel?: "low" | "medium" | "high";
  riskReason?: string;
  fileWalkthrough?: FileWalkthrough[];
  findings: Finding[];
  tests: string[];
}

function stripJsonFence(value: string): string {
  return value.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
}

export async function runReview(
  provider: ReviewProvider,
  rules: string,
  context: string,
  config: { maxFindings: number; minimumConfidence: number }
): Promise<ReviewResult> {
  const system = `You are a senior software engineer performing an initial GitHub pull request review.
Return ONLY valid JSON matching this shape:
{
  "summary": "concise 2-3 sentence overview of the pull request changes and intent",
  "riskLevel": "low|medium|high",
  "riskReason": "brief explanation of risk level based on security, auth, database, breaking API, or complex state logic",
  "fileWalkthrough": [
    {
      "path": "path/to/file",
      "summary": "concise description of changes made to this file"
    }
  ],
  "findings": [
    {
      "severity": "critical|high|medium|low",
      "category": "correctness|security|performance|architecture|testing|maintainability|accessibility|dependencies",
      "title": "short title",
      "body": "actionable explanation",
      "confidence": 0.0,
      "path": "changed/path or null",
      "line": 1,
      "suggestion": "concrete replacement code lines that fix the issue for GitHub 1-click suggestion block, or null if not applicable"
    }
  ],
  "tests": ["missing or recommended tests"]
}
Rules:
${rules}`;

  const raw = stripJsonFence(await provider.review({ system, context }));
  const parsed = JSON.parse(raw) as ReviewResult;

  return validateReview(parsed, config.maxFindings, config.minimumConfidence);
}
