# ─────────────────────────── Material Entry Platform — Production Image ───────────────────────────
# Multi-stage: bun برای نصب و Build، node:alpine برای Runtime (standalone output)
# ساخت با PostgreSQL:  docker build --build-arg SCHEMA=postgres -t material-entry .
# ساخت با SQLite:      docker build -t material-entry .

# ── ۱) نصب وابستگی‌ها ──
FROM oven/bun:1 AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# ── ۲) Build ──
FROM oven/bun:1 AS builder
WORKDIR /app
ARG SCHEMA=sqlite # sqlite | postgres
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# انتخاب Schema بر اساس مقصد استقرار (provider در Prisma ایستاست)
RUN if [ "$SCHEMA" = "postgres" ]; then \
      cp prisma/postgres/schema.prisma prisma/schema.active.prisma; \
    else \
      cp prisma/schema.prisma prisma/schema.active.prisma; \
    fi
ENV NEXT_TELEMETRY_DISABLED=1
# Prisma generate + build تولیدی (standalone)
RUN bunx prisma generate --schema prisma/schema.active.prisma
RUN bun run build

# ── ۳) Runtime ──
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# کاربر غیر root
RUN addgroup -S smi && adduser -S smi -G smi \
  && mkdir -p /app/uploads /app/db /app/backups \
  && chown -R smi:smi /app

COPY --from=builder --chown=smi:smi /app/.next/standalone ./
COPY --from=builder --chown=smi:smi /app/prisma ./prisma
COPY --from=builder --chown=smi:smi /app/scripts ./scripts

USER smi
EXPOSE 3000

# در Startup: اعمال Migrationها سپس راه‌اندازی سرور standalone
CMD ["sh", "-c", "npx prisma migrate deploy --schema prisma/schema.active.prisma || npx prisma db push --skip-generate --schema prisma/schema.active.prisma; node server.js"]
