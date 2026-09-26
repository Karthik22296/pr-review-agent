import { GeminiProvider } from "./gemini.js";
import type { ReviewProvider } from "./provider.js";

export function createProvider(name: string, options: { apiKey?: string; model: string | string[] }): ReviewProvider {
  switch (name) {
    case "gemini":
      return new GeminiProvider(options.apiKey ?? "", options.model);
    default:
      throw new Error(`Unsupported AI_PROVIDER: ${name}`);
  }
}
