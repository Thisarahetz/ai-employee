# apps/web/Dockerfile — standard multi-stage Next.js build inside the pnpm monorepo.
# Build context is the repo root (see docker-compose.yml: context: ., dockerfile: apps/web/Dockerfile)
# so the whole workspace (pnpm-workspace.yaml, packages/*, apps/*) is available to install/build.

# ── Base ─────────────────────────────────────────────────────────────────
FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /app

# ── Build ────────────────────────────────────────────────────────────────
FROM base AS builder
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @ai-employee/web build

# ── Runtime ──────────────────────────────────────────────────────────────
FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3000
COPY --from=builder /app /app
WORKDIR /app/apps/web

EXPOSE 3000
CMD ["pnpm", "exec", "next", "start", "-p", "3000"]
