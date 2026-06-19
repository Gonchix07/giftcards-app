// Función serverless de Vercel: envía la Gift Card por email con el QR adjunto.
// Usa Brevo (https://brevo.com) y la plantilla editable guardada en config_email.
// Configurá en Vercel:
//   BREVO_API_KEY -> API key de Brevo
//   MAIL_FROM     -> remitente verificado, ej: "Gift Cards <giftcards@tudominio.com>"

import { createClient } from '@supabase/supabase-js'

const supaUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const supaAnon = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY

// Plantilla por defecto si no se puede leer la config
const DEFAULT_TPL = {
  asunto: 'Tu Gift Card {codigo}',
  titulo: '🎁 Tu Gift Card de {empresa}',
  intro: 'Hola {nombre}, te enviamos tu Gift Card.',
  instrucciones: 'Presentá este código o el QR adjunto en la caja para usar tu saldo (podés usarlo en compras parciales).',
}

function parseFrom(value) {
  const m = /^\s*(.*?)\s*<\s*([^>]+)\s*>\s*$/.exec(value || '')
  if (m) return { name: m[1] || 'Gift Cards', email: m[2] }
  return { name: 'Gift Cards', email: (value || '').trim() }
}

// Reemplaza {nombre} {codigo} {monto} {empresa} {vencimiento} en un texto
function subst(str, vars) {
  return String(str || '').replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? vars[k] : ''))
}

async function getPlantilla() {
  try {
    if (!supaUrl || !supaAnon) return DEFAULT_TPL
    const sb = createClient(supaUrl, supaAnon)
    const { data } = await sb.from('config_email').select('*').eq('id', 1).single()
    return data || DEFAULT_TPL
  } catch {
    return DEFAULT_TPL
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' })
  }

  const apiKey = process.env.BREVO_API_KEY
  const from = process.env.MAIL_FROM
  if (!apiKey || !from) {
    return res.status(500).json({ error: 'Falta configurar BREVO_API_KEY o MAIL_FROM en el servidor.' })
  }

  try {
    const { to, nombre, codigo, montoMax, empresa, vencimiento, qrDataUrl } = req.body || {}
    if (!to || !codigo || !qrDataUrl) {
      return res.status(400).json({ error: 'Faltan datos (to, codigo, qrDataUrl).' })
    }

    const base64 = String(qrDataUrl).split(',')[1] || ''
    const montoFmt = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(
      Number(montoMax || 0)
    )

    const tpl = await getPlantilla()
    const vars = {
      nombre: nombre || '',
      codigo,
      monto: montoFmt,
      empresa: empresa || '',
      vencimiento: vencimiento || '',
    }

    const venceTxt = vencimiento ? `<p>Válida hasta el <strong>${vencimiento}</strong>.</p>` : ''
    const html = `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;color:#1e293b">
        <h2 style="color:#4338ca">${subst(tpl.titulo, vars)}</h2>
        <p>${subst(tpl.intro, vars)}</p>
        <p style="font-size:14px;color:#64748b">Código</p>
        <p style="font-size:28px;font-weight:bold;letter-spacing:4px;font-family:monospace">${codigo}</p>
        <p>Monto: <strong>${montoFmt}</strong></p>
        ${venceTxt}
        <p>${subst(tpl.instrucciones, vars)}</p>
      </div>`

    const sender = parseFrom(from)

    const resp = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': apiKey, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        sender,
        to: [{ email: to, name: nombre || undefined }],
        subject: subst(tpl.asunto, vars),
        htmlContent: html,
        attachment: [{ name: `giftcard-${codigo}.png`, content: base64 }],
      }),
    })

    if (!resp.ok) {
      const detail = await resp.text()
      return res.status(502).json({ error: 'Error al enviar el email', detail })
    }

    return res.status(200).json({ ok: true })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
