# Contract: Feature Flags API

**Owner**: identity-service (port 3000)
**Auth**: Bearer JWT (existing `fadl_token` cookie)

---

## GET /feature-flags

Returns the resolved module enable/disable map for the authenticated session.
Merges subscription-tier flags with any active developer unlock token.

### Request

```
GET /feature-flags
Cookie: fadl_token=<hs256-jwt>; X-Unlock-Token=<developer-unlock-jwt>   (optional)
Authorization: Bearer <hs256-jwt>
```

### Response 200

```json
{
  "modules": {
    "patients":     true,
    "scheduling":   true,
    "billing":      false,
    "settlements":  false,
    "ehr":          false,
    "ai":           true,
    "analytics":    false,
    "telehealth":   false,
    "procurement":  false,
    "integrations": false
  },
  "tier": "basic",
  "unlockedBy": "merged"
}
```

### Response 401

```json
{ "error": "Unauthorized" }
```

### Caching

- Server-side: Redis key `flags:{branchId}:{userId}`, TTL 60 s
- Client-side: TanStack Query `staleTime: 60_000`

---

## POST /feature-flags/unlock

Presents a developer unlock token and activates the additional modules for the
current session.

### Request

```
POST /feature-flags/unlock
Content-Type: application/json
Cookie: fadl_token=<hs256-jwt>

{ "unlockToken": "<developer-issued-hs256-jwt>" }
```

### Response 200

```json
{
  "unlocked": ["ai", "telehealth", "analytics"],
  "expiresAt": "2026-07-03T00:00:00Z"
}
```

### Response 400 (invalid token)

```json
{ "error": "Invalid or expired unlock token" }
```

### Behaviour

1. Verify `unlockToken` with `DEVELOPER_UNLOCK_SECRET`
2. Confirm `iss === 'fadl-dev'`
3. Drop any unknown module IDs
4. Write `unlock:{sessionId}` to Redis with TTL = token `exp − now`
5. Bust `flags:{branchId}:{userId}` cache key
6. Return the accepted module list

---

## Backend Module Guard

Each service exposes a Fastify `preHandler` hook:

```typescript
// services/<name>-service/src/middleware/requireModule.ts
import type { FastifyReply, FastifyRequest, FastifyPluginAsync } from 'fastify';
import type { ModuleId } from '@fadl/types';

export function requireModule(moduleId: ModuleId) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const enabled = await req.server.featureFlags.isEnabled(moduleId, req.jwtPayload);
    if (!enabled) {
      reply.code(403).send({ error: `Module '${moduleId}' is not available on your plan` });
    }
  };
}
```

Called in route registration:

```typescript
fastify.get('/patients', {
  preHandler: [requireAuth, requireModule('patients')],
}, listPatientsHandler);
```

---

## Frontend Module Gate

```typescript
// frontend/web-portal/src/hooks/useFeatureFlags.ts
import { useQuery } from '@tanstack/react-query';
import { identityApi } from '@/lib/api';

export function useFeatureFlags() {
  return useQuery({
    queryKey: ['feature-flags'],
    queryFn: () => identityApi.get<FeatureFlagsResponse>('/feature-flags').then(r => r.data),
    staleTime: 60_000,
  });
}

export function useModuleEnabled(moduleId: ModuleId): boolean {
  const { data } = useFeatureFlags();
  return data?.modules[moduleId] ?? true; // default true = no flash of disabled content
}
```

Navigation items and routes wrap with:

```tsx
{isEnabled('billing') && <NavItem href="/billing" label={t('billing')} />}
```

Disabled routes return `<ModuleUnavailablePage tier={tier} />` instead of 404.
