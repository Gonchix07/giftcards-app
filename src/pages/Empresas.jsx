import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { Button, Input, Select, Card, Badge } from '../components/ui'

const COMERCIOS = ['Salón Mayorista', 'Tiendas Menor Coste']

const empty = { nombre: '', cuit: '', comercio: '', logo_url: '', activo: true }

export default function Empresas() {
  const [empresas, setEmpresas] = useState([])
  const [form, setForm] = useState(empty)
  const [editId, setEditId] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)

  async function load() {
    const { data } = await supabase.from('empresas').select('*').order('nombre')
    setEmpresas(data || [])
  }
  useEffect(() => {
    load()
  }, [])

  function startEdit(e) {
    setEditId(e.id)
    setForm({
      nombre: e.nombre,
      cuit: e.cuit || '',
      comercio: e.comercio || '',
      logo_url: e.logo_url || '',
      activo: e.activo,
    })
  }
  function reset() {
    setForm(empty)
    setEditId(null)
    setError('')
  }

  async function subirLogo(file) {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('El logo debe ser una imagen.')
      return
    }
    setError('')
    setUploading(true)
    const ext = file.name.split('.').pop()
    const path = `${crypto.randomUUID()}.${ext}`
    const { error: upErr } = await supabase.storage.from('logos').upload(path, file, { upsert: true })
    if (upErr) {
      setUploading(false)
      setError('No se pudo subir el logo: ' + upErr.message)
      return
    }
    const { data } = supabase.storage.from('logos').getPublicUrl(path)
    setForm((f) => ({ ...f, logo_url: data.publicUrl }))
    setUploading(false)
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
    <div className="grid lg:grid-cols-3 gap-6">
      <Card className="lg:col-span-1 h-fit">
        <h2 className="font-bold text-lg mb-4">{editId ? 'Editar empresa' : 'Nueva empresa'}</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <Input
            label="Nombre *"
            value={form.nombre}
            onChange={(e) => setForm({ ...form, nombre: e.target.value })}
            required
          />
          <Input label="CUIT" value={form.cuit} onChange={(e) => setForm({ ...form, cuit: e.target.value })} />
          <Select
            label="Comercio donde se usa la gift card"
            value={form.comercio}
            onChange={(e) => setForm({ ...form, comercio: e.target.value })}
          >
            <option value="">— Seleccionar —</option>
            {COMERCIOS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
          <div>
            <span className="block text-sm font-medium text-slate-600 mb-1">Logo del comercio</span>
            <div className="flex flex-wrap items-center gap-4 p-3 border border-dashed border-slate-300 rounded-lg bg-slate-50">
              {form.logo_url ? (
                <img
                  src={form.logo_url}
                  alt="logo"
                  className="h-16 w-16 object-contain rounded-lg border bg-white shrink-0"
                />
              ) : (
                <div className="h-16 w-16 grid place-items-center rounded-lg border-2 border-dashed border-slate-300 bg-white text-slate-300 text-2xl shrink-0">
                  🏬
                </div>
              )}
              <div className="flex flex-col items-start gap-1.5">
                <label
                  className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium cursor-pointer transition ${
                    uploading
                      ? 'bg-slate-200 text-slate-400 cursor-wait'
                      : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                  }`}
                >
                  {uploading ? '⏳ Subiendo…' : form.logo_url ? '🔄 Cambiar logo' : '⬆️ Seleccionar imagen'}
                  <input
                    type="file"
                    accept="image/*"
                    disabled={uploading}
                    onChange={(e) => subirLogo(e.target.files?.[0])}
                    className="hidden"
                  />
                </label>
                {form.logo_url && !uploading ? (
                  <button
                    type="button"
                    className="text-xs text-red-600 hover:underline"
                    onClick={() => setForm({ ...form, logo_url: '' })}
                  >
                    Quitar logo
                  </button>
                ) : (
                  <span className="text-xs text-slate-400">PNG o JPG, fondo claro recomendado</span>
                )}
              </div>
            </div>
          </div>
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
            <Button type="submit" disabled={loading || uploading}>
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
        <h2 className="font-bold text-lg mb-4">Empresas ({empresas.length})</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm responsive-table">
            <thead>
              <tr className="text-left text-slate-500 border-b">
                <th className="py-2">Nombre</th>
                <th>CUIT</th>
                <th></th>
                <th>Uso</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {empresas.map((e) => (
                <tr key={e.id} className="border-b last:border-0">
                  <td className="py-2 font-medium" data-label="Nombre">{e.nombre}</td>
                  <td data-label="CUIT">{e.cuit || '—'}</td>
                  <td data-label="Logo">
                    {e.logo_url ? (
                      <img
                        src={e.logo_url}
                        alt={e.comercio || ''}
                        title={e.comercio || ''}
                        className="h-9 w-9 object-contain rounded border bg-white"
                      />
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td data-label="Uso">{e.comercio || '—'}</td>
                  <td data-label="Estado">{e.activo ? <Badge color="green">Activa</Badge> : <Badge>Inactiva</Badge>}</td>
                  <td className="text-right whitespace-nowrap" data-label="Acciones">
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
                  <td colSpan="6" className="py-6 text-center text-slate-400">
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
