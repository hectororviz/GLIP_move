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

## Iteración 4 — Panel consulta-primero (adiós tabs Ubicación/Usuario)

La edición pasa a segundo plano sin perder funcionalidad. Sin cambios de
endpoints, contratos, auth, roles ni lógica GLPI; sin dependencias nuevas.

### Panel de equipo (`components/AssetEditModal.tsx`)
- Fuera pestañas: orden **Información general** (`dl.info-card`: tipo,
  nombre, inventario, serie + modelo/fabricante/`states_id` solo si GLPI los
  devuelve) → **Ubicación actual** destacada (`.info-card-highlight`) →
  **Usuario asignado** (nombre + `user_id`, o "Sin asignar").
- Se eliminó la duplicación de inventario/serie (subtítulo del panel +
  resumen + ficha); ahora cada dato aparece una sola vez.
- **Administrar equipo**: `AdminSection` (acordeón cerrado por defecto, solo
  `canOperate`). Menú de 4 filas (`.admin-action`, sin protagonismo visual):
  Cambiar ubicación / Modificar usuario / Desvincular del puesto / Quitar
  usuario, cada una con su consecuencia ("Conserva el usuario"/"Conserva el
  puesto"). Mover y Asignar abren su formulario inline con "← Volver a
  opciones"; desvinculaciones van directo a `ConfirmDialog`. Mismo combobox,
  debounce (450 ms), validaciones y guards de cambios sin guardar.
- Sin permiso: sin formularios deshabilitados ni pestañas vacías; la sección
  se oculta y queda un único aviso ("La edición requiere perfil operador").
- "Ver ficha →" abre la persona vía `GET /api/glpi/users?id=` con retorno.

### Panel de persona (`app/buscar/page.tsx`)
- Equipos como `AssetRow` (icono, tipo, nombre, inventario truncado + "Ver
  equipo" de 44 px): sin tablas horizontales ni texto corrido; abre el equipo
  con "← Volver a la persona" al cerrar (navegación de un nivel con
  `returnTarget`, conserva scroll y búsqueda; guards de dirty en ambos
  sentidos).
- **Administrar asignaciones**: acordeón cerrado, solo operadores (asignar por
  inventario/serie/URL + scan, y "Quitar del puesto" por ubicación). Sin
  permiso: oculto + aviso único. Se eliminó `requireEdit` (innecesario: la
  sección ya está gateada; el backend sigue siendo la autoridad).

### Sistema (`components/ui.tsx`, `app/globals.css`)
- Nuevo `AdminSection` (botón + región, `aria-expanded/controls`, 52 px).
- `.info-card` + `.info-row` (dl con etiqueta/valor, apilado <360 px),
  `.section-h`, `.admin-action(-danger)`; foco del ✕ del panel con anillo
  visible solo por teclado, sin bordes azules permanentes; gaps y botones
  secundarios en admin (menos protagonismo).
- Botones táctiles 44 px en filas de equipo y escáner del admin.

## Iteración 5 — Pulido final de Búsqueda (sin rediseño)

Ajustes sobre lo aprobado. Sin cambios de endpoints, backend, auth, roles,
lógica de búsqueda, escaneo, movimientos ni navegación principal.

- **Encabezado del equipo**: título = nombre destacado; tipo como `badge`
  discreto en el subtítulo del panel (antes `Tipo · Nombre`).
- **Entidades HTML**: nuevo `decodeEntities()` en `ui.tsx` (DOMParser solo
  lectura, sin `innerHTML`, con guarda SSR) aplicado a nombre, modelo,
  fabricante, estado y usuario en la ficha (`Funcional &#62; Usado` →
  `Funcional > Usado`) y a las ubicaciones compactas (tablas y tarjetas).
- **Copiar al portapapeles**: `CopyButton` (nombre, inventario, serie) con
  icono discreto de 32/36 px, `title` + `aria-label`, confirmación visual ✓
  1,6 s con `role=status`, fallback `textarea+execCommand` sin Clipboard API
  y manejo de errores. Sin alterar valores.
- **Persona**: grupos con icono de puesto + conteo (`· N eq.`); nombre del
  equipo también abre la ficha (`button.rowlink`, hermano del botón Ver
  equipo — sin anidado, con teclado); listas compactas sin tablas.
- **Permisos**: eliminados los avisos permanentes; sin controles de edición
  no hay nada que explicar. Backend y gates (`canOperate`) intactos.
- **Foco**: el anillo azul permanente venía del foco programático al ✕ al
  abrir diálogos. Ahora el foco inicial va al contenedor (`tabIndex=-1`, sin
  anillo) en `SidePanel` y drawer; `ConfirmDialog` conserva foco en la acción
  primaria. Se eliminó el glow extra y se agregó `:focus:not(:focus-visible)
  { outline: none }`. Anillo visible de 2 px solo con teclado.
- **Pie del panel**: body `py-3`, footer `pt-2`; botón Volver consistente.

## Iteración 6 — Rediseño de Accesos (información primero)

Misma filosofía que Búsqueda, sin tocar Control/Masivo/Config/Inicio.
Sin cambios de endpoints, contratos, auth, roles, reglas de negocio,
validaciones, exports ni lógica de grants (upsert auto, 409→force).

### Listados (`app/accesos/page.tsx`)
- Tabs accesibles con contadores (Áreas/Correos/Carpetas) y scroll horizontal
  propio en móvil (`.tabs-scroll`); filtro de texto client-side + filtro por
  área; tablas densas desktop y tarjetas móvil (mismo patrón que Búsqueda).
- Encabezados con etiquetas (`Correos`, `Carpetas`, `Permisos` como texto
  "N envían · M reciben" con tooltip/`aria-label`); "Sin responsable" en vez
  de `— #0`; nombre como botón `rowlink` + **Ver detalle** explícito.
- Sin botones rojos en listados; Descargar todo + Nuevo por pestaña.

### Fichas (`SidePanel` + pila de navegación)
- Área (responsable, correos/carpetas navegables), correo (dirección con
  copiar, área enlazada, personas con `PermBadges` textuales Envía/Recibe,
  clic a ficha de persona), carpeta (ruta con copiar, personas, badge
  Acceso), persona (correos/carpetas por filas navegables).
- `AdminSection` colapsada y solo-operador: agregar (submodal z-60),
  toggles `check-lg` con guardado inmediato (semántica intacta), quitar con
  confirmación, editar, exportar, eliminar protegida con `ConfirmDialog`
  (alcance real: área solo vacía; `force=1` con mensaje del servidor).
- ABM en `Modal` z-70 con `guard` anti-pérdida, `BusyButton`, errores inline,
  área con `SearchCombobox`; `alert()` reemplazados por mensajes inline.
- Sin avisos de permiso: admin oculto para viewers; backend sigue mandando.

## Iteración 7 — Badges de permiso Envía/Recibe inconfundibles

Cambio exclusivamente visual. Sin tocar lógica de permisos, endpoints, DB,
operaciones GLPI ni semántica de los checks de Administrar.

- `PermBadges` único en `components/ui.tsx` (antes duplicado en Accesos;
  Búsqueda usaba texto/iconos sueltos): habilitado = verde suave + verde
  oscuro + check + "Envía"/"Recibe"; deshabilitado = gris neutro + gris
  oscuro + X + "No envía"/"No recibe". El estado nunca depende solo del
  color (texto e icono también cambian). Son `span`, no parecen botones.
- Aplicado en: ficha de correo, ficha de persona y filas de ambos paneles de
  Accesos; ficha de persona y modal de correo de Búsqueda (la tabla
  `Persona|✉️|👁️` pasó a una columna `Permisos` con badges). Carpetas
  conservan su badge "Acceso" (no tienen niveles).
- `.perm-on`/`.perm-off` en `globals.css` (contraste AA, `nowrap`, iconos
  11 px); las filas conservan `truncate` + `flex-wrap` para no superponerse
  con nombres largos en móvil. Toggles reales solo en Administrar accesos.
- Iconos nuevos `IconCheck`/`IconX` en `components/icons.tsx` (mismo estilo
  stroke del sistema).

## Iteración 8 — Inicio, Control, Masivo y Configuración

Mismo lenguaje que Búsqueda/Accesos (info primero, admin secundaria
colapsada, paneles laterales, confirmaciones explícitas). Sin cambios de
endpoints, contratos, auth, roles, reglas de negocio, coordenadas, calibración
ni lógica de movimientos/asignaciones.

### Inicio (`app/page.tsx`)
- KPIs con altura mínima uniforme y números tabulares; secundaria con
  `break-words`.
- Equipos por tipo: filas con `truncate`, cantidades tabulares sin compresión y
  aclaración de que las barras son relativas al máximo (no porcentajes), con
  `role=img` descriptivo.
- Actividad con `break-words`/`break-all`; salud con "sin conexión" claro,
  latencia con tooltip y error con corte controlado.

### Control (`components/FloorMap.tsx`, calibración intacta)
- Toolbar compacta: título reducido, pisos igual que antes, botón
  **Herramientas** colapsable solo en móvil (desktop siempre visible);
  leyenda de una línea compacta con conteos y tooltips; plano más alto
  (`58vh`, `66vh` en desktop); zoom táctil de 44 px.
- Panel: en móvil es hoja inferior (`max-h-72dvh`, con asa y ✕) que se cierra
  sin mover el zoom; ✕ también en desktop.
- Ficha consulta-primero: encabezado (nombre + estado + piso/GLPI/conteos),
  Información general, Ocupante (nombres + personales clicables), Bienes como
  filas con icono + nombre-botón + inv + modelo/serie (sin columna de
  eliminar; la ficha del equipo usa el componente de Búsqueda con retorno al
  puesto).
- **Administrar puesto y equipos** (cerrado, solo operadores): ocupante
  (asignar/cambiar/quitar con confirmaciones intactas), interno
  (editar/quitar), agregar por inventario/scan, y por equipo Editar en GLPI,
  Reemplazar y Desvincular con botones de texto táctiles. Sin aviso de login
  para viewers ni iconos de acción en la consulta.
- Nombres con entidades decodificadas; estados con la misma clasificación y
  colores (etiquetas siempre presentes, no solo color).

## Iteración 9 — Control usa el drawer compartido

- La columna fija del aside desaparece: el plano ocupa todo el ancho y la
  ficha del puesto abre el `SidePanel` compartido (mismo estilo, ancho,
  header, ✕, backdrop, Escape, fullscreen móvil y `← Volver al plano`).
  Cerrar conserva posición, zoom y puesto seleccionado (se mantiene `sel`).
- **Eliminada la fila "Ubicación GLPI"** de Información general (dato, IDs y
  relaciones intactos; piso e interno siguen visibles). Info: Piso, Interno,
  Estado. Encabezado: nombre + badge de estado (sin duplicar lo de abajo).
- Lugares (árbol GLPI) se mudó a la tarjeta de Herramientas (colapsable en
  móvil). Sin columna estrecha en móvil: drawer fullscreen en lugar de hoja.
- `ScanModal` y la ficha de equipo (`AssetEditModal`) se renderizan después
  de los paneles para quedar por encima (mismo z-index, orden de DOM).
  Calibración 100 % intacta (se excluye `calibrar` del drawer).

## Iteración 10 — Pulido de Movimiento masivo

Sin cambios funcionales (mismo flujo de 3 pasos, mismas validaciones,
duplicados, PATCH solo-`location_id`, auditoría y registro en Actividad).

- **Selector de puestos**: el `SearchCombobox` cierra al elegir y en móvil es
  hoja inferior fija (`.combo-list` fixed + safe-area, `55dvh`, z 65) con
  `scrollIntoView` del campo al abrir; desktop mantiene 240 px con scroll,
  hover/seleccionado/focus-visible/teclado intactos.
- **Badge "Con usuario"** (tabla y tarjetas) con icono + nombre, basado en
  `_userId` real (no en el display). El estado "Listo" no cambia: la presencia
  de usuario no es error.
- **Limpieza con confirmación** (ya existía `ConfirmDialog` con conteo; se
  mantiene: sin filas no hay botón, no toca GLPI).
- **Confirmación de movimiento** ampliada: destino + piso (derivado del padre
  GLPI) + cantidad + cantidad con usuario; consecuencia verificada en
  `app/api/glpi/route.ts`: el PATCH masivo solo envía `location_id`, nunca
  `user_id`, por lo que **siempre conserva usuarios** (el flag
  `keepUserOnMove` de config no está cableado a los movimientos; no se
  modifica su comportamiento). Sin doble envío (botón bloqueado en curso).
- **Ingreso manual**: foco devuelto al campo tras Agregar (carga consecutiva);
  Enter, duplicados, errores y permanencia en lista intactos. Cámara en
  ráfaga sin cambios.
- Resultados por ítem (movido/fallo con detalle) y resumen con parciales:
  sin cambios, sin éxito anticipado.

## Iteración 11 — Refinamiento Config + Masivo

Sin rediseños ni cambios funcionales (mismas validaciones, reglas, endpoints
y auditoría). Componentes y estilos existentes.

### Configuración (`app/config/page.tsx`)
- Tabs con prop `fit` (nuevo en `ui.tsx` + `.tabs-fit` solo desktop): al
  contenido en vez de 1/4 de pantalla; scroll propio en móvil; contenedor más
  bajo y badge de sesión discreto ("Admin").
- Conexión: alturas unificadas (`.input`), etiquetas con `gap-1.5`, badges
  "guardado" inline, Guardar primario vs Probar secundario, `BusyButton` y
  resultados con `role=status`. Sin tocar tokens ni lógica.
- Pisos: hint con estado de calibración (`X/Y · Completo` / `X/Y ·
  N pendiente(s)` / `0/0 · Sin puestos`), texto discreto sin alarmas;
  miniatura y conteos iguales; eliminar como `admin-action` secundaria con
  `ConfirmDialog` que aclara alcance + "En GLPI no se borra nada".
- Reemplazar plano: valida tipo (JPG/PNG/WebP) y tamaño (≤10 MB) antes de
  subir, y pide confirmación identificando el piso y advirtiendo que las
  posiciones (%) se conservan pero conviene recalibrar si cambia la
  distribución. Sin tocar coordenadas.
- Apariencia: muestras de 44 px con ✓ visible, `aria-pressed` y nombres
  accesibles; Guardar primario vs Restablecer secundario; Restablecer pide
  confirmación solo si hay algo que perder (valores ≠ corporativos);
  confirmación de guardado conservada.
- Avanzada: checkbox táctil, dirty indicator, backup/confirm/import intactos
  (la validación profunda del ZIP y la atomicidad siguen siendo del backend;
  el frontend valida extensión y evita doble envío).

### Masivo (`app/masivo/page.tsx`)
- Usuario asignado como etiqueta compacta única **"Usuario: nombre"** con
  icono discreto (tabla y tarjetas), basada en `_userId` real; sin fila si
  no hay asignación. "Listo" intacto e independiente.
- Barra de confirmación: `role=region`, `min-w-0`/`max-w-full`, botón de
  ancho completo en móvil, safe-area y sticky intactos. Diálogo y lógica de
  confirmación sin cambios.

## Iteración 12 — Pulido final de Inicio

Sin rediseño ni cambios de datos/cálculos/endpoints. Solo presentación.

- **Salud del sistema**: la fila Actividad+Salud usa `items-start` para que la
  tarjeta no se estire artificialmente; contenido ya compacto (badge de
  conexión, latencia con tooltip, sync, pendientes con link a Calibrar).
- **Actividad reciente**: filas con mejor separación (`py-1.5`), actor +
  operación + equipo diferenciados, fecha corta + hora con tooltip completo,
  "Ver más (N) / Ver menos" inicial en 8 registros. Sin link a ficha: con
  solo tipo+id no hay ruta compatible (Búsqueda indexa por inventario/nombre).
- **KPIs**: 1 columna bajo 420 px, 2 hasta desktop, 4 en desktop, alturas
  uniformes; "Puestos dibujados" navega a `/mapa` (única con ruta compatible;
  no se inventan filtros).
- **Puestos por estado**: caption con total + "mismos colores y nombres que
  en Control"; clasificación y colores intactos, valores siempre con texto.
- **Equipos por tipo**: caption de escala relativa conservada; filas con
  `truncate` y cantidades sin compresión.
- **Distribución por piso**: nombres unificados solo-visual con
  `formatFloorName` (`lib/location-display.ts`: "1°/1º" → "1.º piso",
  "PB"/"planta baja" → "PB"; resto intacto, IDs y valores sin tocar),
  aplicado en Inicio y en el selector/título de Control. Link al plano
  intacto.
- **Accesos rápidos**: `min-h` uniforme y área táctil completa; permisos y
  visibilidad intactos.

### Despliegue iteración 12
- `npm run build` OK (17 rutas). Imagen reconstruida con `/tmp/Dockerfile.local`
  (reemplazo completo de `/app/.next`), contenedor recreado.
- BUILD_ID igual al del host; chunk de inicio servido con toggle Ver más,
  caption de total y link de Puestos dibujados; `/`, `/buscar`, `/mapa`,
  `/accesos`, `/masivo`, `/config` → 200 por HTTP y HTTPS.
- Pendiente en dispositivo real con GLPI en línea: KPIs a 320–430, Ver más,
  barras y distribución por piso, actividad/salud, anchos físicos. Sin
  operaciones destructivas en pruebas.

### Despliegue iteración 11
- `npm run build` OK (17 rutas). Imagen reconstruida con `/tmp/Dockerfile.local`
  (reemplazo completo de `/app/.next`), contenedor recreado.
- BUILD_ID igual al del host; CSS con `.tabs-fit`; chunks con
  `Administrar puesto y equipos`→(iter8), `tabs-fit`, `Con cambios sin
  guardar`, `Reemplazar plano`, "Usuario:"; `/`, `/buscar`, `/mapa`,
  `/accesos`, `/masivo`, `/config` → 200 por HTTP y HTTPS.
- Pendiente en dispositivo real con admin/operador: tabs fit en 320–768,
  expansión de pisos, reemplazo con confirmación, restablecer condicional,
  etiqueta Usuario en tabla y tarjetas, barra de confirmación móvil, anchos
  físicos. Sin operaciones destructivas en pruebas.

### Despliegue iteración 10
- `npm run build` OK (17 rutas). Imagen reconstruida con `/tmp/Dockerfile.local`
  (reemplazo completo de `/app/.next`), contenedor recreado.
- BUILD_ID igual al del host; chunk de masivo servido con "Con usuario",
  "Confirmar movimiento masivo", "Cambiar" y texto de conservación;
  `/`, `/buscar`, `/mapa`, `/accesos`, `/masivo`, `/config` → 200 por HTTP
  y HTTPS.
- Pendiente en dispositivo con operador en línea: hoja de puestos con teclado
  virtual, badge en tabla y tarjetas, foco tras Agregar, confirmación con
  piso/usuarios, limpieza confirmada, anchos físicos. Sin movimientos reales
  en pruebas.

### Despliegue iteración 9
- `npm run build` OK (17 rutas). Imagen reconstruida con `/tmp/Dockerfile.local`
  (reemplazo completo de `/app/.next`), contenedor recreado.
- BUILD_ID igual al del host; chunk de mapa servido con "Volver al plano", sin
  fila de ubicación GLPI y sin tag `<aside>`; `/`, `/buscar`, `/mapa`,
  `/accesos`, `/masivo`, `/config` → 200 por HTTP y HTTPS.
- Pendiente en dispositivo con GLPI en línea: abrir/cerrar ficha del puesto,
  conservación de zoom/posición/selección, cambio entre puestos, admin del
  puesto y ficha de equipo anidada en escritorio y móvil.

### Despliegue iteración 8
- `npm run build` OK (17 rutas). Imagen reconstruida con `/tmp/Dockerfile.local`
  (reemplazo completo de `/app/.next`), contenedor recreado.
- BUILD_ID igual al del host; CSS con `tabs-scroll`/`check-lg`/`info-card`;
  chunks con `Administrar puesto y equipos`, `Confirmar movimiento masivo`,
  `Planos por piso`, `Con cambios sin guardar`; `/`, `/buscar`, `/mapa`,
  `/accesos`, `/masivo`, `/config` → 200 por HTTP y HTTPS.
- Pendiente con GLPI/perfiles reales en dispositivo: zoom/pinch y sheet en
  móvil, ficha de equipo desde puesto, masivo completo (scan + confirmar),
  ABM de pisos, import ZIP, anchos 320–1440 físicos. Sin operaciones
  destructivas en pruebas.

### Masivo (`app/masivo/page.tsx`, flujo de 3 pasos intacto)
- Destino con piso + `SearchCombobox` de puestos (se cierra al elegir);
  resumen `Destino: piso · puesto (+id)` con **Cambiar**; recálculo de
  "ya-ahí" intacto.
- Escaneo/manual iguales; lista en tabla desktop y **tarjetas móvil** con
  estado textual + badge (`StatusBadge`: las 9 variantes con texto y tooltip,
  nunca solo color); quitar con ✕ de 44 px.
- Confirmación con `ConfirmDialog` (destino, cantidad, alcance real) y
  limpieza de lista también confirmada y diferenciada (danger); barra sticky
  con safe-area; sin doble ejecución.

### Configuración (`app/config/page.tsx`)
- `Tabs` compartido con scroll móvil, contadores y badges "sin guardar";
  secciones en `max-w-3xl`.
- Conexión: etiquetas visibles, tokens "no cambiar", indicador de cambios,
  `BusyButton` en Guardar/Probar, resultado con `role=status`.
- Pisos: tarjetas `AdminSection` colapsadas (nombre + `X/Y` + ubicación),
  miniatura, ParentPicker, reemplazo, calibrar y borrado con `ConfirmDialog`.
- Apariencia: colores con ✓ visible + `aria-pressed` + 44 px; logo con
  confirmación al quitar.
- Avanzada: checkbox táctil con explicación, backup con mensajes inline,
  importación con validación de extensión + `ConfirmDialog` de alcance
  (reemplazo total).

### Despliegue iteración 7
- `npm run build` OK (17 rutas). Imagen reconstruida con `/tmp/Dockerfile.local`
  (reemplazo completo de `/app/.next`), contenedor recreado.
- BUILD_ID igual al del host; CSS con `.perm-on`/`.perm-off`; chunk compartido
  con las 4 ramas (perm-on/off ×2, "Envía"/"No envía" como escape `\xed`,
  "Recibe"/"No recibe" literales); `/`, `/buscar`, `/mapa`, `/accesos`,
  `/masivo` → 200 por HTTP y HTTPS.
- Lógica de las 4 combinaciones verificada en artefactos (ambos activos,
  ambos inactivos, solo envío, solo recepción). Sin navegador en el entorno,
  la comprobación visual de píxeles queda pendiente en dispositivo real con
  un caso como `salas-reuniones` (envío sí, recepción no).

### Despliegue iteración 6
- `npm run build` OK (17 rutas). Imagen reconstruida con `/tmp/Dockerfile.local`
  (reemplazo completo de `/app/.next`), contenedor recreado.
- BUILD_ID igual al del host; CSS con `tabs-scroll`/`check-lg`/`admin-action`;
  panel accesos con `Administrar accesos`; `/`, `/buscar`, `/mapa`, `/accesos`,
  `/masivo` → 200 por HTTP y HTTPS.
- Nota: el deploy local incluye además el botón "Ver en mapa" en la ficha de
  equipo (Iteración 5, aún sin pushear — ver working tree).
- Pendiente con GLPI/perfil operador en línea: abrir fichas, navegar entre
  recursos y persona, agregar/quitar accesos, toggles Envía/Recibe, ABM con
  guard, eliminaciones con/sin force, exports, anchos 320–1440 físicos.

### Despliegue iteración 5
- `npm run build` OK (17 rutas). Imagen reconstruida con `/tmp/Dockerfile.local`
  (reemplazo completo de `/app/.next`), contenedor recreado.
- BUILD_ID igual al del host; CSS `c1b4bb…` con `copy-btn`/`rowlink`/
  `info-card`; `/`, `/buscar`, `/mapa` → 200 por HTTP y HTTPS.
- Pendiente con GLPI en línea: copiado en móvil real, entidades en estados
  reales, foco con teclado físico, navegación equipo↔persona con datos,
  anchos 320–1440 físicos.

### Despliegue iteración 4
- `npm run build` OK (17 rutas). Imagen reconstruida con `/tmp/Dockerfile.local`
  (reemplazo completo de `/app/.next`), contenedor recreado.
- BUILD_ID igual al del host; el CSS servido contiene `info-card`,
  `admin-action` y `section-h`; `/`, `/buscar`, `/mapa` → 200 por HTTP y HTTPS.
- Flujos contra GLPI real (mover/asignar/desvincular, Ver ficha, escáner)
  pendientes de prueba en línea.

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
  `npm run build` del host. Lección: hay que reemplazar `/app/.next` **por
  completo** (`rm` + `COPY .next/standalone/.next` con manifests+`server/` +
  `COPY .next/static`); copiar solo `server.js`/`static` por encima deja
  manifests y chunks viejos que sirven la UI anterior aunque el `server.js`
  sea nuevo (detectado porque el HTML referenciaba el CSS viejo y el CSS no
  contenía `sidepanel`). Tras el fix: BUILD_ID igual al del host, un solo CSS
  (`b4c87f…`, con `sidepanel`/`asset-card`/`combo-list`) y `/`, `/buscar`,
  `/mapa` → 200 por HTTP y HTTPS. Pendiente con GLPI en línea: buscar inventario,
  expandir categoría, abrir equipo en panel, mover/desvincular puesto,
  asignar/quitar usuario, drawer móvil y formularios con teclado virtual (no
  simular éxitos: las pruebas de escritura van contra GLPI real).
- Sin escrituras a GLPI productivo en pruebas.
