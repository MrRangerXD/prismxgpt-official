/**
 * PrismXGPT model registry.
 *
 * Provider-agnostic catalogue. The application only speaks in these
 * canonical model ids; the provider layer maps them to the actual
 * upstream ids at request time. All models are served through the
 * Lovable AI Gateway.
 */

export type ProviderName = "lovable";

export type ModelCapabilities = {
  streaming: boolean;
  vision: boolean;
  reasoning: boolean;
  images: boolean;
};

export type ModelEntry = {
  id: string; // canonical id (what the app uses)
  displayName: string;
  provider: ProviderName;
  upstreamId: string; // exact id sent to the gateway
  contextLength: number;
  capabilities: ModelCapabilities;
  free: true;
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
  {
    id: "prismx/flash",
    displayName: "PrismX Flash",
    provider: "lovable",
    upstreamId: "google/gemini-3-flash-preview",
    contextLength: 1_048_576,
    capabilities: cap({ vision: true }),
    free: true,
    availability: "available",
  },
  {
    id: "prismx/flash-lite",
    displayName: "PrismX Flash Lite",
    provider: "lovable",
    upstreamId: "google/gemini-2.5-flash",
    contextLength: 1_048_576,
    capabilities: cap({ vision: true }),
    free: true,
    availability: "available",
  },
  {
    id: "prismx/pro",
    displayName: "PrismX Pro",
    provider: "lovable",
    upstreamId: "google/gemini-2.5-pro",
    contextLength: 1_048_576,
    capabilities: cap({ vision: true, reasoning: true }),
    free: true,
    availability: "available",
  },

  // --------- Image ---------
  {
    id: "prismx/image",
    displayName: "PrismX Image",
    provider: "lovable",
    upstreamId: "google/gemini-3.1-flash-image",
    contextLength: 32000,
    capabilities: cap({ vision: true, images: true }),
    free: true,
    availability: "available",
  },
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
