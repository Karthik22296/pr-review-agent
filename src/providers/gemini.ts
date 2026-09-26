import { GoogleGenerativeAI } from "@google/generative-ai";
import type { ReviewProvider } from "./provider.js";

export class GeminiProvider implements ReviewProvider {
  private readonly genAI: GoogleGenerativeAI;
  private readonly models: string[];

  constructor(apiKey: string, models: string | string[]) {
    if (!apiKey) throw new Error("GEMINI_API_KEY is required");
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.models = Array.isArray(models) ? models.filter(Boolean) : [models].filter(Boolean);
    if (this.models.length === 0) {
      this.models = ["gemini-1.5-flash-latest"];
    }
  }

  async review(input: { system: string; context: string }): Promise<string> {
    const prompt = [input.system, "\n\nRepository/PR context:\n", input.context].join("");
    const maxRetriesPerModel = 2;
    let lastError: unknown;

    for (let i = 0; i < this.models.length; i++) {
      const modelName = this.models[i];
      console.log(`[Gemini Provider] Trying model: ${modelName} (${i + 1}/${this.models.length})`);
      const model = this.genAI.getGenerativeModel({ model: modelName });

      for (let attempt = 1; attempt <= maxRetriesPerModel; attempt++) {
        try {
          const result = await model.generateContent(prompt);
          return result.response.text();
        } catch (err: unknown) {
          lastError = err;
          const status = (err as { status?: number })?.status;
          const isTransient = status === 503 || status === 429;

          if (attempt < maxRetriesPerModel && isTransient) {
            const delay = status === 429 ? attempt * 6 : attempt * 2;
            console.warn(`[Gemini Provider] Model ${modelName} returned ${status}, retrying in ${delay}s...`);
            await new Promise(resolve => setTimeout(resolve, delay * 1000));
            continue;
          }

          // If retries failed or it's a non-transient failure (e.g. 404/not supported), rotate to next candidate
          if (i + 1 < this.models.length) {
            const nextModel = this.models[i + 1];
            const errMsg = (err as Error)?.message || String(err);
            console.warn(`⚠️ [Gemini Provider] Model ${modelName} failed (${errMsg}). Automatically rotating to next fallback model: ${nextModel}...`);
          }
          break; // Break inner loop to try next model in outer loop
        }
      }
    }

    throw lastError;
  }
}
