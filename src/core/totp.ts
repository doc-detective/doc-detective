import { createHmac } from "node:crypto";

// RFC 6238 TOTP: SHA-1, 6 digits, 30-second step. Backs the `totp()` expression.
const STEP_MS = 30_000;
const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function totp(secret: string, now: number = Date.now()): string {
  const chars = String(secret).replace(/[\s=]/g, "").toUpperCase();
  let bits = "";
  for (const c of chars) bits += BASE32.indexOf(c).toString(2).padStart(5, "0");
  // A non-base32 char maps to indexOf -1, which renders as "-1" and fails here.
  // Lengths of 1, 3, or 6 mod 8 can't encode whole bytes.
  if (bits.length < 8 || /[^01]/.test(bits) || [1, 3, 6].includes(chars.length % 8)) {
    throw new Error("Couldn't generate a TOTP code: the secret isn't valid base32.");
  }
  const key = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));

  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(now / STEP_MS)));
  const hmac = createHmac("sha1", key).update(counter).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  return String((hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

// ponytail: fixed 3-second ceiling. A code with less than 3 s left may expire
// before the form submits, so wait for the next window. Make it configurable if
// a slow app needs longer.
export async function waitForFreshTotpWindow(): Promise<void> {
  const remaining = STEP_MS - (Date.now() % STEP_MS);
  if (remaining < 3_000) await new Promise((resolve) => setTimeout(resolve, remaining));
}
