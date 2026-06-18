import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { Button, Input, Card, Badge } from '../components/ui'

const empty = { nombre: '', cuit: '', activo: true }

export default function Empresas() {
  const [empresas, setEmpresas] = useState([])
  const [form, setForm] = useState(empty)
  const [editId, setEditId] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function load() {
    const { data } = await supabase.from('empresas').select('*').order('nombre')
    setEmpresas(data || [])
  }
  useEffect(() => {
    load()
  }, [])

  function startEdit(e) {
    setEditId(e.id)
    setForm({ nombre: e.nombre, cuit: e.cuit || '', activo: e.activo })
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
    const payload = { ...form }
    const res = editId
      ? await supabase.from('empresas').update(payload).eq('id', editId)
      : await supabase.from('empresas').insert(payload)
    setLoading(false)
    if (res.error) {
      setError(res.error.message)
      return
    }
    reset()
    load()
  }

  async function remove(id) {
    if (!confirm('¿Eliminar esta empresa? (no se puede si tiene gift cards asociadas)')) return
    const { error } = await supabase.from('empresas').delete().eq('id', id)
    if (error) alert(error.message)
    else load()
  }

  return (
    <div className="grid md:grid-cols-3 gap-6">
      <Card className="md:col-span-1 h-fit">
        <h2 className="font-bold text-lg mb-4">{editId ? 'Editar empresa' : 'Nueva empresa'}</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <Input
            label="Nombre *"
            value={form.nombre}
            onChange={(e) => setForm({ ...form, nombre: e.target.value })}
            required
          />
          <Input label="CUIT" value={form.cuit} onChange={(e) => setForm({ ...form, cuit: e.target.value })} />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.activo}
              onChange={(e) => setForm({ ...form, activo: e.target.checked })}
            />
            Activa
          </label>
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

      <Card className="md:col-span-2">
        <h2 className="font-bold text-lg mb-4">Empresas ({empresas.length})</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b">
                <th className="py-2">Nombre</th>
                <th>CUIT</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {empresas.map((e) => (
                <tr key={e.id} className="border-b last:border-0">
                  <td className="py-2 font-medium">{e.nombre}</td>
                  <td>{e.cuit || '—'}</td>
                  <td>{e.activo ? <Badge color="green">Activa</Badge> : <Badge>Inactiva</Badge>}</td>
                  <td className="text-right whitespace-nowrap">
                    <Button variant="ghost" onClick={() => startEdit(e)}>
                      ✏️
                    </Button>
                    <Button variant="ghost" onClick={() => remove(e.id)}>
                      🗑️
                    </Button>
                  </td>
                </tr>
              ))}
              {empresas.length === 0 && (
                <tr>
                  <td colSpan="4" className="py-6 text-center text-slate-400">
                    Sin empresas todavía
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
