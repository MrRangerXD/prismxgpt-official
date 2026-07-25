/**
 * DocMarkdown — themed markdown renderer used across the /docs surface.
 *
 * Supported extensions (all opt-in via fenced code blocks or blockquote prefix):
 *
 *   Callouts (blockquote-prefixed):
 *     > [!NOTE] Body
 *     > [!TIP] Handy hint
 *     > [!WARNING] Careful
 *     > [!DANGER] Do not do this
 *     > [!SUCCESS] All good
 *     > [!INFO] Extra context
 *
 *   Code blocks:
 *     ```ts title=server.ts
 *     const x = 1
 *     ```
 *     (title=/filename= after the language becomes a filename header.)
 *
 *   Mermaid:  ```mermaid ...```
 *   Terminal: ```terminal ...``` or ```bash title="Terminal"```
 *
 *   Tabs (JSON):    ```tabs [ { "label": "npm", "content": "npm i x" }, ... ]```
 *   Steps (JSON):   ```steps [ { "title": "Install", "body": "Run …" }, ... ]```
 *   Cards (JSON):   ```cards [ { "title": "Chat", "body": "…", "href": "/chat" }, ... ]```
 *   FileTree (JSON):```filetree { "src": { "index.ts": null, "lib": { "a.ts": null } } }```
 *   API endpoint:   ```api { "method": "POST", "path": "/api/chat", "desc": "…" }```
 *
 * Anything unrecognized falls back to a normal code block.
 */
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { lazy, Suspense, useCallback, useMemo, useState } from "react";
import {
  Check,
  Copy,
  Info,
  AlertTriangle,
  Lightbulb,
  CheckCircle2,
  ShieldAlert,
  ChevronRight,
  Folder,
  FileText,
  Terminal as TerminalIcon,
} from "lucide-react";

const Mermaid = lazy(() => import("./mermaid-block"));

export type Heading = { id: string; text: string; depth: 2 | 3 };

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 80);
}

export function extractHeadings(markdown: string): Heading[] {
  const lines = markdown.split(/\r?\n/);
  const out: Heading[] = [];
  let inFence = false;
  for (const line of lines) {
    if (/^```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = /^(##|###)\s+(.+?)\s*$/.exec(line);
    if (m) {
      const depth = m[1].length as 2 | 3;
      const text = m[2].replace(/[#*_`]/g, "").trim();
      out.push({ id: slugify(text), text, depth });
    }
  }
  return out;
}

/* --------------------------- Callouts --------------------------- */

function CalloutFromText({ text }: { text: string }) {
  const m = /^\[!(NOTE|INFO|WARNING|TIP|SUCCESS|DANGER)\]\s*(.*)$/is.exec(text.trim());
  if (!m) return null;
  const kind = m[1].toUpperCase();
  const body = m[2];
  const map: Record<string, { icon: typeof Info; cls: string; label: string }> = {
    NOTE: { icon: Info, cls: "border-blue-500/30 bg-blue-500/10 text-blue-100", label: "Note" },
    INFO: { icon: Info, cls: "border-blue-500/30 bg-blue-500/10 text-blue-100", label: "Info" },
    WARNING: { icon: AlertTriangle, cls: "border-yellow-500/30 bg-yellow-500/10 text-yellow-100", label: "Warning" },
    TIP: { icon: Lightbulb, cls: "border-brand/40 bg-brand/10 text-foreground", label: "Tip" },
    SUCCESS: { icon: CheckCircle2, cls: "border-green-500/30 bg-green-500/10 text-green-100", label: "Success" },
    DANGER: { icon: ShieldAlert, cls: "border-red-500/40 bg-red-500/10 text-red-100", label: "Danger" },
  };
  const cfg = map[kind] ?? map.NOTE;
  const Icon = cfg.icon;
  return (
    <div className={`my-4 flex gap-3 rounded-xl border p-4 text-sm ${cfg.cls}`}>
      <Icon className="mt-0.5 h-4 w-4 flex-none" />
      <div>
        <div className="mb-0.5 text-xs font-semibold uppercase tracking-wider opacity-80">{cfg.label}</div>
        <div className="prose-invert text-sm">{body}</div>
      </div>
    </div>
  );
}

