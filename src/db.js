import { openDB } from 'idb'

// Capa de almacenamiento local (IndexedDB).
// - libros: metadatos (titulo, paginas, portada, progreso...) -> ligero, para listar rapido
// - archivos: el PDF en si (Blob) -> pesado, solo se lee al abrir el libro
// Si mas adelante se pasa a Supabase, solo hay que reemplazar este archivo.

const DB_NAME = 'biblioteca'
const DB_VERSION = 1

let dbPromise
function db() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(d) {
        d.createObjectStore('libros', { keyPath: 'id' })
        d.createObjectStore('archivos')
      },
    })
  }
  return dbPromise
}

export async function listarLibros() {
  const libros = await (await db()).getAll('libros')
  return libros.sort((a, b) => (b.ultimaLectura ?? b.creado) - (a.ultimaLectura ?? a.creado))
}

export async function guardarLibro(meta, blob) {
  const d = await db()
  const tx = d.transaction(['libros', 'archivos'], 'readwrite')
  await tx.objectStore('libros').put(meta)
  await tx.objectStore('archivos').put(blob, meta.id)
  await tx.done
}

export async function obtenerLibro(id) {
  return (await db()).get('libros', id)
}

export async function obtenerArchivo(id) {
  return (await db()).get('archivos', id)
}

export async function actualizarLibro(id, cambios) {
  const d = await db()
  const actual = await d.get('libros', id)
  if (!actual) return
  await d.put('libros', { ...actual, ...cambios })
}

export async function borrarLibro(id) {
  const d = await db()
  const tx = d.transaction(['libros', 'archivos'], 'readwrite')
  await tx.objectStore('libros').delete(id)
  await tx.objectStore('archivos').delete(id)
  await tx.done
}

export async function pedirAlmacenamientoPersistente() {
  try {
    if (navigator.storage?.persist) await navigator.storage.persist()
  } catch {
    /* no pasa nada */
  }
}

export async function estimarEspacio() {
  try {
    const { usage, quota } = await navigator.storage.estimate()
    return { usage, quota }
  } catch {
    return null
  }
}
