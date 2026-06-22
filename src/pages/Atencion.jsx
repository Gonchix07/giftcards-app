import { useEffect, useRef, useState } from 'react'
import { QRCodeCanvas } from 'qrcode.react'
import { supabase } from '../supabaseClient'
import { Button, Input, Select, Card, Badge, money } from '../components/ui'
import { composeCardDataURL } from '../lib/cardImage'

const estadoColor = { activa: 'green', agotada: 'slate', anulada: 'red' }

function vencida(c) {
  return (
    c.estado === 'activa' &&
    c.fecha_vencimiento &&
    new Date(c.fecha_vencimiento + 'T00:00:00') < new Date(new Date().toDateString())
  )
}

export default function Atencion() {
  const [q, setQ] = useState('')
  const [matches, setMatches] = useState([])
  const [clienteSel, setClienteSel] = useState(null)
  const [cards, setCards] = useState([])
  const [filtroEstado, setFiltroEstado] = useState('todas')
  const [error, setError] = useState('')
  const [buscando, setBuscando] = useState(false)

  const [qrCard, setQrCard] = useState(null)
  const [mailMsg, setMailMsg] = useState('')
  const [sending, setSending] = useState(false)
  const [comercios, setComercios] = useState([])
  const qrRef = useRef(null)

  useEffect(() => {
    supabase
      .from('comercios')
      .select('nombre, color')
      .then(({ data }) => setComercios(data || []))
  }, [])
  const colorComercio = (nombre) => comercios.find((x) => x.nombre === nombre)?.color || '#1e3a8a'

  async function buscar(e) {
    e?.preventDefault()
    setError('')
    setMatches([])
    setClienteSel(null)
    setCards([])
    const term = q.trim()
    if (!term) return
    setBuscando(true)
    const { data, error } = await supabase
      .from('clientes')
      .select('id, nombre, dni, email')
      .or(`nombre.ilike.%${term}%,dni.ilike.%${term}%`)
      .order('nombre')
      .limit(25)
    setBuscando(false)
    if (error) return setError(error.message)
    if (!data || data.length === 0) return setError('No se encontraron clientes.')
    if (data.length === 1) elegirCliente(data[0])
    else setMatches(data)
  }

  async function elegirCliente(c) {
    setClienteSel(c)
    setMatches([])
    const { data } = await supabase
      .from('giftcards')
      .select('*, empresas(nombre, logo_url, comercio), clientes(nombre, dni, email)')
      .eq('cliente_id', c.id)
      .order('created_at', { ascending: false })
    setCards(data || [])
  }

  // ---------- Popup QR ----------
  function cerrarQr() {
    setQrCard(null)
    setMailMsg('')
  }
  function tarjetaDataURL() {
    const canvas = qrRef.current?.querySelector('canvas')
    if (!canvas) return null
    return composeCardDataURL(canvas, {
      codigo: qrCard.codigo,
      comercio: qrCard.empresas?.comercio || '',
      monto: money(qrCard.monto_max),
      bg: colorComercio(qrCard.empresas?.comercio),
    })
  }

  function descargarQR() {
    const dataUrl = tarjetaDataURL()
    if (!dataUrl) return
    const link = document.createElement('a')
    link.download = `giftcard-${qrCard.codigo}.png`
    link.href = dataUrl
    link.click()
  }
  async function enviarEmail() {
    setMailMsg('')
    const email = qrCard.clientes?.email
    if (!email) {
      setMailMsg('⚠️ El cliente no tiene email cargado.')
      return
    }
    const dataUrl = tarjetaDataURL()
    if (!dataUrl) return
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
          comercio: qrCard.empresas?.comercio,
          vencimiento: qrCard.fecha_vencimiento
            ? new Date(qrCard.fecha_vencimiento + 'T00:00:00').toLocaleDateString('es-AR')
            : null,
          qrDataUrl: dataUrl,
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

  const cardsFiltradas = filtroEstado === 'todas' ? cards : cards.filter((c) => c.estado === filtroEstado)

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Card>
        <h2 className="font-bold text-lg mb-4">Atención al cliente</h2>
        <form onSubmit={buscar} className="flex flex-wrap gap-2 items-end">
          <Input
            label="Buscar cliente por nombre o DNI"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-full sm:flex-1"
          />
          <Button type="submit" disabled={buscando}>
            {buscando ? 'Buscando…' : 'Buscar'}
          </Button>
        </form>
        {error && <p className="text-sm text-red-600 mt-3">{error}</p>}

        {/* Resultados de búsqueda (si hay varios) */}
        {matches.length > 0 && (
          <ul className="mt-4 divide-y border rounded-lg">
            {matches.map((c) => (
              <li key={c.id}>
                <button
                  className="w-full text-left px-3 py-2 hover:bg-slate-50 flex justify-between items-center"
                  onClick={() => elegirCliente(c)}
                >
                  <span className="font-medium">{c.nombre}</span>
                  <span className="text-sm text-slate-500">DNI {c.dni}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {clienteSel && (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <h3 className="font-bold text-lg">{clienteSel.nombre}</h3>
              <p className="text-sm text-slate-500">
                DNI {clienteSel.dni}
                {clienteSel.email ? ` · ${clienteSel.email}` : ' · sin email'}
              </p>
            </div>
            <Select
              label="Estado"
              value={filtroEstado}
              onChange={(e) => setFiltroEstado(e.target.value)}
              className="w-auto"
            >
              <option value="todas">Todas</option>
              <option value="activa">Activas</option>
              <option value="agotada">Agotadas / usadas</option>
              <option value="anulada">Anuladas</option>
            </Select>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm responsive-table">
              <thead>
                <tr className="text-center text-slate-500 border-b">
                  <th className="py-2">Código</th>
                  <th>Empresa</th>
                  <th>Máx.</th>
                  <th>Saldo</th>
                  <th>Vence</th>
                  <th>Estado</th>
                  <th></th>
                </tr>
              </thead>
              <tbody className="text-center">
                {cardsFiltradas.map((c) => (
                  <tr key={c.id} className="border-b last:border-0">
                    <td className="py-2 font-mono font-semibold" data-label="Código">{c.codigo}</td>
                    <td data-label="Empresa">{c.empresas?.nombre || '—'}</td>
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
                    <td data-label="Acciones">
                      {c.estado === 'activa' && !vencida(c) ? (
                        <Button variant="ghost" onClick={() => setQrCard(c)} title="Ver / enviar QR">
                          🔳
                        </Button>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                  </tr>
                ))}
                {cardsFiltradas.length === 0 && (
                  <tr>
                    <td colSpan="7" className="py-6 text-center text-slate-400">
                      Sin gift cards {filtroEstado !== 'todas' ? 'en ese estado' : 'para este cliente'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Popup con el QR (solo gift cards activas) */}
      {qrCard && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={cerrarQr}>
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 text-center relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={cerrarQr}
              className="absolute top-3 right-3 text-slate-400 hover:text-slate-700 text-xl leading-none z-20"
              aria-label="Cerrar"
            >
              ✕
            </button>
            {/* Tarjeta estilo crédito: fondo según comercio, QR blanco */}
            <div
              className="text-white rounded-2xl p-6 flex items-center gap-4 text-left shadow-lg"
              style={{ backgroundColor: colorComercio(qrCard.empresas?.comercio) }}
            >
              <div className="flex-1 min-w-0">
                <p className="text-xs tracking-[0.25em] text-white/60">GIFT CARD</p>
                <p className="font-mono text-2xl font-bold tracking-widest mt-6 break-all">{qrCard.codigo}</p>
                <p className="text-base text-white/80 mt-1">{money(qrCard.monto_max)}</p>
                {qrCard.empresas?.comercio && (
                  <p className="text-xs text-white/60 mt-1">Solo en: {qrCard.empresas.comercio}</p>
                )}
              </div>
              <div ref={qrRef} className="shrink-0 rounded-lg overflow-hidden">
                <QRCodeCanvas
                  value={qrCard.codigo}
                  size={180}
                  bgColor={colorComercio(qrCard.empresas?.comercio)}
                  fgColor="#ffffff"
                  includeMargin
                />
              </div>
            </div>
            {qrCard.fecha_vencimiento && (
              <p className="text-xs text-amber-600 mt-2">
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
