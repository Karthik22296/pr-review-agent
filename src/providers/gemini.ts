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
    const result = await this.model.generateContent(prompt);
    return result.response.text();
  }
}
