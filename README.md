# 🎁 Gestión de Gift Cards

App web (React + Vite + Supabase) para administrar Gift Cards de clientes, con dos roles:

- **Administrador**: CRUD de empresas y clientes, emisión de gift cards (código de 8 caracteres + QR), y reportes de saldos y usos (con exportación a CSV).
- **Cajero**: ingresa el código o escanea el QR, ve el saldo disponible y registra usos parciales. Cada uso es **definitivo** y descuenta del saldo; cuando el saldo llega a 0 la tarjeta queda **agotada**.

## Características clave

- Código único de **8 caracteres alfanuméricos** por gift card.
- **QR** generado por gift card (descargable como PNG) y lector de QR en el panel del cajero.
- **Usos parciales**: el saldo restante queda a cuenta del cliente.
- **Vencimiento** opcional por gift card: si está vencida, el cajero no puede usarla (validado también en la base de datos).
- **Envío del QR por email** al cliente (con Resend), desde el panel de emisión.
- Descuento de saldo **atómico** vía función `usar_giftcard` en Postgres (evita doble uso por concurrencia).
- Clientes con **nombre, DNI (9 dígitos) y email**.
- Seguridad por **Row Level Security**: el cajero no puede modificar saldos directamente, solo a través de la función validada.

---

## 1. Configurar Supabase (base de datos cloud)

1. Crear una cuenta en https://supabase.com y un nuevo proyecto.
2. Ir a **SQL Editor → New query**, pegar el contenido de [`supabase/schema.sql`](supabase/schema.sql) y ejecutar (**Run**).
3. Ir a **Project Settings → API** y copiar:
   - **Project URL** → `VITE_SUPABASE_URL`
   - **anon public key** → `VITE_SUPABASE_ANON_KEY`

> Si ya habías corrido el `schema.sql` de una versión anterior (sin vencimiento), ejecutá además
> [`supabase/migration_vencimiento.sql`](supabase/migration_vencimiento.sql) en el SQL Editor.

### Crear los usuarios (admin y cajero)

En **Authentication → Users → Add user**, crear los usuarios con email y contraseña
(marcá *Auto Confirm User*). Por defecto cada usuario nuevo se crea con rol `cajero`.

Para convertir a alguien en **admin**, ejecutá en el SQL Editor:

```sql
update public.profiles set role = 'admin' where email = 'tuadmin@ejemplo.com';
```

> Tip: para que el primer admin se cree directamente como admin, podés crearlo desde
> Authentication con metadata `{"role":"admin"}`, o simplemente correr el `update` de arriba.

---

## 2. Correr en local

```bash
npm install
cp .env.example .env   # y completá las dos variables
npm run dev
```

Abrir https://localhost:5173

> El lector de QR necesita HTTPS o `localhost` para acceder a la cámara. En `localhost` funciona sin problema.

### Acceso desde otros dispositivos de la red (por IP) con HTTPS

El dev server está configurado ([`vite.config.js`](vite.config.js)) para exponerse en la red local
(`server.host: true`) y servir por **HTTPS** con un certificado autofirmado (plugin
`@vitejs/plugin-basic-ssl`). Esto permite que el cajero use la **cámara para escanear QR** desde
un celular u otra PC.

1. Averiguá la IP de esta PC con `ipconfig` (campo *IPv4 Address*), por ej. `192.168.4.4`.
2. Corré `npm run dev`. Vite mostrará algo como:
   ```
   ➜  Network: https://192.168.4.4:5173/
   ```
3. Desde el otro dispositivo (misma red) entrá a **`https://192.168.4.4:5173`** (con **s**).
4. El navegador mostrará una **advertencia de certificado no confiable** (es esperado, es
   autofirmado): **Avanzado → Continuar de todos modos**. Hay que aceptarla una vez por dispositivo.
5. Con HTTPS aceptado, el escaneo de QR funciona. 📷

**Firewall de Windows**: la primera vez puede pedir permitir Node.js en redes privadas → *Permitir
acceso*. Si no conecta, habilitá el puerto **5173/TCP** en el Firewall.

> Para un certificado sin advertencias en la LAN podés usar [`mkcert`](https://github.com/FiloSottile/mkcert).
> En producción (Vercel) el HTTPS ya es real y no hace falta nada de esto.

---

## 3. Deploy en Vercel

1. Subí el proyecto a un repo de GitHub.
2. En Vercel: **New Project → Import** el repo.
3. Framework preset: **Vite** (se detecta solo). Build command `npm run build`, output `dist`.
4. En **Settings → Environment Variables** agregá:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `RESEND_API_KEY` *(para enviar emails — ver abajo)*
   - `MAIL_FROM` *(remitente, ej: `Gift Cards <giftcards@tudominio.com>`)*
5. **Deploy**. El archivo [`vercel.json`](vercel.json) ya incluye el rewrite para que funcionen las rutas del SPA.

### Envío de email (Resend)

La función serverless [`api/send-giftcard.js`](api/send-giftcard.js) envía el QR por email.

1. Crear cuenta en https://resend.com y **verificar tu dominio** (o usar el dominio de prueba de Resend).
2. Generar una **API Key** y cargarla en Vercel como `RESEND_API_KEY`.
3. Definir `MAIL_FROM` con un remitente de tu dominio verificado.

> El botón **✉️ Enviar por email** aparece al emitir una gift card y usa el email del cliente asignado.
> Las funciones `/api/*` solo corren en Vercel (o `vercel dev`), no en `npm run dev`.

---

## Estructura

```
supabase/schema.sql        → tablas, RLS, triggers y función usar_giftcard
src/supabaseClient.js      → cliente Supabase
src/contexts/AuthContext   → sesión y rol del usuario
src/pages/Login            → inicio de sesión
src/pages/AdminHome        → dashboard con totales
src/pages/Empresas         → CRUD de empresas
src/pages/Clientes         → CRUD de clientes (DNI 9 dígitos)
src/pages/GiftCards        → emisión + QR + anulación
src/pages/Reportes         → saldos y usos + export CSV
src/pages/Cajero           → buscar/escanear, ver saldo, registrar uso
```

## Modelo de datos

- `empresas` — empresas que emiten gift cards.
- `clientes` — nombre, dni (único, 9 dígitos), email.
- `giftcards` — codigo (8 alfanum.), empresa, cliente, monto_max, saldo, estado (`activa`/`agotada`/`anulada`).
- `transacciones` — cada uso: gift card, monto, saldo resultante, cajero, fecha.
- `profiles` — usuario de Auth + rol (`admin`/`cajero`).
