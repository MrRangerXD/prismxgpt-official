import { useState } from "react";
import { X, ImageIcon, Loader2, Download } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export function ImageModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [image, setImage] = useState<string | null>(null);

  if (!open) return null;

  const handleGenerate = async () => {
    const text = prompt.trim();
    if (!text || loading) return;
    setLoading(true);
    setImage(null);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error("Please sign in to generate images");

      // The /api/image POST handler requires a client-owned UUID and
      // returns `imageUrl` (public storage URL), not `dataUrl`. Without
      // the id it 400s with "Missing generation id"; without reading
      // `imageUrl` the modal always errored even on successful generations.
      // Server-side already persists the image to the user's library, so
      // no duplicate upload is needed here.
      const generationId =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}-0000-0000-0000-000000000000`;

      const res = await fetch("/api/image", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ generationId, prompt: text }),
      });
      const payload = (await res.json().catch(() => null)) as {
        imageUrl?: string;
        status?: string;
        error?: string;
      } | null;
      if (!res.ok || !payload?.imageUrl) {
        throw new Error(
          payload?.error ||
            "Image generation is temporarily unavailable. Please try again in a moment.",
        );
      }
      setImage(payload.imageUrl);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Image generation failed");
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    if (!image) return;
    try {
      // Public storage URLs need fetch + blob so the browser respects the
      // `download` attribute cross-origin; anchor href alone opens the image.
      const res = await fetch(image);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `prismxgpt-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      // Fallback: open in a new tab so the user can save manually.
      window.open(image, "_blank", "noopener");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl overflow-hidden rounded-3xl border border-border bg-card shadow-elevated">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-2">
            <ImageIcon className="h-5 w-5 text-brand" />
            <h2 className="text-lg font-semibold">Generate image</h2>
          </div>
          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-6">
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
            Describe the image
          </label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="A neon-lit cyberpunk cat riding a skateboard at night"
            rows={3}
            className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-brand"
          />
          <button
            onClick={handleGenerate}
            disabled={!prompt.trim() || loading}
            className="mt-3 inline-flex items-center gap-2 rounded-full px-5 py-2 text-sm font-semibold text-brand-foreground disabled:opacity-60"
            style={{ background: "var(--gradient-brand)" }}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Generating…
              </>
            ) : (
              "Generate"
            )}
          </button>

          <div className="mt-6 grid min-h-[320px] place-items-center rounded-2xl border border-border bg-background/50">
            {loading ? (
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin" />
                <span className="text-xs">Rendering your image…</span>
              </div>
            ) : image ? (
              <div className="relative w-full p-3">
                <img src={image} alt="Generated" className="mx-auto max-h-[420px] rounded-xl" />
                <button
                  onClick={handleDownload}
                  className="absolute right-5 top-5 flex items-center gap-1.5 rounded-full border border-border bg-card/90 px-3 py-1.5 text-xs font-medium hover:bg-accent"
                >
                  <Download className="h-3.5 w-3.5" /> Download
                </button>
              </div>
            ) : (
              <div className="text-center text-xs text-muted-foreground">
                Your generated image will appear here.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
