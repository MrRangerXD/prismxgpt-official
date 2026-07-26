import { createFileRoute } from "@tanstack/react-router";
import { MarketingShell, MarketingPage, faqJsonLd, type Feature, type Faq } from "@/components/marketing-shell";

const features: Feature[] = [
  { title: "No Discord required", desc: "Generate images directly in a modern web chat — no bot commands, no channel spam." },
  { title: "Conversational editing", desc: "Refine any image with follow-up prompts like 'make it blue' or 'remove the background' — no re-generating from scratch." },
  { title: "Free plan with real quotas", desc: "Generate on the free plan without a paid subscription. Upgrade only for higher volume and priority." },
  { title: "Chat, images and code in one app", desc: "Everything Midjourney does, plus a full AI chat assistant — one login." },
  { title: "Fast, private downloads", desc: "One-click high-res downloads. Your images stay private by default — no public gallery." },
  { title: "Prompt help built in", desc: "The chat rewrites vague prompts into detailed ones automatically, so beginners get pro results." },
];

const howItWorks = [
  "Open a chat and describe your image — no Discord, no /imagine command.",
  "Preview the result in seconds. Reply to refine the style, subject or composition.",
  "Download in high resolution or share a link. Your images stay private by default.",
];

const faqs: Faq[] = [
  { q: "Is PrismXGPT a good Midjourney alternative?", a: "Yes. PrismXGPT generates high-quality AI images without requiring Discord, adds conversational editing, and bundles a full AI chat assistant — all with a free tier." },
  { q: "Does PrismXGPT need Discord?", a: "No. All image generation happens in a modern web app — no bot commands, no shared channels." },
  { q: "Are the images private?", a: "Yes. Unlike public generation feeds, your images are private to your account by default. You choose when to share." },
  { q: "How does the free plan compare?", a: "PrismXGPT's free plan includes real image generation quotas — you don't need a paid subscription to make images." },
  { q: "Can I edit generated images?", a: "Yes. Reply to any image with a plain-English instruction and PrismXGPT will edit it — no re-generating from scratch." },
];

export const Route = createFileRoute("/compare/midjourney-alternative")({
  head: () => ({
    meta: [
      { title: "The Best Midjourney Alternative — No Discord Required | PrismXGPT" },
      { name: "description", content: "A Midjourney alternative that runs in a web app — no Discord, private images, conversational editing and a real free plan. Try PrismXGPT." },
      { property: "og:title", content: "The Best Midjourney Alternative — No Discord Required | PrismXGPT" },
      { property: "og:description", content: "Modern Midjourney alternative with private images, editing and a free plan." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://prismxgpt.lovable.app/compare/midjourney-alternative" },
      { property: "og:image", content: "https://prismxgpt.lovable.app/og-image.png" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: "https://prismxgpt.lovable.app/og-image.png" },
    ],
    links: [{ rel: "canonical", href: "https://prismxgpt.lovable.app/compare/midjourney-alternative" }],
    scripts: [{ type: "application/ld+json", children: faqJsonLd(faqs) }],
  }),
  component: Page,
});

function Page() {
  return (
    <MarketingShell>
      <MarketingPage
        eyebrow="Midjourney Alternative"
        h1={<>A Midjourney alternative that <span className="font-display italic text-brand">skips Discord</span></>}
        intro="Generate and edit stunning AI images in a modern web chat — private by default, conversational, with a free plan that actually lets you create."
        features={features}
        howItWorks={howItWorks}
        faqs={faqs}
        bottomCta="Try the Midjourney alternative free"
      />
    </MarketingShell>
  );
}
