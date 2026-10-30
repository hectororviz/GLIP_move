# 03 — Configuración de la app (`/config`)

Requiere login admin local (clave `ADMIN_PASSWORD`). Todo lo guardado va a
`./data/` en el servidor: visible para todos los dispositivos.

## Conexión GLPI

Campos: GLPI Base URL, App-Token, User token (ver `02-glpi.md`).
**Probar conexión** ejecuta `initSession` + `getMyProfiles` y muestra tus
perfiles y entidades. Si falla, ver `06-troubleshooting.md`.

## Planos por piso

Cada piso vincula tres cosas:

1. **Nombre del piso** (ej. `4º Piso`) — botón Agregar para crear.
2. **Ubicación GLPI padre** — desplegable con el árbol completo de GLPI
   (`Polo… > Edificio Blanco > 4º Piso`, con IDs). Los puestos a dibujar
   serán **sus hijos directos**. Debajo se muestra `X/Y puestos dibujados`.
3. **Plano** — Subir/Reemplazar (JPG/PNG/WebP, máx 10MB). Se guarda en
   `./data/maps/` y se sirve en `/api/maps/[id]/image`.

Eliminar piso pide confirmación y borra plano + calibración (en GLPI no se
borra nada).
