import { X, FolderClosed, Search, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { useProjects, primeProject, type ProjectSummary } from "@/hooks/use-projects";

type Project = ProjectSummary;

export function ProjectsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { userId } = useProfile();
  const navigate = useNavigate();
  const { projects, loading } = useProjects(userId);
  const ownProjects = projects.filter((p) => p.owner_id === userId);
  const joinedProjects = projects.filter((p) => p.owner_id !== userId);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);


  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");

  if (!open) return null;

  const create = async () => {
    const name = newName.trim();
    if (!name || !userId) return;
    setBusy(true);
    const { data, error } = await supabase
      .from("projects" as never)
      .insert({ name, owner_id: userId } as never)
      .select()
      .single();
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    // also add owner membership row
    const proj = data as Project;
    await supabase
      .from("project_members" as never)
      .insert({ project_id: proj.id, user_id: userId, role: "owner" } as never);
    primeProject(userId, proj);
    toast.success("Project created");
    setNewName("");
    setShowCreate(false);
    onClose();
    navigate({ to: "/projects/$projectId", params: { projectId: proj.id } });
  };


  const openProject = (id: string) => {
    onClose();
    navigate({ to: "/projects/$projectId", params: { projectId: id } });
  };

  const all = [...ownProjects, ...joinedProjects];
  const filtered = all.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-5xl overflow-hidden rounded-3xl border border-border bg-card shadow-elevated">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-2xl font-semibold">Projects</h2>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-sm">
              <Search className="h-3.5 w-3.5 text-muted-foreground" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search projects"
                className="w-48 bg-transparent outline-none"
              />
            </div>
            <button
              onClick={() => setShowCreate(true)}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-semibold text-brand-foreground disabled:opacity-60"
              style={{ background: "var(--gradient-brand)" }}
            >
              <Plus className="h-3.5 w-3.5" /> New
            </button>
            <button
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="min-h-[400px] p-6">
          {filtered.length === 0 ? (
            <div className="grid min-h-[350px] place-items-center text-center">
              <div>
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent">
                  <FolderClosed className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium">{loading ? "Loading projects…" : "No projects yet"}</p>
                {!loading && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Group related chats together and share them with others.
                  </p>
                )}
              </div>
            </div>
          ) : (

            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {filtered.map((p) => {
                const isOwner = p.owner_id === userId;
                return (
                  <button
                    key={p.id}
                    onClick={() => openProject(p.id)}
                    className="flex items-center gap-3 rounded-2xl border border-border bg-background/40 p-4 text-left transition hover:bg-accent"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand/20">
                      <FolderClosed className="h-5 w-5 text-brand" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{p.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {isOwner ? "Owner" : "Shared with you"} · {new Date(p.created_at).toLocaleDateString()}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {showCreate && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={() => !busy && setShowCreate(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-elevated"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold">New project</h3>
            <p className="mt-1 text-sm text-muted-foreground">Group related chats together.</p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                create();
              }}
              className="mt-4"
            >
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Project name
              </label>
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Type project name"
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand"
              />
              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  disabled={busy}
                  className="rounded-full border border-border px-4 py-1.5 text-sm font-medium hover:bg-accent disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy || !newName.trim()}
                  className="rounded-full px-4 py-1.5 text-sm font-semibold text-brand-foreground disabled:opacity-60"
                  style={{ background: "var(--gradient-brand)" }}
                >
                  {busy ? "Creating…" : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
