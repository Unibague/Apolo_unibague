# Guía de despliegue — WebExams (APOLO)

Despliegue del proyecto en un servidor Linux usando **Docker Compose**. Probado en Ubuntu 22.04 / Debian 12.

> **Última actualización:** Abril 2026 — refleja la arquitectura actual con WebSockets (socket.io), scheduler de exámenes, rutas API relativas y Firebase opcional.

---

## Arquitectura

```
                    ┌──────────────────────┐
                    │  Internet (80/443)   │
                    └──────────┬───────────┘
                               │
                       ┌───────▼────────┐
                       │  Nginx (host)  │  ← maneja SSL con certbot
                       └───────┬────────┘
                               │  proxy_pass
                               │  127.0.0.1:3090
            ╭──────────────────┴──────────────────╮
            │       Docker Compose stack          │
            │  ┌────────────────────────────────┐ │
            │  │  Nginx interno (puerto 80)     │ │
            │  │  • sirve client/dist (estático)│ │
            │  │  • proxy a APIs internas       │ │
            │  │  • proxy WebSocket /socket.io/ │ │
            │  └──┬───────┬─────────┬───────────┘ │
            │     │       │         │             │
            │  ┌──▼──┐ ┌──▼──┐  ┌──▼─────┐        │
            │  │users│ │exams│  │attempts│        │
            │  │3000 │ │3001 │  │  3002  │        │
            │  └──┬──┘ └──┬──┘  └────┬───┘        │
            │     │       │          │            │
            │     └───────┼──────────┘            │
            │             │                       │
            │      ┌──────▼─────┐                 │
            │      │ PostgreSQL │ ← volume persistente
            │      │     16     │                 │
            │      └────────────┘                 │
            ╰─────────────────────────────────────╯
                  ↑                ↑
                  │                │
          postgres_data      uploads_data
            (volume)         (volume — imágenes/PDFs)
```

**Componentes:**
- 3 microservicios Node 20 + Express + TypeORM (Users `:3000`, Exams `:3001`, ExamsAttempts `:3002`)
- 1 frontend React/Vite (build estático servido por Nginx interno)
- 1 PostgreSQL 16 (una instancia, 3 bases de datos lógicas — una por microservicio)
- 2 Nginx (uno interno al stack, uno en el host con SSL)
- **WebSockets** (socket.io) para monitoreo de exámenes en tiempo real (ExamsAttempts)
- **Scheduler** automático en Exams para gestionar estados de exámenes

**Lo único que se instala en el host:** Docker, Node (para hacer build del front), Nginx, certbot.

---

## Cómo funciona el enrutamiento de APIs

El frontend usa **rutas relativas** (`/api/users`, `/api/exams`, `/api/exam`). Esto significa:

| Entorno | Quién hace el proxy | Configuración |
|---|---|---|
| **Desarrollo** (Vite) | `vite.config.ts` → `server.proxy` | `/api/users` → `localhost:3000`, `/api/exams` → `localhost:3001`, `/api/exam` → `localhost:3002` |
| **Producción** (Docker) | Nginx interno → `client/nginx.conf` (bakeado en la imagen `apolo-frontend`) | `/api/users/` → `apolo-users:3000`, `/api/exams/` → `apolo-exams:3001`, `/api/exam/` → `apolo-attempts:3002` |

**Regla de nombres importante:** `/api/exams/` (plural) → servicio Exams. `/api/exam/` (singular) → servicio ExamsAttempts.

**WebSocket:** socket.io se conecta al origen actual del frontend. Nginx enruta `/socket.io/` al servicio `attempts:3002` con upgrade de protocolo a WebSocket.

> Las variables `VITE_USERS_BASE`, `VITE_EXAMS_BASE` y `VITE_ATTEMPTS_BASE` existen como override opcional, pero **NO deben definirse en el deploy con Docker** — el proxy de Nginx se encarga de todo.

---

## Quick start (deploy completo en ~10 minutos)

