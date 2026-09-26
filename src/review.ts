import type { ReviewProvider } from "./providers/provider.js";

export interface Finding {
  severity: "critical" | "high" | "medium" | "low";
  category: string;
  title: string;
  body: string;
  confidence: number;
  path?: string | null;
  line?: number | null;
}

export interface ReviewResult {
  summary: string;
  findings: Finding[];
  tests: string[];
}

function stripJsonFence(value: string): string {
  return value.replace(/^\s*\`\`\`(?:json)?\s*/i, "").replace(/\s*\`\`\`\s*$/i, "").trim();
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
  "summary": "short review summary",
  "findings": [
    {
      "severity": "critical|high|medium|low",
      "category": "correctness|security|performance|architecture|testing|maintainability|accessibility|dependencies",
      "title": "short title",
      "body": "actionable explanation",
      "confidence": 0.0,
      "path": "changed/path or null",
      "line": 1
    }
  ],
  "tests": ["missing or recommended tests"]
}
Rules:
${rules}`;

  const raw = stripJsonFence(await provider.review({ system, context }));
  const parsed = JSON.parse(raw) as ReviewResult;

  parsed.findings = (parsed.findings ?? [])
    .filter(f => Number(f.confidence) >= config.minimumConfidence)
    .slice(0, config.maxFindings);

  return parsed;
}
