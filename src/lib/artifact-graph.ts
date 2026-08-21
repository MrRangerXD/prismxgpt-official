/**
 * Import/reference graph for generated projects.
 *
 * Builds the edge list between emitted files and reports the deterministic
 * problems a build would hit: unresolved relative imports, wrong casing,
 * missing extensions, HTML that references a stylesheet or script that was
 * never emitted, and external packages missing from package.json.
 *
 * Every fix it proposes is mechanical (rewrite a specifier to the file that
 * actually exists) — semantic problems are left to the AI repair prompt.
 */
import type { ArtifactFile, ProjectArtifact } from "./artifacts";

export type GraphEdge = { from: string; spec: string; to: string | null; external: boolean };

export type GraphReport = {
  edges: GraphEdge[];
  /** Relative specifiers that resolve to nothing in the project. */
  unresolved: { from: string; spec: string; suggestion?: string }[];
  /** External packages imported but absent from package.json. */
  missingPackages: string[];
  /** HTML href/src targets that were never emitted. */
  missingAssets: { from: string; ref: string }[];
};

const JS_EXTS = ["ts", "tsx", "js", "jsx", "mjs", "cjs"];

export function ext(path: string): string {
  const base = path.split("/").pop() ?? path;
  return base.includes(".") ? base.split(".").pop()!.toLowerCase() : "";
}

function isJsLike(path: string): boolean {
  return JS_EXTS.includes(ext(path));
}

const CANDIDATE_SUFFIXES = [
  "",
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".json",
  ".css",
  ".scss",
  ".vue",
  ".svelte",
  "/index.ts",
  "/index.tsx",
  "/index.js",
  "/index.jsx",
];

export function joinPath(fromPath: string, spec: string): string {
  const stack = fromPath.split("/").slice(0, -1);
  for (const seg of spec.split("/")) {
    if (seg === "." || seg === "") continue;
    if (seg === "..") stack.pop();
    else stack.push(seg);
  }
  return stack.join("/");
}

/** Resolves a relative specifier to a real emitted path, or null. */
export function resolveSpec(fromPath: string, spec: string, paths: Set<string>): string | null {
  const base = joinPath(fromPath, spec);
  for (const suffix of CANDIDATE_SUFFIXES) {
    if (paths.has(base + suffix)) return base + suffix;
  }
  return null;
}

/** Case-insensitive resolution — used to repair wrong-casing imports. */
function resolveLoose(fromPath: string, spec: string, paths: Set<string>): string | null {
  const base = joinPath(fromPath, spec).toLowerCase();
  const lower = new Map<string, string>();
  for (const p of paths) lower.set(p.toLowerCase(), p);
  for (const suffix of CANDIDATE_SUFFIXES) {
    const hit = lower.get(base + suffix);
    if (hit) return hit;
  }
  // Last resort: unique basename match anywhere in the tree.
  const wanted = base.split("/").pop()!.replace(/\.[a-z0-9]+$/, "");
  const matches = [...paths].filter((p) => {
    const b = (p.split("/").pop() ?? "").toLowerCase();
    return b === wanted || b.replace(/\.[a-z0-9]+$/, "") === wanted;
  });
  return matches.length === 1 ? matches[0] : null;
}

/** Turns an absolute project path back into a relative specifier. */
export function relativeSpec(fromPath: string, toPath: string): string {
  const from = fromPath.split("/").slice(0, -1);
  const to = toPath.split("/");
  const file = to.pop()!;
  let i = 0;
  while (i < from.length && i < to.length && from[i] === to[i]) i++;
  const up = from.slice(i).map(() => "..");
  const down = to.slice(i);
  const stripped = isJsLike(file) ? file.replace(/\.(ts|tsx|jsx|mjs|cjs)$/, "") : file;
  const parts = [...up, ...down, stripped];
  const spec = parts.join("/");
  return spec.startsWith(".") ? spec : `./${spec}`;
}

export function collectImports(file: ArtifactFile): { spec: string; index: number }[] {
  const out: { spec: string; index: number }[] = [];
  const re =
    /(?:import\s[^'"]*from\s*|import\s*|export\s[^'"]*from\s*|require\(\s*|import\(\s*)["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(file.code)) !== null) out.push({ spec: m[1], index: m.index });
  return out;
}

