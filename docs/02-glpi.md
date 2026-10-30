# 02 — GLPI 10: habilitar API, credenciales y perfiles

La app usa la **API REST legacy de GLPI 10** (`apirest.php`). GLPI 10 **no usa
OAuth** (eso es GLPI 11+); usa `initSession` con App-Token + User token (cuenta
de servicio) y Basic (login de operadores).

## 1. Habilitar la API

Como administrador GLPI: **Configuración → General → pestaña API** → `Enable Rest API = Yes`.

## 2. App-Token (cliente API)

**Configuración → API clients → + Add**: crea un cliente (nombre ej. `glpi-move`).
Anota el **App-Token** generado. Identifica a la aplicación; filtra por IP si
quieres restringir.

## 3. User token (clave de acceso remoto, cuenta de servicio)

Equivale a la contraseña del usuario técnico, solo para API. La app lo usa
para lecturas y como fallback interno:

1. **Administración → Usuarios** → abre el usuario técnico (o tu propio usuario
   para pruebas).
2. Campo **Remote access key** (clave de acceso remoto) → **Regenerar** si está
   vacío → copiar el valor. Ese es el **User token**.

El usuario técnico necesita perfil con permisos de **lectura y escritura en Assets**
(Computer, Monitor, Phone, etc.) y lectura en Locations/Users para que la app
pueda buscar, ver y mover equipos.

## 4. Perfiles para operadores y administradores de la app

La app autentica a cada persona con **su propio usuario y clave de GLPI**
(Basic → `initSession`; no requiere remote access key del operador):

| Rol en la app | Requisito en GLPI |
|---|---|
| Lectura (ver mapa, buscar) | Cualquier usuario válido |
| Editar (mover/quitar/reemplazar bienes, asignar ocupantes) | Perfil con **UPDATE** en inventario (Computer, Monitor, Phone, Printer, Peripheral, NetworkEquipment) + READ en Location/User. Por defecto: **Super-Admin, Admin** (configurable: `GLPI_OPERATOR_PROFILES`) |
| Acceso total = admin local (config, calibración, backup, logo) | Perfil **Super-Admin/Admin** (configurable: `GLPI_ADMIN_PROFILES`) |

Perfiles Technician, Hotliner, Supervisor u Observer son solo-lectura en
inventario por defecto → recibirán `403`. Sirve un perfil clonado con esos
derechos. GLPI es la autoridad final: si el PUT es rechazado, la app muestra
el error tal cual.

## 5. Cargarlo en la app

En `/config` (clave admin local o usuario GLPI admin):

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
