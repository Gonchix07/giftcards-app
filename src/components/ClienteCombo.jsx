import { useState } from 'react'

// Select editable de clientes con filtro por texto (nombre, DNI o código).
export default function ClienteCombo({
  clientes,
  value,
  onChange,
  label,
  placeholder = 'Buscar por nombre, DNI o código…',
  allowEmpty = true,
  inputClassName = '',
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')

  const sel = clientes.find((c) => c.id === value)
  const labelSel = sel ? `${sel.nombre} (${sel.dni})` : ''
  const text = open ? q : labelSel

  const s = q.trim().toLowerCase()
  const filtered = clientes
    .filter((c) => {
      if (!open || !s) return true
      return (
        c.nombre.toLowerCase().includes(s) ||
        (c.dni || '').includes(s) ||
        (c.codigo_cliente || '').toLowerCase().includes(s)
      )
    })
    .slice(0, 50)

  function elegir(id) {
    onChange(id)
    setOpen(false)
    setQ('')
  }

  const input = (
    <div className="relative">
      <input
        value={text}
        placeholder={placeholder}
        onFocus={() => {
          setOpen(true)
          setQ('')
        }}
        onChange={(e) => {
          setQ(e.target.value)
          if (!open) setOpen(true)
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className={`w-full px-3 py-2 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 ${inputClassName}`}
      />
      {open && (
        <ul className="absolute z-30 mt-1 w-full max-h-56 overflow-auto bg-white border border-slate-200 rounded-lg shadow-lg text-sm">
          {allowEmpty && (
            <li>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => elegir('')}
                className="w-full text-left px-3 py-2 hover:bg-slate-50 text-slate-500"
              >
                — Sin asignar —
              </button>
            </li>
          )}
          {filtered.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => elegir(c.id)}
                className="w-full text-left px-3 py-2 hover:bg-indigo-50"
              >
                <span className="font-medium">{c.nombre}</span>{' '}
                <span className="text-slate-500">
                  ({c.dni}){c.codigo_cliente ? ` · ${c.codigo_cliente}` : ''}
                </span>
              </button>
            </li>
          ))}
          {filtered.length === 0 && <li className="px-3 py-2 text-slate-400">Sin resultados</li>}
        </ul>
      )}
    </div>
  )

  if (!label) return input
  return (
    <label className="block">
      <span className="block text-sm font-medium text-slate-600 mb-1">{label}</span>
      {input}
    </label>
  )
}
