import { CODING_PERSONA, REPAIR_PERSONA } from './artifact-prompts';
import { routeFor } from './model-router';
import { planProject, buildOrder } from './artifact-planner';
import { validate, scoreOf, type Diagnostic } from './artifact-validate';
import { parseMessageSegments, repairArtifact, type ProjectArtifact } from './artifact-workspace';

const MAX_ROUNDS = 4;

export async function runCodegen(opts: {
  prompt: string;
  base?: ProjectArtifact;
  onArtifact: (a: ProjectArtifact) => void;
  onStatus: (s: string) => void;
}): Promise<{ artifact: ProjectArtifact; diagnostics: Diagnostic[]; stable: boolean }> {
  const tree = Object.keys(opts.base?.files ?? {});

  opts.onStatus('planning');
  const plan = await planProject(opts.prompt, tree);
  const layers = buildOrder(plan);

  let artifact: ProjectArtifact = opts.base ?? { id: crypto.randomUUID(), files: {} };
  const written: string[] = [];

  // Leaf-first generation, layer by layer
  for (const layer of layers) {
    for (const entry of layer) {
      opts.onStatus(`writing ${entry.path}`);
      const { url, headers, body } = routeFor('code');
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          ...body,
          messages: [
            { role: 'system', content: CODING_PERSONA },
            {
              role: 'user',
              content: [
                `REQUEST:\n${opts.prompt}`,
                `WRITE ONLY THIS FILE: ${entry.path}`,
                `PURPOSE: ${entry.purpose}`,
                `DEPENDS ON: ${entry.deps.join(', ') || '-'}`,
                `ALREADY WRITTEN (import from these, signatures match):\n${written.join('\n') || '-'}`,
                `EXISTING TREE:\n${tree.join('\n') || '(none)'}`,
              ].join('\n\n'),
            },
          ],
        }),
      });
      const seg = parseMessageSegments(await res.text());
      artifact = mergeOps(artifact, seg);
      written.push(entry.path);
      opts.onArtifact(artifact);
    }
  }

  // Repair until stable
  let stable = false;
  let best = Infinity;
  for (let round = 0; round < MAX_ROUNDS; round++) {
    let diags = await validate(artifact);

    // deterministic pehle — free aur safe
    artifact = repairArtifact(artifact);
    diags = await validate(artifact);

    if (!diags.length) { stable = true; break; }

    const score = scoreOf(diags);
    if (score >= best) break;   // progress nahi hua
    best = score;

    opts.onStatus(`repairing (${diags.length} issues)`);
    const { url, headers, body } = routeFor('repair');
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        ...body,
        messages: [
          { role: 'system', content: REPAIR_PERSONA },
          { role: 'user', content: `DIAGNOSTICS:\n${JSON.stringify(diags, null, 1)}\n\nFILES:\n${dumpFiles(artifact, diags)}` },
        ],
      }),
    });
    artifact = mergeOps(artifact, parseMessageSegments(await res.text()));
    opts.onArtifact(artifact);
  }

  const final = await validate(artifact);
  return { artifact, diagnostics: final, stable: stable || final.length === 0 };
}

function dumpFiles(a: ProjectArtifact, d: Diagnostic[]) {
  const paths = [...new Set(d.map((x) => x.path))];
  return paths.map((p) => `=== FILE: ${p} ===\n${a.files[p]?.content ?? '(missing)'}`).join('\n\n');
}
