import { useEffect, useRef } from 'react'
import { PageFlip } from 'page-flip'

// Modo libro: la hoja se coge por la esquina y se dobla al girarla, como papel.
// Usa la libreria page-flip; las paginas del PDF se dibujan solo alrededor de la actual.

let audioCtx
function sonidoHoja() {
  try {
    audioCtx ||= new (window.AudioContext || window.webkitAudioContext)()
    const dur = 0.32
    const buf = audioCtx.createBuffer(1, audioCtx.sampleRate * dur, audioCtx.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < d.length; i++) {
      const t = i / d.length
      d[i] = (Math.random() * 2 - 1) * Math.sin(Math.PI * t) ** 2 * (1 - t * 0.5)
    }
    const src = audioCtx.createBufferSource()
    src.buffer = buf
    const f = audioCtx.createBiquadFilter()
    f.type = 'bandpass'
    f.frequency.setValueAtTime(1600, audioCtx.currentTime)
    f.frequency.linearRampToValueAtTime(4200, audioCtx.currentTime + dur)
    f.Q.value = 0.7
    const g = audioCtx.createGain()
    g.gain.value = 0.18
    src.connect(f).connect(g).connect(audioCtx.destination)
    src.start()
  } catch {
    /* sin audio */
  }
}

const RADIO = 3 // paginas dibujadas a cada lado de la actual

