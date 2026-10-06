// history.h — Undo/Redo basado en tiles (copy-on-write + intercambio de punteros).
//
// Idea clave: los píxeles ANTERIORES hay que capturarlos ANTES de modificar el tile, no después.
// Por eso el flujo es en dos fases:
//   beginAction(capa)  -> arma la captura: la 1ª vez que un tile va a ser escrito, se copia su estado previo.
//   ...ediciones...    -> writeRect / applyBrightness / touchRect avisan al historial automáticamente.
//   saveState(label)   -> sella la acción: guarda SOLO los tiles que realmente cambiaron.
//
// undo/redo no copian píxeles: intercambian el buffer del tile con el del snapshot. Así cada tile
// retiene un único buffer (el estado "al otro lado"), y redo es simplemente otro intercambio.
#pragma once
#include "compositor.h"
#include <deque>
#include <string>
#include <unordered_map>
#include <unordered_set>

namespace nvts {

// Estado de UN tile. nullptr = el tile era transparente / no existía.
struct TileSnapshot {
    uint32_t layerId = 0;
    int32_t  tx = 0, ty = 0;
    std::unique_ptr<uint8_t[]> pixels;
};

// Una acción deshacible. Contiene solo los tiles modificados, no la capa entera.
struct HistoryEntry {
    std::string label;                 // "Pincel", "Brillo"... (para el menú Editar)
    std::vector<TileSnapshot> tiles;
    size_t bytes = 0;                  // memoria retenida (TILE_BYTES por snapshot no nulo)
};

class HistoryManager : public TileWriteObserver {
public:
    // maxMegabytes: tope de memoria del historial; al superarlo se descartan las acciones más antiguas.
    // OJO: debe destruirse ANTES que el Compositor al que apunta.
    HistoryManager(Compositor& comp, uint32_t maxMegabytes);
    ~HistoryManager();

    // ── Captura ──
    bool beginAction(uint32_t layerId);      // abre una acción vigilando esa capa. false si ya hay una abierta
    bool watchLayer(uint32_t layerId);       // vigila una capa extra dentro de la misma acción
    // Sella la acción (equivale a "guardar estado"). Devuelve cuántos tiles se guardaron;
    // 0 = nada cambió y no se crea paso de undo. Una acción nueva invalida el redo.
    uint32_t saveState(const std::string& label);
    void cancelAction();                     // aborta y revierte lo editado desde beginAction()

    // ── Navegación (marcan los tiles como sucios: luego composite() + flush) ──
    bool undo();
    bool redo();
    bool canUndo() const { return !active_ && !undo_.empty(); }
    bool canRedo() const { return !active_ && !redo_.empty(); }
    uint32_t undoCount() const { return static_cast<uint32_t>(undo_.size()); }
    uint32_t redoCount() const { return static_cast<uint32_t>(redo_.size()); }
    uint32_t memoryBytes() const { return static_cast<uint32_t>(bytes_); }
    std::string undoLabel() const { return undo_.empty() ? std::string() : undo_.back().label; }
    std::string redoLabel() const { return redo_.empty() ? std::string() : redo_.back().label; }
    void clear();                            // vacía el historial (p. ej. al abrir otro documento)

    // TileWriteObserver: lo invoca TiledLayer justo antes de mutar un tile.
    void onBeforeTileWrite(TiledLayer& layer, int32_t tx, int32_t ty, const Tile* existing) override;

private:
    struct Watched { uint32_t id; std::unordered_set<uint64_t> seen; };  // `seen`: tiles ya capturados

    bool step(std::deque<HistoryEntry>& from, std::deque<HistoryEntry>& to);
    void swapIn(HistoryEntry& e);            // intercambia píxeles snapshot <-> capas
    void endAction();                        // desengancha observadores y limpia el estado abierto
    void trim();                             // respeta el tope de memoria

    Compositor& comp_;
    size_t maxBytes_;
    size_t bytes_ = 0;                       // memoria total (undo + redo)
    bool active_ = false;
    std::vector<TileSnapshot> open_;                          // capturas de la acción en curso
    std::unordered_map<TiledLayer*, Watched> watched_;
    std::deque<HistoryEntry> undo_, redo_;
};

} // namespace nvts
