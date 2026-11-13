# 08 — Accesos: áreas, correos institucionales y carpetas compartidas

Módulo de **DB propia** (`data/access.json`), GLPI solo aporta identidad (Personas = `User.id`).
**Tres niveles por perfil GLPI** (nombres exactos de `getMyProfiles`, configurables por env):
`full` = operador (`GLPI_OPERATOR_PROFILES`: `Super-Admin,Admin,Infra-CTIC`) → lectura + ABM + grants + export;
`read` = solo lectura (`GLPI_VIEWER_PROFILES`: `Control Patrimonio`) → ve control/búsqueda/accesos y exporta, sin editar nada;
`none` = resto/sin login → solo lo público (sin lectura de accesos, a diferencia de mapa/búsqueda).
Lectura = `canReadAccess()` (`401` sin login, `403` logueado sin perfil); escritura sigue con `isOperator()` + `Session-Token` propio, igual que `PATCH /api/glpi`.

## Modelo (`lib/access.ts`)

```json
{
  "version": 1,
  "areas": [{ "id": "administracion", "nombre": "Administración", "responsableUserId": 42, "responsableNombre": "Ana Gómez" }],
  "mails": [{ "id": "ventas-ventas", "nombre": "Ventas", "direccion": "ventas@ejemplo.org", "areaId": "administracion" }],
  "shares": [{ "id": "contable", "nombre": "Contable", "ruta": "\\\\srv\\contable", "areaId": "administracion" }],
  "mailGrants": [{ "accountId": "...", "userId": 42, "userDisplay": "Ana Gómez", "canSend": true, "canRead": true }],
  "shareGrants": [{ "shareId": "...", "userId": 42, "userDisplay": "Ana Gómez" }]
}
```

Reglas:

