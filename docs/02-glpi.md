# 02 — GLPI 10: habilitar API y credenciales

La app usa la **API REST legacy de GLPI 10** (`apirest.php`). GLPI 10 **no usa
OAuth** (eso es GLPI 11+); usa `initSession` con App-Token + User token.

## 1. Habilitar la API

Como administrador GLPI: **Configuración → General → pestaña API** → `Enable Rest API = Yes`.

## 2. App-Token (cliente API)

**Configuración → API clients → + Add**: crea un cliente (nombre ej. `glpi-move`).
Anota el **App-Token** generado. Identifica a la aplicación; filtra por IP si
quieres restringir.

## 3. User token (clave de acceso remoto)

Equivale a la contraseña del usuario técnico, solo para API:

1. **Administración → Usuarios** → abre el usuario técnico (o tu propio usuario
   para pruebas).
2. Campo **Remote access key** (clave de acceso remoto) → **Regenerar** si está
   vacío → copiar el valor. Ese es el **User token**.

El usuario necesita perfil con permisos de **lectura y escritura en Assets**
(Computer, Monitor, Phone, etc.) y lectura en Locations/Users para que la app
pueda buscar, ver y mover equipos.

## 4. Cargarlo en la app

En `/config` (clave = `ADMIN_PASSWORD` del `.env`):

- GLPI Base URL → ej. `http://192.168.170.125`
- App-Token → pegar
- User token → pegar → **Guardar** → **Probar conexión**

Debe responder `OK. Perfiles: [...]`. Los indicadores `● guardado` confirman
qué quedó persistido (el formulario se vacía por seguridad tras guardar).

## Verificación manual (opcional, desde terminal)

```sh
# initSession: debe devolver {"session_token":"..."}
curl -s -H "Authorization: user_token TU_USER_TOKEN" \
        -H "App-Token: TU_APP_TOKEN" \
        -H "Content-Type: application/json" \
        http://192.168.170.125/apirest.php/initSession

# con el session_token: lista de ubicaciones
curl -s -H "Session-Token: SESSION_TOKEN" -H "App-Token: TU_APP_TOKEN" \
     "http://192.168.170.125/apirest.php/Location/?range=0-5"
```
