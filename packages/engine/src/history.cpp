// history.cpp — Implementación del historial por tiles + bindings embind.

#include "history.h"
#include <emscripten/bind.h>
#include <algorithm>
#include <cstring>

using namespace emscripten;

namespace nvts {

namespace {

uint64_t tileKey(int32_t tx, int32_t ty) {
    return (static_cast<uint64_t>(static_cast<uint32_t>(ty)) << 32) | static_cast<uint32_t>(tx);
}

size_t countBytes(const HistoryEntry& e) {
    size_t n = 0;
    for (const auto& s : e.tiles) if (s.pixels) n += TILE_BYTES;
    return n;
}

// ¿El tile actual es idéntico al snapshot? (acciones sin efecto no deben ocupar memoria)
bool sameAsCurrent(const TileSnapshot& s, const TiledLayer& layer) {
    const Tile* t = layer.findTile(s.tx, s.ty);
    if (!s.pixels) {                                   // antes era transparente
        if (!t) return true;
        const uint8_t* p = t->pixels.get();
        for (uint32_t i = 0; i < TILE_BYTES; ++i) if (p[i]) return false;
        return true;
    }
    return t && std::memcmp(s.pixels.get(), t->pixels.get(), TILE_BYTES) == 0;
}

} // namespace

HistoryManager::HistoryManager(Compositor& comp, uint32_t maxMegabytes)
    : comp_(comp), maxBytes_(static_cast<size_t>(maxMegabytes) << 20) {}

HistoryManager::~HistoryManager() { if (active_) endAction(); }

// ── Captura (copy-on-write) ───────────────────────────────────────────────

bool HistoryManager::beginAction(uint32_t layerId) {
    if (active_ || !comp_.layer(layerId)) return false;
    active_ = true;
    return watchLayer(layerId);
}

bool HistoryManager::watchLayer(uint32_t layerId) {
    if (!active_) return false;
    TiledLayer* layer = comp_.layer(layerId);
    if (!layer) return false;
    if (watched_.count(layer)) return true;
    layer->setObserver(this);                          // a partir de aquí, cada escritura nos avisa
    watched_[layer] = Watched{layerId, {}};
    return true;
}

void HistoryManager::onBeforeTileWrite(TiledLayer& layer, int32_t tx, int32_t ty, const Tile* existing) {
    auto it = watched_.find(&layer);
    if (it == watched_.end()) return;
    if (!it->second.seen.insert(tileKey(tx, ty)).second) return;   // ya capturado: solo la 1ª vez

    TileSnapshot s;
    s.layerId = it->second.id;
    s.tx = tx; s.ty = ty;
    if (existing) {                                    // copia del estado ANTERIOR (256 KiB)
        s.pixels.reset(new uint8_t[TILE_BYTES]);
        std::memcpy(s.pixels.get(), existing->pixels.get(), TILE_BYTES);
    }                                                  // si no existía: pixels = nullptr (transparente)
    open_.push_back(std::move(s));
}

void HistoryManager::endAction() {
    for (auto& [layer, w] : watched_) layer->setObserver(nullptr);
    watched_.clear();
    open_.clear();
    active_ = false;
}

uint32_t HistoryManager::saveState(const std::string& label) {
    if (!active_) return 0;

    HistoryEntry e;
    e.label = label;
    for (auto& s : open_) {                            // conserva solo los tiles que de verdad cambiaron
        TiledLayer* l = comp_.layer(s.layerId);
        if (l && !sameAsCurrent(s, *l)) e.tiles.push_back(std::move(s));
    }
    endAction();
    if (e.tiles.empty()) return 0;                     // sin cambios: no se crea paso de undo

    for (auto& r : redo_) bytes_ -= r.bytes;           // una acción nueva descarta el "futuro"
    redo_.clear();

    e.bytes = countBytes(e);
    bytes_ += e.bytes;
    const uint32_t n = static_cast<uint32_t>(e.tiles.size());
    undo_.push_back(std::move(e));
    trim();
    return n;
}

void HistoryManager::cancelAction() {
    if (!active_) return;
    HistoryEntry e;
    for (auto& s : open_) e.tiles.push_back(std::move(s));
    endAction();                                       // primero se desengancha el observador
    swapIn(e);                                         // restaura los píxeles anteriores
}

// ── Undo / Redo ───────────────────────────────────────────────────────────

// Aplica un snapshot a las capas intercambiando buffers (sin copiar píxeles).
void HistoryManager::swapIn(HistoryEntry& e) {
    for (auto& s : e.tiles) {
        if (TiledLayer* l = comp_.layer(s.layerId))    // si la capa ya no existe, se ignora
            l->swapTilePixels(s.tx, s.ty, s.pixels);   // el snapshot queda con el estado reemplazado
    }
}

bool HistoryManager::step(std::deque<HistoryEntry>& from, std::deque<HistoryEntry>& to) {
    if (active_ || from.empty()) return false;         // no se puede deshacer con una acción abierta
    HistoryEntry e = std::move(from.back());
    from.pop_back();
    bytes_ -= e.bytes;
    swapIn(e);
    e.bytes = countBytes(e);                           // puede variar (nulo <-> con píxeles)
    bytes_ += e.bytes;
    to.push_back(std::move(e));
    return true;
}

bool HistoryManager::undo() { return step(undo_, redo_); }
bool HistoryManager::redo() { return step(redo_, undo_); }

void HistoryManager::trim() {
    // Descarta lo más antiguo, pero siempre conserva al menos la última acción.
    while (bytes_ > maxBytes_ && undo_.size() > 1) {
        bytes_ -= undo_.front().bytes;
        undo_.pop_front();
    }
}

void HistoryManager::clear() {
    if (active_) endAction();
    undo_.clear();
    redo_.clear();
    bytes_ = 0;
}

} // namespace nvts

// ── Bindings ──────────────────────────────────────────────────────────────
EMSCRIPTEN_BINDINGS(nvts_history) {
    class_<nvts::HistoryManager>("HistoryManager")
        .constructor<nvts::Compositor&, uint32_t>()
        .function("beginAction",  &nvts::HistoryManager::beginAction)
        .function("watchLayer",   &nvts::HistoryManager::watchLayer)
        .function("saveState",    &nvts::HistoryManager::saveState)
        .function("cancelAction", &nvts::HistoryManager::cancelAction)
        .function("undo",         &nvts::HistoryManager::undo)
        .function("redo",         &nvts::HistoryManager::redo)
        .function("canUndo",      &nvts::HistoryManager::canUndo)
        .function("canRedo",      &nvts::HistoryManager::canRedo)
        .function("undoCount",    &nvts::HistoryManager::undoCount)
        .function("redoCount",    &nvts::HistoryManager::redoCount)
        .function("memoryBytes",  &nvts::HistoryManager::memoryBytes)
        .function("undoLabel",    &nvts::HistoryManager::undoLabel)
        .function("redoLabel",    &nvts::HistoryManager::redoLabel)
        .function("clear",        &nvts::HistoryManager::clear);
}
