import * as esbuild from 'esbuild-wasm';
import { buildGraph, findUnresolved, findWrongCasing, findMissingPackages } from './artifact-graph';
import type { ProjectArtifact } from './artifact-workspace';

export type Diagnostic = { path: string; code: string; message: string };

export async function validate(artifact: ProjectArtifact): Promise<Diagnostic[]> {
  const out: Diagnostic[] = [];

  // 1. Syntax — har ts/tsx/js/jsx file transform karke
  for (const [path, file] of Object.entries(artifact.files)) {
    if (!/\.(ts|tsx|js|jsx)$/.test(path)) continue;
    try {
      await esbuild.transform(file.content, { loader: path.endsWith('x') ? 'tsx' : 'ts', jsx: 'automatic' });
    } catch (e: any) {
      out.push({ path, code: 'SYNTAX', message: String(e?.errors?.[0]?.text ?? e) });
    }
  }

  // 2. Graph — unresolved, casing, missing deps (V4 ke functions reuse)
  const graph = buildGraph(artifact.files);
  out.push(...findUnresolved(graph).map((p) => ({ path: p, code: 'UNRESOLVED', message: 'import target missing' })));
  out.push(...findWrongCasing(graph).map((p) => ({ path: p, code: 'CASING', message: 'import casing mismatch' })));
  out.push(...findMissingPackages(graph).map((p) => ({ path: p, code: 'MISSING_DEP', message: 'package not declared' })));

  return out;
}

// Repair loop ke liye progress metric — same score = no progress = stop.
export function scoreOf(d: Diagnostic[]) {
  return d.length * 10 + d.filter((x) => x.code === 'SYNTAX').length * 50;
}
