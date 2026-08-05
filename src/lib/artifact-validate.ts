/**
 * Pre-flight validation for generated project artifacts.
 *
 * Runs entirely in the browser over the parsed artifact before a ZIP (or any
 * other export) is produced. It never blocks a download — it reports what a
 * reviewer would catch by hand: truncated files, placeholder code, broken
 * relative imports, HTML referencing assets that were never emitted, invalid
 * JSON, and missing project scaffolding (README, package.json, .env.example).
 */
import type { ArtifactFile, ProjectArtifact } from "./artifacts";

export type ArtifactIssue = {
  level: "error" | "warning";
  path?: string;
  message: string;
};

export type ArtifactValidation = {
  ok: boolean;
  errors: ArtifactIssue[];
  warnings: ArtifactIssue[];
  issues: ArtifactIssue[];
};

const PLACEHOLDER =
  /(\/\/|#|<!--|\/\*)\s*(\.{3}\s*)?(rest of (the )?code|your code here|implementation here|same as (above|before)|TODO\b|FIXME\b)/i;

const CODE_EXTS = new Set([
  "ts",
  "tsx",
  "js",
  "jsx",
  "mjs",
  "cjs",
  "vue",
  "svelte",
  "py",
  "go",
  "rs",
  "java",
  "php",
  "rb",
  "cs",
  "cpp",
  "c",
]);

function ext(path: string): string {
  const base = path.split("/").pop() ?? path;
  return base.includes(".") ? base.split(".").pop()!.toLowerCase() : "";
}

function isJsLike(path: string): boolean {
  return ["ts", "tsx", "js", "jsx", "mjs", "cjs"].includes(ext(path));
}

/** Resolves a relative specifier against the emitted file set. */
function resolvesTo(fromPath: string, spec: string, paths: Set<string>): boolean {
  const dir = fromPath.split("/").slice(0, -1);
  const segments = spec.split("/");
  const stack = [...dir];
  for (const seg of segments) {
    if (seg === "." || seg === "") continue;
    if (seg === "..") stack.pop();
    else stack.push(seg);
  }
  const base = stack.join("/");
  if (paths.has(base)) return true;
  const candidates = [
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
  return candidates.some((suffix) => paths.has(base + suffix));
}

function balanced(code: string): boolean {
  // Strips strings and comments, then checks bracket nesting. Deliberately
  // conservative: it only reports a problem when brackets clearly do not pair.
  const stripped = code
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/`(?:[^`\\]|\\.)*`/g, "``");
  const pairs: Record<string, string> = { ")": "(", "]": "[", "}": "{" };
  const stack: string[] = [];
  for (const ch of stripped) {
    if (ch === "(" || ch === "[" || ch === "{") stack.push(ch);
    else if (ch === ")" || ch === "]" || ch === "}") {
      if (stack.pop() !== pairs[ch]) return false;
    }
  }
  return stack.length === 0;
}

function collectImports(file: ArtifactFile): string[] {
  const out: string[] = [];
  const re =
    /(?:import\s[^'"]*from\s*|import\s*|export\s[^'"]*from\s*|require\(\s*)["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(file.code)) !== null) out.push(m[1]);
  return out;
}

function collectHtmlRefs(code: string): string[] {
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

export function validateArtifact(artifact: ProjectArtifact): ArtifactValidation {
  const issues: ArtifactIssue[] = [];
  const files = artifact.files;
  const paths = new Set(files.map((f) => f.path.replace(/^\.?\//, "")));
  const hasJs = files.some((f) => isJsLike(f.path));
  const multiFile = files.length > 1;

  for (const file of files) {
    const code = file.code;
    if (!code.trim()) {
      issues.push({ level: "error", path: file.path, message: "File is empty" });
      continue;
    }
    if (PLACEHOLDER.test(code)) {
      issues.push({
        level: "error",
        path: file.path,
        message: "Contains a placeholder or TODO instead of real code",
      });
    }
    if (ext(file.path) === "json") {
      try {
        JSON.parse(code);
      } catch {
        issues.push({ level: "error", path: file.path, message: "Invalid JSON" });
      }
    } else if (CODE_EXTS.has(ext(file.path)) && !balanced(code)) {
      issues.push({
        level: "error",
        path: file.path,
        message: "Unbalanced brackets — the file looks truncated",
      });
    }

    if (isJsLike(file.path)) {
      for (const spec of collectImports(file)) {
        if (!spec.startsWith(".")) continue;
        if (!resolvesTo(file.path, spec, paths)) {
          issues.push({
            level: "error",
            path: file.path,
            message: `Import "${spec}" does not resolve to any file in the project`,
          });
        }
      }
    }

    if (ext(file.path) === "html" || ext(file.path) === "htm") {
      for (const ref of collectHtmlRefs(code)) {
        if (!resolvesTo(file.path, ref.startsWith(".") ? ref : `./${ref}`, paths)) {
          issues.push({
            level: "warning",
            path: file.path,
            message: `References "${ref}", which is not included in the project`,
          });
        }
      }
    }
  }

  if (multiFile) {
    if (!files.some((f) => /(^|\/)readme\.md$/i.test(f.path))) {
      issues.push({ level: "warning", message: "No README.md with install and run instructions" });
    }
    if (hasJs && !files.some((f) => /(^|\/)package\.json$/.test(f.path))) {
      issues.push({ level: "warning", message: "No package.json for a JavaScript/TypeScript project" });
    }
    const usesEnv = files.some((f) => /process\.env\.|import\.meta\.env\./.test(f.code));
    if (usesEnv && !files.some((f) => /(^|\/)\.env\.example$/.test(f.path))) {
      issues.push({
        level: "warning",
        message: "Code reads environment variables but no .env.example was included",
      });
    }
  }

  const errors = issues.filter((i) => i.level === "error");
  const warnings = issues.filter((i) => i.level === "warning");
  return { ok: errors.length === 0, errors, warnings, issues };
}

/** One-line summary suitable for a toast or a status chip. */
export function summarizeValidation(v: ArtifactValidation): string {
  if (v.errors.length === 0 && v.warnings.length === 0) return "All checks passed";
  const parts: string[] = [];
  if (v.errors.length) parts.push(`${v.errors.length} issue${v.errors.length === 1 ? "" : "s"}`);
  if (v.warnings.length)
    parts.push(`${v.warnings.length} warning${v.warnings.length === 1 ? "" : "s"}`);
  return parts.join(" · ");
}

/** Composer prompt that asks the model to repair exactly what validation found. */
export function repairPrompt(artifact: ProjectArtifact, v: ArtifactValidation): string {
  const lines = v.issues
    .slice(0, 20)
    .map((i) => `- ${i.path ? `${i.path}: ` : ""}${i.message}`)
    .join("\n");
  return `The project "${artifact.name}" failed pre-export validation:\n${lines}\n\nFix every item above. Return only the files that change (plus any missing files), each as a complete file with its exact path.`;
}
