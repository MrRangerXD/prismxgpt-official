export type TaskKind = 'plan' | 'code' | 'repair' | 'chat' | 'explain';

type Route = { model: string; temperature: number; maxTokens: number; baseUrl: string };

// Venice direct use karo for codegen — raw prompt jaata hai, koi filter nahi.
// Lovable gateway sirf fallback rakho.
const VENICE = 'https://api.venice.ai/api/v1';

export const ROUTES: Record<TaskKind, Route> = {
  plan:    { model: 'deepseek-v4-flash-uncensored', temperature: 0.55, maxTokens: 4000,  baseUrl: VENICE },
  code:    { model: 'deepseek-v4-flash-uncensored', temperature: 0.2,  maxTokens: 32000, baseUrl: VENICE },
  repair:  { model: 'deepseek-v4-flash-uncensored', temperature: 0.05, maxTokens: 16000, baseUrl: VENICE },
  chat:    { model: 'deepseek-v4-flash-uncensored', temperature: 0.8,  maxTokens: 4000,  baseUrl: VENICE },
  explain: { model: 'deepseek-v4-flash-uncensored', temperature: 0.4,  maxTokens: 4000,  baseUrl: VENICE },
};

export function routeFor(kind: TaskKind) {
  const r = ROUTES[kind];
  return {
    url: `${r.baseUrl}/chat/completions`,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${import.meta.env.VITE_VENICE_API_KEY}`,
    },
    body: {
      model: r.model,
      temperature: r.temperature,
      max_tokens: r.maxTokens,
      stream: true,
      // Venice me yeh flag censorship off karta hai
      venice_parameters: { include_venice_system_prompt: false, enable_web_search: 'off' },
    },
  };
}
