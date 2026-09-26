import { existsSync, readFileSync } from "node:fs";

interface Finding {
  severity: "critical" | "high" | "medium" | "low" | "good";
  title: string;
}

interface ReviewResult {
  findings?: Finding[];
  riskLevel?: string;
}

async function main() {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  const repository = process.env.GITHUB_REPOSITORY || process.env.REPOSITORY;
  const commitSha = process.env.HEAD_SHA || process.env.COMMIT_SHA;
  const prNumber = process.env.PR_NUMBER;

  if (!token || !repository || !commitSha) {
    console.warn("Notice: Incomplete environment for status check; skipping commit status publication.");
    return;
  }

  const reviewFile = process.env.REVIEW_FILE ?? "/tmp/review.json";
  if (!existsSync(reviewFile)) {
    console.warn("Notice: No review.json found; skipping commit status publication.");
    return;
  }

  let review: ReviewResult;
  try {
    const raw = readFileSync(reviewFile, "utf8").trim();
    if (!raw) return;
    review = JSON.parse(raw);
  } catch (err) {
    console.warn("Notice: Failed to parse review.json for status check:", err);
    return;
  }

  const findings = review.findings ?? [];
  const criticalFindings = findings.filter(f => f.severity === "critical");
  const hasCritical = criticalFindings.length > 0;

  const state = hasCritical ? "failure" : "success";
  const description = hasCritical
    ? `🔴 ${criticalFindings.length} critical issue(s) found - must fix before merge`
    : findings.length === 0
      ? "✅ Quality Gate passed - No issues identified"
      : `✅ Quality Gate passed (${findings.length} non-blocking observations)`;

  const targetUrl = prNumber
    ? `https://github.com/${repository}/pull/${prNumber}`
    : `https://github.com/${repository}/commit/${commitSha}`;

  console.log(`Setting commit status on ${commitSha.slice(0, 7)}: state=${state}, description="${description}"`);

  const response = await fetch(`https://api.github.com/repos/${repository}/statuses/${commitSha}`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      state,
      target_url: targetUrl,
      description: description.slice(0, 140),
      context: "AI Review / Quality Gate"
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.warn(`Failed to set commit status (${response.status}): ${errorText}`);
  } else {
    console.log("Commit status successfully published.");
  }
}

main().catch(error => {
  console.error("Error setting commit status:", error);
  // Don't crash the workflow if status posting fails
});
