/**
 * Artifact panel — the ChatGPT/Claude-style project workspace.
 *
 * Renders a generated project as a browsable IDE-like surface: folder tree,
 * multi-file tabs, quick open, search across files, breadcrumbs, live preview,
 * version history with a diff viewer, pre-export validation + deterministic
 * auto-repair, and "continue editing" actions that pre-fill the composer.
 *
 * Everything is derived and read-only: chat history is never mutated.
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  Eye,
  FileCode2,
  FileDown,
  Folder,
  FolderOpen,
  GitCompare,
  History,
  Package,
  Pencil,
  RefreshCw,
  Search,
  ShieldCheck,
  Smartphone,
  Wrench,
  X,
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
import { repairArtifact } from "@/lib/artifact-repair";
import { collapseContext, diffLines, diffStats } from "@/lib/artifact-diff";
import { buildPreview, isPreviewable } from "@/lib/artifact-preview";
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

type ViewMode = "code" | "preview" | "diff";

export const ArtifactPanel = memo(function ArtifactPanel({
  artifact,
  messageId,
}: {
  artifact: ProjectArtifact;
  messageId: string;
}) {
  const [activePath, setActivePath] = useState(artifact.files[0]?.path ?? "");
  const [openTabs, setOpenTabs] = useState<string[]>(
    artifact.files[0]?.path ? [artifact.files[0].path] : [],
  );
  const [copied, setCopied] = useState(false);
  const [showTree, setShowTree] = useState(true);
  const [versions, setVersions] = useState<ArtifactVersion[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [viewVersion, setViewVersion] = useState<number | null>(null);
  const [view, setView] = useState<ViewMode>("code");
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [issuesOpen, setIssuesOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement | null>(null);

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

  const openFile = useCallback((path: string) => {
    setActivePath(path);
    setOpenTabs((tabs) => (tabs.includes(path) ? tabs : [...tabs, path].slice(-8)));
    setView((v) => (v === "diff" ? "code" : v));
  }, []);

  const closeTab = (path: string) => {
    setOpenTabs((tabs) => {
      const next = tabs.filter((t) => t !== path);
      if (path === activePath && next.length) setActivePath(next[next.length - 1]);
      return next;
    });
  };

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

  // Search across files (quick open + content matches).
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return files
      .map((f) => {
        const pathHit = f.path.toLowerCase().includes(q);
        const lines: { n: number; text: string }[] = [];
        f.code.split("\n").forEach((line, i) => {
          if (lines.length < 4 && line.toLowerCase().includes(q))
            lines.push({ n: i + 1, text: line.trim().slice(0, 140) });
        });
        return { path: f.path, pathHit, lines };
      })
      .filter((r) => r.pathHit || r.lines.length > 0)
      .slice(0, 20);
  }, [files, query]);

  // Diff of the active file against the previous version.
  const diff = useMemo(() => {
    if (view !== "diff" || !active || versions.length < 2) return null;
    const currentIndex = versions.findIndex(
      (v) => v.version === (viewVersion ?? versions[versions.length - 1].version),
    );
    const prev = versions[currentIndex - 1];
    if (!prev) return null;
    const before = prev.files.find((f) => f.path === active.path)?.code ?? "";
    const rows = diffLines(before, active.code);
    return { rows: collapseContext(rows), stats: diffStats(rows), fromVersion: prev.version };
  }, [view, active, versions, viewVersion]);

  const preview = useMemo(
    () => (view === "preview" ? buildPreview(snapshot, active?.path) : null),
    [view, snapshot, active?.path],
  );

  // ZIP export: deterministic auto-repair first (README, package.json,
  // .env.example, .gitignore, files referenced but never emitted), then
  // validation reporting for anything only the model can fix.
  const onZip = () => {
    const { artifact: repaired, applied } = repairArtifact(snapshot);
    const after = validateArtifact(repaired);
    downloadZip(repaired);
    if (after.errors.length > 0) {
      setIssuesOpen(true);
      toast.warning(`ZIP exported — ${summarizeValidation(after)} need the AI`, {
        description: applied.length
          ? `Auto-repaired: ${applied.join(", ")}`
          : `${after.errors[0].path ? `${after.errors[0].path}: ` : ""}${after.errors[0].message}`,
        action: {
          label: "Ask AI to fix",
          onClick: () => compose(repairPrompt(repaired, after), true),
        },
      });
    } else {
      toast.success(
        applied.length
          ? `ZIP exported — auto-repaired ${applied.length} item${applied.length === 1 ? "" : "s"}`
          : "ZIP exported — all checks passed",
      );
    }
  };

  const onRepair = () => {
    const { applied, unresolved } = repairArtifact(snapshot);
    if (!applied.length && !unresolved.length) {
      toast.success("Nothing to repair — the project is complete");
      return;
    }
    toast.success(
      applied.length ? `Repair ready: ${applied.join(", ")}` : "No safe automatic fixes left",
      {
        description: unresolved.length
          ? `${unresolved.length} item${unresolved.length === 1 ? "" : "s"} need the AI`
          : "Included automatically in the next ZIP export",
      },
    );
    if (unresolved.length) setIssuesOpen(true);
  };

  const crumbs = (active?.path ?? "").split("/");

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
          {validation.issues.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1.5 text-[11px]"
              onClick={onRepair}
              title="Add missing scaffolding automatically"
            >
              <Wrench className="h-3.5 w-3.5" /> Repair
            </Button>
          )}
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
              <div className="mt-1 flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => compose(repairPrompt(snapshot, validation), true)}
                  className="inline-flex items-center gap-1 rounded-full border border-brand/40 px-2.5 py-0.5 text-[11px] text-foreground transition hover:bg-brand/10"
                >
                  <RefreshCw className="h-3 w-3" /> Ask AI to fix these
                </button>
                <button
                  type="button"
                  onClick={onRepair}
                  className="inline-flex items-center gap-1 rounded-full border border-white/[0.1] px-2.5 py-0.5 text-[11px] text-muted-foreground transition hover:text-foreground"
                >
                  <Wrench className="h-3 w-3" /> Auto-repair scaffolding
                </button>
              </div>
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

      {searchOpen && (
        <div className="border-b border-white/[0.06] bg-white/[0.02] px-4 py-2">
          <div className="flex items-center gap-2">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <input
              ref={searchRef}
              value={query}
              autoFocus
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search files and contents…"
              className="w-full bg-transparent text-[12px] text-foreground outline-none placeholder:text-muted-foreground"
            />
            <button
              type="button"
              onClick={() => {
                setSearchOpen(false);
                setQuery("");
              }}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          {query.trim() && (
            <ul className="mt-2 max-h-52 space-y-1 overflow-y-auto">
              {results.length === 0 && (
                <li className="text-[11px] text-muted-foreground">No matches</li>
              )}
              {results.map((r) => (
                <li key={r.path}>
                  <button
                    type="button"
                    onClick={() => {
                      openFile(r.path);
                      setSearchOpen(false);
                    }}
                    className="w-full rounded-md px-2 py-1 text-left transition hover:bg-white/[0.04]"
                  >
                    <span className="font-mono text-[11px] text-foreground">{r.path}</span>
                    {r.lines.map((l) => (
                      <span
                        key={l.n}
                        className="block truncate font-mono text-[10.5px] text-muted-foreground"
                      >
                        {l.n}: {l.text}
                      </span>
                    ))}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Body */}
      <div className="flex min-h-[220px] flex-col sm:flex-row">
        {showTree && (
          <div className="w-full shrink-0 border-b border-white/[0.06] bg-black/20 py-2 sm:w-56 sm:border-r sm:border-b-0">
            <div className="flex items-center justify-between px-3 pb-1">
              <span className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
                Explorer
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="text-[10px] text-muted-foreground hover:text-foreground"
                  onClick={() => setSearchOpen(true)}
                >
                  Search
                </button>
                <button
                  type="button"
                  className="text-[10px] text-muted-foreground hover:text-foreground"
                  onClick={() => onCopy(renderTreeText(files), "Folder tree copied")}
                >
                  Copy tree
                </button>
              </div>
            </div>
            <div className="max-h-[420px] overflow-y-auto pr-1">
              <TreeView nodes={tree} active={active?.path ?? ""} onSelect={openFile} />
            </div>
          </div>
        )}

        <div className="min-w-0 flex-1">
          {/* Tabs */}
          {openTabs.length > 0 && (
            <div className="flex items-center gap-1 overflow-x-auto border-b border-white/[0.06] px-2 py-1">
              {openTabs.map((path) => (
                <span
                  key={path}
                  className={`inline-flex shrink-0 items-center gap-1 rounded-t-md px-2 py-1 text-[11px] transition ${
                    path === active?.path
                      ? "bg-white/[0.06] text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <button type="button" onClick={() => setActivePath(path)} className="font-mono">
                    {path.split("/").pop()}
                  </button>
                  <button
                    type="button"
                    onClick={() => closeTab(path)}
                    className="opacity-60 hover:opacity-100"
                    aria-label={`Close ${path}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Breadcrumbs + actions */}
          <div className="flex items-center gap-2 border-b border-white/[0.06] px-3 py-1.5">
            <button
              type="button"
              onClick={() => setShowTree((v) => !v)}
              className="hidden rounded-md px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground sm:inline"
            >
              {showTree ? "Hide tree" : "Show tree"}
            </button>
            <nav className="flex min-w-0 items-center gap-1 truncate font-mono text-[11px] text-muted-foreground">
              {crumbs.map((c, i) => (
                <span key={`${c}-${i}`} className="truncate">
                  {i > 0 && <span className="opacity-40"> / </span>}
                  <span className={i === crumbs.length - 1 ? "text-foreground/80" : ""}>{c}</span>
                </span>
              ))}
            </nav>
            <div className="ml-auto flex items-center gap-1.5">
              <div className="flex items-center rounded-md border border-white/[0.06]">
                {(["code", "preview", "diff"] as ViewMode[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    disabled={m === "diff" && versions.length < 2}
                    onClick={() => setView(m)}
                    className={`px-2 py-0.5 text-[11px] capitalize transition disabled:opacity-40 ${
                      view === m ? "bg-brand/15 text-foreground" : "text-muted-foreground"
                    }`}
                  >
                    {m === "preview" ? (
                      <span className="inline-flex items-center gap-1">
                        <Eye className="h-3 w-3" /> Preview
                      </span>
                    ) : m === "diff" ? (
                      <span className="inline-flex items-center gap-1">
                        <GitCompare className="h-3 w-3" /> Diff
                      </span>
                    ) : (
                      "Code"
                    )}
                  </button>
                ))}
              </div>
              {view === "preview" && (
                <button
                  type="button"
                  onClick={() => setDevice((d) => (d === "desktop" ? "mobile" : "desktop"))}
                  className="inline-flex items-center gap-1 rounded-md border border-white/[0.06] px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
                >
                  <Smartphone className="h-3 w-3" /> {device === "desktop" ? "Desktop" : "Mobile"}
                </button>
              )}
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

          {view === "code" && (
            <pre className="max-h-[520px] overflow-auto px-4 py-3 text-[12.5px] leading-[1.6]">
              <code
                className="font-mono text-[#e6edf3]"
                dangerouslySetInnerHTML={{
                  __html: highlight(active?.code ?? "", active?.lang ?? "text"),
                }}
              />
            </pre>
          )}

          {view === "diff" && (
            <div className="max-h-[520px] overflow-auto px-2 py-2 font-mono text-[12px] leading-[1.55]">
              {!diff ? (
                <p className="px-2 py-4 text-[11px] text-muted-foreground">
                  No earlier version of this file to compare against.
                </p>
              ) : (
                <>
                  <div className="px-2 pb-1 text-[11px] text-muted-foreground">
                    vs v{diff.fromVersion} ·{" "}
                    <span className="text-emerald-400">+{diff.stats.added}</span>{" "}
                    <span className="text-rose-400">−{diff.stats.removed}</span>
                  </div>
                  {diff.rows.map((row, i) =>
                    row.type === "gap" ? (
                      <div key={i} className="px-2 text-[11px] text-muted-foreground/60">
                        ⋯
                      </div>
                    ) : (
                      <div
                        key={i}
                        className={`whitespace-pre-wrap px-2 ${
                          row.type === "add"
                            ? "bg-emerald-500/10 text-emerald-200"
                            : row.type === "del"
                              ? "bg-rose-500/10 text-rose-200"
                              : "text-[#8b949e]"
                        }`}
                      >
                        {row.type === "add" ? "+" : row.type === "del" ? "−" : " "} {row.text}
                      </div>
                    ),
                  )}
                </>
              )}
            </div>
          )}

          {view === "preview" && (
            <div className="bg-black/30 p-3">
              {preview?.ok ? (
                <div className={device === "mobile" ? "mx-auto w-[390px] max-w-full" : "w-full"}>
                  <div className="mb-1 text-[11px] text-muted-foreground">
                    Previewing <span className="font-mono">{preview.entry}</span>
                  </div>
                  <iframe
                    title={`Preview of ${preview.entry}`}
                    srcDoc={preview.html}
                    sandbox="allow-scripts allow-modals allow-forms"
                    className="h-[480px] w-full rounded-lg border border-white/[0.08] bg-white"
                  />
                </div>
              ) : (
                <p className="px-2 py-8 text-center text-[12px] text-muted-foreground">
                  {preview?.reason ?? "Nothing to preview yet."}{" "}
                  {!isPreviewable(active) &&
                    "Open an HTML, Markdown, CSS or SVG file to preview it."}
                </p>
              )}
            </div>
          )}
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
        {active && (
          <button
            type="button"
            onClick={() =>
              compose(
                `In the project "${artifact.name}": regenerate ONLY the file \`${active.path}\` as a complete, production-ready file. Keep every other file unchanged.`,
              )
            }
            className="rounded-full border border-white/[0.08] px-2.5 py-0.5 text-[11px] text-muted-foreground transition hover:border-brand/40 hover:text-foreground"
          >
            Regenerate this file
          </button>
        )}
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
