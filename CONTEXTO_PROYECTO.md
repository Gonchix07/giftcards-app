# Contexto del Proyecto — Gift Cards App

## Stack tecnológico
- **Frontend**: React 18 + Vite + React Router v6 + Tailwind CSS
- **Backend/DB**: Supabase (Auth, PostgreSQL, Storage, RLS)
- **Deploy**: Vercel (serverless functions en `/api/`)
- **URL producción**: https://giftcards-app-psi.vercel.app/
- **Email**: Brevo API (`BREVO_API_KEY`, `MAIL_FROM` en Vercel env vars)

---

## Estructura del proyecto
```
giftcards-app/
├── api/
│   ├── admin-users.js       # CRUD usuarios (service_role key)
│   ├── send-giftcard.js     # Envío email con Brevo
│   ├── clientes.js          # REST API: importar cliente externo (POST)
│   └── giftcards.js         # REST API: crear gift card con cliente existente (POST)
├── src/
│   ├── components/
│   │   ├── ClienteCombo.jsx  # Select editable con filtro (nombre/DNI/código)
│   │   ├── Layout.jsx        # Navegación + roles
│   │   └── ui.jsx            # Button, Input, Select, Card, Badge, money
│   ├── contexts/
│   │   └── AuthContext.jsx   # useAuth() → { user, profile, role, isAdmin }
│   ├── lib/
│   │   └── cardImage.js      # composeCardDataURL() — async, soporta template PNG
│   └── pages/
│       ├── Dashboard.jsx
│       ├── Empresas.jsx      # CRUD empresas + comercios + auditoría
│       ├── Clientes.jsx      # CRUD clientes + grupos + auditoría
│       ├── GiftCards.jsx     # Emisión individual/masiva + popup con template
│       ├── Cajero.jsx        # Escaneo QR + uso parcial/total + PDF rendición
│       ├── Reportes.jsx      # Saldos / Usos / Auditoría + Excel export (.xlsx)
│       ├── Usuarios.jsx      # CRUD usuarios con roles
│       ├── Mails.jsx         # Editor plantilla email HTML
│       └── Ayuda.jsx         # Manual web con búsqueda
├── supabase/
│   ├── schema.sql
│   ├── migration_uso_parcial.sql
│   ├── migration_telefono.sql
│   └── migration_template_gifcard.sql
└── public/manual/*.png       # Capturas para el manual
```

---

## Roles del sistema
| Rol | Acceso |
|---|---|
| `admin` | Todo |
| `cajero` | Solo panel cajero (fondo blanco) |
| `atencion` | GiftCards, Clientes, Reportes |
| `tesoreria` | Reportes + Dashboard |

Badge visual en navbar: admin=amber, cajero=green, atencion=sky, tesoreria=violet.

---

## Base de datos — tablas principales
- **empresas**: id, nombre, comercio (nombre del comercio), activo — campo `cuit` eliminado del front
- **comercios**: id, nombre, logo_url, color, template_url, qr_posicion ('izquierda'|'derecha')
- **clientes**: id, nombre, dni, email (obligatorio), telefono (opcional, máscara 223-XXXXXXX), codigo_cliente (5 chars alfanum, único, opcional), grupo_id
- **grupos**: id, nombre
- **giftcards**: id, codigo (8 chars único), empresa_id, cliente_id (inmutable una vez asignado), monto_max, saldo, fecha_vencimiento, estado (activa/agotada/anulada), uso_parcial (boolean), origen (text: 'Acuerdos y convenios'|'Empresa'|'Publicidad'|'Regalo Interno'|null)
- **profiles**: id, email, role, comercio (solo cajeros)
- **auditoria**: id, fecha, usuario_email, usuario_rol, accion, giftcard_codigo, empresa, cliente, detalle
- **config_email**: plantilla HTML con variables {nombre} {codigo} {monto} {empresa} {comercio} {vencimiento}

### Función PL/pgSQL clave
`usar_giftcard(p_codigo, p_monto, p_cajero_email)` — atómica, valida: estado activo, vencimiento, uso_parcial, restricción de comercio, cliente asignado requerido.

