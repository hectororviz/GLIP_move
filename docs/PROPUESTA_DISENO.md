# PROPUESTA_DISENO — Sistema corporativo CTIC

## Principios
Moderna, densa pero legible, jerarquizada, eficiente para operadores. Azul institucional `#0b5ed7` solo nav/acción primaria. Sin animaciones gratuitas, respeto a `prefers-reduced-motion`.

## Tokens
- `--st-use-bg/bd/tx` verde `#15803d`, `--st-free` azul `#2563eb`, `--st-inc` ámbar `#b45309`, `--st-warn` rojo `#dc2626`: fondo ~22-28% + borde opaco 2px + número en pill blanco 88%.
- Selección: `outline 3px + halo` sin cambiar fill. Estados + icono + texto (no solo color).
- Componentes: `.btn/.card/.badge/.input/.table-dense/.tip/.skeleton/.spinner/.segbar`, foco `:focus-visible`, targets ≥32px.

## Control
- Leyenda compacta con conteos del piso: uso/disponible/incompleto/inconsistente (⚠).
- Puestos `role=button tabindex=0 aria-label="nombre, estado, bienes, usuarios"`, teclado Enter/Espacio, tooltip propio (hover/focus) con estado+bienes+usuarios+interno.
- Buscador en plano (solo dibujados): puesto/usuario/inventario→cambia piso + `zoomToElement` + flash + abre. Lista si múltiples.
- Capas: puestos/números/estados + filtro todos/A/B/C (solo visibilidad). Controles `+/−/reset/fit/fullscreen` preservando selección.
- Panel: header sticky (puesto/piso/GLPI/estado/bienes), scroll independiente, secciones Usuarios/Bienes compactos con iconos/Inteno/Agregar. “Desvincular del puesto (no elimina en GLPI)”.

## Inicio
- KPIs: total, asignados directos (aclarado), sin ubicación (`locations_id=0`), dibujados. Nueva sección “Puestos por estado” + `SegmentedBar` misma paleta. Por piso: barras segmentadas + conteos por estado. Salud: conectado/latencia/última sync/error + caché.

## Búsqueda
- Filtros Equipos/Personas + tipo. Tabla compacta por defecto (Tipo/Nombre/Inventario/Serie/Modelo/Ubicación/Usuario + acciones iconos), orden por columna, toggle a tarjetas. Empty vs error diferenciados.

## Config/Calibración
- Misma lógica, tabs con `role=tab`, aviso de tokens solo-servidor, calibración con herramienta pan/draw, mensajes con `role=status`.