export default function Hojear({ pdf, sizes, pagina, onPagina, onTap, noche, sonido }) {
  const caja = useRef(null)
  const flipRef = useRef(null)
  const cb = useRef({})
  cb.current = { onPagina, onTap, sonido }
  const paginaRef = useRef(pagina)
  const alrededorRef = useRef(null)

  useEffect(() => {
    const cont = caja.current
    let flip
    let canvases = []
    const dibujadas = new Map() // num -> tarea
    let anchoPag = 0
    let vivo = true
    let recorte = { x: 0, y: 0, w: 1, h: 1 }

    // Detecta los margenes blancos del libro mirando varias paginas de texto,
    // para recortarlos y que la letra se vea mas grande en el movil.
    const detectarMargenes = async () => {
      const n = pdf.numPages
      const muestras = [
        paginaRef.current,
        paginaRef.current + 1,
        Math.round(n * 0.3),
        Math.round(n * 0.5),
        Math.round(n * 0.7),
      ].filter((p, i, a) => p > 3 && p <= n && a.indexOf(p) === i)
      if (!muestras.length) return
      let x1 = 1, y1 = 1, x2 = 0, y2 = 0
      for (const num of muestras) {
        const page = await pdf.getPage(num)
        const base = page.getViewport({ scale: 1 })
        const vp = page.getViewport({ scale: 200 / base.width })
        const c = document.createElement('canvas')
        c.width = Math.floor(vp.width)
        c.height = Math.floor(vp.height)
        const ctx = c.getContext('2d', { willReadFrequently: true })
        await page.render({ canvasContext: ctx, viewport: vp }).promise
        const { data, width, height } = ctx.getImageData(0, 0, c.width, c.height)
        let a = width, b = height, cc = 0, d = 0
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const k = (y * width + x) * 4
            if (data[k] + data[k + 1] + data[k + 2] < 690 && data[k + 3] > 0) {
              if (x < a) a = x
              if (x > cc) cc = x
              if (y < b) b = y
              if (y > d) d = y
            }
          }
        }
        if (cc <= a || d <= b) continue
        x1 = Math.min(x1, a / width)
        x2 = Math.max(x2, cc / width)
        y1 = Math.min(y1, b / height)
        y2 = Math.max(y2, d / height)
      }
      if (x2 <= x1 || y2 <= y1) return
      const px = 0.035
      const py = 0.03
      x1 = Math.max(0, x1 - px)
      y1 = Math.max(0, y1 - py)
      x2 = Math.min(1, x2 + px)
      y2 = Math.min(1, y2 + py)
      // solo si de verdad se gana espacio
      if (x2 - x1 < 0.95 || y2 - y1 < 0.95) recorte = { x: x1, y: y1, w: x2 - x1, h: y2 - y1 }
    }

    const dibujar = async (i) => {
      if (i < 0 || i >= canvases.length || dibujadas.has(i)) return
      dibujadas.set(i, null)
      try {
        const page = await pdf.getPage(i + 1)
        if (!vivo) return
        const base = page.getViewport({ scale: 1 })
        const dpr = Math.min(window.devicePixelRatio || 1, 2.5)
        const r = recorte
        const scale = (anchoPag / (base.width * r.w)) * dpr
        // se dibuja solo la zona con texto (sin los margenes blancos del PDF)
        const vp = page.getViewport({
          scale,
          offsetX: -r.x * base.width * scale,
          offsetY: -r.y * base.height * scale,
        })
        const off = document.createElement('canvas')
        off.width = Math.floor(base.width * r.w * scale)
        off.height = Math.floor(base.height * r.h * scale)
        const task = page.render({ canvasContext: off.getContext('2d'), viewport: vp })
        dibujadas.set(i, task)
        await task.promise
        if (!vivo || !dibujadas.has(i)) return
        const c = canvases[i]
        c.width = off.width
        c.height = off.height
        c.getContext('2d').drawImage(off, 0, 0)
      } catch (e) {
        dibujadas.delete(i)
        if (e?.name !== 'RenderingCancelledException') console.error(e)
      }
    }

    const alrededor = (idx) => {
      for (let d = 0; d <= RADIO; d++) {
        dibujar(idx + d)
        dibujar(idx - d)
      }
      // liberar memoria de las lejanas
      for (const [i, task] of dibujadas) {
        if (Math.abs(i - idx) > RADIO + 2) {
          task?.cancel?.()
          dibujadas.delete(i)
          canvases[i].width = 0
          canvases[i].height = 0
        }
      }
    }

    const montar = () => {
      flip?.destroy()
      dibujadas.clear()
      // pantalla ancha (tablet/ordenador): libro abierto a doble pagina
      // En movil (pantalla tactil o estrecha) SIEMPRE una sola pagina, aunque se gire
      const movil =
        window.matchMedia('(pointer: coarse)').matches || Math.min(innerWidth, innerHeight) < 600
      const dos = !movil && cont.clientWidth > cont.clientHeight * 1.1
      // en movil el libro ocupa practicamente toda la pantalla
      const W = (cont.clientWidth - (movil ? 6 : 24)) / (dos ? 2 : 1)
      const H = cont.clientHeight - (movil ? 10 : 36)
      const sw = sizes[0].w * recorte.w
      const sh = sizes[0].h * recorte.h
      let w = W
      let h = (w * sh) / sw
      if (h > H) {
        h = H
        w = (h * sw) / sh
      }
      anchoPag = Math.floor(w)
      const host = document.createElement('div')
      host.className = 'libro-host'
      // con el contenedor del ancho de una pagina, page-flip usa el modo de una sola hoja
      if (!dos) host.style.width = `${Math.floor(w)}px`
      cont.appendChild(host)
      const paginas = sizes.map((_, i) => {
        const p = document.createElement('div')
        p.className = 'hoja-pdf'
        const c = document.createElement('canvas')
        c.width = 0
        c.height = 0
        if (noche) c.className = 'oscuro'
        p.appendChild(c)
        host.appendChild(p)
        return c
      })
      canvases = paginas
      flip = new PageFlip(host, {
        width: Math.floor(w),
        height: Math.floor(h),
        size: 'fixed',
        usePortrait: true,
        showCover: false,
        drawShadow: true,
        maxShadowOpacity: 0.6,
        flippingTime: 750,
        mobileScrollSupport: false,
        disableFlipByClick: true,
        showPageCorners: true,
        swipeDistance: 20,
        startPage: Math.min(paginaRef.current, sizes.length) - 1,
      })
      flip.loadFromHTML(host.querySelectorAll('.hoja-pdf'))
      flip.on('flip', (e) => {
        const idx = e.data
        paginaRef.current = idx + 1
        alrededor(idx)
        cb.current.onPagina(idx + 1)
      })
      flip.on('changeState', (e) => {
        if (e.data === 'flipping' && cb.current.sonido) sonidoHoja()
        if (e.data === 'flipping') navigator.vibrate?.(8)
      })
      flipRef.current = flip
      alrededorRef.current = alrededor
      alrededor(paginaRef.current - 1)
    }

    let t
    const ro = new ResizeObserver(() => {
      clearTimeout(t)
      t = setTimeout(() => vivo && montar(), 250)
    })
    detectarMargenes()
      .catch((e) => console.warn('Sin recorte de margenes', e))
      .then(() => {
        if (!vivo) return
        montar()
        ro.observe(cont)
      })
    return () => {
      vivo = false
      clearTimeout(t)
      ro.disconnect()
      for (const task of dibujadas.values()) task?.cancel?.()
      flip?.destroy()
      flipRef.current = null
      cont.innerHTML = ''
    }
  }, [pdf, sizes, noche])

  // Saltos desde fuera (barra deslizante)
  useEffect(() => {
    if (pagina === paginaRef.current) return
    paginaRef.current = pagina
    flipRef.current?.turnToPage(pagina - 1)
    alrededorRef.current?.(pagina - 1)
  }, [pagina])

  // Teclado
  useEffect(() => {
    const k = (e) => {
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') flipRef.current?.flipNext()
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') flipRef.current?.flipPrev()
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [])

  // Toques: lados pasan pagina (con la hoja doblandose), centro muestra las barras
  const toque = useRef(null)
  return (
    <div
      ref={caja}
      className="hojear"
      onPointerDown={(e) => (toque.current = { x: e.clientX, y: e.clientY, t: Date.now() })}
      onPointerUp={(e) => {
        const a = toque.current
        toque.current = null
        if (!a || Date.now() - a.t > 350) return
        if (Math.hypot(e.clientX - a.x, e.clientY - a.y) > 10) return
        const r = caja.current.getBoundingClientRect()
        const x = (e.clientX - r.left) / r.width
        if (x > 0.72) flipRef.current?.flipNext('bottom')
        else if (x < 0.28) flipRef.current?.flipPrev('bottom')
        else cb.current.onTap?.()
      }}
    />
  )
}
