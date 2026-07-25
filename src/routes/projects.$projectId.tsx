import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState, useCallback, useRef } from "react";
import { ArrowLeft, FolderClosed, Share2, Send, Plus, Copy, Check, Sparkles, Trash2, Settings, Upload, FileText, X } from "lucide-react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";

export const Route = createFileRoute("/projects/$projectId")({
  head: () => ({ meta: [{ title: "Project — PrismXGPT" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: ProjectPage,
  errorComponent: ({ error }) => (
    <div className="p-10 text-sm text-muted-foreground">Error: {String(error)}</div>
  ),
  notFoundComponent: () => <div className="p-10 text-sm text-muted-foreground">Project not found</div>,
});

type Project = {
  id: string;
  name: string;
  owner_id: string;
  instructions: string | null;
  description: string | null;
};
type ShareLink = { token: string; enabled: boolean };
type Chat = { id: string; title: string; created_at: string; created_by: string };
type Msg = { id: string; role: "user" | "assistant"; content: string; created_at: string };
type ProjectFile = { id: string; filename: string; storage_path: string; size_bytes: number | null; created_at: string };

function ProjectPage() {
  const { projectId } = Route.useParams();
  const { userId, loading } = useProfile();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [shareLink, setShareLink] = useState<ShareLink | null>(null);
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChat, setActiveChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [streamingText, setStreamingText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isOwner = !!(project && userId && project.owner_id === userId);

  useEffect(() => {
    if (!loading && !userId) navigate({ to: "/login" });
  }, [loading, userId, navigate]);

  const loadProject = useCallback(async () => {
    const { data, error } = await supabase
      .from("projects" as never)
      .select("*")
      .eq("id" as never, projectId as never)
      .maybeSingle();
    if (error || !data) {
      toast.error("Project not found or access denied");
      navigate({ to: "/chat" });
      return;
    }
    setProject(data as Project);
    const { data: cs } = await supabase
      .from("project_chats" as never)
      .select("*")
      .eq("project_id" as never, projectId as never)
      .order("created_at" as never, { ascending: false } as never);
    setChats((cs ?? []) as Chat[]);
    // Owner-only: RLS silently returns nothing for non-owners, which is fine.
    const { data: link } = await supabase
      .from("project_share_links" as never)
      .select("token, enabled")
      .eq("project_id" as never, projectId as never)
      .maybeSingle();
    setShareLink((link as ShareLink | null) ?? null);
    const { data: fs } = await supabase
      .from("project_files" as never)
      .select("id, filename, storage_path, size_bytes, created_at")
      .eq("project_id" as never, projectId as never)
      .order("created_at" as never, { ascending: false } as never);
    setFiles((fs ?? []) as ProjectFile[]);
  }, [projectId, navigate]);

  useEffect(() => {
    if (userId) loadProject();
  }, [userId, loadProject]);

  const openChat = async (chat: Chat) => {
    setActiveChat(chat);
    const { data } = await supabase
      .from("project_messages" as never)
      .select("*")
      .eq("chat_id" as never, chat.id as never)
      .order("created_at" as never, { ascending: true } as never);
    setMessages((data ?? []) as Msg[]);
  };

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, streamingText]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || !isOwner || sending || !project) return;
    setSending(true);
    setInput("");

    // Create chat if none active
    let chat = activeChat;
    if (!chat) {
      const title = text.length > 40 ? text.slice(0, 40) + "…" : text;
      const { data, error } = await supabase
        .from("project_chats" as never)
        .insert({ project_id: project.id, title, created_by: userId! } as never)
        .select()
        .single();
      if (error || !data) {
        toast.error(error?.message ?? "Failed to create chat");
        setSending(false);
        return;
      }
      chat = data as Chat;
      setActiveChat(chat);
      setChats((prev) => [chat!, ...prev]);
    }

    // Save user message
    const newMsgs: Msg[] = [
      ...messages,
      { id: crypto.randomUUID(), role: "user", content: text, created_at: new Date().toISOString() },
    ];
    setMessages(newMsgs);
    await supabase
      .from("project_messages" as never)
      .insert({ chat_id: chat.id, role: "user", content: text } as never);

    // Call AI
    setStreamingText("");
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      const historyPayload = newMsgs.map((m) => ({
        id: m.id,
        role: m.role,
        parts: [{ type: "text", text: m.content }],
      }));
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ messages: historyPayload, projectId: project.id }),
      });
      if (!res.ok || !res.body) throw new Error(await res.text());
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let assistantText = "";
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6).trim();
          if (!payload || payload === "[DONE]") continue;
          try {
            const obj = JSON.parse(payload);
            if (obj.type === "text-delta" && typeof obj.delta === "string") {
              assistantText += obj.delta;
              setStreamingText(assistantText);
            }
          } catch {
            /* ignore */
          }
        }
      }
      // Persist assistant message
      await supabase
        .from("project_messages" as never)
        .insert({ chat_id: chat.id, role: "assistant", content: assistantText } as never);
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: assistantText,
          created_at: new Date().toISOString(),
        },
      ]);
      setStreamingText("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Chat failed");
      setStreamingText("");
    } finally {
      setSending(false);
    }
  };

  const toggleShare = async () => {
    if (!project || !isOwner) return;
    const nextEnabled = !(shareLink?.enabled ?? false);
    // Auto-generate a token the first time the owner enables sharing.
    const token =
      shareLink?.token ??
      (typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID().replace(/-/g, "")
        : Math.random().toString(36).slice(2) + Date.now().toString(36));
    const { error } = await supabase
      .from("project_share_links" as never)
      .upsert(
        { project_id: project.id, token, enabled: nextEnabled } as never,
        { onConflict: "project_id" } as never,
      );
    if (error) toast.error(error.message);
    else {
      setShareLink({ token, enabled: nextEnabled });
      toast.success(nextEnabled ? "Share enabled" : "Share disabled");
    }
  };

  const deleteChat = async (id: string) => {
    if (!isOwner) return;
    if (!confirm("Delete this chat?")) return;
    await supabase.from("project_chats" as never).delete().eq("id" as never, id as never);
    setChats((c) => c.filter((x) => x.id !== id));
    if (activeChat?.id === id) {
      setActiveChat(null);
      setMessages([]);
    }
  };

  const saveSettings = async (patch: { name?: string; description?: string; instructions?: string }) => {
    if (!project || !isOwner) return;
    const { error } = await supabase
      .from("projects" as never)
      .update(patch as never)
      .eq("id" as never, project.id as never);
    if (error) { toast.error(error.message); return; }
    setProject({ ...project, ...patch } as Project);
    toast.success("Project updated");
  };

  const uploadFiles = async (fileList: FileList | null) => {
    if (!fileList || !project || !isOwner) return;
    const list = Array.from(fileList).slice(0, 10);
    for (const f of list) {
      if (f.size > 20 * 1024 * 1024) { toast.error(`"${f.name}" exceeds 20MB`); continue; }
      const path = `${project.id}/${Date.now()}_${f.name.replace(/[^\w.-]/g, "_")}`;
      const { error: upErr } = await supabase.storage.from("project-files").upload(path, f, { contentType: f.type || undefined });
      if (upErr) { toast.error(upErr.message); continue; }
      // Best-effort text extraction for text-ish files (browser side).
      let extracted: string | null = null;
      if (/^text\/|application\/(json|xml|x-yaml|yaml|javascript|typescript)/i.test(f.type) || /\.(md|txt|csv|json|yml|yaml|xml|html?|css|js|ts|tsx|jsx|py|rb|go|rs|java|c|cpp)$/i.test(f.name)) {
        try { extracted = (await f.text()).slice(0, 40000); } catch { /* ignore */ }
      }
      const { data: row, error: insErr } = await supabase
        .from("project_files" as never)
        .insert({
          project_id: project.id,
          uploaded_by: userId!,
          storage_path: path,
          filename: f.name,
          mime_type: f.type || null,
          size_bytes: f.size,
          extracted_text: extracted,
        } as never)
        .select("id, filename, storage_path, size_bytes, created_at")
        .single();
      if (insErr || !row) { toast.error(insErr?.message ?? "Upload failed"); continue; }
      setFiles((prev) => [row as ProjectFile, ...prev]);
    }
    toast.success("Files uploaded");
  };

  const deleteFile = async (file: ProjectFile) => {
    if (!isOwner || !confirm(`Delete "${file.filename}"?`)) return;
    await supabase.storage.from("project-files").remove([file.storage_path]);
    const { error } = await supabase.from("project_files" as never).delete().eq("id" as never, file.id as never);
    if (error) { toast.error(error.message); return; }
    setFiles((prev) => prev.filter((x) => x.id !== file.id));
  };

  if (loading || !project) {
    return <div className="p-10 text-sm text-muted-foreground">Loading…</div>;
  }

  const shareUrl =
    shareLink?.token && typeof window !== "undefined"
      ? `${window.location.origin}/projects/join/${shareLink.token}`
      : "";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <Link
          to="/chat"
          className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to chat
        </Link>

        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand/20">
              <FolderClosed className="h-5 w-5 text-brand" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold">{project.name}</h1>
              <p className="text-xs text-muted-foreground">
                {isOwner ? "You own this project" : "Shared with you (read-only)"}
              </p>
            </div>
          </div>
          {isOwner && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowSettings(true)}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-4 py-1.5 text-sm font-medium hover:bg-accent"
              >
                <Settings className="h-3.5 w-3.5" /> Settings
              </button>
              <button
                onClick={() => setShowShare(true)}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-4 py-1.5 text-sm font-medium hover:bg-accent"
              >
                <Share2 className="h-3.5 w-3.5" /> Share
              </button>
            </div>
          )}
        </div>

        {(project.description || project.instructions) && (
          <div className="mb-6 space-y-2 rounded-2xl border border-border bg-card/60 p-4">
            {project.description && (
              <p className="text-sm text-muted-foreground">{project.description}</p>
            )}
            {project.instructions && (
              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                  Custom instructions applied to every chat
                </summary>
                <pre className="mt-2 whitespace-pre-wrap font-sans text-xs text-muted-foreground">
                  {project.instructions}
                </pre>
              </details>
            )}
          </div>
        )}

        {/* Project files (knowledge) */}
        <div className="mb-6 rounded-2xl border border-border bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold">Project files</h3>
              <p className="text-xs text-muted-foreground">
                Shared with every chat in this project.
              </p>
            </div>
            {isOwner && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => { void uploadFiles(e.target.files); e.target.value = ""; }}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent"
                >
                  <Upload className="h-3 w-3" /> Upload
                </button>
              </>
            )}
          </div>
          {files.length === 0 ? (
            <p className="text-xs text-muted-foreground">No files yet.</p>
          ) : (
            <ul className="space-y-1.5">
              {files.map((f) => (
                <li key={f.id} className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
                  <FileText className="h-3.5 w-3.5 flex-none text-muted-foreground" />
                  <span className="flex-1 truncate text-xs">{f.filename}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {f.size_bytes ? `${Math.round((f.size_bytes / 1024) * 10) / 10} KB` : ""}
                  </span>
                  {isOwner && (
                    <button
                      onClick={() => deleteFile(f)}
                      className="text-muted-foreground hover:text-red-400"
                      aria-label="Delete file"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Composer */}
        {isOwner && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              sendMessage();
            }}
            className="mb-6 flex items-center gap-2 rounded-2xl border border-border bg-card px-3 py-2"
          >
            <Plus className="h-4 w-4 text-muted-foreground" />
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={activeChat ? "Reply in this chat…" : `New chat in ${project.name}`}
              disabled={sending}
              className="flex-1 bg-transparent px-1 text-sm outline-none"
            />
            <button
              type="submit"
              disabled={sending || !input.trim()}
              className="flex h-9 w-9 items-center justify-center rounded-full text-brand-foreground disabled:opacity-40"
              style={{ background: "var(--gradient-brand)" }}
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        )}

        {/* Active chat messages */}
        {activeChat && (
          <div className="mb-8 rounded-2xl border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div className="text-sm font-medium">{activeChat.title}</div>
              <button
                onClick={() => {
                  setActiveChat(null);
                  setMessages([]);
                }}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Close
              </button>
            </div>
            <div ref={scrollRef} className="max-h-[60vh] space-y-4 overflow-y-auto p-4">
              {messages.map((m) => (
                <div key={m.id} className="flex gap-3">
                  <div
                    className={`flex h-8 w-8 flex-none items-center justify-center rounded-lg ${
                      m.role === "user" ? "bg-accent" : ""
                    }`}
                    style={m.role === "assistant" ? { background: "var(--gradient-brand)" } : undefined}
                  >
                    {m.role === "assistant" ? (
                      <Sparkles className="h-4 w-4 text-brand-foreground" />
                    ) : (
                      <span className="text-xs font-semibold">U</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1 text-sm leading-relaxed">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                  </div>
                </div>
              ))}
              {streamingText && (
                <div className="flex gap-3">
                  <div
                    className="flex h-8 w-8 flex-none items-center justify-center rounded-lg"
                    style={{ background: "var(--gradient-brand)" }}
                  >
                    <Sparkles className="h-4 w-4 text-brand-foreground" />
                  </div>
                  <div className="min-w-0 flex-1 text-sm leading-relaxed">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{streamingText}</ReactMarkdown>
                  </div>
                </div>
              )}
              {messages.length === 0 && !streamingText && (
                <div className="py-10 text-center text-xs text-muted-foreground">No messages yet.</div>
              )}
            </div>
          </div>
        )}

        {/* Chat list */}
        <h2 className="mb-3 text-lg font-semibold">Chats</h2>
        {chats.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card p-10 text-center">
            <p className="text-sm font-medium">No chats yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Chats in {project.name} will live here
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {chats.map((c) => (
              <div
                key={c.id}
                className={`flex items-center gap-3 rounded-xl border p-3 transition ${
                  activeChat?.id === c.id ? "border-brand bg-brand/5" : "border-border bg-card hover:bg-accent"
                }`}
              >
                <button onClick={() => openChat(c)} className="flex flex-1 items-center gap-3 text-left">
                  <Sparkles className="h-4 w-4 flex-none text-brand" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{c.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(c.created_at).toLocaleString()}
                    </div>
                  </div>
                </button>
                {isOwner && (
                  <button
                    onClick={() => deleteChat(c.id)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-red-500/10 hover:text-red-400"
                    aria-label="Delete chat"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {showShare && project && (
        <ShareModal
          project={project}
          shareUrl={shareUrl}
          shareEnabled={shareLink?.enabled ?? false}
          onToggle={toggleShare}
          onClose={() => setShowShare(false)}
        />
      )}
      {showSettings && project && (
        <SettingsModal
          project={project}
          onSave={async (patch) => { await saveSettings(patch); setShowSettings(false); }}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}

function ShareModal({
  project,
  shareUrl,
  shareEnabled,
  onToggle,
  onClose,
}: {
  project: Project;
  shareUrl: string;
  shareEnabled: boolean;
  onToggle: () => void;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-elevated">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">Share "{project.name}"</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            ✕
          </button>
        </div>
        <p className="mb-4 text-xs text-muted-foreground">
          Anyone with the link (must be signed in) can view chats in this project — read-only. Turn share
          off to revoke access instantly.
        </p>
        <label className="mb-3 flex cursor-pointer items-center justify-between rounded-xl border border-border bg-background px-4 py-3">
          <span className="text-sm font-medium">Share enabled</span>
          <input
            type="checkbox"
            checked={shareEnabled}
            onChange={onToggle}
            className="h-4 w-4 accent-brand"
          />
        </label>
        {shareEnabled && shareUrl && (
          <div className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2">
            <input
              readOnly
              value={shareUrl}
              className="flex-1 bg-transparent text-xs outline-none"
              onClick={(e) => (e.target as HTMLInputElement).select()}
            />
            <button
              onClick={() => {
                navigator.clipboard.writeText(shareUrl);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              className="flex items-center gap-1 rounded-lg bg-accent px-2 py-1 text-xs font-medium"
            >
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function SettingsModal({
  project,
  onSave,
  onClose,
}: {
  project: Project;
  onSave: (patch: { name?: string; description?: string; instructions?: string }) => Promise<void> | void;
  onClose: () => void;
}) {
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? "");
  const [instructions, setInstructions] = useState(project.instructions ?? "");
  const [saving, setSaving] = useState(false);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-elevated">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">Project settings</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">✕</button>
        </div>
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Description</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="A short summary of what this project is about."
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">
              Custom instructions
            </span>
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              rows={6}
              placeholder="Tell the assistant how to behave in every chat inside this project (tone, format, priorities)."
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand"
            />
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-border bg-background px-4 py-2 text-sm hover:bg-accent"
          >
            Cancel
          </button>
          <button
            disabled={saving || !name.trim()}
            onClick={async () => {
              setSaving(true);
              try {
                await onSave({
                  name: name.trim(),
                  description: description.trim() || undefined,
                  instructions: instructions.trim() || undefined,
                });
              } finally {
                setSaving(false);
              }
            }}
            className="rounded-lg px-4 py-2 text-sm font-medium text-brand-foreground disabled:opacity-50"
            style={{ background: "var(--gradient-brand)" }}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
