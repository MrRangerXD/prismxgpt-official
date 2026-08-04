/**
 * Artifact parsing for PrismXGPT.
 *
 * The model is instructed (see the artifact protocol in `src/routes/api/chat.ts`)
 * to emit multi-file projects as consecutive fenced code blocks whose info
 * string carries the file path, e.g.
 *
 *   ```tsx src/App.tsx
 *   ...
 *   ```
 *
 * and to announce the project with a line such as `PROJECT: my-app`.
 *
 * This module turns an assistant message into a list of segments: plain
 * markdown prose and fully parsed project artifacts. Nothing here mutates the
 * message — parsing is pure and derived, so history stays immutable.
 */

export type ArtifactFile = {
  path: string;
  lang: string;
  code: string;
};

export type ProjectArtifact = {
  kind: "artifact";
  /** Stable-ish id derived from the project name + file list. */
  id: string;
  name: string;
  files: ArtifactFile[];
};

export type TextSegment = { kind: "text"; text: string };
export type MessageSegment = TextSegment | ProjectArtifact;

const FENCE = /^[ \t]*(`{3,}|~{3,})[ \t]*([^\n]*)\n([\s\S]*?)^[ \t]*\1[ \t]*$/gm;

/** Languages that are never treated as project files on their own. */
const NON_FILE_LANGS = new Set([
  "bash",
  "sh",
  "shell",
  "zsh",
  "console",
  "text",
  "diff",
  "mermaid",
]);

const EXT_LANG: Record<string, string> = {
  ts: "ts",
  tsx: "tsx",
  js: "js",
  jsx: "jsx",
  mjs: "js",
  cjs: "js",
  json: "json",
  html: "html",
  htm: "html",
  css: "css",
  scss: "scss",
  md: "md",
  py: "python",
  java: "java",
  cpp: "cpp",
  cc: "cpp",
  c: "c",
  h: "cpp",
  cs: "csharp",
  go: "go",
  rs: "rust",
  rb: "ruby",
  php: "php",
  sql: "sql",
  sh: "bash",
  yml: "yaml",
  yaml: "yaml",
  toml: "toml",
  env: "bash",
  txt: "text",
  svg: "html",
  dockerfile: "dockerfile",
};

export function langForPath(path: string): string {
  const base = path.split("/").pop() ?? path;
  if (/^dockerfile$/i.test(base)) return "dockerfile";
  if (/^\.env/i.test(base)) return "bash";
  if (/^makefile$/i.test(base)) return "makefile";
  const ext = base.includes(".") ? base.split(".").pop()!.toLowerCase() : "";
  return EXT_LANG[ext] ?? ext ?? "text";
}

/**
 * Extracts a file path from a fence info string. Supports:
 *   `tsx src/App.tsx`, `tsx path=src/App.tsx`, `tsx title="src/App.tsx"`,
 *   `tsx file: src/App.tsx`, and a bare `package.json` / `Dockerfile`.
 */
function parseInfo(info: string): { lang: string; path?: string } {
  const raw = info.trim();
  if (!raw) return { lang: "" };
  const tokens = raw.split(/\s+/);
  const lang = tokens[0].toLowerCase();
  const rest = tokens.slice(1).join(" ").trim();

  const attr =
    /(?:path|file|filename|title|name)\s*[:=]\s*"([^"]+)"/i.exec(raw) ??
    /(?:path|file|filename|title|name)\s*[:=]\s*'([^']+)'/i.exec(raw) ??
    /(?:path|file|filename|title|name)\s*[:=]\s*([^\s"']+)/i.exec(raw);
  if (attr) return { lang: looksLikePath(lang) ? langForPath(lang) : lang, path: attr[1] };

  if (rest) {
    const candidate = rest.replace(/^["'{[(]+|["'})\]]+$/g, "").trim();
    if (looksLikePath(candidate)) return { lang, path: candidate };
  }
  if (looksLikePath(lang)) return { lang: langForPath(lang), path: raw };
  return { lang };
}

function looksLikePath(value: string): boolean {
  if (!value) return false;
  if (/\s/.test(value)) return false;
  if (/^(dockerfile|makefile|procfile)$/i.test(value)) return true;
  if (value.startsWith(".env")) return true;
  if (value.includes("/")) return /\.[a-z0-9]{1,12}$/i.test(value) || value.endsWith("/");
  return /^[\w.@-]+\.[a-z0-9]{1,12}$/i.test(value);
}

function slug(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "project"
  );
}

function detectProjectName(text: string, files: ArtifactFile[]): string {
  const explicit =
    /^[ \t]*(?:#{1,3}[ \t]*)?(?:project|project name|app name)\s*[:=]\s*([^\n]+)$/im.exec(text);
  if (explicit) return explicit[1].trim().replace(/[*`_]/g, "").slice(0, 60);
  const pkg = files.find((f) => f.path.endsWith("package.json"));
  if (pkg) {
    const m = /"name"\s*:\s*"([^"]+)"/.exec(pkg.code);
    if (m) return m[1];
  }
  const heading = /^#{1,3}[ \t]+([^\n]{3,60})$/m.exec(text);
  if (heading) return heading[1].trim().replace(/[*`_]/g, "");
  return "Generated project";
}

/**
 * Splits an assistant message into prose and artifacts.
 *
 * A run of consecutive file-tagged code blocks (ignoring the prose between
 * them) becomes one artifact. A single file-tagged block also becomes an
 * artifact so users still get download/copy/versioning. Untagged blocks stay
 * as regular markdown and render through the normal code block component.
 */
export function parseMessageSegments(text: string): MessageSegment[] {
  if (!text || !text.includes("```")) return [{ kind: "text", text }];

  type Block = { start: number; end: number; lang: string; path?: string; code: string };
  const blocks: Block[] = [];
  FENCE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = FENCE.exec(text)) !== null) {
    const { lang, path } = parseInfo(m[2] ?? "");
    blocks.push({
      start: m.index,
      end: m.index + m[0].length,
      lang,
      path,
      code: m[3].replace(/\n$/, ""),
    });
  }

  const fileBlocks = blocks.filter(
    (b) => b.path && !(NON_FILE_LANGS.has(b.lang) && !b.path.includes(".")),
  );
  if (fileBlocks.length === 0) return [{ kind: "text", text }];

  // Group file blocks into runs separated by "long" prose (more than ~600 chars
  // of narrative means a new artifact rather than a continuation).
  const groups: Block[][] = [];
  let current: Block[] = [];
  let cursor = -1;
  for (const b of fileBlocks) {
    if (current.length > 0 && cursor >= 0 && text.slice(cursor, b.start).trim().length > 600) {
      groups.push(current);
      current = [];
    }
    current.push(b);
    cursor = b.end;
  }
  if (current.length) groups.push(current);

  const segments: MessageSegment[] = [];
  let pos = 0;
  for (const group of groups) {
    const gStart = group[0].start;
    const gEnd = group[group.length - 1].end;
    const before = text.slice(pos, gStart);
    if (before.trim()) segments.push({ kind: "text", text: before });

    const seen = new Map<string, ArtifactFile>();
    for (const b of group) {
      const path = normalizePath(b.path!);
      // Later blocks with the same path supersede earlier ones (model corrections).
      seen.set(path, { path, lang: b.lang || langForPath(path), code: b.code });
    }
    const files = [...seen.values()].sort((a, b) => a.path.localeCompare(b.path));
    const name = detectProjectName(text.slice(0, gStart) || text, files);
    segments.push({
      kind: "artifact",
      id: `${slug(name)}-${files.length}-${files.map((f) => f.path).join("|").length}`,
      name,
      files,
    });
    pos = gEnd;
  }
  const tail = text.slice(pos);
  if (tail.trim()) segments.push({ kind: "text", text: tail });
  return segments;
}

