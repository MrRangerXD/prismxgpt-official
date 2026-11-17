import type { ArtifactFile, ProjectArtifact } from "./artifacts";
import { buildGraph } from "./artifact-graph";

export type Diagnostic = {
  path: string;
  code: "SYNTAX" | "TRUNCATED" | "UNRESOLVED" | "MISSING_DEP" | "MISSING_ASSET" | "PLACEHOLDER";
  message: string;
};

export type ArtifactValidationIssue = Diagnostic & { level: "error" };

export type ArtifactValidation = {
  issues: ArtifactValidationIssue[];
  errors: ArtifactValidationIssue[];
};

const JS_LIKE = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const STRINGS =
  /(\/\/[^\n]*|\/\*[\s\S]*?\*\/|'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`)/g;
const PAIRS: [string, string][] = [
  ["{", "}"],
  ["(", ")"],
  ["[", "]"],
];
const PLACEHOLDER =
  /(\/\/\s*(TODO|FIXME|\.\.\.|rest unchanged)|\{\s*\/\* *\.\.\. *\*\/\s*\}|\.\.\. *rest of)/i;

function balance(file: ArtifactFile): Diagnostic[] {
  const out: Diagnostic[] = [];
  const bare = file.code.replace(STRINGS, "");

  for (const [open, close] of PAIRS) {
    const a = bare.split(open).length - 1;
    const b = bare.split(close).length - 1;
    if (a !== b) {
      out.push({
        path: file.path,
        code: "SYNTAX",
        message: `unbalanced "${open}${close}" (${a} open / ${b} close) — file is probably cut off`,
      });
    }
  }

  const lastLine = file.code.trimEnd().split("\n").pop() ?? "";
  if (file.code.trim().length > 0 && /[,.(=:+\-|&]$/.test(lastLine.trim())) {
    out.push({ path: file.path, code: "TRUNCATED", message: "file ends mid-expression" });
  }
  if (PLACEHOLDER.test(file.code)) {
    out.push({ path: file.path, code: "PLACEHOLDER", message: "contains a TODO / elided section" });
  }
  return out;
}

export function validate(artifact: ProjectArtifact): Diagnostic[] {
  const out: Diagnostic[] = [];

  for (const file of artifact.files) {
    if (!JS_LIKE.test(file.path)) continue;
    out.push(...balance(file));
  }

  // buildGraph takes the whole artifact, not the file array.
  const graph = buildGraph(artifact);
  for (const u of graph.unresolved) {
    out.push({
      path: u.from,
      code: "UNRESOLVED",
      message: `"${u.spec}" resolves to nothing${u.suggestion ? ` — did you mean "${u.suggestion}"?` : ""}`,
    });
  }
  for (const p of graph.missingPackages) {
    out.push({
      path: "package.json",
      code: "MISSING_DEP",
      message: `"${p}" is imported but not declared`,
    });
  }
  for (const a of graph.missingAssets) {
    out.push({ path: a.from, code: "MISSING_ASSET", message: `references missing "${a.ref}"` });
  }
  return out;
}

/** Compatibility shape consumed by the artifact workspace and repair flow. */
export function validateArtifact(artifact: ProjectArtifact): ArtifactValidation {
  const issues: ArtifactValidationIssue[] = validate(artifact).map((issue) => ({
    ...issue,
    level: "error",
  }));
  return { issues, errors: issues };
}

export function summarizeValidation(validation: ArtifactValidation): string {
  if (validation.issues.length === 0) return "All checks passed";
  return `${validation.issues.length} issue${validation.issues.length === 1 ? "" : "s"}`;
}

export function repairPrompt(artifact: ProjectArtifact, validation: ArtifactValidation): string {
  const diagnostics = validation.issues
    .map((issue) => `- ${issue.path}: ${issue.message}`)
    .join("\n");
  const files = artifact.files.map((file) => `\n=== ${file.path} ===\n${file.code}`).join("\n");

  return [
    `Repair the following issues in the existing project "${artifact.name}".`,
    "Return only the complete contents of files that need changes, using fenced code blocks with each file path.",
    "Do not remove or rewrite unrelated files.",
    `\nIssues:\n${diagnostics || "No issues were provided."}`,
    `\nProject files:\n${files}`,
  ].join("\n");
}

/** Same score twice = no progress = stop the loop. */
export function scoreOf(d: Diagnostic[]): number {
  const weight: Record<Diagnostic["code"], number> = {
    SYNTAX: 60,
    TRUNCATED: 50,
    UNRESOLVED: 20,
    MISSING_DEP: 15,
    MISSING_ASSET: 10,
    PLACEHOLDER: 5,
  };
  return d.reduce((n, x) => n + weight[x.code], 0);
}
