import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { Button, Input, Select, Card } from '../components/ui'

const empty = { nombre: '', dni: '', email: '', telefono: '', codigo_cliente: '', grupo_id: '' }

// Máscara de teléfono: 223-5937766 (código + número)
function formatTel(v) {
  const d = (v || '').replace(/\D/g, '').slice(0, 10)
  return d.length <= 3 ? d : d.slice(0, 3) + '-' + d.slice(3)
}

export default function Clientes() {
  const [clientes, setClientes] = useState([])
  const [grupos, setGrupos] = useState([])
  const [form, setForm] = useState(empty)
  const [editId, setEditId] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [q, setQ] = useState('')

  // Alta de grupos
  const [nombreGrupo, setNombreGrupo] = useState('')
  const [grupoError, setGrupoError] = useState('')
  const [grupoLoading, setGrupoLoading] = useState(false)

  async function load() {
    const [cl, gr] = await Promise.all([
      supabase.from('clientes').select('*, grupos(nombre)').order('nombre'),
      supabase.from('grupos').select('*').order('nombre'),
    ])
    setClientes(cl.data || [])
    setGrupos(gr.data || [])
  }
  useEffect(() => {
    load()
  }, [])

  function startEdit(c) {
    setEditId(c.id)
    setForm({
      nombre: c.nombre,
      dni: c.dni,
      email: c.email || '',
      telefono: c.telefono || '',
      codigo_cliente: c.codigo_cliente || '',
      grupo_id: c.grupo_id || '',
    })
  }
  function reset() {
    setForm(empty)
    setEditId(null)
    setError('')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!form.email.trim()) {
      setError('El email es obligatorio.')
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      setError('Ingresá una dirección de email válida.')
      return
    }
    if (form.codigo_cliente && !/^[A-Za-z0-9]{5}$/.test(form.codigo_cliente)) {
      setError('El código de cliente debe tener 5 caracteres alfanuméricos.')
      return
    }
    setLoading(true)
    const payload = {
      ...form,
      grupo_id: form.grupo_id || null,
      codigo_cliente: form.codigo_cliente || null,
      telefono: form.telefono || null,
    }
    const res = editId
      ? await supabase.from('clientes').update(payload).eq('id', editId)
      : await supabase.from('clientes').insert(payload)
    setLoading(false)
    if (res.error) {
      const m = res.error.message
      if (m.includes('codigo_cliente')) setError('Ya existe un cliente con ese código.')
      else if (m.includes('duplicate') || m.includes('dni')) setError('Ya existe un cliente con ese DNI.')
      else setError(m)
      return
    }
    reset()
    load()
  }

  async function remove(id) {
    if (!confirm('¿Eliminar este cliente? (no se puede si tiene gift cards asignadas)')) return
    const { error } = await supabase.from('clientes').delete().eq('id', id)
    if (error) alert(error.message)
    else load()
  }

  // ---------- Grupos ----------
  async function crearGrupo(e) {
    e.preventDefault()
    setGrupoError('')
    if (!nombreGrupo.trim()) return
    setGrupoLoading(true)
    const { error } = await supabase.from('grupos').insert({ nombre: nombreGrupo.trim() })
    setGrupoLoading(false)
    if (error) {
      setGrupoError(error.message.includes('duplicate') ? 'Ya existe un grupo con ese nombre.' : error.message)
      return
    }
    setNombreGrupo('')
    load()
  }

  async function eliminarGrupo(id) {
    if (!confirm('¿Eliminar este grupo? Los clientes asignados quedarán sin grupo.')) return
    const { error } = await supabase.from('grupos').delete().eq('id', id)
    if (error) alert(error.message)
    else load()
  }

  const filtered = clientes.filter(
    (c) =>
      c.nombre.toLowerCase().includes(q.toLowerCase()) ||
      c.dni.includes(q) ||
      (c.codigo_cliente || '').toLowerCase().includes(q.toLowerCase())
  )

  return (
    <div className="grid lg:grid-cols-3 gap-6 text-sm">
      <div className="lg:col-span-1 space-y-6">
        <Card className="h-fit">
          <h2 className="font-bold text-base mb-4">{editId ? 'Editar cliente' : 'Nuevo cliente'}</h2>
          <form onSubmit={handleSubmit} className="space-y-3">
            <Input
              label="Nombre *"
              value={form.nombre}
              onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              required
            />
            <Input
              label="DNI *"
              value={form.dni}
              onChange={(e) => setForm({ ...form, dni: e.target.value })}
              required
            />
            <Input
              label="Email *"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
            <Input
              label="Teléfono (opcional)"
              value={form.telefono}
              onChange={(e) => setForm({ ...form, telefono: formatTel(e.target.value) })}
              placeholder="223-5937766"
              inputMode="numeric"
              maxLength={11}
            />
            <Input
              label="Código de cliente (opcional, 5 caracteres)"
              value={form.codigo_cliente}
              maxLength={5}
              onChange={(e) =>
                setForm({ ...form, codigo_cliente: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') })
              }
            />
            <Select
              label="Grupo"
              value={form.grupo_id}
              onChange={(e) => setForm({ ...form, grupo_id: e.target.value })}
            >
              <option value="">— Sin grupo —</option>
              {grupos.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.nombre}
                </option>
              ))}
            </Select>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex gap-2">
              <Button type="submit" disabled={loading}>
                {editId ? 'Guardar' : 'Crear'}
              </Button>
              {editId && (
                <Button type="button" variant="secondary" onClick={reset}>
                  Cancelar
                </Button>
              )}
            </div>
          </form>
        </Card>

        {/* Gestión de grupos */}
        <Card className="h-fit">
          <h2 className="font-bold text-base mb-4">Grupos ({grupos.length})</h2>
          <form onSubmit={crearGrupo} className="flex gap-2 items-end">
            <Input
              label="Nuevo grupo"
              value={nombreGrupo}
              onChange={(e) => setNombreGrupo(e.target.value)}
              className="flex-1"
            />
            <Button type="submit" disabled={grupoLoading}>
              Agregar
            </Button>
          </form>
          {grupoError && <p className="text-sm text-red-600 mt-2">{grupoError}</p>}
          <ul className="mt-4 divide-y">
            {grupos.map((g) => (
              <li key={g.id} className="flex items-center justify-between py-2 text-sm">
                <span className="font-medium">{g.nombre}</span>
                <Button variant="ghost" onClick={() => eliminarGrupo(g.id)} title="Eliminar grupo">
                  🗑️
                </Button>
              </li>
            ))}
            {grupos.length === 0 && <li className="py-3 text-center text-slate-400 text-sm">Sin grupos todavía</li>}
          </ul>
        </Card>
      </div>

      <Card className="lg:col-span-2 min-w-0">
        <div className="flex flex-wrap items-center justify-between mb-4 gap-3">
          <h2 className="font-bold text-base">Clientes ({clientes.length})</h2>
          <Input
            placeholder="Buscar por nombre o DNI…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-full sm:flex-1 sm:max-w-sm"
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs responsive-table">
            <thead>
              <tr className="text-left text-slate-500 border-b">
                <th className="py-2">Nombre</th>
                <th>DNI</th>
                <th>Código</th>
                <th>Email</th>
                <th>Teléfono</th>
                <th>Grupo</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} className="border-b last:border-0">
                  <td className="py-2 font-medium" data-label="Nombre">{c.nombre}</td>
                  <td data-label="DNI">{c.dni}</td>
                  <td data-label="Código">{c.codigo_cliente || '—'}</td>
                  <td data-label="Email">{c.email || '—'}</td>
                  <td data-label="Teléfono">{c.telefono || '—'}</td>
                  <td data-label="Grupo">{c.grupos?.nombre || '—'}</td>
                  <td className="text-right whitespace-nowrap" data-label="Acciones">
                    <Button variant="ghost" onClick={() => startEdit(c)}>✏️</Button>
                    <Button variant="ghost" onClick={() => remove(c.id)}>🗑️</Button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan="7" className="py-6 text-center text-slate-400">
                    Sin resultados
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
