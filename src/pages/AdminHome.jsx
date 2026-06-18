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

export default function AdminHome() {
  const [empresas, setEmpresas] = useState(null)
  const [totales, setTotales] = useState(null)

  useEffect(() => {
    async function load() {
      const [emp, cards] = await Promise.all([
        supabase.from('empresas').select('id, nombre').order('nombre'),
        supabase.from('giftcards').select('empresa_id, monto_max, saldo, cliente_id'),
      ])
      const cs = cards.data || []

      // Agrupa las gift cards por empresa
      const porEmpresa = (emp.data || []).map((e) => {
        const propias = cs.filter((c) => c.empresa_id === e.id)
        const emitido = propias.reduce((a, c) => a + Number(c.monto_max), 0)
        const usado = propias.reduce((a, c) => a + (Number(c.monto_max) - Number(c.saldo)), 0)
        const clientes = new Set(propias.filter((c) => c.cliente_id).map((c) => c.cliente_id)).size
        return { id: e.id, nombre: e.nombre, emitido, usado, cantidad: propias.length, clientes }
      })

      setEmpresas(porEmpresa)
      setTotales({
        emitido: cs.reduce((a, c) => a + Number(c.monto_max), 0),
        usado: cs.reduce((a, c) => a + (Number(c.monto_max) - Number(c.saldo)), 0),
        cantidad: cs.length,
        empresas: porEmpresa.length,
      })
    }
    load()
  }, [])

  if (!empresas || !totales) return <p className="text-slate-500">Cargando…</p>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold">Panel de administración</h1>
        <Link to="/admin/giftcards" className="text-sm text-indigo-600 hover:underline">
          Ir a Gift Cards →
        </Link>
      </div>

      {/* Totales generales */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MiniStat label="Total emitido" value={money(totales.emitido)} />
        <MiniStat label="Total usado" value={money(totales.usado)} />
        <MiniStat label="Gift cards" value={totales.cantidad} />
        <MiniStat label="Empresas" value={totales.empresas} />
      </div>

      {/* Desglose por empresa */}
      <div>
        <h2 className="font-bold text-lg mb-3">Por empresa</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          {empresas.map((e) => (
            <Link key={e.id} to={`/admin/giftcards?empresa=${e.id}`}>
              <Card className="hover:shadow-md hover:border-indigo-300 transition cursor-pointer">
                <h3 className="font-semibold text-slate-800 mb-3 flex items-center justify-between">
                  {e.nombre}
                  <span className="text-xs font-normal text-indigo-600">Ver gift cards →</span>
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
              No hay empresas cargadas todavía.
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
