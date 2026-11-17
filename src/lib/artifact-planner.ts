import { PLAN_PERSONA } from './artifact-prompts';
import { routeFor } from './model-router';

export type PlanEntry = { path: string; purpose: string; deps: string[] };

export async function planProject(prompt: string, tree: string[]): Promise<PlanEntry[]> {
  const { url, headers, body } = routeFor('plan');
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      ...body,
      messages: [
        { role: 'system', content: PLAN_PERSONA },
        { role: 'user', content: `REQUEST:\n${prompt}\n\nEXISTING FILES:\n${tree.join('\n') || '(none)'}` },
      ],
    }),
  });
  const raw = await res.text();
  return parseManifest(raw);
}

export function parseManifest(raw: string): PlanEntry[] {
  const seen = new Set<string>();
  return raw
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.includes('::'))
    .map((l) => {
      const [path, purpose, depStr = ''] = l.split('::').map((s) => s.trim());
      return {
        path,
        purpose,
        deps: depStr.split(',').map((d) => d.trim()).filter((d) => d && d !== '-'),
      };
    })
    .filter((e) => e.path && !seen.has(e.path) && seen.add(e.path) !== undefined);
}

// Leaves first. Cycle ho to alphabetical tiebreak — planner deadlock na kare.
export function buildOrder(plan: PlanEntry[]): PlanEntry[][] {
  const done = new Set<string>();
  const layers: PlanEntry[][] = [];
  let remaining = [...plan];

  while (remaining.length) {
    const ready = remaining.filter((e) => e.deps.every((d) => done.has(d) || !plan.some((p) => p.path === d)));
    if (!ready.length) {
      layers.push(remaining.sort((a, b) => a.path.localeCompare(b.path)));
      break;
    }
    layers.push(ready);
    ready.forEach((e) => done.add(e.path));
    remaining = remaining.filter((e) => !done.has(e.path));
  }
  return layers;
}
