import { existsSync, readFileSync } from "node:fs";

export interface RepositoryRules {
  enabled: boolean;
  categories: string[];
  customRules: string[];
}

const categories = new Set([
  "correctness",
  "security",
  "performance",
  "architecture",
  "testing",
  "maintainability",
  "accessibility",
  "dependencies"
]);

export function loadRepositoryRules(path = process.env.REPOSITORY_RULES_FILE ?? ".github/pr-review.yml"): RepositoryRules {
  if (!existsSync(path)) return { enabled: true, categories: [...categories], customRules: [] };

  const lines = readFileSync(path, "utf8").split(/\r?\n/);
  let enabled = true;
  const selected: string[] = [];
  const customRules: string[] = [];
  let inCustom = false;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    if (line === "custom_rules:" || line === "customRules:") {
      inCustom = true;
      continue;
    }
    if (inCustom && /^-\s+/.test(line)) {
      customRules.push(line.replace(/^-\s+/, "").replace(/^["']|["']$/g, "").slice(0, 500));
      continue;
    }
    if (line.startsWith("enabled:")) {
      enabled = line.split(":")[1]?.trim() !== "false";
      inCustom = false;
      continue;
    }
    const match = line.match(/^([a-z]+):\s*(true|false)$/);
    if (match && categories.has(match[1]) && match[2] === "true") selected.push(match[1]);
    if (!line.startsWith("-")) inCustom = false;
  }

  return {
    enabled,
    categories: selected.length ? [...new Set(selected)] : [...categories],
    customRules
  };
}

export function formatRepositoryRules(rules: RepositoryRules): string {
  if (!rules.enabled) return "";
  return [
    "Repository-specific review categories: " + rules.categories.join(", "),
    rules.customRules.length ? "Repository-specific rules:\n- " + rules.customRules.join("\n- ") : ""
  ].filter(Boolean).join("\n");
}
