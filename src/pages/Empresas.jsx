import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../contexts/AuthContext'
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
  const { profile } = useAuth()
  const [empresas, setEmpresas] = useState([])
  const [comercios, setComercios] = useState([])
  const [form, setForm] = useState(empty)
  const [editId, setEditId] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  function auditar(accion, empresa, detalle) {
    supabase.from('auditoria').insert({
      usuario_email: profile?.email,
      usuario_rol: profile?.role,
      accion,
      empresa,
      detalle,
    })
  }

  // Alta de comercios
  const [comForm, setComForm] = useState({ nombre: '', logo_url: '', color: '#1e3a8a', template_url: '', qr_posicion: 'izquierda' })
  const [comEditId, setComEditId] = useState(null)
  const [comError, setComError] = useState('')
  const [comLoading, setComLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadingTpl, setUploadingTpl] = useState(false)

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
    auditar(
      editId ? 'empresa_modificada' : 'empresa_creada',
      form.nombre,
      editId
        ? `Empresa "${form.nombre}" modificada (CUIT: ${form.cuit || '—'}, comercio: ${form.comercio || '—'})`
        : `Empresa "${form.nombre}" creada (CUIT: ${form.cuit || '—'}, comercio: ${form.comercio || '—'})`,
    )
    reset()
    load()
  }

  async function remove(id) {
    if (!confirm('¿Eliminar esta empresa? (no se puede si tiene gift cards asociadas)')) return
    const emp = empresas.find((e) => e.id === id)
    const { error } = await supabase.from('empresas').delete().eq('id', id)
    if (error) alert(error.message)
    else {
      auditar('empresa_eliminada', emp?.nombre, `Empresa "${emp?.nombre}" eliminada`)
      load()
    }
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

  async function subirTemplate(file) {
    if (!file) return
    if (!file.type.startsWith('image/')) return setComError('El template debe ser una imagen PNG.')
    setComError('')
    setUploadingTpl(true)
    const ext = file.name.split('.').pop()
    const path = `tpl_${crypto.randomUUID()}.${ext}`
    const { error: upErr } = await supabase.storage.from('logos').upload(path, file, { upsert: true })
    if (upErr) {
      setUploadingTpl(false)
      return setComError('No se pudo subir el template: ' + upErr.message)
    }
    const { data } = supabase.storage.from('logos').getPublicUrl(path)
    setComForm((f) => ({ ...f, template_url: data.publicUrl }))
    setUploadingTpl(false)
  }

  function startEditComercio(c) {
    setComEditId(c.id)
    setComError('')
    setComForm({
      nombre: c.nombre,
      logo_url: c.logo_url || '',
      color: c.color || '#1e3a8a',
      template_url: c.template_url || '',
      qr_posicion: c.qr_posicion || 'izquierda',
    })
  }
  function resetComercio() {
    setComEditId(null)
    setComError('')
    setComForm({ nombre: '', logo_url: '', color: '#1e3a8a', template_url: '', qr_posicion: 'izquierda' })
  }

  async function crearComercio(e) {
    e.preventDefault()
    setComError('')
    if (!comForm.nombre.trim()) return
    setComLoading(true)
    const nuevoNombre = comForm.nombre.trim()
    const payload = {
      nombre: nuevoNombre,
      logo_url: comForm.logo_url || null,
      color: comForm.color,
      template_url: comForm.template_url || null,
      qr_posicion: comForm.qr_posicion || 'izquierda',
    }
    const nombreAnterior = comEditId ? comercios.find((c) => c.id === comEditId)?.nombre : null
    const { error } = comEditId
      ? await supabase.from('comercios').update(payload).eq('id', comEditId)
      : await supabase.from('comercios').insert(payload)
    if (error) {
      setComLoading(false)
      setComError(error.message.includes('duplicate') ? 'Ya existe un comercio con ese nombre.' : error.message)
      return
    }
    // Si cambió el nombre, propaga a empresas y cajeros que lo referencian por nombre
    if (nombreAnterior && nombreAnterior !== nuevoNombre) {
      await supabase.from('empresas').update({ comercio: nuevoNombre }).eq('comercio', nombreAnterior)
      await supabase.from('profiles').update({ comercio: nuevoNombre }).eq('comercio', nombreAnterior)
    }
    auditar(
      comEditId ? 'comercio_modificado' : 'comercio_creado',
      nuevoNombre,
      comEditId
        ? `Comercio "${nuevoNombre}" modificado${nombreAnterior && nombreAnterior !== nuevoNombre ? ` (antes: "${nombreAnterior}")` : ''}`
        : `Comercio "${nuevoNombre}" creado`,
    )
    setComLoading(false)
    resetComercio()
    load()
  }

  async function eliminarComercio(id) {
    if (!confirm('¿Eliminar este comercio?')) return
    const com = comercios.find((c) => c.id === id)
    const { error } = await supabase.from('comercios').delete().eq('id', id)
    if (error) alert(error.message)
    else {
      auditar('comercio_eliminado', com?.nombre, `Comercio "${com?.nombre}" eliminado`)
      load()
    }
  }

  return (
    <div className="grid lg:grid-cols-3 gap-6 text-sm">
      <div className="lg:col-span-1 space-y-6">
        <Card className="h-fit">
          <h2 className="font-bold text-base mb-4">{editId ? 'Editar empresa' : 'Nueva empresa'}</h2>
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
          <h2 className="font-bold text-base mb-1">Comercios ({comercios.length})</h2>
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
              <span className="text-slate-400 text-xs">(se usa si no hay template)</span>
            </label>

            {/* Template PNG de la tarjeta */}
            <div>
              <span className="block text-sm font-medium text-slate-600 mb-1">Template PNG de la tarjeta</span>
              <div className="flex flex-wrap items-center gap-4 p-3 border border-dashed border-slate-300 rounded-lg bg-slate-50">
                {comForm.template_url ? (
                  <img
                    src={comForm.template_url}
                    alt="template"
                    className="h-16 rounded-lg border bg-white object-cover shrink-0"
                    style={{ aspectRatio: '1.586' }}
                  />
                ) : (
                  <div className="h-16 grid place-items-center rounded-lg border-2 border-dashed border-slate-300 bg-white text-slate-300 text-2xl shrink-0 px-4">
                    🖼️
                  </div>
                )}
                <div className="flex flex-col items-start gap-1.5">
                  <label
                    className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium cursor-pointer transition ${
                      uploadingTpl ? 'bg-slate-200 text-slate-400 cursor-wait' : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                    }`}
                  >
                    {uploadingTpl ? '⏳ Subiendo…' : comForm.template_url ? '🔄 Cambiar template' : '⬆️ Importar modelo PNG'}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      disabled={uploadingTpl}
                      onChange={(e) => subirTemplate(e.target.files?.[0])}
                      className="hidden"
                    />
                  </label>
                  {comForm.template_url && !uploadingTpl && (
                    <button
                      type="button"
                      className="text-xs text-red-600 hover:underline"
                      onClick={() => setComForm({ ...comForm, template_url: '' })}
                    >
                      Quitar template
                    </button>
                  )}
                </div>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                El sistema superpondrá el QR y el código sobre este modelo.
              </p>
            </div>

            {/* Posición del QR en el template */}
            {comForm.template_url && (
              <div>
                <span className="block text-sm font-medium text-slate-600 mb-1">Posición del QR en el template</span>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="qr_posicion"
                      value="izquierda"
                      checked={comForm.qr_posicion === 'izquierda'}
                      onChange={() => setComForm({ ...comForm, qr_posicion: 'izquierda' })}
                    />
                    ← Izquierda
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="qr_posicion"
                      value="derecha"
                      checked={comForm.qr_posicion === 'derecha'}
                      onChange={() => setComForm({ ...comForm, qr_posicion: 'derecha' })}
                    />
                    → Derecha
                  </label>
                </div>
              </div>
            )}

            {comError && <p className="text-sm text-red-600">{comError}</p>}
            <div className="flex gap-2">
              <Button type="submit" disabled={comLoading || uploading}>
                {comEditId ? 'Guardar' : 'Agregar comercio'}
              </Button>
              {comEditId && (
                <Button type="button" variant="secondary" onClick={resetComercio}>
                  Cancelar
                </Button>
              )}
            </div>
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
                <div className="flex shrink-0">
                  <Button variant="ghost" onClick={() => startEditComercio(c)} title="Editar comercio">
                    ✏️
                  </Button>
                  <Button variant="ghost" onClick={() => eliminarComercio(c.id)} title="Eliminar comercio">
                    🗑️
                  </Button>
                </div>
              </li>
            ))}
            {comercios.length === 0 && <li className="py-3 text-center text-slate-400 text-sm">Sin comercios todavía</li>}
          </ul>
        </Card>
      </div>

      <Card className="lg:col-span-2 min-w-0">
        <h2 className="font-bold text-base mb-4">Empresas ({empresas.length})</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-xs responsive-table">
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
