# 08 — Accesos: áreas, correos institucionales y carpetas compartidas

Módulo de **DB propia** (`data/access.json`), GLPI solo aporta identidad (Personas = `User.id`).
**Todo el módulo exige sesión con permiso operador** (`Super-Admin,Admin` por defecto): sin lectura anónima, a diferencia de mapa/búsqueda. Patrón auth igual que `PATCH /api/glpi` (`isOperator()` + `Session-Token` propio).

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

Todas responden `401` sin login y `403` sin perfil operador.

## UI (`app/accesos/page.tsx`)

* Ruta `/accesos` en nav con candado 🔒 si no hay `canOperate` (`components/AppShell.tsx`), igual que `/masivo`. Página con wall + `AuthModal` si no autorizado.
* Tabs **Áreas / Correos / Carpetas / Personas**, todo con **tablas densas intercaladas** (`table-dense` + zebra) y **modales**. En Correos y Carpetas **no hay botón Personas: tocar la fila abre el modal** (también con Enter/Espacio, con `›` como indicador). En Carpetas no hay columna de conteo (el modal lista las personas).
* Acciones con **iconos monocromos** (`components/icons.tsx`, SVG con `currentColor`: oscuros sobre botones claros, blancos sobre danger/primary) en lugar de emojis: editar, exportar, borrar, correo, carpeta, ojo, persona. Columna Envían/Recibe **apilada en dos líneas** (n + icono arriba/abajo) sin título de encabezado para no forzar scroll horizontal.
* En móvil las columnas secundarias se ocultan y pasan como sublínea bajo el nombre (dirección/ruta truncada + área) con corte libre (`break-all`) para que Nombre + conteos + acciones entren sin scroll en 360px. Modales de personas con `table-layout: fixed` en móvil (`table-modal-fluid`) para que el `truncate` recorte de verdad.
* Alta de personas: el modal de detalle del recurso trae botón **+ Agregar** que abre un **submodal** con `UserSearch` (+ checks Envía/Recibe en correos) y Otorgar; queda abierto para cargar varias seguidas.
* Ficha persona: `/buscar` muestra bloque **Accesos** si sos operador; `/accesos → Personas` permite buscar GLPI, ver ficha con checkboxes editables inline y quitar (icono cesto).
* Detalle correo: tabla `Persona | ✉️ | 👁️ | 🗑️` → iconos monocromos SVG (checks editables). Detalle carpeta: tabla `Persona | 🗑️` (sin columna Acceso: si está en la lista, tiene acceso).
* **Exportar Excel ↓** (XLSX real con `xlsx`, header bold + freeze + autofilter): botones contextuales por fila de área (área completa, 2 hojas), por fila/detalle de correo (ese correo) y por fila/detalle de carpeta (esa carpeta). También en los modales de detalle de `/buscar`. Columnas de persona separadas `Apellido|Nombre` (desde GLPI). Nombre `accesos-{scope}-{slug}-{YYYYMMDD-HHmm}.xlsx`; saneo anti-fórmulas (`=,+,-,@` iniciales).
* **Descargar todo**: en tabs Correos y Carpetas, a la izquierda de `+ Nuevo correo` / `+ Nueva carpeta`, botón secundario `Descargar todo` (icono ↓) que exporta todo el inventario (`?scope=mails` / `?scope=shares`, 1 hoja, ordenado por área+nombre). En tab Áreas, mismo botón a la izquierda de `+ Nueva área` que exporta todo (`?scope=areas`, 2 hojas Correos+Carpetas). Respeta `401/403` de operador igual que el resto.

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
