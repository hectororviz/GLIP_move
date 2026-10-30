# 04 — Uso diario

## Control por piso (`/mapa`)

1. Selector de piso + panel **Lugares**: árbol Polo → pisos → puestos.
   - Piso con mapa lleva badge `mapa` y contador `X/Y puestos`; clic → abre su plano.
   - Puesto dibujado → clic abre su sidebar aunque esté en otro piso (cambia de plano solo).
   - `(sin dibujar)` = hijo de GLPI aún no calibrado.
2. En el plano: zoom rueda/pinch, clic en un puesto → sidebar con sus equipos
   (PC, monitor, teléfono, etc.).
3. Por equipo: **Quitar** (deja `locations_id=0`, sin ubicación, pide
   confirmación) o **Reemplazar (scan)** (quita el viejo y asigna el nuevo).
4. **Agregar por inventario**: tipear `0000012865` o `12865` (tolerante a ceros,
   Enter u OK) o botón 📷 para escanear con la cámara. También vale lector
   Bluetooth (escribe en el campo como teclado).
5. Tras asignar/quitar, la sidebar se recarga desde GLPI.

## Búsqueda (`/buscar`)

- Campo libre + chips por tipo (Todos/PC/Monitor/Teléfono/...).
- Botón 📷: escanea el Code128 y busca directo.
- Orden de búsqueda: N° inventario (`otherserial`, con/sin ceros) → nombre → serie.
- Ficha por equipo: **Tipo, Fabricante, Modelo, Inventario, Serie, Lugar,
  Usuario** (+ link `Ver en mapa →` si tiene ubicación; si solo tiene usuario,
  muestra `sin ubicación` y el link deshabilitado).

## Calibración de puestos (`/mapa?calibrar=1[&floor=...]`)

Requiere que el piso tenga **ubicación GLPI padre** y **plano** (si no, la
pantalla lo indica con link a `/config`).

1. Usa **🖐️ Navegar** para moverte con zoom (rueda/pinch o botones +/−/⤾)
   y encuadrar la zona con precisión; cambia a **✏️ Dibujar** y
   **arrastra sobre el plano** para crear un rectángulo.
2. En el panel, elige la ubicación en el desplegable (**solo hijos del piso**)
   → **Asignar**. El hotspot toma el **nombre de GLPI**.
3. **Arrastrar un rectángulo lo mueve**; la **esquina inferior derecha lo
   redimensiona**; la lista inferior permite **borrar**.
4. **Guardar en servidor** (`N` puestos). Sin guardar, los cambios se pierden.
   Requiere sesión admin (si expiró: `Inicia sesión admin en /config`).

Contador `dibujados/hijos` indica el avance. Un puesto no puede dibujarse dos
veces en el mismo piso.

## Escaneo Code128

- Etiquetas de **10 dígitos con ceros a la izquierda** (ej. `0000012865`).
- La app normaliza (`0000012865` ⇄ `12865`) y prueba variantes al buscar.
- Cámara: librería ZXing en el navegador (requiere HTTPS o localhost para
  acceder a la cámara). Lector BT/USB: funciona sin configurar (modo teclado).
