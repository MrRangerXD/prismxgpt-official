import logoAsset from "@/assets/prismx-logo.png.asset.json";

type Props = {
  className?: string;
  showWordmark?: boolean;
  size?: "sm" | "md" | "lg";
};

/**
 * The official PrismXGPT logo (prism + R mark).
 * The uploaded artwork already contains the "PrismX GPT" wordmark, so by
 * default we render just the image and let it speak for itself.
 */
export function PrismXLogo({ className = "", showWordmark = false, size = "md" }: Props) {
  const sizes = {
    sm: "h-7 w-7",
    md: "h-9 w-9",
    lg: "h-12 w-12",
  } as const;

  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <img
        src={logoAsset.url}
        alt="PrismXGPT"
        className={`${sizes[size]} rounded-2xl object-cover ring-1 ring-white/10 shadow-sm`}
        loading="eager"
        decoding="async"
      />
      {showWordmark && (
        <span className="text-lg font-semibold tracking-tight">PrismXGPT</span>
      )}
    </span>
  );
}
