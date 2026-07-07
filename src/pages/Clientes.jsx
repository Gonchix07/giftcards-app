import { useEffect, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import ExcelJS from 'exceljs'
import { supabase } from '../supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { Button, Input, Select, Card } from '../components/ui'

const empty = { nombre: '', dni: '', email: '', telefono: '', codigo_cliente: '', grupo_id: '' }

// Máscara de teléfono: 223-5937766 (código + número)
function formatTel(v) {
  const d = (v || '').replace(/\D/g, '').slice(0, 10)
  return d.length <= 3 ? d : d.slice(0, 3) + '-' + d.slice(3)
}

export default function Clientes() {
  const { profile } = useAuth()
  const [clientes, setClientes] = useState([])
  const [grupos, setGrupos] = useState([])
  const [form, setForm] = useState(empty)
  const [editId, setEditId] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [q, setQ] = useState('')

  function auditar(accion, cliente, detalle) {
    supabase.from('auditoria').insert({
      usuario_email: profile?.email,
      usuario_rol: profile?.role,
      accion,
      cliente,
      detalle,
    })
  }

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
    const grupo = grupos.find((g) => g.id === form.grupo_id)
    auditar(
      editId ? 'cliente_modificado' : 'cliente_creado',
      form.nombre,
      editId
        ? `Cliente "${form.nombre}" (DNI: ${form.dni}) modificado`
        : `Cliente "${form.nombre}" (DNI: ${form.dni}, email: ${form.email}${grupo ? ', grupo: ' + grupo.nombre : ''}) creado`,
    )
    reset()
    load()
  }

  async function remove(id) {
    if (!confirm('¿Eliminar este cliente? (no se puede si tiene gift cards asignadas)')) return
    const cl = clientes.find((c) => c.id === id)
    const { error } = await supabase.from('clientes').delete().eq('id', id)
    if (error) alert(error.message)
    else {
      auditar('cliente_eliminado', cl?.nombre, `Cliente "${cl?.nombre}" (DNI: ${cl?.dni}) eliminado`)
      load()
    }
  }

  // ---------- Importación masiva ----------
  const fileRef = useRef(null)
  const [importando, setImportando] = useState(false)
  const [importResult, setImportResult] = useState(null)

  async function descargarPlantilla() {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Clientes')

    ws.columns = [
      { header: 'nombre *', key: 'nombre', width: 28 },
      { header: 'dni *', key: 'dni', width: 14 },
      { header: 'email *', key: 'email', width: 30 },
      { header: 'telefono (opcional)', key: 'telefono', width: 18 },
      { header: 'codigo_cliente (opcional, 5 car.)', key: 'codigo_cliente', width: 28 },
      { header: 'grupo (opcional)', key: 'grupo', width: 22 },
    ]

    ws.getRow(1).eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4338CA' } }
      cell.alignment = { vertical: 'middle', horizontal: 'center' }
    })
    ws.getRow(1).height = 22

    // Fila de ejemplo
    ws.addRow({
      nombre: 'Juan Pérez',
      dni: '30123456',
      email: 'juan@ejemplo.com',
      telefono: '223-5937766',
      codigo_cliente: 'AB123',
      grupo: grupos[0]?.nombre || '',
    })

    // Dropdown para grupo
    if (grupos.length > 0) {
      const lista = ['Sin grupo', ...grupos.map((g) => g.nombre)].join(',')
      for (let r = 2; r <= 1001; r++) {
        ws.getCell(`F${r}`).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [`"${lista}"`],
          showErrorMessage: true,
          errorStyle: 'warning',
          errorTitle: 'Grupo inválido',
          error: 'Elegí un grupo de la lista o dejalo vacío',
        }
      }
    }

    const buffer = await wb.xlsx.writeBuffer()
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'plantilla_clientes.xlsx'
    a.click()
    URL.revokeObjectURL(url)
  }

  async function importarArchivo(e) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setImportResult(null)
    setImportando(true)

    try {
      const buffer = await file.arrayBuffer()
      const wb = XLSX.read(buffer, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const filas = XLSX.utils.sheet_to_json(ws, { defval: '' })

      const ok = []
      const errores = []

      for (const [i, fila] of filas.entries()) {
        const num = i + 2
        const nombre = String(fila['nombre *'] || fila['nombre'] || '').trim()
        const dni = String(fila['dni *'] || fila['dni'] || '').trim()
        const email = String(fila['email *'] || fila['email'] || '').trim()
        const telefono = String(fila['telefono (opcional)'] || fila['telefono'] || '').trim()
        const codigo_cliente = String(fila['codigo_cliente (opcional, 5 car.)'] || fila['codigo_cliente'] || '').trim().toUpperCase()
        const grupoNombre = String(fila['grupo (opcional)'] || fila['grupo'] || '').trim()

        // Validaciones
        if (!nombre) { errores.push({ num, nombre: '—', motivo: 'Nombre vacío' }); continue }
        if (!dni) { errores.push({ num, nombre, motivo: 'DNI vacío' }); continue }
        if (!email) { errores.push({ num, nombre, motivo: 'Email vacío' }); continue }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { errores.push({ num, nombre, motivo: 'Email inválido' }); continue }
        if (codigo_cliente && !/^[A-Z0-9]{5}$/.test(codigo_cliente)) { errores.push({ num, nombre, motivo: `Código de cliente inválido: "${codigo_cliente}" (debe tener 5 caracteres alfanuméricos)` }); continue }

        // Resolver grupo por nombre ("Sin grupo" o vacío → null)
        const sinGrupo = !grupoNombre || grupoNombre.toLowerCase() === 'sin grupo'
        const grupo = sinGrupo ? null : grupos.find((g) => g.nombre.toLowerCase() === grupoNombre.toLowerCase())
        if (!sinGrupo && !grupo) { errores.push({ num, nombre, motivo: `Grupo no encontrado: "${grupoNombre}"` }); continue }

        const payload = {
          nombre,
          dni,
          email,
          telefono: telefono || null,
          codigo_cliente: codigo_cliente || null,
          grupo_id: grupo?.id || null,
        }

        const { error } = await supabase.from('clientes').insert(payload)
        if (error) {
          const m = error.message
          const motivo = m.includes('codigo_cliente')
            ? 'Ya existe un cliente con ese código'
            : m.includes('dni')
            ? 'Ya existe un cliente con ese DNI'
            : m.includes('email')
            ? 'Ya existe un cliente con ese email'
            : m
          errores.push({ num, nombre, motivo })
        } else {
          auditar('cliente_creado', nombre, `Cliente "${nombre}" (DNI: ${dni}) creado por importación masiva`)
          ok.push(`${nombre} (${dni})`)
        }
      }

      setImportResult({ ok, errores })
      if (ok.length > 0) load()
    } catch (err) {
      setImportResult({ ok: [], errores: [{ num: '—', nombre: '—', motivo: 'No se pudo leer el archivo: ' + err.message }] })
    } finally {
      setImportando(false)
    }
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
    auditar('grupo_creado', null, `Grupo "${nombreGrupo.trim()}" creado`)
    setNombreGrupo('')
    load()
  }

  async function eliminarGrupo(id) {
    if (!confirm('¿Eliminar este grupo? Los clientes asignados quedarán sin grupo.')) return
    const gr = grupos.find((g) => g.id === id)
    const { error } = await supabase.from('grupos').delete().eq('id', id)
    if (error) alert(error.message)
    else {
      auditar('grupo_eliminado', null, `Grupo "${gr?.nombre}" eliminado`)
      load()
    }
  }

  const filtered = clientes.filter(
    (c) =>
      c.nombre.toLowerCase().includes(q.toLowerCase()) ||
      c.dni.includes(q) ||
      (c.codigo_cliente || '').toLowerCase().includes(q.toLowerCase())
  )

  return (
    <div className="space-y-6 text-sm">
      {/* Formulario horizontal */}
      <Card>
        <h2 className="font-bold text-base mb-4">{editId ? 'Editar cliente' : 'Nuevo cliente'}</h2>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 items-end">
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
            label="Código de cliente (opcional, 5 car.)"
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
              <option key={g.id} value={g.id}>{g.nombre}</option>
            ))}
          </Select>
          {error && <p className="text-sm text-red-600 sm:col-span-2 lg:col-span-3">{error}</p>}
          <div className="flex gap-2 sm:col-span-2 lg:col-span-3">
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

      {/* Grupos e Importar en la misma fila */}
      <div className="grid lg:grid-cols-2 gap-6">
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
            <Button type="submit" disabled={grupoLoading}>Agregar</Button>
          </form>
          {grupoError && <p className="text-sm text-red-600 mt-2">{grupoError}</p>}
          <ul className="mt-4 divide-y">
            {grupos.map((g) => (
              <li key={g.id} className="flex items-center justify-between py-2 text-sm">
                <span className="font-medium">{g.nombre}</span>
                <Button variant="ghost" onClick={() => eliminarGrupo(g.id)} title="Eliminar grupo">🗑️</Button>
              </li>
            ))}
            {grupos.length === 0 && <li className="py-3 text-center text-slate-400 text-sm">Sin grupos todavía</li>}
          </ul>
        </Card>

        {/* Importación masiva */}
        <Card className="h-fit">
          <h2 className="font-bold text-base mb-3">Importar clientes</h2>
          <p className="text-xs text-slate-500 mb-3">
            Descargá la plantilla, completala y subila para crear múltiples clientes a la vez. El campo grupo tiene lista desplegable en el Excel.
          </p>
          <div className="flex flex-wrap gap-2 items-center mb-4">
            <Button variant="secondary" onClick={descargarPlantilla}>⬇️ Descargar plantilla</Button>
            <Button variant="secondary" disabled={importando} onClick={() => fileRef.current?.click()}>
              {importando ? 'Importando…' : '⬆️ Subir archivo Excel'}
            </Button>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={importarArchivo} />
          </div>
          {importResult && (
            <div className="space-y-3 text-xs">
              {importResult.ok.length > 0 && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                  <p className="font-semibold text-green-700 mb-1">✅ {importResult.ok.length} cliente{importResult.ok.length !== 1 ? 's' : ''} creado{importResult.ok.length !== 1 ? 's' : ''}</p>
                  <ul className="list-disc list-inside text-green-600 space-y-0.5">
                    {importResult.ok.map((item, i) => <li key={i}>{item}</li>)}
                  </ul>
                </div>
              )}
              {importResult.errores.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="font-semibold text-red-700 mb-2">❌ {importResult.errores.length} fila{importResult.errores.length !== 1 ? 's' : ''} con error</p>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-red-500 border-b border-red-200">
                        <th className="pb-1 pr-3">Fila</th>
                        <th className="pb-1 pr-3">Nombre</th>
                        <th className="pb-1">Motivo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importResult.errores.map((e, i) => (
                        <tr key={i} className="border-b border-red-100 last:border-0">
                          <td className="py-1 pr-3 text-slate-500">{e.num}</td>
                          <td className="py-1 pr-3 font-medium">{e.nombre}</td>
                          <td className="py-1 text-red-600">{e.motivo}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {importResult.ok.length === 0 && importResult.errores.length === 0 && (
                <p className="text-slate-400">El archivo no tenía filas de datos.</p>
              )}
            </div>
          )}
        </Card>
      </div>

      <Card className="lg:col-span-3 min-w-0">
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
