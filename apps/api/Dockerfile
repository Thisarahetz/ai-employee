# syntax=docker/dockerfile:1

# ── Base ──────────────────────────────────────────────────────────────────
FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /app

# ── Dependencies (cached layer) ──────────────────────────────────────────
FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY tsconfig.base.json turbo.json ./
COPY prisma ./prisma
COPY apps/api/package.json apps/api/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/types/package.json packages/types/package.json
COPY packages/ai-core/package.json packages/ai-core/package.json
COPY packages/integration-sdk/package.json packages/integration-sdk/package.json
COPY packages/channel-sdk/package.json packages/channel-sdk/package.json
RUN pnpm install --frozen-lockfile

# ── Build ─────────────────────────────────────────────────────────────────
FROM deps AS build
COPY . .
RUN pnpm --filter @ai-employee/api exec prisma generate
RUN pnpm --filter @ai-employee/api... build

# ── Runtime ───────────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime
ENV NODE_ENV=production
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /app

COPY --from=build /app ./

EXPOSE 3001
CMD ["node", "apps/api/dist/main.js"]
