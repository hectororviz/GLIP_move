# 07 — Rediseño UI/UX y correcciones (CTIC · Agencia IDi)

Documento vivo de las dos iteraciones visuales/funcionales aplicadas sobre el
producto existente, sin reescribirlo. Complementa `AUDITORIA_UI_UX.md`,
`PROPUESTA_DISENO.md` y `PLAN_IMPLEMENTACION.md`.

## Iteración 1 — Rediseño integral

### Sistema de diseño (`app/globals.css`, `components/ui.tsx`, `lib/puesto-state.ts`)
- Tokens de estado de puesto: verde `#15803d`, azul `#2563eb`, ámbar `#b45309`,
  rojo `#dc2626` (fondo translúcido ~22-28 % + borde opaco + número en pill).
- Selección = halo/outline sin cambiar el color de estado.
- Utilidades: `.table-dense`, `.skeleton`, `.spinner`, `.tip-bubble`,
  `.segbar`, `.clamp-2`, `.break-anywhere`, `.icon-btn(-sm)`.
- `prefers-reduced-motion`, focos visibles, targets táctiles ≥ 28-32 px.
- `ui.tsx`: `Spinner`, `EmptyState`, `SegmentedBar`, `TypeIcon`.
- `puesto-state.ts`: `clasificarPuesto(items, users)` →
  `en-uso | disponible | incompleto | inconsistente` (dato real GLPI, sin inferir
  ocupantes desde bienes asignados a personas).

### Control (`components/FloorMap.tsx`, `app/api/dashboard/route.ts`)
- `GET /api/dashboard` extendido (misma llamada, sin N×6): mapa
  `estados[locId] = { items, users, estado }` + conteos `enUso/disponible/
  incompleto/inconsistente` por piso y global. TTL 5 min, truncado 1000/tipo
  señalizado con “+”.
- Leyenda con conteos del piso; puestos `role=button`, teclado Enter/Espacio,
  tooltip propio (estado + bienes + usuarios + interno), capas
  (puestos/números/estados) + filtro por estado (solo visibilidad).
- Buscador en plano (solo dibujados): puesto/usuario/inventario → cambia de
  piso + `zoomToElement` + flash + abre; lista si hay varias coincidencias.
- Controles `+/−/reset/fit/fullscreen` preservando selección y transform.
- Panel lateral: header fijo (puesto/piso/GLPI/estado/bienes), scroll vertical
  propio, bienes compactos `grid [minmax(0,1fr)_auto]` con `clamp-2` + `title`
  completo y acciones a la derecha; “Desvincular (no elimina en GLPI)”.
- Sin tocar coordenadas, JPG, endpoints de escritura ni cálculos base.

### Inicio (`app/page.tsx`)
- KPIs aclarados (asignados directos ≠ ocupados; `locations_id = 0` ≠ no
  dibujados), sección “Puestos por estado” con `SegmentedBar`, barras por piso
  segmentadas, salud con última sync + caché, accesos existentes.

### Búsqueda (`app/buscar/page.tsx`, `components/AssetEditModal.tsx`, `lib/location-display.ts`)
- Solo vista tabla (se eliminó la vista tarjetas y el componente `Ficha` de
  equipos; `FichaPersona` intacta). Orden por columna, edición vía modal
  reutilizable (ubicación + usuario, confirms y permisos intactos).
- `formatLocationDisplay(id, byId, fallback)`: usa `parentId` estructurado;
  puesto → `3.º piso · Puesto 53` + edificio secundario, `title` con ruta
  completa, sin modificar datos GLPI.
- Filtros compactos y dependientes: `Equipos|Personas`; tipos solo con
  Equipos; con Personas solo queda el buscador.

### Config/Calibración (`app/config/page.tsx`)
- Solo estilos: tabs con `role=tab`, aviso de tokens solo-servidor. Lógica,
  coordenadas y JPG intactos.

### Correcciones post-rediseño
- `.tip { position: relative }` pisaba el `absolute` de Tailwind en los puestos
  (CSS propio va después de utilities) → puestos en flujo normal, mapa “vacío”.
  Fix: sin `position` en `.tip`.
- `estadoOf`/`countsFloor` referenciaban `occupants` (declarado después) →
  `ReferenceError` en render. Fix: fallback sin `occupants`.
- `.icon-btn-sm` fijaba 28 px sin resetear el padding de `.btn` → SVG
  colapsados en el panel. Fix: `padding: 0` + `.btn svg { display:block }` y
  unificación a `icon-btn-sm`.

## Iteración 2 — Sesión global y gating de Config

- `components/AuthButton.tsx` (nuevo): estado vía `GET /api/auth/me`, login con
  `AuthModal`, logout `POST /api/auth/logout`, evento `auth-changed`.
- `AppShell`: botón arriba a la derecha (desktop + junto al hamburguesa en
  móvil, nombre + rol + Salir). Pestaña **Config deshabilitada** (`aria-disabled`,
  tooltip, 🔒 en móvil) salvo `GET /api/admin/check → { admin: true }`
  (admin local o perfil `Super-Admin`/`Admin`); revalida en `auth-changed` y
  `focus`. Se eliminaron las tarjetas locales de sesión de Control y Búsqueda
  (una sola fuente de verdad); `/config` ya exigía `adminAuthed`.

## Verificación
- `npm run build` OK (15 rutas), `docker compose build && up -d` OK,
  `/mapa`, `/buscar`, `/` → 200; `/api/dashboard.estados` con 230 puestos
  (8 en uso, 211 disponibles, 11 incompletos, 0 inconsistentes).
- Matriz: auth GLPI, bienes/usuarios por puesto, planos fijos, zoom/pan/fit/
  fullscreen, selección + halo, leyenda reactiva, buscador, filtros, edición/
  desvinculación, tabla + modal (guardar/cerrar/Escape/error sin cerrar),
  scan cámara, calibración sin pérdida de coordenadas, sin scroll-X.
- Sin escrituras a GLPI productivo en pruebas.
