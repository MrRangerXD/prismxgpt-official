import { CODING_PERSONA, REPAIR_PERSONA } from "./artifact-prompts";
import { planProject, buildOrder } from "./artifact-planner";
import { validate, scoreOf, type Diagnostic } from "./artifact-validate";
import { repairUntilStable } from "./artifact-repair";
import { parseMessageSegments, type ArtifactFile, type ProjectArtifact } from "./artifacts";
import { mergeWorkspace } from "./artifact-workspace";

const MAX_ROUNDS = 3;

export type ModelCall = (kind: "code" | "repair", system: string, user: string) => Promise<string>;

const empty = (name: string): ProjectArtifact => ({
  kind: "artifact",
  id: crypto.randomUUID(),
  name,
  files: [],
});

const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "project";

/** Folds a model reply onto the workspace, honouring its DELETE/RENAME lines. */
function absorb(current: ProjectArtifact, reply: string): ProjectArtifact {
  const files = parseMessageSegments(reply).flatMap((s) => (s.kind === "artifact" ? s.files : []));
  const ops = parseMessageSegments(reply).find((s) => s.kind === "artifact" && s.ops) as
    | ProjectArtifact
    | undefined;
  if (!files.length && !ops?.ops) return current;
  return { ...current, files: mergeWorkspace(current.files, files, ops?.ops) };
}

export async function runCodegen(opts: {
  prompt: string;
  call: ModelCall;
  base?: ProjectArtifact;
  onArtifact: (a: ProjectArtifact) => void;
  onStatus: (s: string) => void;
}): Promise<{ artifact: ProjectArtifact; diagnostics: Diagnostic[]; stable: boolean }> {
  let artifact = opts.base ?? empty(slug(opts.prompt));

  opts.onStatus("planning");
  const plan = await planProject(opts.prompt, artifact.files.map((f) => f.path));
  const written: string[] = [];

  for (const layer of buildOrder(plan)) {
    for (const entry of layer) {
      opts.onStatus(`writing ${entry.path}`);
      const reply = await opts.call(
        "code",
        CODING_PERSONA,
        [
          `REQUEST:\n${opts.prompt}`,
          `WRITE ONLY THIS FILE: ${entry.path}`,
          `PURPOSE: ${entry.purpose}`,
          `DEPENDS ON: ${entry.deps.join(", ") || "-"}`,
          `ALREADY WRITTEN — import from these, keep signatures identical:\n${written.join("\n") || "-"}`,
          `EXISTING TREE:\n${artifact.files.map((f) => f.path).join("\n") || "(none)"}`,
        ].join("\n\n"),
      );
      artifact = absorb(artifact, reply);
      written.push(entry.path);
      opts.onArtifact(artifact);
    }
  }

  // Deterministic repair first — free and safe.
  const pass = repairUntilStable(artifact);
  artifact = pass.artifact;
  opts.onArtifact(artifact);

  let best = scoreOf(pass.validation.issues.map((i) => ({
    path: i.path ?? "", code: "SYNTAX" as const, message: i.message,
  })));

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const diags = validate(artifact);
    if (!diags.length) break;

    const score = scoreOf(diags);
    if (score >= best) break; // no progress
    best = score;

    opts.onStatus(`repairing (${diags.length} issues)`);
    const touched = [...new Set(diags.map((d) => d.path))];
    const dump = touched
      .map((p) => {
        const f: ArtifactFile | undefined = artifact.files.find((x) => x.path === p);
        return `\`\`\`\n=== ${p} ===\n${f?.code ?? "(missing)"}\n\`\`\``;
      })
      .join("\n\n");

    const reply = await opts.call(
      "repair",
      REPAIR_PERSONA,
      `DIAGNOSTICS:\n${JSON.stringify(diags, null, 1)}\n\nFILES:\n${dump}`,
    );
    artifact = absorb(artifact, reply);
    opts.onArtifact(artifact);
  }

  const diagnostics = validate(artifact);
  return { artifact, diagnostics, stable: diagnostics.length === 0 };
}
