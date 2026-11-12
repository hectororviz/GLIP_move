# 09 — Postgres (DB propia) + Prisma + GHCR

La DB propia (accesos, pisos, config, actividad) vive en **Postgres 16**
vía **Prisma 5**. GLPI sigue siendo fuente de verdad para bienes/personas.

## Cuándo se usa cada backend

- **Con `DATABASE_URL`**: todo va a Postgres (transacciones atómicas,
  `UNIQUE` en `mails.direccion` / `shares.rutaKey`, FK `areaId RESTRICT`).
- **Sin `DATABASE_URL`**: fallback JSON en `./data/` (comportamiento original).
- Las escrituras PG van en transacción todo-o-nada + mutex en proceso
  (ver `lib/db.ts`). Sin más JSON truncados ni lost updates single-instance.

## Archivos

- `prisma/schema.prisma` — 9 modelos (`app_config`, `floors`, `puestos`,
  `areas`, `mails`, `shares`, `mail_grants`, `share_grants`, `activity_log`).
- `prisma/migrations/0001_init/` — migración inicial (aplica `migrate deploy`).
- `lib/db.ts` — singleton Prisma + `usePostgres()` + `withWriteLock()`.
- `scripts/migrate-json-to-pg.mjs` — import idempotente desde `./data/*.json`.

## Migración inicial (una vez, contra DB nueva)

```sh
docker compose up -d db             # o tu Postgres
npx prisma migrate deploy           # crea tablas
node scripts/migrate-json-to-pg.mjs --dry-run   # verifica (4 pisos, 230 puestos, ...)
node scripts/migrate-json-to-pg.mjs --apply     # migra + reporte en data/
```

Los JSON quedan intactos como respaldo. Re-ejecutar `--apply` reemplaza el
contenido PG (transacción única); `activity` solo se importa si el log está vacío.

## Imágenes Docker (GitHub Actions → GHCR)

- `.github/workflows/docker-publish.yml`: `push a main/tags` → build
  `linux/amd64` → `ghcr.io/hectororviz/glip_move:latest + :sha`.
- El VPS solo hace `docker compose pull && up -d` (ya no compila).
- El contenedor `app` corre `prisma migrate deploy` al arrancar si hay
  `DATABASE_URL`; sin ella arranca igual con JSON.
- `maps/` e imágenes (`brand/`) siguen en volumen archivo `./data`, no en PG.

## Cambio de schema a futuro

1. Editar `prisma/schema.prisma`.
2. `npx prisma migrate dev --name <cambio>` (genera SQL en `prisma/migrations/`).
3. Commit + push: Actions publica la imagen; al arrancar se aplica sola.