```bash
# 1. En el servidor: clona y prepara
git clone <url-de-tu-repo> /opt/webexams
cd /opt/webexams
bash deploy/setup-server.sh                  # instala Docker, Node, Nginx, certbot
# Cierra y reabre la sesión SSH para que el grupo docker tenga efecto

# 2. Configura secrets
cp .env.example .env
nano .env                                    # pon tus credenciales reales

# 3. Prepara el client/.env para producción (ver sección 4.1)
nano client/.env                             # quita VITE_USERS_BASE, configura Firebase

# 4. Deploy
make deploy                                  # build + frontend + up

# 5. Nginx del host + SSL
sudo cp deploy/nginx-host.conf.example /etc/nginx/sites-available/webexams
sudo nano /etc/nginx/sites-available/webexams   # reemplaza tu-dominio.com
sudo ln -sf /etc/nginx/sites-available/webexams /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d tu-dominio.com
```

Listo. La app debería estar accesible en `https://tu-dominio.com`.

---

## 1. Preparar el servidor

```bash
git clone <url-de-tu-repo> /opt/webexams
cd /opt/webexams
bash deploy/setup-server.sh
```

El script instala: Docker Engine + Compose plugin, Node.js 20, Nginx, certbot, git, make.

**Importante:** después de correr el script, cierra y reabre tu sesión SSH. El usuario actual queda en el grupo `docker` solo después de ese reinicio de sesión.

---

## 2. Configurar variables de entorno

Copia el template y edítalo:

```bash
cd /opt/webexams
cp .env.example .env
nano .env
```

**Variables que DEBES cambiar:**

| Variable | Cómo generar |
|---|---|
| `DB_PASS` | `openssl rand -hex 16` |
| `JWT_SECRET` | `openssl rand -hex 64` |
| `SERVICE_SECRET` | `openssl rand -hex 32` |
| `FRONTEND_URL` | tu dominio, ej. `https://exams.unibague.edu.co` |
| `RESEND_API_KEY` + `SMTP_FROM` | ver sección **4.3** |
| `FIREBASE_*` | ver sección **4.1** |

> `.env` está en `.gitignore` — nunca se sube al repo.

### Cómo llegan las variables de entorno a los servicios

Hay **dos mecanismos** de configuración y en Docker **solo uno importa**:

1. **Archivos `config/.env.production`** dentro de cada servicio — existen como template de referencia, pero **en Docker se ignoran** porque docker-compose inyecta las variables directamente al container via la sección `environment:`.
2. **`docker-compose.yml` → `environment:`** — toma las variables del `.env` raíz y las inyecta en cada container. **Este es el que manda en producción.**

⚠️ **No necesitas editar los archivos `server/*/config/.env.production`** para el deploy con Docker. Solo edita el `.env` de la raíz del proyecto.

---

## 3. Hacer el deploy

```bash
make deploy
```

Eso ejecuta tres pasos:
1. **`make frontend-build`** → instala deps de `client/` y corre `npm run build` (genera `client/dist/`)
2. **`make build`** → construye las imágenes Docker de los 3 microservicios
3. **`make up`** → levanta el stack (postgres + 3 servicios + nginx interno)

Verifica que todo está corriendo:

```bash
make ps        # debe mostrar 5 containers en estado "Up" (sano)
make logs      # logs en vivo de todos los servicios
```

En el primer arranque (volumen de Postgres vacío), la imagen crea automáticamente la BD `USERS_DB_NAME` (vía `POSTGRES_DB`), y [docker/postgres-init/01-databases.sh](docker/postgres-init/01-databases.sh) crea las otras 2 (`EXAMS_DB_NAME`, `ATTEMPTS_DB_NAME`). TypeORM (con `synchronize: true`) crea las tablas desde las entidades.

⚠️ Ese script de init **solo corre la primera vez**, con el volumen `apolo_postgres_data` vacío. Si ya tienes un volumen existente al que le faltan `EXAMS_DB_NAME` o `ATTEMPTS_DB_NAME`, créalas a mano una vez: `make shell-postgres` → `CREATE DATABASE nombre_db;`.

