/**
 * Builds a sandboxed live preview document for an artifact.
 *
 * Static HTML projects are inlined (local CSS/JS references are replaced with
 * the emitted file contents) so the preview works offline inside a sandboxed
 * iframe. Single CSS/SVG/Markdown files get a lightweight harness. Anything
 * that needs a bundler (React/Next source) reports that it isn't previewable
 * rather than rendering a broken page.
 */
import type { ArtifactFile, ProjectArtifact } from "./artifacts";

export type PreviewResult =
  | { ok: true; kind: "html" | "markdown" | "css" | "svg"; html: string; entry: string }
  | { ok: false; reason: string };

function ext(path: string): string {
  const base = path.split("/").pop() ?? path;
  return base.includes(".") ? base.split(".").pop()!.toLowerCase() : "";
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

const ERROR_OVERLAY = `<script>
window.addEventListener('error', function (e) {
  var el = document.createElement('div');
  el.setAttribute('style','position:fixed;left:0;right:0;bottom:0;z-index:2147483647;font:12px/1.5 ui-monospace,monospace;background:#2b0d0d;color:#ffb4b4;padding:10px 14px;border-top:1px solid #ff6b6b');
  el.textContent = 'Runtime error: ' + (e.message || 'unknown');
  document.body.appendChild(el);
});
</script>`;

function inlineHtml(entry: ArtifactFile, files: ArtifactFile[]): string {
  const byPath = new Map(files.map((f) => [f.path, f]));
  let html = entry.code;

  html = html.replace(
    /<link\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>/gi,
    (match, href: string) => {
      if (/^(https?:|data:|\/\/)/i.test(href)) return match;
      const file = byPath.get(resolveRef(entry.path, href.split(/[?#]/)[0]));
      return file ? `<style>\n${file.code}\n</style>` : match;
    },
  );

  html = html.replace(
    /<script\b([^>]*)src\s*=\s*["']([^"']+)["']([^>]*)><\/script>/gi,
    (match, pre: string, src: string, post: string) => {
      if (/^(https?:|data:|\/\/)/i.test(src)) return match;
      const file = byPath.get(resolveRef(entry.path, src.split(/[?#]/)[0]));
      if (!file) return match;
      const isModule = /type\s*=\s*["']module["']/i.test(`${pre} ${post}`);
      return `<script${isModule ? ' type="module"' : ""}>\n${file.code}\n</script>`;
    },
  );

  return html.includes("</body>")
    ? html.replace("</body>", `${ERROR_OVERLAY}</body>`)
    : `${html}${ERROR_OVERLAY}`;
}

function shell(body: string, style = ""): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{margin:0;padding:24px;font:15px/1.6 system-ui,-apple-system,Segoe UI,sans-serif;background:#0b0e14;color:#e6edf3}
pre,code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
pre{background:#11151d;padding:12px;border-radius:8px;overflow:auto}
a{color:#4ade80}h1,h2,h3{line-height:1.25}${style}</style></head><body>${body}${ERROR_OVERLAY}</body></html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Very small markdown subset — headings, code, lists, emphasis, links. */
function renderMarkdown(md: string): string {
  const blocks = escapeHtml(md).split(/```/);
  return blocks
    .map((block, i) => {
      if (i % 2 === 1) return `<pre><code>${block.replace(/^[\w.-]*\n/, "")}</code></pre>`;
      return block
        .replace(/^###### (.*)$/gm, "<h6>$1</h6>")
        .replace(/^##### (.*)$/gm, "<h5>$1</h5>")
        .replace(/^#### (.*)$/gm, "<h4>$1</h4>")
        .replace(/^### (.*)$/gm, "<h3>$1</h3>")
        .replace(/^## (.*)$/gm, "<h2>$1</h2>")
        .replace(/^# (.*)$/gm, "<h1>$1</h1>")
        .replace(/^\s*[-*] (.*)$/gm, "<li>$1</li>")
        .replace(/(<li>[\s\S]*?<\/li>)(?!\s*<li>)/g, "<ul>$1</ul>")
        .replace(/`([^`\n]+)`/g, "<code>$1</code>")
        .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" rel="noreferrer">$1</a>')
        .replace(/\n{2,}/g, "<br/><br/>");
    })
    .join("");
}

export function buildPreview(artifact: ProjectArtifact, preferredPath?: string): PreviewResult {
  const files = artifact.files;
  const preferred = preferredPath ? files.find((f) => f.path === preferredPath) : undefined;

  const pickHtml =
    (preferred && ["html", "htm"].includes(ext(preferred.path)) ? preferred : undefined) ??
    files.find((f) => /(^|\/)index\.html?$/i.test(f.path)) ??
    files.find((f) => ["html", "htm"].includes(ext(f.path)));

  if (pickHtml) {
    return { ok: true, kind: "html", entry: pickHtml.path, html: inlineHtml(pickHtml, files) };
  }

  if (preferred && ext(preferred.path) === "svg") {
    return { ok: true, kind: "svg", entry: preferred.path, html: shell(preferred.code) };
  }

  if (preferred && ext(preferred.path) === "md") {
    return {
      ok: true,
      kind: "markdown",
      entry: preferred.path,
      html: shell(renderMarkdown(preferred.code)),
    };
  }

  if (preferred && ["css", "scss"].includes(ext(preferred.path))) {
    return {
      ok: true,
      kind: "css",
      entry: preferred.path,
      html: shell(
        `<h1>Heading</h1><p>Paragraph text with a <a href="#">link</a>.</p><button>Button</button><div class="card"><h2>Card</h2><p>Preview harness for ${escapeHtml(preferred.path)}.</p></div>`,
        `\n${preferred.code}`,
      ),
    };
  }

  const readme = files.find((f) => /(^|\/)readme\.md$/i.test(f.path));
  if (readme) {
    return {
      ok: true,
      kind: "markdown",
      entry: readme.path,
      html: shell(renderMarkdown(readme.code)),
    };
  }

  return {
    ok: false,
    reason: "This project needs a build step (npm install && npm run dev) to preview.",
  };
}

export function isPreviewable(file: ArtifactFile | undefined): boolean {
  if (!file) return false;
  return ["html", "htm", "md", "css", "scss", "svg"].includes(ext(file.path));
}
