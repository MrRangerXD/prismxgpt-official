import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { PrismXLogo } from "@/components/prismx-logo";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { GoogleAuthButton } from "@/components/google-auth-button";

export const Route = createFileRoute("/signup")({
  head: () => ({
    meta: [
      { title: "Sign up — PrismXGPT" },
      { name: "description", content: "Create your free PrismXGPT account." },
    ],
  }),
  component: SignupPage,
});

function SignupPage() {
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/chat`,
        data: { full_name: name, username: username.trim().toLowerCase() },
      },
    });
    setLoading(false);
    if (error) {
      const msg = error.message || "Could not sign up.";
      if (/weak|pwned|compromis/i.test(msg)) {
        toast.error("That password is too common. Please pick a stronger one.");
      } else if (/registered|exists|already/i.test(msg)) {
        toast.error("An account with this email already exists. Try logging in.");
      } else {
        toast.error(msg);
      }
      return;
    }
    if (data.session) {
      toast.success("Welcome to PrismXGPT!");
      navigate({ to: "/chat" });
    } else {
      toast.success("Account created! Check your inbox to confirm your email.");
      navigate({ to: "/login" });
    }
  };

  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[600px]"
        style={{ background: "var(--gradient-hero)" }}
      />
      <main className="relative z-10 mx-auto flex min-h-[100dvh] w-full max-w-md flex-col items-center justify-center px-4 py-8 sm:px-6 sm:py-16">
        <Link to="/" className="mb-6 flex items-center gap-2 sm:mb-8">
          <PrismXLogo size="md" />
          <span className="text-lg font-semibold tracking-tight">PrismXGPT</span>
        </Link>

        <div className="w-full rounded-2xl border border-border bg-card p-5 shadow-elevated sm:rounded-3xl sm:p-8">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Create your account</h1>
          <p className="mt-1 text-sm text-muted-foreground">Free forever. No credit card required.</p>

          <div className="mt-5 sm:mt-6">
            <GoogleAuthButton label="Sign up with Google" />
          </div>
          <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
          </div>

          <form className="space-y-3.5 sm:space-y-4" onSubmit={handleSubmit}>


            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Full name</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jane Doe"
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-base outline-none transition focus:border-brand sm:text-sm"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Username</label>
              <input
                type="text"
                required
                minLength={3}
                maxLength={24}
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s+/g, ""))}
                placeholder="janedoe"
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-base outline-none transition focus:border-brand sm:text-sm"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-base outline-none transition focus:border-brand sm:text-sm"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Password</label>
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-base outline-none transition focus:border-brand sm:text-sm"
              />
              <p className="mt-1.5 text-[11px] text-muted-foreground">Use 8+ characters. Avoid common or breached passwords.</p>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-brand-foreground shadow-glow transition hover:opacity-90 disabled:opacity-60"
              style={{ background: "var(--gradient-brand)" }}
            >
              {loading ? "Creating…" : "Create account"} <ArrowRight className="h-4 w-4" />
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link to="/login" className="font-medium text-brand hover:underline">
              Log in
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
