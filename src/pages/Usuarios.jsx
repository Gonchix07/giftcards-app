import { useEffect, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import ExcelJS from 'exceljs'
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

  // ---------- Importación masiva ----------
  const fileRef = useRef(null)
  const [importando, setImportando] = useState(false)
  const [importResult, setImportResult] = useState(null) // { ok: [], errores: [] }

  const ROLES_VALIDOS = ['cajero', 'atencion', 'tesoreria', 'admin']

  async function descargarPlantilla() {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Usuarios')

    // Encabezados
    ws.columns = [
      { header: 'email *', key: 'email', width: 32 },
      { header: 'contraseña * (mín. 6 caracteres)', key: 'password', width: 30 },
      { header: 'rol *', key: 'role', width: 18 },
      { header: 'comercio (solo cajero)', key: 'comercio', width: 24 },
    ]

    // Estilo de encabezado
    ws.getRow(1).eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4338CA' } }
      cell.alignment = { vertical: 'middle', horizontal: 'center' }
    })
    ws.getRow(1).height = 22

    // Filas de ejemplo
    ws.addRow({ email: 'usuario@ejemplo.com', password: 'clave123', role: 'cajero', comercio: comercios[0]?.nombre || '' })

    // Data validation — rol (filas 2 a 1001)
    for (let r = 2; r <= 1001; r++) {
      ws.getCell(`C${r}`).dataValidation = {
        type: 'list',
        allowBlank: false,
        formulae: ['"cajero,atencion,tesoreria,admin"'],
        showErrorMessage: true,
        errorTitle: 'Rol inválido',
        error: 'Elegí: cajero, atencion, tesoreria o admin',
      }
    }

    // Data validation — comercio (solo si hay comercios cargados)
    if (comercios.length > 0) {
      const lista = comercios.map((c) => c.nombre).join(',')
      for (let r = 2; r <= 1001; r++) {
        ws.getCell(`D${r}`).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [`"${lista}"`],
          showErrorMessage: true,
          errorTitle: 'Comercio inválido',
          error: `Elegí uno de la lista o dejalo vacío`,
        }
      }
    }

    const buffer = await wb.xlsx.writeBuffer()
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'plantilla_usuarios.xlsx'
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

      const headers = await authHeader()
      const ok = []
      const errores = []

      for (const [i, fila] of filas.entries()) {
        const num = i + 2 // fila real en Excel (1 = encabezado)
        const email = String(fila['email *'] || fila['email'] || '').trim()
        const password = String(fila['contraseña * (mín. 6 caracteres)'] || fila['contraseña'] || fila['password'] || '').trim()
        const role = String(fila['rol *'] || fila['rol'] || fila['role'] || '').trim().toLowerCase()
        const comercio = String(fila['comercio (solo cajero)'] || fila['comercio'] || '').trim()

        // Validaciones
        if (!email) { errores.push({ num, email: email || '—', motivo: 'Email vacío' }); continue }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { errores.push({ num, email, motivo: 'Email inválido' }); continue }
        if (password.length < 6) { errores.push({ num, email, motivo: 'Contraseña menor a 6 caracteres' }); continue }
        if (!ROLES_VALIDOS.includes(role)) { errores.push({ num, email, motivo: `Rol inválido: "${role}"` }); continue }

        try {
          const resp = await fetch('/api/admin-users', {
            method: 'POST',
            headers,
            body: JSON.stringify({ email, password, role, comercio: role === 'cajero' ? comercio : '' }),
          })
          const json = await resp.json().catch(() => ({}))
          if (!resp.ok) {
            errores.push({ num, email, motivo: json.error || 'Error del servidor' })
          } else {
            ok.push(email)
          }
        } catch (err) {
          errores.push({ num, email, motivo: err.message })
        }
      }

      setImportResult({ ok, errores })
      if (ok.length > 0) load()
    } catch (err) {
      setImportResult({ ok: [], errores: [{ num: '—', email: '—', motivo: 'No se pudo leer el archivo: ' + err.message }] })
    } finally {
      setImportando(false)
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
    <div className="space-y-6 text-sm">
      {/* Formulario horizontal */}
      <Card>
        <h2 className="font-bold text-base mb-4">{editId ? 'Editar usuario' : 'Nuevo usuario'}</h2>
        <form onSubmit={guardar} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
          <Input
            label="Email *"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            required
          />
          <Input
            label={editId ? 'Contraseña (vacío = sin cambiar)' : 'Contraseña * (mín. 6)'}
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
              <option key={c.nombre} value={c.nombre}>{c.nombre}</option>
            ))}
          </Select>
          {error && <p className="text-sm text-red-600 sm:col-span-2 lg:col-span-4">{error}</p>}
          {msg && <p className="text-sm text-green-700 sm:col-span-2 lg:col-span-4">{msg}</p>}
          <div className="flex gap-2 sm:col-span-2 lg:col-span-4">
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

      {/* Importación */}
      <Card className="min-w-0 h-fit">
        <h2 className="font-bold text-base mb-3">Importar usuarios</h2>
        <p className="text-xs text-slate-500 mb-3">
          Descargá la plantilla, completala y subila para crear múltiples usuarios a la vez. Los rol y comercio tienen lista desplegable en el Excel.
        </p>
        <div className="flex flex-wrap gap-2 items-center mb-4">
          <Button variant="secondary" onClick={descargarPlantilla}>
            ⬇️ Descargar plantilla
          </Button>
          <Button
            variant="secondary"
            disabled={importando}
            onClick={() => fileRef.current?.click()}
          >
            {importando ? 'Importando…' : '⬆️ Subir archivo Excel'}
          </Button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={importarArchivo} />
        </div>

        {importResult && (
          <div className="space-y-3 text-xs">
            {importResult.ok.length > 0 && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                <p className="font-semibold text-green-700 mb-1">✅ {importResult.ok.length} usuario{importResult.ok.length !== 1 ? 's' : ''} creado{importResult.ok.length !== 1 ? 's' : ''}</p>
                <ul className="list-disc list-inside text-green-600 space-y-0.5">
                  {importResult.ok.map((email) => <li key={email}>{email}</li>)}
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
                      <th className="pb-1 pr-3">Email</th>
                      <th className="pb-1">Motivo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importResult.errores.map((e, i) => (
                      <tr key={i} className="border-b border-red-100 last:border-0">
                        <td className="py-1 pr-3 text-slate-500">{e.num}</td>
                        <td className="py-1 pr-3 font-mono">{e.email}</td>
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

      <Card className="min-w-0">
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
