# 05 — Arquitectura y decisiones técnicas

## Stack

Next.js 14 (App Router, TypeScript) + Tailwind + PWA (manifest dinámico) +
estado local React + `@zxing/browser@0.1.5` (cámara) +
`react-zoom-pan-pinch` (zoom del plano) + `adm-zip` (respaldo). Runtime
`node:20-slim`, salida `standalone`.

```
[PWA navegador] ── /api/* ──> [Next API routes] ── apirest.php ──> [GLPI 10]
                     │                    │ Session-Token (servicio o usuario)
   JPG + hotspots %  │                    │ re-login ante 401 (servicio)
   Scanner ZXing     │                    └─ App-Token + user_token (server)
   Árbol lugares     └─ ./data (config.json, floors.json, maps/, brand/)
```

## Auth y roles (`lib/auth.ts`, `app/api/auth/`)

- Sesiones GLPI por usuario en memoria server-side (cookie `gm_user` httpOnly,
  TTL 8 h, `killSession` al salir). Claves nunca en cliente/disco/logs.
- `POST /api/auth/login` (Basic → `initSession`), `POST /api/auth/logout`,
  `GET /api/auth/me`. `GET /api/admin/check` dice si hay admin (local o GLPI).
- `isOperator(req)`: admin local **o** sesión GLPI con perfil en
  `GLPI_OPERATOR_PROFILES` (default `Super-Admin,Admin`). Protege
  `PATCH /api/glpi` (401 sin login, 403 sin permiso).
- `isAdmin(req)`: clave local **o** sesión GLPI con perfil en
  `GLPI_ADMIN_PROFILES`. Centralizado: lo usan maps, upload, backup, brand,
  config y admin/check (antes cada ruta duplicaba su `adminOk`).
- `glpiFetch` acepta token de sesión opcional: el PATCH con usuario usa **su**
  token para que GLPI imponga los derechos finales.
- UI: modal único `AuthModal` (usuario+clave + check “login local”); la acción
  de edición pendiente se ejecuta tras el login.

## Proxy GLPI (`lib/glpi.ts`, `app/api/glpi/`)

El navegador **nunca** habla con GLPI ni ve los tokens. Rutas internas:

| Ruta interna | Mapeo GLPI 10 legacy |
|---|---|
| `GET /api/glpi?q=&type=` | `GET /{Type}/?searchText[otherserial\|name\|serial]=…&expand_dropdowns=true` (fan-out 6 tipos; variantes de inventario) |
| `GET /api/glpi?location_id=` | `GET /{Type}/?searchText[locations_id]=…` × 6 tipos |
| `GET /api/glpi?type=&id=` | `GET /{Type}/{id}?expand_dropdowns=true` + `_locationId`/`_userId` del `links` hateoas |
| `GET /api/glpi/users?q=\|?id=` | `GET /User/?searchText[name\|firstname\|realname]=…` (solo campos seguros) o `/User/{id}` |
| `GET /api/glpi/user-assets?user_id=` | `GET /{Type}/?searchText[users_id]=…` × 6 tipos, agrupado por ubicación |
| `PATCH /api/glpi` (protegido) | `PUT /{Type}/{id} {"input":{"locations_id":X\|0[, "users_id":Y]}}` (+`session_write=true`); `users_id` no se toca salvo pedido explícito |
| `GET /api/glpi/locations[?parent=]` | `GET /Location/?range=…` paginado, cache 5 min; `locations_id` numérico = padre |
| `GET /api/config/test` (admin) | `initSession` + `getMyProfiles` |
| `GET/POST /api/backup` (admin) | ZIP `floors.json` + `maps/` (sin secretos); import valida y reemplaza |
| `GET/POST/DELETE /api/brand/icon` (admin) | logo en `data/brand/`, máx 2 MB |
| `GET /manifest.webmanifest` | manifest dinámico (nombre, acento, icono) |

