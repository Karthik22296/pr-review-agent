import { readFileSync } from "node:fs";
import { loadRepositoryRules, formatRepositoryRules } from "./rules.js";

export interface ReviewConfig {
  maxFiles: number;
  maxDiffCharacters: number;
  maxFindings: number;
  minimumConfidence: number;
  model: string;
}

function envNumber(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

export function loadConfig(): ReviewConfig {
  return {
    maxFiles: envNumber("REVIEW_MAX_FILES", 80),
    maxDiffCharacters: envNumber("REVIEW_MAX_DIFF_CHARS", 120000),
    maxFindings: envNumber("REVIEW_MAX_FINDINGS", 15),
    minimumConfidence: Number(process.env.REVIEW_MIN_CONFIDENCE ?? 0.75),
    model: process.env.AI_MODEL || "gemini-3.8-flash"
  };
}

export function loadRules(): string {
  const path = process.env.REVIEW_RULES_FILE ?? "rules/default.md";
  const globalRules = readFileSync(path, "utf8");
  const repositoryRules = loadRepositoryRules();
  if (!repositoryRules.enabled) {
    console.log("Notice: AI PR review is disabled by repository configuration (.github/pr-review.yml).");
    process.exit(0);
  }
  const formattedRepoRules = formatRepositoryRules(repositoryRules);
  return formattedRepoRules ? globalRules + "\n\n" + formattedRepoRules : globalRules;
}
