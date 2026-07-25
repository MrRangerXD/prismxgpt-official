/**
 * DocMarkdown — themed markdown renderer with copy-code, heading anchors,
 * callouts, and image/video embeds. Uses react-markdown + remark-gfm.
 *
 * Callouts syntax (per-line prefix inside a blockquote):
 *   > [!NOTE] Body text
 *   > [!WARNING] Be careful
 *   > [!TIP] Handy hint
 *   > [!SUCCESS] All good
 */
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useCallback, useMemo, useState } from "react";
import { Check, Copy, Info, AlertTriangle, Lightbulb, CheckCircle2 } from "lucide-react";

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

function CalloutFromText({ text }: { text: string }) {
  const m = /^\[!(NOTE|INFO|WARNING|TIP|SUCCESS)\]\s*(.*)$/is.exec(text.trim());
  if (!m) return null;
  const kind = m[1].toUpperCase();
  const body = m[2];
  const map: Record<string, { icon: typeof Info; cls: string; label: string }> = {
    NOTE: { icon: Info, cls: "border-blue-500/30 bg-blue-500/10 text-blue-100", label: "Note" },
    INFO: { icon: Info, cls: "border-blue-500/30 bg-blue-500/10 text-blue-100", label: "Info" },
    WARNING: {
      icon: AlertTriangle,
      cls: "border-yellow-500/30 bg-yellow-500/10 text-yellow-100",
      label: "Warning",
    },
    TIP: {
      icon: Lightbulb,
      cls: "border-brand/40 bg-brand/10 text-foreground",
      label: "Tip",
    },
    SUCCESS: {
      icon: CheckCircle2,
      cls: "border-green-500/30 bg-green-500/10 text-green-100",
      label: "Success",
    },
  };
  const cfg = map[kind] ?? map.NOTE;
  const Icon = cfg.icon;
  return (
    <div className={`my-4 flex gap-3 rounded-xl border p-4 text-sm ${cfg.cls}`}>
      <Icon className="mt-0.5 h-4 w-4 flex-none" />
      <div>
        <div className="mb-0.5 text-xs font-semibold uppercase tracking-wider opacity-80">
          {cfg.label}
        </div>
        <div className="prose-invert text-sm">{body}</div>
      </div>
    </div>
  );
}

function CodeBlock({ language, code }: { language: string; code: string }) {
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
  return (
    <div className="group relative my-4 overflow-hidden rounded-xl border border-border bg-black/40">
      <div className="flex items-center justify-between border-b border-border/60 px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        <span>{language || "code"}</span>
        <button
          onClick={onCopy}
          className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="Copy code"
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto p-4 text-xs leading-relaxed text-foreground/90">
        <code>{code}</code>
      </pre>
    </div>
  );
}

export function DocMarkdown({ content }: { content: string }) {
  const components = useMemo(
    () => ({
      h1: (props: { children?: React.ReactNode }) => (
        <h1 className="mt-2 mb-4 text-3xl font-bold tracking-tight text-foreground md:text-4xl">
          {props.children}
        </h1>
      ),
      h2: (props: { children?: React.ReactNode }) => {
        const text = String(
          (Array.isArray(props.children) ? props.children.join(" ") : props.children) ?? "",
        );
        const id = slugify(text);
        return (
          <h2
            id={id}
            className="mt-10 mb-3 scroll-mt-24 border-b border-border pb-2 text-2xl font-semibold tracking-tight text-foreground"
          >
            {props.children}
          </h2>
        );
      },
      h3: (props: { children?: React.ReactNode }) => {
        const text = String(
          (Array.isArray(props.children) ? props.children.join(" ") : props.children) ?? "",
        );
        const id = slugify(text);
        return (
          <h3
            id={id}
            className="mt-6 mb-2 scroll-mt-24 text-lg font-semibold text-foreground"
          >
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
        // Detect callout: [!NOTE] etc as first text
        const arr = Array.isArray(props.children) ? props.children : [props.children];
        const first = arr.find(Boolean);
        // react-markdown wraps content in a <p>; try to extract its raw text
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
        <img
          src={props.src}
          alt={props.alt ?? ""}
          className="my-4 rounded-xl border border-border"
          loading="lazy"
        />
      ),
      code: (props: {
        inline?: boolean;
        className?: string;
        children?: React.ReactNode;
      }) => {
        const raw = String(props.children ?? "").replace(/\n$/, "");
        const cls = props.className ?? "";
        const langMatch = /language-([\w-]+)/.exec(cls);
        // react-markdown v10 removed `inline`; treat single-line no-language as inline
        const isBlock = !!langMatch || raw.includes("\n");
        if (!isBlock) {
          return (
            <code className="rounded bg-card px-1.5 py-0.5 font-mono text-[0.85em] text-brand">
              {props.children}
            </code>
          );
        }
        return <CodeBlock language={langMatch?.[1] ?? ""} code={raw} />;
      },
      pre: (props: { children?: React.ReactNode }) => <>{props.children}</>,
    }),
    [],
  );

  // Convert bare video URLs (mp4/webm) at start of a line into <video> tags.
  // Also support ![video](url.mp4) syntax naturally handled by img override below
  // via extension sniffing.
  const processed = useMemo(() => {
    return content.replace(
      /^\s*(https?:\/\/\S+\.(?:mp4|webm))\s*$/gim,
      (_, url) =>
        `<video controls class="my-4 w-full rounded-xl border border-border" src="${url}"></video>`,
    );
  }, [content]);

  return (
    <div className="max-w-none">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml={false}
        components={components as never}
      >
        {processed}
      </ReactMarkdown>
    </div>
  );
}
