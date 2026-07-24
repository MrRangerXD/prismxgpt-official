import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { PrismXLogo } from "@/components/prismx-logo";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { GoogleAuthButton } from "@/components/google-auth-button";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Log in — PrismXGPT" },
      { name: "description", content: "Log in to your PrismXGPT account." },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Welcome back!");
    navigate({ to: "/chat" });
  };

  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[600px]"
        style={{ background: "var(--gradient-hero)" }}
      />
      <div className="relative z-10 mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 py-16">
        <Link to="/" className="mb-8 flex items-center gap-2">
          <PrismXLogo size="md" />
          <span className="text-lg font-semibold tracking-tight">PrismXGPT</span>
        </Link>

        <div className="w-full rounded-3xl border border-border bg-card p-8 shadow-elevated">
          <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
          <p className="mt-1 text-sm text-muted-foreground">Log in to continue to PrismXGPT.</p>

          <div className="mt-6">
            <GoogleAuthButton />
          </div>
          <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
          </div>

          <form className="space-y-4" onSubmit={handleSubmit}>


            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-brand"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-brand"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-brand-foreground shadow-glow transition hover:opacity-90 disabled:opacity-60"
              style={{ background: "var(--gradient-brand)" }}
            >
              {loading ? "Logging in…" : "Log in"} <ArrowRight className="h-4 w-4" />
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Don't have an account?{" "}
            <Link to="/signup" className="font-medium text-brand hover:underline">
              Sign up free
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
