// history.cpp — Tile-based undo/redo and embind bindings.

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

size_t countBytes(const HistoryEntry& entry) {
    size_t bytes = 0;
    for (const auto& snapshot : entry.tiles) bytes += snapshot.pixels ? TILE_BYTES : 0;
    return bytes;
}

bool allBytesZero(const uint8_t* pixels) {
    bool zero = true;
    for (uint32_t i = 0; i < TILE_BYTES; ++i) zero = zero && pixels[i] == 0;
    return zero;
}

bool sameAsCurrent(const TileSnapshot& snapshot, const TiledLayer& layer) {
    const Tile* tile = layer.findTile(snapshot.tx, snapshot.ty);
    if (snapshot.pixels) {
        return tile && std::memcmp(snapshot.pixels.get(), tile->pixels.get(), TILE_BYTES) == 0;
    }
    return !tile || allBytesZero(tile->pixels.get());
}

} // namespace

HistoryManager::HistoryManager(Compositor& comp, uint32_t maxMegabytes)
    : comp_(comp), maxBytes_(static_cast<size_t>(maxMegabytes) << 20) {}

HistoryManager::~HistoryManager() {
    if (active_) endAction();
}

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
    layer->setObserver(this);
    watched_[layer] = Watched{layerId, {}};
    return true;
}

void HistoryManager::onBeforeTileWrite(TiledLayer& layer, int32_t tx, int32_t ty, const Tile* existing) {
    auto it = watched_.find(&layer);
    if (it == watched_.end()) return;
    if (!it->second.seen.insert(tileKey(tx, ty)).second) return;

    TileSnapshot snapshot;
    snapshot.layerId = it->second.id;
    snapshot.tx = tx;
    snapshot.ty = ty;
    if (existing) {
        snapshot.pixels.reset(new uint8_t[TILE_BYTES]);
        std::memcpy(snapshot.pixels.get(), existing->pixels.get(), TILE_BYTES);
    }
    open_.push_back(std::move(snapshot));
}

void HistoryManager::endAction() {
    for (auto& entry : watched_) entry.first->setObserver(nullptr);
    watched_.clear();
    open_.clear();
    active_ = false;
}

void HistoryManager::appendChangedSnapshot(HistoryEntry& entry, TileSnapshot& snapshot) {
    TiledLayer* layer = comp_.layer(snapshot.layerId);
    if (layer && !sameAsCurrent(snapshot, *layer)) entry.tiles.push_back(std::move(snapshot));
}

uint32_t HistoryManager::saveState(const std::string& label) {
    if (!active_) return 0;
    HistoryEntry entry;
    entry.label = label;
    for (auto& snapshot : open_) appendChangedSnapshot(entry, snapshot);
    endAction();
    if (entry.tiles.empty()) return 0;
    for (auto& redoEntry : redo_) bytes_ -= redoEntry.bytes;
    redo_.clear();
    entry.bytes = countBytes(entry);
    bytes_ += entry.bytes;
    const uint32_t savedCount = static_cast<uint32_t>(entry.tiles.size());
    undo_.push_back(std::move(entry));
    trim();
    return savedCount;
}

void HistoryManager::cancelAction() {
    if (!active_) return;
    HistoryEntry entry;
    for (auto& snapshot : open_) entry.tiles.push_back(std::move(snapshot));
    endAction();
    swapIn(entry);
}

void HistoryManager::swapSnapshot(TileSnapshot& snapshot) {
    TiledLayer* layer = comp_.layer(snapshot.layerId);
    if (!layer) return;
    layer->swapTilePixels(snapshot.tx, snapshot.ty, snapshot.pixels);
}

void HistoryManager::swapIn(HistoryEntry& entry) {
    for (auto& snapshot : entry.tiles) swapSnapshot(snapshot);
}

bool HistoryManager::step(std::deque<HistoryEntry>& from, std::deque<HistoryEntry>& to) {
    if (active_ || from.empty()) return false;
    HistoryEntry entry = std::move(from.back());
    from.pop_back();
    bytes_ -= entry.bytes;
    swapIn(entry);
    entry.bytes = countBytes(entry);
    bytes_ += entry.bytes;
    to.push_back(std::move(entry));
    trim();
    return true;
}

bool HistoryManager::undo() { return step(undo_, redo_); }
bool HistoryManager::redo() { return step(redo_, undo_); }

void HistoryManager::trim() {
    while (bytes_ > maxBytes_) {
        if (!undo_.empty()) {
            bytes_ -= undo_.front().bytes;
            undo_.pop_front();
            continue;
        }
        if (!redo_.empty()) {
            bytes_ -= redo_.back().bytes;
            redo_.pop_back();
            continue;
        }
        break;
    }
}

bool HistoryManager::discardOldestUndo() {
    if (active_ || undo_.empty()) return false;
    bytes_ -= undo_.front().bytes;
    undo_.pop_front();
    return true;
}

bool HistoryManager::discardOldestRedo() {
    if (active_ || redo_.empty()) return false;
    bytes_ -= redo_.back().bytes;
    redo_.pop_back();
    return true;
}

void HistoryManager::discardRedo() {
    for (const auto& entry : redo_) bytes_ -= entry.bytes;
    redo_.clear();
}

void HistoryManager::clear() {
    if (active_) endAction();
    undo_.clear();
    redo_.clear();
    bytes_ = 0;
}

} // namespace nvts

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
        .function("clear",        &nvts::HistoryManager::clear)
        .function("discardOldestUndo", &nvts::HistoryManager::discardOldestUndo)
        .function("discardOldestRedo", &nvts::HistoryManager::discardOldestRedo)
        .function("discardRedo", &nvts::HistoryManager::discardRedo);
}
