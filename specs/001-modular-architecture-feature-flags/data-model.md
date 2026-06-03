# Data Model: Modular Architecture & Feature Flagging

**Branch**: `001-modular-architecture-feature-flags`
**Phase**: 1 (Design)

---

## Module Registry

No new database table. Module identity is a compile-time constant.

```typescript
// shared/types/src/feature-flags.ts

export const MODULES = [
  'patients',
  'scheduling',
  'billing',
  'settlements',
  'ehr',
  'ai',
  'analytics',
  'telehealth',
  'procurement',
  'integrations',
] as const;

export type ModuleId = typeof MODULES[number];

export const TIER_MODULES: Record<SubscriptionTier, ModuleId[]> = {
  basic:    ['patients', 'scheduling'],
  standard: ['patients', 'scheduling', 'billing', 'settlements', 'ehr'],
  premium:  [...MODULES],
};

export type SubscriptionTier = 'basic' | 'standard' | 'premium';
```

---

## JWT Payload (extended)

```typescript
// shared/types/src/common.ts — extend existing JwtPayload

export interface JwtPayload {
  sub: string;
  role: 'admin' | 'doctor' | 'receptionist' | 'finance' | 'patient';
  branchId: number;
  doctorId?: string;
  subscriptionTier?: SubscriptionTier;   // NEW — defaults to 'premium' if absent
}
```

---

## Developer Unlock Token Payload

Separate token, verified with `DEVELOPER_UNLOCK_SECRET`.

```typescript
export interface UnlockTokenPayload {
  iss: 'fadl-dev';
  modules: ModuleId[];
  exp: number;          // Unix timestamp
  note?: string;        // human-readable demo label
}
```

---

## Feature Flags Response (API)

```typescript
export interface FeatureFlagsResponse {
  modules: Record<ModuleId, boolean>;
  tier: SubscriptionTier;
  unlockedBy: 'subscription' | 'developer-token' | 'merged';
}
```

---

## Redis Keys

| Key pattern | Value | TTL |
|---|---|---|
| `flags:{branchId}:{userId}` | `JSON.stringify(FeatureFlagsResponse)` | 60 s |
| `unlock:{sessionId}` | `JSON.stringify(ModuleId[])` | token `exp − now` |

No new migrations required. No PostgreSQL schema changes.

---

## Service → Module Mapping

| Service | Port | `MODULE_ID` |
|---|---|---|
| patient-service | 3002 | `patients` |
| appointment-service | 3001 | `scheduling` |
| billing-service | 3004 | `billing`, `settlements` |
| ehr-service | 3005 | `ehr` |
| ai-chatbot-service | 3008 | `ai` |
| analytics-service | 3009 | `analytics` |
| telehealth-service | 3013 | `telehealth` |
| procurement-service | 3010 | `procurement` |
| integration-service | 3012 | `integrations` |

Services not in the table (identity, doctor, notification, file, procedure) are
core infrastructure and are always enabled.

---

## Validation Rules

- `subscriptionTier` in JWT: if missing or unrecognised, resolve as `'premium'`
  (backward compatibility)
- `UnlockTokenPayload.modules`: validated against `MODULES` array; unknown module
  IDs are silently dropped
- `X-Unlock-Token` cookie: if present but expired/invalid, treat as absent (no
  error returned to client — graceful degradation)
- `flags:{branchId}:{userId}` cache: busted on login and on successful unlock
  token presentation

---

## State Transitions

None. Feature flags are stateless configuration; there are no lifecycle transitions.
