import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { Button, Input, Select, Card, Badge } from '../components/ui'

// Máscara de CUIT: transforma lo escrito en XX-XXXXXXXX-X
function formatCuit(value) {
  const d = (value || '').replace(/\D/g, '').slice(0, 11)
  const p1 = d.slice(0, 2)
  const p2 = d.slice(2, 10)
  const p3 = d.slice(10, 11)
  let out = p1
  if (d.length > 2) out += '-' + p2
  if (d.length > 10) out += '-' + p3
  return out
}

const empty = { nombre: '', cuit: '', comercio: '', activo: true }

export default function Empresas() {
  const [empresas, setEmpresas] = useState([])
  const [comercios, setComercios] = useState([])
  const [form, setForm] = useState(empty)
  const [editId, setEditId] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Alta de comercios
  const [comForm, setComForm] = useState({ nombre: '', logo_url: '', color: '#1e3a8a' })
  const [comError, setComError] = useState('')
  const [comLoading, setComLoading] = useState(false)
  const [uploading, setUploading] = useState(false)

  async function load() {
    const [emp, com] = await Promise.all([
      supabase.from('empresas').select('*').order('nombre'),
      supabase.from('comercios').select('*').order('nombre'),
    ])
    setEmpresas(emp.data || [])
    setComercios(com.data || [])
  }
  useEffect(() => {
    load()
  }, [])

  const logoDe = (nombreComercio) => comercios.find((c) => c.nombre === nombreComercio)?.logo_url || null

  function startEdit(e) {
    setEditId(e.id)
    setForm({ nombre: e.nombre, cuit: e.cuit || '', comercio: e.comercio || '', activo: e.activo })
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
      ? await supabase.from('empresas').update(form).eq('id', editId)
      : await supabase.from('empresas').insert(form)
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

  // ---------- Comercios ----------
  async function subirLogo(file) {
    if (!file) return
    if (!file.type.startsWith('image/')) return setComError('El logo debe ser una imagen.')
    setComError('')
    setUploading(true)
    const ext = file.name.split('.').pop()
    const path = `${crypto.randomUUID()}.${ext}`
    const { error: upErr } = await supabase.storage.from('logos').upload(path, file, { upsert: true })
    if (upErr) {
      setUploading(false)
      return setComError('No se pudo subir el logo: ' + upErr.message)
    }
    const { data } = supabase.storage.from('logos').getPublicUrl(path)
    setComForm((f) => ({ ...f, logo_url: data.publicUrl }))
    setUploading(false)
  }

  async function crearComercio(e) {
    e.preventDefault()
    setComError('')
    if (!comForm.nombre.trim()) return
    setComLoading(true)
    const { error } = await supabase
      .from('comercios')
      .insert({ nombre: comForm.nombre.trim(), logo_url: comForm.logo_url || null, color: comForm.color })
    setComLoading(false)
    if (error) {
      setComError(error.message.includes('duplicate') ? 'Ya existe un comercio con ese nombre.' : error.message)
      return
    }
    setComForm({ nombre: '', logo_url: '', color: '#1e3a8a' })
    load()
  }

  async function eliminarComercio(id) {
    if (!confirm('¿Eliminar este comercio?')) return
    const { error } = await supabase.from('comercios').delete().eq('id', id)
    if (error) alert(error.message)
    else load()
  }

  return (
    <div className="grid lg:grid-cols-3 gap-6">
      <div className="lg:col-span-1 space-y-6">
        <Card className="h-fit">
          <h2 className="font-bold text-lg mb-4">{editId ? 'Editar empresa' : 'Nueva empresa'}</h2>
          <form onSubmit={handleSubmit} className="space-y-3">
            <Input
              label="Nombre *"
              value={form.nombre}
              onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              required
            />
            <Input
              label="CUIT"
              value={form.cuit}
              onChange={(e) => setForm({ ...form, cuit: formatCuit(e.target.value) })}
              placeholder="XX-XXXXXXXX-X"
              inputMode="numeric"
              maxLength={13}
            />
            <Select
              label="Comercio donde se usa la gift card"
              value={form.comercio}
              onChange={(e) => setForm({ ...form, comercio: e.target.value })}
            >
              <option value="">— Seleccionar —</option>
              {comercios.map((c) => (
                <option key={c.id} value={c.nombre}>
                  {c.nombre}
                </option>
              ))}
            </Select>
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

        {/* Gestión de comercios */}
        <Card className="h-fit">
          <h2 className="font-bold text-lg mb-1">Comercios ({comercios.length})</h2>
          <p className="text-sm text-slate-500 mb-4">El logo es propio del comercio donde se usa la gift card.</p>
          <form onSubmit={crearComercio} className="space-y-3">
            <Input
              label="Nombre del comercio"
              value={comForm.nombre}
              onChange={(e) => setComForm({ ...comForm, nombre: e.target.value })}
            />
            <div>
              <span className="block text-sm font-medium text-slate-600 mb-1">Logo</span>
              <div className="flex flex-wrap items-center gap-4 p-3 border border-dashed border-slate-300 rounded-lg bg-slate-50">
                {comForm.logo_url ? (
                  <img src={comForm.logo_url} alt="logo" className="h-16 w-16 object-contain rounded-lg border bg-white shrink-0" />
                ) : (
                  <div className="h-16 w-16 grid place-items-center rounded-lg border-2 border-dashed border-slate-300 bg-white text-slate-300 text-2xl shrink-0">
                    🏬
                  </div>
                )}
                <div className="flex flex-col items-start gap-1.5">
                  <label
                    className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium cursor-pointer transition ${
                      uploading ? 'bg-slate-200 text-slate-400 cursor-wait' : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                    }`}
                  >
                    {uploading ? '⏳ Subiendo…' : comForm.logo_url ? '🔄 Cambiar logo' : '⬆️ Seleccionar imagen'}
                    <input
                      type="file"
                      accept="image/*"
                      disabled={uploading}
                      onChange={(e) => subirLogo(e.target.files?.[0])}
                      className="hidden"
                    />
                  </label>
                  {comForm.logo_url && !uploading && (
                    <button
                      type="button"
                      className="text-xs text-red-600 hover:underline"
                      onClick={() => setComForm({ ...comForm, logo_url: '' })}
                    >
                      Quitar logo
                    </button>
                  )}
                </div>
              </div>
            </div>
            <label className="flex items-center gap-3 text-sm">
              <span className="font-medium text-slate-600">Color de la tarjeta</span>
              <input
                type="color"
                value={comForm.color}
                onChange={(e) => setComForm({ ...comForm, color: e.target.value })}
                className="h-8 w-12 rounded border border-slate-300 bg-white p-0.5 cursor-pointer"
              />
            </label>
            {comError && <p className="text-sm text-red-600">{comError}</p>}
            <Button type="submit" disabled={comLoading || uploading}>
              Agregar comercio
            </Button>
          </form>

          <ul className="mt-4 divide-y">
            {comercios.map((c) => (
              <li key={c.id} className="flex items-center justify-between py-2 gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  {c.logo_url ? (
                    <img src={c.logo_url} alt="" className="h-9 w-9 object-contain rounded border bg-white shrink-0" />
                  ) : (
                    <span className="h-9 w-9 grid place-items-center text-slate-300">—</span>
                  )}
                  <span className="font-medium truncate">{c.nombre}</span>
                  <span
                    className="h-4 w-4 rounded-full border shrink-0"
                    style={{ backgroundColor: c.color || '#1e3a8a' }}
                    title={c.color}
                  />
                </div>
                <Button variant="ghost" onClick={() => eliminarComercio(c.id)} title="Eliminar comercio">
                  🗑️
                </Button>
              </li>
            ))}
            {comercios.length === 0 && <li className="py-3 text-center text-slate-400 text-sm">Sin comercios todavía</li>}
          </ul>
        </Card>
      </div>

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
                    {logoDe(e.comercio) ? (
                      <img
                        src={logoDe(e.comercio)}
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
