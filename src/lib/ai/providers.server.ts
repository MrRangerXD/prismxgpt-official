/**
 * Provider abstraction for PrismXGPT.
 *
 * The rest of the app never talks to OpenRouter or Groq directly. It resolves
 * a canonical model id via the registry and calls into these helpers. Only
 * two providers exist today; adding a third means adding a case here and
 * an entry in the registry — no UI change is required.
 */
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";
import {
  MODEL_REGISTRY,
  DEFAULT_CHAT_MODEL_ID,
  type ModelEntry,
  type ProviderName,
} from "./registry";

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";
const GROQ_BASE = "https://api.groq.com/openai/v1";
const APP_REFERER = "https://prismxgpt.lovable.app";

export function hasProviderKey(provider: ProviderName): boolean {
  return provider === "openrouter"
    ? !!process.env.OPENROUTER_API_KEY
    : !!process.env.GROQ_API_KEY;
}

function readKey(provider: ProviderName): string {
  const key = provider === "openrouter"
    ? process.env.OPENROUTER_API_KEY
    : process.env.GROQ_API_KEY;
  if (!key) throw new Error(`Missing ${provider.toUpperCase()}_API_KEY`);
  return key;
}

function chatbotName(): string {
  return process.env.NEXT_PUBLIC_CHATBOT_NAME ?? "PrismXGPT";
}

/** Returns a Vercel-AI-SDK LanguageModel for the given registry entry. */
export function resolveLanguageModel(entry: ModelEntry): LanguageModel {
  if (entry.provider === "openrouter") {
    const provider = createOpenAICompatible({
      name: "openrouter",
      baseURL: OPENROUTER_BASE,
      headers: {
        Authorization: `Bearer ${readKey("openrouter")}`,
        "HTTP-Referer": APP_REFERER,
        "X-Title": chatbotName(),
      },
    });
    return provider(entry.upstreamId);
  }
  const provider = createOpenAICompatible({
    name: "groq",
    baseURL: GROQ_BASE,
    headers: { Authorization: `Bearer ${readKey("groq")}` },
  });
  return provider(entry.upstreamId);
}

/**
 * Resolve a chat model with automatic provider fallback.
 *
 * Preference order:
 *   1. The requested entry (if its provider key is available).
 *   2. The default chat model (if its provider key is available).
 *   3. Any registry entry from a provider whose key IS configured.
 *
 * Only free entries live in the registry so the fallback can never
 * silently promote to a paid model.
 */
export function resolveChatModelWithFallback(preferred?: ModelEntry): {
  entry: ModelEntry;
  model: LanguageModel;
} {
  const candidates: Array<ModelEntry | undefined> = [
    preferred,
    MODEL_REGISTRY.find((m) => m.id === DEFAULT_CHAT_MODEL_ID),
    ...MODEL_REGISTRY.filter((m) => !m.capabilities.images && m.availability === "available"),
  ];
  for (const entry of candidates) {
    if (!entry) continue;
    if (entry.capabilities.images) continue;
    if (!hasProviderKey(entry.provider)) continue;
    return { entry, model: resolveLanguageModel(entry) };
  }
  throw new Error("No AI provider is configured.");
}


// ---------------------------------------------------------------------------
// Image generation (OpenRouter chat-completions + image modality)
// ---------------------------------------------------------------------------

export type ImageGenResult =
  | { ok: true; dataUrl: string; mimeType: string }
  | { ok: false; status: number; message: string };

export async function generateImage(params: {
  entry: ModelEntry;
  prompt: string;
  inputImageUrl?: string;
  signal?: AbortSignal;
}): Promise<ImageGenResult> {
  const { entry, prompt, inputImageUrl, signal } = params;
  if (entry.provider !== "openrouter") {
    return { ok: false, status: 400, message: "Only OpenRouter image models are supported." };
  }

  const key = readKey("openrouter");
  const userContent: Array<Record<string, unknown>> = [{ type: "text", text: prompt }];
  if (inputImageUrl) {
    userContent.push({ type: "image_url", image_url: { url: inputImageUrl } });
  }

  let res: Response;
  try {
    res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
      method: "POST",
      signal,
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "HTTP-Referer": APP_REFERER,
        "X-Title": chatbotName(),
      },
      body: JSON.stringify({
        model: entry.upstreamId,
        modalities: ["image", "text"],
        messages: [{ role: "user", content: userContent }],
      }),
    });
  } catch (e) {
    console.error("[ai/providers] image network error", e);
    return { ok: false, status: 502, message: "Couldn't reach the image service. Please try again in a moment." };
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("[ai/providers] image upstream error", res.status, text);
    return { ok: false, status: res.status, message: friendlyImageError(res.status, text) };
  }

  let json: {
    choices?: Array<{
      message?: {
        content?: unknown;
        images?: Array<{ type?: string; image_url?: { url?: string } }>;
      };
    }>;
  };
  try {
    json = await res.json();
  } catch (e) {
    console.error("[ai/providers] image bad json", e);
    return { ok: false, status: 502, message: "The image service returned an unexpected response." };
  }

  const msg = json.choices?.[0]?.message;
  // OpenRouter returns generated images under `message.images[]` (data URLs
  // in `image_url.url`). Some models still inline them in `content` blocks.
  const fromImagesArr = msg?.images?.[0]?.image_url?.url;
  const fromContent = Array.isArray(msg?.content)
    ? (msg?.content as Array<Record<string, unknown>>).find(
        (c) => (c as { type?: string }).type === "image_url",
      )
    : undefined;
  const contentUrl =
    fromContent && typeof (fromContent as { image_url?: { url?: string } }).image_url?.url === "string"
      ? (fromContent as { image_url: { url: string } }).image_url.url
      : undefined;
  const dataUrl = fromImagesArr ?? contentUrl;

  if (!dataUrl || !dataUrl.startsWith("data:")) {
    return {
      ok: false,
      status: 502,
      message: "No image was returned. Please try a different prompt.",
    };
  }
  const mimeMatch = /^data:([^;]+);base64,/.exec(dataUrl);
  const mimeType = mimeMatch?.[1] ?? "image/png";
  return { ok: true, dataUrl, mimeType };
}

function friendlyImageError(status: number, upstream: string): string {
  if (status === 401 || status === 403) return "Image provider rejected the request. Please try again.";
  if (status === 402) return "Image generation credits are exhausted. Please try again later.";
  if (status === 429) return "Too many image requests right now — please wait a moment and try again.";
  if (/content.?policy|moderation|safety/i.test(upstream)) {
    return "That prompt was blocked by the safety filter. Try rephrasing without names of real people, brands, or copyrighted characters.";
  }
  if (status >= 500) return "Image generation is temporarily unavailable. Please try again in a moment.";
  return "I couldn't generate that image. Try a different prompt or try again.";
}
