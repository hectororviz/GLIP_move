# 04 — Uso diario

Lectura libre sin login. La primera acción de edición abre el modal de login
(usuario GLPI, o check “login local” para la clave admin); tras entrar, la
acción pendiente se ejecuta sola. La barra lateral muestra el usuario y “Salir”.

## Control por piso (`/mapa`)

1. El plano es protagonista: toolbar compacta (piso + **Herramientas** colapsable
   en móvil, siempre visible en escritorio), leyenda de una línea con conteos y
   tooltips, controles de zoom táctiles (44 px). Búsqueda en plano, capas
   (puestos/números/estados) y filtro por estado dentro de Herramientas.
2. Selector de piso (botones hasta 5 pisos, desplegable si hay más) + panel
   **Lugares**: árbol Polo → pisos → puestos.
   - Piso con mapa lleva badge `mapa` y contador `X/Y puestos`; clic → abre su plano.
   - Puesto dibujado → clic abre su ficha aunque esté en otro piso (cambia de plano solo).
   - `(sin dibujar)` = hijo de GLPI aún no calibrado.
3. En el plano: zoom rueda/pinch, clic en un puesto → ficha consulta-primero
   (nombre, estado, piso, ubicación GLPI, interno; ocupante; bienes con tipo,
   nombre, inventario, modelo/serie). En móvil la ficha es hoja inferior que
   se cierra sin mover el zoom. La etiqueta muestra el número corto y centrado
   (`Puesto 23` → `23`); el nombre completo queda en el tooltip.
4. Por equipo: el nombre abre su **ficha del componente de Búsqueda**
   (conservar/retornar al puesto); **Editar en GLPI** (pestaña nueva),
   **Reemplazar (scan)** y **Desvincular** (deja `locations_id=0`, pide
   confirmación) viven en **Administrar puesto y equipos** (cerrado,
   solo operadores). (La asignación a persona se hace desde Búsqueda.)
5. **Ocupante**: asignar/cambiar con buscador de usuarios GLPI (confirma
   cantidad de equipos afectados) o quitar (solo limpia `users_id`, conserva
   el puesto), todo dentro de Administrar. La ocupación se deriva de
   `users_id` en GLPI: sin directorio local duplicado. Regla general:
   asignar/quitar usuario nunca mueve ni saca del puesto; mover/sacar del
   puesto nunca toca el usuario. Debajo de cada ocupante aparecen sus
   **bienes personales** (asignados a ella, sin puesto), clicables hacia su
   ficha.
6. **Agregar por inventario** (en Administrar): tipear `0000012865`, `12865`,
   `A 0001-0537` o pegar URL de QR GLPI (Enter u OK), o botón 📷 para escanear
   (modal centrado). También vale lector Bluetooth (escribe en el campo como
   teclado). Si el bien es de otra persona o está en otro puesto, pide
   confirmación mostrando usuario y ubicación actuales (conserva su usuario al
   moverlo).
7. El bien recién agregado **destella en verde 5 s** en la ficha.
8. Tras asignar/quitar, la ficha se recarga desde GLPI.
9. **Ver en mapa** (desde Búsqueda): cambia de piso si hace falta, centra con
   zoom sobre el puesto y lo destella.

## Búsqueda (`/buscar`)

Buscador único con 5 acordeones colapsables: **🖥️ Equipos, 👤 Personas, 🏢 Áreas, ✉️ Correos, 📁 Carpetas**.
Una sola caja (ej. `CTIC`, `0000012865`, `ventas@`, `\\srv`): muestra el conteo por categoría y el total; la primera categoría con resultados se auto-expande. En escritorio los resultados son **tablas compactas**; en móvil son **tarjetas táctiles** (equipo: icono + nombre + inventario, ubicación, usuario, serie + Detalle ›). Abrir un resultado muestra un **panel lateral**: drawer derecho de 600–720 px en escritorio, pantalla completa en móvil. Al volver se conserva búsqueda, categoría expandida y posición de scroll.
Panel de equipo = consulta primero: nombre destacado + tipo como badge, **Información general** (tipo, nombre, inventario, serie con copiado rápido, modelo/fabricante/estado si GLPI los devuelve, con entidades HTML decodificadas), **Ubicación actual** destacada y **Usuario asignado** (con "Ver ficha →" que abre la persona y permite volver). Las opciones de edición viven en **Administrar equipo** (acordeón cerrado, solo operadores): Cambiar ubicación, Modificar usuario, Desvincular del puesto, Quitar usuario; sin permiso la sección se oculta sin avisos. Toda acción destructiva pide confirmación y muestra su estado; cerrar con cambios sin aplicar también confirma. Panel de persona = datos + **Equipos asignados** como lista estructurada por puesto (icono, nombre clicable, inventario + "Ver equipo", con retorno), accesos si corresponde y **Administrar asignaciones** (acordeón cerrado, solo operadores). Correo/carpeta/área: datos + personas/recursos + link a `/accesos` + botón Excel.

