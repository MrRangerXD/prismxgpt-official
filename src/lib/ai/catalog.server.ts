/**
 * OpenRouter model catalog loader.
 *
 * Fetches the live OpenRouter `/models` list and caches it for one hour so
 * PrismXGPT's advertised model set stays in sync with whatever OpenRouter
 * currently marks as free. If the fetch fails we degrade to the built-in
 * registry so chat always has *some* model to talk to.
 */
import { MODEL_REGISTRY, type ModelEntry, type ProviderName } from "./registry";

type OpenRouterModel = {
  id: string;
  name?: string;
  context_length?: number;
  architecture?: { modality?: string; input_modalities?: string[]; output_modalities?: string[] };
  pricing?: { prompt?: string; completion?: string; image?: string };
};

type CatalogCache = { at: number; entries: ModelEntry[] };
let cache: CatalogCache | undefined;
const TTL_MS = 60 * 60 * 1000;

const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";

function isZeroPrice(v?: string): boolean {
  if (!v) return true;
  const n = Number(v);
  return Number.isFinite(n) && n === 0;
}

function looksFree(m: OpenRouterModel): boolean {
  const suffix = m.id.endsWith(":free");
  const zero = isZeroPrice(m.pricing?.prompt) && isZeroPrice(m.pricing?.completion);
  return suffix && zero;
}

function toEntry(m: OpenRouterModel): ModelEntry {
  const input = m.architecture?.input_modalities ?? [];
  const output = m.architecture?.output_modalities ?? [];
  const vision = input.includes("image");
  const images = output.includes("image");
  return {
    id: `openrouter/${m.id.replace(/:free$/, "")}`,
    displayName: m.name ?? m.id,
    provider: "openrouter" as ProviderName,
    upstreamId: m.id,
    contextLength: m.context_length ?? 8192,
    capabilities: { streaming: true, vision, reasoning: /r1|reason/i.test(m.id), images },
    free: true,
    availability: "available",
  };
}

async function fetchOpenRouterCatalog(): Promise<ModelEntry[] | undefined> {
  try {
    const res = await fetch(OPENROUTER_MODELS_URL, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return undefined;
    const json = (await res.json()) as { data?: OpenRouterModel[] };
    const items = Array.isArray(json.data) ? json.data : [];
    return items.filter(looksFree).map(toEntry);
  } catch (e) {
    console.warn("[ai/catalog] fetch failed", e);
    return undefined;
  }
}

/**
 * Returns the merged catalog: live free OpenRouter models (cached), plus
 * the hardcoded Groq entries from the static registry (Groq has no public
 * catalog endpoint that matches this shape).
 */
export async function loadCatalog(): Promise<ModelEntry[]> {
  const now = Date.now();
  if (!cache || now - cache.at > TTL_MS) {
    const live = await fetchOpenRouterCatalog();
    const openrouter =
      live && live.length > 0 ? live : MODEL_REGISTRY.filter((m) => m.provider === "openrouter");
    const groq = MODEL_REGISTRY.filter((m) => m.provider === "groq");
    cache = { at: now, entries: [...openrouter, ...groq] };
  }
  return cache.entries;
}

/** Invalidate the cache. Useful in tests or after admin actions. */
export function resetCatalogCache() {
  cache = undefined;
}

/** Look up a canonical id against the live catalog, falling back to the static registry. */
export async function resolveEntry(id?: string | null): Promise<ModelEntry | undefined> {
  if (!id) return undefined;
  const list = await loadCatalog();
  return list.find((m) => m.id === id) ?? MODEL_REGISTRY.find((m) => m.id === id);
}
