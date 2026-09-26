import { readFileSync, existsSync, appendFileSync } from "node:fs";

function analyzeTriage() {
  let isRisky = false;
  const reasons: string[] = [];

  // 1. Check CI Status
  const contextFile = process.env.REVIEW_CONTEXT_FILE ?? "/tmp/review-context.txt";
  if (existsSync(contextFile)) {
    const context = readFileSync(contextFile, "utf8");
    if (context.includes(": failure") || context.includes(": action_required") || context.includes(": cancelled")) {
      isRisky = true;
      reasons.push("Static checks or CI pipelines failed.");
    }
  }

  // 2. Check File Paths
  if (existsSync("/tmp/changed-files.txt")) {
    const files = readFileSync("/tmp/changed-files.txt", "utf8").split("\n").filter(Boolean);
    let riskyFileFound = false;

    for (const file of files) {
      const lower = file.toLowerCase();
      if (
        lower.includes("auth") ||
        lower.includes("guard") ||
        lower.includes("security") ||
        lower.includes("migration") ||
        lower.includes("jwt") ||
        lower.includes("token") ||
        lower.includes("package.json") ||
        lower.includes(".github/workflows")
      ) {
        riskyFileFound = true;
        break;
      }
    }

    if (riskyFileFound) {
      isRisky = true;
      reasons.push("Modifies critical paths (auth, security, migrations, or core config).");
    }

    if (files.length > 15) {
      isRisky = true;
      reasons.push(`High complexity: modifies ${files.length} files.`);
    }
  }

  // 3. Check Diff Size
  if (existsSync("/tmp/pr.diff")) {
    const diff = readFileSync("/tmp/pr.diff", "utf8");
    const additions = (diff.match(/^\+([^+]|$)/gm) || []).length;
    const deletions = (diff.match(/^-([^-]|$)/gm) || []).length;
    const totalChanges = additions + deletions;

    if (totalChanges > 400) {
      isRisky = true;
      reasons.push(`Large diff size (${totalChanges} lines changed).`);
    }
  }

  const reasonString = isRisky ? reasons.join(" ") : "Routine changes.";
  
  console.log(`Triage Result: is_risky=${isRisky}`);
  console.log(`Reason: ${reasonString}`);

  // Write to GITHUB_OUTPUT
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `is_risky=${isRisky}\n`);
    appendFileSync(process.env.GITHUB_OUTPUT, `triage_reason=${reasonString}\n`);
  }
}

analyzeTriage();
