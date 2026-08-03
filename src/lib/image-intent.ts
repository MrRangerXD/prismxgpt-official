// Strict image-generation intent classifier.
//
// ROUTING CONTRACT
// ----------------
// The CURRENT user message is the ONLY input. History, previous
// generations, and active generation state must never influence this
// decision.
//
// Image generation fires only when the current message *explicitly*
// asks for an image. Everything else — greetings, code requests, HTML,
// explanations, follow-ups — routes to normal chat and never touches
// the image provider.
//
// The classifier returns a boolean triple:
//   - `isImage`      → start a NEW image generation
//   - `isEdit`       → ALWAYS false here; edits use `isExplicitImageEdit`
//                       and additionally require a previous image URL.
//   - `confidence`   → coarse score used only for logging / tie-break.
//
// Typos and light variants are tolerated (edit-distance 1) but only on
// the closed vocabularies below — never on arbitrary tokens.

export type ImageIntent = {
  isImage: boolean;
  isEdit: boolean;
  confidence: number;
};

export type MessageIntent = "TEXT" | "IMAGE_CREATE" | "IMAGE_EDIT";

// Verbs that, on their own, strongly imply "produce an image" regardless
// of the object noun. "Draw a dragon", "sketch a castle", "illustrate a
// scene" — all image requests even though the noun isn't in IMAGE_NOUNS.
const STRONG_IMAGE_VERBS = new Set([
  "draw",
  "sketch",
  "illustrate",
  "paint",
  "render",
  "visualize",
  "visualise",
  "photograph",
]);

// Verbs that are ambiguous alone ("make", "create", "build", "generate"
// are all used constantly in coding contexts: "generate a React
// component", "create a landing page", "build an API"). These trigger
// image generation ONLY when paired with an explicit image noun.
const WEAK_CREATION_VERBS = new Set([
  "generate",
  "create",
  "make",
  "design",
  "produce",
  "give",
  "need",
  "want",
]);

// Words that name an image artifact. Presence of one of these is what
// disambiguates "create a LOGO" (image) from "create a landing page"
// (chat). Deliberately narrow — no generic words like "page", "site",
// "component", "app", "landing", "html", "css", "code".
const IMAGE_NOUNS = new Set([
  "image",
  "images",
  "picture",
  "pictures",
  "photo",
  "photos",
  "photograph",
  "photographs",
  "logo",
  "logos",
  "icon",
  "icons",
  "favicon",
  "banner",
  "banners",
  "wallpaper",
  "wallpapers",
  "thumbnail",
  "thumbnails",
  "poster",
  "posters",
  "illustration",
  "illustrations",
  "drawing",
  "drawings",
  "artwork",
  "painting",
  "paintings",
  "mascot",
  "avatar",
  "sticker",
  "stickers",
  "emoji",
  "portrait",
  "portraits",
  "img",
  "pic",
  "pics",
  "graphic",
  "graphics",
  "visual",
  "visuals",
  "cover",
  "cover-art",
]);

// Damerau-Levenshtein distance (handles insert/delete/substitute/transpose).
function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  const al = a.length;
  const bl = b.length;
  if (!al) return bl;
  if (!bl) return al;
  const dp: number[][] = Array.from({ length: al + 1 }, () => new Array(bl + 1).fill(0));
  for (let i = 0; i <= al; i++) dp[i][0] = i;
  for (let j = 0; j <= bl; j++) dp[0][j] = j;
  for (let i = 1; i <= al; i++) {
    for (let j = 1; j <= bl; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        dp[i][j] = Math.min(dp[i][j], dp[i - 2][j - 2] + 1);
      }
    }
  }
  return dp[al][bl];
}

