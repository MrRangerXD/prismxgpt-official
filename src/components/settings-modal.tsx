import { useEffect, useState } from "react";
import { X, User, KeyRound, LogOut, Trash2, Save, Palette, Info, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Profile } from "@/hooks/use-profile";
import { initials } from "@/hooks/use-profile";
import { PrismXLogo } from "@/components/prismx-logo";

import { getStoredTheme, setTheme as persistTheme, type ThemeChoice } from "@/lib/theme";

/**
 * Settings modal — profile, account, appearance, shortcuts, about.
 */
export function SettingsModal({
  open,
  onClose,
  profile,
  onSaved,
  onClearHistory,
}: {
  open: boolean;
  onClose: () => void;
  profile: Profile | null;
  onSaved: () => void;
  onClearHistory?: () => void;
}) {
  const [tab, setTab] = useState<"profile" | "account" | "appearance" | "personalization" | "about">(
    "profile",
  );
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [saving, setSaving] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [theme, setThemeState] = useState<ThemeChoice>(() => getStoredTheme());
  const [streamResponses, setStreamResponses] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem("prismxgpt.stream") !== "false";
  });
  const [personAbout, setPersonAbout] = useState("");
  const [personStyle, setPersonStyle] = useState("");
  const [personSaved, setPersonSaved] = useState(false);

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name ?? "");
      setUsername(profile.username ?? "");
    }
    if (open) {
      setTab("profile");
      setNewPassword("");
      setConfirmPassword("");
      try {
        const raw = typeof window !== "undefined" ? window.localStorage.getItem("prismxgpt.personalization.v1") : null;
        if (raw) {
          const p = JSON.parse(raw) as { about?: string; style?: string };
          setPersonAbout(p.about ?? "");
          setPersonStyle(p.style ?? "");
        }
      } catch { /* ignore */ }
    }
  }, [profile, open]);

  useEffect(() => {
    persistTheme(theme);
  }, [theme]);

  useEffect(() => {
    if (typeof window !== "undefined")
      window.localStorage.setItem("prismxgpt.stream", String(streamResponses));
  }, [streamResponses]);

  if (!open || !profile) return null;

  const saveProfile = async () => {
    setSaving(true);
    try {
      await supabase
        .from("profiles" as never)
        .update({ display_name: displayName, username } as never)
        .eq("id" as never, profile.id as never);
    } catch {
      /* ignore */
    }
    const { error } = await supabase.auth.updateUser({
      data: { full_name: displayName, username },
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Profile saved");
    onSaved();
  };

  const savePassword = async () => {
    if (newPassword.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Password updated");
    setNewPassword("");
    setConfirmPassword("");
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    toast.success("Signed out");
    onClose();
    if (typeof window !== "undefined") window.location.href = "/login";
  };

  const tabs = [
    { id: "profile", label: "Profile", icon: User },
    { id: "account", label: "Account", icon: KeyRound },
    { id: "appearance", label: "Appearance", icon: Palette },
    { id: "personalization", label: "Personalization", icon: Sparkles },
    { id: "about", label: "About", icon: Info },
  ] as const;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl overflow-hidden rounded-3xl border border-border bg-card shadow-elevated">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition hover:bg-accent hover:text-foreground"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex flex-col sm:flex-row">
          <div className="border-b border-border bg-background/40 p-4 sm:w-52 sm:border-b-0 sm:border-r">
            <h2 className="mb-4 text-lg font-semibold">Settings</h2>
            <div className="flex gap-1 overflow-x-auto sm:flex-col sm:overflow-visible">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition sm:flex-none ${
                    tab === t.id
                      ? "bg-accent text-foreground"
                      : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                  }`}
                >
                  <t.icon className="h-4 w-4" /> {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="max-h-[80vh] flex-1 overflow-y-auto p-6">
            {tab === "profile" && (
              <div>
                <div className="mb-6 flex items-center gap-4">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand/20 text-xl font-semibold text-brand">
                    {initials(displayName, profile.email)}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate font-medium">{displayName || "You"}</div>
                    <div className="truncate text-xs text-muted-foreground">{profile.email}</div>
                  </div>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                      Display name
                    </label>
                    <input
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-brand"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                      Username
                    </label>
                    <input
                      value={username}
                      onChange={(e) =>
                        setUsername(e.target.value.toLowerCase().replace(/\s+/g, ""))
                      }
                      className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-brand"
                    />
                  </div>
                  <button
                    onClick={saveProfile}
                    disabled={saving}
                    className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-brand-foreground disabled:opacity-60"
                    style={{ background: "var(--gradient-brand)" }}
                  >
                    <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save profile"}
                  </button>
                </div>
              </div>
            )}

            {tab === "account" && (
              <div>
                <h3 className="mb-1 text-base font-semibold">Change password</h3>
                <p className="mb-4 text-xs text-muted-foreground">
                  Enter a new password to update your account. Minimum 6 characters.
                </p>
                <div className="space-y-3">
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="New password"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-brand"
                  />
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm new password"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-brand"
                  />
                  <button
                    onClick={savePassword}
                    disabled={saving || !newPassword}
                    className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-brand-foreground disabled:opacity-60"
                    style={{ background: "var(--gradient-brand)" }}
                  >
                    <Save className="h-4 w-4" /> {saving ? "Updating…" : "Update password"}
                  </button>
                </div>

                <div className="mt-8 border-t border-border pt-6">
                  <h3 className="mb-3 text-sm font-semibold text-muted-foreground">
                    Signed in as {profile.email}
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={signOut}
                      className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium hover:bg-accent"
                    >
                      <LogOut className="h-3.5 w-3.5" /> Sign out
                    </button>
                    <button
                      onClick={() =>
                        toast.info(
                          "To delete your account, contact support at mrrangerplayz@gmail.com",
                        )
                      }
                      className="inline-flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs font-medium text-red-400 hover:bg-red-500/10"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Delete account
                    </button>
                  </div>
                </div>
              </div>
            )}

            {tab === "appearance" && (
              <div className="space-y-6">
                <div>
                  <h3 className="mb-2 text-base font-semibold">Theme</h3>
                  <p className="mb-3 text-xs text-muted-foreground">
                    Choose how PrismXGPT looks on this device.
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {(["light", "dark", "system"] as ThemeChoice[]).map((t) => (
                      <button
                        key={t}
                        onClick={() => setThemeState(t)}
                        className={`rounded-lg border px-3 py-2 text-xs font-medium capitalize transition ${
                          theme === t
                            ? "border-brand bg-brand/10 text-foreground"
                            : "border-border bg-background text-muted-foreground hover:bg-accent"
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="border-t border-border pt-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="text-sm font-medium">Stream AI responses</div>
                      <p className="text-xs text-muted-foreground">
                        Show tokens as they arrive from the model.
                      </p>
                    </div>
                    <button
                      onClick={() => setStreamResponses((v) => !v)}
                      className={`relative h-6 w-11 shrink-0 rounded-full transition ${
                        streamResponses ? "bg-brand" : "bg-muted"
                      }`}
                      aria-pressed={streamResponses}
                    >
                      <span
                        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${
                          streamResponses ? "left-[22px]" : "left-0.5"
                        }`}
                      />
                    </button>
                  </div>
                </div>

                {onClearHistory && (
                  <div className="border-t border-border pt-4">
                    <h3 className="mb-1 text-sm font-semibold">Chat history</h3>
                    <p className="mb-3 text-xs text-muted-foreground">
                      Remove all locally stored chats on this device.
                    </p>
                    <button
                      onClick={() => {
                        if (window.confirm("Clear all chats on this device? This cannot be undone.")) {
                          onClearHistory();
                          onClose();
                        }
                      }}
                      className="inline-flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs font-medium text-red-400 hover:bg-red-500/10"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Clear chat history
                    </button>
                  </div>
                )}
              </div>
            )}

            {tab === "personalization" && (
              <div className="space-y-5">
                <div>
                  <h3 className="mb-1 text-base font-semibold">Custom instructions</h3>
                  <p className="text-xs text-muted-foreground">
                    These are included with every new conversation so PrismXGPT can tailor its responses.
                  </p>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                    What should PrismXGPT know about you?
                  </label>
                  <textarea
                    value={personAbout}
                    onChange={(e) => { setPersonAbout(e.target.value); setPersonSaved(false); }}
                    rows={5}
                    maxLength={2000}
                    placeholder="Role, interests, projects, expertise…"
                    className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-brand"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                    How would you like PrismXGPT to respond?
                  </label>
                  <textarea
                    value={personStyle}
                    onChange={(e) => { setPersonStyle(e.target.value); setPersonSaved(false); }}
                    rows={5}
                    maxLength={2000}
                    placeholder="Tone, formality, length, formatting preferences…"
                    className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-brand"
                  />
                </div>
                <button
                  onClick={() => {
                    try {
                      window.localStorage.setItem(
                        "prismxgpt.personalization.v1",
                        JSON.stringify({ about: personAbout, style: personStyle }),
                      );
                      setPersonSaved(true);
                      toast.success("Personalization saved");
                    } catch {
                      toast.error("Could not save");
                    }
                  }}
                  className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-brand-foreground"
                  style={{ background: "var(--gradient-brand)" }}
                >
                  <Save className="h-4 w-4" /> {personSaved ? "Saved" : "Save personalization"}
                </button>
              </div>
            )}




            {tab === "about" && (
              <div>
                <div className="mb-4 flex items-center gap-3">
                  <PrismXLogo size="lg" />
                  <div>
                    <div className="text-lg font-semibold">PrismXGPT</div>
                    <div className="text-xs text-muted-foreground">Version 1.0.0</div>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  PrismXGPT is a premium AI assistant for chat, writing, code, and research.
                </p>
                <div className="mt-4 flex flex-wrap gap-2 text-xs">
                  <a
                    href="/help"
                    className="rounded-lg border border-border bg-background px-3 py-2 font-medium hover:bg-accent"
                  >
                    Help Center
                  </a>
                  <a
                    href="/privacy"
                    className="rounded-lg border border-border bg-background px-3 py-2 font-medium hover:bg-accent"
                  >
                    Privacy Policy
                  </a>
                  <a
                    href="/terms"
                    className="rounded-lg border border-border bg-background px-3 py-2 font-medium hover:bg-accent"
                  >
                    Terms of Service
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
