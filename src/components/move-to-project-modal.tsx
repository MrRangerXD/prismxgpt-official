import { useEffect, useState } from "react";
import { X, FolderClosed, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { useProjects, primeProject, type ProjectSummary } from "@/hooks/use-projects";

type Project = ProjectSummary;

/**
 * Move-to-project picker. Uses the shared projects cache so opens are
 * instant when the cache is warm, and revalidates in the background.
 */
export function MoveToProjectModal({
  open,
  onClose,
  chatTitle,
  onMove,
}: {
  open: boolean;
  onClose: () => void;
  chatTitle: string;
  onMove: (projectId: string, projectName: string) => void | Promise<void>;
}) {
  const { userId } = useProfile();
  const { projects, loading } = useProjects(userId);
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setCreating(false);
      setNewName("");
      setQ("");
    }
  }, [open]);

  if (!open) return null;

  const create = async () => {
    const name = newName.trim();
    if (!name || !userId) return;
    // Prevent duplicate project names for this owner
    const existing = projects.find(
      (p) => p.owner_id === userId && p.name.toLowerCase() === name.toLowerCase(),
    );
    if (existing) {
      toast.error("A project with that name already exists");
      return;
    }
    setBusy(true);
    const { data, error } = await supabase
      .from("projects" as never)
      .insert({ name, owner_id: userId } as never)
      .select()
      .single();
    if (error || !data) {
      setBusy(false);
      toast.error(error?.message ?? "Could not create project");
      return;
    }
    const proj = data as Project;
    await supabase
      .from("project_members" as never)
      .insert({ project_id: proj.id, user_id: userId, role: "owner" } as never);
    primeProject(userId, proj);
    await onMove(proj.id, proj.name);
    setBusy(false);
    onClose();
  };

  const filtered = projects.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg overflow-hidden rounded-3xl border border-border bg-card shadow-elevated">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold">Move to project</h2>
            <p className="truncate text-xs text-muted-foreground">{chatTitle}</p>
          </div>
          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto p-5">
          {!creating && (
            <div className="mb-3 flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-sm">
              <Search className="h-3.5 w-3.5 text-muted-foreground" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search projects"
                className="flex-1 bg-transparent outline-none"
              />
            </div>
          )}

          {creating ? (
            <div className="space-y-3">
              <label className="block text-xs font-medium text-muted-foreground">
                New project name
              </label>
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") create();
                }}
                placeholder="e.g. Marketing site"
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-brand"
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setCreating(false)}
                  className="rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium hover:bg-accent"
                >
                  Cancel
                </button>
                <button
                  onClick={create}
                  disabled={busy || !newName.trim()}
                  className="rounded-lg px-3 py-2 text-xs font-semibold text-brand-foreground disabled:opacity-60"
                  style={{ background: "var(--gradient-brand)" }}
                >
                  {busy ? "Creating…" : "Create & move"}
                </button>
              </div>
            </div>
          ) : (
            <>
              <button
                onClick={() => setCreating(true)}
                className="mb-2 flex w-full items-center gap-3 rounded-xl border border-dashed border-border bg-background/40 px-3 py-3 text-left text-sm transition hover:bg-accent"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand/20 text-brand">
                  <Plus className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium">Create new project</div>
                  <div className="text-xs text-muted-foreground">
                    Start a new project and move this chat
                  </div>
                </div>
              </button>

              {loading ? (
                <div className="grid place-items-center py-8 text-xs text-muted-foreground">
                  Loading projects…
                </div>
              ) : filtered.length === 0 ? (
                <div className="grid place-items-center py-8 text-center">
                  <FolderClosed className="mb-2 h-8 w-8 text-muted-foreground" />
                  <p className="text-sm font-medium">No projects yet</p>
                  <p className="text-xs text-muted-foreground">Create one above to get started.</p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {filtered.map((p) => (
                    <button
                      key={p.id}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          await onMove(p.id, p.name);
                          onClose();
                        } finally {
                          setBusy(false);
                        }
                      }}
                      disabled={busy}
                      className="flex w-full items-center gap-3 rounded-xl border border-border bg-background/40 px-3 py-2.5 text-left text-sm transition hover:bg-accent disabled:opacity-60"
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand/20 text-brand">
                        <FolderClosed className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{p.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {p.owner_id === userId ? "Owner" : "Shared with you"}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
