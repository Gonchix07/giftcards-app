// Compone una imagen "tarjeta estilo crédito": fondo negro y QR blanco.
// Recibe el <canvas> del QR (renderizado en blanco sobre negro) y devuelve un dataURL PNG.
export function composeCardDataURL(qrCanvas, { codigo = '', comercio = '', monto = '' } = {}) {
  const W = 900
  const H = 567 // relación ~1.586 (tarjeta de crédito)
  const pad = 52
  const r = 36
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')

  // Fondo negro con esquinas redondeadas
  ctx.fillStyle = '#0b0b0d'
  if (ctx.roundRect) {
    ctx.beginPath()
    ctx.roundRect(0, 0, W, H, r)
    ctx.fill()
  } else {
    ctx.fillRect(0, 0, W, H)
  }

  // Etiqueta superior
  ctx.fillStyle = '#9ca3af'
  ctx.font = '600 26px Arial'
  ctx.fillText('GIFT CARD', pad, pad + 24)

  // QR (blanco sobre negro) a la derecha, centrado verticalmente
  const qrSize = 300
  ctx.drawImage(qrCanvas, W - qrSize - pad, (H - qrSize) / 2, qrSize, qrSize)

  // Código
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 50px monospace'
  ctx.fillText(codigo, pad, H - 128)

  // Monto
  if (monto) {
    ctx.fillStyle = '#e5e7eb'
    ctx.font = '600 30px Arial'
    ctx.fillText(monto, pad, H - 84)
  }

  // Comercio
  if (comercio) {
    ctx.fillStyle = '#9ca3af'
    ctx.font = '20px Arial'
    ctx.fillText('Solo para uso en: ' + comercio, pad, H - 44)
  }

  return canvas.toDataURL('image/png')
}
