FROM node:20-alpine AS builder
WORKDIR /app
RUN npm install -g pnpm@8

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json ./
COPY shared/types/package.json ./shared/types/
COPY services/patient-service/package.json ./services/patient-service/
RUN pnpm install --no-frozen-lockfile

COPY . .
RUN pnpm --filter @fadl/types build
RUN pnpm --filter @fadl/patient-service build

FROM node:20-alpine AS runner
WORKDIR /app
RUN addgroup -S fadl && adduser -S fadl -G fadl
COPY --from=builder /app/services/patient-service/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/services/patient-service/package.json ./
USER fadl
CMD ["node", "dist/server.js"]