---

## 4. Configuración de servicios externos

### 4.1. Firebase (login con Google)

Firebase Auth se usa **solo** para login con cuenta de Google. Si no lo configuras, el resto de la aplicación sigue funcionando normalmente — el login con email/contraseña no depende de Firebase.

> El código maneja la ausencia de Firebase de forma segura: si las variables no están configuradas, el botón de Google se desactiva automáticamente pero la app no crashea.

#### Crear el proyecto Firebase

1. Entra a [https://console.firebase.google.com](https://console.firebase.google.com).
2. Crea un proyecto (o usa uno existente).
3. **Authentication → Sign-in method**: habilita **Google**.
4. **Authentication → Settings → Authorized domains**: agrega `tu-dominio.com`.

#### Credenciales del cliente (frontend)

**Project settings → General → Your apps → Web app** → copia la config y pégala en [client/.env](client/.env):

```env
VITE_FIREBASE_API_KEY=AIza...
VITE_FIREBASE_AUTH_DOMAIN=tu-proyecto.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=tu-proyecto
VITE_FIREBASE_STORAGE_BUCKET=tu-proyecto.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abc123
```

⚠️ **MUY IMPORTANTE para producción:** el archivo `client/.env` actualmente tiene una línea `VITE_USERS_BASE=http://localhost:3000`. **Debes ELIMINAR esa línea** (o dejarla vacía) para el deploy con Docker, de lo contrario el frontend intentará llamar directamente a `localhost:3000` en vez de usar el proxy de Nginx.

```env
# ❌ MALO para producción — el navegador del usuario no puede llegar a localhost:3000
VITE_USERS_BASE=http://localhost:3000

# ✅ CORRECTO — no definir la variable, Nginx se encarga del proxy
# (simplemente borra la línea o déjala vacía)
```

Luego rebuilda el frontend: `make frontend-build`.

> Estas claves son **públicas por diseño**. La seguridad de Firebase la da el "authorized domain", no el secreto de las claves.

#### Credenciales del backend (Admin SDK)

**Project settings → Service accounts → Generate new private key** descarga un JSON.

Extrae los 3 campos al archivo `.env` del root:

```env
FIREBASE_PROJECT_ID=tu-proyecto
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@tu-proyecto.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvwI...\n-----END PRIVATE KEY-----\n"
```

⚠️ **Críticos al pegar `FIREBASE_PRIVATE_KEY`:**
- Mantén las comillas dobles `"..."` que envuelven todo
- Mantén los `\n` como dos caracteres literales (NO los reemplaces por saltos de línea reales)

Después: `make restart` para que Users tome los nuevos valores.

#### Eliminar Firebase (alternativa)

Si NO quieres login con Google, simplemente no configures las variables de Firebase. El sistema detecta su ausencia y desactiva el botón de Google automáticamente. No necesitas modificar código.

---

### 4.2. URL del email de calificaciones

El servicio de email (`EmailService.ts` en ExamsAttempts) tiene **hardcodeada** la URL de Vercel antigua en el cuerpo del email:

```
https://apolo-tau-roan.vercel.app
```

**Debes actualizar esa URL** a tu dominio de producción editando el archivo:
[server/ExamsAttempts/src/services/EmailService.ts](server/ExamsAttempts/src/services/EmailService.ts)

Busca la línea con `apolo-tau-roan.vercel.app` y reemplázala por tu dominio real. Después: `make build && make up`.

---

### 4.3. Resend (envío de calificaciones por email)

Resend manda automáticamente los resultados a los estudiantes al finalizar un examen.

#### Obtener API key

1. Crea cuenta en [https://resend.com](https://resend.com) — gratis 3000 emails/mes.
2. **Domains** → verifica tu dominio creando los registros DNS que te indica (SPF, DKIM, MX).
3. **API Keys → Create API Key**, copia el valor `re_xxxxxxxx`.

> Sin dominio verificado solo puedes enviar desde `onboarding@resend.dev` (útil para pruebas, no para prod).

#### Configurar

En `.env` del root del proyecto:

```env
RESEND_API_KEY=re_TU_API_KEY_AQUI
SMTP_FROM=noreply@tu-dominio-verificado.com
```

Después: `make restart`.

---

## 5. Nginx del host + SSL

El stack Docker expone el Nginx interno en el puerto `3090`. El Nginx del host le hace proxy y maneja SSL con certbot.

```bash
# Instalar config
sudo cp deploy/nginx-host.conf.example /etc/nginx/sites-available/webexams
sudo nano /etc/nginx/sites-available/webexams   # reemplaza tu-dominio.com (2 lugares)
sudo ln -sf /etc/nginx/sites-available/webexams /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# Validar y recargar
sudo nginx -t && sudo systemctl reload nginx

# SSL gratis con Let's Encrypt
sudo certbot --nginx -d tu-dominio.com -d www.tu-dominio.com
```

Certbot edita el archivo automáticamente, agrega el bloque `listen 443 ssl` y configura renovación automática.

### WebSockets y Nginx

La configuración del Nginx del host (`deploy/nginx-host.conf.example`) ya incluye soporte para WebSockets:

```nginx
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";
proxy_read_timeout 86400;
```

El Nginx interno (`client/nginx.conf`, bakeado en la imagen `apolo-frontend` por el `Dockerfile`) tiene un bloque específico para `/socket.io/` que hace proxy al servicio `apolo-attempts:3002`. **No necesitas configurar nada extra** para que los WebSockets funcionen.

### Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'   # 80 + 443
sudo ufw --force enable
```

Los puertos 3000–3002 y 5432 (PostgreSQL) **no** se exponen al exterior — solo viven en la red interna de Docker.

---

## Cosas importantes a tener en cuenta

### ⚠️ `synchronize: true` en TypeORM

Los 3 microservicios tienen `synchronize: true` en su `AppDataSource`. Esto significa que TypeORM **modifica automáticamente el esquema** de la BD al arrancar si detecta cambios en las entidades. 

- **Ventaja:** no necesitas correr migraciones manualmente.
- **Riesgo:** un cambio de modelo mal pensado puede borrar columnas o datos. **Haz backup antes de desplegar cambios que modifiquen entidades.**
- Para producción estable a largo plazo, considerar migrar a `synchronize: false` con migraciones de TypeORM.

### ⚠️ `client/.env` y las variables `VITE_*_BASE`

| Variable | ¿Definir en Docker? | Efecto si se define |
|---|---|---|
| `VITE_USERS_BASE` | **NO** | El frontend llama directamente a esa URL en vez de usar Nginx |
| `VITE_EXAMS_BASE` | **NO** | Igual — rompe el proxy |
| `VITE_ATTEMPTS_BASE` | **NO** | Igual — rompe el proxy |
| `VITE_FIREBASE_*` | **SÍ** | Necesarios para login con Google |

En producción con Docker, **solo** las variables `VITE_FIREBASE_*` deben estar definidas en `client/.env`.

### ⚠️ El `vercel.json` en client/

Existe un archivo `client/vercel.json` que es un vestigio del deploy anterior en Vercel. **No afecta al deploy con Docker** pero puede causar confusión. Puedes eliminarlo sin problema.

### ⚠️ CORS y `FRONTEND_URL`

El `FRONTEND_URL` del `.env` raíz se usa en:
- **Users:** whitelist de CORS
- **Exams:** `CORS_ORIGIN` para CORS
- **Attempts:** `CORS_ORIGIN` para CORS **y** para socket.io

Si el dominio no coincide exactamente (ej. falta el `https://` o sobra un `/`), las peticiones del navegador serán bloqueadas por CORS.

### ⚠️ Scheduler de exámenes

El servicio Exams tiene un **scheduler automático** (`examScheduler`) que se inicia al conectar la BD. Gestiona estados de exámenes (activación/desactivación programada). Si reinicias el container, el scheduler se re-crea automáticamente.

---

## Operaciones comunes (Makefile)

```bash
make help          # lista todos los comandos disponibles

# Ciclo normal
make ps            # ver estado
make logs          # logs en vivo
make logs-exams    # logs solo de un servicio
make restart       # reinicia los containers
make down          # detiene el stack (sin borrar volúmenes)
make up            # vuelve a levantar

# Actualizar a una nueva versión
make update        # git pull + frontend build + rebuild + restart

# Backups
make backup        # genera backups/db-FECHA.sql.gz + uploads-FECHA.tar.gz
make restore FILE=backups/db-2026-04-30.sql.gz

# Acceso a containers
make shell-postgres # cliente psql
make shell-exams    # shell dentro del container exams

# Limpieza completa (DESTRUCTIVO — borra volúmenes y datos)
make clean
```

### Backups automáticos (cron diario)

```bash
sudo tee /etc/cron.daily/backup-webexams > /dev/null <<'EOF'
#!/bin/bash
cd /opt/webexams && make backup >> /var/log/webexams-backup.log 2>&1
find /opt/webexams/backups -mtime +14 -delete
EOF
sudo chmod +x /etc/cron.daily/backup-webexams
```

---

## Troubleshooting

### Los containers no arrancan
```bash
make logs       # ver causa
make ps         # estado de health checks
docker compose config   # validar el yaml
```

### El frontend no carga (404)
- Confirma que `client/dist/` existe: `ls -la client/dist/index.html`
- Si no existe: `make frontend-build`

### Las APIs devuelven CORS error
- Verifica que `FRONTEND_URL` en `.env` coincide exactamente con la URL del navegador (protocolo + dominio, sin `/` final)
- Para socket.io: verifica que `CORS_ORIGIN` en el docker-compose del servicio attempts incluya tu dominio

### WebSocket no conecta / examen no muestra en tiempo real
- Verifica que Nginx del host tiene las cabeceras `Upgrade` y `Connection "upgrade"` (ya vienen en el template)
- Verifica que Nginx interno (`client/nginx.conf`) tiene el bloque `/socket.io/` apuntando a `apolo-attempts`
- Logs: `make logs-attempts` — busca mensajes de conexión/desconexión de socket.io

### Imágenes/PDFs no aparecen tras subir
- Verifica el volumen: `docker volume ls | grep uploads` y luego `docker volume inspect <nombre>`
- Logs del servicio Exams: `make logs-exams` — busca `✅ Imagen guardada en disco`
- Debe existir el directorio dentro del container: `docker compose exec apolo-exams ls /app/uploads/images`

### PostgreSQL no acepta conexiones desde los servicios
- Verifica que el health check de postgres pasa: `docker compose ps apolo-postgres` (debe decir `healthy`)
- Las tablas no se crean → confirma que las 3 BDs sí existen: `make shell-postgres` → `\l`
- Si falta `EXAMS_DB_NAME` o `ATTEMPTS_DB_NAME` (p. ej. porque el volumen ya existía antes de añadir el init script), créalas a mano: `make shell-postgres` → `CREATE DATABASE nombre_db;`

### "Error al validar el examen" / 500 en check-duplicate
- `JWT_SECRET` y `SERVICE_SECRET` deben ser idénticos en los 3 servicios. Como aquí los tomamos del mismo `.env` raíz, este error no debería ocurrir, pero verifica con `docker compose config` que las vars se inyectan bien.

### Cambios en código no se reflejan
- Recuerda que `make up` no rebuilda. Usa `make build && make up` o `make update`.
- Para cambios solo del frontend: `make frontend-build` (no necesitas reiniciar containers, Nginx sirve el dist).

### El email no se envía
- Verifica que el dominio en Resend esté verificado (todos los DNS records OK)
- El `SMTP_FROM` debe ser de ese dominio verificado
- **Verifica que la URL en el cuerpo del email** (`EmailService.ts`) apunta a tu dominio, no a `apolo-tau-roan.vercel.app`
- Logs: `make logs-attempts` — busca errores de Resend

### Login con Google no funciona pero email/contraseña sí
- Verifica las variables `VITE_FIREBASE_*` en `client/.env` y rebuilda: `make frontend-build`
- Verifica las variables `FIREBASE_*` en `.env` raíz y reinicia: `make restart`
- En Firebase Console → Authentication → Authorized domains, verifica que tu dominio está listado

---

## Migrar desde Vercel + Railway (o similar)

Si actualmente tienes el frontend en Vercel y el backend en otro proveedor:

1. **Backup de datos en el proveedor actual** (export de BD + descarga de uploads).
2. **Actualiza `client/.env`**: elimina `VITE_USERS_BASE`, `VITE_EXAMS_BASE` y `VITE_ATTEMPTS_BASE` (si existen). Solo deja las `VITE_FIREBASE_*`.
3. **Actualiza la URL del email**: cambia `apolo-tau-roan.vercel.app` en `EmailService.ts` por tu nuevo dominio.
4. **Sigue el Quick Start** arriba.
5. **Restaura los datos**:
   ```bash
   make restore FILE=backup-vercel.sql.gz
   # uploads: cópialos al volumen de uploads (ver `docker volume inspect` en Troubleshooting)
   ```
6. **Apunta el DNS** a la IP de tu nuevo servidor Linux.
7. **Apaga los servicios viejos** (Vercel project, Railway, etc.) cuando confirmes que todo funciona.

---

## Estructura de archivos relevante

```
WebExams/
├── docker-compose.yml                 ← orquestación de todos los servicios
├── Makefile                            ← comandos de uso diario
├── .env.example                        ← template de configuración
├── .env                                ← (no versionado) tus secrets reales
├── package.json                        ← script `npm run dev` para desarrollo local
├── docker/
│   └── postgres-init/01-databases.sh   ← crea las BDs de Exams y Attempts al primer arranque
├── deploy/
│   ├── setup-server.sh                 ← instala Docker, Node, Nginx en el server
│   └── nginx-host.conf.example         ← config Nginx del HOST (proxy + SSL)
├── server/
│   ├── Users/                          ← Microservicio auth (email + Google/Firebase)
│   │   ├── Dockerfile                  ← multi-stage build, ~150MB
│   │   ├── config/.env.production      ← template referencia (Docker NO lo usa)
│   │   └── src/
│   │       ├── firebase-admin.ts       ← init Admin SDK (tolerante a fallos)
│   │       └── services/UserService.ts ← login email, login Google
│   ├── Exams/                          ← Microservicio gestión de exámenes
│   │   ├── Dockerfile                  ← multi-stage build, ~250MB (incluye sharp)
│   │   ├── config/.env.production      ← template referencia (Docker NO lo usa)
│   │   └── src/
│   │       ├── scheduler/              ← scheduler automático de estados
│   │       └── routes/                 ← /api/exams, /api/images, /api/pdfs
│   └── ExamsAttempts/                  ← Microservicio intentos + monitoreo
│       ├── Dockerfile                  ← multi-stage build, ~150MB
│       ├── config/.env.production      ← template referencia (Docker NO lo usa)
│       └── src/
│           ├── websocket/SocketHandler.ts  ← socket.io para monitoreo en vivo
│           └── services/EmailService.ts    ← envío de notas por Resend
└── client/
    ├── .env                            ← vars VITE_FIREBASE_* (públicas)
    ├── nginx.conf                      ← config Nginx INTERNO (proxy a microservicios + socket.io), bakeada en la imagen por el Dockerfile
    ├── vite.config.ts                  ← proxy para desarrollo local
    ├── vercel.json                     ← (vestigio) se puede eliminar
    └── dist/                           ← (generado) servido por Nginx
```
