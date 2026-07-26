// Model registry surfaced on /developer/models and /api/v1/models
export type ApiModel = {
  id: string;
  name: string;
  provider: string;
  context: number;
  capabilities: string[];
  streaming: boolean;
  vision: boolean;
  reasoning: boolean;
  image: boolean;
  status: "stable" | "preview";
};

export const API_MODELS: ApiModel[] = [
  {
    id: "google/gemini-2.5-flash",
    name: "Gemini 2.5 Flash",
    provider: "Google",
    context: 1_048_576,
    capabilities: ["chat", "vision", "long-context"],
    streaming: true,
    vision: true,
    reasoning: false,
    image: false,
    status: "stable",
  },
  {
    id: "google/gemini-2.5-pro",
    name: "Gemini 2.5 Pro",
    provider: "Google",
    context: 2_097_152,
    capabilities: ["chat", "vision", "reasoning"],
    streaming: true,
    vision: true,
    reasoning: true,
    image: false,
    status: "stable",
  },
  {
    id: "openai/gpt-5",
    name: "GPT-5",
    provider: "OpenAI",
    context: 400_000,
    capabilities: ["chat", "reasoning", "vision"],
    streaming: true,
    vision: true,
    reasoning: true,
    image: false,
    status: "stable",
  },
  {
    id: "openai/gpt-5-mini",
    name: "GPT-5 Mini",
    provider: "OpenAI",
    context: 400_000,
    capabilities: ["chat", "vision"],
    streaming: true,
    vision: true,
    reasoning: false,
    image: false,
    status: "stable",
  },
  {
    id: "google/gemini-2.5-flash-image",
    name: "Gemini 2.5 Flash Image",
    provider: "Google",
    context: 32_768,
    capabilities: ["image-generation", "image-edit"],
    streaming: false,
    vision: true,
    reasoning: false,
    image: true,
    status: "stable",
  },
];

export function findModel(id: string) {
  return API_MODELS.find((m) => m.id === id);
}
