// Server-only helpers for API key generation / verification.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";

export function generateApiKey(): { plaintext: string; prefix: string; last4: string; hash: string } {
  const bytes = randomBytes(30);
  let secret = "";
  for (let i = 0; i < bytes.length; i++) secret += ALPHABET[bytes[i] % ALPHABET.length];
  const plaintext = `pk_prism_${secret}`;
  return {
    plaintext,
    prefix: plaintext.slice(0, 13), // pk_prism_XXXX
    last4: plaintext.slice(-4),
    hash: sha256(plaintext),
  };
}

export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function constantTimeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export function isApiKeyString(v: string): boolean {
  return /^pk_prism_[A-Za-z0-9]{20,}$/.test(v);
}
