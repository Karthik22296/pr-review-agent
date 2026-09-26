import { existsSync, readFileSync } from "node:fs";
import { findingFingerprint } from "./fingerprint.js";

interface Finding {
  severity: string;
  category: string;
  title: string;
  body: string;
  path?: string | null;
  line?: number | null;
}

async function main() {
  const token = process.env.GITHUB_TOKEN;
  const repository = process.env.GITHUB_REPOSITORY;
  const prNumber = process.env.PR_NUMBER;
  const commitId = process.env.HEAD_SHA;
  if (!token || !repository || !prNumber || !commitId) {
    throw new Error("GitHub review environment is incomplete");
  }

  if (!existsSync("/tmp/review.json")) {
    console.log("No review.json found; skipping inline comments.");
    return;
  }

  const review = JSON.parse(readFileSync("/tmp/review.json", "utf8")) as { findings?: Finding[] };
  const findings = (review.findings ?? []).filter(f => f.path && Number.isInteger(f.line) && Number(f.line) > 0);
  if (findings.length === 0) return;

  const existingResponse = await fetch(`https://api.github.com/repos/${repository}/pulls/${prNumber}/comments`, {
    headers: {
      "Authorization": `Bearer ${token}`,
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28"
    }
  });

  const existing = existingResponse.ok ? (await existingResponse.json()) as Array<{ body?: string }> : [];
  const existingFingerprints = new Set(
    existing.flatMap(c => {
      const m = c.body?.match(/<!-- pr-review-fingerprint:([a-f0-9]+) -->/);
      return m ? [m[1]] : [];
    })
  );

  for (const finding of findings) {
    const fingerprint = findingFingerprint(finding);
    if (existingFingerprints.has(fingerprint)) continue;

    const response = await fetch(`https://api.github.com/repos/${repository}/pulls/${prNumber}/comments`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        body: `<!-- pr-review-fingerprint:${fingerprint} -->\n**${finding.severity.toUpperCase()} — ${finding.title}** (${finding.category})\n\n${finding.body}`,
        commit_id: commitId,
        path: finding.path,
        line: finding.line,
        side: "RIGHT"
      })
    });

    if (!response.ok) {
      console.warn(`Could not anchor finding at ${finding.path}:${finding.line}: ${response.status}`);
    }
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
