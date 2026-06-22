import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { Button, Input, Select, Card, Badge } from '../components/ui'

const empty = { email: '', password: '', role: 'cajero' }
const COMERCIOS = ['HERGO Mayorista', 'Tiendas Menor Coste']

export default function Usuarios() {
  const { user } = useAuth()
  const [usuarios, setUsuarios] = useState([])
  const [form, setForm] = useState(empty)
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')
  const [loading, setLoading] = useState(false)

  async function load() {
    const { data } = await supabase.from('profiles').select('*').order('email')
    setUsuarios(data || [])
  }
  useEffect(() => {
    load()
  }, [])

  // Token del admin para autorizar las llamadas a la función serverless
  async function authHeader() {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    return { Authorization: `Bearer ${session?.access_token || ''}`, 'Content-Type': 'application/json' }
  }

  async function crearUsuario(e) {
    e.preventDefault()
    setError('')
    setMsg('')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return setError('Ingresá un email válido.')
    if (form.password.length < 6) return setError('La contraseña debe tener al menos 6 caracteres.')
    setLoading(true)
    try {
      const resp = await fetch('/api/admin-users', {
        method: 'POST',
        headers: await authHeader(),
        body: JSON.stringify(form),
      })
      const json = await resp.json().catch(() => ({}))
      if (!resp.ok) {
        setError(json.error || 'No se pudo crear el usuario.')
      } else {
        setMsg(`✅ Usuario ${form.email} creado como ${form.role}.`)
        setForm(empty)
        load()
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function cambiarRol(id, role) {
    setError('')
    setMsg('')
    const { error } = await supabase.from('profiles').update({ role }).eq('id', id)
    if (error) setError(error.message)
    else load()
  }

  async function cambiarComercio(id, comercio) {
    setError('')
    setMsg('')
    const { error } = await supabase.from('profiles').update({ comercio: comercio || null }).eq('id', id)
    if (error) setError(error.message)
    else load()
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
    <div className="grid lg:grid-cols-3 gap-6">
      <Card className="lg:col-span-1 h-fit">
        <h2 className="font-bold text-lg mb-4">Nuevo usuario</h2>
        <form onSubmit={crearUsuario} className="space-y-3">
          <Input
            label="Email *"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            required
          />
          <Input
            label="Contraseña * (mín. 6)"
            type="text"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            required
          />
          <Select label="Rol *" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            <option value="cajero">Cajero</option>
            <option value="atencion">Atención Cliente</option>
            <option value="tesoreria">Tesorería</option>
            <option value="admin">Administrador</option>
          </Select>
          {error && <p className="text-sm text-red-600">{error}</p>}
          {msg && <p className="text-sm text-green-700">{msg}</p>}
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'Creando…' : 'Crear usuario'}
          </Button>
        </form>
      </Card>

      <Card className="lg:col-span-2 min-w-0">
        <h2 className="font-bold text-lg mb-4">Usuarios ({usuarios.length})</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm responsive-table">
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
                  <td data-label="Rol">
                    <select
                      className="px-2 py-1 border border-slate-300 rounded-lg bg-white text-sm"
                      value={u.role}
                      onChange={(e) => cambiarRol(u.id, e.target.value)}
                    >
                      <option value="cajero">Cajero</option>
                      <option value="atencion">Atención Cliente</option>
                      <option value="tesoreria">Tesorería</option>
                      <option value="admin">Administrador</option>
                    </select>
                  </td>
                  <td data-label="Comercio (cajero)">
                    <select
                      className="px-2 py-1 border border-slate-300 rounded-lg bg-white text-sm disabled:opacity-50"
                      value={u.comercio || ''}
                      disabled={u.role !== 'cajero'}
                      onChange={(e) => cambiarComercio(u.id, e.target.value)}
                    >
                      <option value="">— Sin restricción —</option>
                      {COMERCIOS.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="text-right whitespace-nowrap" data-label="Acciones">
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
