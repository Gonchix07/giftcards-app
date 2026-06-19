// Función serverless de Vercel: envía la Gift Card por email con el QR adjunto.
// Usa Brevo (https://brevo.com). Configurá en Vercel las variables de entorno:
//   BREVO_API_KEY -> API key de Brevo (Settings -> SMTP & API -> API Keys)
//   MAIL_FROM     -> remitente verificado, ej: "Gift Cards <giftcards@tudominio.com>"
//
// El front envía el QR ya generado (dataURL PNG) para adjuntarlo.

// Convierte "Nombre <email@dom.com>" en { name, email }. Acepta también solo el email.
function parseFrom(value) {
  const m = /^\s*(.*?)\s*<\s*([^>]+)\s*>\s*$/.exec(value || '')
  if (m) return { name: m[1] || 'Gift Cards', email: m[2] }
  return { name: 'Gift Cards', email: (value || '').trim() }
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

    // qrDataUrl viene como "data:image/png;base64,XXXX" -> extraemos el base64
    const base64 = String(qrDataUrl).split(',')[1] || ''

    const montoFmt = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(
      Number(montoMax || 0)
    )
    const venceTxt = vencimiento ? `<p>Válida hasta el <strong>${vencimiento}</strong>.</p>` : ''

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;color:#1e293b">
        <h2 style="color:#4338ca">🎁 Tu Gift Card${empresa ? ' de ' + empresa : ''}</h2>
        <p>Hola ${nombre || ''}, te enviamos tu Gift Card.</p>
        <p style="font-size:14px;color:#64748b">Código</p>
        <p style="font-size:28px;font-weight:bold;letter-spacing:4px;font-family:monospace">${codigo}</p>
        <p>Monto: <strong>${montoFmt}</strong></p>
        ${venceTxt}
        <p>Presentá este código o el QR adjunto en la caja para usar tu saldo (podés usarlo en compras parciales).</p>
      </div>`

    const sender = parseFrom(from)

    const resp = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        sender,
        to: [{ email: to, name: nombre || undefined }],
        subject: `Tu Gift Card ${codigo}`,
        htmlContent: html,
        attachment: [
          {
            name: `giftcard-${codigo}.png`,
            content: base64, // base64 del PNG
          },
        ],
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
