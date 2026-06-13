import { createHmac, timingSafeEqual } from 'crypto';

/** Reject signatures whose timestamp is more than this many seconds from now. */
export const REPLAY_WINDOW_SEC = 300;

/**
 * Verify an HMAC-SHA256 webhook signature over `${timestamp}.${rawBody}`
 * (Stripe/GitHub style). Pure — no config dependency.
 *
 * Guarantees:
 *   • payload integrity — a tampered body fails the MAC
 *   • replay protection — a stale `timestamp` (outside REPLAY_WINDOW_SEC) is rejected
 *   • constant-time comparison — no early-exit timing leak
 *
 * `signature` may be a bare hex digest or prefixed with `sha256=`.
 * Returns false (never throws) on any malformed / missing input.
 */
export function verifyHmacSignature(
  rawBody: Buffer | undefined,
  signature: string | undefined,
  timestamp: string | undefined,
  secret: string,
  now: number = Math.floor(Date.now() / 1000),
): boolean {
  if (!secret || !signature || !timestamp) return false;

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  if (Math.abs(now - ts) > REPLAY_WINDOW_SEC) return false;

  const signedPayload = `${timestamp}.${rawBody?.toString('utf8') ?? ''}`;
  const expectedSig = createHmac('sha256', secret).update(signedPayload).digest();

  const providedHex = signature.startsWith('sha256=') ? signature.slice(7) : signature;
  let provided: Buffer;
  try {
    provided = Buffer.from(providedHex, 'hex');
  } catch {
    return false;
  }
  // timingSafeEqual throws on length mismatch — guard first to avoid leaking it.
  if (provided.length !== expectedSig.length) return false;
  return timingSafeEqual(provided, expectedSig);
}