function normalizePath(path: string): string {
  return path.trim().replace(/^\.\//, "").replace(/^\/+/, "").replace(/\\/g, "/");
}

// ---------------------------------------------------------------------------
// Folder tree
// ---------------------------------------------------------------------------

export type TreeNode =
  | { type: "dir"; name: string; path: string; children: TreeNode[] }
  | { type: "file"; name: string; path: string };

export function buildTree(files: ArtifactFile[]): TreeNode[] {
  const root: TreeNode[] = [];
  for (const file of files) {
    const parts = file.path.split("/").filter(Boolean);
    let level = root;
    let prefix = "";
    parts.forEach((part, i) => {
      prefix = prefix ? `${prefix}/${part}` : part;
      if (i === parts.length - 1) {
        level.push({ type: "file", name: part, path: file.path });
        return;
      }
      let dir = level.find((n) => n.type === "dir" && n.name === part) as
        | Extract<TreeNode, { type: "dir" }>
        | undefined;
      if (!dir) {
        dir = { type: "dir", name: part, path: prefix, children: [] };
        level.push(dir);
      }
      level = dir.children;
    });
  }
  const sort = (nodes: TreeNode[]): TreeNode[] =>
    nodes
      .map((n) => (n.type === "dir" ? { ...n, children: sort(n.children) } : n))
      .sort((a, b) => {
        if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  return sort(root);
}

/** ASCII folder tree, used for the manifest and the markdown export. */
export function renderTreeText(files: ArtifactFile[]): string {
  const lines: string[] = [];
  const walk = (nodes: TreeNode[], indent: string) => {
    nodes.forEach((node, i) => {
      const last = i === nodes.length - 1;
      lines.push(`${indent}${last ? "└── " : "├── "}${node.name}${node.type === "dir" ? "/" : ""}`);
      if (node.type === "dir") walk(node.children, `${indent}${last ? "    " : "│   "}`);
    });
  };
  walk(buildTree(files), "");
  return lines.join("\n");
}

export function artifactToMarkdown(artifact: ProjectArtifact): string {
  const head = [
    `# ${artifact.name}`,
    "",
    "## Project structure",
    "",
    "```text",
    renderTreeText(artifact.files),
    "```",
    "",
  ];
  for (const file of artifact.files) {
    head.push(`## \`${file.path}\``, "", "```" + (file.lang || ""), file.code, "```", "");
  }
  return head.join("\n");
}

export function artifactManifest(artifact: ProjectArtifact): string {
  return JSON.stringify(
    {
      name: artifact.name,
      generatedBy: "PrismXGPT",
      generatedAt: new Date().toISOString(),
      fileCount: artifact.files.length,
      files: artifact.files.map((f) => ({ path: f.path, language: f.lang, bytes: f.code.length })),
    },
    null,
    2,
  );
}
