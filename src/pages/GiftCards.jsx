import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { QRCodeCanvas } from 'qrcode.react'
import { supabase } from '../supabaseClient'
import { Button, Input, Select, Card, Badge, money } from '../components/ui'

// Genera un código de 8 caracteres alfanuméricos (mayúsculas + dígitos)
function generarCodigo() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let out = ''
  const arr = new Uint32Array(8)
  crypto.getRandomValues(arr)
  for (let i = 0; i < 8; i++) out += chars[arr[i] % chars.length]
  return out
}

const estadoColor = { activa: 'green', agotada: 'slate', anulada: 'red' }

// Una tarjeta activa con fecha de vencimiento pasada se muestra como "vencida"
function vencida(c) {
  return (
    c.estado === 'activa' &&
    c.fecha_vencimiento &&
    new Date(c.fecha_vencimiento + 'T00:00:00') < new Date(new Date().toDateString())
  )
}

// Tiene uso si su saldo es menor al monto máximo (se descontó al menos una vez)
function tieneUso(c) {
  return Number(c.saldo) < Number(c.monto_max)
}
// Solo se pueden eliminar las que no tienen uso (las no asignadas nunca tienen uso)
function eliminable(c) {
  return !tieneUso(c)
}

// Formateo de monto: guarda solo dígitos y muestra "$ 1.234.567" mientras se escribe
function soloDigitos(s) {
  return (s || '').replace(/\D/g, '')
}
function formatPesos(digitos) {
  if (!digitos) return ''
  return '$ ' + Number(digitos).toLocaleString('es-AR')
}

