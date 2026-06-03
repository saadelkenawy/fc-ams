#!/usr/bin/env npx tsx
/**
 * Mint a developer JWT that overrides the subscription tier for demo / testing.
 *
 * Usage:
 *   npx tsx scripts/mint-unlock-jwt.ts --tier premium --ttl 24h
 *   npx tsx scripts/mint-unlock-jwt.ts --tier standard --sub demo-admin@fadl.clinic
 *
 * The resulting token can be passed to the identity-service feature-flags endpoint
 * as a Bearer token to unlock the requested tier's modules without changing the
 * tenant's actual subscription record.
 *
 * Environment:
 *   JWT_SECRET  — required, must match the value used by all services
 */

import { SignJWT } from 'jose';
import { parseArgs } from 'node:util';

const VALID_TIERS = ['basic', 'standard', 'premium'] as const;
type Tier = (typeof VALID_TIERS)[number];

function parseTtl(ttl: string): number {
  const match = ttl.match(/^(\d+)(s|m|h|d)$/);
  if (!match) throw new Error(`Invalid TTL format "${ttl}". Use e.g. 1h, 30m, 7d.`);
  const n = parseInt(match[1], 10);
  const unit: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
  return n * unit[match[2]];
}

async function main() {
  const { values } = parseArgs({
    options: {
      tier: { type: 'string', short: 't', default: 'premium' },
      ttl:  { type: 'string', short: 'e', default: '24h' },
      sub:  { type: 'string', short: 's', default: 'developer@fadl.clinic' },
    },
    strict: true,
  });

  const tier = values.tier as string;
  if (!VALID_TIERS.includes(tier as Tier)) {
    console.error(`Unknown tier "${tier}". Valid: ${VALID_TIERS.join(', ')}`);
    process.exit(1);
  }

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    console.error('JWT_SECRET environment variable is required.');
    process.exit(1);
  }

  const ttlSeconds = parseTtl(values.ttl as string);
  const encodedSecret = new TextEncoder().encode(secret);

  const token = await new SignJWT({
    sub:              values.sub,
    role:             'admin',
    subscriptionTier: tier,
    tokenType:        'developer-unlock',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + ttlSeconds)
    .sign(encodedSecret);

  console.log('\nDeveloper unlock token:');
  console.log('─'.repeat(60));
  console.log(token);
  console.log('─'.repeat(60));
  console.log(`Tier: ${tier}  |  TTL: ${values.ttl}  |  Sub: ${values.sub}`);
  console.log('\nUsage: Authorization: Bearer <token>');
}

main().catch((err) => { console.error(err); process.exit(1); });
