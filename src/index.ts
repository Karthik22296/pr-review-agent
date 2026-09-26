import { readFileSync } from "node:fs";
import { loadConfig, loadRules } from "./config.js";
import { createProvider } from "./providers/registry.js";
import { runReview } from "./review.js";

async function main() {
  const config = loadConfig();
  const providerName = process.env.AI_PROVIDER ?? "gemini";
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn("Notice: GEMINI_API_KEY is not configured in repository secrets. Skipping review execution.");
    return;
  }

  const provider = createProvider(providerName, {
    apiKey,
    model: config.model
  });

  const context = process.env.REVIEW_CONTEXT_FILE
    ? readFileSync(process.env.REVIEW_CONTEXT_FILE, "utf8")
    : process.env.REVIEW_CONTEXT;
  if (!context) throw new Error("REVIEW_CONTEXT or REVIEW_CONTEXT_FILE is required");
  try {
    const result = await runReview(provider, loadRules(), context, config);
    process.stdout.write(JSON.stringify(result, null, 2));
  } catch (error: unknown) {
    const status = (error as { status?: number })?.status;
    if (status === 503 || status === 429) {
      console.warn(`Notice: AI review provider temporarily unavailable (${status}). Skipping review for this run.`);
      return;
    }
    throw error;
  }
}

main().catch(error => { console.error(error); process.exit(1); });
