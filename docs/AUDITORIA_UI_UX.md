# AUDITORIA_UI_UX — CTIC Agencia IDi / GLPI-Move

Fecha: 2026-11-02. Fuente: lectura directa del repo (verificación Tier 2).

## Stack real
Next.js App Router + Tailwind + `react-zoom-pan-pinch`. GLPI 10 `apirest.php` (`lib/glpi.ts:22-35`, sesión 50m). Persistencia `data/floors.json`, `config.json` (userToken AES, `lib/config.ts:42-60`), `activity.json` (máx 100).

## Control (`components/FloorMap.tsx`, `app/mapa/page.tsx`)
- Puestos binarios (`:609` antes): seleccionado verde vs resto azul. Sin estados.
- Tooltip nativo `title` (`:608`), `div onClick` sin rol/teclado, texto 11px dentro del transform (escala con zoom).
- `openPuesto`: 6× `GET /api/glpi?location_id=` (`route.ts:27-47`, `range 0-100`, trunca en silencio) + N× `users?id` + N× `user-assets`. Usuarios derivados (`occupants:343-352`).
- Zoom `min0.5/max8`, `+/- /reset` (`:942-951`), sin fit ni fullscreen, `h-[60vh]` fijo. Centrado `centerWithRetry` 20×300ms (`:181-232`), frágil.
- Riesgos: coordenadas % con letterboxing, `toPct` bajo zoom impreciso, mismo `glpi_id` en 2 pisos, `contextmenu` sin mobile, handles `w-3` intocables.

## Inicio (`app/page.tsx` + `app/api/dashboard/route.ts`)
- 6× `/{T}/?range=0-999` sin expand (`:29-38`), TTL 5m. `assigned`=users_id≠0 global; `occupied`=users en puesto dibujado; `withItems`=items>0. Card mezclaba `occupied/drawn` + sub `withItems` — ambiguo. `glpiOk` true si 1/6 responde. `truncated` si ≥1000.

## Búsqueda (`app/buscar/page.tsx`)
- Pills Equipos/Personas, filtros tipo, `parseGlpiUrl`+`inventoryVariants`. Lista 1-col `gap-3`, fichas altas, sin tabla/orden. `confirm()` nativo, gate `requireEdit→AuthModal`. Error-red mezclado con sin-resultados.

## Config (`app/config/page.tsx`)
- Tabs conn/floors/look/adv, gate admin. Tokens no van al browser (solo flags `publicConfig`). Riesgo: `CONFIG_KEY` default + `appToken` plano en disco.

## Diseño (`globals.css`, `tailwind.config.js`, `AppShell.tsx`)
- Tokens `--accent radius`, `.btn/.card/.badge/.input` centralizados. `accent-600/700` aplastados al mismo valor. Foco visible ok, sin `prefers-reduced-motion`, icon-buttons 26px, emojis sin `aria-hidden`.

## Modelo operativo
Puesto = unidad principal (bienes→ubicación, usuarios→mismo puesto). No inferir ocupante desde bien directo a persona. Muchos puestos hoy “disponibles” por usuarios aún no cargados: correcto, no es error.
