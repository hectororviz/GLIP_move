# GLPI Move — Control de bienes GLPI 10 con mapa de puestos (PWA)

App web instalable para registrar y consultar movimientos de bienes usando la
**API REST legacy de GLPI 10**. Portable: solo necesita red hacia GLPI.

```sh
cp .env.example .env   # ajustar GLPI_BASE_URL, CONFIG_KEY, ADMIN_PASSWORD
sh build-docker.sh && docker compose up -d   # http://localhost:3000
```

## Docs

- [`docs/01-instalacion.md`](docs/01-instalacion.md) — despliegue Docker, `.env`, red host, volúmenes.
- [`docs/02-glpi.md`](docs/02-glpi.md) — habilitar API, App-Token, User token, verificación manual.
- [`docs/03-configuracion.md`](docs/03-configuracion.md) — `/config`: conexión, planos por piso, vínculo a ubicación padre.
- [`docs/04-uso.md`](docs/04-uso.md) — Control, Búsqueda, Calibración (dibujar puestos), scanner Code128.
- [`docs/05-arquitectura.md`](docs/05-arquitectura.md) — stack, proxy y mapeos API, modelo `floors.json`, decisiones técnicas.
- [`docs/06-troubleshooting.md`](docs/06-troubleshooting.md) — tabla de errores y soluciones.

## Resumen funcional (primera prueba)

- **Control (`/mapa`):** planos por piso + hotspots = hijos GLPI, árbol de lugares navegable, sidebar con equipos, quitar/reemplazar/agregar por inventario o scan Code128 (tolerante a ceros). Quitar deja sin ubicación.
- **Búsqueda (`/buscar`):** por inventario/serie/nombre + filtro por tipo; ficha Tipo, Fabricante, Modelo, Inventario, Serie, Lugar, Usuario.
- **Calibración:** dibujar/mover/redimensionar puestos sobre el JPG, asignar hijo GLPI desde desplegable, guardado en servidor.
- **Auth GLPI 10 legacy** (`initSession`, App-Token + User token cifrado), proxy server-side, Docker offline-friendly con `network_mode: host`.
