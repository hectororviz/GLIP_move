# 06 — Troubleshooting

| Síntoma | Causa | Solución |
|---|---|---|
| `Falta el App-Token…` / `Falta el User token…` | Credencial no guardada | Cargar ambas en `/config` → Guardar (ver `02-glpi.md`). Los `●` confirman |
| Guardar en `/config` no persiste / `405` | Ruta prerenderizada estática (ya corregido con `force-dynamic`) | Si reaparece: verificar `export const dynamic` en la ruta y rebuild |
| `Fallo: fetch failed` en Probar | El contenedor no llega a GLPI | Ver red: `network_mode: host` en compose; probar `curl http://GLPI/apirest.php/initSession` desde el host y con `docker exec … node -e "fetch(...)"` |
| `401` en Probar | Token inválido | Sin espacios (se hace trim igual), regenerar App-Token/User token |
| `EACCES ... /app/data` | Volumen bindeado con otro dueño | Compose usa `user: UID:GID`; verificar `id -u` y perms de `./data` |
| `npm error Exit handler never called!` | npm 10 en Alpine | No instalar dentro del contenedor: usar `build-docker.sh` (base `node:20-slim`) |
| `sh: next: not found` en build Docker | `node_modules` incompleto por el error anterior | Ídem: compilar en host, la imagen solo copia `standalone` |
| Mapa vacío / `Sin pisos` | No hay pisos o sin imagen/padre | `/config`: crear piso, elegir padre GLPI, subir plano |
| Puesto vacío en sidebar | Sin activos con ese `locations_id` | Verificar en GLPI que los equipos tengan esa ubicación; el filtro es exacto |
| Búsqueda sin resultados | Inventario con formato distinto | Probar con/sin ceros, nombre o serie; revisar `otherserial` real en GLPI |
| Cámara no abre | Permisos / no-HTTPS | Solo `localhost` o HTTPS; alternativa: lector BT/USB (modo teclado) |
| Scroll horizontal en mapa | Imagen panorámica expandía el grid | Corregido (`min-w-0` + `overflow-x-clip`); si reaparece, indicar piso y viewport (F12) |
| Scroll horizontal en sidebar | Nombres largos de ubicaciones | Corregido (wrap + `overflow-x-hidden`); si reaparece, indicar texto exacto |

## Logs rápidos

```sh
docker compose logs --tail=50
# error GLPI directo (código + mensaje GLPI):
curl "http://localhost:3000/api/glpi?q=XXX&type=all"
```
