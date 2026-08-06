/**
 * Deterministic pre-export repair for generated project artifacts.
 *
 * Runs in the browser, right before a ZIP is produced. It only adds the
 * scaffolding a reviewer would otherwise have to write by hand (README,
 * package.json, .env.example, .gitignore, files referenced by HTML that the
 * model forgot to emit). It never rewrites model-authored code, so a repair
 * can't corrupt a working project — anything it cannot fix safely is left to
 * the AI repair prompt.
 */
import type { ArtifactFile, ProjectArtifact } from "./artifacts";
import { renderTreeText } from "./artifacts";
import { validateArtifact } from "./artifact-validate";

export type RepairResult = {
  artifact: ProjectArtifact;
  applied: string[];
  /** Issues that still need the model (truncated code, bad imports, TODOs). */
  unresolved: string[];
};

function has(files: ArtifactFile[], re: RegExp): boolean {
  return files.some((f) => re.test(f.path));
}

function ext(path: string): string {
  const base = path.split("/").pop() ?? path;
  return base.includes(".") ? base.split(".").pop()!.toLowerCase() : "";
}

function slug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "generated-project"
  );
}

function collectEnvKeys(files: ArtifactFile[]): string[] {
  const keys = new Set<string>();
  const re = /(?:process\.env\.|import\.meta\.env\.)([A-Z0-9_]+)/g;
  for (const file of files) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(file.code)) !== null) keys.add(m[1]);
  }
  return [...keys].sort();
}

