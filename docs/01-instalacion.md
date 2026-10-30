# 01 — Instalación y despliegue

## Requisitos

- Docker + Docker Compose (plugin `docker compose`).
- Node 20+ y npm solo si vas a compilar en el host (ver abajo).
- Red desde el equipo hacia la instancia GLPI (puerto 80/443).

> **Importante:** la imagen Docker **no instala dependencias de npm adentro**.
> Los contenedores de este entorno no tienen salida al registry de npm, así que
> se compila en el host y se empaqueta el resultado (`standalone`).
> Ver `build-docker.sh`.

## Puesta en marcha (primera vez)

```sh
cp .env.example .env   # editar valores (ver Variables)
sh build-docker.sh     # npm install + npm run build + docker compose build
docker compose up -d   # levanta la app
```

Abrir `http://localhost:3000` (o `http://<IP-del-equipo>:3000`).

Actualizar después de cambios de código:

```sh
sh build-docker.sh && docker compose up -d
```

## Variables (`.env`)

| Variable | Ejemplo | Para qué |
|---|---|---|
| `GLPI_BASE_URL` | `http://192.168.170.125` | URL base de GLPI 10, sin `/apirest.php`. Se puede cambiar luego en `/config` sin rebuild |
| `CONFIG_KEY` | cadena de 32+ caracteres | Clave AES-GCM para cifrar el User token guardado en `./data/config.json`. **Si la cambias, hay que re-cargar el token** |
| `ADMIN_PASSWORD` | `plain:clave-segura` | Clave admin local (failover si GLPI no responde). Formato `plain:...` (texto plano, solo entorno interno) |
| `GLPI_OPERATOR_PROFILES` | `Super-Admin,Admin` | Perfiles GLPI autorizados a editar (mover bienes, asignar ocupantes). Requieren UPDATE en inventario |
| `GLPI_ADMIN_PROFILES` | `Super-Admin,Admin` | Perfiles GLPI con acceso total (equivale a admin local). Se leen sin rebuild (reiniciar contenedor) |
| `PORT` | `3000` | Puerto donde escucha la app |

## Red: `network_mode: host`

El `docker-compose.yml` usa `network_mode: host` (sin mapeo de puertos).
Motivo: el bridge de Docker de este entorno **no llega a la LAN de GLPI**
(ni al registry npm); con red host el contenedor usa la red del equipo,
igual que el navegador. La app queda en `http://<IP-equipo>:${PORT}`.

Si en otro entorno el bridge sí tiene salida, puedes volver a `ports:` y
quitar `network_mode`.

## HTTPS para la cámara (teléfonos)

Los navegadores solo exponen la cámara en contexto seguro (`localhost` o
HTTPS). Para escanear desde teléfonos en la LAN, servir la app por HTTPS con
un reverse proxy en el equipo (ej. Caddy) hacia `http://localhost:3000`:

```sh
# ejemplo Caddy (puerto 443) con certificado autofirmado para la IP LAN:
# https://:443 {
#   tls /etc/caddy/certs/cert.pem /etc/caddy/certs/key.pem
#   reverse_proxy localhost:3000
# }
```

- El certificado debe tener SAN = IP LAN del equipo (y `localhost`).
- En cada teléfono: abrir `https://<IP-LAN>`, aceptar la advertencia una vez.
- Si la IP del equipo cambia (DHCP), regenerar el certificado.
- Limitaciones del autofirmado: advertencia en cada teléfono; la instalación
  como PWA puede fallar. Alternativa sin fricción: dominio + Cloudflare Tunnel.
- Sin HTTPS, el escáner muestra aviso y queda el ingreso manual / lector BT.

## Permisos del volumen `./data`

El compose corre con `user: "${UID:-1000}:${GID:-1000}"` para poder escribir
en `./data` (config, planos). En producción con volumen nominal de Docker
puedes quitar esa línea (la imagen ya trae `USER app`).

Contenido de `./data` (no commitear nada de aquí):

```
data/
  config.json   # credenciales y ajustes (App-Token plano, User token cifrado)
  floors.json   # pisos, vínculo a ubicación GLPI, puestos calibrados
  maps/         # JPG/PNG/WebP de los planos subidos desde /config
  brand/        # logo PNG subido desde Apariencia
```

Respaldo portable: `/config` → Avanzada → Exportar ZIP (`floors.json` +
imágenes; sin secretos).

## Comandos útiles

```sh
docker compose up -d        # levantar
docker compose logs --tail=50
docker compose down         # bajar
curl http://localhost:3000/api/maps     # debe dar {"floors":[...]}
curl http://localhost:3000/api/config   # muestra qué hay configurado (sin secretos)
```
