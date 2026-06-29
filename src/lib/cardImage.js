// Color de fondo de la tarjeta según el comercio donde se usa.
export function cardBg(comercio) {
  return comercio === 'Tiendas Menor Coste' ? '#15803d' : '#1e3a8a'
}

// Carga una imagen desde URL y devuelve una promesa.
function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = url
  })
}

// Compone una imagen "tarjeta estilo crédito" con QR.
// Si se pasa templateUrl se usa el PNG como fondo y se superponen QR + código.
// qrCanvas debe tener bgColor="#ffffff" fgColor oscuro para composición correcta.
export async function composeCardDataURL(
  qrCanvas,
  { codigo = '', comercio = '', monto = '', bg = '#0b0b0d', templateUrl = null, qrPosicion = 'izquierda' } = {}
) {
  const W = 900
  const H = 567 // relación ~1.586 (tarjeta de crédito)
  const pad = 52
  const r = 36
  const M = 40 // marco blanco alrededor de la tarjeta
  const canvas = document.createElement('canvas')
  canvas.width = W + M * 2
  canvas.height = H + M * 2
  const ctx = canvas.getContext('2d')

  // Marco blanco (fondo exterior)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.translate(M, M)

  if (templateUrl) {
    // ── Modo template: fondo = PNG importado ──────────────────────────────────
    let img
    try {
      img = await loadImage(templateUrl)
    } catch {
      // Fallback a color sólido si la imagen no carga
      img = null
    }

    // Fondo con esquinas redondeadas
    ctx.save()
    ctx.beginPath()
    if (ctx.roundRect) {
      ctx.roundRect(0, 0, W, H, r)
    } else {
      ctx.rect(0, 0, W, H)
    }
    ctx.clip()
    if (img) {
      ctx.drawImage(img, 0, 0, W, H)
    } else {
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, W, H)
    }
    ctx.restore()

    // QR: tamaño y posición según qr_posicion
    const qrSize = 185
    const qrY = H - qrSize - 72
    const qrX = qrPosicion === 'derecha' ? W - qrSize - pad - 50 : pad + 50

    // Etiqueta "ESCANEÁME!" sobre el QR
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 22px Arial'
    ctx.textAlign = 'left'
    ctx.fillText('ESCANEÁME!', qrX, qrY - 10)

    // Dibujar QR (con su propio fondo blanco incluido)
    ctx.drawImage(qrCanvas, qrX, qrY, qrSize, qrSize)

    // Código alfanumérico bajo el QR
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 32px monospace'
    ctx.textAlign = 'left'
    ctx.fillText(codigo, qrX, qrY + qrSize + 32)
  } else {
    // ── Modo clásico: fondo sólido ───────────────────────────────────────────
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
    ctx.fillText('GIFT CARD', pad, pad + 24)

    // QR a la derecha, centrado verticalmente
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
  }

  return canvas.toDataURL('image/png')
}