/** Local (non-URL) href/src references inside HTML files. */
function htmlRefs(file: ArtifactFile): string[] {
  const out: string[] = [];
  const re = /(?:href|src)\s*=\s*["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(file.code)) !== null) {
    const ref = m[1];
    if (/^(https?:|data:|mailto:|tel:|#|\/\/)/i.test(ref)) continue;
    out.push(ref.split(/[?#]/)[0]);
  }
  return out;
}

function resolveRef(fromPath: string, ref: string): string {
  const stack = fromPath.split("/").slice(0, -1);
  for (const seg of ref.split("/")) {
    if (seg === "." || seg === "") continue;
    if (seg === "..") stack.pop();
    else stack.push(seg);
  }
  return stack.join("/");
}

function detectStack(files: ArtifactFile[]): string {
  if (has(files, /(^|\/)next\.config\.(js|ts|mjs)$/)) return "Next.js";
  if (files.some((f) => /from\s+["']react["']/.test(f.code))) return "React";
  if (has(files, /(^|\/)requirements\.txt$/) || files.some((f) => ext(f.path) === "py"))
    return "Python";
  if (files.some((f) => /require\(["']express["']\)|from\s+["']express["']/.test(f.code)))
    return "Node / Express";
  if (files.some((f) => ext(f.path) === "html")) return "Static site";
  return "JavaScript";
}

function buildReadme(artifact: ProjectArtifact, files: ArtifactFile[], envKeys: string[]): string {
  const stack = detectStack(files);
  const isNode = files.some((f) => ["ts", "tsx", "js", "jsx", "mjs", "cjs"].includes(ext(f.path)));
  const isPy = files.some((f) => ext(f.path) === "py");
  const html = files.find((f) => ext(f.path) === "html");
  const install = isNode
    ? "npm install"
    : isPy
      ? "pip install -r requirements.txt"
      : "# no dependencies";
  const run = isNode
    ? "npm run dev"
    : isPy
      ? "python main.py"
      : html
        ? `open ${html.path}`
        : "# see source";

  return `# ${artifact.name}

${stack} project generated with PrismXGPT.

## Project structure

\`\`\`text
${renderTreeText(files)}
\`\`\`

## Requirements

${isNode ? "- Node.js 20 or newer\n- npm 10 or newer" : isPy ? "- Python 3.11 or newer" : "- A modern web browser"}

## Installation

\`\`\`bash
${install}
\`\`\`

## Run locally

\`\`\`bash
${run}
\`\`\`
${
  isNode
    ? `
## Production build

\`\`\`bash
npm run build
\`\`\`
`
    : ""
}${
    envKeys.length
      ? `
## Environment variables

Copy \`.env.example\` to \`.env\` and fill in the values:

${envKeys.map((k) => `- \`${k}\``).join("\n")}
`
      : ""
  }
## License

MIT
`;
}

function buildPackageJson(artifact: ProjectArtifact, files: ArtifactFile[]): string {
  const isReact = files.some((f) => /from\s+["']react["']/.test(f.code));
  const isTs = files.some((f) => ["ts", "tsx"].includes(ext(f.path)));
  const isNext = has(files, /(^|\/)next\.config\.(js|ts|mjs)$/);
  const isVite = has(files, /(^|\/)vite\.config\.(js|ts)$/) || (isReact && !isNext);
  const isExpress = files.some((f) =>
    /require\(["']express["']\)|from\s+["']express["']/.test(f.code),
  );
  const entry =
    files.find((f) => /(^|\/)(server|index|main|app)\.(ts|js|mjs)$/.test(f.path))?.path ??
    "index.js";

  const scripts: Record<string, string> = isNext
    ? { dev: "next dev", build: "next build", start: "next start" }
    : isVite
      ? { dev: "vite", build: isTs ? "tsc -b && vite build" : "vite build", preview: "vite preview" }
      : { start: `node ${entry}`, dev: `node ${entry}` };

  const dependencies: Record<string, string> = {};
  const devDependencies: Record<string, string> = {};
  if (isReact) {
    dependencies["react"] = "^19.0.0";
    dependencies["react-dom"] = "^19.0.0";
  }
  if (isNext) dependencies["next"] = "^15.0.0";
  if (isExpress) dependencies["express"] = "^4.19.2";
  if (isVite) {
    devDependencies["vite"] = "^7.0.0";
    if (isReact) devDependencies["@vitejs/plugin-react"] = "^4.3.0";
  }
  if (isTs) {
    devDependencies["typescript"] = "^5.6.0";
    if (isReact) {
      devDependencies["@types/react"] = "^19.0.0";
      devDependencies["@types/react-dom"] = "^19.0.0";
    }
  }

  return `${JSON.stringify(
    {
      name: slug(artifact.name),
      private: true,
      version: "0.1.0",
      type: "module",
      scripts,
      ...(Object.keys(dependencies).length ? { dependencies } : {}),
      ...(Object.keys(devDependencies).length ? { devDependencies } : {}),
    },
    null,
    2,
  )}\n`;
}

const GITIGNORE = `node_modules/
dist/
build/
.next/
coverage/
.env
.env.local
*.log
.DS_Store
__pycache__/
.venv/
`;

/**
 * Adds every safe missing piece and reports what still needs the model.
 */
export function repairArtifact(artifact: ProjectArtifact): RepairResult {
  const files = [...artifact.files];
  const applied: string[] = [];
  const paths = new Set(files.map((f) => f.path));

  const add = (path: string, lang: string, code: string, label: string) => {
    if (paths.has(path)) return;
    files.push({ path, lang, code });
    paths.add(path);
    applied.push(label);
  };

  const isJs = files.some((f) => ["ts", "tsx", "js", "jsx", "mjs", "cjs"].includes(ext(f.path)));
  const envKeys = collectEnvKeys(files);

  // 1. Files referenced by HTML but never emitted (missing CSS / JS).
  for (const file of files.filter((f) => ["html", "htm"].includes(ext(f.path)))) {
    for (const ref of htmlRefs(file)) {
      const target = resolveRef(file.path, ref);
      if (!target || paths.has(target)) continue;
      const e = ext(target);
      if (e === "css") {
        add(
          target,
          "css",
          `/* ${target} — stylesheet referenced by ${file.path} */\n:root { color-scheme: light dark; }\n`,
          `created ${target}`,
        );
      } else if (e === "js" || e === "mjs") {
        add(
          target,
          "js",
          `// ${target} — script referenced by ${file.path}\nexport {};\n`,
          `created ${target}`,
        );
      }
    }
  }

  // 2. Standard scaffolding.
  if (files.length > 1) {
    if (isJs && !has(files, /(^|\/)package\.json$/)) {
      add("package.json", "json", buildPackageJson(artifact, files), "generated package.json");
    }
    if (envKeys.length && !has(files, /(^|\/)\.env\.example$/)) {
      add(
        ".env.example",
        "bash",
        `${envKeys.map((k) => `${k}=`).join("\n")}\n`,
        "generated .env.example",
      );
    }
    if (!has(files, /(^|\/)\.gitignore$/)) {
      add(".gitignore", "text", GITIGNORE, "generated .gitignore");
    }
    if (!has(files, /(^|\/)readme\.md$/i)) {
      add("README.md", "md", buildReadme(artifact, files, envKeys), "generated README.md");
    }
  }

  const repaired: ProjectArtifact = {
    ...artifact,
    files: files.sort((a, b) => a.path.localeCompare(b.path)),
  };
  const after = validateArtifact(repaired);
  return {
    artifact: repaired,
    applied,
    unresolved: after.issues.map((i) => `${i.path ? `${i.path}: ` : ""}${i.message}`),
  };
}
