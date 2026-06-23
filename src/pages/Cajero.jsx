import { useEffect, useRef, useState } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import { supabase } from '../supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { Button, Input, Card, Badge, money } from '../components/ui'

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

  // Exporta la tabla del día a un archivo que abre Excel (.xls vía HTML)
  function exportarExcel() {
    const filas = misUsos
      .map(
        (t) => `<tr>
          <td>${new Date(t.created_at).toLocaleString('es-AR')}</td>
          <td>${t.giftcards?.codigo || ''}</td>
          <td>${t.giftcards?.clientes?.nombre || ''}</td>
          <td>${Number(t.monto)}</td>
        </tr>`
      )
      .join('')
    const html = `<table border="1">
      <thead><tr><th>Fecha</th><th>Codigo</th><th>Cliente</th><th>Monto</th></tr></thead>
      <tbody>${filas}</tbody>
    </table>`
    const blob = new Blob(['﻿' + html], { type: 'application/vnd.ms-excel' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `usos-${dia}.xls`
    link.click()
    URL.revokeObjectURL(link.href)
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
              <p className="text-slate-500">Empresa</p>
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
                type="number"
                min="0"
                step="0.01"
                max={card.saldo}
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                placeholder={`Hasta ${money(card.saldo)}`}
              />
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setMonto(String(card.saldo))}>
                  Usar todo
                </Button>
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
            <Button variant="secondary" onClick={exportarExcel} disabled={misUsos.length === 0}>
              ⬇️ Exportar a Excel
            </Button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs table-fixed text-center">
            <thead>
              <tr className="text-slate-500 border-b">
                <th className="py-2">Hora</th>
                <th>Código</th>
                <th>Cliente</th>
                <th>Monto</th>
              </tr>
            </thead>
            <tbody>
              {misUsos.map((t) => (
                <tr key={t.id} className="border-b last:border-0">
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
                  <td colSpan="4" className="py-6 text-center text-slate-400">
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
