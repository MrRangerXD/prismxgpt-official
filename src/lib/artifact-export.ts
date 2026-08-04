/**
 * Client-side export helpers for artifacts: ZIP, single file, markdown and
 * print-to-PDF. Everything runs in the browser — no server round-trip, so
 * exports work offline and never touch chat history.
 */
import { zipSync, strToU8 } from "fflate";
import type { ProjectArtifact } from "./artifacts";
import { artifactManifest, artifactToMarkdown, renderTreeText } from "./artifacts";

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function safeFilename(name: string, fallback = "prismxgpt-project"): string {
  const cleaned = name
    .trim()
    .replace(/[^\w.@ -]+/g, "")
    .replace(/\s+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || fallback;
}

export function downloadFile(path: string, code: string) {
  downloadBlob(new Blob([code], { type: "text/plain;charset=utf-8" }), path.split("/").pop() || "file.txt");
}

/**
 * Builds a complete ZIP of the artifact. Always includes a manifest and a
 * STRUCTURE.txt so downloads are self-describing even when the model omitted a
 * README.
 */
export function downloadZip(artifact: ProjectArtifact) {
  const root = safeFilename(artifact.name);
  const entries: Record<string, Uint8Array> = {};
  for (const file of artifact.files) {
    entries[`${root}/${file.path}`] = strToU8(file.code.endsWith("\n") ? file.code : `${file.code}\n`);
  }
  entries[`${root}/STRUCTURE.txt`] = strToU8(`${artifact.name}\n\n${renderTreeText(artifact.files)}\n`);
  entries[`${root}/prismxgpt.manifest.json`] = strToU8(artifactManifest(artifact));
  const zipped = zipSync(entries, { level: 6 });
  const copy = new Uint8Array(zipped.length);
  copy.set(zipped);
  downloadBlob(new Blob([copy.buffer as ArrayBuffer], { type: "application/zip" }), `${root}.zip`);
}

export function downloadMarkdown(artifact: ProjectArtifact) {
  downloadBlob(
    new Blob([artifactToMarkdown(artifact)], { type: "text/markdown;charset=utf-8" }),
    `${safeFilename(artifact.name)}.md`,
  );
}

/** Concatenates every file into one annotated text file. */
export function downloadSingleFile(artifact: ProjectArtifact) {
  const body = artifact.files
    .map((f) => `${"=".repeat(72)}\n== ${f.path}\n${"=".repeat(72)}\n\n${f.code}\n`)
    .join("\n");
  downloadBlob(
    new Blob([`${artifact.name}\n\n${renderTreeText(artifact.files)}\n\n${body}`], {
      type: "text/plain;charset=utf-8",
    }),
    `${safeFilename(artifact.name)}.txt`,
  );
}

/** PDF export via the browser print dialog (no extra dependency, works offline). */
export function exportPdf(artifact: ProjectArtifact) {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(artifact.name)}</title>
<style>
  body{font:13px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;color:#111;margin:32px;}
  h1{font:600 22px system-ui;margin:0 0 8px}
  h2{font:600 14px system-ui;margin:24px 0 6px;border-bottom:1px solid #ddd;padding-bottom:4px}
  pre{white-space:pre-wrap;word-break:break-word;background:#f6f8fa;padding:12px;border-radius:6px}
</style></head><body>
<h1>${esc(artifact.name)}</h1>
<h2>Project structure</h2><pre>${esc(renderTreeText(artifact.files))}</pre>
${artifact.files.map((f) => `<h2>${esc(f.path)}</h2><pre>${esc(f.code)}</pre>`).join("\n")}
</body></html>`;
  const win = window.open("", "_blank", "width=900,height=1000");
  if (!win) return false;
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 400);
  return true;
}
