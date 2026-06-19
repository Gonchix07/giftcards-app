import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { Button, Input, Card } from '../components/ui'

// Reemplaza placeholders para la vista previa
function subst(str, vars) {
  return String(str || '').replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? vars[k] : ''))
}

const EJEMPLO = {
  nombre: 'Juan Pérez',
  codigo: 'A1B2C3D4',
  monto: '$ 15.000',
  empresa: 'HERGO',
  comercio: 'HERGO Mayorista',
  vencimiento: '31/12/2026',
}

export default function Mails() {
  const [form, setForm] = useState({ asunto: '', titulo: '', intro: '', instrucciones: '' })
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')

  async function load() {
    const { data } = await supabase.from('config_email').select('*').eq('id', 1).single()
    if (data) setForm({ asunto: data.asunto, titulo: data.titulo, intro: data.intro, instrucciones: data.instrucciones })
  }
  useEffect(() => {
    load()
  }, [])

  async function guardar(e) {
    e.preventDefault()
    setError('')
    setMsg('')
    setLoading(true)
    const { error } = await supabase
      .from('config_email')
      .update({ ...form, updated_at: new Date().toISOString() })
      .eq('id', 1)
    setLoading(false)
    if (error) setError(error.message)
    else setMsg('✅ Plantilla guardada.')
  }

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <Card className="h-fit">
        <h2 className="font-bold text-lg mb-1">Plantilla de email</h2>
        <p className="text-sm text-slate-500 mb-2">
          Modelo genérico que se envía a los clientes. Podés usar las variables{' '}
          <code className="text-xs bg-slate-100 px-1 rounded">{'{nombre}'}</code>{' '}
          <code className="text-xs bg-slate-100 px-1 rounded">{'{codigo}'}</code>{' '}
          <code className="text-xs bg-slate-100 px-1 rounded">{'{monto}'}</code>{' '}
          <code className="text-xs bg-slate-100 px-1 rounded">{'{empresa}'}</code>{' '}
          <code className="text-xs bg-slate-100 px-1 rounded">{'{comercio}'}</code>{' '}
          <code className="text-xs bg-slate-100 px-1 rounded">{'{vencimiento}'}</code>, que se reemplazan al enviar.
        </p>
        <p className="text-xs text-slate-500 mb-4">
          El <strong>título</strong> y los <strong>textos</strong> admiten HTML: por ejemplo{' '}
          <code className="bg-slate-100 px-1 rounded">{'<b>negrita</b>'}</code>,{' '}
          <code className="bg-slate-100 px-1 rounded">{'<br>'}</code> (salto de línea),{' '}
          <code className="bg-slate-100 px-1 rounded">{'<a href="...">enlace</a>'}</code>. El asunto es texto plano.
        </p>
        <form onSubmit={guardar} className="space-y-3">
          <Input
            label="Asunto"
            value={form.asunto}
            onChange={(e) => setForm({ ...form, asunto: e.target.value })}
            required
          />
          <Input
            label="Título general"
            value={form.titulo}
            onChange={(e) => setForm({ ...form, titulo: e.target.value })}
            required
          />
          <label className="block">
            <span className="block text-sm font-medium text-slate-600 mb-1">Texto de introducción</span>
            <textarea
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              rows={3}
              value={form.intro}
              onChange={(e) => setForm({ ...form, intro: e.target.value })}
            />
          </label>
          <label className="block">
            <span className="block text-sm font-medium text-slate-600 mb-1">Texto de instrucciones</span>
            <textarea
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              rows={3}
              value={form.instrucciones}
              onChange={(e) => setForm({ ...form, instrucciones: e.target.value })}
            />
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          {msg && <p className="text-sm text-green-700">{msg}</p>}
          <Button type="submit" disabled={loading}>
            {loading ? 'Guardando…' : 'Guardar plantilla'}
          </Button>
        </form>
      </Card>

      {/* Vista previa */}
      <Card className="h-fit">
        <h2 className="font-bold text-lg mb-4">Vista previa</h2>
        <p className="text-xs text-slate-500 mb-2">
          Asunto: <strong>{subst(form.asunto, EJEMPLO)}</strong>
        </p>
        <div className="border rounded-lg p-4" style={{ fontFamily: 'Arial, sans-serif', color: '#1e293b' }}>
          <h2 style={{ color: '#4338ca' }} dangerouslySetInnerHTML={{ __html: subst(form.titulo, EJEMPLO) }} />
          <p dangerouslySetInnerHTML={{ __html: subst(form.intro, EJEMPLO) }} />
          <p style={{ fontSize: 14, color: '#64748b' }}>Código</p>
          <p style={{ fontSize: 28, fontWeight: 'bold', letterSpacing: 4, fontFamily: 'monospace' }}>
            {EJEMPLO.codigo}
          </p>
          <p>
            Monto: <strong>{EJEMPLO.monto}</strong>
          </p>
          <p>Válida hasta el <strong>{EJEMPLO.vencimiento}</strong>.</p>
          <p dangerouslySetInnerHTML={{ __html: subst(form.instrucciones, EJEMPLO) }} />
          <div className="mt-2 h-24 w-24 grid place-items-center border rounded bg-slate-50 text-slate-300 text-xs">
            QR adjunto
          </div>
        </div>
      </Card>
    </div>
  )
}
