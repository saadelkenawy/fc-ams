FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json ./
RUN npm install -g pnpm@8 && pnpm install --no-frozen-lockfile
COPY . .
RUN pnpm build

FROM node:20-alpine AS runner
WORKDIR /app
RUN addgroup -S fadl && adduser -S fadl -G fadl
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
USER fadl
EXPOSE 3013
CMD ["node", "dist/server.js"]
