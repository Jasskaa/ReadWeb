import { useCallback, useEffect, useState } from 'react'
import Biblioteca from './Biblioteca'
import Lector from './Lector'
import { obtenerLibro } from './db'
import './index.css'

const CLAVE = 'libro-abierto'

export default function App() {
  const [abierto, setAbierto] = useState(null)
  const [listo, setListo] = useState(false)
  const [version, setVersion] = useState(0)

  // Si la app se cerro con un libro abierto, se vuelve directamente a el
  useEffect(() => {
    const id = localStorage.getItem(CLAVE)
    ;(async () => {
      if (id) {
        const l = await obtenerLibro(id).catch(() => null)
        if (l) setAbierto(l)
        else localStorage.removeItem(CLAVE)
      }
      setListo(true)
    })()
  }, [])

  const abrir = useCallback((l) => {
    localStorage.setItem(CLAVE, l.id)
    setAbierto(l)
  }, [])

  const salir = useCallback(() => {
    localStorage.removeItem(CLAVE)
    setAbierto(null)
    setVersion((v) => v + 1)
  }, [])

  if (!listo) return null
  return abierto ? (
    <Lector libro={abierto} onSalir={salir} />
  ) : (
    <Biblioteca key={version} onAbrir={abrir} />
  )
}
