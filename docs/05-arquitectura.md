# 05 — Arquitectura y decisiones técnicas

## Stack

Next.js 14 (App Router, TypeScript) + Tailwind + PWA (`manifest.json`) +
`zustand`-free (estado local React) + `@zxing/browser@0.1.5` (cámara) +
`react-zoom-pan-pinch` (zoom del plano). Runtime `node:20-slim`, salida
`standalone`.

```
[PWA navegador] ── /api/* ──> [Next API routes] ── apirest.php ──> [GLPI 10]
                     │                    │ Session-Token cacheado (50 min)
   JPG + hotspots %  │                    │ re-login ante 401
   Scanner ZXing     │                    └─ App-Token + user_token (server)
   Árbol lugares     └─ ./data (config.json, floors.json, maps/)
```

## Proxy GLPI (`lib/glpi.ts`, `app/api/glpi/`)

El navegador **nunca** habla con GLPI ni ve los tokens. Rutas internas:

| Ruta interna | Mapeo GLPI 10 legacy |
|---|---|
| `GET /api/glpi?q=&type=` | `GET /{Type}/?searchText[otherserial\|name\|serial]=…&expand_dropdowns=true` (fan-out 6 tipos en paralelo; variantes con/sin ceros) |
| `GET /api/glpi?location_id=` | `GET /{Type}/?searchText[locations_id]=…` × 6 tipos |
| `GET /api/glpi?type=&id=` | `GET /{Type}/{id}?expand_dropdowns=true` + `_locationId` extraído del `links` hateoas |
| `PATCH /api/glpi` | `PUT /{Type}/{id} {"input":{"locations_id":X\|0}}` (+`session_write=true`); `users_id` no se toca salvo pedido explícito |
| `GET /api/glpi/locations[?parent=]` | `GET /Location/?range=…` paginado, cache 5 min; `locations_id` numérico = padre |
| `GET /api/config/test` | `initSession` + `getMyProfiles` |

`clean()` normaliza display: decodifica entidades HTML (`&#62;`→`>`) y trata
`&nbsp;`/`"0"`/vacío como nulo. `enrich()` agrega `_type`, `_locationId`,
`_locationName`, `_userName`, `_manufacturer`, `_model` (busca en las claves
`computermodels_id`, `monitorsmodels_id`, `phonemodels_id`, etc.).

## Modelo de datos (`lib/maps.ts`, `./data/floors.json`)

```json [{ "id":"4-piso", "name":"4º Piso", "image":"4-piso-abc.png",
  "glpiLocationId": 4,
  "puestos": [{ "glpi_id":277, "x":30, "y":40, "w":8, "h":10 }] }]
```

- Piso ↔ **una ubicación GLPI padre**; hotspot ↔ **hijo directo** (`%` sobre la imagen).
- Migración automática del formato anterior (`rootLocationId`, puestos con nombre propio).
- Imágenes en `./data/maps/`, servidas por `GET /api/maps/[id]/image`.

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
8. **`export const dynamic = "force-dynamic"` en `/api/config`**: el build la
   marcaba estática (`○`) y el standalone respondía **405 a PUT**.
9. **Puestos sin ubicación (`locations_id=0`)**: al quitar, GLPI los deja
   `Sin ubicación`; no existe papelera intermedia propia.
10. **Etiqueta del hotspot = nombre GLPI** (sin alias): decisión de producto;
    el vínculo es el `glpi_id`.
