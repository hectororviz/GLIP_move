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
| `GET /api/access/export?scope=area\|mail\|share&id=` | **XLSX real** (solo operador): área = 2 hojas (Correos+Carpetas); correo/carpeta = 1 hoja. Columnas correo: `Área|Correo|Dirección|Persona|UserID|Envía|Recibe`; carpeta: `Área|Carpeta|Ruta|Persona|UserID|Acceso`. Recursos sin grants salen con fila vacía |

Todas responden `401` sin login y `403` sin perfil operador.

## UI (`app/accesos/page.tsx`)

* Ruta `/accesos` en nav con candado 🔒 si no hay `canOperate` (`components/AppShell.tsx`), igual que `/masivo`. Página con wall + `AuthModal` si no autorizado.
* Tabs **Áreas / Correos / Carpetas / Personas**, todo con **tablas** (`table-dense`) y **modales** (crear/editar, ver personas, agregar con `UserSearch` + checks).
* Ficha persona: `/buscar` (modo Personas) muestra bloque **Accesos** si sos operador; `/accesos → Personas` permite buscar GLPI, ver ficha con checkboxes editables inline y quitar.
* Detalle correo: tabla `Persona | Envía ☑ | Recibe ☑ | Quitar` (checks editables). Detalle carpeta: `Persona | Acceso Sí ✓ | Quitar`.
* **Exportar Excel ↓** (XLSX real con `xlsx`, header bold + freeze + autofilter): botones contextuales por fila de área (área completa, 2 hojas), por fila/detalle de correo (ese correo) y por fila/detalle de carpeta (esa carpeta). También en los modales de detalle de `/buscar`. Nombre `accesos-{scope}-{slug}-{YYYYMMDD-HHmm}.xlsx`; saneo anti-fórmulas (`=,+,-,@` iniciales).

## Respaldo

`GET /api/backup` incluye `access.json` en el ZIP; `POST /api/backup` lo restaura si viene (valida `areas/mails/shares` arrays, ignora backups viejos sin ese archivo).

## Carga inicial (Excel relevamiento)

1. Crear áreas (responsable = buscar en `/buscar → Personas`, anotar `User.id`).
2. Crear correos/carpetas con su área.
3. En cada recurso → `Personas` → `Agregar` (buscar + tildar Envía/Recibe u otorgar acceso).
4. Verificar en `Personas` (ficha) y en `overview` por área.