`clean()` normaliza display: decodifica entidades HTML (`&#62;`→`>`) y trata
`&nbsp;`/`"0"`/vacío como nulo. `enrich()` agrega `_type`, `_locationId`,
`_locationName`, `_userId`, `_userName`, `_manufacturer`, `_model`.

## Inventarios (`lib/inventory.ts`)

- 10 dígitos: `0000012865` ⇄ `12865` (con/sin ceros).
- Letra-serie: `A 0001-0537` → variantes con guion y grupo normalizado
  (`A-001-0045`, la formo en que GLPI lo guarda), sin prefijo y solo dígitos;
  la variante sin ceros exige ≥4 dígitos (evita falsos positivos).
- `parseGlpiUrl()`: QR con `…/front/<tipo>.form.php?id=` → `{type, id}`
  directo (ignora el host; tipos desconocidos caen al flujo normal).
- Al asignar se prefiere coincidencia exacta de `otherserial`.

## Modelo de datos (`lib/maps.ts`, `./data/floors.json`)

```json [{ "id":"4-piso", "name":"4º Piso", "image":"4-piso-abc.png",
  "glpiLocationId": 4,
  "puestos": [{ "glpi_id":277, "x":30, "y":40, "w":8, "h":10 }] }]
```

- Piso ↔ **una ubicación GLPI padre**; hotspot ↔ **hijo directo** (`%` sobre la imagen).
- Migración automática del formato anterior (`rootLocationId`, puestos con nombre propio).
- Imágenes en `./data/maps/`, servidas por `GET /api/maps/[id]/image`.
- `config.json`: conexión + `keepUserOnMove` + `appName`/`accentColor`/`brandIcon`
  (logo en `data/brand/`).

## Decisiones (por qué así)

1. **API legacy, no OAuth**: GLPI 10 no tiene OAuth (llega en GLPI 11). Se usa
   `initSession` + `Session-Token` + `App-Token`.
2. **JPG + hotspots % (Opción A)**: en vez de vectorizar el plano, la imagen es
   fondo y los puestos son botones posicionados en `%` (Zoom compatible; la
   escala se cancela al calcular relativo). `min-w-0` en la columna +
   `overflow-x-clip` evitan scroll horizontal con panorámicos.
3. **Calibración en servidor** (`floors.json`), no `localStorage`: todos los
   dispositivos ven lo mismo.
4. **Build offline**: la imagen no corre `npm install` (sin registry en este
   entorno); se compila en el host (`build-docker.sh`) y se copia el `standalone`.
5. **`network_mode: host`**: el bridge Docker no llegaba a la LAN GLPI.
6. **`node:20-slim`**: npm 10 de Alpine falla (`Exit handler never called`).
7. **`@zxing/browser@0.1.5`**: el 0.2.x exige Node ≥ 24.
8. **`export const dynamic = "force-dynamic"` en rutas API**: el build las
   marcaba estáticas (`○`) y el standalone respondía **405 a PUT**.
9. **Puestos sin ubicación (`locations_id=0`)**: al quitar, GLPI los deja
   `Sin ubicación`; no existe papelera intermedia propia.
10. **Etiqueta del hotspot = nombre GLPI recortado** (`Puesto 23`→`23`,
    centrado; completo en tooltip): decisión de producto; el vínculo es el `glpi_id`.
11. **Ocupante derivado de `users_id`** (sin tabla local de personas): GLPI es
    fuente de verdad; asignar persona = setear `users_id` en los equipos del
    puesto (con confirmación y conteo de afectados).
12. **Auth por roles con failover local**: GLPI impone derechos finales; la
    clave `.env` garantiza acceso aunque GLPI caiga.
13. **Un solo scroll de página** (mapa sticky): evita scrollbars interiores que
    tapaban botones en puestos con muchos equipos.
14. **Centrado con reintentos + fallback `setTransform`**: `zoomToElement` no
    siempre aplica (renders/cambio de piso); se verifica y se recalcula.
