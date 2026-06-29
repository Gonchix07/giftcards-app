// Color de fondo de la tarjeta según el comercio donde se usa.
export function cardBg(comercio) {
  return comercio === 'Tiendas Menor Coste' ? '#15803d' : '#1e3a8a'
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = url
  })
}

// Compone la imagen final de la gift card y devuelve un dataURL PNG.
// Modo template: usa el PNG importado a su tamaño real; superpone QR + código.
// Modo clásico:  fondo sólido 900×567 con QR y texto.
export async function composeCardDataURL(
  qrCanvas,
  { codigo = '', comercio = '', monto = '', bg = '#0b0b0d', templateUrl = null, qrPosicion = 'izquierda' } = {}
) {
  const M = 40 // marco blanco exterior

  // ── Modo template ────────────────────────────────────────────────────────
  if (templateUrl) {
    let img = null
    try { img = await loadImage(templateUrl) } catch { /* fallback a color */ }

    // Usar las dimensiones reales del PNG para no distorsionar la imagen
    const W = img ? img.naturalWidth  : 900
    const H = img ? img.naturalHeight : 567

    // Factor de escala respecto al diseño de referencia (900×567)
    const sx = W / 900
    const sy = H / 567
    const s  = Math.min(sx, sy)

    const canvas = document.createElement('canvas')
    canvas.width  = W + M * 2
    canvas.height = H + M * 2
    const ctx = canvas.getContext('2d')

    // Marco blanco exterior
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.translate(M, M)

    // Fondo = template a su tamaño real (el modelo ya trae sus esquinas redondeadas)
    if (img) {
      ctx.drawImage(img, 0, 0, W, H)
    } else {
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, W, H)
    }

    // Posiciones y tamaños escalados al tamaño real del template
    const pad    = Math.round(52 * s)
    const qrSize = Math.round(185 * s)
    const qrY    = H - qrSize - Math.round(77 * sy)
    const qrX    = qrPosicion === 'derecha'
      ? W - qrSize - pad - Math.round(35 * sx)
      : pad + Math.round(35 * sx)
    const qrCx   = qrX + qrSize / 2 // centro horizontal del bloque QR

    // "ESCANEÁME!" centrado sobre el QR
    ctx.fillStyle = '#ffffff'
    ctx.font = `bold ${Math.round(22 * s)}px Arial`
    ctx.textAlign = 'center'
    ctx.fillText('ESCANEÁME!', qrCx, qrY - Math.round(10 * sy))

    // QR
    ctx.drawImage(qrCanvas, qrX, qrY, qrSize, qrSize)

    // Código alfanumérico centrado bajo el QR
    ctx.fillStyle = '#ffffff'
    ctx.font = `bold ${Math.round(32 * s)}px monospace`
    ctx.textAlign = 'center'
    ctx.fillText(codigo, qrCx, qrY + qrSize + Math.round(32 * sy))

    return canvas.toDataURL('image/png')
  }

  // ── Modo clásico: fondo sólido 900×567 ───────────────────────────────────
  const W = 900
  const H = 567
  const pad = 52
  const r = 36

  const canvas = document.createElement('canvas')
  canvas.width  = W + M * 2
  canvas.height = H + M * 2
  const ctx = canvas.getContext('2d')

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.translate(M, M)

  ctx.fillStyle = bg
  if (ctx.roundRect) {
    ctx.beginPath()
    ctx.roundRect(0, 0, W, H, r)
    ctx.fill()
  } else {
    ctx.fillRect(0, 0, W, H)
  }

  ctx.fillStyle = '#9ca3af'
  ctx.font = '600 26px Arial'
  ctx.textAlign = 'left'
  ctx.fillText('GIFT CARD', pad, pad + 24)

  const qrSize = 300
  ctx.drawImage(qrCanvas, W - qrSize - pad, (H - qrSize) / 2, qrSize, qrSize)

  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 50px monospace'
  ctx.fillText(codigo, pad, H - 128)

  if (monto) {
    ctx.fillStyle = '#e5e7eb'
    ctx.font = '600 30px Arial'
    ctx.fillText(monto, pad, H - 84)
  }

  if (comercio) {
    ctx.fillStyle = '#9ca3af'
    ctx.font = '20px Arial'
    ctx.fillText('Solo para uso en: ' + comercio, pad, H - 44)
  }

  return canvas.toDataURL('image/png')
}