export function collectHtmlRefs(code: string): string[] {
  const out: string[] = [];
  const re = /(?:href|src)\s*=\s*["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code)) !== null) {
    const ref = m[1];
    if (/^(https?:|data:|mailto:|tel:|#|\/\/)/i.test(ref)) continue;
    out.push(ref.split(/[?#]/)[0]);
  }
  return out;
}

function packageRoot(spec: string): string {
  if (spec.startsWith("@")) return spec.split("/").slice(0, 2).join("/");
  return spec.split("/")[0];
}

const BUILTIN = new Set([
  "fs",
  "path",
  "url",
  "http",
  "https",
  "crypto",
  "os",
  "events",
  "stream",
  "util",
  "zlib",
  "net",
  "child_process",
  "buffer",
  "process",
  "assert",
  "timers",
  "worker_threads",
]);

export function buildGraph(artifact: ProjectArtifact): GraphReport {
  const paths = new Set(artifact.files.map((f) => f.path));
  const edges: GraphEdge[] = [];
  const unresolved: GraphReport["unresolved"] = [];
  const missingAssets: GraphReport["missingAssets"] = [];
  const externals = new Set<string>();

  for (const file of artifact.files) {
    if (isJsLike(file.path)) {
      for (const { spec } of collectImports(file)) {
        if (spec.startsWith(".")) {
          const to = resolveSpec(file.path, spec, paths);
          edges.push({ from: file.path, spec, to, external: false });
          if (!to) {
            const loose = resolveLoose(file.path, spec, paths);
            unresolved.push({
              from: file.path,
              spec,
              suggestion: loose ? relativeSpec(file.path, loose) : undefined,
            });
          }
        } else if (!spec.startsWith("/") && !spec.startsWith("node:")) {
          const root = packageRoot(spec);
          if (!BUILTIN.has(root)) externals.add(root);
          edges.push({ from: file.path, spec, to: null, external: true });
        }
      }
    }
    if (["html", "htm"].includes(ext(file.path))) {
      for (const ref of collectHtmlRefs(file.code)) {
        const target = joinPath(file.path, ref.startsWith(".") ? ref : `./${ref}`);
        if (!paths.has(target)) missingAssets.push({ from: file.path, ref });
      }
    }
  }

  // Declared dependencies.
  const pkgFile = artifact.files.find((f) => /(^|\/)package\.json$/.test(f.path));
  let missingPackages: string[] = [];
  if (pkgFile) {
    try {
      const pkg = JSON.parse(pkgFile.code) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
        peerDependencies?: Record<string, string>;
      };
      const declared = new Set([
        ...Object.keys(pkg.dependencies ?? {}),
        ...Object.keys(pkg.devDependencies ?? {}),
        ...Object.keys(pkg.peerDependencies ?? {}),
      ]);
      missingPackages = [...externals].filter((p) => !declared.has(p)).sort();
    } catch {
      /* invalid JSON is reported by validation */
    }
  }

  return { edges, unresolved, missingPackages, missingAssets };
}

/**
 * Rewrites relative import specifiers that don't resolve but unambiguously
 * match an emitted file (wrong casing, wrong/missing extension, moved file).
 * Returns the patched files and a human-readable list of what changed.
 */
export function repairImportPaths(files: ArtifactFile[]): {
  files: ArtifactFile[];
  applied: string[];
} {
  const paths = new Set(files.map((f) => f.path));
  const applied: string[] = [];
  const next = files.map((file) => {
    if (!isJsLike(file.path)) return file;
    let code = file.code;
    for (const { spec } of collectImports(file)) {
      if (!spec.startsWith(".")) continue;
      if (resolveSpec(file.path, spec, paths)) continue;
      const loose = resolveLoose(file.path, spec, paths);
      if (!loose) continue;
      const fixed = relativeSpec(file.path, loose);
      if (fixed === spec) continue;
      const before = code;
      code = code.split(`"${spec}"`).join(`"${fixed}"`).split(`'${spec}'`).join(`'${fixed}'`);
      if (code !== before) applied.push(`${file.path}: "${spec}" → "${fixed}"`);
    }
    return code === file.code ? file : { ...file, code };
  });
  return { files: next, applied };
}
