import { createHmac, timingSafeEqual } from "node:crypto";

/** HMAC-SHA256 signature for inter-service event envelopes. */
export function signPayload(payload: unknown, secret: string): string {
  const body = typeof payload === "string" ? payload : JSON.stringify(payload);
  return "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
}

export function verifySignature(payload: unknown, signature: string | undefined, secret: string): boolean {
  if (!signature) return false;
  const expected = signPayload(payload, secret);
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}
