import { describe, it, expect } from 'vitest';
import { createHmac } from 'crypto';
import { verifyHmacSignature } from '../src/lib/webhook-signature';

const SECRET = 'a-test-webhook-secret-at-least-16-chars';

function sign(body: string, ts: number, secret = SECRET): string {
  return createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex');
}

describe('verifyHmacSignature (webhook HMAC)', () => {
  const body = Buffer.from(JSON.stringify({ booking_id: 'abc', date: '2026-06-13' }));
  const now = Math.floor(Date.now() / 1000);

  it('accepts a valid signature over the raw body', () => {
    expect(verifyHmacSignature(body, sign(body.toString('utf8'), now), String(now), SECRET, now)).toBe(true);
  });

  it('accepts a "sha256=" prefixed signature', () => {
    const sig = `sha256=${sign(body.toString('utf8'), now)}`;
    expect(verifyHmacSignature(body, sig, String(now), SECRET, now)).toBe(true);
  });

  it('rejects a tampered body (signature no longer matches)', () => {
    const sig = sign(body.toString('utf8'), now);
    const tampered = Buffer.from(JSON.stringify({ booking_id: 'EVIL', date: '2026-06-13' }));
    expect(verifyHmacSignature(tampered, sig, String(now), SECRET, now)).toBe(false);
  });

  it('rejects a stale timestamp (replay outside the 300s window)', () => {
    const ts = now - 600;
    const sig = sign(body.toString('utf8'), ts);
    expect(verifyHmacSignature(body, sig, String(ts), SECRET, now)).toBe(false);
  });

  it('rejects a future timestamp outside the window', () => {
    const ts = now + 600;
    const sig = sign(body.toString('utf8'), ts);
    expect(verifyHmacSignature(body, sig, String(ts), SECRET, now)).toBe(false);
  });

  it('rejects a signature made with the wrong secret', () => {
    const sig = sign(body.toString('utf8'), now, 'the-wrong-secret-value-here');
    expect(verifyHmacSignature(body, sig, String(now), SECRET, now)).toBe(false);
  });

  it('rejects missing signature, timestamp, or secret', () => {
    const sig = sign(body.toString('utf8'), now);
    expect(verifyHmacSignature(body, undefined, String(now), SECRET, now)).toBe(false);
    expect(verifyHmacSignature(body, sig, undefined, SECRET, now)).toBe(false);
    expect(verifyHmacSignature(body, sig, String(now), '', now)).toBe(false);
  });

  it('rejects a non-numeric timestamp', () => {
    const sig = sign(body.toString('utf8'), now);
    expect(verifyHmacSignature(body, sig, 'not-a-number', SECRET, now)).toBe(false);
  });

  it('rejects a malformed (non-hex) signature without throwing', () => {
    expect(verifyHmacSignature(body, 'zzz', String(now), SECRET, now)).toBe(false);
  });
});
