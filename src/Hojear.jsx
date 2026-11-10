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

    const dibujar = async (i) => {
      if (i < 0 || i >= canvases.length || dibujadas.has(i)) return
      dibujadas.set(i, null)
      try {
        const page = await pdf.getPage(i + 1)
        if (!vivo) return
        const base = page.getViewport({ scale: 1 })
        const dpr = Math.min(window.devicePixelRatio || 1, 2.5)
        const vp = page.getViewport({ scale: (anchoPag / base.width) * dpr })
        const off = document.createElement('canvas')
        off.width = Math.floor(vp.width)
        off.height = Math.floor(vp.height)
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
      const W = (cont.clientWidth - 24) / (dos ? 2 : 1)
      const H = cont.clientHeight - 36
      const s = sizes[0]
      let w = W
      let h = (w * s.h) / s.w
      if (h > H) {
        h = H
        w = (h * s.w) / s.h
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

    montar()
    let t
    const ro = new ResizeObserver(() => {
      clearTimeout(t)
      t = setTimeout(montar, 250)
    })
    ro.observe(cont)
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
