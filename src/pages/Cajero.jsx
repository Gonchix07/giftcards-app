import { useEffect, useRef, useState } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import { supabase } from '../supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { Button, Input, Card, Badge, money } from '../components/ui'

// Formato de monto: admite decimales con punto y muestra "$ 1.234.567.89" mientras se escribe.
// Como el separador de miles también es ".", el último punto seguido de hasta 2 dígitos
// se interpreta como decimal; el resto de los puntos se descartan como separadores de miles.
const limpiarMonto = (s) => {
  s = (s || '').replace(/[^\d.]/g, '')
  const i = s.lastIndexOf('.')
  if (i !== -1 && s.length - i - 1 <= 2) {
    return s.slice(0, i).replace(/\./g, '') + '.' + s.slice(i + 1)
  }
  return s.replace(/\./g, '')
}
const formatPesos = (d) => {
  if (!d) return ''
  const [ent, dec] = String(d).split('.')
  return '$ ' + Number(ent || 0).toLocaleString('es-AR') + (dec !== undefined ? '.' + dec : '')
}

// Fecha de hoy en formato YYYY-MM-DD (hora local)
function hoyLocal() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function Cajero() {
  const { user, profile } = useAuth()
  const comercioCajero = profile?.comercio || null
  const [codigo, setCodigo] = useState('')
  const [card, setCard] = useState(null) // gift card consultada
  const [monto, setMonto] = useState('')
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')
  const [loading, setLoading] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [misUsos, setMisUsos] = useState([]) // historial de usos de este cajero
  const [toast, setToast] = useState('') // aviso flotante de éxito
  const [dia, setDia] = useState(hoyLocal) // día seleccionado para la tabla
  const [selUsos, setSelUsos] = useState(() => new Set()) // filas seleccionadas para exportar
  const scannerRef = useRef(null)

  async function cargarMisUsos(diaStr = dia) {
    if (!user?.id) return
    // Rango [inicio, fin) del día seleccionado (hora local)
    const inicio = new Date(diaStr + 'T00:00:00')
    const fin = new Date(inicio.getTime() + 86400000)
    const { data } = await supabase
      .from('transacciones')
      .select('*, giftcards(codigo, empresas(nombre), clientes(nombre))')
      .eq('cajero_id', user.id)
      .gte('created_at', inicio.toISOString())
      .lt('created_at', fin.toISOString())
      .order('created_at', { ascending: false })
    setMisUsos(data || [])
    setSelUsos(new Set())
  }

  function toggleUso(id) {
    setSelUsos((prev) => {
      const n = new Set(prev)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }
  function toggleTodos() {
    setSelUsos((prev) => (prev.size === misUsos.length ? new Set() : new Set(misUsos.map((t) => t.id))))
  }

  useEffect(() => {
    cargarMisUsos(dia)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, dia])

  async function buscar(cod) {
    setError('')
    setMsg('')
    setCard(null)
    setMonto('')
    const code = (cod ?? codigo).trim().toUpperCase()
    if (code.length !== 8) {
      setError('El código debe tener 8 caracteres.')
      return
    }
    const { data, error } = await supabase
      .from('giftcards')
      .select('*, empresas(nombre, comercio), clientes(nombre, dni)')
      .eq('codigo', code)
      .maybeSingle()
    if (error) return setError(error.message)
    if (!data) return setError('No se encontró ninguna gift card con ese código.')
    setCard(data)
    // Si es de uso total, precarga el saldo completo
    if (data.uso_parcial === false) setMonto(String(Number(data.saldo)))
  }

  async function confirmarUso() {
    setError('')
    setMsg('')
    const m = parseFloat(monto)
    if (!(m > 0)) return setError('Ingresá un monto válido.')
    if (m > Number(card.saldo)) return setError('El monto supera el saldo disponible.')
    if (!confirm(`¿Confirmar uso de ${money(m)}? Esta acción no se puede deshacer.`)) return

    setLoading(true)
    const { data, error } = await supabase.rpc('usar_giftcard', {
      p_codigo: card.codigo,
      p_monto: m,
    })
    setLoading(false)
    if (error) return setError(error.message)

    // Aviso flotante de éxito (se oculta solo)
    mostrarToast(
      `Uso registrado: ${money(data.monto_usado)}` +
        (data.estado === 'agotada' ? ' · gift card agotada' : ` · saldo ${money(data.saldo_resultante)}`)
    )

    // Oculta los datos de la tarjeta usada y limpia el formulario
    setCard(null)
    setCodigo('')
    setMonto('')
    setError('')
    setMsg('')

    // Deja la tabla del cajero actualizada
    cargarMisUsos()
  }

  function mostrarToast(texto) {
    setToast(texto)
    setTimeout(() => setToast(''), 4000)
  }

  const esc = (s) =>
    String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

  // Genera el informe de rendición de caja (PDF vía diálogo de impresión) con las filas seleccionadas
  function exportarPDF() {
    const filas = misUsos.filter((t) => selUsos.has(t.id))
    if (filas.length === 0) return
    const total = filas.reduce((a, t) => a + Number(t.monto), 0)
    const ahora = new Date()
    const fechaHora = ahora.toLocaleString('es-AR', { hour12: false })
    const pad = (n) => String(n).padStart(2, '0')
    const numero = `R-${dia.replaceAll('-', '')}-${pad(ahora.getHours())}${pad(ahora.getMinutes())}${pad(ahora.getSeconds())}`

    const filasHtml = filas
      .map(
        (t) => `<tr>
          <td>${new Date(t.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false })}</td>
          <td class="mono">${esc(t.giftcards?.codigo)}</td>
          <td>${esc(t.giftcards?.clientes?.nombre || '—')}</td>
          <td>${esc(t.giftcards?.empresas?.nombre || '—')}</td>
          <td class="r">${money(t.monto)}</td>
        </tr>`
      )
      .join('')

    const html = `<!doctype html><html lang="es"><head><meta charset="utf-8">
      <title>Rendición ${esc(numero)}</title>
      <style>
        * { font-family: Arial, sans-serif; color:#1e293b; }
        body { margin: 32px; }
        h1 { font-size: 20px; margin: 0 0 4px; color:#3730a3; }
        .sub { color:#64748b; font-size: 12px; margin: 0 0 16px; }
        .meta { font-size: 13px; margin: 12px 0 16px; line-height: 1.6; }
        .meta b { display:inline-block; min-width: 150px; color:#475569; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; }
        th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; }
        th { background:#e0e7ff; }
        td.r, th.r { text-align: right; }
        td.mono { font-family: monospace; font-weight: bold; }
        tfoot td { font-weight: bold; background:#f1f5f9; }
        .firma { margin-top: 64px; display:flex; justify-content: space-between; gap: 40px; }
        .firma div { flex:1; text-align:center; border-top:1px solid #334155; padding-top:6px; font-size:12px; color:#475569; }
        @media print { body { margin: 16mm; } }
      </style></head><body>
      <h1>🎁 Rendición de caja</h1>
      <p class="sub">Gestión de Gift Cards — Departamento de Sistemas · HERGO | MENOR COSTE</p>
      <div class="meta">
        <div><b>N° de rendición:</b> ${esc(numero)}</div>
        <div><b>Cajero:</b> ${esc(user?.email || '')}</div>
        <div><b>Comercio:</b> ${esc(comercioCajero || 'Sin restricción')}</div>
        <div><b>Día de los usos:</b> ${esc(new Date(dia + 'T00:00:00').toLocaleDateString('es-AR'))}</div>
        <div><b>Fecha y hora de emisión:</b> ${esc(fechaHora)}</div>
        <div><b>Cantidad de gift cards:</b> ${filas.length}</div>
      </div>
      <table>
        <thead><tr><th>Hora</th><th>Código</th><th>Cliente</th><th>Campaña</th><th class="r">Monto</th></tr></thead>
        <tbody>${filasHtml}</tbody>
        <tfoot><tr><td colspan="4" class="r">TOTAL</td><td class="r">${money(total)}</td></tr></tfoot>
      </table>
      <div class="firma">
        <div>Firma del cajero</div>
        <div>Firma de supervisión / tesorería</div>
      </div>
      <script>window.onload = function(){ setTimeout(function(){ window.print() }, 300) }<\/script>
      </body></html>`

    const w = window.open('', '_blank')
    if (!w) {
      alert('El navegador bloqueó la ventana emergente. Permití las ventanas emergentes para generar el PDF.')
      return
    }
    w.document.write(html)
    w.document.close()
  }

  // ---------- Escáner QR ----------
  async function startScan() {
    setError('')
    setScanning(true)
  }

  useEffect(() => {
    if (!scanning) return
    const qr = new Html5Qrcode('qr-reader')
    scannerRef.current = qr
    qr
      .start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 220, height: 220 } },
        (decoded) => {
          const code = decoded.trim().toUpperCase()
          setCodigo(code)
          stopScan()
          buscar(code)
        },
        () => {}
      )
      .catch((e) => {
        setError('No se pudo acceder a la cámara: ' + e)
        setScanning(false)
      })
    return () => {
      qr.stop().then(() => qr.clear()).catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanning])

  function stopScan() {
    setScanning(false)
  }

  const estaVencida =
    card?.fecha_vencimiento &&
    new Date(card.fecha_vencimiento + 'T00:00:00') < new Date(new Date().toDateString())
  const sinCliente = card && !card.cliente_id
  const otroComercio = card && comercioCajero && card.empresas?.comercio !== comercioCajero
  const usable =
    card && card.estado === 'activa' && Number(card.saldo) > 0 && !estaVencida && !sinCliente && !otroComercio

  return (
    <div className="max-w-xl mx-auto space-y-6 text-sm">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <h2 className="font-bold text-base">Cobrar con Gift Card</h2>
          {comercioCajero && (
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-indigo-100 text-indigo-700">
              Comercio: {comercioCajero}
            </span>
          )}
        </div>
        <div className="flex gap-2 items-end">
          <Input
            label="Código (8 caracteres)"
            value={codigo}
            maxLength={8}
            onChange={(e) => setCodigo(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
            onKeyDown={(e) => e.key === 'Enter' && buscar()}
            className="font-mono tracking-widest"
          />
          <Button onClick={() => buscar()}>Buscar</Button>
        </div>
        <div className="mt-3">
          {!scanning ? (
            <Button variant="secondary" onClick={startScan} className="w-full">
              📷 Escanear QR
            </Button>
          ) : (
            <div>
              <div id="qr-reader" className="rounded-lg overflow-hidden border" />
              <Button variant="secondary" onClick={stopScan} className="w-full mt-2">
                Cancelar escaneo
              </Button>
            </div>
          )}
        </div>
        {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
        {msg && <p className="text-sm text-green-700 font-medium mt-3">{msg}</p>}
      </Card>

      {card && (
        <Card>
          <div className="flex items-center justify-between mb-3">
            <span className="font-mono text-xl font-bold tracking-widest">{card.codigo}</span>
            <Badge color={card.estado === 'activa' ? 'green' : card.estado === 'agotada' ? 'slate' : 'red'}>
              {card.estado}
            </Badge>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm mb-4">
            <div>
              <p className="text-slate-500">Campaña</p>
              <p className="font-medium">{card.empresas?.nombre || '—'}</p>
            </div>
            <div>
              <p className="text-slate-500">Cliente</p>
              <p className="font-medium">
                {card.clientes ? `${card.clientes.nombre} (${card.clientes.dni})` : 'Sin asignar'}
              </p>
            </div>
          </div>

          <div className="bg-indigo-50 rounded-lg p-4 text-center mb-4">
            <p className="text-sm text-indigo-600">Saldo disponible</p>
            <p className="text-3xl font-bold text-indigo-700">{money(card.saldo)}</p>
            <p className="text-xs text-slate-500 mt-1">Monto máximo original: {money(card.monto_max)}</p>
            {card.fecha_vencimiento && (
              <p className={`text-xs mt-1 ${estaVencida ? 'text-red-600 font-semibold' : 'text-amber-600'}`}>
                {estaVencida ? 'VENCIDA el ' : 'Vence el '}
                {new Date(card.fecha_vencimiento + 'T00:00:00').toLocaleDateString('es-AR')}
              </p>
            )}
          </div>

          {usable ? (
            <div className="space-y-3">
              <Input
                label="Monto a usar"
                type="text"
                inputMode="decimal"
                value={formatPesos(monto)}
                onChange={(e) => setMonto(limpiarMonto(e.target.value))}
                placeholder={`Hasta ${money(card.saldo)}`}
                disabled={card.uso_parcial === false}
              />
              {card.uso_parcial === false && (
                <p className="text-xs text-amber-600">
                  Esta gift card es de <strong>uso total</strong>: se descuenta el saldo completo en un solo uso.
                </p>
              )}
              <div className="flex gap-2">
                {card.uso_parcial !== false && (
                  <Button variant="secondary" onClick={() => setMonto(String(Number(card.saldo)))}>
                    Usar todo
                  </Button>
                )}
                <Button onClick={confirmarUso} disabled={loading} className="flex-1">
                  {loading ? 'Procesando…' : 'Confirmar uso'}
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-center text-sm">
              {otroComercio ? (
                <span className="text-red-600 font-medium">
                  ⚠️ Esta Gift Card no pertenece al comercio emitido. Pertenece a{' '}
                  <strong>{card.empresas?.comercio || 'otro comercio'}</strong> y vos atendés{' '}
                  <strong>{comercioCajero}</strong>.
                </span>
              ) : (
                <span className="text-slate-500">
                  Esta gift card no admite usos (
                  {sinCliente
                    ? 'sin cliente asignado'
                    : estaVencida
                    ? 'vencida'
                    : card.estado === 'agotada'
                    ? 'sin saldo'
                    : card.estado}
                  ).
                </span>
              )}
            </p>
          )}
        </Card>
      )}

      {/* Listado visual de las gift cards usadas por este cajero */}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h2 className="font-bold text-base">Mis usos registrados ({misUsos.length})</h2>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-sm text-slate-500">Día:</label>
            <input
              type="date"
              value={dia}
              max={hoyLocal()}
              onChange={(e) => setDia(e.target.value || hoyLocal())}
              className="px-3 py-2 border border-slate-300 rounded-lg bg-white text-sm"
            />
            <Button onClick={exportarPDF} disabled={selUsos.size === 0}>
              🧾 Rendición PDF ({selUsos.size})
            </Button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs table-fixed text-center">
            <thead>
              <tr className="text-slate-500 border-b">
                <th className="py-2 w-8">
                  <input
                    type="checkbox"
                    checked={misUsos.length > 0 && selUsos.size === misUsos.length}
                    onChange={toggleTodos}
                    title="Seleccionar todas"
                  />
                </th>
                <th>Hora</th>
                <th>Código</th>
                <th>Cliente</th>
                <th>Monto</th>
              </tr>
            </thead>
            <tbody>
              {misUsos.map((t) => (
                <tr key={t.id} className={`border-b last:border-0 ${selUsos.has(t.id) ? 'bg-indigo-50' : ''}`}>
                  <td>
                    <input type="checkbox" checked={selUsos.has(t.id)} onChange={() => toggleUso(t.id)} />
                  </td>
                  <td className="py-2">
                    {new Date(t.created_at).toLocaleTimeString('es-AR', {
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: false,
                    })}
                  </td>
                  <td className="font-mono font-semibold">{t.giftcards?.codigo}</td>
                  <td>{t.giftcards?.clientes?.nombre || '—'}</td>
                  <td className="font-medium">{money(t.monto)}</td>
                </tr>
              ))}
              {misUsos.length === 0 && (
                <tr>
                  <td colSpan="5" className="py-6 text-center text-slate-400">
                    Todavía no registraste usos
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Aviso flotante de uso confirmado (esquina inferior derecha) */}
      {toast && (
        <div className="fixed bottom-5 right-5 z-50 toast-pop">
          <div className="flex items-center gap-3 bg-emerald-600 text-white px-4 py-3 rounded-xl shadow-lg max-w-xs">
            <span className="grid place-items-center h-8 w-8 rounded-full bg-white/20 text-lg font-bold">✓</span>
            <div>
              <p className="font-semibold leading-tight">¡Uso confirmado!</p>
              <p className="text-xs text-emerald-50">{toast}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