export default function GiftCards() {
  const [cards, setCards] = useState([])
  const [empresas, setEmpresas] = useState([])
  const [clientes, setClientes] = useState([])
  const [grupos, setGrupos] = useState([])
  const [form, setForm] = useState({ empresa_id: '', cliente_id: '', monto_max: '', fecha_vencimiento: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [qrCard, setQrCard] = useState(null)
  const [mailMsg, setMailMsg] = useState('')
  const [sending, setSending] = useState(false)
  const qrRef = useRef(null)

  // Generación masiva
  const [masivo, setMasivo] = useState({ empresa_id: '', cantidad: '', monto_max: '', fecha_vencimiento: '', grupo_id: '', enviarEmails: false })
  const [masivoError, setMasivoError] = useState('')
  const [masivoMsg, setMasivoMsg] = useState('')
  const [masivoLoading, setMasivoLoading] = useState(false)
  const [colaEmails, setColaEmails] = useState([]) // cola para enviar QR por email tras generar por grupo

  // Selección para borrado masivo
  const [selected, setSelected] = useState(() => new Set())

  // Filtro por empresa (puede venir de la URL: ?empresa=ID, desde el dashboard)
  const [searchParams, setSearchParams] = useSearchParams()
  const filtroEmpresa = searchParams.get('empresa') || ''
  const setFiltroEmpresa = (id) => {
    setSelected(new Set())
    setSearchParams(id ? { empresa: id } : {})
  }
  const cardsFiltradas = filtroEmpresa ? cards.filter((c) => c.empresa_id === filtroEmpresa) : cards

  async function load() {
    const [c, e, cl, gr] = await Promise.all([
      supabase
        .from('giftcards')
        .select('*, empresas(nombre, logo_url, comercio), clientes(nombre, dni, email)')
        .order('created_at', { ascending: false }),
      supabase.from('empresas').select('id, nombre, activo').order('nombre'),
      supabase.from('clientes').select('id, nombre, dni, email, grupo_id').order('nombre'),
      supabase.from('grupos').select('id, nombre').order('nombre'),
    ])
    setCards(c.data || [])
    setEmpresas(e.data || [])
    setClientes(cl.data || [])
    setGrupos(gr.data || [])
  }
  useEffect(() => {
    load()
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    const monto = parseFloat(form.monto_max)
    if (!form.empresa_id) return setError('Elegí una empresa.')
    if (!(monto > 0)) return setError('El monto máximo debe ser mayor a cero.')
    setLoading(true)

    // Reintenta si hay colisión de código (muy improbable)
    let lastErr = null
    for (let intento = 0; intento < 5; intento++) {
      const codigo = generarCodigo()
      const { data, error } = await supabase
        .from('giftcards')
        .insert({
          codigo,
          empresa_id: form.empresa_id,
          cliente_id: form.cliente_id || null,
          monto_max: monto,
          saldo: monto,
          fecha_vencimiento: form.fecha_vencimiento || null,
        })
        .select('*, empresas(nombre, logo_url, comercio), clientes(nombre, dni, email)')
        .single()
      if (!error) {
        setLoading(false)
        setForm({ empresa_id: '', cliente_id: '', monto_max: '', fecha_vencimiento: '' })
        setMailMsg('')
        setQrCard(data)
        load()
        return
      }
      lastErr = error
      if (!error.message.includes('duplicate')) break
    }
    setLoading(false)
    setError(lastErr?.message || 'No se pudo crear la gift card.')
  }

  async function anular(id) {
    if (!confirm('¿Anular esta gift card? No podrá usarse más.')) return
    const { error } = await supabase.from('giftcards').update({ estado: 'anulada' }).eq('id', id)
    if (error) alert(error.message)
    else load()
  }

  // Integrantes del grupo elegido en la generación masiva
  const integrantesGrupo = masivo.grupo_id ? clientes.filter((c) => c.grupo_id === masivo.grupo_id) : []

  // ---------- Generación masiva ----------
  async function generarMasivo(e) {
    e.preventDefault()
    setMasivoError('')
    setMasivoMsg('')
    const cantidad = parseInt(masivo.cantidad, 10)
    const monto = parseFloat(masivo.monto_max)
    if (!masivo.empresa_id) return setMasivoError('Elegí una empresa.')
    if (!(monto > 0)) return setMasivoError('El monto máximo debe ser mayor a cero.')

    const conGrupo = !!masivo.grupo_id
    if (conGrupo) {
      if (integrantesGrupo.length === 0)
        return setMasivoError('El grupo seleccionado no tiene clientes.')
      if (cantidad !== integrantesGrupo.length)
        return setMasivoError(
          `La cantidad (${cantidad || 0}) debe coincidir con los ${integrantesGrupo.length} integrantes del grupo.`
        )
    } else {
      if (!(cantidad > 0 && cantidad <= 500)) return setMasivoError('La cantidad debe estar entre 1 y 500.')
    }
    setMasivoLoading(true)

    // Genera códigos únicos dentro del lote
    const total = conGrupo ? integrantesGrupo.length : cantidad
    const codigos = new Set()
    while (codigos.size < total) codigos.add(generarCodigo())
    const codigosArr = [...codigos]

    const filas = codigosArr.map((codigo, i) => ({
      codigo,
      empresa_id: masivo.empresa_id,
      // Con grupo: una gift card por integrante (asignada). Sin grupo: queda sin asignar.
      cliente_id: conGrupo ? integrantesGrupo[i].id : null,
      monto_max: monto,
      saldo: monto,
      fecha_vencimiento: masivo.fecha_vencimiento || null,
    }))

    const { error } = await supabase.from('giftcards').insert(filas)
    setMasivoLoading(false)
    if (error) {
      setMasivoError(error.message)
      return
    }
    setMasivoMsg(
      conGrupo
        ? `✅ Se generaron ${total} gift cards, una por cada integrante del grupo.`
        : `✅ Se generaron ${total} gift cards. Asignales un cliente desde la tabla para poder usarlas.`
    )

    // Opción: enviar el QR por email a cada integrante del grupo
    if (conGrupo && masivo.enviarEmails) {
      const empresaNombre = empresas.find((x) => x.id === masivo.empresa_id)?.nombre
      const venc = masivo.fecha_vencimiento
        ? new Date(masivo.fecha_vencimiento + 'T00:00:00').toLocaleDateString('es-AR')
        : null
      setColaEmails(
        codigosArr.map((codigo, i) => ({
          codigo,
          montoMax: monto,
          empresa: empresaNombre,
          vencimiento: venc,
          email: integrantesGrupo[i].email,
          nombre: integrantesGrupo[i].nombre,
        }))
      )
    }

    setMasivo({ empresa_id: '', cantidad: '', monto_max: '', fecha_vencimiento: '', grupo_id: '', enviarEmails: false })
    load()
  }

  // Envía el QR por email a cada item de la cola (renderiza los QR ocultos y los adjunta)
  useEffect(() => {
    if (colaEmails.length === 0) return
    let cancelado = false
    ;(async () => {
      let ok = 0,
        sinEmail = 0,
        fallo = 0
      for (const it of colaEmails) {
        if (!it.email) {
          sinEmail++
          continue
        }
        const canvas = document.querySelector(`[data-qrbulk="${it.codigo}"] canvas`)
        if (!canvas) {
          fallo++
          continue
        }
        try {
          const resp = await fetch('/api/send-giftcard', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              to: it.email,
              nombre: it.nombre,
              codigo: it.codigo,
              montoMax: it.montoMax,
              empresa: it.empresa,
              vencimiento: it.vencimiento,
              qrDataUrl: canvas.toDataURL('image/png'),
            }),
          })
          resp.ok ? ok++ : fallo++
        } catch {
          fallo++
        }
      }
      if (!cancelado) {
        setMasivoMsg(
          `✉️ Emails: ${ok} enviados` +
            (sinEmail ? `, ${sinEmail} sin email` : '') +
            (fallo ? `, ${fallo} con error` : '') +
            '.'
        )
        setColaEmails([])
      }
    })()
    return () => {
      cancelado = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colaEmails])

  // ---------- Asignación de cliente desde la tabla ----------
  async function asignarCliente(cardId, clienteId) {
    if (!clienteId) return
    const cl = clientes.find((x) => x.id === clienteId)
    if (!confirm(`¿Asignar esta gift card a ${cl?.nombre}? Una vez asignada NO se puede cambiar.`)) return
    const { error } = await supabase.from('giftcards').update({ cliente_id: clienteId }).eq('id', cardId)
    if (error) alert(error.message)
    else load()
  }

  // ---------- Selección / borrado masivo ----------
  function toggleSel(id) {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }
  function toggleSelAll() {
    const elegibles = cardsFiltradas.filter(eliminable).map((c) => c.id)
    setSelected((prev) => (prev.size === elegibles.length ? new Set() : new Set(elegibles)))
  }
  async function eliminarSeleccionadas() {
    if (selected.size === 0) return
    if (!confirm(`¿Eliminar ${selected.size} gift card(s)? Esta acción no se puede deshacer.`)) return
    const { error } = await supabase.from('giftcards').delete().in('id', [...selected])
    if (error) {
      alert(error.message + '\n(Solo se pueden eliminar gift cards sin uso.)')
      return
    }
    setSelected(new Set())
    load()
  }

  function cerrarQr() {
    setQrCard(null)
    setMailMsg('')
  }

  function descargarQR() {
    const canvas = qrRef.current?.querySelector('canvas')
    if (!canvas) return
    const link = document.createElement('a')
    link.download = `giftcard-${qrCard.codigo}.png`
    link.href = canvas.toDataURL('image/png')
    link.click()
  }

  async function enviarEmail() {
    setMailMsg('')
    const email = qrCard.clientes?.email
    if (!email) {
      setMailMsg('⚠️ El cliente no tiene email cargado (o la gift card no tiene cliente asignado).')
      return
    }
    const canvas = qrRef.current?.querySelector('canvas')
    if (!canvas) return
    setSending(true)
    try {
      const resp = await fetch('/api/send-giftcard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: email,
          nombre: qrCard.clientes?.nombre,
          codigo: qrCard.codigo,
          montoMax: qrCard.monto_max,
          empresa: qrCard.empresas?.nombre,
          vencimiento: qrCard.fecha_vencimiento
            ? new Date(qrCard.fecha_vencimiento + 'T00:00:00').toLocaleDateString('es-AR')
            : null,
          qrDataUrl: canvas.toDataURL('image/png'),
        }),
      })
      const json = await resp.json().catch(() => ({}))
      setMailMsg(
        resp.ok
          ? `✅ Email enviado a ${email}`
          : `❌ ${json.error || 'No se pudo enviar el email.'}${json.detail ? ' — ' + json.detail : ''}`
      )
    } catch (e) {
      setMailMsg('❌ ' + e.message)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <h2 className="font-bold text-lg mb-4">Emitir Gift Card</h2>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
          <Select
            label="Empresa *"
            value={form.empresa_id}
            onChange={(e) => setForm({ ...form, empresa_id: e.target.value })}
          >
            <option value="">— Seleccionar —</option>
            {empresas.filter((e) => e.activo).map((e) => (
              <option key={e.id} value={e.id}>
                {e.nombre}
              </option>
            ))}
          </Select>
          <Select
            label="Cliente (opcional)"
            value={form.cliente_id}
            onChange={(e) => setForm({ ...form, cliente_id: e.target.value })}
          >
            <option value="">— Sin asignar —</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre} ({c.dni})
              </option>
            ))}
          </Select>
          <Input
            label="Monto máximo *"
            type="text"
            inputMode="numeric"
            value={formatPesos(form.monto_max)}
            onChange={(e) => setForm({ ...form, monto_max: soloDigitos(e.target.value) })}
            required
          />
          <Input
            label="Vencimiento (opcional)"
            type="date"
            value={form.fecha_vencimiento}
            onChange={(e) => setForm({ ...form, fecha_vencimiento: e.target.value })}
          />
          {error && <p className="text-sm text-red-600 sm:col-span-2 lg:col-span-4">{error}</p>}
          <Button type="submit" disabled={loading} className="w-full sm:col-span-2 lg:col-span-1">
            {loading ? 'Generando…' : 'Generar y crear QR'}
          </Button>
        </form>
      </Card>

      <Card>
        <h2 className="font-bold text-lg mb-1">Generar de forma masiva</h2>
        <p className="text-sm text-slate-500 mb-4">
          Crea varias gift cards de una empresa con el mismo monto y vencimiento. Sin grupo quedan{' '}
          <strong>sin cliente</strong> (asignalos desde la tabla). Si elegís un <strong>grupo</strong>, se genera una
          gift card ya asignada a cada integrante (la cantidad debe coincidir).
        </p>
        <form onSubmit={generarMasivo} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
          <Select
            label="Empresa *"
            value={masivo.empresa_id}
            onChange={(e) => setMasivo({ ...masivo, empresa_id: e.target.value })}
          >
            <option value="">— Seleccionar —</option>
            {empresas.filter((e) => e.activo).map((e) => (
              <option key={e.id} value={e.id}>
                {e.nombre}
              </option>
            ))}
          </Select>
          <Select
            label="Asignar a grupo (opcional)"
            value={masivo.grupo_id}
            onChange={(e) => {
              const id = e.target.value
              const n = id ? clientes.filter((c) => c.grupo_id === id).length : 0
              setMasivo({ ...masivo, grupo_id: id, cantidad: id ? String(n) : masivo.cantidad })
            }}
          >
            <option value="">— Sin grupo —</option>
            {grupos.map((g) => (
              <option key={g.id} value={g.id}>
                {g.nombre} ({clientes.filter((c) => c.grupo_id === g.id).length})
              </option>
            ))}
          </Select>
          <Input
            label="Cantidad *"
            type="number"
            min="1"
            max="500"
            value={masivo.cantidad}
            onChange={(e) => setMasivo({ ...masivo, cantidad: e.target.value })}
            disabled={!!masivo.grupo_id}
            required
          />
          <Input
            label="Monto máximo *"
            type="text"
            inputMode="numeric"
            value={formatPesos(masivo.monto_max)}
            onChange={(e) => setMasivo({ ...masivo, monto_max: soloDigitos(e.target.value) })}
            required
          />
          <Input
            label="Vencimiento (opcional)"
            type="date"
            value={masivo.fecha_vencimiento}
            onChange={(e) => setMasivo({ ...masivo, fecha_vencimiento: e.target.value })}
          />
          {masivo.grupo_id && (
            <label className="flex items-center gap-2 text-sm sm:col-span-2 lg:col-span-4">
              <input
                type="checkbox"
                checked={masivo.enviarEmails}
                onChange={(e) => setMasivo({ ...masivo, enviarEmails: e.target.checked })}
              />
              Enviar el QR por email a cada integrante del grupo (los que tengan email cargado)
            </label>
          )}
          {masivoError && <p className="text-sm text-red-600 sm:col-span-2 lg:col-span-4">{masivoError}</p>}
          {masivoMsg && <p className="text-sm text-green-700 sm:col-span-2 lg:col-span-4">{masivoMsg}</p>}
          <Button type="submit" disabled={masivoLoading} className="w-full sm:col-span-2 lg:col-span-1">
            {masivoLoading ? 'Generando…' : 'Generar lote'}
          </Button>
        </form>
      </Card>

      <Card>
        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
          <h2 className="font-bold text-lg">Gift Cards ({cardsFiltradas.length})</h2>
          <div className="flex items-center gap-3 flex-wrap">
            <select
              className="px-3 py-2 border border-slate-300 rounded-lg bg-white text-sm"
              value={filtroEmpresa}
              onChange={(e) => setFiltroEmpresa(e.target.value)}
            >
              <option value="">Todas las empresas</option>
              {empresas.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nombre}
                </option>
              ))}
            </select>
            {selected.size > 0 && (
              <Button variant="danger" onClick={eliminarSeleccionadas}>
                🗑️ Eliminar seleccionadas ({selected.size})
              </Button>
            )}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm responsive-table">
            <thead>
              <tr className="text-center text-slate-500 border-b">
                <th className="py-2 w-8">
                  <input
                    type="checkbox"
                    checked={
                      cardsFiltradas.some(eliminable) &&
                      selected.size === cardsFiltradas.filter(eliminable).length
                    }
                    onChange={toggleSelAll}
                    title="Seleccionar todas las que no tienen uso"
                  />
                </th>
                <th>Código</th>
                <th>Empresa</th>
                <th>Cliente</th>
                <th>Máx.</th>
                <th>Saldo</th>
                <th>Vence</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody className="text-center">
              {cardsFiltradas.map((c) => (
                <tr key={c.id} className={`border-b last:border-0 ${selected.has(c.id) ? 'bg-indigo-50' : ''}`}>
                  <td data-label="Seleccionar">
                    <input
                      type="checkbox"
                      checked={selected.has(c.id)}
                      disabled={!eliminable(c)}
                      onChange={() => toggleSel(c.id)}
                      title={eliminable(c) ? '' : 'No se puede eliminar: tiene usos'}
                    />
                  </td>
                  <td className="py-2 font-mono font-semibold" data-label="Código">{c.codigo}</td>
                  <td data-label="Empresa">{c.empresas?.nombre || '—'}</td>
                  <td data-label="Cliente">
                    {c.cliente_id ? (
                      // Ya asignada: no se puede cambiar
                      <span className="font-medium" title="El cliente asignado no se puede cambiar">
                        {c.clientes?.nombre || '—'} 🔒
                      </span>
                    ) : (
                      <select
                        className="px-2 py-1 border border-amber-400 text-amber-700 rounded-lg bg-white text-sm"
                        value=""
                        onChange={(e) => asignarCliente(c.id, e.target.value)}
                      >
                        <option value="">— sin asignar —</option>
                        {clientes.map((cl) => (
                          <option key={cl.id} value={cl.id}>
                            {cl.nombre} ({cl.dni})
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td data-label="Máx.">{money(c.monto_max)}</td>
                  <td className="font-medium" data-label="Saldo">{money(c.saldo)}</td>
                  <td className={vencida(c) ? 'text-red-600 font-medium' : ''} data-label="Vence">
                    {c.fecha_vencimiento
                      ? new Date(c.fecha_vencimiento + 'T00:00:00').toLocaleDateString('es-AR')
                      : '—'}
                  </td>
                  <td data-label="Estado">
                    {vencida(c) ? (
                      <Badge color="red">vencida</Badge>
                    ) : (
                      <Badge color={estadoColor[c.estado]}>{c.estado}</Badge>
                    )}
                  </td>
                  <td className="whitespace-nowrap" data-label="Acciones">
                    <Button variant="ghost" onClick={() => setQrCard(c)} title="Ver QR">
                      🔳
                    </Button>
                    {c.estado === 'activa' && (
                      <Button variant="ghost" onClick={() => anular(c.id)} title="Anular">
                        🚫
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
              {cardsFiltradas.length === 0 && (
                <tr>
                  <td colSpan="9" className="py-6 text-center text-slate-400">
                    {filtroEmpresa ? 'Esta empresa no tiene gift cards' : 'Sin gift cards todavía'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* QR ocultos para el envío masivo por email */}
      {colaEmails.length > 0 && (
        <div style={{ position: 'absolute', left: -9999, top: -9999 }} aria-hidden>
          {colaEmails.map((it) => (
            <div key={it.codigo} data-qrbulk={it.codigo}>
              <QRCodeCanvas value={it.codigo} size={200} includeMargin />
            </div>
          ))}
        </div>
      )}

      {/* Popup con el QR de la gift card */}
      {qrCard && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          onClick={cerrarQr}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 text-center relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={cerrarQr}
              className="absolute top-3 right-3 text-slate-400 hover:text-slate-700 text-xl leading-none z-20"
              aria-label="Cerrar"
            >
              ✕
            </button>
            <p className="text-sm text-slate-500 mb-3">Gift Card</p>
            <div ref={qrRef} className="inline-block bg-white p-3 rounded-lg border">
              <QRCodeCanvas value={qrCard.codigo} size={200} includeMargin />
            </div>
            {/* Código y monto a la izquierda, logo de la empresa a la derecha */}
            <div className="mt-3 flex items-center justify-center gap-3">
              <div className="text-left">
                <p className="font-mono text-xl font-bold tracking-widest">{qrCard.codigo}</p>
                <p className="text-sm text-slate-500">{money(qrCard.monto_max)}</p>
              </div>
              {qrCard.empresas?.logo_url && (
                <img
                  src={qrCard.empresas.logo_url}
                  alt=""
                  className="h-14 w-14 object-contain rounded border bg-white"
                />
              )}
            </div>
            {qrCard.empresas?.comercio && (
              <p className="text-xs text-slate-600 mt-2">
                Solo para uso en: <strong>{qrCard.empresas.comercio}</strong>
              </p>
            )}
            {qrCard.fecha_vencimiento && (
              <p className="text-xs text-amber-600 mt-1">
                Vence el {new Date(qrCard.fecha_vencimiento + 'T00:00:00').toLocaleDateString('es-AR')}
              </p>
            )}
            <div className="flex gap-2 justify-center mt-4">
              <Button variant="secondary" onClick={descargarQR}>
                ⬇️ Descargar
              </Button>
              <Button onClick={enviarEmail} disabled={sending}>
                {sending ? 'Enviando…' : '✉️ Enviar por email'}
              </Button>
            </div>
            {mailMsg && <p className="text-sm mt-3">{mailMsg}</p>}
          </div>
        </div>
      )}
    </div>
  )
}
