# NVTS Photomania — Documento de diseño (GDD)

**Visión:** editor de imágenes por capas que corre en el navegador, rápido y sin instalar, de NamuVT Studios.

## MVP (estado actual)
- Lienzo con zoom de ajuste; múltiples capas raster con visibilidad, opacidad y modo de fusión.
- Pincel y borrador redondos, color y tamaño; filtro de brillo.
- Deshacer/Rehacer ilimitado (por memoria) para pintura y filtros.
- Guardar/abrir `.nvtsphoto`.
- Atajos: B, E, Ctrl+Z, Ctrl+Shift+Z / Ctrl+Y, Ctrl+S, Ctrl+Shift+S, Ctrl+O.

## Siguiente
| Hito | Contenido |
|---|---|
| 1 | Zoom/desplazamiento, selección rectangular, mover capa, importar PNG/JPEG |
| 2 | Grupos en la UI, máscaras de capa, deshacer de estructura |
| 3 | Texto, formas, ajustes (curvas/niveles), filtros en GPU |
| 4 | Exportar PNG/JPEG/WebP, historial visible, autosave en OPFS |

## Fuera del alcance por ahora
Edición RAW, 16/32 bits, perfiles ICC, colaboración en tiempo real, plugins.
