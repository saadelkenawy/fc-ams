FROM node:20-alpine AS base
RUN npm install -g pnpm@8
WORKDIR /app

# ── deps: install from monorepo root (needed for workspace:* refs) ─────────────
FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY shared/types/package.json            ./shared/types/package.json
COPY frontend/web-portal/package.json     ./frontend/web-portal/package.json
RUN pnpm install --frozen-lockfile

# ── builder: compile types → build Next.js ────────────────────────────────────
FROM base AS builder
# Root virtual store (contains all .pnpm packages)
COPY --from=deps /app/node_modules                       ./node_modules
# Per-package node_modules (pnpm symlinks to .pnpm store)
COPY --from=deps /app/shared/types/node_modules          ./shared/types/node_modules
COPY --from=deps /app/frontend/web-portal/node_modules   ./frontend/web-portal/node_modules
# Source files (.dockerignore excludes **/node_modules so these won't clobber above)
COPY tsconfig.base.json ./tsconfig.base.json
COPY shared/types       ./shared/types
COPY frontend/web-portal ./frontend/web-portal

RUN pnpm --filter @fadl/types build
RUN pnpm --filter @fadl/web-portal build
# pnpm deploy creates a flat node_modules (no pnpm symlinks) — production deps only
RUN pnpm --filter @fadl/web-portal deploy --prod /deploy

# ── runner: minimal production image ─────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S fadl && adduser -S fadl -G fadl
# flat node_modules (no symlinks) + package.json from pnpm deploy
COPY --from=builder /deploy/node_modules ./node_modules
COPY --from=builder /deploy/package.json ./
# compiled Next.js output
COPY --from=builder /app/frontend/web-portal/.next  ./.next
COPY --from=builder /app/frontend/web-portal/public ./public
USER fadl
EXPOSE 3010
ENV PORT=3010
ENV HOSTNAME=0.0.0.0
CMD ["./node_modules/.bin/next", "start"]
