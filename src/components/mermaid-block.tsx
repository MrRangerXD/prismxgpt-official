import { useEffect, useRef, useState } from "react";
import mermaid from "mermaid";

mermaid.initialize({ startOnLoad: false, theme: "dark", securityLevel: "strict" });

export default function MermaidBlock({ code }: { code: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const id = `m${Math.random().toString(36).slice(2)}`;
        const { svg } = await mermaid.render(id, code);
        if (!cancelled && ref.current) ref.current.innerHTML = svg;
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Diagram failed to render");
      }
    })();
    return () => { cancelled = true; };
  }, [code]);
  if (err) {
    return <div className="my-4 rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-200">Diagram error: {err}</div>;
  }
  return <div ref={ref} className="my-4 overflow-x-auto rounded-xl border border-border bg-card p-4" />;
}
