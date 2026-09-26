import type { ReviewProvider } from "./providers/provider.js";
import { validateReview } from "./validation.js";

export interface Finding {
  severity: "critical" | "high" | "medium" | "low" | "good";
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
  // If wrapped in markdown code fence, extract the content
  const codeBlockMatch = value.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim();
  }
  // Otherwise find outermost '{' and '}' to extract raw JSON
  const start = value.indexOf("{");
  const end = value.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    return value.slice(start, end + 1).trim();
  }
  return value.trim();
}

export async function runReview(
  provider: ReviewProvider,
  rules: string,
  context: string,
  config: { maxFindings: number; minimumConfidence: number }
): Promise<ReviewResult> {
  const system = `You are a senior software engineer performing an initial GitHub pull request review.
Analyze the pull request diff, file context, and CI status objectively and constructively.

CRITICAL INSTRUCTIONS:
1. Return ONLY valid JSON matching the exact schema below. Do NOT output any commentary before or after the JSON.
2. Diff Line Anchoring ("path" & "line"):
   - "path" must be the exact relative file path from the repository root (e.g. "src/auth.ts"). If the finding is PR-wide or architectural, use null.
   - "line" MUST be a line number on the RIGHT (new/modified) side of the diff hunk where the defect exists.
   - If a finding is not tied to a specific newly changed line in the diff, set "line": null so it is included in the PR summary without breaking GitHub line-comment anchoring.
3. Code Suggestions ("suggestion"):
   - If proposing a concrete fix for "line", provide ONLY the replacement code lines.
   - DO NOT include markdown code fences (like \`\`\`suggestion or \`\`\`ts) in "suggestion". Provide raw code lines only.
   - If no direct 1-click replacement is suitable, use null.
4. Confidence & Noise Control ("confidence"):
   - Must be a float from 0.0 to 1.0 representing your certainty based on direct evidence in the diff.
   - Only output findings with confidence >= 0.75 (high certainty). Do NOT guess or speculate.
   - Do NOT duplicate compiler errors or linter warnings already captured in "Existing CI/check results".
   - Do NOT complain about formatting, naming preferences, or unaddressed features out of scope for this PR.
5. Severity Guidelines ("severity"):
   - "critical": Definite security vulnerability (OWASP, SQLi, XSS, auth bypass), data loss, fatal crash, or breaking API contract.
   - "high": Serious logic bug, race condition, resource leak, or unhandled failure path.
   - "medium": Inefficient implementation, missing validation/cleanup, unhandled edge cases.
   - "low": Minor code smell, missing typing, or clarity improvement.
   - "good": Commendable pattern, clean refactoring, or well-crafted defensive logic.

JSON Output Schema:
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
      "severity": "critical|high|medium|low|good",
      "category": "correctness|security|performance|architecture|testing|maintainability|accessibility|dependencies",
      "title": "short title",
      "body": "actionable explanation describing the problem and why it matters",
      "confidence": 0.85,
      "path": "path/to/file or null",
      "line": 1,
      "suggestion": "raw replacement code lines without backticks, or null"
    }
  ],
  "tests": ["concrete missing or recommended test cases"]
}

Review Rules:
${rules}`;

  const raw = stripJsonFence(await provider.review({ system, context }));
  const parsed = JSON.parse(raw) as ReviewResult;

  return validateReview(parsed, config.maxFindings, config.minimumConfidence);
}
