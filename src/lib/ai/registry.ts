/**
 * PrismXGPT model registry.
 *
 * Provider-agnostic catalogue. The application only speaks in these
 * canonical model ids; the provider layer maps them to the actual
 * upstream ids at request time. Only FREE OpenRouter models and
 * Groq's free-tier models are exposed. Paid models are never listed
 * and cannot be selected from the UI.
 */

export type ProviderName = "openrouter" | "groq";

export type ModelCapabilities = {
  streaming: boolean;
  vision: boolean;
  reasoning: boolean;
  images: boolean;
};

export type ModelEntry = {
  id: string;                 // canonical id (what the app uses)
  displayName: string;
  provider: ProviderName;
  upstreamId: string;         // exact id sent to the provider
  contextLength: number;
  capabilities: ModelCapabilities;
  free: true;                 // registry only exposes free models
  availability: "available" | "unavailable";
};

const cap = (partial: Partial<ModelCapabilities>): ModelCapabilities => ({
  streaming: true,
  vision: false,
  reasoning: false,
  images: false,
  ...partial,
});

export const MODEL_REGISTRY: ModelEntry[] = [
  // --------- Groq (ultra-fast free inference) ---------
  {
    id: "groq/llama-3.3-70b",
    displayName: "Llama 3.3 70B (Groq)",
    provider: "groq",
    upstreamId: "llama-3.3-70b-versatile",
    contextLength: 131072,
    capabilities: cap({}),
    free: true,
    availability: "available",
  },
  {
    id: "groq/llama-3.1-8b-instant",
    displayName: "Llama 3.1 8B Instant (Groq)",
    provider: "groq",
    upstreamId: "llama-3.1-8b-instant",
    contextLength: 131072,
    capabilities: cap({}),
    free: true,
    availability: "available",
  },
  {
    id: "groq/deepseek-r1-distill-llama-70b",
    displayName: "DeepSeek R1 Distill 70B (Groq)",
    provider: "groq",
    upstreamId: "deepseek-r1-distill-llama-70b",
    contextLength: 131072,
    capabilities: cap({ reasoning: true }),
    free: true,
    availability: "available",
  },
  {
    id: "groq/gemma2-9b",
    displayName: "Gemma 2 9B (Groq)",
    provider: "groq",
    upstreamId: "gemma2-9b-it",
    contextLength: 8192,
    capabilities: cap({}),
    free: true,
    availability: "available",
  },

  // --------- OpenRouter FREE models ---------
  {
    id: "openrouter/gemini-2.0-flash",
    displayName: "Gemini 2.0 Flash (Free)",
    provider: "openrouter",
    upstreamId: "google/gemini-2.0-flash-exp:free",
    contextLength: 1_048_576,
    capabilities: cap({ vision: true }),
    free: true,
    availability: "available",
  },
  {
    id: "openrouter/deepseek-v3",
    displayName: "DeepSeek V3 (Free)",
    provider: "openrouter",
    upstreamId: "deepseek/deepseek-chat-v3.1:free",
    contextLength: 163840,
    capabilities: cap({}),
    free: true,
    availability: "available",
  },
  {
    id: "openrouter/deepseek-r1",
    displayName: "DeepSeek R1 (Free)",
    provider: "openrouter",
    upstreamId: "deepseek/deepseek-r1:free",
    contextLength: 163840,
    capabilities: cap({ reasoning: true }),
    free: true,
    availability: "available",
  },
  {
    id: "openrouter/llama-3.3-70b",
    displayName: "Llama 3.3 70B (Free)",
    provider: "openrouter",
    upstreamId: "meta-llama/llama-3.3-70b-instruct:free",
    contextLength: 131072,
    capabilities: cap({}),
    free: true,
    availability: "available",
  },
  {
    id: "openrouter/qwen-2.5-72b",
    displayName: "Qwen 2.5 72B (Free)",
    provider: "openrouter",
    upstreamId: "qwen/qwen-2.5-72b-instruct:free",
    contextLength: 32768,
    capabilities: cap({}),
    free: true,
    availability: "available",
  },
  {
    id: "openrouter/mistral-small",
    displayName: "Mistral Small 3.1 (Free)",
    provider: "openrouter",
    upstreamId: "mistralai/mistral-small-3.1-24b-instruct:free",
    contextLength: 96000,
    capabilities: cap({ vision: true }),
    free: true,
    availability: "available",
  },
  {
    id: "openrouter/kimi",
    displayName: "Kimi K2 (Free)",
    provider: "openrouter",
    upstreamId: "moonshotai/kimi-k2:free",
    contextLength: 65536,
    capabilities: cap({}),
    free: true,
    availability: "available",
  },
  {
    id: "openrouter/gemma-2-9b",
    displayName: "Gemma 2 9B (Free)",
    provider: "openrouter",
    upstreamId: "google/gemma-2-9b-it:free",
    contextLength: 8192,
    capabilities: cap({}),
    free: true,
    availability: "available",
  },

  // --------- OpenRouter FREE image model ---------
  {
    id: "openrouter/gemini-image",
    displayName: "Gemini 2.5 Flash Image (Free)",
    provider: "openrouter",
    upstreamId: "google/gemini-2.5-flash-image-preview:free",
    contextLength: 32000,
    capabilities: cap({ vision: true, images: true }),
    free: true,
    availability: "available",
  },
];

// Defaults chosen per surface. Chat defaults to a fast, vision-capable
// free model; image gen has exactly one free choice today.
export const DEFAULT_CHAT_MODEL_ID = "openrouter/gemini-2.0-flash";
export const DEFAULT_IMAGE_MODEL_ID = "openrouter/gemini-image";

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
