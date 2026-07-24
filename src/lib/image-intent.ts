// Intelligent image-generation intent detection.
//
// Goal: recognise phrases like "make a loogo", "genrate image", "crate icon",
// "photo of cat", "anime girl", "pixel art dragon" as image requests without
// relying on exact keyword matches. Typos, missing letters, and synonyms are
// tolerated via Damerau-Levenshtein distance against small canonical
// vocabularies. The user's original text is never rewritten — this utility
// only classifies intent.

export type ImageIntent = {
  isImage: boolean;
  isEdit: boolean;
  confidence: number; // 0..1
};

// Canonical vocabularies. Keep short — fuzzy matching handles variants.
const VERBS = [
  "generate", "create", "make", "draw", "design", "render", "paint",
  "illustrate", "sketch", "build", "produce", "show",
];
const NOUNS = [
  "image", "picture", "photo", "photograph", "logo", "icon", "banner",
  "wallpaper", "thumbnail", "poster", "illustration", "drawing", "artwork",
  "painting", "mascot", "avatar", "sticker", "emoji", "portrait", "render",
  "art", "img", "pic",
];
const STYLE_NOUNS = [
  // Phrases like "anime girl", "pixel art dragon", "cyberpunk city",
  // "realistic lion" imply an image even without a verb.
  "anime", "manga", "cartoon", "cyberpunk", "steampunk", "pixel", "3d",
  "realistic", "photorealistic", "watercolor", "oil", "vector", "isometric",
  "minimalist", "hyperrealistic", "fantasy", "surreal", "vaporwave",
];
const EDIT_VERBS = [
  "edit", "change", "modify", "update", "adjust", "tweak", "replace",
  "remove", "add", "swap", "recolor", "redo", "improve", "enhance", "refine",
  "fix", "crop", "zoom", "rotate", "flip", "blur", "sharpen", "brighten",
  "darken", "color", "colour", "restyle",
];
const OF_PREPS = new Set(["of", "with", "showing", "featuring", "about"]);

// Damerau-Levenshtein distance (handles insert/delete/substitute/transpose).
function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  const al = a.length, bl = b.length;
  if (!al) return bl;
  if (!bl) return al;
  const dp: number[][] = Array.from({ length: al + 1 }, () => new Array(bl + 1).fill(0));
  for (let i = 0; i <= al; i++) dp[i][0] = i;
  for (let j = 0; j <= bl; j++) dp[0][j] = j;
  for (let i = 1; i <= al; i++) {
    for (let j = 1; j <= bl; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        dp[i][j] = Math.min(dp[i][j], dp[i - 2][j - 2] + 1);
      }
    }
  }
  return dp[al][bl];
}

// A token fuzzy-matches a vocab word if the edit distance is within a
// length-scaled threshold. Short words (<=4) allow 1 typo; longer words 2.
function fuzzyMatch(token: string, vocab: string[]): string | null {
  const t = token.toLowerCase();
  let best: { word: string; dist: number } | null = null;
  for (const word of vocab) {
    const threshold = word.length <= 4 ? 1 : word.length <= 7 ? 2 : 3;
    const d = editDistance(t, word);
    if (d <= threshold && (!best || d < best.dist)) best = { word, dist: d };
    if (best && best.dist === 0) break;
  }
  return best ? best.word : null;
}

// Strip punctuation; preserve internal capitalisation to protect brand names
// during classification (we don't rewrite the prompt anyway).
function tokenize(text: string): string[] {
  return text
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

// A token is likely a proper noun / brand (e.g. "ZenseiNetwork", "PrismXGPT")
// if it has internal capitals or mixed case beyond the first letter. Skip
// those from fuzzy matching so brands don't accidentally match a vocab word.
function looksLikeProperNoun(token: string): boolean {
  if (token.length < 3) return false;
  const inner = token.slice(1);
  return /[A-Z]/.test(inner) || /\d/.test(token);
}

export function detectImageIntent(rawText: string): ImageIntent {
  const text = rawText.trim();
  if (!text) return { isImage: false, isEdit: false, confidence: 0 };

  const tokens = tokenize(text);
  if (tokens.length === 0) return { isImage: false, isEdit: false, confidence: 0 };

  let verbHit = false;
  let nounHit = false;
  let styleHit = false;
  let editHit = false;
  let ofPrepHit = false;

  for (const tok of tokens) {
    if (looksLikeProperNoun(tok)) continue;
    const lower = tok.toLowerCase();
    if (OF_PREPS.has(lower)) ofPrepHit = true;
    if (!verbHit && fuzzyMatch(lower, VERBS)) verbHit = true;
    if (!nounHit && fuzzyMatch(lower, NOUNS)) nounHit = true;
    if (!styleHit && fuzzyMatch(lower, STYLE_NOUNS)) styleHit = true;
    if (!editHit && fuzzyMatch(lower, EDIT_VERBS)) editHit = true;
  }

  // Confidence heuristic:
  //  verb + noun          → 0.95  ("make a loogo", "crate icon")
  //  noun alone           → 0.75  ("logo for X", "banner for Y", "image of cat")
  //  style + any noun-ish → 0.80  ("anime girl", "pixel art dragon")
  //  verb + style         → 0.75  ("draw cyberpunk city")
  //  verb alone           → 0.35  (ambiguous — "make me happy")
  let confidence = 0;
  if (verbHit && nounHit) confidence = 0.95;
  else if (nounHit && ofPrepHit) confidence = 0.85;
  else if (nounHit) confidence = 0.75;
  else if (styleHit && verbHit) confidence = 0.8;
  else if (styleHit) confidence = 0.65;
  else if (verbHit) confidence = 0.3;

  const isImage = confidence >= 0.7;
  const isEdit = isImage && editHit && !verbHit; // "change the color", "remove the tree"
  return { isImage, isEdit: isEdit || (editHit && isImage), confidence };
}

// Explicit edit-of-previous-image detection. Only these prompts may reuse a
// prior completed generation as the input to a new one. Normal conversation
// (e.g. "hi", "what do you think of it?", "thanks") must never trigger this.
export function isExplicitImageEdit(rawText: string): boolean {
  const t = rawText.trim().toLowerCase();
  if (!t || t.length > 400) return false;
  // Phrases that explicitly reference the previous image.
  const patterns: RegExp[] = [
    /\bedit(\s+(it|this|that|the\s+image|the\s+picture|the\s+photo|the\s+logo))?\b/,
    /\bcontinue\s+editing\b/,
    /\b(make|turn|change|recolor|repaint)\s+(it|this|that|the\s+(image|picture|photo|logo|background))\b/,
    /\b(remove|erase|delete)\s+(the\s+)?(background|bg|text|watermark|logo|object|person|people)\b/,
    /\breplace\s+(the\s+)?(text|background|color|colour|logo|face)\b/,
    /\b(upscale|enlarge|hi-?res|hd|4k|8k)\s+(it|this|that|the\s+(image|picture|photo))\b/,
    /\b(improve|enhance|refine|sharpen|clean\s+up)\s+(the\s+)?(quality|image|picture|photo|resolution|colors?|details?)\b/,
    /\badd\s+.+\s+to\s+(it|this|that|the\s+(image|picture|photo|logo))\b/,
    /\bcrop\s+(it|this|that|the\s+(image|picture|photo))\b/,
    /\b(rotate|flip|blur|brighten|darken)\s+(it|this|that|the\s+(image|picture|photo))\b/,
  ];
  return patterns.some((re) => re.test(t));
}
