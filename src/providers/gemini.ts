import { GoogleGenerativeAI, type GenerativeModel } from "@google/generative-ai";
import type { ReviewProvider } from "./provider.js";

export class GeminiProvider implements ReviewProvider {
  private readonly model: GenerativeModel;

  constructor(apiKey: string, modelName: string) {
    if (!apiKey) throw new Error("GEMINI_API_KEY is required");
    this.model = new GoogleGenerativeAI(apiKey).getGenerativeModel({ model: modelName });
  }

  async review(input: { system: string; context: string }): Promise<string> {
    const prompt = [input.system, "\n\nRepository/PR context:\n", input.context].join("");
    const maxRetries = 3;
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await this.model.generateContent(prompt);
        return result.response.text();
      } catch (err: unknown) {
        lastError = err;
        const status = (err as { status?: number })?.status;
        if (attempt < maxRetries && (status === 503 || status === 429)) {
          console.warn(`Gemini API returned ${status} (attempt ${attempt}/${maxRetries}), retrying in ${attempt * 2}s...`);
          await new Promise(resolve => setTimeout(resolve, attempt * 2000));
          continue;
        }
        throw err;
      }
    }

    throw lastError;
  }
}