- Equipos y Personas: lectura libre (editar exige login, como antes). Orden equipos: URL GLPI directa → inventario (con/sin ceros, letra-serie) → nombre → serie. 📷 escanea y busca directo. `?q=` linkeable.
- Áreas/Correos/Carpetas: **🔒 solo operador** (sin login muestran candado + botón Iniciar sesión; el backend `GET /api/search` solo los incluye con `isOperator()`). Match contiene-insensible (tildes, mayúsculas) en nombre/dirección/ruta/área/responsable.

## Calibración de puestos (`/mapa?calibrar=1[&floor=...]`)

**Solo admin** (clave local o GLPI admin): sin sesión muestra solo el login;
por URL directa también bloquea.

Requiere que el piso tenga **ubicación GLPI padre** y **plano** (si no, la
pantalla lo indica con link a `/config`).

1. Usa **🖐️ Navegar** para moverte con zoom (rueda/pinch o botones +/−/⤾)
   y encuadrar la zona con precisión; cambia a **✏️ Dibujar** y
   **arrastra sobre el plano** para crear un rectángulo.
2. Al soltar (o clic derecho sobre el rectángulo) se abre un **menú contextual**
   con los puestos hijos disponibles → al elegir uno queda **asignado y
   guardado en servidor** automáticamente (sin botón Asignar).
3. Clic derecho sobre un puesto dibujado → menú para **reasignarlo** a otro
   hijo (también auto-guardado).
4. **Arrastrar un rectángulo lo mueve**; la **esquina inferior derecha lo
   redimensiona**; la lista inferior permite **borrar**. Estos cambios usan
   **Guardar en servidor** (`N` puestos).
5. Contador `dibujados/hijos` indica el avance. Un puesto no puede dibujarse dos
   veces en el mismo piso.

## Escaneo

- Formatos: **Code128 de 10 dígitos** (`0000012865` ⇄ `12865`), **letra-serie**
  (`A 0001-0537`; GLPI lo guarda como `A-001-0045` y la app mapea ambas formas)
  y **QR con link GLPI** (`…/front/computer.form.php?id=199` → directo por tipo+id).
- Cámara: modal centrado, librería ZXing (requiere HTTPS o localhost). Si la
  cámara falla, muestra el motivo exacto + Reintentar; siempre queda el input
  manual / lector BT.

## Movimiento masivo (`/masivo`)

Solo a puesto (v1, sin modo usuario). **Solo visible/usable con sesión de perfil
operador**: nav y card de inicio muestran 🔒 sin permiso, y la ruta directa
muestra pantalla de acceso restringido + botón Iniciar sesión. El backend igual
exige operador en `PATCH /api/glpi` (401/403).

1. **Destino**: piso (solo pisos con mapa) + combobox de puestos con filtro
   (nombre, interno o id). Al elegir muestra resumen `Destino: piso · puesto
   (+ id)` con botón Cambiar; las filas "ya está ahí" se recalculan solas.
2. **Escaneo en ráfaga (modal)**: botón **📷 Escanear** abre modal con la cámara;
   botón **Cerrar** (o Esc/backdrop) la cierra y libera el hardware. Cada lectura
   da destello verde + beep + suma un renglón sin cerrar el modal. Cooldown
   anti-doble lectura y aviso amarillo + sonido grave si es duplicado. Input
   manual y lector BT agregan igual (Enter o Agregar) sin abrir el modal.
3. **Lista**: tabla compacta en escritorio, tarjetas en móvil (nombre e
   inventario destacados, ubicación, estado con texto + badge, ✕ para quitar).
   Estados: `buscando / listo / duplicado / ya-ahí / no-existe / error /
   moviendo / movido / falló` (siempre con texto, no solo color). Limpiar
   pide confirmación.
4. **Recuento por tipo**: badges con icono de tipo `×N` + `Total listos: N`
   (solo cuentan `listo`, lo movible).
5. **Confirmar** (barra inferior sticky con safe-area): muestra destino +
   cantidad y pide confirmación con alcance real (conserva usuarios, registra
   en Actividad, no deshace en lote). Ejecuta PATCH secuencial con progreso
   `i/N`; fallidos quedan en `falló` para re-confirmar. `Nuevo lote` limpia
   movidos/ya-ahí. Sin doble ejecución (botón bloqueado en curso).
