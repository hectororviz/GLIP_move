# 10 — DER de la base de datos propia (PostgreSQL + Prisma)

Fuente de verdad: [`prisma/schema.prisma`](../prisma/schema.prisma) (migración `0001_init`).
Motor: PostgreSQL 16 (`db` en `docker-compose.yml`). Acceso vía Prisma Client 5.22.

Alcance: **solo la DB propia** (config, planos, accesos, auditoría).
Los bienes, personas y ubicaciones viven en **GLPI 10** (fuente de verdad vía
API REST legacy) y aquí aparecen únicamente como entidades externas
referenciadas por ID numérico (`glpiId`, `userId`, `responsableUserId`).
Sin `DATABASE_URL`, la app usa el fallback JSON en `./data/` con la misma forma
(`scripts/migrate-json-to-pg.mjs` hace el import inicial).

```mermaid
erDiagram
    APP_CONFIG {
        int id PK "siempre 1 (singleton)"
        string glpiBaseUrl
        string appToken "vacío = no seteado"
        string userTokenEnc "AES-GCM con CONFIG_KEY"
        boolean keepUserOnMove
        int rootLocationId "nullable"
        string appName
        string accentColor
        string brandIcon "nullable"
    }
    FLOORS {
        string id PK
        string name
        string image "nullable: nombre de archivo en data/maps"
        int glpiLocationId "nullable: ubicación GLPI padre"
        int sort
    }
    PUESTOS {
        string floorId PK,FK
        int glpiId PK "ubicación GLPI hijo"
        float x
        float y
        float w
        float h
    }
    AREAS {
        string id PK
        string nombre "único (case-insensitive, validado en API)"
        int responsableUserId "usuario GLPI"
        string responsableNombre "nullable: snapshot"
        bigint createdAt "epoch ms"
        bigint updatedAt "epoch ms"
    }
    MAILS {
        string id PK
        string nombre
        string direccion UK "única (lower/trim)"
        string areaId FK
        bigint createdAt "epoch ms"
        bigint updatedAt "epoch ms"
    }
    SHARES {
        string id PK
        string nombre
        string ruta "normalizada para comparar"
        string rutaKey UK "ruta normalizada"
        string areaId FK
        bigint createdAt "epoch ms"
        bigint updatedAt "epoch ms"
    }
    MAIL_GRANTS {
        string accountId PK,FK
        int userId PK "usuario GLPI"
        string userDisplay "nullable: snapshot"
        string userFirstname "nullable: snapshot"
        string userRealname "nullable: snapshot"
        boolean canSend "Envía"
        boolean canRead "Recibe"
        string by "nullable: actor"
        bigint at "epoch ms"
    }
    SHARE_GRANTS {
        string shareId PK,FK
        int userId PK "usuario GLPI"
        string userDisplay "nullable: snapshot"
        string userFirstname "nullable: snapshot"
        string userRealname "nullable: snapshot"
        string by "nullable: actor"
        bigint at "epoch ms"
    }
    ACTIVITY_LOG {
        bigint id PK "autoincrement"
        bigint ts "epoch ms"
        string actor "login o 'admin'"
        string action "'movió de puesto', 'asignó usuario', ..."
        string type "tipo de bien GLPI"
        int glpiId "bien afectado"
        int locationId "nullable"
        int userId "nullable"
    }
    GLPI_USER["GLPI User (externo)"]
    GLPI_LOCATION["GLPI Location (externo)"]

    FLOORS ||--o{ PUESTOS : "dibuja (Cascade)"
    AREAS ||--o{ MAILS : "agrupa (Restrict)"
    AREAS ||--o{ SHARES : "agrupa (Restrict)"
    MAILS ||--o{ MAIL_GRANTS : "otorga (Cascade)"
    SHARES ||--o{ SHARE_GRANTS : "otorga (Cascade)"
    MAIL_GRANTS }o--|| GLPI_USER : "userId (sin FK)"
    SHARE_GRANTS }o--|| GLPI_USER : "userId (sin FK)"
    AREAS }o--|| GLPI_USER : "responsableUserId (sin FK)"
    PUESTOS }o--|| GLPI_LOCATION : "glpiId (sin FK)"
    ACTIVITY_LOG }o--|| GLPI_USER : "actor/userId (solo log)"
```

## Detalle por entidad

| Tabla (`@@map`) | PK | FK y borrado | Notas |
|---|---|---|---|
| `app_config` (`AppConfig`) | `id` (siempre 1) | — | Singleton. Secretos cifrados; tokens nunca salen al navegador (solo flags `*Set`). |
| `floors` (`Floor`) | `id` (string) | — | `image`: archivo en `./data/maps/`; `glpiLocationId`: padre GLPI para calibrar. |
| `puestos` (`Puesto`) | `(floorId, glpiId)` compuesta | `floorId → floors.id` **Cascade** | Rectángulos en % (`x,y,w,h` 0–100). `glpiId` = hijo GLPI dibujado. |
| `areas` (`Area`) | `id` (string) | — | `responsableUserId` + snapshot `responsableNombre` (GLPI puede cambiar el nombre). |
| `mails` (`Mail`) | `id` | `areaId → areas.id` **Restrict** | `direccion` UNIQUE. Borrado con grants → `409` salvo `?force=1`. |
| `shares` (`Share`) | `id` | `areaId → areas.id` **Restrict** | `rutaKey` UNIQUE (ruta normalizada `/`→`\`, sin trailing). Igual regla 409/force. |
| `mail_grants` (`MailGrant`) | `(accountId, userId)` compuesta | `accountId → mails.id` **Cascade** | Al menos un check (`canSend`/`canRead`); upsert idempotente. Sin FK a GLPI. |
| `share_grants` (`ShareGrant`) | `(shareId, userId)` compuesta | `shareId → shares.id` **Cascade** | Acceso sí/no (existencia del grant). Sin FK a GLPI. |
| `activity_log` (`Activity`) | `id` autoincrement | — | Auditoría liviana, recortada a las últimas 100 (igual que `activity.json`). Solo lectura en UI. |

## Reglas de integridad (coherentes con la API)

- **Restrict en áreas**: no se puede borrar un área con correos/carpetas (`409` con conteo; la UI lo explica antes de confirmar).
- **Cascade en puestos/grants**: borrar un piso elimina sus rectángulos; borrar un correo/carpeta (con `force`) elimina sus grants.
- **Sin FK hacia GLPI** (base externa, sin constraints posibles): `userId`, `responsableUserId` y `glpiId` se validan por API (`GET /User/{id}`) al momento de escribir, y los nombres se guardan como snapshot (`userDisplay`, `responsableNombre`).
- **Timestamps**: `BigInt` con epoch en ms (compatibles con el formato previo de `access.json`).
