import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useProfile } from "@/hooks/use-profile";
import { joinProjectByShareToken } from "@/lib/project-share.functions";

export const Route = createFileRoute("/projects/join/$token")({
  head: () => ({ meta: [{ title: "Join project — PrismXGPT" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: JoinPage,
});

function JoinPage() {
  const { token } = Route.useParams();
  const { userId, loading, refresh } = useProfile();
  const navigate = useNavigate();
  const join = useServerFn(joinProjectByShareToken);
  const [status, setStatus] = useState<string>("Joining…");
  const attemptedRef = useState({ done: false })[0];

  useEffect(() => {
    if (loading) return;
    // Give the auth cache one extra tick to hydrate from the persisted
    // Supabase session before bouncing to /login. Previously a stale
    // `userId === null` right after refresh redirected already-signed-in
    // users to sign in again.
    if (!userId) {
      setStatus("Checking your session…");
      let cancelled = false;
      (async () => {
        await refresh();
        if (cancelled) return;
        // Re-read the module-level cache via refresh() side-effect; the
        // component will re-render if userId became non-null.
        setTimeout(() => {
          if (cancelled) return;
          // If still not signed in after a fresh session check, THEN redirect.
          import("@/integrations/supabase/client").then(async ({ supabase }) => {
            const { data } = await supabase.auth.getSession();
            if (cancelled) return;
            if (!data.session?.user) {
              const back = typeof window !== "undefined" ? window.location.pathname : "/";
              navigate({ to: "/login", search: { redirect: back } as never });
            }
          });
        }, 150);
      })();
      return () => { cancelled = true; };
    }
    if (attemptedRef.done) return;
    attemptedRef.done = true;
    (async () => {
      try {
        const res = await join({ data: { token } });
        navigate({ to: "/projects/$projectId", params: { projectId: res.projectId } });
      } catch (e) {
        setStatus(e instanceof Error ? e.message : "Invalid share link");
      }
    })();
  }, [loading, userId, token, navigate, join, refresh, attemptedRef]);

  return (
    <div className="grid min-h-screen place-items-center bg-background text-foreground">
      <div className="text-sm text-muted-foreground">{status}</div>
    </div>
  );
}
