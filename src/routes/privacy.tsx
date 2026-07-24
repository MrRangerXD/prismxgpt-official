import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { PrismXLogo } from "@/components/prismx-logo";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — PrismXGPT" },
      { name: "description", content: "PrismXGPT privacy policy: what data we collect, how we use it, how we protect it, and the rights you have over your information." },
      { property: "og:title", content: "Privacy Policy — PrismXGPT" },
      { property: "og:description", content: "How PrismXGPT collects, uses and protects your data." },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[600px]"
        style={{ background: "var(--gradient-hero)" }}
      />

      <header className="relative z-20">
        <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <Link to="/" className="flex items-center gap-2" aria-label="PrismXGPT home">
            <PrismXLogo size="md" />
            <span className="text-lg font-semibold tracking-tight">PrismXGPT</span>
          </Link>

          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Back to home
          </Link>
        </nav>
      </header>

      <main className="relative z-10 mx-auto max-w-3xl px-6 pb-24 pt-8 md:pt-12">
        <p className="mb-8 text-sm text-muted-foreground">
          This Privacy Policy explains how PrismXGPT ("we", "our", "us") collects, uses, stores
          and protects information when you use our website, chat interface and related services
          (together, the "Service"). By using PrismXGPT, you agree to the practices described here.
        </p>

        <h1 className="mb-4 text-3xl font-semibold tracking-tight md:text-4xl">
          Privacy <span className="font-display italic text-brand">Policy</span>
        </h1>
        <p className="mb-10 text-sm text-muted-foreground">Last updated: July 1, 2026</p>

        <div className="space-y-10 text-sm leading-relaxed">
          <section>
            <h2 className="mb-3 text-lg font-semibold">1. Information we collect</h2>
            <p className="text-muted-foreground">
              We collect three broad categories of information:
            </p>
            <ul className="mt-3 list-disc space-y-2 pl-6 text-muted-foreground">
              <li>
                <span className="text-foreground">Account information</span> — your email address,
                display name, password hash and, if you sign in with a social provider, the basic
                profile details that provider shares with us (such as your name and avatar).
              </li>
              <li>
                <span className="text-foreground">Content you create</span> — the prompts, files,
                images and conversations you submit to PrismXGPT, along with the AI responses
                generated for you, and any projects or workspaces you build inside the app.
              </li>
              <li>
                <span className="text-foreground">Technical data</span> — device and browser
                information, IP address, approximate location derived from IP, pages you visit,
                features you use, and diagnostic logs used to keep the Service reliable and secure.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold">2. How we use your information</h2>
            <p className="text-muted-foreground">
              We use your information to operate PrismXGPT, generate AI responses, authenticate you,
              personalise your experience, prevent abuse, process payments where applicable, and
              communicate with you about updates, security notices and support. We may also use
              aggregated, non-identifying data to understand how the product is used and to improve
              features, quality and safety.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold">3. AI processing and your content</h2>
            <p className="text-muted-foreground">
              To generate responses, your prompts and relevant conversation context are sent to
              third-party AI model providers through a secure gateway. We configure these providers
              so that your conversations are not used to train their foundation models. However,
              please avoid sharing highly sensitive personal, health, financial, or confidential
              third-party information in prompts. You are responsible for the content you submit.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold">4. How we share information</h2>
            <p className="text-muted-foreground">
              We do <span className="text-foreground">not</span> sell your personal information. We
              share it only with:
            </p>
            <ul className="mt-3 list-disc space-y-2 pl-6 text-muted-foreground">
              <li>Service providers that host our infrastructure, database, authentication and analytics.</li>
              <li>AI model providers that generate responses to your prompts.</li>
              <li>Payment processors when you subscribe to a paid plan.</li>
              <li>Law enforcement or regulators when we are legally required to do so, or to protect the rights, safety and property of our users or the public.</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold">5. Security</h2>
            <p className="text-muted-foreground">
              We use encryption in transit (HTTPS/TLS), encryption at rest for stored data, strict
              access controls, row-level security in our database, and regular security reviews.
              While no system is 100% secure, we work hard to protect your information. Please help
              us by using a strong, unique password and enabling any additional protections we offer.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold">6. Cookies and similar technologies</h2>
            <p className="text-muted-foreground">
              We use essential cookies to keep you signed in and to remember your preferences. We
              may also use privacy-respecting analytics to understand aggregate usage patterns. You
              can disable non-essential cookies in your browser, but some parts of the Service may
              not function correctly without them.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold">7. Data retention</h2>
            <p className="text-muted-foreground">
              We keep your account and conversation history for as long as your account is active.
              You can delete individual chats at any time, or delete your entire account from your
              profile settings. After account deletion, we remove or anonymise your personal data
              within a reasonable period, unless we are legally required to retain some information
              (for example, billing records).
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold">8. Your rights</h2>
            <p className="text-muted-foreground">
              Depending on where you live, you may have the right to access, correct, export or
              delete your personal data, and to object to or restrict certain processing. To
              exercise any of these rights, contact us at the email below. We will respond within
              the timelines required by applicable law.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold">9. Children's privacy</h2>
            <p className="text-muted-foreground">
              PrismXGPT is not directed to children under 13 (or the minimum age of digital consent
              in your country). We do not knowingly collect personal information from children. If
              you believe a child has provided us with personal data, contact us and we will
              promptly delete it.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold">10. International transfers</h2>
            <p className="text-muted-foreground">
              PrismXGPT is operated globally. Your information may be processed in countries other
              than the one where you live. We rely on standard contractual clauses and equivalent
              safeguards to protect your data whenever it crosses borders.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold">11. Changes to this policy</h2>
            <p className="text-muted-foreground">
              We may update this Privacy Policy from time to time. When we make material changes,
              we will notify you inside the app or by email. The "Last updated" date at the top of
              this page shows when the policy was most recently revised.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold">12. Contact us</h2>
            <p className="text-muted-foreground">
              If you have any questions about this Privacy Policy or how we handle your data, email
              us at{" "}
              <a href="mailto:privacy@prismxgpt.com" className="text-brand hover:underline">
                privacy@prismxgpt.com
              </a>
              . We read every message.
            </p>
          </section>
        </div>
      </main>

      <footer className="relative z-10 border-t border-border">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-6 py-8 text-sm text-muted-foreground md:flex-row">
          <div className="flex items-center gap-2">
            <PrismXLogo size="sm" />
            <span>© 2026 PrismXGPT. All rights reserved.</span>
          </div>
          <div className="flex gap-6">
            <Link to="/privacy" className="hover:text-foreground">Privacy</Link>
            <Link to="/terms" className="hover:text-foreground">Terms</Link>
            <Link to="/" className="hover:text-foreground">Home</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
