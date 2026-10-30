# Imagen runtime offline: NO hace npm install (el entorno puede no dar
# registry a contenedores). Se construye con el standalone ya compilado:
#   npm install && npm run build && docker compose build
FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN groupadd -r app && useradd -r -g app app
COPY .next/standalone ./
COPY .next/static ./.next/static
COPY public ./public
RUN mkdir -p /app/data/maps && chown -R app:app /app/data
RUN mkdir -p .next/cache && chmod -R a+rwX .next
USER app
EXPOSE 3000
ENV PORT=3000 HOSTNAME="0.0.0.0"
CMD ["node", "server.js"]
