// Función serverless de Vercel: alta y baja de usuarios de la app.
// Requiere la SERVICE ROLE key de Supabase (NUNCA va en el frontend).
// Configurá en Vercel:
//   SUPABASE_SERVICE_ROLE_KEY -> Project Settings -> API -> service_role (secret)
//   (usa VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY ya existentes para la URL y validar al admin)
//
// Seguridad: valida que quien llama esté autenticado y tenga rol 'admin'.

import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

// Devuelve un cliente con service role si el que llama es admin; si no, null.
async function getAdminClient(req) {
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim()
  if (!token) return null
  const anon = createClient(url, anonKey)
  const {
    data: { user },
  } = await anon.auth.getUser(token)
  if (!user) return null
  const admin = createClient(url, serviceKey)
  const { data: prof } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (prof?.role !== 'admin') return null
  return { admin, callerId: user.id, callerEmail: user.email }
}

export default async function handler(req, res) {
  if (!url || !anonKey || !serviceKey) {
    return res.status(500).json({ error: 'Falta configurar SUPABASE_SERVICE_ROLE_KEY en el servidor.' })
  }

  const ctx = await getAdminClient(req)
  if (!ctx) return res.status(403).json({ error: 'No autorizado (se requiere un usuario administrador).' })
  const { admin, callerId, callerEmail } = ctx

  try {
    if (req.method === 'POST') {
      const { email, password, role } = req.body || {}
      if (!email || !password) return res.status(400).json({ error: 'Faltan email o contraseña.' })
      if (String(password).length < 6) return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' })
      const rol = ['admin', 'atencion', 'cajero'].includes(role) ? role : 'cajero'

      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { role: rol },
      })
      if (error) return res.status(400).json({ error: error.message })

      // El rol lo fija el trigger handle_new_user desde el metadata.
      // Auditoría: alta de usuario
      await admin.from('auditoria').insert({
        usuario_email: callerEmail,
        usuario_rol: 'admin',
        accion: 'usuario_creado',
        detalle: `Usuario ${email} creado con rol ${rol}`,
      })
      return res.status(200).json({ ok: true, id: data.user.id })
    }

    if (req.method === 'DELETE') {
      const { userId } = req.body || {}
      if (!userId) return res.status(400).json({ error: 'Falta userId.' })
      if (userId === callerId) return res.status(400).json({ error: 'No podés eliminar tu propio usuario.' })

      // Email del usuario a eliminar (para la auditoría)
      const { data: prof } = await admin.from('profiles').select('email').eq('id', userId).single()

      const { error } = await admin.auth.admin.deleteUser(userId)
      if (error) return res.status(400).json({ error: error.message })

      await admin.from('auditoria').insert({
        usuario_email: callerEmail,
        usuario_rol: 'admin',
        accion: 'usuario_eliminado',
        detalle: `Usuario ${prof?.email || userId} eliminado`,
      })
      return res.status(200).json({ ok: true })
    }

    return res.status(405).json({ error: 'Método no permitido' })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
