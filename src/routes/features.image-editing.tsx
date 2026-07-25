import { createFileRoute } from "@tanstack/react-router";
import { MarketingShell, MarketingPage, faqJsonLd, type Feature, type Faq } from "@/components/marketing-shell";

const features: Feature[] = [
  { title: "Edit with plain English", desc: "'Make the sky orange', 'remove the person on the left', 'add a golden retriever' — just describe the change." },
  { title: "Non-destructive edits", desc: "Every edit creates a new version. Compare, revert or branch anytime without losing the original." },
  { title: "Inpainting & object removal", desc: "Remove clutter, extend backgrounds or replace objects — no masks, no Photoshop." },
  { title: "Style transfer", desc: "Turn a photograph into an oil painting, cinematic still or 3D render with one prompt." },
  { title: "Upload your own images", desc: "Bring a photo you already have. PrismXGPT edits uploads with the same conversational flow." },
  { title: "Fast recovery", desc: "Edits resume across page refreshes and network drops — you never lose progress." },
];

const howItWorks = [
  "Generate a new image or upload your own to a chat.",
  "Reply with the change you want — 'make it blue', 'remove the background', 'add a golden crown'.",
  "PrismXGPT returns a new version. Keep refining conversationally until it's perfect.",
];

const faqs: Faq[] = [
  { q: "How do I edit an image with AI?", a: "Open a chat, upload or generate an image, then reply with a natural-language instruction like 'make the background dark blue'. PrismXGPT returns an edited version in seconds." },
  { q: "Can I edit my own photos?", a: "Yes. Upload any JPG or PNG and use the same conversational flow to remove objects, change styles, or extend the scene." },
  { q: "Is AI image editing free?", a: "Yes — the free plan includes AI image editing. Paid plans add higher resolution, larger monthly quotas and priority processing." },
  { q: "What's the difference between generation and editing?", a: "Generation creates a brand-new image from a text prompt. Editing modifies an existing image — either one you uploaded or one you previously generated." },
  { q: "Do edits overwrite the original?", a: "No. Every edit becomes a new version linked to its parent, so you can always go back or branch a different direction." },
];

export const Route = createFileRoute("/features/image-editing")({
  head: () => ({
    meta: [
      { title: "AI Image Editor — Edit Images with Natural Language | PrismXGPT" },
      { name: "description", content: "Edit images with AI using plain English. Remove objects, change styles, extend backgrounds and refine generations — all in one chat. Free plan available." },
      { property: "og:title", content: "AI Image Editor — Edit Images with Natural Language | PrismXGPT" },
      { property: "og:description", content: "Non-destructive AI image editing — just describe the change." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://prismxgpt.lovable.app/features/image-editing" },
      { property: "og:image", content: "https://prismxgpt.lovable.app/og-image.png" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: "https://prismxgpt.lovable.app/og-image.png" },
    ],
    links: [{ rel: "canonical", href: "https://prismxgpt.lovable.app/features/image-editing" }],
    scripts: [{ type: "application/ld+json", children: faqJsonLd(faqs) }],
  }),
  component: Page,
});

function Page() {
  return (
    <MarketingShell>
      <MarketingPage
        eyebrow="AI Image Editing"
        h1={<>Edit any image with <span className="font-display italic text-brand">plain English</span></>}
        intro="Remove objects, change styles, add elements or extend a scene — just describe the change. Non-destructive, versioned and conversational."
        features={features}
        howItWorks={howItWorks}
        faqs={faqs}
        bottomCta="Try AI image editing free"
      />
    </MarketingShell>
  );
}
