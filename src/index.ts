import { loadConfig, loadRules } from "./config.js";
import { GeminiProvider } from "./providers/gemini.js";
import { runReview } from "./review.js";

async function main() {
  const config = loadConfig();
  const providerName = process.env.AI_PROVIDER ?? "gemini";

  if (providerName !== "gemini") {
    throw new Error(`Unsupported AI_PROVIDER: ${providerName}`);
  }

  const provider = new GeminiProvider(
    process.env.GEMINI_API_KEY ?? "",
    config.model
  );

  const context = process.env.REVIEW_CONTEXT;
  if (!context) throw new Error("REVIEW_CONTEXT is required");

  const result = await runReview(provider, loadRules(), context, config);
  process.stdout.write(JSON.stringify(result, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