---

## Migraciones pendientes de correr en Supabase SQL Editor
```
migration_uso_parcial.sql       → agrega columna uso_parcial a giftcards
migration_telefono.sql          → agrega columna telefono a clientes
migration_template_gifcard.sql  → agrega template_url y qr_posicion a comercios
migration_auditoria_api.sql     → trigger de giftcards omite el alta automática cuando auth.uid es null (altas por API)
```

---

## Sistema de tarjeta (cardImage.js)
`composeCardDataURL(qrCanvas, options)` — async, devuelve dataURL PNG.

**Modo template** (cuando el comercio tiene `template_url`):
- Carga el PNG a sus dimensiones reales (sin distorsión)
- Escala QR y textos proporcionalmente al tamaño del template
- QR posicionado según `qr_posicion`: 'izquierda' o 'derecha'
- Textos "ESCANEÁME!" y código en blanco, centrados sobre/bajo el QR
- Marco blanco de 40px exterior
- El QR para composición usa fondo blanco + módulos oscuros (ref: `qrDownloadRef`)

**Modo clásico** (sin template): fondo sólido con color de `comercios.color`, QR blanco a la derecha.

**En el popup de GiftCards**: si hay template genera preview con `useEffect` + delay 120ms para esperar el canvas oculto.

---

## Auditoría — acciones registradas
| Sección | Acciones |
|---|---|
| GiftCards | creacion, uso, anulacion, eliminacion, asignacion (triggers DB) |
| Usuarios | usuario_creado, usuario_modificado, usuario_eliminado (api/admin-users.js) |
| Empresas | empresa_creada, empresa_modificada, empresa_eliminada, comercio_creado, comercio_modificado, comercio_eliminado |
| Clientes | cliente_creado, cliente_modificado, cliente_eliminado, grupo_creado, grupo_eliminado |
| API externa | cliente_creado (api/clientes.js), creacion de giftcard (api/giftcards.js) — ambos con detalle "vía API" |

---

## Componente ClienteCombo
`<ClienteCombo clientes={} value={} onChange={} label={} placeholder={} allowEmpty={true} inputClassName={} />`
- Input editable que filtra por nombre, DNI o codigo_cliente mientras se escribe
- Muestra hasta 50 resultados, cierra con blur (delay 150ms para permitir click)
- Usado en GiftCards: emisión individual y asignación desde tabla

---

## Serverless functions (Vercel /api/)

### admin-users.js
- POST: crear usuario (email, password, role, comercio)
- PATCH: modificar usuario (userId, email?, password?, role, comercio)
- DELETE: eliminar usuario (userId)
- Requiere header `Authorization: Bearer <access_token>`
- Usa `SUPABASE_SERVICE_ROLE_KEY` (env var en Vercel)
- Escribe en `auditoria` cada operación

### send-giftcard.js
- POST: envía email con QR adjunto (PNG base64)
- Lee plantilla de tabla `config_email`
- Usa `BREVO_API_KEY` y `MAIL_FROM` (env vars en Vercel)

### clientes.js — REST API externa
- POST `/api/clientes`: crea un cliente desde un sistema externo
- Requiere `Authorization: Bearer <token_admin>`
- Campos: `nombre*`, `dni*`, `email*`, `telefono`, `codigo_cliente` (5 alfanum), `grupo` (nombre) o `grupo_id` (UUID)
- Respuestas: 201 (creado), 400 (validación), 403 (no admin), 409 (DNI/email/código duplicado)
- Escribe en `auditoria` (`cliente_creado`, detalle "creado vía API") atribuido al admin llamante

