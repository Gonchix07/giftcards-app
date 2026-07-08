// POST /api/giftcards — crea una gift card y la asigna a un cliente existente.
// El cliente se identifica obligatoriamente por DNI + email (ambos deben coincidir).
// Requiere autenticación: Bearer token de un usuario con rol admin.
//
// Body JSON:
//   dni*             string  — identifica al cliente
//   email*           string  — debe coincidir con el dni
//   empresa*         string  — nombre de la campaña (tabla empresas)
//   monto_max*       number  — importe máximo de la gift card
//   fecha_vencimiento string  (opcional) YYYY-MM-DD
//   uso_parcial      boolean (opcional, default true)
//   origen           string  (opcional) "Regalo Interno" | "Empresa" | "Publicidad"
//
// Respuesta 201: { id, codigo, empresa_id, cliente_id, monto_max, saldo,
//                  fecha_vencimiento, uso_parcial, origen, estado }
// Errores 4xx:  { error: "mensaje" }

import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const ORIGENES_VALIDOS = ['Regalo Interno', 'Empresa', 'Publicidad', 'Acuerdos y convenios']

function generarCodigo() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  const arr = new Uint8Array(8)
  crypto.getRandomValues(arr)
  return Array.from(arr, (b) => chars[b % chars.length]).join('')
}

async function getAdminClient(req) {
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim()
  if (!token) return null
  const anon = createClient(url, anonKey)
  const { data: { user } } = await anon.auth.getUser(token)
  if (!user) return null
  const admin = createClient(url, serviceKey)
  const { data: prof } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (prof?.role !== 'admin') return null
  return { admin, callerEmail: user.email }
}

export default async function handler(req, res) {
  if (!url || !anonKey || !serviceKey) {
    return res.status(500).json({ error: 'Falta configurar SUPABASE_SERVICE_ROLE_KEY en el servidor.' })
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido. Usá POST.' })
  }

  const ctx = await getAdminClient(req)
  if (!ctx) return res.status(403).json({ error: 'No autorizado (se requiere un usuario administrador).' })
  const { admin } = ctx

  const { dni, email, empresa, monto_max, fecha_vencimiento, uso_parcial = true, origen } = req.body || {}

  // Validaciones de campos obligatorios
  if (!dni?.trim()) return res.status(400).json({ error: 'El campo dni es obligatorio.' })
  if (!email?.trim()) return res.status(400).json({ error: 'El campo email es obligatorio.' })
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return res.status(400).json({ error: 'El formato del email no es válido.' })
  }
  if (!empresa?.trim()) return res.status(400).json({ error: 'El campo empresa (nombre de campaña) es obligatorio.' })
  const monto = Number(monto_max)
  if (!(monto > 0)) return res.status(400).json({ error: 'monto_max debe ser un número mayor a cero.' })
  if (origen && !ORIGENES_VALIDOS.includes(origen)) {
    return res.status(400).json({ error: `origen inválido. Valores permitidos: ${ORIGENES_VALIDOS.join(', ')}.` })
  }
  if (fecha_vencimiento && !/^\d{4}-\d{2}-\d{2}$/.test(fecha_vencimiento)) {
    return res.status(400).json({ error: 'fecha_vencimiento debe tener formato YYYY-MM-DD.' })
  }

  // Buscar cliente por DNI
  const { data: cliente } = await admin
    .from('clientes')
    .select('id, nombre, email')
    .eq('dni', dni.trim())
    .single()

  if (!cliente) {
    return res.status(404).json({ error: `No se encontró ningún cliente con DNI "${dni}".` })
  }

  // Validar que el email coincida
  if (cliente.email?.toLowerCase() !== email.trim().toLowerCase()) {
    return res.status(400).json({ error: 'El email no coincide con el DNI proporcionado.' })
  }

  // Buscar campaña activa por nombre
  const { data: empresaRow } = await admin
    .from('empresas')
    .select('id, activo')
    .ilike('nombre', empresa.trim())
    .single()

  if (!empresaRow) {
    return res.status(404).json({ error: `No se encontró ninguna campaña con el nombre "${empresa}".` })
  }
  if (!empresaRow.activo) {
    return res.status(400).json({ error: `La campaña "${empresa}" está inactiva.` })
  }

  // Generar código único (reintenta hasta 5 veces ante colisiones)
  let codigoFinal = null
  for (let i = 0; i < 5; i++) {
    const codigo = generarCodigo()
    const { data: existe } = await admin.from('giftcards').select('id').eq('codigo', codigo).maybeSingle()
    if (!existe) { codigoFinal = codigo; break }
  }
  if (!codigoFinal) {
    return res.status(500).json({ error: 'No se pudo generar un código único. Intentá nuevamente.' })
  }

  const payload = {
    codigo: codigoFinal,
    empresa_id: empresaRow.id,
    cliente_id: cliente.id,
    monto_max: monto,
    saldo: monto,
    fecha_vencimiento: fecha_vencimiento || null,
    uso_parcial: Boolean(uso_parcial),
    origen: origen || null,
  }

  const { data: giftcard, error } = await admin.from('giftcards').insert(payload).select().single()

  if (error) {
    return res.status(500).json({ error: error.message })
  }

  // Registrar el alta en la auditoría (atribuida al admin que llama a la API).
  // El trigger de DB omite el registro automático cuando la creación viene por
  // service role (sin auth.uid), así que este es el único movimiento de 'creacion'.
  await admin.from('auditoria').insert({
    usuario_email: ctx.callerEmail,
    usuario_rol: 'admin',
    accion: 'creacion',
    giftcard_codigo: giftcard.codigo,
    empresa: empresa.trim(),
    cliente: cliente.nombre,
    detalle: `Monto máximo ${monto} (asignada al crear) — alta vía API`,
  })

  return res.status(201).json(giftcard)
}
