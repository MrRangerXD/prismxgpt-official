import { Link, useNavigate } from "@tanstack/react-router";
import {
  Sparkles,
  PanelLeft,
  SquarePen,
  Search,
  Library,
  FolderClosed,
  MoreHorizontal,
  ChevronRight,
  Settings,
  User,
  LifeBuoy,
  LogOut,
  Gift,
  Wand2,
  Trash2,
  ImageIcon,
  
  Crown,
  Shield,
  Plus,
  Check,
  X,
  Pin,
  Pencil,
  Share2,
  FolderPlus,
  BookOpen,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { ChatThread } from "@/lib/chat-store";
import { supabase } from "@/integrations/supabase/client";
import type { UserContext } from "@/hooks/use-profile";
import { initials } from "@/hooks/use-profile";
import { toast } from "sonner";
import { PrismXLogo } from "@/components/prismx-logo";

export function PrismSidebar({
  collapsed,
  onToggle,
  mobileOpen,
  onMobileClose,
  threads,
  activeId,
  onSelectThread,
  onNewChat,
  onDeleteThread,
  onRenameThread,
  onPinThread,
  onShareThread,
  onMoveThread,
  user,
  onOpenSearch,
  onOpenLibrary,
  onOpenProjects,
  onOpenPlus,
  onOpenProfile,
  onOpenImage,
  onOpenSettings,
}: {
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
  threads: ChatThread[];
  activeId: string | null;
  onSelectThread: (id: string) => void;
  onNewChat: () => void;
  onDeleteThread: (id: string) => void;
  onRenameThread: (id: string) => void;
  onPinThread: (id: string) => void;
  onShareThread: (id: string) => void;
  onMoveThread: (id: string) => void;
  user: UserContext;
  onOpenSearch: () => void;
  onOpenLibrary: () => void;
  onOpenProjects: () => void;
  onOpenPlus: () => void;
  onOpenProfile: () => void;
  onOpenImage: () => void;
  onOpenSettings: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [threadMenuId, setThreadMenuId] = useState<string | null>(null);
  const sortedThreads = useMemo(
    () =>
      [...threads].sort((a, b) => {
        if ((b.pinned ? 1 : 0) !== (a.pinned ? 1 : 0)) return (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0);
        return b.updatedAt - a.updatedAt;
      }),
    [threads],
  );
  const [accountOpen, setAccountOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const navigate = useNavigate();

  const displayName = user.profile?.display_name || user.email?.split("@")[0] || "You";
  const planLabel = user.isPremium ? "Premium" : "Free";
  const avatarInitials = initials(user.profile?.display_name, user.email);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast.success("Signed out");
    navigate({ to: "/login" });
  };

  if (collapsed && !mobileOpen) {
    return (
      <aside className="hidden md:flex sticky top-0 h-screen w-14 flex-col items-center gap-2 border-r border-border bg-card/60 py-4">
        <button
          onClick={onToggle}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-accent hover:text-foreground"
          aria-label="Expand sidebar"
        >
          <PanelLeft className="h-4 w-4" />
        </button>
        <PrismXLogo size="sm" />

        <button
          onClick={onNewChat}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-accent hover:text-foreground"
          title="New chat"
        >
          <SquarePen className="h-4 w-4" />
        </button>
        <button
          onClick={onOpenSearch}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-accent hover:text-foreground"
          title="Search chats"
        >
          <Search className="h-4 w-4" />
        </button>
        <button
          onClick={onOpenLibrary}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-accent hover:text-foreground"
          title="Library"
        >
          <Library className="h-4 w-4" />
        </button>
        <button
          onClick={onOpenProjects}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-accent hover:text-foreground"
          title="Projects"
        >
          <FolderClosed className="h-4 w-4" />
        </button>
      </aside>
    );
  }

  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-background/60 backdrop-blur-sm md:hidden"
          onClick={onMobileClose}
          aria-hidden
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex h-[100dvh] w-[85vw] max-w-[20rem] flex-col border-r border-border bg-card transition-transform md:sticky md:top-0 md:z-auto md:h-screen md:w-64 md:max-w-none md:translate-x-0 md:bg-card/60 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
      >
      <div className="flex items-center justify-between px-3 py-3">
        <Link to="/" className="flex items-center gap-2">
          <PrismXLogo size="sm" />
          <span className="text-sm font-semibold tracking-tight">PrismXGPT</span>
        </Link>
        <button
          onClick={() => (mobileOpen ? onMobileClose?.() : onToggle())}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-accent hover:text-foreground"
          aria-label={mobileOpen ? "Close menu" : "Collapse sidebar"}
        >
          {mobileOpen ? <X className="h-4 w-4" /> : <PanelLeft className="h-4 w-4" />}
        </button>
      </div>

      <nav className="flex flex-col gap-0.5 px-2 pt-2">
        <button onClick={onNewChat} className={rowCls}>
          <SquarePen className="h-4 w-4 text-muted-foreground" />
          <span>New chat</span>
        </button>
        <button onClick={onOpenSearch} className={rowCls}>
          <Search className="h-4 w-4 text-muted-foreground" />
          <span>Search chats</span>
        </button>
        <button onClick={onOpenLibrary} className={rowCls}>
          <Library className="h-4 w-4 text-muted-foreground" />
          <span>Library</span>
        </button>
        <button onClick={onOpenProjects} className={rowCls}>
          <FolderClosed className="h-4 w-4 text-muted-foreground" />
          <span>Projects</span>
        </button>
        <div className="relative">
          <button className={rowCls} onClick={() => setMoreOpen((v) => !v)}>
            <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
            <span>More</span>
          </button>
          {moreOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setMoreOpen(false)} />
              <div className="absolute left-full top-0 z-40 ml-1 w-52 overflow-hidden rounded-xl border border-border bg-card shadow-elevated">
                <button
                  onClick={() => {
                    setMoreOpen(false);
                    onOpenImage();
                  }}
                  className="flex w-full items-center gap-3 px-3 py-2 text-sm hover:bg-accent"
                >
                  <ImageIcon className="h-4 w-4 text-muted-foreground" /> Images
                </button>
              </div>
            </>
          )}
        </div>
      </nav>

      <div className="mt-4 flex-1 overflow-y-auto px-2">
        <div className="px-2.5 py-2 text-xs font-semibold text-foreground/80">Recents</div>
        {threads.length === 0 ? (
          <div className="px-2.5 py-2 text-xs text-muted-foreground">
            Your conversations will appear here.
          </div>
        ) : (
          <div className="flex flex-col gap-0.5">
            {sortedThreads.map((t) => (
              <div
                key={t.id}
                className={`group relative flex items-center gap-1 rounded-lg pr-1 transition ${
                  activeId === t.id ? "bg-accent" : "hover:bg-accent"
                }`}
              >
                <button
                  onClick={() => onSelectThread(t.id)}
                  className="flex min-w-0 flex-1 items-center gap-1.5 truncate px-2.5 py-1.5 text-left text-sm text-foreground/90"
                  title={t.title}
                >
                  {t.pinned && <Pin className="h-3 w-3 flex-none text-brand" />}
                  <span className="truncate">{t.title || "New chat"}</span>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setThreadMenuId((cur) => (cur === t.id ? null : t.id));
                  }}
                  className={`flex h-6 w-6 flex-none items-center justify-center rounded text-muted-foreground transition hover:text-foreground ${
                    threadMenuId === t.id ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                  }`}
                  aria-label="Chat options"
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </button>
                {threadMenuId === t.id && (
                  <>
                    <div
                      className="fixed inset-0 z-30"
                      onClick={() => setThreadMenuId(null)}
                    />
                    <div className="absolute right-1 top-8 z-40 w-48 overflow-hidden rounded-xl border border-border bg-card shadow-elevated">
                      <button
                        onClick={() => { setThreadMenuId(null); onShareThread(t.id); }}
                        className="flex w-full items-center gap-2.5 px-3 py-2 text-sm hover:bg-accent"
                      >
                        <Share2 className="h-3.5 w-3.5 text-muted-foreground" /> Share chat
                      </button>
                      <button
                        onClick={() => { setThreadMenuId(null); onRenameThread(t.id); }}
                        className="flex w-full items-center gap-2.5 px-3 py-2 text-sm hover:bg-accent"
                      >
                        <Pencil className="h-3.5 w-3.5 text-muted-foreground" /> Rename
                      </button>
                      <button
                        onClick={() => { setThreadMenuId(null); onPinThread(t.id); }}
                        className="flex w-full items-center gap-2.5 px-3 py-2 text-sm hover:bg-accent"
                      >
                        <Pin className="h-3.5 w-3.5 text-muted-foreground" />
                        {t.pinned ? "Unpin" : "Pin chat"}
                      </button>
                      <button
                        onClick={() => { setThreadMenuId(null); onMoveThread(t.id); }}
                        className="flex w-full items-center gap-2.5 px-3 py-2 text-sm hover:bg-accent"
                      >
                        <FolderPlus className="h-3.5 w-3.5 text-muted-foreground" /> Move to project
                      </button>
                      <div className="my-1 h-px bg-border" />
                      <button
                        onClick={() => { setThreadMenuId(null); onDeleteThread(t.id); }}
                        className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Delete
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}


      </div>

      <div className="relative border-t border-border p-2">
        {menuOpen && (
          <div className="absolute bottom-full left-2 right-2 mb-2 overflow-hidden rounded-2xl border border-border bg-card shadow-elevated">
            <button
              onClick={() => {
                setMenuOpen(false);
                setAccountOpen((v) => !v);
              }}
              className="flex w-full items-center gap-3 px-3 py-3 transition hover:bg-accent"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand/20 text-sm font-semibold text-brand">
                {avatarInitials}
              </div>
              <div className="flex-1 text-left">
                <div className="text-sm font-medium">{displayName}</div>
                <div className="text-xs text-muted-foreground">{planLabel}</div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>
            <div className="my-1 h-px bg-border" />
            <MenuRow
              icon={Wand2}
              label={user.isPremium ? "You have Premium" : "Try Plus free"}
              onClick={() => {
                setMenuOpen(false);
                onOpenPlus();
              }}
            />
            <MenuRow
              icon={User}
              label="Profile"
              onClick={() => {
                setMenuOpen(false);
                onOpenProfile();
              }}
            />
            <MenuRow
              icon={Settings}
              label="Settings"
              onClick={() => {
                setMenuOpen(false);
                onOpenSettings();
              }}
            />
            {user.isAdmin && (
              <MenuRow
                icon={Shield}
                label="Admin panel"
                onClick={() => {
                  setMenuOpen(false);
                  navigate({ to: "/admin" });
                }}
              />
            )}
            <MenuRow
              icon={LifeBuoy}
              label="Help"
              trailing
              onClick={() => {
                setMenuOpen(false);
                navigate({ to: "/help" });
              }}
            />
            <button
              onClick={handleLogout}
              className="flex w-full items-center gap-3 px-3 py-2 text-sm text-foreground/90 transition hover:bg-accent"
            >
              <LogOut className="h-4 w-4 text-muted-foreground" />
              Log out
            </button>
          </div>
        )}

        {accountOpen && (
          <div className="absolute bottom-full left-2 right-2 mb-2 overflow-hidden rounded-2xl border border-border bg-card shadow-elevated">
            <div className="px-3 py-2 text-xs text-muted-foreground">{user.email}</div>
            <div className="my-1 h-px bg-border" />
            <button className="flex w-full items-center gap-3 px-3 py-2 text-sm hover:bg-accent">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand/20 text-xs font-semibold text-brand">
                {avatarInitials}
              </div>
              <span className="flex-1 text-left">{displayName}</span>
              <Check className="h-4 w-4 text-brand" />
            </button>
            <button
              onClick={async () => {
                await supabase.auth.signOut();
                navigate({ to: "/login" });
              }}
              className="flex w-full items-center gap-3 px-3 py-2 text-sm hover:bg-accent"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-full border border-dashed border-border">
                <Plus className="h-4 w-4 text-muted-foreground" />
              </div>
              <span className="flex-1 text-left">Add account</span>
            </button>
          </div>
        )}

        <button
          onClick={() => {
            setMenuOpen((v) => !v);
            setAccountOpen(false);
          }}
          className="flex w-full items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-accent"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand/20 text-xs font-semibold text-brand">
            {avatarInitials}
          </div>
          <div className="flex-1 text-left">
            <div className="text-sm font-medium">{displayName}</div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              {user.isPremium ? (
                <>
                  <Crown className="h-3 w-3 text-brand" /> <span className="text-brand">Premium</span>
                </>
              ) : (
                "Free"
              )}
            </div>
          </div>
        </button>

        {!user.isPremium && (
          <button
            onClick={onOpenPlus}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-background/40 px-3 py-2 text-xs font-medium text-foreground/90 transition hover:bg-accent"
          >
            <Gift className="h-3.5 w-3.5" />
            Claim offer
          </button>
        )}
      </div>
    </aside>
    </>
  );
}

const rowCls =
  "flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm text-foreground/90 transition hover:bg-accent w-full text-left";

function MenuRow({
  icon: Icon,
  label,
  trailing,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  trailing?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 px-3 py-2 text-sm text-foreground/90 transition hover:bg-accent"
    >
      <Icon className="h-4 w-4 text-muted-foreground" />
      <span className="flex-1 text-left">{label}</span>
      {trailing && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
    </button>
  );
}
