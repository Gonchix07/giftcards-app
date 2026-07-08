// POST /api/clientes  — importa un cliente desde un sistema externo.
// Requiere autenticación: Bearer token de un usuario con rol admin.
//
// Body JSON:
//   nombre*      string
//   dni*         string
//   email*       string (formato válido)
//   telefono     string (opcional)
//   codigo_cliente string (opcional, 5 alfanuméricos)
//   grupo        string  nombre del grupo (opcional); también acepta grupo_id (UUID)
//
// Respuesta 201: { id, codigo, nombre, dni, email, telefono, codigo_cliente, grupo_id }
// Errores 4xx: { error: "mensaje" }

import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

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

  const { nombre, dni, email, telefono, codigo_cliente, grupo, grupo_id } = req.body || {}

  // Validaciones
  if (!nombre?.trim()) return res.status(400).json({ error: 'El campo nombre es obligatorio.' })
  if (!dni?.trim()) return res.status(400).json({ error: 'El campo dni es obligatorio.' })
  if (!email?.trim()) return res.status(400).json({ error: 'El campo email es obligatorio.' })
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return res.status(400).json({ error: 'El formato del email no es válido.' })
  }
  const codigoClean = codigo_cliente ? String(codigo_cliente).trim().toUpperCase() : null
  if (codigoClean && !/^[A-Z0-9]{5}$/.test(codigoClean)) {
    return res.status(400).json({ error: 'codigo_cliente debe tener exactamente 5 caracteres alfanuméricos.' })
  }

  // Resolver grupo_id
  let resolvedGrupoId = grupo_id || null
  if (!resolvedGrupoId && grupo?.trim()) {
    const { data: grp } = await admin
      .from('grupos')
      .select('id')
      .ilike('nombre', grupo.trim())
      .single()
    if (!grp) return res.status(400).json({ error: `Grupo no encontrado: "${grupo}".` })
    resolvedGrupoId = grp.id
  }

  const payload = {
    nombre: nombre.trim(),
    dni: dni.trim(),
    email: email.trim(),
    telefono: telefono?.trim() || null,
    codigo_cliente: codigoClean || null,
    grupo_id: resolvedGrupoId,
  }

  const { data, error } = await admin.from('clientes').insert(payload).select().single()

  if (error) {
    const msg = error.message
    const motivo = msg.includes('codigo_cliente')
      ? 'Ya existe un cliente con ese código de cliente.'
      : msg.includes('dni')
      ? 'Ya existe un cliente con ese DNI.'
      : msg.includes('email')
      ? 'Ya existe un cliente con ese email.'
      : msg
    return res.status(409).json({ error: motivo })
  }

  // Registrar el alta en la auditoría (atribuida al admin que llama a la API)
  await admin.from('auditoria').insert({
    usuario_email: ctx.callerEmail,
    usuario_rol: 'admin',
    accion: 'cliente_creado',
    cliente: data.nombre,
    detalle: `Cliente "${data.nombre}" (DNI: ${data.dni}, email: ${data.email}) creado vía API`,
  })

  return res.status(201).json(data)
}
