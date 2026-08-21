/**
 * Workspace continuity for generated projects.
 *
 * The model is told to re-emit ONLY the files that change on a follow-up edit
 * ("make the navbar better", "add auth"). Rendering that message on its own
 * would show a two-file project and export a two-file ZIP — the unchanged
 * files would silently disappear.
 *
 * This module folds an incoming (possibly partial) artifact onto the previous
 * workspace snapshot so the panel always operates on the COMPLETE project:
 *
 *   base (previous snapshot) + incoming files + DELETE/RENAME ops = workspace
 *
 * Nothing here mutates history: the merge is pure and derived, and the base
 * snapshot itself is never rewritten.
 */
import type { ArtifactFile, ProjectArtifact } from "./artifacts";

export type FileOps = {
  deletes: string[];
  renames: { from: string; to: string }[];
};

const DELETE_RE = /^[ \t>*-]*DELETE\s*:\s*([^\n]+)$/gim;
const RENAME_RE = /^[ \t>*-]*RENAME\s*:\s*([^\n]+?)\s*(?:->|→|to)\s*([^\n]+)$/gim;

function clean(path: string): string {
  return path
    .trim()
    .replace(/^[`'"]|[`'"]$/g, "")
    .replace(/^\.\//, "")
    .replace(/^\/+/, "")
    .replace(/\\/g, "/")
    .trim();
}

/** Extracts explicit file operations the model declared in its prose. */
export function parseFileOps(text: string): FileOps {
  const deletes: string[] = [];
  const renames: { from: string; to: string }[] = [];
  let m: RegExpExecArray | null;
  DELETE_RE.lastIndex = 0;
  while ((m = DELETE_RE.exec(text)) !== null) {
    const p = clean(m[1]);
    if (p && !p.includes(" ")) deletes.push(p);
  }
  RENAME_RE.lastIndex = 0;
  while ((m = RENAME_RE.exec(text)) !== null) {
    const from = clean(m[1]);
    const to = clean(m[2]);
    if (from && to && !from.includes(" ") && !to.includes(" ")) renames.push({ from, to });
  }
  return { deletes, renames };
}

/**
 * Folds `incoming` onto `base`. Unchanged base files are preserved verbatim,
 * incoming files win on conflict, renames move content, deletes remove.
 */
export function mergeWorkspace(
  base: ArtifactFile[],
  incoming: ArtifactFile[],
  ops: FileOps = { deletes: [], renames: [] },
): ArtifactFile[] {
  const map = new Map<string, ArtifactFile>();
  for (const f of base) map.set(f.path, f);

  for (const { from, to } of ops.renames) {
    const existing = map.get(from);
    if (!existing) continue;
    map.delete(from);
    map.set(to, { ...existing, path: to });
  }
  for (const path of ops.deletes) map.delete(path);
  for (const f of incoming) map.set(f.path, f);

  return [...map.values()].sort((a, b) => a.path.localeCompare(b.path));
}

/** True when `incoming` looks like an edit of `base` rather than a new project. */
export function looksLikeEdit(base: ArtifactFile[], incoming: ArtifactFile[]): boolean {
  if (base.length === 0 || incoming.length === 0) return false;
  if (incoming.length >= base.length) {
    // A full re-emit (or a superset) needs no merge.
    const basePaths = new Set(base.map((f) => f.path));
    return ![...basePaths].every((p) => incoming.some((f) => f.path === p));
  }
  return true;
}

/** Convenience wrapper returning a merged artifact. */
export function mergeArtifact(
  artifact: ProjectArtifact,
  base: ArtifactFile[],
  ops?: FileOps,
): ProjectArtifact {
  if (!base.length) return artifact;
  const files = mergeWorkspace(base, artifact.files, ops ?? artifact.ops);
  if (files.length === artifact.files.length) return { ...artifact, files };
  return { ...artifact, files };
}
