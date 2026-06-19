import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { Card, Badge, Button, money } from '../components/ui'

const estadoColor = { activa: 'green', agotada: 'slate', anulada: 'red' }

export default function Reportes() {
  const [tab, setTab] = useState('saldos')
  const [cards, setCards] = useState([])
  const [txs, setTxs] = useState([])
  const [audit, setAudit] = useState([])

  useEffect(() => {
    async function load() {
      const [c, t, a] = await Promise.all([
        supabase
          .from('giftcards')
          .select('*, empresas(nombre), clientes(nombre, dni)')
          .order('created_at', { ascending: false }),
        supabase
          .from('transacciones')
          .select('*, giftcards(codigo, empresas(nombre), clientes(nombre, dni))')
          .order('created_at', { ascending: false }),
        supabase.from('auditoria').select('*').order('fecha', { ascending: false }).limit(1000),
      ])
      setCards(c.data || [])
      setTxs(t.data || [])
      setAudit(a.data || [])
    }
    load()
  }, [])

  const accionColor = {
    creacion: 'green',
    asignacion: 'amber',
    uso: 'slate',
    modificacion: 'slate',
    anulacion: 'red',
    eliminacion: 'red',
  }

  function exportCSV(rows, headers, filename) {
    const csv = [
      headers.map((h) => h.label).join(','),
      ...rows.map((r) => headers.map((h) => `"${String(h.get(r) ?? '').replace(/"/g, '""')}"`).join(',')),
    ].join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = filename
    link.click()
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Reportes</h1>
        <div className="flex gap-2">
          <Button variant={tab === 'saldos' ? 'primary' : 'secondary'} onClick={() => setTab('saldos')}>
            Saldos
          </Button>
          <Button variant={tab === 'usos' ? 'primary' : 'secondary'} onClick={() => setTab('usos')}>
            Usos
          </Button>
          <Button variant={tab === 'auditoria' ? 'primary' : 'secondary'} onClick={() => setTab('auditoria')}>
            Auditoría
          </Button>
        </div>
      </div>

      {tab === 'saldos' ? (
        <Card>
          <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
            <h2 className="font-bold">Saldos por Gift Card ({cards.length})</h2>
            <Button
              variant="secondary"
              onClick={() =>
                exportCSV(
                  cards,
                  [
                    { label: 'Codigo', get: (r) => r.codigo },
                    { label: 'Empresa', get: (r) => r.empresas?.nombre },
                    { label: 'Cliente', get: (r) => r.clientes?.nombre },
                    { label: 'DNI', get: (r) => r.clientes?.dni },
                    { label: 'MontoMax', get: (r) => r.monto_max },
                    { label: 'Saldo', get: (r) => r.saldo },
                    { label: 'Usado', get: (r) => Number(r.monto_max) - Number(r.saldo) },
                    { label: 'Vencimiento', get: (r) => r.fecha_vencimiento || '' },
                    { label: 'Estado', get: (r) => r.estado },
                  ],
                  'saldos.csv'
                )
              }
            >
              ⬇️ CSV
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm responsive-table">
              <thead>
                <tr className="text-center text-slate-500 border-b">
                  <th className="py-2">Código</th>
                  <th>Empresa</th>
                  <th>Cliente</th>
                  <th>Máx.</th>
                  <th>Usado</th>
                  <th>Saldo</th>
                  <th>Vence</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody className="text-center">
                {cards.map((c) => (
                  <tr key={c.id} className="border-b last:border-0">
                    <td className="py-2 font-mono font-semibold" data-label="Código">{c.codigo}</td>
                    <td data-label="Empresa">{c.empresas?.nombre || '—'}</td>
                    <td data-label="Cliente">{c.clientes?.nombre || <span className="text-slate-400">sin asignar</span>}</td>
                    <td data-label="Máx.">{money(c.monto_max)}</td>
                    <td className="text-slate-500" data-label="Usado">{money(Number(c.monto_max) - Number(c.saldo))}</td>
                    <td className="font-medium" data-label="Saldo">{money(c.saldo)}</td>
                    <td data-label="Vence">
                      {c.fecha_vencimiento
                        ? new Date(c.fecha_vencimiento + 'T00:00:00').toLocaleDateString('es-AR')
                        : '—'}
                    </td>
                    <td data-label="Estado">
                      {c.estado === 'activa' &&
                      c.fecha_vencimiento &&
                      new Date(c.fecha_vencimiento + 'T00:00:00') < new Date(new Date().toDateString()) ? (
                        <Badge color="red">vencida</Badge>
                      ) : (
                        <Badge color={estadoColor[c.estado]}>{c.estado}</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : tab === 'usos' ? (
        <Card>
          <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
            <h2 className="font-bold">Historial de usos ({txs.length})</h2>
            <Button
              variant="secondary"
              onClick={() =>
                exportCSV(
                  txs,
                  [
                    { label: 'Fecha', get: (r) => new Date(r.created_at).toLocaleString('es-AR') },
                    { label: 'Codigo', get: (r) => r.giftcards?.codigo },
                    { label: 'Empresa', get: (r) => r.giftcards?.empresas?.nombre },
                    { label: 'Cliente', get: (r) => r.giftcards?.clientes?.nombre },
                    { label: 'Monto', get: (r) => r.monto },
                    { label: 'SaldoResultante', get: (r) => r.saldo_resultante },
                    { label: 'Cajero', get: (r) => r.cajero_email },
                  ],
                  'usos.csv'
                )
              }
            >
              ⬇️ CSV
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm responsive-table">
              <thead>
                <tr className="text-center text-slate-500 border-b">
                  <th className="py-2">Fecha</th>
                  <th>Código</th>
                  <th>Cliente</th>
                  <th>Monto</th>
                  <th>Saldo result.</th>
                  <th>Cajero</th>
                </tr>
              </thead>
              <tbody className="text-center">
                {txs.map((t) => (
                  <tr key={t.id} className="border-b last:border-0">
                    <td className="py-2" data-label="Fecha">{new Date(t.created_at).toLocaleString('es-AR')}</td>
                    <td className="font-mono font-semibold" data-label="Código">{t.giftcards?.codigo}</td>
                    <td data-label="Cliente">{t.giftcards?.clientes?.nombre || '—'}</td>
                    <td className="font-medium" data-label="Monto">{money(t.monto)}</td>
                    <td className="text-slate-500" data-label="Saldo result.">{money(t.saldo_resultante)}</td>
                    <td className="text-slate-500" data-label="Cajero">{t.cajero_email || '—'}</td>
                  </tr>
                ))}
                {txs.length === 0 && (
                  <tr>
                    <td colSpan="6" className="py-6 text-center text-slate-400">
                      Sin usos registrados
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <Card>
          <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
            <h2 className="font-bold">Auditoría de movimientos ({audit.length})</h2>
            <Button
              variant="secondary"
              onClick={() =>
                exportCSV(
                  audit,
                  [
                    { label: 'FechaHora', get: (r) => new Date(r.fecha).toLocaleString('es-AR') },
                    { label: 'Usuario', get: (r) => r.usuario_email },
                    { label: 'Rol', get: (r) => r.usuario_rol },
                    { label: 'Accion', get: (r) => r.accion },
                    { label: 'Codigo', get: (r) => r.giftcard_codigo },
                    { label: 'Empresa', get: (r) => r.empresa },
                    { label: 'Cliente', get: (r) => r.cliente },
                    { label: 'Detalle', get: (r) => r.detalle },
                  ],
                  'auditoria.csv'
                )
              }
            >
              ⬇️ CSV
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm responsive-table">
              <thead>
                <tr className="text-center text-slate-500 border-b">
                  <th className="py-2">Fecha y hora</th>
                  <th>Usuario</th>
                  <th>Rol</th>
                  <th>Acción</th>
                  <th>Código</th>
                  <th>Detalle</th>
                </tr>
              </thead>
              <tbody className="text-center">
                {audit.map((a) => (
                  <tr key={a.id} className="border-b last:border-0">
                    <td className="py-2" data-label="Fecha y hora">{new Date(a.fecha).toLocaleString('es-AR')}</td>
                    <td className="text-slate-500" data-label="Usuario">{a.usuario_email || '—'}</td>
                    <td data-label="Rol">{a.usuario_rol || '—'}</td>
                    <td data-label="Acción">
                      <Badge color={accionColor[a.accion] || 'slate'}>{a.accion}</Badge>
                    </td>
                    <td className="font-mono font-semibold" data-label="Código">{a.giftcard_codigo || '—'}</td>
                    <td className="text-slate-500" data-label="Detalle">{a.detalle || '—'}</td>
                  </tr>
                ))}
                {audit.length === 0 && (
                  <tr>
                    <td colSpan="6" className="py-6 text-center text-slate-400">
                      Sin movimientos registrados
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}
