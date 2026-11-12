# GLPI Move — Control de bienes GLPI 10 con mapa de puestos (PWA)

App web instalable para registrar y consultar movimientos de bienes usando la
**API REST legacy de GLPI 10**. Portable: solo necesita red hacia GLPI.

```sh
cp .env.example .env   # ajustar GLPI_BASE_URL, CONFIG_KEY, ADMIN_PASSWORD
sh build-docker.sh && docker compose up -d   # http://localhost:3000
```

Para usar la cámara en teléfonos, servir por HTTPS (ver
[`docs/01-instalacion.md`](docs/01-instalacion.md)).

## Docs

- [`docs/01-instalacion.md`](docs/01-instalacion.md) — despliegue Docker, `.env`, red host, volúmenes, HTTPS para cámara.
- [`docs/02-glpi.md`](docs/02-glpi.md) — habilitar API, App-Token, User token, perfiles y permisos, verificación manual.
- [`docs/03-configuracion.md`](docs/03-configuracion.md) — `/config`: pestañas Conexión, Pisos, Apariencia, Avanzada; login unificado; respaldo ZIP.
- [`docs/04-uso.md`](docs/04-uso.md) — Control (menú contextual, ocupantes), Búsqueda (equipos y personas + accesos), Calibración, escáner (Code128 + QR GLPI).
- [`docs/05-arquitectura.md`](docs/05-arquitectura.md) — stack, auth por roles, proxy y mapeos API, modelo de datos, decisiones técnicas.
- [`docs/06-troubleshooting.md`](docs/06-troubleshooting.md) — tabla de errores y soluciones.
- [`docs/08-accesos.md`](docs/08-accesos.md) — Áreas, correos institucionales (Envía/Recibe) y carpetas compartidas (DB propia, solo operadores).
- [`docs/09-postgres.md`](docs/09-postgres.md) — Postgres + Prisma (DB propia), migración desde JSON e imágenes vía GitHub Actions.

## Resumen funcional

- **Control (`/mapa`):** planos por piso + hotspots = hijos GLPI, árbol de lugares navegable, sidebar con equipos y ocupante del puesto. Al dibujar un puesto se abre un menú contextual con los puestos disponibles (auto-guardado); clic derecho reasigna. Quitar/reemplazar/agregar por inventario, scan o QR. Quitar deja sin ubicación. El bien recién agregado destella 5 s. “Ver en mapa” centra y destella el puesto.
- **Búsqueda (`/buscar`):** buscador único con 5 acordeones colapsables (Equipos, Personas, Áreas, Correos, Carpetas) + detalle en modal. Equipos: por inventario (10 dígitos, letra-serie `A 0001-0045`, URL de QR GLPI), serie o nombre; ficha con link `Ver en mapa →`. Personas: por nombre/apellido/usuario GLPI. Áreas/Correos/Carpetas: solo operador (🔒 + login), match contiene-insensible (ej. `CTIC`).
- **Personas:** ocupante derivado de `users_id` en GLPI; asignar/cambiar/quitar desde el puesto (con confirmación y vista de equipos afectados). Equipos personales (notebooks) asignados directos sin puesto, desde la ficha de la persona o del bien. Sin directorio local duplicado.
- **Calibración (`/mapa?calibrar=1`):** solo admin. Dibujar/mover/redimensionar puestos sobre el plano, menú contextual para asignar/reasignar, etiquetas cortas centradas (`Puesto 23` → `23`), auto-guardado en servidor.
- **Auth:** lectura libre (bienes/mapa); edición con login GLPI (perfil con UPDATE en inventario) o clave admin local (failover). GLPI admin (Super-Admin/Admin) tiene acceso total, incluida `/config`. Calibración, backup y logo solo admin. **Accesos (`/accesos`) sin lectura anónima: todo exige perfil operador.**
- **Accesos (`/accesos`):** ABM de Áreas (nombre + responsable GLPI), Correos (nombre + dirección + área, checks Envía/Recibe por persona) y Carpetas (nombre + ruta + área, acceso sí/no) en tablas + modales; consultas por área, por recurso y por persona (ficha con sus correos/carpetas).
- **Apariencia:** nombre de la herramienta, color de acento y logo PNG (header, favicon, PWA) desde `/config`.
- **Respaldo:** Export/Import ZIP (`floors.json` + planos + `access.json`) en Avanzada; reemplaza todo con confirmación.
- **Infra:** Auth GLPI 10 legacy (`initSession`, App-Token + User token cifrado), proxy server-side (el navegador nunca ve los tokens), Docker offline-friendly con `network_mode: host`, HTTPS opcional con Caddy para cámara en móviles.
