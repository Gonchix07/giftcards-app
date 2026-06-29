import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { Card, money } from '../components/ui'

function MiniStat({ label, value }) {
  return (
    <div className="bg-slate-50 rounded-lg p-3 text-center">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-lg font-bold text-slate-800 mt-0.5">{value}</p>
    </div>
  )
}

const PERIODOS = [
  { label: 'Últimos 7 días', dias: 7 },
  { label: 'Últimos 30 días', dias: 30 },
  { label: 'Últimos 90 días', dias: 90 },
  { label: 'Último año', dias: 365 },
  { label: 'Todo el historial', dias: 0 },
]

export default function AdminHome() {
  const [dias, setDias] = useState(30)
  const [empresas, setEmpresas] = useState(null)
  const [totales, setTotales] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      // Fecha de corte según el período elegido (0 = todo el historial)
      const desde = dias > 0 ? new Date(Date.now() - dias * 86400000).toISOString() : null

      let gcq = supabase.from('giftcards').select('empresa_id, monto_max, cliente_id, created_at')
      let txq = supabase.from('transacciones').select('monto, created_at, giftcards(empresa_id)')
      if (desde) {
        gcq = gcq.gte('created_at', desde)
        txq = txq.gte('created_at', desde)
      }

      const [emp, cards, txs] = await Promise.all([
        supabase.from('empresas').select('id, nombre, activo').order('nombre'),
        gcq,
        txq,
      ])
      const cs = cards.data || []
      const ts = txs.data || []

      const porEmpresa = (emp.data || []).map((e) => {
        const propias = cs.filter((c) => c.empresa_id === e.id)
        const emitido = propias.reduce((a, c) => a + Number(c.monto_max), 0)
        const usado = ts
          .filter((t) => t.giftcards?.empresa_id === e.id)
          .reduce((a, t) => a + Number(t.monto), 0)
        const clientes = new Set(propias.filter((c) => c.cliente_id).map((c) => c.cliente_id)).size
        return { id: e.id, nombre: e.nombre, activo: e.activo, emitido, usado, cantidad: propias.length, clientes }
      })

      setEmpresas(porEmpresa.sort((a, b) => (b.activo ? 1 : 0) - (a.activo ? 1 : 0)))
      setTotales({
        emitido: cs.reduce((a, c) => a + Number(c.monto_max), 0),
        usado: ts.reduce((a, t) => a + Number(t.monto), 0),
        cantidad: cs.length,
        empresas: (emp.data || []).length,
      })
      setLoading(false)
    }
    load()
  }, [dias])

  return (
    <div className="space-y-6 text-sm">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <div className="flex items-center gap-2">
          <label className="text-sm text-slate-500">Período:</label>
          <select
            className="px-3 py-2 border border-slate-300 rounded-lg bg-white text-sm"
            value={dias}
            onChange={(e) => setDias(Number(e.target.value))}
          >
            {PERIODOS.map((p) => (
              <option key={p.dias} value={p.dias}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading || !empresas || !totales ? (
        <p className="text-slate-500">Cargando…</p>
      ) : (
        <>
          <p className="text-sm text-slate-400 -mt-2">
            Mostrando {dias > 0 ? `los últimos ${dias} días` : 'todo el historial'} · emitido y gift cards por
            fecha de creación, usado por fecha de consumo.
          </p>

          {/* Totales generales */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <MiniStat label="Total emitido" value={money(totales.emitido)} />
            <MiniStat label="Total usado" value={money(totales.usado)} />
            <MiniStat label="Gift cards" value={totales.cantidad} />
            <MiniStat label="Campañas" value={totales.empresas} />
          </div>

          {/* Desglose por empresa */}
          <div>
            <h2 className="font-bold text-base mb-3">Por campaña</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              {empresas.map((e) => (
                <Link key={e.id} to={`/admin/giftcards?empresa=${e.id}`}>
                  <Card className={`hover:shadow-md hover:border-indigo-300 transition cursor-pointer ${!e.activo ? 'opacity-50' : ''}`}>
                    <h3 className="font-semibold text-slate-800 mb-3 flex items-center justify-between gap-2">
                      <span className="truncate">{e.nombre}</span>
                      <span className="flex items-center gap-2 shrink-0">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${e.activo ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                          {e.activo ? 'Activa' : 'Inactiva'}
                        </span>
                        <span className="text-xs font-normal text-indigo-600">Ver gift cards →</span>
                      </span>
                    </h3>
                    <div className="grid grid-cols-2 gap-3">
                      <MiniStat label="Total emitido" value={money(e.emitido)} />
                      <MiniStat label="Total usado" value={money(e.usado)} />
                      <MiniStat label="Gift cards" value={e.cantidad} />
                      <MiniStat label="Clientes" value={e.clientes} />
                    </div>
                  </Card>
                </Link>
              ))}
              {empresas.length === 0 && (
                <Card className="sm:col-span-2 text-center text-slate-400">
                  No hay campañas cargadas todavía.
                </Card>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
