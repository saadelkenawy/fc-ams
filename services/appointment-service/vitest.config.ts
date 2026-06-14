import { defineConfig } from 'vitest/config';

// These are integration tests that run against the dev stack's PostgreSQL and
// open real pool connections (cold connect + per-request RLS branch binding).
// In CI they share the host with parallel image builds, so the default 5s
// per-test timeout flakes under load (e.g. build #162 on outbox, build #182 on
// the same-doctor slot swap). Give every test the same generous budget the
// beforeAll hooks already use (30s) so contention shows as slowness, not failure.
export default defineConfig({
  test: {
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
