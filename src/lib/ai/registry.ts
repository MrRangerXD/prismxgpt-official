/**
 * PrismXGPT model registry.
 *
 * Provider-agnostic catalogue. The application only speaks in these canonical
 * model ids; the provider layer maps each one to an ordered list of upstream
 * candidates (provider + upstream model id) and fails over between them at
 * request time. Keys are read from the environment on the server only.
 *
 * Uncensored providers lead every chain. Groq / OpenRouter / Lovable sit behind
 * them purely as availability fallbacks, so a missing Venice key degrades
 * quality instead of breaking the app.
 */

export type ProviderName = "venice" | "groq" | "openrouter" | "lovable";

export type ModelCandidate = {
  provider: ProviderName;
  model: string;
};

export type ModelCapabilities = {
  streaming: boolean;
  vision: boolean;
  reasoning: boolean;
  images: boolean;
};

export type ModelEntry = {
  id: string;
  displayName: string;
  provider: ProviderName;
  candidates: ModelCandidate[];
  upstreamId: string;
  contextLength: number;
  capabilities: ModelCapabilities;
  free: boolean;
  availability: "available" | "unavailable";
};

const cap = (partial: Partial<ModelCapabilities>): ModelCapabilities => ({
  streaming: true,
  vision: false,
  reasoning: false,
  images: false,
  ...partial,
});

function entry(
  e: Omit<ModelEntry, "upstreamId" | "provider"> & { candidates: ModelCandidate[] },
): ModelEntry {
  const first = e.candidates[0];
  return { ...e, provider: first.provider, upstreamId: first.model };
}

/**
 * Uncensored chains. Venice first (no prompt filtering, no "I can't"),
 * Dolphin-Venice on OpenRouter as the free fallback, then the boring models.
 * NOTE: upstream ids drift — verify once with
 *   curl https://api.venice.ai/api/v1/models -H "Authorization: Bearer $VENICE_API_KEY"
 */
const CHAIN_UNCENSORED: ModelCandidate[] = [
  { provider: "venice", model: "venice-uncensored" },
  {
    provider: "openrouter",
    model: "cognitivecomputations/dolphin-mistral-24b-venice-edition:free",
  },
  { provider: "groq", model: "openai/gpt-oss-120b" },
  { provider: "lovable", model: "google/gemini-3-flash-preview" },
];

/** Code-quality chain: strong reasoning first, still uncensored at the top. */
const TEXT_CHAIN_BALANCED: ModelCandidate[] = [
  { provider: "venice", model: "venice-uncensored" },
  { provider: "groq", model: "openai/gpt-oss-120b" },
  { provider: "openrouter", model: "z-ai/glm-5.2:free" },
  { provider: "lovable", model: "google/gemini-3-flash-preview" },
];

const TEXT_CHAIN_PRO: ModelCandidate[] = [
  { provider: "venice", model: "venice-uncensored" },
  { provider: "groq", model: "openai/gpt-oss-120b" },
  { provider: "openrouter", model: "nvidia/nemotron-3-ultra-550b-a55b:free" },
  { provider: "lovable", model: "google/gemini-2.5-pro" },
];

const TEXT_CHAIN_FAST: ModelCandidate[] = [
  { provider: "venice", model: "venice-uncensored" },
  { provider: "groq", model: "openai/gpt-oss-20b" },
  { provider: "openrouter", model: "openai/gpt-oss-20b:free" },
  { provider: "lovable", model: "google/gemini-3-flash-preview" },
];

export const VISION_CHAIN: ModelCandidate[] = [
  { provider: "venice", model: "venice-uncensored" },
  { provider: "openrouter", model: "nvidia/nemotron-nano-12b-v2-vl:free" },
  { provider: "lovable", model: "google/gemini-3-flash-preview" },
];
export const MODEL_REGISTRY: ModelEntry[] = [
  entry({
    id: "prismx/uncensored",
    displayName: "PrismX Uncensored",
    candidates: CHAIN_UNCENSORED,
    contextLength: 131_072,
    capabilities: cap({ vision: true }),
    free: true,
    availability: "available",
  }),
  entry({
    id: "prismx/flash",
    displayName: "PrismX Flash",
    candidates: CHAIN_BALANCED,
    contextLength: 131_072,
    capabilities: cap({ vision: true }),
    free: true,
    availability: "available",
  }),
  entry({
    id: "prismx/flash-lite",
    displayName: "PrismX Flash Lite",
    candidates: CHAIN_FAST,
    contextLength: 131_072,
    capabilities: cap({ vision: true }),
    free: true,
    availability: "available",
  }),
  entry({
    id: "prismx/pro",
    displayName: "PrismX Pro",
    candidates: CHAIN_PRO,
    contextLength: 131_072,
    capabilities: cap({ vision: true, reasoning: true }),
    free: true,
    availability: "available",
  }),

  // --------- Image ---------
  entry({
    id: "prismx/image",
    displayName: "PrismX Image",
    // Venice SD is uncensored; Gemini image is the SFW-but-reliable fallback.
    candidates: [
      { provider: "venice", model: "venice-sd35" },
      { provider: "lovable", model: "google/gemini-3.1-flash-image" },
      { provider: "openrouter", model: "google/gemini-2.5-flash-image" },
    ],
    contextLength: 32_000,
    capabilities: cap({ vision: true, images: true }),
    free: false,
    availability: "available",
  }),
];

/** Uncensored is the default now — that's the point of the app. */
export const DEFAULT_CHAT_MODEL_ID = "prismx/uncensored";
export const DEFAULT_IMAGE_MODEL_ID = "prismx/image";

export function getModel(id?: string | null): ModelEntry | undefined {
  if (!id) return undefined;
  return MODEL_REGISTRY.find((m) => m.id === id);
}

export function requireChatModel(id?: string | null): ModelEntry {
  const m = getModel(id) ?? getModel(DEFAULT_CHAT_MODEL_ID);
  if (!m) throw new Error("No chat model registered.");
  return m;
}

export function requireImageModel(id?: string | null): ModelEntry {
  const m = getModel(id) ?? getModel(DEFAULT_IMAGE_MODEL_ID);
  if (!m || !m.capabilities.images) {
    throw new Error("No image model available.");
  }
  return m;
}

export function isFreeModel(id: string): boolean {
  const m = getModel(id);
  return !!m && m.free && m.availability === "available";
}

export function publicModelList() {
  return MODEL_REGISTRY.filter((m) => m.availability === "available").map((m) => ({
    id: m.id,
    displayName: m.displayName,
    provider: m.provider,
    contextLength: m.contextLength,
    capabilities: m.capabilities,
    free: m.free,
  }));
}
