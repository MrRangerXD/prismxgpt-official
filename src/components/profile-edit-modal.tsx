import { useEffect, useState } from "react";
import { X, Camera } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Profile } from "@/hooks/use-profile";
import { initials } from "@/hooks/use-profile";

export function ProfileEditModal({
  open,
  onClose,
  profile,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  profile: Profile | null;
  onSaved: () => void;
}) {
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name ?? "");
      setUsername(profile.username ?? "");
    }
  }, [profile, open]);

  if (!open || !profile) return null;

  const handleSave = async () => {
    setSaving(true);
    // Try to update profiles table if it exists; ignore any error (external Supabase may not have it yet)
    try {
      await supabase
        .from("profiles" as never)
        .update({ display_name: displayName, username } as never)
        .eq("id" as never, profile.id as never);
    } catch { /* ignore */ }
    // Always mirror to auth metadata — this is the source of truth for the UI
    const { error } = await supabase.auth.updateUser({
      data: { full_name: displayName, username },
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Profile updated");
    onSaved();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-border bg-card shadow-elevated">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition hover:bg-accent hover:text-foreground"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="p-8">
          <h2 className="text-xl font-semibold">Edit profile</h2>
          <div className="mt-6 flex justify-center">
            <div className="relative">
              <div className="flex h-28 w-28 items-center justify-center rounded-full bg-brand/20 text-3xl font-semibold text-brand">
                {initials(displayName, profile.email)}
              </div>
              <button className="absolute bottom-1 right-1 flex h-8 w-8 items-center justify-center rounded-full border border-border bg-card text-muted-foreground">
                <Camera className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="mt-6 space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Display name</label>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-brand"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Username</label>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s+/g, ""))}
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-brand"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Your profile helps people recognize you in group chats.
            </p>
          </div>

          <div className="mt-6 flex justify-end gap-2">
            <button
              onClick={onClose}
              className="rounded-full border border-border bg-background px-5 py-2 text-sm font-medium hover:bg-accent"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-full px-5 py-2 text-sm font-semibold text-brand-foreground disabled:opacity-60"
              style={{ background: "var(--gradient-brand)" }}
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
