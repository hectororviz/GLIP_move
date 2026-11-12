# Multi-stage: se compila con internet (CI: GitHub Actions) y el runner
# queda mínimo. El VPS solo hace pull, no compila nada.
# Prisma necesita openssl en ambas etapas (engines debian-openssl-3.0.x).

FROM node:20-slim AS builder
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma/
RUN npm ci --no-audit --no-fund && npx prisma generate
COPY . ./
RUN npm run build

FROM node:20-slim AS runner
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd -r app && useradd -r -g app app
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME="0.0.0.0"
# Standalone Next.js ya compilado
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
# Prisma: cliente generado + CLI (para `migrate deploy`) + migraciones SQL
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/prisma ./prisma
RUN mkdir -p /app/data/maps && chown -R app:app /app/data
RUN mkdir -p .next/cache && chmod -R a+rwX .next
USER app
EXPOSE 3000
# Si hay DATABASE_URL: aplicar migraciones y luego arrancar. Sin ella: fallback JSON.
CMD ["sh", "-c", "if [ -n \"$DATABASE_URL\" ]; then node node_modules/prisma/build/index.js migrate deploy; fi && exec node server.js"]
