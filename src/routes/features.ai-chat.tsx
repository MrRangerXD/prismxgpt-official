import { createFileRoute } from "@tanstack/react-router";
import { MarketingShell, MarketingPage, faqJsonLd, type Feature, type Faq } from "@/components/marketing-shell";

const features: Feature[] = [
  { title: "Natural conversation", desc: "Chat that remembers context, adapts to your voice and stays on topic across long sessions." },
  { title: "Multi-model routing", desc: "Automatically routes each prompt to the model best suited to it — reasoning, code or fast chat." },
  { title: "Code with confidence", desc: "Write, refactor and debug in 40+ languages with inline syntax highlighting and copy-ready snippets." },
  { title: "Long-form writing", desc: "Draft essays, emails, marketing copy and reports in a voice that actually sounds like yours." },
  { title: "Vision & files", desc: "Attach images, PDFs and documents. Ask questions, extract data or summarize instantly." },
  { title: "Projects & memory", desc: "Group chats by project, share context and give the assistant persistent knowledge about your work." },
];

const howItWorks = [
  "Sign up in seconds — no credit card, no download. Your first chat is ready to go.",
  "Ask anything: brainstorm, code, translate, analyze data, or upload a document.",
  "Save chats into Projects to give the assistant persistent context across sessions.",
];

const faqs: Faq[] = [
  { q: "Is PrismXGPT free?", a: "Yes. The free plan gives you unlimited chat with our fast model. Upgrade any time for advanced reasoning, image generation and higher limits." },
  { q: "How is this different from ChatGPT?", a: "PrismXGPT bundles multi-model chat, image generation and image editing in one interface, with projects, sharing and a modern developer API — all with a generous free tier." },
  { q: "What can I use the AI chat assistant for?", a: "Writing, coding, research, brainstorming, summarizing documents, translating, learning new topics, drafting emails, planning trips — anything you'd ask a knowledgeable colleague." },
  { q: "Does the AI remember previous conversations?", a: "Within a chat, yes. Across chats, use Projects to share persistent context, files and instructions between conversations." },
  { q: "Is my data private?", a: "Yes. Your chats are encrypted at rest and never used to train models. See our Privacy Policy for full details." },
];

export const Route = createFileRoute("/features/ai-chat")({
  head: () => ({
    meta: [
      { title: "AI Chat Assistant — Free, Fast & Multi-Model | PrismXGPT" },
      { name: "description", content: "PrismXGPT is a free AI chat assistant for writing, coding, research and analysis — with multi-model routing, projects and vision. Start free, no credit card." },
      { property: "og:title", content: "AI Chat Assistant — Free, Fast & Multi-Model | PrismXGPT" },
      { property: "og:description", content: "A modern AI chat assistant with multi-model routing, projects, vision and a generous free plan." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://prismxgpt.lovable.app/features/ai-chat" },
      { property: "og:image", content: "https://prismxgpt.lovable.app/og-image.png" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: "https://prismxgpt.lovable.app/og-image.png" },
    ],
    links: [{ rel: "canonical", href: "https://prismxgpt.lovable.app/features/ai-chat" }],
    scripts: [{ type: "application/ld+json", children: faqJsonLd(faqs) }],
  }),
  component: Page,
});

function Page() {
  return (
    <MarketingShell>
      <MarketingPage
        eyebrow="AI Chat Assistant"
        h1={<>The AI chat assistant that <span className="font-display italic text-brand">thinks with you</span></>}
        intro="Chat, write, code and analyze with a modern AI assistant that routes each prompt to the best model — free forever with an optional premium plan."
        features={features}
        howItWorks={howItWorks}
        faqs={faqs}
        bottomCta="Start chatting free in seconds"
      />
    </MarketingShell>
  );
}
