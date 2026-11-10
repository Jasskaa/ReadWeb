# Mi Biblioteca – Resumen de lo que se ha hecho

App web instalable (PWA) para leer libros en PDF. Pensada para tener muchos libros y PDFs largos (350+ páginas, o más).

## Tecnología
- **React 19 + Vite**: interfaz.
- **pdfjs-dist (pdf.js v6)**: lectura y dibujado de los PDF.
- **idb (IndexedDB)**: guardado local de los libros y del progreso.
- **vite-plugin-pwa**: la hace instalable y funciona sin conexión.

## Cómo ejecutarla
```bash
npm install
npm run dev        # desarrollo
npm run build      # versión de producción (carpeta dist)
npm run preview    # probar la versión de producción
```

## Estructura
| Archivo | Qué hace |
|---|---|
| `src/App.jsx` | Cambia entre la biblioteca y el lector. |
| `src/Biblioteca.jsx` | Pantalla con las portadas: añadir PDFs (botón o arrastrando), buscar, borrar, progreso por libro, espacio usado. |
| `src/Lector.jsx` | Lector de PDF: zoom, modo oscuro, ir a página, barra de posición, teclado, guardado del progreso. |
| `src/pdf.js` | Funciones de pdf.js: abrir el PDF, tamaño de páginas, portada, título y autor, cerrar el documento. |
| `src/db.js` | Almacenamiento en IndexedDB (metadatos, archivos PDF, progreso). |
| `src/index.css` | Estilos (tema oscuro). |
| `vite.config.js` | Configuración de Vite y de la PWA (manifest, caché del worker de pdf.js). |
| `public/icon.svg` | Icono de la app. |

## Funcionalidades
**Biblioteca**
- Añadir uno o varios PDF a la vez, con el botón «Añadir libro» o arrastrándolos.
- La portada se genera sola desde la primera página; el título y el autor salen de los metadatos del PDF (o del nombre del archivo).
- Barra de progreso en cada libro y porcentaje leído.
- Buscador por título/autor (aparece cuando hay más de 3 libros).
- Borrar libros (con confirmación) y aviso del espacio usado.
- Pide almacenamiento persistente al navegador para que no borre los libros.

**Lector**
- Los libros largos van fluidos: solo se dibujan las páginas cercanas a la pantalla y se liberan las demás (en la prueba, 4–7 canvas a la vez de 450 páginas).
- Se calculan los tamaños reales de todas las páginas al abrir, para que el scroll y los saltos sean exactos.
- Zoom (−, +, ajustar al ancho), recordado entre sesiones.
- Modo oscuro, recordado entre sesiones.
- Ir a una página escribiendo el número, y barra deslizante para moverse por todo el libro.
- Teclado: ← / → o RePág / AvPág cambian de página, Esc vuelve a la biblioteca.
- Toque en la página para ocultar/mostrar las barras.
- El progreso se guarda solo: al reabrir, el libro vuelve a la última página leída.

## Pruebas realizadas
Con un PDF de 450 páginas generado para la prueba, en Chrome (pantalla de móvil):
- Se añade, genera portada y muestra título y número de páginas.
- Abre el lector con solo unas pocas páginas dibujadas.
- Salto a la página 300 correcto, con el scroll en su sitio.
- El progreso (67 %) se guarda y, al reabrir, vuelve a la página 300.
- Sin errores en consola. Build de producción correcto.

## Problemas encontrados y corregidos
1. **`destroy is not a function`**: en pdf.js v6 el documento ya no tiene `destroy()`; ahora se cierra con `pdf.loadingTask.destroy()` (función `cerrarPdf`).
2. **Se dibujaban todas las páginas a la vez**: el contenedor de scroll crecía hasta el tamaño del libro entero. Se arregló con `min-height: 0` en `.scroll`.
3. **Canvas con tamaño por defecto**: ahora empiezan en 0×0 y solo ocupan memoria las páginas visibles.

## Limitaciones actuales
- Los libros se guardan **solo en el dispositivo** donde se suben (IndexedDB). En otro dispositivo hay que volver a subirlos.
- No hay todavía buscador de texto dentro del libro, marcadores ni subrayados.
- Solo PDF (no EPUB).

## Próximos pasos posibles
1. Publicar en Vercel para abrirla desde el móvil.
2. Guardar libros y progreso en Supabase (Storage + tabla `libros`) para tenerlos en todos los dispositivos, con login si se comparte.
3. Buscador de texto dentro del libro y capa de texto seleccionable.
4. Marcadores y notas.
5. Soporte de EPUB.
6. Colecciones/etiquetas para organizar muchos libros.
