# NVTS Photomania — Game/Product Design Document (GDD)

**Vision:** a layer-based image editor that runs in the browser, fast and with no installation, by NamuVT Studios.

## MVP (current state)
- Canvas with fit-to-window zoom; multiple raster layers with visibility, opacity and blend mode.
- Round brush and eraser, with color and size; brightness filter.
- Unlimited Undo/Redo (bounded by memory) for painting and filters.
- Save/open `.nvtsphoto`.
- Shortcuts: B, E, Ctrl+Z, Ctrl+Shift+Z / Ctrl+Y, Ctrl+S, Ctrl+Shift+S, Ctrl+O.

## Next
| Milestone | Content |
|---|---|
| 1 | Zoom/pan, rectangular selection, move layer, import PNG/JPEG |
| 2 | Groups in the UI, layer masks, structure undo |
| 3 | Text, shapes, adjustments (curves/levels), GPU filters |
| 4 | Export PNG/JPEG/WebP, visible history, autosave in OPFS |

## Out of scope for now
RAW editing, 16/32-bit depth, ICC profiles, real-time collaboration, plugins.
