interface GeminiModelInfo {
  name: string;
  supportedGenerationMethods?: string[];
}

export async function fetchAvailableGeminiModels(apiKey: string): Promise<string[]> {
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    if (!res.ok) {
      console.warn(`Notice: Unable to query available models (${res.status}). Falling back to defaults.`);
      return [];
    }
    const data = (await res.json()) as { models?: GeminiModelInfo[] };
    return (data.models ?? [])
      .filter(m => m.supportedGenerationMethods?.includes("generateContent"))
      .map(m => m.name.replace(/^models\//, ""));
  } catch (err) {
    console.warn("Notice: Network error querying Gemini models; falling back to defaults:", err);
    return [];
  }
}

function scoreModel(modelName: string, wantDeep: boolean): number {
  let score = 0;
  const lower = modelName.toLowerCase();

  // Exclude non-chat/non-text or specialized models
  if (
    lower.includes("embedding") ||
    lower.includes("aqa") ||
    lower.includes("imagen") ||
    lower.includes("tts") ||
    lower.includes("whisper")
  ) {
    return -1000;
  }

  const isPro = lower.includes("pro");
  const isFlash = lower.includes("flash");

  if (wantDeep) {
    if (isPro) score += 1000;
    else if (isFlash) score += 200;
  } else {
    if (isFlash) score += 1000;
    else if (isPro) score += 200;
  }

  // Version weighting: e.g. gemini-2.5 -> 250, gemini-2.0 -> 200, gemini-1.5 -> 150
  const versionMatch = lower.match(/gemini-(\d+)(?:\.(\d+))?/);
  if (versionMatch) {
    const major = parseInt(versionMatch[1], 10);
    const minor = versionMatch[2] ? parseInt(versionMatch[2], 10) : 0;
    score += major * 100 + minor * 10;
  }

  if (lower.includes("latest")) score += 15;
  if (lower.includes("stable")) score += 10;
  if (lower.includes("preview")) score -= 5;
  if (lower.includes("exp")) score -= 15;

  return score;
}

export async function resolveGeminiModel(
  apiKey: string,
  options: { deep?: boolean; explicitModel?: string }
): Promise<string> {
  const explicit = options.explicitModel?.trim();
  const wantDeep = Boolean(options.deep);

  // If user passed a specific model other than 'auto' or empty, check if we should just use it
  if (explicit && explicit.toLowerCase() !== "auto") {
    return explicit;
  }

  const available = await fetchAvailableGeminiModels(apiKey);
  if (available.length === 0) {
    // Fallback defaults if API call failed
    return wantDeep ? "gemini-1.5-pro-latest" : "gemini-1.5-flash-latest";
  }

  // Sort available models by descending score
  const ranked = [...available].sort((a, b) => scoreModel(b, wantDeep) - scoreModel(a, wantDeep));
  const chosen = ranked[0];

  console.log(`Discovered ${available.length} models for API key. Auto-selected optimal model: ${chosen} (mode=${wantDeep ? "deep" : "standard"})`);
  return chosen;
}
