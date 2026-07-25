import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { PrismXLogo } from "@/components/prismx-logo";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service — PrismXGPT" },
      { name: "description", content: "PrismXGPT terms of service: the rules, responsibilities, disclaimers and legal terms that apply when you use PrismXGPT." },
      { property: "og:title", content: "Terms of Service — PrismXGPT" },
      { property: "og:description", content: "The rules and terms for using PrismXGPT." },
      { property: "og:url", content: "https://prismxgpt.lovable.app/terms" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "https://prismxgpt.lovable.app/terms" }],
  }),
  component: TermsPage,
});

function TermsPage() {
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
          These Terms of Service ("Terms") are a binding agreement between you and PrismXGPT
          ("we", "our", "us") that governs your access to and use of the PrismXGPT website, chat
          interface, APIs and related services (together, the "Service"). Please read them
          carefully. By creating an account or using PrismXGPT, you agree to these Terms.
        </p>

        <h1 className="mb-4 text-3xl font-semibold tracking-tight md:text-4xl">
          Terms of <span className="font-display italic text-brand">Service</span>
        </h1>
        <p className="mb-10 text-sm text-muted-foreground">Last updated: July 1, 2026</p>

        <div className="space-y-10 text-sm leading-relaxed">
          <section>
            <h2 className="mb-3 text-lg font-semibold">1. Eligibility</h2>
            <p className="text-muted-foreground">
              You must be at least 13 years old, or the minimum age of digital consent in your
              country, to use PrismXGPT. If you are using the Service on behalf of a company or
              organisation, you confirm that you have the authority to bind that entity to these
              Terms.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold">2. Your account</h2>
            <p className="text-muted-foreground">
              You are responsible for the accuracy of the information you provide, for keeping your
              login credentials safe, and for every action taken under your account. Notify us
              immediately if you suspect any unauthorised access or use.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold">3. Acceptable use</h2>
            <p className="text-muted-foreground">
              You agree to use PrismXGPT only for lawful purposes. You will not:
            </p>
            <ul className="mt-3 list-disc space-y-2 pl-6 text-muted-foreground">
              <li>Generate, share or promote content that is illegal, hateful, harassing, sexual involving minors, or that incites violence.</li>
              <li>Use the Service to create malware, phishing content, spam, or to attempt fraud.</li>
              <li>Attempt to reverse-engineer, decompile, scrape or overload the Service.</li>
              <li>Impersonate any person or misrepresent your affiliation with any organisation.</li>
              <li>Violate the intellectual property rights, privacy rights, or other rights of anyone.</li>
            </ul>
            <p className="mt-3 text-muted-foreground">
              We may remove content or suspend accounts that violate this section.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold">4. Your content</h2>
            <p className="text-muted-foreground">
              You retain ownership of the prompts, files and content you submit ("Your Content").
              By using PrismXGPT, you grant us a worldwide, non-exclusive, royalty-free licence to
              host, store, transmit and process Your Content solely to operate and improve the
              Service. You are responsible for Your Content and for making sure you have the rights
              to submit it.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold">5. AI output</h2>
            <p className="text-muted-foreground">
              Subject to your compliance with these Terms, you may use the AI-generated output for
              your own personal or business purposes. However, AI output can be inaccurate,
              incomplete, or biased. You must review, verify and take responsibility for any
              output before relying on it, especially for legal, medical, financial, or safety
              decisions. Similar prompts may generate similar output for other users; we do not
              guarantee that any output is unique to you.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold">6. Subscriptions and payments</h2>
            <p className="text-muted-foreground">
              PrismXGPT offers a free plan and optional paid plans. Paid subscription fees are
              billed in advance on a recurring basis and are non-refundable except where required
              by law. You can cancel at any time from your account settings; cancellation takes
              effect at the end of your current billing period. We may change prices with
              reasonable prior notice.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold">7. Intellectual property</h2>
            <p className="text-muted-foreground">
              PrismXGPT, including its branding, design, code and content (excluding Your Content
              and AI output), is owned by us or our licensors and is protected by intellectual
              property laws. Nothing in these Terms transfers any ownership of the Service to you.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold">8. Termination</h2>
            <p className="text-muted-foreground">
              You can stop using PrismXGPT at any time and delete your account from settings. We
              may suspend or terminate your access if you violate these Terms, if you create risk
              or possible legal exposure for us, or if we discontinue the Service. Sections that
              by their nature should survive termination (such as ownership, disclaimers,
              limitation of liability and governing law) will continue to apply.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold">9. Disclaimers</h2>
            <p className="text-muted-foreground">
              THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE", WITHOUT WARRANTIES OF ANY KIND,
              WHETHER EXPRESS OR IMPLIED, INCLUDING WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
              PARTICULAR PURPOSE, NON-INFRINGEMENT, AND ACCURACY. WE DO NOT WARRANT THAT THE
              SERVICE WILL BE UNINTERRUPTED, SECURE, OR ERROR-FREE, OR THAT AI OUTPUT WILL BE
              ACCURATE, RELIABLE OR SUITABLE FOR YOUR PURPOSES.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold">10. Limitation of liability</h2>
            <p className="text-muted-foreground">
              TO THE MAXIMUM EXTENT PERMITTED BY LAW, PRISMXGPT AND ITS OPERATORS WILL NOT BE
              LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL OR PUNITIVE DAMAGES, OR
              FOR ANY LOSS OF PROFITS, REVENUE, DATA OR GOODWILL ARISING FROM OR RELATED TO YOUR
              USE OF THE SERVICE. OUR TOTAL LIABILITY FOR ANY CLAIM ARISING OUT OF THESE TERMS
              WILL NOT EXCEED THE GREATER OF (A) THE AMOUNTS YOU PAID US IN THE 12 MONTHS BEFORE
              THE CLAIM, OR (B) USD 50.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold">11. Indemnity</h2>
            <p className="text-muted-foreground">
              You agree to defend, indemnify and hold harmless PrismXGPT and its operators from
              any claims, damages, losses and expenses (including reasonable legal fees) arising
              from your misuse of the Service, your violation of these Terms, or your violation of
              any rights of a third party.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold">12. Changes to the Service or Terms</h2>
            <p className="text-muted-foreground">
              We may update, change or discontinue parts of the Service at any time. We may also
              revise these Terms; when we do, we will update the "Last updated" date and, for
              material changes, notify you in the app or by email. Continued use of PrismXGPT
              after changes take effect means you accept the updated Terms.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold">13. Governing law and disputes</h2>
            <p className="text-muted-foreground">
              These Terms are governed by the laws of your country of residence to the extent
              required by mandatory local law, and otherwise by the laws applicable at the
              operator's principal place of business, without regard to conflicts of law rules.
              You agree that any dispute will be resolved in the competent courts of that
              jurisdiction, unless mandatory local law grants you the right to bring a claim in
              your local courts.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold">14. Contact</h2>
            <p className="text-muted-foreground">
              For questions about these Terms, email us at{" "}
              <a href="mailto:legal@prismxgpt.com" className="text-brand hover:underline">
                legal@prismxgpt.com
              </a>
              .
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