/* --------------------------- Code block --------------------------- */

function CodeBlock({
  language,
  code,
  filename,
  variant,
}: {
  language: string;
  code: string;
  filename?: string;
  variant?: "code" | "terminal";
}) {
  const [copied, setCopied] = useState(false);
  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* noop */
    }
  }, [code]);
  const isTerminal = variant === "terminal" || language === "terminal";
  const label = filename ?? (isTerminal ? "Terminal" : language || "code");
  return (
    <div className="group relative my-4 overflow-hidden rounded-xl border border-border bg-black/50">
      <div className="flex items-center justify-between border-b border-border/60 bg-black/30 px-3 py-1.5 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5 font-mono">
          {isTerminal ? <TerminalIcon className="h-3 w-3" /> : filename ? <FileText className="h-3 w-3" /> : null}
          {label}
        </span>
        <button
          onClick={onCopy}
          className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] hover:bg-accent hover:text-foreground"
          aria-label="Copy code"
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto p-4 text-xs leading-relaxed text-foreground/90">
        <code>{isTerminal ? code.split(/\r?\n/).map((l, i) => (
          <div key={i}><span className="mr-2 select-none text-brand">$</span>{l}</div>
        )) : code}</code>
      </pre>
    </div>
  );
}

/* --------------------------- Tabs --------------------------- */

