import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { Button, Input, Select, Card, Badge } from '../components/ui'

const empty = { email: '', password: '', role: 'cajero', comercio: '' }

const rolLabel = { admin: 'Administrador', cajero: 'Cajero', atencion: 'Atención Cliente', tesoreria: 'Tesorería' }

export default function Usuarios() {
  const { user } = useAuth()
  const [usuarios, setUsuarios] = useState([])
  const [comercios, setComercios] = useState([])
  const [form, setForm] = useState(empty)
  const [editId, setEditId] = useState(null)
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')
  const [loading, setLoading] = useState(false)

  async function load() {
    const [u, c] = await Promise.all([
      supabase.from('profiles').select('*').order('email'),
      supabase.from('comercios').select('nombre').order('nombre'),
    ])
    setUsuarios(u.data || [])
    setComercios(c.data || [])
  }
  useEffect(() => {
    load()
  }, [])

  async function authHeader() {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    return { Authorization: `Bearer ${session?.access_token || ''}`, 'Content-Type': 'application/json' }
  }

  function startEdit(u) {
    setEditId(u.id)
    setError('')
    setMsg('')
    setForm({ email: u.email || '', password: '', role: u.role, comercio: u.comercio || '' })
  }
  function reset() {
    setEditId(null)
    setError('')
    setForm(empty)
  }

  async function guardar(e) {
    e.preventDefault()
    setError('')
    setMsg('')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return setError('Ingresá un email válido.')
    if (!editId && form.password.length < 6) return setError('La contraseña debe tener al menos 6 caracteres.')
    if (editId && form.password && form.password.length < 6)
      return setError('La nueva contraseña debe tener al menos 6 caracteres.')
    setLoading(true)
    try {
      const method = editId ? 'PATCH' : 'POST'
      const body = editId ? { userId: editId, ...form } : { ...form }
      const resp = await fetch('/api/admin-users', { method, headers: await authHeader(), body: JSON.stringify(body) })
      const json = await resp.json().catch(() => ({}))
      if (!resp.ok) {
        setError(json.error || 'No se pudo guardar.')
      } else {
        setMsg(editId ? '✅ Usuario actualizado.' : `✅ Usuario ${form.email} creado.`)
        reset()
        load()
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function eliminarUsuario(u) {
    setError('')
    setMsg('')
    if (u.id === user?.id) return alert('No podés eliminar tu propio usuario.')
    if (!confirm(`¿Eliminar al usuario ${u.email}? Esta acción no se puede deshacer.`)) return
    try {
      const resp = await fetch('/api/admin-users', {
        method: 'DELETE',
        headers: await authHeader(),
        body: JSON.stringify({ userId: u.id }),
      })
      const json = await resp.json().catch(() => ({}))
      if (!resp.ok) setError(json.error || 'No se pudo eliminar el usuario.')
      else load()
    } catch (e) {
      setError(e.message)
    }
  }

  return (
    <div className="grid lg:grid-cols-3 gap-6 text-sm">
      <Card className="lg:col-span-1 h-fit">
        <h2 className="font-bold text-base mb-4">{editId ? 'Editar usuario' : 'Nuevo usuario'}</h2>
        <form onSubmit={guardar} className="space-y-3">
          <Input
            label="Email *"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            required
          />
          <Input
            label={editId ? 'Contraseña (dejar vacío para no cambiarla)' : 'Contraseña * (mín. 6)'}
            type="text"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            placeholder={editId ? '••••••' : ''}
          />
          <Select label="Rol *" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            <option value="cajero">Cajero</option>
            <option value="atencion">Atención Cliente</option>
            <option value="tesoreria">Tesorería</option>
            <option value="admin">Administrador</option>
          </Select>
          <Select
            label="Comercio (solo cajero)"
            value={form.comercio}
            onChange={(e) => setForm({ ...form, comercio: e.target.value })}
            disabled={form.role !== 'cajero'}
          >
            <option value="">— Sin restricción —</option>
            {comercios.map((c) => (
              <option key={c.nombre} value={c.nombre}>
                {c.nombre}
              </option>
            ))}
          </Select>
          {error && <p className="text-sm text-red-600">{error}</p>}
          {msg && <p className="text-sm text-green-700">{msg}</p>}
          <div className="flex gap-2">
            <Button type="submit" disabled={loading}>
              {loading ? 'Guardando…' : editId ? 'Guardar' : 'Crear usuario'}
            </Button>
            {editId && (
              <Button type="button" variant="secondary" onClick={reset}>
                Cancelar
              </Button>
            )}
          </div>
        </form>
      </Card>

      <Card className="lg:col-span-2 min-w-0">
        <h2 className="font-bold text-base mb-4">Usuarios ({usuarios.length})</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-xs responsive-table">
            <thead>
              <tr className="text-left text-slate-500 border-b">
                <th className="py-2">Email</th>
                <th>Rol</th>
                <th>Comercio (cajero)</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {usuarios.map((u) => (
                <tr key={u.id} className="border-b last:border-0">
                  <td className="py-2 font-medium" data-label="Email">
                    {u.email} {u.id === user?.id && <Badge color="slate">vos</Badge>}
                  </td>
                  <td data-label="Rol">{rolLabel[u.role] || u.role}</td>
                  <td data-label="Comercio (cajero)">{u.role === 'cajero' ? u.comercio || '— Sin restricción —' : '—'}</td>
                  <td className="text-right whitespace-nowrap" data-label="Acciones">
                    <Button variant="ghost" onClick={() => startEdit(u)} title="Editar usuario">
                      ✏️
                    </Button>
                    <Button variant="ghost" onClick={() => eliminarUsuario(u)} title="Eliminar usuario">
                      🗑️
                    </Button>
                  </td>
                </tr>
              ))}
              {usuarios.length === 0 && (
                <tr>
                  <td colSpan="4" className="py-6 text-center text-slate-400">
                    Sin usuarios
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
