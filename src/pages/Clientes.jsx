import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { Button, Input, Card } from '../components/ui'

const empty = { nombre: '', dni: '', email: '' }

export default function Clientes() {
  const [clientes, setClientes] = useState([])
  const [form, setForm] = useState(empty)
  const [editId, setEditId] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [q, setQ] = useState('')

  async function load() {
    const { data } = await supabase.from('clientes').select('*').order('nombre')
    setClientes(data || [])
  }
  useEffect(() => {
    load()
  }, [])

  function startEdit(c) {
    setEditId(c.id)
    setForm({ nombre: c.nombre, dni: c.dni, email: c.email || '' })
  }
  function reset() {
    setForm(empty)
    setEditId(null)
    setError('')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const res = editId
      ? await supabase.from('clientes').update(form).eq('id', editId)
      : await supabase.from('clientes').insert(form)
    setLoading(false)
    if (res.error) {
      setError(res.error.message.includes('duplicate') ? 'Ya existe un cliente con ese DNI.' : res.error.message)
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

  const filtered = clientes.filter(
    (c) => c.nombre.toLowerCase().includes(q.toLowerCase()) || c.dni.includes(q)
  )

  return (
    <div className="grid lg:grid-cols-3 gap-6">
      <Card className="lg:col-span-1 h-fit">
        <h2 className="font-bold text-lg mb-4">{editId ? 'Editar cliente' : 'Nuevo cliente'}</h2>
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
            label="Email"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
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

      <Card className="lg:col-span-2 min-w-0">
        <div className="flex flex-wrap items-center justify-between mb-4 gap-3">
          <h2 className="font-bold text-lg">Clientes ({clientes.length})</h2>
          <Input
            placeholder="Buscar por nombre o DNI…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-full sm:flex-1 sm:max-w-sm"
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm responsive-table">
            <thead>
              <tr className="text-left text-slate-500 border-b">
                <th className="py-2">Nombre</th>
                <th>DNI</th>
                <th>Email</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} className="border-b last:border-0">
                  <td className="py-2 font-medium" data-label="Nombre">{c.nombre}</td>
                  <td data-label="DNI">{c.dni}</td>
                  <td data-label="Email">{c.email || '—'}</td>
                  <td className="text-right whitespace-nowrap" data-label="Acciones">
                    <Button variant="ghost" onClick={() => startEdit(c)}>✏️</Button>
                    <Button variant="ghost" onClick={() => remove(c.id)}>🗑️</Button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan="4" className="py-6 text-center text-slate-400">
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