function Tabs({ items }: { items: Array<{ label: string; content: string; language?: string }> }) {
  const [i, setI] = useState(0);
  if (!items?.length) return null;
  const cur = items[i] ?? items[0];
  return (
    <div className="my-4 overflow-hidden rounded-xl border border-border bg-card">
      <div role="tablist" className="flex flex-wrap gap-0 border-b border-border bg-black/20">
        {items.map((it, idx) => (
          <button
            key={idx}
            role="tab"
            aria-selected={i === idx}
            onClick={() => setI(idx)}
            className={`px-4 py-2 text-xs font-medium transition ${
              i === idx ? "border-b-2 border-brand text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {it.label}
          </button>
        ))}
      </div>
      <div role="tabpanel">
        <CodeBlock language={cur.language ?? ""} code={cur.content} />
      </div>
    </div>
  );
}

/* --------------------------- Steps --------------------------- */

function Steps({ items }: { items: Array<{ title: string; body?: string }> }) {
  return (
    <ol className="my-4 space-y-4 border-l-2 border-border pl-6">
      {items.map((s, i) => (
        <li key={i} className="relative">
          <span className="absolute -left-[34px] top-0 grid h-6 w-6 place-items-center rounded-full border border-border bg-card text-xs font-semibold text-brand">
            {i + 1}
          </span>
          <div className="font-semibold text-foreground">{s.title}</div>
          {s.body && <div className="mt-1 text-sm text-muted-foreground">{s.body}</div>}
        </li>
      ))}
    </ol>
  );
}

/* --------------------------- Cards --------------------------- */

function Cards({ items }: { items: Array<{ title: string; body?: string; href?: string; icon?: string }> }) {
  return (
    <div className="my-4 grid gap-3 sm:grid-cols-2">
      {items.map((c, i) => {
        const Cmp = c.href ? "a" : "div";
        return (
          <Cmp
            key={i}
            {...(c.href ? { href: c.href } : {})}
            className="group block rounded-xl border border-border bg-card p-4 transition hover:-translate-y-0.5 hover:border-brand/50"
          >
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground group-hover:text-brand">
              {c.icon && <span>{c.icon}</span>}
              {c.title}
            </div>
            {c.body && <p className="mt-1 text-xs text-muted-foreground">{c.body}</p>}
          </Cmp>
        );
      })}
    </div>
  );
}

/* --------------------------- File tree --------------------------- */

type TreeNode = Record<string, unknown>;
function FileTree({ tree, level = 0 }: { tree: TreeNode; level?: number }) {
  const entries = Object.entries(tree);
  return (
    <ul className={level === 0 ? "my-4 rounded-xl border border-border bg-card p-3 font-mono text-xs" : "ml-4 border-l border-border/60 pl-3"}>
      {entries.map(([name, val]) => {
        const isDir = val && typeof val === "object";
        return (
          <li key={name} className="my-0.5">
            <span className="inline-flex items-center gap-1.5 text-foreground/85">
              {isDir ? <Folder className="h-3 w-3 text-brand" /> : <FileText className="h-3 w-3 text-muted-foreground" />}
              {name}
            </span>
            {isDir && <FileTree tree={val as TreeNode} level={level + 1} />}
          </li>
        );
      })}
    </ul>
  );
}

/* --------------------------- API endpoint --------------------------- */

function ApiEndpoint({ method, path, desc }: { method: string; path: string; desc?: string }) {
  const colors: Record<string, string> = {
    GET: "bg-blue-500/15 text-blue-300 border-blue-500/30",
    POST: "bg-green-500/15 text-green-300 border-green-500/30",
    PUT: "bg-yellow-500/15 text-yellow-200 border-yellow-500/30",
    PATCH: "bg-purple-500/15 text-purple-300 border-purple-500/30",
    DELETE: "bg-red-500/15 text-red-300 border-red-500/30",
  };
  const cls = colors[method.toUpperCase()] ?? "bg-muted text-foreground border-border";
  return (
    <div className="my-4 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-md border px-2 py-0.5 font-mono text-[11px] font-bold ${cls}`}>
          {method.toUpperCase()}
        </span>
        <code className="font-mono text-sm text-foreground">{path}</code>
      </div>
      {desc && <p className="mt-2 text-sm text-muted-foreground">{desc}</p>}
    </div>
  );
}

/* --------------------------- Info-string parser --------------------------- */

function parseInfo(cls: string) {
  const langMatch = /language-([\w-]+)/.exec(cls || "");
  const lang = langMatch?.[1] ?? "";
  const rest = (cls || "").replace(/^language-[\w-]+/, "").trim();
  const titleMatch = /(?:title|filename)=("([^"]+)"|'([^']+)'|(\S+))/i.exec(rest);
  const title = titleMatch ? titleMatch[2] ?? titleMatch[3] ?? titleMatch[4] : undefined;
  return { lang, title };
}

/* --------------------------- Main renderer --------------------------- */

export function DocMarkdown({ content }: { content: string }) {
  const components = useMemo(
    () => ({
      h1: (props: { children?: React.ReactNode }) => (
        <h1 className="mt-2 mb-4 text-3xl font-bold tracking-tight text-foreground md:text-4xl">{props.children}</h1>
      ),
      h2: (props: { children?: React.ReactNode }) => {
        const text = String((Array.isArray(props.children) ? props.children.join(" ") : props.children) ?? "");
        const id = slugify(text);
        return (
          <h2 id={id} className="group mt-10 mb-3 scroll-mt-24 border-b border-border pb-2 text-2xl font-semibold tracking-tight text-foreground">
            <a href={`#${id}`} className="mr-2 text-muted-foreground opacity-0 transition group-hover:opacity-60">#</a>
            {props.children}
          </h2>
        );
      },
      h3: (props: { children?: React.ReactNode }) => {
        const text = String((Array.isArray(props.children) ? props.children.join(" ") : props.children) ?? "");
        const id = slugify(text);
        return (
          <h3 id={id} className="group mt-6 mb-2 scroll-mt-24 text-lg font-semibold text-foreground">
            <a href={`#${id}`} className="mr-2 text-muted-foreground opacity-0 transition group-hover:opacity-60">#</a>
            {props.children}
          </h3>
        );
      },
      p: (props: { children?: React.ReactNode }) => (
        <p className="my-3 leading-relaxed text-foreground/85">{props.children}</p>
      ),
      a: (props: { href?: string; children?: React.ReactNode }) => (
        <a
          href={props.href}
          className="text-brand underline-offset-4 hover:underline"
          target={props.href?.startsWith("http") ? "_blank" : undefined}
          rel={props.href?.startsWith("http") ? "noreferrer" : undefined}
        >
          {props.children}
        </a>
      ),
      ul: (props: { children?: React.ReactNode }) => (
        <ul className="my-3 list-disc space-y-1 pl-6 text-foreground/85">{props.children}</ul>
      ),
      ol: (props: { children?: React.ReactNode }) => (
        <ol className="my-3 list-decimal space-y-1 pl-6 text-foreground/85">{props.children}</ol>
      ),
      blockquote: (props: { children?: React.ReactNode }) => {
        const arr = Array.isArray(props.children) ? props.children : [props.children];
        const first = arr.find(Boolean);
        let raw = "";
        const walk = (n: unknown) => {
          if (typeof n === "string") raw += n;
          else if (Array.isArray(n)) n.forEach(walk);
          else if (n && typeof n === "object" && "props" in (n as never)) {
            walk((n as { props: { children?: unknown } }).props.children);
          }
        };
        walk(first);
        const callout = CalloutFromText({ text: raw });
        if (callout) return callout;
        return (
          <blockquote className="my-4 border-l-2 border-brand/60 bg-card/40 py-2 pl-4 text-sm italic text-foreground/85">
            {props.children}
          </blockquote>
        );
      },
      hr: () => <hr className="my-8 border-border" />,
      table: (props: { children?: React.ReactNode }) => (
        <div className="my-4 overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">{props.children}</table>
        </div>
      ),
      th: (props: { children?: React.ReactNode }) => (
        <th className="border-b border-border bg-card px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {props.children}
        </th>
      ),
      td: (props: { children?: React.ReactNode }) => (
        <td className="border-b border-border px-3 py-2 text-foreground/85">{props.children}</td>
      ),
      img: (props: { src?: string; alt?: string }) => (
        <img src={props.src} alt={props.alt ?? ""} className="my-4 rounded-xl border border-border" loading="lazy" />
      ),
      details: (props: { children?: React.ReactNode }) => (
        <details className="my-4 rounded-xl border border-border bg-card px-4 py-2 [&[open]>summary>svg]:rotate-90">
          {props.children as React.ReactNode}
        </details>
      ),
      summary: (props: { children?: React.ReactNode }) => (
        <summary className="flex cursor-pointer list-none items-center gap-2 py-1 text-sm font-medium text-foreground">
          <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform" />
          {props.children}
        </summary>
      ),
      code: (props: { inline?: boolean; className?: string; children?: React.ReactNode }) => {
        const raw = String(props.children ?? "").replace(/\n$/, "");
        const { lang, title } = parseInfo(props.className ?? "");
        const isBlock = !!lang || raw.includes("\n");
        if (!isBlock) {
          return (
            <code className="rounded bg-card px-1.5 py-0.5 font-mono text-[0.85em] text-brand">{props.children}</code>
          );
        }
        // Custom fence languages
        if (lang === "mermaid") {
          return (
            <Suspense fallback={<div className="my-4 rounded-xl border border-border bg-card p-4 text-xs text-muted-foreground">Loading diagram…</div>}>
              <Mermaid code={raw} />
            </Suspense>
          );
        }
        if (lang === "terminal" || lang === "shellsession") {
          return <CodeBlock language="bash" code={raw} filename={title} variant="terminal" />;
        }
        if (lang === "tabs") {
          try { return <Tabs items={JSON.parse(raw)} />; } catch { /* fall through */ }
        }
        if (lang === "steps") {
          try { return <Steps items={JSON.parse(raw)} />; } catch { /* fall through */ }
        }
        if (lang === "cards") {
          try { return <Cards items={JSON.parse(raw)} />; } catch { /* fall through */ }
        }
        if (lang === "filetree") {
          try { return <FileTree tree={JSON.parse(raw)} />; } catch { /* fall through */ }
        }
        if (lang === "api") {
          try { const o = JSON.parse(raw); return <ApiEndpoint {...o} />; } catch { /* fall through */ }
        }
        return <CodeBlock language={lang} code={raw} filename={title} />;
      },
      pre: (props: { children?: React.ReactNode }) => <>{props.children}</>,
    }),
    [],
  );

  const processed = useMemo(() => {
    return content.replace(
      /^\s*(https?:\/\/\S+\.(?:mp4|webm))\s*$/gim,
      (_, url) => `<video controls class="my-4 w-full rounded-xl border border-border" src="${url}"></video>`,
    );
  }, [content]);

  return (
    <div className="max-w-none">
      <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml={false} components={components as never}>
        {processed}
      </ReactMarkdown>
    </div>
  );
}
