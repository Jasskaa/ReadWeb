import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { actualizarLibro, obtenerArchivo } from './db'
import { abrirPdf, cerrarPdf, tamanosPaginas } from './pdf'

const GAP = 10
const PAD_TOP = 12
const OCULTAR_MS = 3500

// Lee el marcapaginas: localStorage se escribe en cada scroll (sobrevive a cierres bruscos)
function leerMarca(libro) {
  try {
    const p = JSON.parse(localStorage.getItem(`pos-${libro.id}`))
    if (p && p.pagina) return p
  } catch {
    /* */
  }
  return { pagina: libro.ultimaPagina || 1, fraccion: libro.ultimaFraccion || 0 }
}

function Pagina({ pdf, num, ancho, alto, top, left, root, oscuro }) {
  const wrapRef = useRef(null)
  const canvasRef = useRef(null)
  const [visible, setVisible] = useState(false)

  // Solo se dibujan las paginas cercanas a la pantalla.
  useEffect(() => {
    const el = wrapRef.current
    if (!el || !root) return
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), {
      root,
      rootMargin: '150% 0px',
    })
    io.observe(el)
    return () => io.disconnect()
  }, [root])

  useEffect(() => {
    if (!visible) return
    let task
    let cancelado = false
    ;(async () => {
      const page = await pdf.getPage(num)
      if (cancelado) return
      const base = page.getViewport({ scale: 1 })
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5)
      let scale = (ancho / base.width) * dpr
      const maxPx = 16_000_000
      if (base.width * base.height * scale * scale > maxPx) {
        scale = Math.sqrt(maxPx / (base.width * base.height))
      }
      const vp = page.getViewport({ scale })
      const canvas = canvasRef.current
      if (!canvas) return
      canvas.width = Math.floor(vp.width)
      canvas.height = Math.floor(vp.height)
      task = page.render({ canvasContext: canvas.getContext('2d'), viewport: vp })
      await task.promise
    })().catch((e) => {
      if (e?.name !== 'RenderingCancelledException') console.error('Pagina', num, e)
    })
    return () => {
      cancelado = true
      task?.cancel()
      const c = canvasRef.current
      if (c) {
        c.width = 0
        c.height = 0
      }
    }
  }, [visible, pdf, num, ancho])

  return (
    <div ref={wrapRef} className="pagina" style={{ top, left, width: ancho, height: alto }}>
      <canvas
        ref={canvasRef}
        width={0}
        height={0}
        className={oscuro ? 'oscuro' : ''}
        style={{ width: ancho, height: alto }}
      />
    </div>
  )
}

