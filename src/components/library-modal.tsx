import { X, ImageIcon, FileText, Search, Download, Trash2, Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";

type LibraryItem = {
  id: string;
  user_id: string;
  kind: "image" | "file";
  title: string | null;
  prompt: string | null;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
};

export function LibraryModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { userId } = useProfile();
  const [tab, setTab] = useState<"all" | "images" | "files">("all");
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("library_items" as never)
      .select("*")
      .order("created_at" as never, { ascending: false } as never)
      .limit(200);
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    const list = (data ?? []) as LibraryItem[];
    setItems(list);

    // Sign URLs for images
    const imgs = list.filter((i) => i.kind === "image").map((i) => i.storage_path);
    if (imgs.length > 0) {
      const { data: signed } = await supabase.storage
        .from("library")
        .createSignedUrls(imgs, 60 * 60);
      const map: Record<string, string> = {};
      (signed ?? []).forEach((s, idx) => {
        if (s.signedUrl) map[imgs[idx]] = s.signedUrl;
      });
      setUrls(map);
    } else {
      setUrls({});
    }
  }, [userId]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const filtered = useMemo(() => {
    return items
      .filter((i) =>
        tab === "all" ? true : tab === "images" ? i.kind === "image" : i.kind === "file",
      )
      .filter((i) =>
        q.trim()
          ? (i.title ?? "").toLowerCase().includes(q.toLowerCase()) ||
            (i.prompt ?? "").toLowerCase().includes(q.toLowerCase())
          : true,
      );
  }, [items, tab, q]);

  if (!open) return null;

  const remove = async (item: LibraryItem) => {
    if (!confirm("Delete this item?")) return;
    await supabase.storage.from("library").remove([item.storage_path]);
    const { error } = await supabase
      .from("library_items" as never)
      .delete()
      .eq("id" as never, item.id as never);
    if (error) toast.error(error.message);
    else {
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      toast.success("Deleted");
    }
  };

  const download = async (item: LibraryItem) => {
    const { data, error } = await supabase.storage
      .from("library")
      .createSignedUrl(item.storage_path, 60);
    if (error || !data?.signedUrl) {
      toast.error(error?.message ?? "Failed");
      return;
    }
    const a = document.createElement("a");
    a.href = data.signedUrl;
    a.download = item.title ?? "download";
    a.click();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-5xl overflow-hidden rounded-3xl border border-border bg-card shadow-elevated">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-2xl font-semibold">Library</h2>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-sm">
              <Search className="h-3.5 w-3.5 text-muted-foreground" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search"
                className="w-40 bg-transparent outline-none"
              />
            </div>
            <button
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 px-6 py-4">
          {(["all", "images", "files"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium capitalize transition ${
                tab === t
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="min-h-[400px] max-h-[65vh] overflow-y-auto px-6 pb-8">
          {loading ? (
            <div className="grid min-h-[350px] place-items-center text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="grid min-h-[350px] place-items-center text-center">
              <div>
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent">
                  {tab === "files" ? (
                    <FileText className="h-6 w-6 text-muted-foreground" />
                  ) : (
                    <ImageIcon className="h-6 w-6 text-muted-foreground" />
                  )}
                </div>
                <p className="text-sm font-medium">Nothing here yet</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Images and files you generate will show up here.
                </p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
              {filtered.map((item) => (
                <div
                  key={item.id}
                  className="group relative overflow-hidden rounded-2xl border border-border bg-background/50"
                >
                  {item.kind === "image" && urls[item.storage_path] ? (
                    <img
                      src={urls[item.storage_path]}
                      alt={item.title ?? ""}
                      loading="lazy"
                      decoding="async"
                      className="aspect-square w-full object-cover"
                    />
                  ) : (
                    <div className="grid aspect-square place-items-center bg-accent/40">
                      <FileText className="h-8 w-8 text-muted-foreground" />
                    </div>
                  )}
                  <div className="p-2.5">
                    <div className="truncate text-xs font-medium">{item.title ?? "Untitled"}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {new Date(item.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition group-hover:opacity-100">
                    <button
                      onClick={() => download(item)}
                      className="flex h-7 w-7 items-center justify-center rounded-full bg-card/90 text-muted-foreground hover:text-foreground"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => remove(item)}
                      className="flex h-7 w-7 items-center justify-center rounded-full bg-card/90 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
