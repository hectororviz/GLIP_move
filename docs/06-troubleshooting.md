# 06 — Troubleshooting

| Síntoma | Causa | Solución |
|---|---|---|
| `Falta el App-Token…` / `Falta el User token…` | Credencial no guardada | Cargar ambas en `/config` → Guardar (ver `02-glpi.md`). Los `●` confirman |
| Guardar en `/config` no persiste / `405` | Ruta prerenderizada estática (ya corregido con `force-dynamic`) | Si reaparece: verificar `export const dynamic` en la ruta y rebuild |
| `Fallo: fetch failed` en Probar | El contenedor no llega a GLPI | Ver red: `network_mode: host` en compose; probar `curl http://GLPI/apirest.php/initSession` desde el host y con `docker exec … node -e "fetch(...)"` |
| `401` en Probar | Token inválido | Sin espacios (se hace trim igual), regenerar App-Token/User token |
| `401 Inicia sesión para editar` | Sin sesión al editar | Entrar con usuario GLPI (u operador) o clave local vía el modal |
| `403 Tu perfil no tiene permiso` | Perfil GLPI sin UPDATE en inventario | Usar Super-Admin/Admin o clonar perfil con esos derechos (ver `02-glpi.md`); revisar `GLPI_OPERATOR_PROFILES` |
| Calibración pide login / bloqueada | Requiere admin | Clave local o usuario GLPI Super-Admin/Admin (`GLPI_ADMIN_PROFILES`) |
| `EACCES ... /app/data` | Volumen bindeado con otro dueño | Compose usa `user: UID:GID`; verificar `id -u` y perms de `./data` |
| `npm error Exit handler never called!` | npm 10 en Alpine | No instalar dentro del contenedor: usar `build-docker.sh` (base `node:20-slim`) |
| `sh: next: not found` en build Docker | `node_modules` incompleto por el error anterior | Ídem: compilar en host, la imagen solo copia `standalone` |
| Mapa vacío / `Sin pisos` | No hay pisos o sin imagen/padre | `/config`: crear piso, elegir padre GLPI, subir plano |
| Puesto vacío en sidebar | Sin activos con ese `locations_id` | Verificar en GLPI que los equipos tengan esa ubicación; el filtro es exacto |
| Búsqueda sin resultados | Inventario con formato distinto o texto sin match | Probar con/sin ceros, forma con letra (`A 0001-0537`), nombre, serie o sigla de área (ej. `CTIC`); revisar `otherserial` real en GLPI. Ojo: el código de barras puede no existir (`A 0001-0045` no existe si la serie salta de `0445` a `0450`). El buscador es contiene-insensible (tildes/mayúsculas) con tope 20/categoría |
| Acordeones de Áreas/Correos/Carpetas con 🔒 | Sin sesión operadora | Entrar con usuario GLPI operador (`GLPI_OPERATOR_PROFILES`) o clave local vía el modal; equipos/personas siguen visibles sin login |
| Excel exporta 401/403 | Sin sesión operadora | Mismo gate que accesos: iniciar sesión con perfil operador y reintentar |
| Ubicación muestra solo el piso | Bien directamente en el piso (sin puesto) | Es esperado: sale badge `Sin puesto`. Si debería tener puesto, moverlo desde Editar → Piso → Puesto |
| Editar no lista un puesto | Se mira otro piso o filtro activo | Cambiar el desplegable Piso (solo pisos con mapa) y limpiar el filtro por nombre/interno/id; si falta PB, crearlo en /config → Pisos y planos |
| `A 0001-XXXX` no encuentra | GLPI lo guarda como `A-001-XXXX` | La app ya mapea ambas formas; si falla, buscar `A-001-XXXX` directo para confirmar que existe |
| Cámara no abre | Permisos / no-HTTPS | Solo `localhost` o HTTPS (ver `01-instalacion.md`); alternativa: lector BT/USB (modo teclado) |
| Cámara negra / “no entrega imagen” | Otra pestaña/app con la cámara, o stream vacío | Cerrar otras pestañas/apps con cámara; Reintentar (libera streams); el aviso muestra el motivo exacto |
| QR GLPI no resuelve | URL con tipo desconocido o id inexistente | Caen al flujo normal; verificar `…/front/<tipo>.form.php?id=` y que el bien exista |
| “Ver en mapa” no centra | Piso distinto / imagen cargando / móvil lento | Reintenta solo hasta ~6 s (cambio de piso + carga de imagen); si persiste, anotar consola (F12) |
| Scroll interior en sidebar | Layout viejo en caché | Ctrl+F5: el layout actual usa un solo scroll de página con mapa fijo |
| Import ZIP falla | ZIP sin `floors.json` válido o >50 MB | Revisar mensaje exacto; los datos actuales quedan intactos. `access.json` es opcional (backups viejos importan igual) |
| Logo no aparece en header | `brandIcon` no refrescado / caché | Recargar (Ctrl+F5); el header re-lee config al enfocar; quitar caché del icono es `no-store` |

## Logs rápidos

```sh
docker compose logs --tail=50
# error GLPI directo (código + mensaje GLPI):
curl "http://localhost:3000/api/glpi?q=XXX&type=all"
# respaldo:
curl -b cookies.txt -o backup.zip http://localhost:3000/api/backup
```
