# 03 — Configuración de la app (`/config`)

Acceso: clave admin local (`ADMIN_PASSWORD`, failover si GLPI no responde) o
usuario GLPI con perfil administrador. Un único modal pide Usuario + Clave con
un check pequeño “login local” al pie. Todo lo guardado va a `./data/` en el
servidor: visible para todos los dispositivos.

Pestañas: **Conexión · Pisos y planos · Apariencia · Avanzada**.

## Conexión GLPI

Campos: GLPI Base URL, App-Token, User token (ver `02-glpi.md`; cuenta de servicio en uso: `horviz` #154, no borrar).
**Probar conexión** ejecuta `initSession` + `getMyProfiles` y muestra tus
perfiles y entidades. Si falla, ver `06-troubleshooting.md`.

## Pisos y planos

Cada piso vincula tres cosas:

1. **Nombre del piso** (ej. `4º Piso`) — botón Agregar para crear.
2. **Ubicación GLPI padre** — desplegable con el árbol completo de GLPI
   (`Polo… > Edificio Blanco > 4º Piso`, con IDs). Los puestos a dibujar
   serán **sus hijos directos**. Debajo se muestra `X/Y puestos dibujados`.
3. **Plano** — Subir/Reemplazar (JPG/PNG/WebP, máx 10MB). Se guarda en
   `./data/maps/` y se sirve en `/api/maps/[id]/image`. Los puestos se guardan
   en `%`, así que sobreviven al cambio de imagen en las mismas posiciones
   relativas (si el plano nuevo cambia la distribución, recalibrar).

Eliminar piso pide confirmación y borra plano + calibración (en GLPI no se
borra nada).

## Apariencia

- **Nombre de la herramienta** (header, título, PWA).
- **Color de acento** (botones, enlaces, insignias) con vista previa y
  restablecer a corporativo.
- **Logo** (PNG/JPG/WebP/SVG, máx 2 MB): se muestra en el header; si no hay o
  falla la carga, se mantiene el círculo con la inicial. También se usa como
  favicon e icono PWA (manifest dinámico). Botón para quitarlo.

## Avanzada

- **Conservar usuario asignado al mover un bien** (preferencia guardada; hoy la
  app nunca borra `users_id` al mover, así que el usuario se conserva por
  defecto).
- **Respaldo (Import/Export ZIP)**: Exportar descarga
  `glpi-move-backup-*.zip` con `floors.json` + `access.json` + imágenes (sin secretos).
  Importar **reemplaza todos** los pisos/puestos/planos y los accesos (doble confirmación),
  valida el esquema y limpia imágenes huérfanas.
