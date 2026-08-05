/**
 * Artifact panel — the ChatGPT/Claude-style project viewer.
 *
 * Renders a generated project as a browsable workspace: folder tree, file
 * viewer with lightweight syntax highlighting, one-click copy, per-file and
 * ZIP download, markdown/PDF/single-file export, version history and
 * "continue editing" actions that pre-fill the composer.
 */
import { memo, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  FileCode2,
  FileDown,
  Folder,
  FolderOpen,
  History,
  Package,
  Pencil,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { buildTree, renderTreeText, type ProjectArtifact, type TreeNode } from "@/lib/artifacts";
import {
  downloadFile,
  downloadMarkdown,
  downloadSingleFile,
  downloadZip,
  exportPdf,
} from "@/lib/artifact-export";
import {
  repairPrompt,
  summarizeValidation,
  validateArtifact,
  type ArtifactValidation,
} from "@/lib/artifact-validate";
import { recordArtifactVersion, type ArtifactVersion } from "@/lib/artifact-history";

/** Fires a composer prefill request handled by the chat route. */
function compose(text: string, send = false) {
  window.dispatchEvent(new CustomEvent("prismx:compose", { detail: { text, send } }));
}

const KEYWORDS =
  /\b(import|from|export|default|const|let|var|function|return|if|else|for|while|class|extends|new|await|async|try|catch|finally|throw|interface|type|enum|public|private|protected|static|void|null|undefined|true|false|this|super|def|elif|print|package|struct|impl|fn|use|select|insert|update|delete|create|table|where|from)\b/g;

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Minimal, dependency-free highlighter. Tokenises comments, strings, numbers
 * and keywords — enough for readable code without shipping a 300kb grammar
 * bundle into the chat route.
 */
function highlight(code: string, lang: string): string {
  const src = escapeHtml(code);
  const commentRe =
    lang === "python" || lang === "bash" || lang === "yaml" || lang === "dockerfile"
      ? /(#[^\n]*)/g
      : lang === "sql"
        ? /(--[^\n]*)/g
        : /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)/g;
  const parts: string[] = [];
  let rest = src;
  // Strings first so keywords inside them are not recoloured.
  rest = rest.replace(/("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`)/g, (m) => {
    parts.push(`<span class="text-[#a5d6ff]">${m}</span>`);
    return `\u0000${parts.length - 1}\u0000`;
  });
  rest = rest.replace(commentRe, (m) => {
    parts.push(`<span class="text-[#8b949e] italic">${m}</span>`);
    return `\u0000${parts.length - 1}\u0000`;
  });
  rest = rest.replace(KEYWORDS, '<span class="text-[#ff7b72]">$1</span>');
  rest = rest.replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="text-[#79c0ff]">$1</span>');
  rest = rest.replace(/([\w$]+)(\s*\()/g, '<span class="text-[#d2a8ff]">$1</span>$2');
  // eslint-disable-next-line no-control-regex
  return rest.replace(/\u0000(\d+)\u0000/g, (_, i: string) => parts[Number(i)]);
}

function TreeView({
  nodes,
  active,
  onSelect,
  depth = 0,
}: {
  nodes: TreeNode[];
  active: string;
  onSelect: (path: string) => void;
  depth?: number;
}) {
  return (
    <ul className="space-y-0.5">
      {nodes.map((node) =>
        node.type === "dir" ? (
          <DirNode key={node.path} node={node} active={active} onSelect={onSelect} depth={depth} />
        ) : (
          <li key={node.path}>
            <button
              type="button"
              onClick={() => onSelect(node.path)}
              style={{ paddingLeft: 8 + depth * 12 }}
              className={`flex w-full items-center gap-1.5 rounded-md py-1 pr-2 text-left text-[12px] transition ${
                active === node.path
                  ? "bg-brand/15 text-foreground"
                  : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground"
              }`}
            >
              <FileCode2 className="h-3.5 w-3.5 shrink-0 opacity-70" />
              <span className="truncate">{node.name}</span>
            </button>
          </li>
        ),
      )}
    </ul>
  );
}

function DirNode({
  node,
  active,
  onSelect,
  depth,
}: {
  node: Extract<TreeNode, { type: "dir" }>;
  active: string;
  onSelect: (path: string) => void;
  depth: number;
}) {
  const [open, setOpen] = useState(true);
  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{ paddingLeft: 8 + depth * 12 }}
        className="flex w-full items-center gap-1.5 rounded-md py-1 pr-2 text-left text-[12px] font-medium text-foreground/80 transition hover:bg-white/[0.04]"
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        {open ? (
          <FolderOpen className="h-3.5 w-3.5 text-brand/80" />
        ) : (
          <Folder className="h-3.5 w-3.5 text-brand/80" />
        )}
        <span className="truncate">{node.name}</span>
      </button>
      {open && (
        <TreeView nodes={node.children} active={active} onSelect={onSelect} depth={depth + 1} />
      )}
    </li>
  );
}