// Tight fuzzy match: only 1 typo allowed, and only against tokens long
// enough that a 1-edit match is meaningful (>=5 chars). This keeps
// short words ("make", "give", "img", "pic") exact-match only so common
// non-image tokens can't accidentally collide.
function inVocab(token: string, vocab: Set<string>): boolean {
  if (vocab.has(token)) return true;
  if (token.length < 5) return false;
  for (const word of vocab) {
    if (word.length < 5) continue;
    if (Math.abs(word.length - token.length) > 1) continue;
    if (editDistance(token, word) <= 1) return true;
  }
  return false;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

export function detectImageIntent(rawText: string): ImageIntent {
  const text = rawText.trim();
  if (!text) return { isImage: false, isEdit: false, confidence: 0 };
  // Long messages are almost always code, docs, or pasted content — not
  // image prompts. This is a cheap guard against pasted articles that
  // happen to contain "draw" or "picture".
  if (text.length > 600) return { isImage: false, isEdit: false, confidence: 0 };

  const tokens = tokenize(text);
  if (tokens.length === 0) return { isImage: false, isEdit: false, confidence: 0 };

  let strongVerbHit = false;
  let weakVerbHit = false;
  let nounHit = false;

  for (const tok of tokens) {
    if (!strongVerbHit && inVocab(tok, STRONG_IMAGE_VERBS)) strongVerbHit = true;
    if (!weakVerbHit && inVocab(tok, WEAK_CREATION_VERBS)) weakVerbHit = true;
    if (!nounHit && inVocab(tok, IMAGE_NOUNS)) nounHit = true;
  }

  // Rules:
  //   strong verb                → image (0.9)   "draw a dragon"
  //   weak verb + image noun     → image (0.95)  "create a logo"
  //   image noun + "of/for/with" → image (0.8)   "logo of a fox"
  //   anything else              → chat
  //
  // Notably NOT image:
  //   weak verb alone            → chat          "make me happy", "create app"
  //   image noun alone           → chat          "the logo looks great"
  //   style word alone           → chat          "cyberpunk vibe"
  let confidence = 0;
  if (weakVerbHit && nounHit) confidence = 0.95;
  else if (strongVerbHit) confidence = 0.9;
  else if (nounHit && /\b(of|for|with|showing|featuring)\b/i.test(text)) confidence = 0.8;

  const isImage = confidence >= 0.8;
  return { isImage, isEdit: false, confidence };
}

// Explicit edit-of-previous-image detection. Only these prompts may reuse a
// prior completed generation as the input to a new one. Normal conversation
// ("hi", "what do you think of it?", "thanks", "now write HTML") must never
// trigger this. Callers must ALSO verify that a previous generated image
// exists in the current thread before treating an edit intent as actionable.
export function isExplicitImageEdit(rawText: string): boolean {
  const t = rawText.trim().toLowerCase();
  if (!t || t.length > 400) return false;
  // Coding / non-image context guard — if the message references code
  // constructs, never treat it as an image edit even when it contains
  // "change color" or "make it".
  if (
    /\b(div|span|button|component|class(?:name)?|function|const|let|var|import|export|html|css|tsx?|jsx?|api|endpoint|route|query|table|schema|column|prop|state|hook|useeffect|usestate|element|selector|tag|node)\b/.test(
      t,
    )
  ) {
    return false;
  }
  const patterns: RegExp[] = [
    /^(please\s+)?edit[.!?]*$/,
    /\bedit\s+(it|this|that|the\s+(image|picture|photo|logo))\b/,
    /\bcontinue\s+editing\b/,
    /\b(turn|recolor|repaint)\s+(it|this|that|the\s+(image|picture|photo|logo|background))\b/,
    /\bchange\s+(it|this|that|the\s+(image|picture|photo|logo|background))\b/,
    /\b(remove|erase|delete)\s+(the\s+)?(background|bg|watermark)\b/,
    /\breplace\s+(the\s+)?(text|background|logo|face)\b/,
    /\b(upscale|enlarge)\b/,
    /\b(hi-?res|hd|4k|8k)\s+(it|this|that|the\s+(image|picture|photo))?\b/,
    /\b(improve|enhance|refine|sharpen|clean\s+up)\s+(the\s+)?(quality|image|picture|photo|resolution)\b/,
    /\badd\s+.+\s+to\s+(it|this|that|the\s+(image|picture|photo|logo))\b/,
    /^crop(\s+(it|this|that|the\s+(image|picture|photo)))?[.!?]*$/,
    /\bcrop\s+(it|this|that|the\s+(image|picture|photo))\b/,
    /\b(rotate|flip|blur|brighten|darken)\s+(it|this|that|the\s+(image|picture|photo))\b/,
    /\bmake\s+(it|this|that)\s+(blue|red|green|yellow|orange|purple|pink|black|white|brighter|darker|lighter|bigger|smaller|transparent)\b/,
    /^change\s+(the\s+)?(style|background|bg|palette|mood|tone)[.!?]*$/,
  ];
  return patterns.some((re) => re.test(t));
}

export function classifyMessageIntent(rawText: string): MessageIntent {
  if (isExplicitImageEdit(rawText)) return "IMAGE_EDIT";
  const intent = detectImageIntent(rawText);
  return intent.isImage ? "IMAGE_CREATE" : "TEXT";
}
