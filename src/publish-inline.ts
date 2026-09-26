import { existsSync, readFileSync } from "node:fs";
import { findingFingerprint } from "./fingerprint.js";

interface Finding {
  severity: string;
  category: string;
  title: string;
  body: string;
  path?: string | null;
  line?: number | null;
  suggestion?: string | null;
}

interface PullComment {
  id: number;
  node_id?: string;
  body?: string;
  in_reply_to_id?: number;
}

interface ReviewThreadNode {
  id: string;
  isResolved: boolean;
  comments: {
    nodes: Array<{ databaseId: number }>;
  };
}

async function resolveThreadViaGraphQL(token: string, threadId: string): Promise<boolean> {
  try {
    const res = await fetch("https://api.github.com/graphql", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        query: `mutation Resolve($threadId: ID!) {
          resolveReviewThread(input: { threadId: $threadId }) {
            thread { isResolved }
          }
        }`,
        variables: { threadId }
      })
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function fetchReviewThreads(token: string, owner: string, repo: string, prNumber: number): Promise<ReviewThreadNode[]> {
  try {
    const res = await fetch("https://api.github.com/graphql", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        query: `query($owner: String!, $repo: String!, $pr: Int!) {
          repository(owner: $owner, name: $repo) {
            pullRequest(number: $pr) {
              reviewThreads(first: 100) {
                nodes {
                  id
                  isResolved
                  comments(first: 1) {
                    nodes {
                      databaseId
                    }
                  }
                }
              }
            }
          }
        }`,
        variables: { owner, repo, pr: prNumber }
      })
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { data?: { repository?: { pullRequest?: { reviewThreads?: { nodes?: ReviewThreadNode[] } } } } };
    return data?.data?.repository?.pullRequest?.reviewThreads?.nodes ?? [];
  } catch {
    return [];
  }
}

async function main() {
  const token = process.env.GITHUB_TOKEN;
  const repository = process.env.GITHUB_REPOSITORY;
  const prNumberStr = process.env.PR_NUMBER;
  const commitId = process.env.HEAD_SHA;
  if (!token || !repository || !prNumberStr || !commitId) {
    throw new Error("GitHub review environment is incomplete");
  }
  const prNumber = Number(prNumberStr);
  const [owner, repo] = repository.split("/");

  if (!existsSync("/tmp/review.json")) {
    console.log("No review.json found; skipping inline comments.");
    return;
  }

  let review: { findings?: Finding[] };
  try {
    const raw = readFileSync("/tmp/review.json", "utf8").trim();
    if (!raw) {
      console.log("review.json is empty; skipping inline comments.");
      return;
    }
    review = JSON.parse(raw);
  } catch (error) {
    console.warn("Could not parse /tmp/review.json; skipping inline comments:", error);
    return;
  }

  const findings = (review.findings ?? []).filter(f => f.path && Number.isInteger(f.line) && Number(f.line) > 0);
  const activeFingerprints = new Set(findings.map(f => findingFingerprint(f)));

  const existingResponse = await fetch(`https://api.github.com/repos/${repository}/pulls/${prNumber}/comments?per_page=100`, {
    headers: {
      "Authorization": `Bearer ${token}`,
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28"
    }
  });

  const existing: PullComment[] = existingResponse.ok ? ((await existingResponse.json()) as PullComment[]) : [];
  const existingFingerprints = new Set<string>();

  // Map of root comment ID to its replies
  const repliedCommentIds = new Set<number>();
  for (const c of existing) {
    if (c.in_reply_to_id) {
      if (c.body?.includes("✅ **Resolved in") || c.body?.includes("✅ **Addressed in")) {
        repliedCommentIds.add(c.in_reply_to_id);
      }
    }
    const m = c.body?.match(/<!-- pr-review-fingerprint:([a-f0-9]+) -->/);
    if (m) {
      existingFingerprints.add(m[1]);
    }
  }

  // Auto-resolve threads where the issue is no longer present in current review
  const threads = await fetchReviewThreads(token, owner, repo, prNumber);
  const threadMap = new Map<number, ReviewThreadNode>();
  for (const t of threads) {
    const rootCommentId = t.comments?.nodes?.[0]?.databaseId;
    if (rootCommentId) {
      threadMap.set(rootCommentId, t);
    }
  }

  for (const c of existing) {
    // Check only root bot comments that have a fingerprint
    if (c.in_reply_to_id) continue;
    const m = c.body?.match(/<!-- pr-review-fingerprint:([a-f0-9]+) -->/);
    if (!m) continue;

    const fingerprint = m[1];
    // If the finding is NOT present in the active review findings, it was resolved!
    if (!activeFingerprints.has(fingerprint) && !repliedCommentIds.has(c.id)) {
      console.log(`Auto-resolving comment ${c.id} (fingerprint: ${fingerprint})`);
      
      // 1. Post a polite resolution reply
      try {
        await fetch(`https://api.github.com/repos/${repository}/pulls/${prNumber}/comments/${c.id}/replies`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${token}`,
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            body: `✅ **Resolved in \`${commitId.slice(0, 7)}\`**: This issue was addressed or is no longer detected in the latest changes.`
          })
        });
      } catch (err) {
        console.warn(`Could not reply to comment ${c.id}:`, err);
      }

      // 2. Mark thread as resolved in GitHub UI via GraphQL
      const thread = threadMap.get(c.id);
      if (thread && !thread.isResolved) {
        const resolved = await resolveThreadViaGraphQL(token, thread.id);
        if (resolved) {
          console.log(`Thread ${thread.id} successfully resolved via GraphQL.`);
        }
      }
    }
  }

  // Publish new findings anchored to the current commit
  for (const finding of findings) {
    const fingerprint = findingFingerprint(finding);
    if (existingFingerprints.has(fingerprint)) continue;

    const suggestionBlock = finding.suggestion?.trim()
      ? `\n\n\`\`\`suggestion\n${finding.suggestion.trim()}\n\`\`\``
      : "";

    const severityMap: Record<string, string> = {
      critical: "🔴 CRITICAL",
      high: "🟠 HIGH",
      medium: "🟡 MEDIUM",
      low: "🔵 LOW",
      good: "✅ GOOD"
    };
    const sev = severityMap[finding.severity] || finding.severity.toUpperCase();

    const response = await fetch(`https://api.github.com/repos/${repository}/pulls/${prNumber}/comments`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        body: `<!-- pr-review-fingerprint:${fingerprint} -->\n**${sev} — ${finding.title}** (${finding.category})\n\n${finding.body}${suggestionBlock}`,
        commit_id: commitId,
        path: finding.path,
        line: finding.line,
        side: "RIGHT"
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.warn(`Could not anchor finding at ${finding.path}:${finding.line} (${response.status}): ${errorText}`);
    } else {
      console.log(`Published finding: [${sev}] ${finding.title} at ${finding.path}:${finding.line}`);
    }
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
