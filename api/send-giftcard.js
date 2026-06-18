// Función serverless de Vercel: envía la Gift Card por email con el QR adjunto.
// Usa Resend (https://resend.com). Configurá en Vercel las variables de entorno:
//   RESEND_API_KEY  -> API key de Resend
//   MAIL_FROM       -> remitente verificado, ej: "Gift Cards <giftcards@tudominio.com>"
//
// El front envía el QR ya generado (dataURL PNG) para adjuntarlo.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' })
  }

  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.MAIL_FROM
  if (!apiKey || !from) {
    return res.status(500).json({ error: 'Falta configurar RESEND_API_KEY o MAIL_FROM en el servidor.' })
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
    const venceTxt = vencimiento
      ? `<p>Válida hasta el <strong>${vencimiento}</strong>.</p>`
      : ''

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;color:#1e293b">
        <h2 style="color:#4338ca">🎁 Tu Gift Card${empresa ? ' de ' + empresa : ''}</h2>
        <p>Hola ${nombre || ''}, te enviamos tu Gift Card.</p>
        <p style="font-size:14px;color:#64748b">Código</p>
        <p style="font-size:28px;font-weight:bold;letter-spacing:4px;font-family:monospace">${codigo}</p>
        <p>Monto: <strong>${montoFmt}</strong></p>
        ${venceTxt}
        <p>Presentá este código o el QR adjunto en la caja para usar tu saldo (podés usarlo en compras parciales).</p>
        <img src="cid:qr" alt="QR" width="200" height="200" style="border:1px solid #e2e8f0;border-radius:8px" />
      </div>`

    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject: `Tu Gift Card ${codigo}`,
        html,
        attachments: [
          {
            filename: `giftcard-${codigo}.png`,
            content: base64,
            content_id: 'qr', // permite mostrarla inline con cid:qr
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
