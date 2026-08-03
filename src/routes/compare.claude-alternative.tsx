import { createFileRoute } from "@tanstack/react-router";
import {
  MarketingShell,
  MarketingPage,
  faqJsonLd,
  type Feature,
  type Faq,
} from "@/components/marketing-shell";

const features: Feature[] = [
  {
    title: "Multi-model routing",
    desc: "Each prompt is routed to the best model — reasoning, code or fast chat — without you picking.",
  },
  {
    title: "Built-in image generation",
    desc: "Generate and edit images in the same chat. No separate tool, no separate subscription.",
  },
  {
    title: "Projects with shared context",
    desc: "Group chats by project, share files and give the assistant persistent knowledge.",
  },
  {
    title: "Generous free plan",
    desc: "Real limits on the free tier — chat, images and editing without a credit card.",
  },
  {
    title: "Vision & document analysis",
    desc: "Upload images, PDFs and documents. Ask questions, extract data, summarize instantly.",
  },
  {
    title: "Built for teams",
    desc: "Projects, shared context and file uploads make collaboration natural.",
  },
];

const howItWorks = [
  "Sign up in seconds — no credit card. Start chatting immediately.",
  "Ask reasoning questions, write documents, analyze files, generate images — all in one place.",
  "Save chats to Projects and give the assistant persistent context across sessions.",
];

const faqs: Faq[] = [
  {
    q: "Is PrismXGPT a good Claude alternative?",
    a: "Yes. PrismXGPT combines strong reasoning, long-form writing, code and vision with built-in image generation and editing — features Claude doesn't include natively.",
  },
  {
    q: "Does PrismXGPT support long documents?",
    a: "Yes. Upload PDFs and long text files, and the assistant will read, summarize and answer questions about them.",
  },
  {
    q: "How does the free plan compare?",
    a: "The free plan includes chat, image generation and image editing — you don't need a paid subscription to try the core product.",
  },
  {
    q: "Can I upload documents?",
    a: "Yes. You can attach images and files inside chats and organize them by project.",
  },
  {
    q: "Is my data used to train models?",
    a: "No. Your chats are private and never used to train the underlying models.",
  },
];

export const Route = createFileRoute("/compare/claude-alternative")({
  head: () => ({
    meta: [
      { title: "The Best Claude Alternative — Reasoning + Images | PrismXGPT" },
      {
        name: "description",
        content:
          "A Claude alternative with reasoning, long-form writing, vision and built-in image generation & editing. Free plan, no credit card.",
      },
      {
        property: "og:title",
        content: "The Best Claude Alternative — Reasoning + Images | PrismXGPT",
      },
      {
        property: "og:description",
        content: "Claude alternative with built-in image generation, projects and an API.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://prismxgpt.lovable.app/compare/claude-alternative" },
      { property: "og:image", content: "https://prismxgpt.lovable.app/og-image.png" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: "https://prismxgpt.lovable.app/og-image.png" },
    ],
    links: [{ rel: "canonical", href: "https://prismxgpt.lovable.app/compare/claude-alternative" }],
    scripts: [{ type: "application/ld+json", children: faqJsonLd(faqs) }],
  }),
  component: Page,
});

function Page() {
  return (
    <MarketingShell>
      <MarketingPage
        eyebrow="Claude Alternative"
        h1={
          <>
            A Claude alternative with{" "}
            <span className="font-display italic text-brand">images built in</span>
          </>
        }
        intro="PrismXGPT combines Claude-style reasoning, long-form writing and vision with native image generation and editing — free plan, no credit card."
        features={features}
        howItWorks={howItWorks}
        faqs={faqs}
        bottomCta="Try the Claude alternative free"
      />
    </MarketingShell>
  );
}
