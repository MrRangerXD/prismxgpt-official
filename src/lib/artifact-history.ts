/**
 * Local version history for artifacts.
 *
 * Every time an artifact is rendered we record a snapshot keyed by project
 * name. History is append-only and capped; it never mutates chat messages, so
 * completed generations stay read-only history exactly like images.
 */
import type { ArtifactFile, ProjectArtifact } from "./artifacts";

export type ArtifactVersion = {
  version: number;
  createdAt: number;
  messageId: string;
  files: ArtifactFile[];
};

const KEY = "prismx.artifact.versions.v1";
const MAX_PROJECTS = 40;
const MAX_VERSIONS = 12;

type Store = Record<string, ArtifactVersion[]>;

function read(): Store {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Store) : {};
  } catch {
    return {};
  }
}

function write(store: Store) {
  try {
    const keys = Object.keys(store);
    if (keys.length > MAX_PROJECTS) {
      for (const k of keys.slice(0, keys.length - MAX_PROJECTS)) delete store[k];
    }
    window.localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* quota — history is best-effort */
  }
}

function fingerprint(files: ArtifactFile[]): string {
  return files.map((f) => `${f.path}:${f.code.length}`).join("|");
}

/** Records the artifact if it differs from the newest snapshot; returns history. */
export function recordArtifactVersion(
  artifact: ProjectArtifact,
  messageId: string,
): ArtifactVersion[] {
  const store = read();
  const key = artifact.name.toLowerCase().trim();
  const list = store[key] ?? [];
  const last = list[list.length - 1];
  if (last && fingerprint(last.files) === fingerprint(artifact.files)) return list;
  const next: ArtifactVersion = {
    version: (last?.version ?? 0) + 1,
    createdAt: Date.now(),
    messageId,
    files: artifact.files,
  };
  const updated = [...list, next].slice(-MAX_VERSIONS);
  store[key] = updated;
  write(store);
  return updated;
}

export function getArtifactVersions(name: string): ArtifactVersion[] {
  return read()[name.toLowerCase().trim()] ?? [];
}
