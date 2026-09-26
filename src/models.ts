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

export async function resolveGeminiModelCandidates(
  apiKey: string,
  options: { deep?: boolean; explicitModel?: string }
): Promise<string[]> {
  const explicit = options.explicitModel?.trim();
  const wantDeep = Boolean(options.deep);

  const available = await fetchAvailableGeminiModels(apiKey);

  const fallbackList = wantDeep
    ? ["gemini-1.5-pro-latest", "gemini-1.5-pro", "gemini-1.5-flash-latest", "gemini-1.5-flash"]
    : ["gemini-1.5-flash-latest", "gemini-1.5-flash", "gemini-1.5-pro-latest", "gemini-1.5-pro"];

  let candidates: string[] = [];

  if (available.length > 0) {
    const ranked = [...available]
      .filter(m => scoreModel(m, wantDeep) > -500)
      .sort((a, b) => scoreModel(b, wantDeep) - scoreModel(a, wantDeep));
    candidates = ranked;
  } else {
    candidates = fallbackList;
  }

  // If user passed a specific explicit model other than 'auto', prepend it as primary candidate
  if (explicit && explicit.toLowerCase() !== "auto") {
    candidates = [explicit, ...candidates.filter(m => m !== explicit)];
  }

  // Deduplicate and return top 5 models for fallback rotation
  const uniqueCandidates = Array.from(new Set(candidates)).slice(0, 5);
  console.log(`Model rotation pool (${wantDeep ? "deep" : "standard"}):`, uniqueCandidates);
  return uniqueCandidates;
}

export async function resolveGeminiModel(
  apiKey: string,
  options: { deep?: boolean; explicitModel?: string }
): Promise<string> {
  const candidates = await resolveGeminiModelCandidates(apiKey, options);
  return candidates[0];
}