export const ArtifactPanel = memo(function ArtifactPanel({
  artifact,
  messageId,
}: {
  artifact: ProjectArtifact;
  messageId: string;
}) {
  const [activePath, setActivePath] = useState(artifact.files[0]?.path ?? "");
  const [copied, setCopied] = useState(false);
  const [showTree, setShowTree] = useState(true);
  const [versions, setVersions] = useState<ArtifactVersion[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [viewVersion, setViewVersion] = useState<number | null>(null);

  useEffect(() => {
    setVersions(recordArtifactVersion(artifact, messageId));
    // Artifacts are immutable once rendered; identity is the derived id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artifact.id, messageId]);

  const files = useMemo(() => {
    if (viewVersion == null) return artifact.files;
    return versions.find((v) => v.version === viewVersion)?.files ?? artifact.files;
  }, [artifact.files, versions, viewVersion]);

  const tree = useMemo(() => buildTree(files), [files]);
  const active = files.find((f) => f.path === activePath) ?? files[0];
  const totalBytes = files.reduce((n, f) => n + f.code.length, 0);

  const onCopy = async (value: string, label = "Copied") => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success(label);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Copy failed");
    }
  };

  const snapshot: ProjectArtifact = useMemo(() => ({ ...artifact, files }), [artifact, files]);
  const validation: ArtifactValidation = useMemo(() => validateArtifact(snapshot), [snapshot]);
  const [issuesOpen, setIssuesOpen] = useState(false);

  // ZIP export runs pre-flight validation first: the download is never blocked,
  // but the user is told exactly what a reviewer would catch before shipping.
  const onZip = () => {
    downloadZip(snapshot);
    if (validation.errors.length > 0) {
      setIssuesOpen(true);
      toast.warning(`ZIP exported with ${summarizeValidation(validation)}`, {
        description: validation.errors[0].path
          ? `${validation.errors[0].path}: ${validation.errors[0].message}`
          : validation.errors[0].message,
        action: {
          label: "Ask AI to fix",
          onClick: () => compose(repairPrompt(snapshot, validation), true),
        },
      });
    } else {
      toast.success("ZIP exported — all checks passed");
    }
  };

  return (
    <div className="my-4 overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0a0d14] shadow-[0_1px_0_0_rgba(255,255,255,0.03)_inset,0_18px_40px_-24px_rgba(0,0,0,0.8)]">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.06] bg-gradient-to-b from-white/[0.05] to-transparent px-4 py-2.5">
        <Package className="h-4 w-4 text-brand" />
        <div className="min-w-0">
          <div className="truncate text-[13px] font-semibold text-foreground">{artifact.name}</div>
          <div className="text-[11px] text-muted-foreground">
            {files.length} file{files.length === 1 ? "" : "s"} · {(totalBytes / 1024).toFixed(1)} KB
            {viewVersion != null ? ` · viewing v${viewVersion}` : ""}
          </div>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setIssuesOpen((v) => !v)}
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] transition ${
              validation.issues.length === 0
                ? "border-emerald-500/40 text-emerald-400"
                : validation.errors.length > 0
                  ? "border-amber-500/50 text-amber-400"
                  : "border-white/[0.1] text-muted-foreground hover:text-foreground"
            }`}
            title="Pre-export validation"
          >
            {validation.issues.length === 0 ? (
              <ShieldCheck className="h-3 w-3" />
            ) : (
              <AlertTriangle className="h-3 w-3" />
            )}
            {summarizeValidation(validation)}
          </button>
          <Button size="sm" variant="outline" className="h-7 gap-1.5 text-[11px]" onClick={onZip}>
            <Download className="h-3.5 w-3.5" /> ZIP
          </Button>

          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1.5 text-[11px]"
            onClick={() => downloadMarkdown(snapshot)}
          >
            <FileDown className="h-3.5 w-3.5" /> MD
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1.5 text-[11px]"
            onClick={() => {
              if (!exportPdf(snapshot)) toast.error("Allow pop-ups to export PDF");
            }}
          >
            PDF
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1.5 text-[11px]"
            onClick={() => downloadSingleFile(snapshot)}
          >
            Single file
          </Button>
          {versions.length > 1 && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1.5 text-[11px]"
              onClick={() => setHistoryOpen((v) => !v)}
            >
              <History className="h-3.5 w-3.5" /> v{versions[versions.length - 1].version}
            </Button>
          )}
        </div>
      </div>

      {issuesOpen && (
        <div className="space-y-1 border-b border-white/[0.06] bg-white/[0.02] px-4 py-2">
          {validation.issues.length === 0 ? (
            <p className="text-[11px] text-emerald-400">
              Every file parses, all relative imports resolve, and the project scaffolding is
              complete.
            </p>
          ) : (
            <>
              <ul className="space-y-0.5">
                {validation.issues.slice(0, 12).map((issue, i) => (
                  <li
                    key={`${issue.path ?? "project"}-${i}`}
                    className={`text-[11px] ${issue.level === "error" ? "text-amber-300" : "text-muted-foreground"}`}
                  >
                    <span className="font-mono">{issue.path ?? "project"}</span> — {issue.message}
                  </li>
                ))}
                {validation.issues.length > 12 && (
                  <li className="text-[11px] text-muted-foreground">
                    +{validation.issues.length - 12} more
                  </li>
                )}
              </ul>
              <button
                type="button"
                onClick={() => compose(repairPrompt(snapshot, validation), true)}
                className="mt-1 inline-flex items-center gap-1 rounded-full border border-brand/40 px-2.5 py-0.5 text-[11px] text-foreground transition hover:bg-brand/10"
              >
                <RefreshCw className="h-3 w-3" /> Ask AI to fix these
              </button>
            </>
          )}
        </div>
      )}

      {historyOpen && versions.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-white/[0.06] bg-white/[0.02] px-4 py-2">
          <span className="text-[11px] text-muted-foreground">Version history:</span>
          {versions.map((v) => (
            <button
              key={v.version}
              type="button"
              onClick={() =>
                setViewVersion(
                  v.version === versions[versions.length - 1].version ? null : v.version,
                )
              }
              className={`rounded-md border px-2 py-0.5 text-[11px] transition ${
                (viewVersion ?? versions[versions.length - 1].version) === v.version
                  ? "border-brand/50 bg-brand/15 text-foreground"
                  : "border-white/[0.08] text-muted-foreground hover:text-foreground"
              }`}
              title={new Date(v.createdAt).toLocaleString()}
            >
              v{v.version}
            </button>
          ))}
        </div>
      )}

      {/* Body */}
      <div className="flex min-h-[220px] flex-col sm:flex-row">
        {showTree && (
          <div className="w-full shrink-0 border-b border-white/[0.06] bg-black/20 py-2 sm:w-56 sm:border-r sm:border-b-0">
            <div className="flex items-center justify-between px-3 pb-1">
              <span className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
                Files
              </span>
              <button
                type="button"
                className="text-[10px] text-muted-foreground hover:text-foreground"
                onClick={() => onCopy(renderTreeText(files), "Folder tree copied")}
              >
                Copy tree
              </button>
            </div>
            <div className="max-h-[420px] overflow-y-auto pr-1">
              <TreeView nodes={tree} active={active?.path ?? ""} onSelect={setActivePath} />
            </div>
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 border-b border-white/[0.06] px-3 py-1.5">
            <button
              type="button"
              onClick={() => setShowTree((v) => !v)}
              className="hidden rounded-md px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground sm:inline"
            >
              {showTree ? "Hide tree" : "Show tree"}
            </button>
            <span className="truncate font-mono text-[11px] text-muted-foreground">
              {active?.path}
            </span>
            <div className="ml-auto flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => active && onCopy(active.code, "File copied")}
                className="inline-flex items-center gap-1 rounded-md border border-white/[0.06] px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
              >
                {copied ? (
                  <Check className="h-3 w-3 text-emerald-400" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
                Copy
              </button>
              <button
                type="button"
                onClick={() => active && downloadFile(active.path, active.code)}
                className="inline-flex items-center gap-1 rounded-md border border-white/[0.06] px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
              >
                <Download className="h-3 w-3" /> File
              </button>
            </div>
          </div>
          <pre className="max-h-[520px] overflow-auto px-4 py-3 text-[12.5px] leading-[1.6]">
            <code
              className="font-mono text-[#e6edf3]"
              dangerouslySetInnerHTML={{
                __html: highlight(active?.code ?? "", active?.lang ?? "text"),
              }}
            />
          </pre>
        </div>
      </div>

      {/* Continue editing */}
      <div className="flex flex-wrap items-center gap-1.5 border-t border-white/[0.06] bg-white/[0.02] px-4 py-2">
        <span className="mr-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
          <Pencil className="h-3 w-3" /> Continue editing:
        </span>
        {[
          "Change the navbar",
          "Add login",
          "Replace the footer",
          "Convert to React",
          "Convert to Next.js",
          "Make it premium",
          "Security review",
          "Optimize performance",
        ].map((label) => (
          <button
            key={label}
            type="button"
            onClick={() =>
              compose(
                `In the project "${artifact.name}": ${label}. Return only the files that change, as full files.`,
              )
            }
            className="rounded-full border border-white/[0.08] px-2.5 py-0.5 text-[11px] text-muted-foreground transition hover:border-brand/40 hover:text-foreground"
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          onClick={() =>
            compose(
              `Regenerate the project "${artifact.name}" from scratch with the same requirements, improved architecture and production-ready code.`,
            )
          }
          className="ml-auto inline-flex items-center gap-1 rounded-full border border-white/[0.08] px-2.5 py-0.5 text-[11px] text-muted-foreground transition hover:border-brand/40 hover:text-foreground"
        >
          <RefreshCw className="h-3 w-3" /> Regenerate
        </button>
      </div>
    </div>
  );
});
