import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  borrarLibro,
  estimarEspacio,
  guardarLibro,
  listarLibros,
  pedirAlmacenamientoPersistente,
} from './db'
import { abrirPdf, autor, cerrarPdf, generarPortada, titulo } from './pdf'

function Portada({ blob, titulo }) {
  const [url, setUrl] = useState(null)
  useEffect(() => {
    if (!blob) return
    const u = URL.createObjectURL(blob)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [blob])
  if (!url) return <div className="portada vacia">{titulo.slice(0, 1).toUpperCase()}</div>
  return <img className="portada" src={url} alt={`Portada de ${titulo}`} loading="lazy" />
}

function formatoMB(bytes) {
  if (bytes > 1024 ** 3) return (bytes / 1024 ** 3).toFixed(1) + ' GB'
  return Math.round(bytes / 1024 ** 2) + ' MB'
}

function progreso(l) {
  return l.paginas && l.ultimaLectura ? Math.round(((l.ultimaPagina || 1) / l.paginas) * 100) : 0
}

export default function Biblioteca({ onAbrir }) {
  const [libros, setLibros] = useState([])
  const [cargando, setCargando] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [trabajando, setTrabajando] = useState([])
  const [errores, setErrores] = useState([])
  const [espacio, setEspacio] = useState(null)
  const inputRef = useRef(null)

  const refrescar = useCallback(async () => {
    setLibros(await listarLibros())
    setEspacio(await estimarEspacio())
    setCargando(false)
  }, [])

  useEffect(() => {
    refrescar()
    pedirAlmacenamientoPersistente()
  }, [refrescar])

  const anadir = useCallback(
    async (archivos) => {
      const pdfs = [...archivos].filter(
        (f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name),
      )
      const rechazados = [...archivos].filter((f) => !pdfs.includes(f))
      if (rechazados.length) {
        setErrores((e) => [...e, ...rechazados.map((f) => `${f.name}: no es un PDF`)])
      }
      for (const file of pdfs) {
        setTrabajando((t) => [...t, file.name])
        try {
          const pdf = await abrirPdf(file)
          const [t, a, portada] = await Promise.all([
            titulo(pdf, file.name),
            autor(pdf),
            generarPortada(pdf),
          ])
          const meta = {
            id: crypto.randomUUID(),
            titulo: t,
            autor: a,
            archivo: file.name,
            tamano: file.size,
            paginas: pdf.numPages,
            portada,
            ultimaPagina: 1,
            ultimaFraccion: 0,
            creado: Date.now(),
            ultimaLectura: null,
          }
          cerrarPdf(pdf)
          await guardarLibro(meta, file)
          await refrescar()
        } catch (e) {
          console.error(e)
          const lleno = e?.name === 'QuotaExceededError'
          setErrores((er) => [
            ...er,
            lleno
              ? `${file.name}: no queda espacio en el dispositivo`
              : `${file.name}: no se pudo leer (¿está protegido o dañado?)`,
          ])
        } finally {
          setTrabajando((t) => t.filter((n) => n !== file.name))
        }
      }
    },
    [refrescar],
  )

  const quitar = async (libro) => {
    if (!window.confirm(`¿Borrar "${libro.titulo}" de la biblioteca?`)) return
    await borrarLibro(libro.id)
    try {
      localStorage.removeItem(`pos-${libro.id}`)
    } catch {
      /* */
    }
    await refrescar()
  }

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    if (!q) return libros
    return libros.filter((l) => `${l.titulo} ${l.autor}`.toLowerCase().includes(q))
  }, [libros, busqueda])

  const continuar = libros.find((l) => l.ultimaLectura)

  return (
    <div className="biblioteca">
      <header className="cabecera">
        <div>
          <p className="saludo">Tu estantería</p>
          <h1>Mi Biblioteca</h1>
        </div>
        <button
          className="neu-btn redondo grande acento"
          onClick={() => inputRef.current?.click()}
          aria-label="Añadir libro"
        >
          +
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          multiple
          hidden
          onChange={(e) => {
            anadir(e.target.files)
            e.target.value = ''
          }}
        />
      </header>

      {libros.length > 3 && (
        <input
          className="neu-input buscar"
          type="search"
          placeholder="Buscar libro…"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
      )}

      {errores.length > 0 && (
        <div className="aviso error" role="alert">
          {errores.map((e, i) => (
            <p key={i}>{e}</p>
          ))}
          <button className="neu-btn pequeno" onClick={() => setErrores([])}>Cerrar</button>
        </div>
      )}

      {trabajando.length > 0 && (
        <div className="aviso">
          {trabajando.map((n) => (
            <p key={n}>Añadiendo «{n}»…</p>
          ))}
        </div>
      )}

      {continuar && !busqueda && (
        <button className="continuar" onClick={() => onAbrir(continuar)}>
          <div className="mini">
            <Portada blob={continuar.portada} titulo={continuar.titulo} />
          </div>
          <div className="continuar-info">
            <span className="etiqueta">Seguir leyendo</span>
            <strong>{continuar.titulo}</strong>
            <span className="meta">
              Pág. {continuar.ultimaPagina} de {continuar.paginas}
            </span>
            <div className="neu-barra">
              <div style={{ width: `${progreso(continuar)}%` }} />
            </div>
          </div>
        </button>
      )}

      {cargando ? (
        <p className="vacio">Cargando…</p>
      ) : libros.length === 0 && trabajando.length === 0 ? (
        <div className="vacio">
          <div className="vacio-icono">📖</div>
          <p>Todavía no tienes libros.</p>
          <p>Pulsa «+» para añadir un PDF.</p>
        </div>
      ) : (
        <div className="rejilla">
          {filtrados.map((l) => {
            const pct = progreso(l)
            return (
              <article key={l.id} className="libro">
                <button className="tapa" onClick={() => onAbrir(l)} aria-label={`Abrir ${l.titulo}`}>
                  <Portada blob={l.portada} titulo={l.titulo} />
                </button>
                <h2>{l.titulo}</h2>
                <div className="neu-barra fina">
                  <div style={{ width: `${pct}%` }} />
                </div>
                <div className="libro-pie">
                  <span className="meta">{l.ultimaLectura ? `${pct}%` : `${l.paginas} págs.`}</span>
                  <button className="borrar" onClick={() => quitar(l)} aria-label="Borrar libro">
                    ✕
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      )}

      {espacio && libros.length > 0 && (
        <footer className="espacio">Usado en este dispositivo: {formatoMB(espacio.usage)}</footer>
      )}
    </div>
  )
}