export default function Lector({ libro, onSalir }) {
  const [pdf, setPdf] = useState(null)
  const [sizes, setSizes] = useState(null)
  const [progresoCarga, setProgresoCarga] = useState(0)
  const [error, setError] = useState(null)
  const posRef = useRef(leerMarca(libro))
  const [pagina, setPagina] = useState(posRef.current.pagina)
  const [zoom, setZoom] = useState(() => Number(localStorage.getItem('lector-zoom')) || 1)
  const [oscuro, setOscuro] = useState(() => localStorage.getItem('lector-noche') === '1')
  const [anchoCont, setAnchoCont] = useState(0)
  const [root, setRoot] = useState(null)
  const [barras, setBarras] = useState(false) // sin distracciones: ocultas por defecto
  const [guardado, setGuardado] = useState(false)

  const restaurado = useRef(false)
  const timerBarras = useRef(null)

  // Cargar el PDF
  useEffect(() => {
    let vivo = true
    let doc
    ;(async () => {
      try {
        const blob = await obtenerArchivo(libro.id)
        if (!blob) throw new Error('No se encuentra el archivo del libro')
        doc = await abrirPdf(blob)
        const s = await tamanosPaginas(doc, (p) => vivo && setProgresoCarga(p))
        if (!vivo) return
        setPdf(doc)
        setSizes(s)
      } catch (e) {
        console.error(e)
        if (vivo) setError(e.message || 'No se pudo abrir el libro')
      }
    })()
    return () => {
      vivo = false
      cerrarPdf(doc)
    }
  }, [libro.id])

  useEffect(() => {
    if (!root) return
    const ro = new ResizeObserver(() => setAnchoCont(root.clientWidth))
    ro.observe(root)
    setAnchoCont(root.clientWidth)
    return () => ro.disconnect()
  }, [root])

  const anchoBase = Math.max(200, Math.min(anchoCont - 12, 900))
  const ancho = Math.round(anchoBase * zoom)

  // Posiciones de todas las paginas (se conocen de antemano)
  const layout = useMemo(() => {
    if (!sizes || !anchoCont) return null
    const tops = []
    const altos = []
    let y = PAD_TOP
    for (const s of sizes) {
      const h = Math.round((ancho * s.h) / s.w)
      tops.push(y)
      altos.push(h)
      y += h + GAP
    }
    return { tops, altos, total: y + 40 }
  }, [sizes, ancho, anchoCont])

  const posicionActual = useCallback(() => {
    if (!layout || !root) return null
    const y = root.scrollTop + 1
    const { tops, altos } = layout
    let lo = 0
    let hi = tops.length - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (tops[mid] <= y) lo = mid
      else hi = mid - 1
    }
    const fraccion = Math.min(1, Math.max(0, (root.scrollTop - tops[lo]) / (altos[lo] + GAP)))
    return { pagina: lo + 1, fraccion }
  }, [layout, root])

  const irA = useCallback(
    (num, fraccion = 0, suave = false) => {
      if (!layout || !root) return
      const i = Math.min(Math.max(1, Math.round(num)), layout.tops.length) - 1
      const top = layout.tops[i] + fraccion * (layout.altos[i] + GAP)
      root.scrollTo({ top, behavior: suave ? 'smooth' : 'auto' })
      posRef.current = { pagina: i + 1, fraccion }
      setPagina(i + 1)
    },
    [layout, root],
  )

  // Restaurar el punto exacto donde se dejo / mantenerlo al cambiar zoom
  const anchoPrevio = useRef(null)
  useLayoutEffect(() => {
    if (!layout || !root) return
    if (restaurado.current && anchoPrevio.current === ancho) return
    anchoPrevio.current = ancho
    irA(posRef.current.pagina, posRef.current.fraccion)
    restaurado.current = true
  }, [layout, root, ancho, irA])

  useEffect(() => localStorage.setItem('lector-zoom', String(zoom)), [zoom])
  useEffect(() => localStorage.setItem('lector-noche', oscuro ? '1' : '0'), [oscuro])

  // Guardar el marcapaginas
  const guardar = useCallback(() => {
    if (!restaurado.current || !pdf) return
    const p = posRef.current
    try {
      localStorage.setItem(`pos-${libro.id}`, JSON.stringify(p))
    } catch {
      /* */
    }
    actualizarLibro(libro.id, {
      ultimaPagina: p.pagina,
      ultimaFraccion: p.fraccion,
      paginas: pdf.numPages,
      ultimaLectura: Date.now(),
    })
  }, [libro.id, pdf])

  useEffect(() => {
    if (!root) return
    let t
    const onScroll = () => {
      if (!restaurado.current) return
      const p = posicionActual()
      if (!p) return
      posRef.current = p
      setPagina(p.pagina)
      try {
        localStorage.setItem(`pos-${libro.id}`, JSON.stringify(p))
      } catch {
        /* */
      }
      clearTimeout(t)
      t = setTimeout(guardar, 500)
    }
    root.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      clearTimeout(t)
      root.removeEventListener('scroll', onScroll)
    }
  }, [root, posicionActual, guardar, libro.id])

  // Si la app se cierra, se minimiza o se cambia de app: guardar ya
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') guardar()
    }
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', guardar)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', guardar)
      guardar()
    }
  }, [guardar])

  // Mantener la pantalla encendida mientras se lee
  useEffect(() => {
    let lock
    const pedir = async () => {
      try {
        if (document.visibilityState === 'visible') lock = await navigator.wakeLock?.request('screen')
      } catch {
        /* no soportado */
      }
    }
    pedir()
    document.addEventListener('visibilitychange', pedir)
    return () => {
      document.removeEventListener('visibilitychange', pedir)
      lock?.release?.()
    }
  }, [])

  // Barras: aparecen al tocar y se esconden solas
  const mostrarBarras = useCallback((v) => {
    clearTimeout(timerBarras.current)
    setBarras(v)
    if (v) timerBarras.current = setTimeout(() => setBarras(false), OCULTAR_MS)
  }, [])
  const mantener = () => mostrarBarras(true)
  useEffect(() => () => clearTimeout(timerBarras.current), [])

  const marcar = () => {
    guardar()
    setGuardado(true)
    setTimeout(() => setGuardado(false), 1400)
    mantener()
  }

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowRight' || e.key === 'PageDown') irA(posRef.current.pagina + 1, 0, true)
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') irA(posRef.current.pagina - 1, 0, true)
      else if (e.key === 'Escape') onSalir()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [irA, onSalir])

  const cambiarZoom = (d) => {
    setZoom((z) => Math.min(3, Math.max(0.6, +(z + d).toFixed(2))))
    mantener()
  }
  const total = pdf?.numPages ?? libro.paginas ?? 0
  const pct = total ? Math.round((pagina / total) * 100) : 0

  if (error) {
    return (
      <div className="lector-estado">
        <p>{error}</p>
        <button className="neu-btn" onClick={onSalir}>Volver</button>
      </div>
    )
  }

  return (
    <div className="lector">
      <header className={`barra ${barras ? '' : 'oculta'}`} onPointerDown={mantener}>
        <button className="neu-btn redondo" onClick={onSalir} aria-label="Volver a la biblioteca">‹</button>
        <div className="titulo-lector">{libro.titulo}</div>
        <button
          className="neu-btn redondo"
          onClick={() => { setOscuro((o) => !o); mantener() }}
          aria-label="Atenuar página (modo noche)"
        >
          {oscuro ? '☀' : '☾'}
        </button>
      </header>

      <div className="scroll" ref={setRoot} onClick={() => mostrarBarras(!barras)}>
        {!layout ? (
          <div className="lector-estado">
            <div className="neu-anillo" />
            <p>Abriendo libro… {Math.round(progresoCarga * 100)}%</p>
          </div>
        ) : (
          <div className="lista" style={{ height: layout.total, width: Math.max(ancho + 12, anchoCont) }}>
            {sizes.map((_, i) => (
              <Pagina
                key={i}
                pdf={pdf}
                num={i + 1}
                ancho={ancho}
                alto={layout.altos[i]}
                top={layout.tops[i]}
                left={Math.floor((Math.max(ancho + 12, anchoCont) - ancho) / 2)}
                root={root}
                oscuro={oscuro}
              />
            ))}
          </div>
        )}
      </div>

      {/* Unica pista mientras se lee: una linea finisima de progreso */}
      <div className={`hilo ${barras ? 'oculta' : ''}`}>
        <div style={{ width: `${pct}%` }} />
      </div>

      {pdf && (
        <footer className={`pie ${barras ? '' : 'oculta'}`} onPointerDown={mantener}>
          <div className="pie-fila">
            <button className="neu-btn redondo" onClick={() => cambiarZoom(-0.15)} aria-label="Reducir">−</button>
            <button className={`neu-btn marca ${guardado ? 'activo' : ''}`} onClick={marcar}>
              {guardado ? '✓ Marcapáginas guardado' : `Pág. ${pagina} / ${total} · ${pct}%`}
            </button>
            <button className="neu-btn redondo" onClick={() => cambiarZoom(0.15)} aria-label="Ampliar">+</button>
          </div>
          <input
            className="neu-range"
            type="range"
            min={1}
            max={total}
            value={pagina}
            onChange={(e) => { irA(Number(e.target.value)); mantener() }}
            aria-label="Posición en el libro"
          />
        </footer>
      )}
    </div>
  )
}