### giftcards.js — REST API externa
- POST `/api/giftcards`: crea una gift card asignada a un cliente existente
- Requiere `Authorization: Bearer <token_admin>`
- Identifica al cliente por `dni*` + `email*` (ambos deben coincidir)
- Campos: `empresa*` (nombre campaña), `monto_max*`, `fecha_vencimiento` (YYYY-MM-DD), `uso_parcial` (boolean, default true), `origen`
- Respuestas: 201 (creado), 400 (validación/email no coincide/campaña inactiva), 403 (no admin), 404 (cliente/campaña no encontrado)
- Escribe en `auditoria` (`creacion`, detalle "alta vía API") atribuido al admin llamante. El trigger DB omite su registro automático cuando el alta viene por service role (sin `auth.uid`), para evitar duplicados

#### Cómo obtener el Bearer token desde un sistema externo
```http
POST https://hmzzpwjsgfahsuaqaubt.supabase.co/auth/v1/token?grant_type=password
Content-Type: application/json

{ "email": "admin@...", "password": "..." }
```
El `access_token` de la respuesta se usa como `Bearer`. Expira en 1 hora; renovar con `refresh_token`.

---

## Cambios recientes (sesión julio 2026)

### Nomenclatura
- Todas las referencias a "Empresa/s" en el front cambiadas a "Campaña/s". La tabla DB sigue llamándose `empresas`.
- Campo `cuit` eliminado de Empresas (front y formulario).

### GiftCards — campo Origen
- Nuevo campo `origen` en emisión individual y masiva. Opciones (orden alfabético): Acuerdos y convenios, Empresa, Publicidad, Regalo Interno.
- Columna Origen agregada en Reportes (Saldos y Usos) y en exports Excel.
- Columna **Uso** en tabla de gift cards: muestra `parcial` (amber) o `total` (slate) según el flag `uso_parcial` configurado al generar.
- **Migración pendiente**: `ALTER TABLE giftcards ADD COLUMN origen text;`

### Importación masiva (Excel)
- **Usuarios**: importación por Excel con plantilla descargable (dropdowns de rol y comercio con ExcelJS). Layout: formulario horizontal + importación + tabla.
- **Clientes**: importación por Excel con plantilla descargable (dropdown de grupo incluye "Sin grupo"). Layout: formulario horizontal + grupos e importación en misma fila + tabla.

### Exports
- Reportes Saldos y Usos exportan como `.xlsx` (antes CSV). Usa SheetJS (`xlsx`).
- Auditoría sigue exportando como CSV.

### Layouts reorganizados
- **GiftCards**: formularios en grid horizontal `lg:grid-cols-4`.
- **Usuarios**: formulario horizontal + importación debajo + tabla.
- **Clientes**: formulario horizontal + grupos e importación en misma línea + tabla.

### Dashboard
- Campañas activas/inactivas con badge y opacidad reducida para inactivas.
- Stats por campaña: Emitidas, Asignadas, Canjeadas, Efectividad (%).
- Campañas activas ordenadas primero.

### Login
- Toggle mostrar/ocultar contraseña (👁️/🙈).

---

## Detalles de implementación importantes
- **Tablas responsivas**: clase CSS `responsive-table` → stacked cards en mobile (< 1024px)
- **Formato pesos**: `soloDigitos()` + `formatPesos()` → "$ 1.234.567" mientras se escribe
- **CUIT máscara**: XX-XXXXXXXX-X
- **Teléfono máscara**: 223-XXXXXXX (hasta 10 dígitos)
- **Código gift card**: 8 chars alfanum mayúsculas, generado con `crypto.getRandomValues`
- **QR**: `qrcode.react` (QRCodeCanvas) para display, `html5-qrcode` para escaneo
- **Login**: race condition corregida con `setLoading` en `onAuthStateChange` + `useEffect` para navigate
- **vercel.json**: rewrite `((?!api/).*)` para no interceptar rutas `/api/*`
- **Cajero PDF**: rendición con filas seleccionables, número `R-AAAAMMDD-HHMMSS`

---

## Variables de entorno en Vercel
```
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
BREVO_API_KEY
MAIL_FROM
```

---

## Workflow de deploy
1. Desarrollar y buildear local: `npm run build`
2. Correr migraciones SQL pendientes en Supabase SQL Editor
3. Push a git → Vercel redeploya automáticamente