* **Correo: dos checks independientes** `canSend` (Envía ✉️) y `canRead` (Recibe 👁️). Al menos uno en true.
* **Carpeta: acceso sí/no** (existencia del grant = acceso). Sin niveles.
* **Responsable de área = usuario GLPI** (se valida con `GET /User/{id}` y se guarda snapshot del nombre).
* Unicidades: `Area.nombre` (case-insensitive), `Mail.direccion` (lower/trim), `Share.ruta` normalizada (`/`→`\`, colapsa duplicadas, sin trailing, compara case-insensitive).
* Borrado de área **bloquea** si tiene correos/carpetas (`409`). Borrado de correo/carpeta bloquea si tiene personas (`409`), salvo `?force=1` con confirmación en UI.
* Escritura atómica `tmp+rename` (mismo espíritu que `saveFloors`).

## Búsqueda unificada (`GET /api/search?q=` + `/buscar`)

Agregador server-side: en paralelo busca equipos (misma lógica inventario→nombre/serie + atajo QR), personas (3 campos User) y —solo con `isOperator()`— áreas/correos/carpetas (match contiene-insensible con `lib/search.ts:norm()` en nombre/dirección/ruta/área/responsable, tope 20/categoría). Sin operador devuelve `{locked:true}` en esas 3. `?q=` también soportado en `GET /api/access/{areas,mails,shares}` para reutilizar. `/buscar` es la vista global con 5 acordeones + detalle en modal; `/accesos` queda solo para ABM.

## APIs (`app/api/access/`)

| Ruta | Uso |
|---|---|
| `GET/POST /api/access/areas` + `PUT/DELETE?id=` | ABM áreas (conteos `mails/shares`) |
| `GET/POST /api/access/mails?area=` + `PUT/DELETE?id=` | ABM correos (conteos `personas/envian/reciben`) |
| `GET/POST /api/access/shares?area=` + `PUT/DELETE?id=` | ABM carpetas (conteo `personas`) |
| `GET /api/access/grants?user_id=` | Ficha persona: correos+carpetas asignadas |
| `GET /api/access/grants?accountId=` | Personas de un correo + checks |
| `GET /api/access/grants?shareId=` | Personas de una carpeta |
| `POST/DELETE /api/access/grants` | Otorgar/quitar (`scope:'mail'\|'share'`) |
| `GET /api/access/overview?area=` | Correos+carpetas de cada área |
| `GET /api/access/export?scope=area\|mail\|share&id=` | **XLSX real** (solo operador): área = 2 hojas (Correos+Carpetas); correo/carpeta = 1 hoja. Columnas correo: `Área|Correo|Dirección|Apellido|Nombre|UserID|Envía|Recibe`; carpeta: `Área|Carpeta|Ruta|Apellido|Nombre|UserID|Acceso`. `Apellido`/`Nombre` salen de GLPI (`realname`/`firstname` guardados en cada grant; fallback heurístico sobre el display si faltan). Recursos sin grants salen con fila vacía |
| `GET /api/access/export?scope=mails\|shares` | **Descargar todo** (solo operador): `mails` = 1 hoja `Correos` con todos los correos; `shares` = 1 hoja `Carpetas` con todas las carpetas. Mismo formato de columnas. Nombres `accesos-correos-todo-*.xlsx` / `accesos-carpetas-todo-*.xlsx` |
| `GET /api/access/export?scope=areas` | **Descargar todo de áreas** (solo operador): 2 hojas (`Correos`+`Carpetas`) con todas las áreas ordenadas por área+nombre. Nombre `accesos-areas-todo-*.xlsx` |

Lectura (`GET` áreas/correos/carpetas/overview/grants/export + secciones de `/api/search`): `401` sin login, `403` logueado sin perfil con acceso. Escritura (`POST/PUT/DELETE`): solo operador (`403` para viewers).

## UI (`app/accesos/page.tsx`)

* Ruta `/accesos` en nav con candado 🔒 si no hay acceso de lectura (`components/AppShell.tsx`). Página con wall + `AuthModal` si `access === "none"`; viewers ven todo en modo lectura (sin `+ Nuevo`, sin secciones Administrar, exports visibles, sin avisos de permiso ocupando espacio).
* Tabs accesibles (`components/ui.tsx:Tabs`, flechas/Home/End) con **contadores** Áreas/Correos/Carpetas y scroll horizontal propio en móvil (`.tabs-scroll`); filtro de texto client-side por pestaña + filtro por área en Correos/Carpetas.
* Permisos como `PermBadges` compartido (`ui.tsx`): habilitado verde + check ("Envía"/"Recibe"), deshabilitado gris + X ("No envía"/"No recibe"); nunca solo color. Badges no clicables; toggles reales solo en Administrar.
* **Tablas densas en desktop, tarjetas en móvil** (mismo patrón que Búsqueda). Encabezados con etiquetas claras (`Correos`, `Carpetas`, `Permisos` como "N envían · M reciben" con tooltip y `aria-label`, nunca solo iconos). "Sin responsable" en lugar de `— #0`. El nombre del recurso es botón (`rowlink`) y abre su ficha; botón **Ver detalle** explícito.
* Detalles en **`SidePanel`** (drawer desktop / fullscreen móvil) con pila de navegación y retorno (área↔correo↔carpeta↔persona), conservando pestaña, filtros y scroll al cerrar. Información primero: ficha + listas compactas con `PermBadges` textuales (**Envía**/**Recibe**, nunca solo iconos/colores); **Administrar** colapsado y solo-operador (agregar, toggles `check-lg` de 22 px que se guardan de inmediato como antes, quitar con confirmación, editar, exportar, eliminar protegida).
* Copiar dirección/ruta con `CopyButton` (sin alterar barras ni espacios). Área del recurso enlaza a su ficha.
* Alta de personas: **Administrar accesos → Agregar persona** abre **submodal** (z-60, sobre el panel) con `UserSearch` con debounce + checks Envía/Recibe en correos y Otorgar.
* Ficha persona (panel, ya no inline): correos con badges Envía/Recibe + carpetas por filas, navegación a cada recurso y retorno; **Administrar accesos** con toggles y Quitar (mismas reglas: POST upsert, DELETE con confirmación).
* Eliminaciones con `ConfirmDialog` (danger): explica alcance real (el área solo se borra vacía —409 del backend—; correo/carpeta con accesos pide 2ª confirmación con `force=1` y el mensaje del servidor; la carpeta real del servidor no se toca). Sin botones rojos en listados.
* ABM en `Modal` (z-70, sobre el panel; bottom-sheet móvil, safe-area) con `guard` anti-pérdida (confirm si hay datos), `BusyButton`, errores inline sin cerrar, selector de área con `SearchCombobox` y responsable con `UserSearch` (selección visible antes de guardar).
* **Exportar Excel ↓** (XLSX real con `xlsx`, header bold + freeze + autofilter): Descargar todo por pestaña + export por recurso desde su Administrar. Columnas de persona separadas `Apellido|Nombre` (desde GLPI). Nombre `accesos-{scope}-{slug}-{YYYYMMDD-HHmm}.xlsx`; saneo anti-fórmulas (`=,+,-,@` iniciales). Formatos y contenidos intactos.

## Respaldo

`GET /api/backup` incluye `access.json` en el ZIP; `POST /api/backup` lo restaura si viene (valida `areas/mails/shares` arrays, ignora backups viejos sin ese archivo).

## Carga inicial (Excel relevamiento)

1. Crear áreas (responsable = buscar en `/buscar → Personas`, anotar `User.id`).
2. Crear correos/carpetas con su área.
3. En cada recurso → `Personas` → `Agregar` (buscar + tildar Envía/Recibe u otorgar acceso).
4. Verificar en `Personas` (ficha) y en `overview` por área.

## Import masivo (`scripts/import-mail-permisos.mjs`)

Importa `Permisos correos inst.xlsx` (Hoja1 = grants `Usuario|Correo|Area`, Hoja2 = catálogo `Correo|Área`):

```sh
node scripts/import-mail-permisos.mjs --dry-run   # solo reporte, no escribe
node scripts/import-mail-permisos.mjs --apply      # backup + escribe + reporte JSON en data/
```

Reglas: match GLPI multi-estrategia por apellido (exacto → token → prefijo de 5, más mapa manual), **apellido-exacto-primero** y desempate por mayor id (los `-OLD` son cuentas de prueba; así `Leone`→#51 Yanina y no #137 REY); overrides fijos (`Dall Armelina`→180 por el apóstrofe, `Alvarez`→#77 Sergio, `Diaz`→#122 Mariano). Mapeo sin-punto→con-punto (DNDyEIP). Grants: `canSend=true` preservando `canRead`. Sin borrar nada: áreas nuevas con responsable pendiente (`— #0`), recursos sin grants se crean igual, filas sin resolución van al reporte (`Constanzo` descartado, `becasymaestriasdgfeyl@` pendiente por diferir de Hoja2).
