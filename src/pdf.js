import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

export async function abrirPdf(blob) {
  const data = new Uint8Array(await blob.arrayBuffer())
  return pdfjs.getDocument({ data }).promise
}

// Tamanos reales de todas las paginas (para que el scroll sea exacto en libros largos).
export async function tamanosPaginas(pdf, onProgreso) {
  const total = pdf.numPages
  const sizes = new Array(total)
  const LOTE = 40
  for (let i = 0; i < total; i += LOTE) {
    const lote = []
    for (let j = i; j < Math.min(i + LOTE, total); j++) {
      lote.push(
        pdf.getPage(j + 1).then((p) => {
          const v = p.getViewport({ scale: 1 })
          sizes[j] = { w: v.width, h: v.height }
          p.cleanup()
        }),
      )
    }
    await Promise.all(lote)
    onProgreso?.(Math.min(i + LOTE, total) / total)
  }
  return sizes
}

export async function generarPortada(pdf, anchoPx = 360) {
  const page = await pdf.getPage(1)
  const base = page.getViewport({ scale: 1 })
  const vp = page.getViewport({ scale: anchoPx / base.width })
  const canvas = document.createElement('canvas')
  canvas.width = Math.floor(vp.width)
  canvas.height = Math.floor(vp.height)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  await page.render({ canvasContext: ctx, viewport: vp }).promise
  page.cleanup()
  const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.82))
  canvas.width = 0
  canvas.height = 0
  return blob
}

export async function titulo(pdf, nombreArchivo) {
  try {
    const { info } = await pdf.getMetadata()
    const t = info?.Title?.trim()
    if (t && t.length > 1) return t
  } catch {
    /* sin metadatos */
  }
  return nombreArchivo.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').trim()
}

export async function autor(pdf) {
  try {
    const { info } = await pdf.getMetadata()
    return info?.Author?.trim() || ''
  } catch {
    return ''
  }
}

// En pdf.js v6 el documento ya no tiene destroy(): se libera desde su loadingTask.
export function cerrarPdf(pdf) {
  try {
    return pdf?.loadingTask?.destroy()
  } catch {
    /* ya cerrado */
  }
}
