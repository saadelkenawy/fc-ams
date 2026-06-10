FROM node:20-alpine AS builder
WORKDIR /app
RUN npm install -g pnpm@8

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json ./
COPY shared/types/package.json ./shared/types/
COPY shared/service-kit/package.json ./shared/service-kit/
COPY services/procedure-service/package.json ./services/procedure-service/
RUN pnpm install --no-frozen-lockfile

COPY . .
RUN pnpm --filter @fadl/types build
RUN pnpm --filter @fadl/service-kit build
RUN pnpm --filter @fadl/procedure-service build
RUN pnpm --filter @fadl/procedure-service deploy --prod /deploy

FROM node:20-alpine AS runner
WORKDIR /app
RUN addgroup -S fadl && adduser -S fadl -G fadl
COPY --from=builder /deploy/dist ./dist
COPY --from=builder /deploy/node_modules ./node_modules
COPY --from=builder /deploy/package.json ./
USER fadl
EXPOSE 3006
CMD ["node", "dist/server.js"]
