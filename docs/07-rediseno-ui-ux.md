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

## Iteración 3 — Rediseño responsive mobile-first (Búsqueda + panel de equipo)

Objetivo: interfaz mobile-first sin cambiar contratos de API, endpoints, IDs,
reglas de negocio ni lógica GLPI. Sin dependencias nuevas.

### Sistema de componentes (`app/globals.css`, `components/ui.tsx`)
- Tokens: `--tap: 44px`, `--safe-b/--safe-t` (safe-area), `--panel-w:
  min(680px, 100vw)`; `overflow-x: clip` global (el scroll horizontal solo
  dentro de `.table-scroll`); inputs a 16 px en móvil (sin zoom iOS en iPhone);
  `prefers-reduced-motion` ya existente.
- `ui.tsx` suma: **`SidePanel`** (drawer derecho 600–720 px en desktop con
  animación de entrada + backdrop; pantalla completa en móvil con header
  sticky, body con scroll propio y footer con safe-area; cierra con ✕,
  backdrop o Escape y restaura el foco), **`Tabs`** (nombres siempre visibles,
  `role=tablist`, flechas/Home/End), **`SearchCombobox`** (input con filtrado
  inmediato local, lista con max-height + scroll interno, `role=listbox/
  option`, `aria-activedescendant`, Enter/Escape/flechas, opción seleccionada
  marcada + botón Limpiar, estados loading/error/vacío), **`ConfirmDialog`**
  (foco inicial, Escape, variante danger) y **`BusyButton`** (spinner +
  `aria-busy`).
- Botones unificados: primario azul institucional, secundario neutro/outline,
  `btn-danger-outline` para desvinculaciones, `btn-danger` para quitar usuario,
  disabled + loading distinguibles; sin éxito optimista (se espera la
  respuesta real del servidor).

### Navegación (`components/AppShell.tsx`)
- Header compacto con skip-link "Saltar al contenido"; logo + nombre corto.
- Móvil: botón hamburguesa + **drawer derecho** (`role=dialog`) con todas las
  secciones permitidas, info institucional, cierre por ✕/backdrop/Escape/
  selección de sección; respeta los permisos actuales (candados intactos).
- Desktop: misma navegación horizontal, con `aria-current` y hover/foco.

### Búsqueda (`app/buscar/page.tsx`)
- Header sin espacios desperdiciados; `<form role=search>` (Enter funciona);
  grid apilado en móvil (campo full-width + fila Buscar/Escanear táctil),
  horizontal compacto en desktop; resumen discreto + badge de total.
- Acordeones con `aria-expanded/controls` + región, altura táctil 52–56 px,
  badge de conteo; la primera categoría con resultados se auto-expande.
- Equipos: **tabla densa en desktop, `AssetCard` en móvil** (icono + nombre +
  inventario, ubicación, badge de usuario, serie, "Detalle ›"; toda la tarjeta
  es un botón accesible, sin acciones anidadas). Personas/Áreas/Correos/
  Carpetas con el mismo criterio (tabla desktop + tarjeta móvil); se eliminó
  la fila-clicable con `›` críptico en favor de botones "Ver detalle".
- **Todos los detalles pasan del modal centrado al `SidePanel`** (equipo,
  persona, correo, carpeta, área). Al abrir se guarda `window.scrollY` y al
  volver se restaura; búsqueda y categoría expandida se conservan (ya no se
  colapsa todo en cada búsqueda).
- Sin llamadas API adicionales; debounce solo agregado en el buscador de
  usuarios del panel (450 ms).

### Detalle del equipo (`components/AssetEditModal.tsx`)
- Ya no renderiza su propio modal: es el contenido del `SidePanel` (misma
  firma de props + `onDirtyChange`; el cierre con cambios sin aplicar pide
  confirmación tanto en el contenido como en el panel).
- Bloque de resumen: Ubicación actual (edificio/piso/puesto, "Sin ubicación"
  o "Sin puesto" explícitos) + Usuario asignado ("Sin asignar" ≠ error).
- Pestañas **Ubicación** (piso select + `SearchCombobox` de puestos que
  reemplaza al `<select size=8>` extenso; preserva `location_id`; "Mover aquí"
  deshabilitado sin selección válida; "Desvincular del puesto" diferenciado)
  y **Usuario** (buscador GLPI, Asignar, "Quitar usuario (conserva puesto)").
  Operaciones Mover/Desvincular/Asignar/Quitar no se mezclan ni tocan campos
  ajenos; validaciones originales intactas.

## Verificación
- `npm run build` OK (15 rutas), `docker compose build && up -d` OK,
  `/mapa`, `/buscar`, `/` → 200; `/api/dashboard.estados` con 230 puestos
  (8 en uso, 211 disponibles, 11 incompletos, 0 inconsistentes).
- Matriz: auth GLPI, bienes/usuarios por puesto, planos fijos, zoom/pan/fit/
  fullscreen, selección + halo, leyenda reactiva, buscador, filtros, edición/
  desvinculación, tabla + modal (guardar/cerrar/Escape/error sin cerrar),
  scan cámara, calibración sin pérdida de coordenadas, sin scroll-X.
- Iteración 3: `npm run build` OK (17 rutas, `/buscar` 11.7 kB). Despliegue
  local OK con imagen reconstruida (`/`, `/buscar`, `/mapa`, `/api/config` →
  200; contenedor `glpi-move-app-1` recreado). Nota: sin red a Debian en este
  entorno, el `docker build` oficial falla en `apt-get`; se desplegó con un
  Dockerfile temporal (`/tmp/Dockerfile.local`, fuera del repo) que reutiliza
  la imagen anterior como base y solo reemplaza los artefactos del
  `npm run build` del host. Pendiente con GLPI en línea: buscar inventario,
  expandir categoría, abrir equipo en panel, mover/desvincular puesto,
  asignar/quitar usuario, drawer móvil y formularios con teclado virtual (no
  simular éxitos: las pruebas de escritura van contra GLPI real).
- Sin escrituras a GLPI productivo en pruebas.
