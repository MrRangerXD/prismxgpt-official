/**
 * PrismXGPT model registry.
 *
 * Provider-agnostic catalogue. The application only speaks in these canonical
 * model ids; the provider layer maps each one to an ordered list of upstream
 * candidates (provider + upstream model id) and fails over between them at
 * request time. Keys are read from the environment on the server only.
 */

export type ProviderName = "groq" | "openrouter" | "lovable";

/** One concrete upstream target for a canonical model. */
export type ModelCandidate = {
  provider: ProviderName;
  /** Exact model id sent to that provider. */
  model: string;
};

export type ModelCapabilities = {
  streaming: boolean;
  vision: boolean;
  reasoning: boolean;
  images: boolean;
};

export type ModelEntry = {
  id: string; // canonical id (what the app uses)
  displayName: string;
  /** Primary provider (the first candidate) — informational. */
  provider: ProviderName;
  /** Ordered failover chain. First available + healthy wins. */
  candidates: ModelCandidate[];
  /** Kept for logging/back-compat: the primary upstream model id. */
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
 * Free-tier chains.
 * - Groq free tier serves the OpenAI `gpt-oss` open models reliably and fast.
 * - OpenRouter `:free` models are the secondary chain (rate limited per model,
 *   so several are listed).
 * - The Lovable gateway is kept last: it only serves when the workspace has
 *   credits, and never blocks a request when it does not.
 */
const TEXT_CHAIN_FAST: ModelCandidate[] = [
  { provider: "groq", model: "openai/gpt-oss-20b" },
  { provider: "groq", model: "openai/gpt-oss-120b" },
  { provider: "openrouter", model: "openai/gpt-oss-20b:free" },
  { provider: "openrouter", model: "z-ai/glm-5.2:free" },
  { provider: "lovable", model: "google/gemini-3-flash-preview" },
];

const TEXT_CHAIN_BALANCED: ModelCandidate[] = [
  { provider: "groq", model: "openai/gpt-oss-120b" },
  { provider: "groq", model: "qwen/qwen3.6-27b" },
  { provider: "openrouter", model: "z-ai/glm-5.2:free" },
  { provider: "openrouter", model: "nvidia/nemotron-3-super-120b-a12b:free" },
  { provider: "lovable", model: "google/gemini-3-flash-preview" },
];

const TEXT_CHAIN_PRO: ModelCandidate[] = [
  { provider: "groq", model: "openai/gpt-oss-120b" },
  { provider: "openrouter", model: "nvidia/nemotron-3-ultra-550b-a55b:free" },
  { provider: "openrouter", model: "nvidia/nemotron-3-super-120b-a12b:free" },
  { provider: "openrouter", model: "z-ai/glm-5.2:free" },
  { provider: "lovable", model: "google/gemini-2.5-pro" },
];

/** Vision-capable free chain (used when the turn contains an image part). */
export const VISION_CHAIN: ModelCandidate[] = [
  { provider: "openrouter", model: "nvidia/nemotron-nano-12b-v2-vl:free" },
  { provider: "openrouter", model: "google/gemma-4-31b-it:free" },
  { provider: "lovable", model: "google/gemini-3-flash-preview" },
];

export const MODEL_REGISTRY: ModelEntry[] = [
  entry({
    id: "prismx/flash",
    displayName: "PrismX Flash",
    candidates: TEXT_CHAIN_BALANCED,
    contextLength: 131_072,
    capabilities: cap({ vision: true }),
    free: true,
    availability: "available",
  }),
  entry({
    id: "prismx/flash-lite",
    displayName: "PrismX Flash Lite",
    candidates: TEXT_CHAIN_FAST,
    contextLength: 131_072,
    capabilities: cap({ vision: true }),
    free: true,
    availability: "available",
  }),
  entry({
    id: "prismx/pro",
    displayName: "PrismX Pro",
    candidates: TEXT_CHAIN_PRO,
    contextLength: 131_072,
    capabilities: cap({ vision: true, reasoning: true }),
    free: true,
    availability: "available",
  }),

  // --------- Image ---------
  entry({
    id: "prismx/image",
    displayName: "PrismX Image",
    // No free-tier image provider exists on the configured keys; the Lovable
    // gateway is the only legitimately configured image backend.
    candidates: [
      { provider: "lovable", model: "google/gemini-3.1-flash-image" },
      { provider: "openrouter", model: "google/gemini-2.5-flash-image" },
    ],
    contextLength: 32_000,
    capabilities: cap({ vision: true, images: true }),
    free: false,
    availability: "available",
  }),
];

export const DEFAULT_CHAT_MODEL_ID = "prismx/flash";
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
