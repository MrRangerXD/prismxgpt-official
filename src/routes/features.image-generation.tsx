import { createFileRoute } from "@tanstack/react-router";
import { MarketingShell, MarketingPage, faqJsonLd, type Feature, type Faq } from "@/components/marketing-shell";

const features: Feature[] = [
  { title: "Text to image in seconds", desc: "Describe anything — from photorealistic portraits to whimsical illustrations — and get a polished result in seconds." },
  { title: "Free AI image generator", desc: "Generate images on the free plan with no watermark. Upgrade for higher resolutions and priority speed." },
  { title: "Multiple styles", desc: "Photography, cinematic, anime, 3D render, vector art and more — switch with a single prompt tweak." },
  { title: "Prompt refinement", desc: "PrismXGPT rewrites vague prompts into detailed ones so your first image already looks like your tenth." },
  { title: "Instant editing", desc: "Refine any generation with follow-up prompts — 'make it blue', 'add a sunset' — no re-uploading." },
  { title: "Download & share", desc: "Export in high resolution or share a public preview link straight from the chat." },
];

const howItWorks = [
  "Open a chat and type what you want to see — the more descriptive, the better the result.",
  "PrismXGPT generates in seconds. Preview, tweak the prompt or ask for variations.",
  "Download high-res versions or continue editing conversationally with follow-up prompts.",
];

const faqs: Faq[] = [
  { q: "Is the AI image generator free?", a: "Yes. Every account can generate images on the free plan. Paid plans unlock higher resolution, faster queues and larger monthly quotas." },
  { q: "What is the best AI image generator?", a: "The right generator depends on your use case. PrismXGPT combines a photorealistic model with in-chat editing so you can generate and refine in the same conversation — without switching tools." },
  { q: "How do I generate AI images?", a: "Sign up, open a chat and describe the image. Include subject, style, mood and lighting for the best results. Example: 'A cinematic portrait of a red fox in a snowy forest, golden hour, 35mm.'" },
  { q: "Can I use the images commercially?", a: "Yes. You own the images you generate on paid plans. Check our Terms for the exact license." },
  { q: "Does it support image editing?", a: "Yes — just reply to a generation with what you want changed. See our Image Editing page for details." },
];

export const Route = createFileRoute("/features/image-generation")({
  head: () => ({
    meta: [
      { title: "Free AI Image Generator — Text to Image in Seconds | PrismXGPT" },
      { name: "description", content: "Generate stunning AI images from text with PrismXGPT. Free AI image generator with photorealistic, illustration and cinematic styles. No watermark." },
      { property: "og:title", content: "Free AI Image Generator — Text to Image in Seconds | PrismXGPT" },
      { property: "og:description", content: "Turn any prompt into a high-quality image in seconds. Free tier, no watermark, in-chat editing." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://prismxgpt.lovable.app/features/image-generation" },
      { property: "og:image", content: "https://prismxgpt.lovable.app/og-image.png" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: "https://prismxgpt.lovable.app/og-image.png" },
    ],
    links: [{ rel: "canonical", href: "https://prismxgpt.lovable.app/features/image-generation" }],
    scripts: [{ type: "application/ld+json", children: faqJsonLd(faqs) }],
  }),
  component: Page,
});

function Page() {
  return (
    <MarketingShell>
      <MarketingPage
        eyebrow="AI Image Generation"
        h1={<>The free AI image generator that <span className="font-display italic text-brand">gets your prompt right</span></>}
        intro="Turn text into stunning images in seconds. Photorealistic, illustration or cinematic — refine conversationally, download high-res, no watermark."
        features={features}
        howItWorks={howItWorks}
        faqs={faqs}
        bottomCta="Generate your first AI image free"
      />
    </MarketingShell>
  );
}
