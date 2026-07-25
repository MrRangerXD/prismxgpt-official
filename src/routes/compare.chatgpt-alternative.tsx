import { createFileRoute } from "@tanstack/react-router";
import { MarketingShell, MarketingPage, faqJsonLd, type Feature, type Faq } from "@/components/marketing-shell";

const features: Feature[] = [
  { title: "Free forever plan", desc: "Full-featured chat on the free plan, with generous daily limits and no credit card required." },
  { title: "Image generation & editing built-in", desc: "No separate subscription — generate and edit images inside the same chat window." },
  { title: "Multi-model routing", desc: "Each prompt is routed to the best model — reasoning, code or fast chat — without you having to pick." },
  { title: "Projects & shared context", desc: "Group chats by project, share files and give the assistant persistent knowledge — great for teams." },
  { title: "Modern developer API", desc: "REST endpoints, TypeScript & Python SDKs, and webhooks — see the API docs to get started." },
  { title: "Transparent pricing", desc: "Simple, predictable plans with no per-message pricing traps or hidden add-ons." },
];

const howItWorks = [
  "Sign up in seconds — no credit card. Your account works on the free plan immediately.",
  "Chat, generate images, edit images and build projects from one interface.",
  "Upgrade only when you need higher limits, faster models or advanced features.",
];

const faqs: Faq[] = [
  { q: "What is the best ChatGPT alternative?", a: "PrismXGPT is a strong ChatGPT alternative because it bundles multi-model chat, image generation and image editing in a single interface — with a free plan that doesn't lock the core features behind a paywall." },
  { q: "Is PrismXGPT free like ChatGPT?", a: "Yes. Our free plan includes chat, image generation and image editing. Paid plans add higher limits, priority processing and advanced reasoning models." },
  { q: "Do I need an OpenAI account?", a: "No. PrismXGPT is a standalone product — you don't need any other AI subscription to use it." },
  { q: "Can I use PrismXGPT for coding like ChatGPT?", a: "Yes. PrismXGPT has strong code capabilities across 40+ languages, with inline syntax highlighting and copy-ready snippets." },
  { q: "Is there an API?", a: "Yes. PrismXGPT offers a REST API with TypeScript and Python SDKs. See the API section in our documentation for endpoints and examples." },
];

export const Route = createFileRoute("/compare/chatgpt-alternative")({
  head: () => ({
    meta: [
      { title: "The Best ChatGPT Alternative — Free, With Images | PrismXGPT" },
      { name: "description", content: "Looking for a ChatGPT alternative? PrismXGPT is free, adds AI image generation & editing, and includes a modern API. See how it compares." },
      { property: "og:title", content: "The Best ChatGPT Alternative — Free, With Images | PrismXGPT" },
      { property: "og:description", content: "A free ChatGPT alternative with image generation, editing and a modern API." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://prismxgpt.lovable.app/compare/chatgpt-alternative" },
      { property: "og:image", content: "https://prismxgpt.lovable.app/og-image.png" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: "https://prismxgpt.lovable.app/og-image.png" },
    ],
    links: [{ rel: "canonical", href: "https://prismxgpt.lovable.app/compare/chatgpt-alternative" }],
    scripts: [{ type: "application/ld+json", children: faqJsonLd(faqs) }],
  }),
  component: Page,
});

function Page() {
  return (
    <MarketingShell>
      <MarketingPage
        eyebrow="ChatGPT Alternative"
        h1={<>A ChatGPT alternative that's <span className="font-display italic text-brand">actually free</span></>}
        intro="PrismXGPT is a modern ChatGPT alternative with multi-model chat, built-in image generation and editing, projects, and a developer API — free forever."
        features={features}
        howItWorks={howItWorks}
        faqs={faqs}
        bottomCta="Try the ChatGPT alternative free"
      />
    </MarketingShell>
  );
}
