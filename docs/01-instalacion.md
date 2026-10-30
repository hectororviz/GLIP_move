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
| `ADMIN_PASSWORD` | `plain:clave-segura` | Clave de la pantalla `/config`. Formato `plain:...` (texto plano, solo entorno interno) |
| `PORT` | `3000` | Puerto donde escucha la app |

## Red: `network_mode: host`

El `docker-compose.yml` usa `network_mode: host` (sin mapeo de puertos).
Motivo: el bridge de Docker de este entorno **no llega a la LAN de GLPI**
(ni al registry npm); con red host el contenedor usa la red del equipo,
igual que el navegador. La app queda en `http://<IP-equipo>:${PORT}`.

Si en otro entorno el bridge sí tiene salida, puedes volver a `ports:` y
quitar `network_mode`.

## Permisos del volumen `./data`

El compose corre con `user: "${UID:-1000}:${GID:-1000}"` para poder escribir
en `./data` (config, planos, calibración) cuando está bindeado al host.
En producción con volumen nominal de Docker puedes quitar esa línea
(la imagen ya trae `USER app`).

Contenido de `./data` (no commitear el `config.json` real):

```
data/
  config.json   # credenciales y ajustes (App-Token plano, User token cifrado)
  floors.json   # pisos, vínculo a ubicación GLPI, puestos calibrados
  maps/         # JPG/PNG/WebP de los planos subidos desde /config
```

## Comandos útiles

```sh
docker compose up -d        # levantar
docker compose logs --tail=50
docker compose down         # bajar
curl http://localhost:3000/api/maps     # debe dar {"floors":[...]}
curl http://localhost:3000/api/config   # muestra qué hay configurado (sin secretos)
```
