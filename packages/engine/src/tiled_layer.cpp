// tiled_layer.cpp — Tiled storage, drawing operations, and embind bindings.

#include "tiled_layer.h"
#include <emscripten/bind.h>
#include <algorithm>
#include <cmath>
#include <cstring>

using namespace emscripten;

namespace nvts {
namespace {

bool alphaRowIsTransparent(const uint8_t* src, uint32_t width) {
    bool transparent = true;
    for (uint32_t x = 0; x < width; ++x) transparent = transparent && src[x * 4 + 3] == 0;
    return transparent;
}

bool regionIsTransparent(const uint8_t* src, size_t stride, uint32_t width, uint32_t height) {
    bool transparent = true;
    for (uint32_t y = 0; y < height; ++y) {
        transparent = transparent && alphaRowIsTransparent(src + y * stride, width);
    }
    return transparent;
}

uint8_t clamp8(int value) {
    return static_cast<uint8_t>(value < 0 ? 0 : (value > 255 ? 255 : value));
}

uint8_t to8(float value) {
    return static_cast<uint8_t>(std::min(255.f, std::max(0.f, value)) + 0.5f);
}

} // namespace

TiledLayer::TiledLayer(uint32_t width, uint32_t height)
    : width_(width), height_(height),
      tilesX_((width + TILE_SIZE - 1) / TILE_SIZE),
      tilesY_((height + TILE_SIZE - 1) / TILE_SIZE) {}

TiledLayer::ClippedRect TiledLayer::clipRect(int32_t x, int32_t y, uint32_t w, uint32_t h) const {
    return {
        std::max<int64_t>(0, x),
        std::max<int64_t>(0, y),
        std::min<int64_t>(width_, static_cast<int64_t>(x) + w),
        std::min<int64_t>(height_, static_cast<int64_t>(y) + h)
    };
}

Tile& TiledLayer::getOrCreate(int32_t tx, int32_t ty) {
    return tiles_.try_emplace(key(tx, ty), tx, ty).first->second;
}

void TiledLayer::markDirty(Tile& tile) {
    if (tile.dirty) return;
    tile.dirty = true;
    dirtyList_.push_back(&tile);
}

// ── Region writes ─────────────────────────────────────────────────────────

void TiledLayer::writeRect(int32_t x, int32_t y, uint32_t w, uint32_t h,
                           const uint8_t* src, size_t srcStride) {
    const ClippedRect rect = clipRect(x, y, w, h);
    if (rect.empty()) return;
    writeTileRows(rect, x, y, src, srcStride);
}

void TiledLayer::writeTileRows(const ClippedRect& rect, int32_t x, int32_t y, const uint8_t* src, size_t stride) {
    const int64_t first = rect.y0 / TILE_SIZE;
    const int64_t last = (rect.y1 - 1) / TILE_SIZE;
    for (int64_t ty = first; ty <= last; ++ty) writeTileColumns(rect, ty, x, y, src, stride);
}

void TiledLayer::writeTileColumns(const ClippedRect& rect, int64_t ty, int32_t x, int32_t y,
                                  const uint8_t* src, size_t stride) {
    const int64_t first = rect.x0 / TILE_SIZE;
    const int64_t last = (rect.x1 - 1) / TILE_SIZE;
    for (int64_t tx = first; tx <= last; ++tx) writeTileRect(rect, tx, ty, x, y, src, stride);
}

void TiledLayer::writeTileRect(const ClippedRect& rect, int64_t tx, int64_t ty, int32_t x, int32_t y,
                               const uint8_t* src, size_t stride) {
    const int64_t tileOriginX = tx * TILE_SIZE;
    const int64_t tileOriginY = ty * TILE_SIZE;
    const int64_t px0 = std::max(rect.x0, tileOriginX);
    const int64_t px1 = std::min(rect.x1, tileOriginX + TILE_SIZE);
    const int64_t py0 = std::max(rect.y0, tileOriginY);
    const int64_t py1 = std::min(rect.y1, tileOriginY + TILE_SIZE);
    const uint8_t* srcStart = src + (py0 - y) * stride + (px0 - x) * 4;
    auto it = tiles_.find(key(static_cast<int32_t>(tx), static_cast<int32_t>(ty)));
    const bool missingTransparent = it == tiles_.end() &&
        regionIsTransparent(srcStart, stride, static_cast<uint32_t>(px1 - px0),
                            static_cast<uint32_t>(py1 - py0));
    if (missingTransparent) return;
    if (observer_) observer_->onBeforeTileWrite(*this, static_cast<int32_t>(tx), static_cast<int32_t>(ty),
                                                 it == tiles_.end() ? nullptr : &it->second);
    Tile& tile = it == tiles_.end()
        ? getOrCreate(static_cast<int32_t>(tx), static_cast<int32_t>(ty))
        : it->second;
    copyWriteRows(tile, tx, ty, px0, px1, py0, py1, x, y, src, stride);
    markDirty(tile);
}

void TiledLayer::copyWriteRows(Tile& tile, int64_t tx, int64_t ty, int64_t px0, int64_t px1,
                               int64_t py0, int64_t py1, int32_t x, int32_t y,
                               const uint8_t* src, size_t stride) {
    const int64_t tileOriginX = tx * TILE_SIZE;
    const int64_t tileOriginY = ty * TILE_SIZE;
    for (int64_t py = py0; py < py1; ++py) {
        const uint8_t* sourceRow = src + (py - y) * stride + (px0 - x) * 4;
        uint8_t* destinationRow = tile.pixels.get() +
            ((py - tileOriginY) * TILE_SIZE + (px0 - tileOriginX)) * 4;
        std::memcpy(destinationRow, sourceRow, static_cast<size_t>(px1 - px0) * 4);
    }
}

bool TiledLayer::writeRectFromJS(int32_t x, int32_t y, uint32_t w, uint32_t h, const val& bytes) {
    const size_t need = static_cast<size_t>(w) * h * 4;
    if (bytes["length"].as<unsigned>() < need) return false;
    std::vector<uint8_t> tmp(need);
    val dst(typed_memory_view(need, tmp.data()));
    dst.call<void>("set", bytes.call<val>("subarray", 0, static_cast<unsigned>(need)));
    writeRect(x, y, w, h, tmp.data(), static_cast<size_t>(w) * 4);
    return true;
}

bool TiledLayer::loadFromRGBA(const val& bytes) {
    return writeRectFromJS(0, 0, width_, height_, bytes);
}

void TiledLayer::applyBrightness(int amount) {
    for (auto& entry : tiles_) applyBrightnessToTile(entry.second, amount);
}

void TiledLayer::applyBrightnessToTile(Tile& tile, int amount) {
    if (observer_) observer_->onBeforeTileWrite(*this, tile.tx, tile.ty, &tile);
    uint8_t* pixels = tile.pixels.get();
    for (uint32_t i = 0; i < TILE_BYTES; i += 4) {
        pixels[i] = clamp8(pixels[i] + amount);
        pixels[i + 1] = clamp8(pixels[i + 1] + amount);
        pixels[i + 2] = clamp8(pixels[i + 2] + amount);
    }
    markDirty(tile);
}

// ── Dirty tracking ────────────────────────────────────────────────────────

void TiledLayer::markRectDirty(int32_t x, int32_t y, uint32_t w, uint32_t h) {
    const ClippedRect rect = clipRect(x, y, w, h);
    if (rect.empty()) return;
    markDirtyTileRows(rect);
}

void TiledLayer::markDirtyTileRows(const ClippedRect& rect) {
    for (int64_t ty = rect.y0 / TILE_SIZE; ty <= (rect.y1 - 1) / TILE_SIZE; ++ty) {
        markDirtyTileColumns(rect.x0 / TILE_SIZE, (rect.x1 - 1) / TILE_SIZE, ty);
    }
}

void TiledLayer::markDirtyTileColumns(int64_t tx0, int64_t tx1, int64_t ty) {
    for (int64_t tx = tx0; tx <= tx1; ++tx) markDirtyAt(static_cast<int32_t>(tx), static_cast<int32_t>(ty));
}

void TiledLayer::markDirtyAt(int32_t tx, int32_t ty) {
    auto it = tiles_.find(key(tx, ty));
    if (it == tiles_.end()) return;
    markDirty(it->second);
}

void TiledLayer::markAllDirty() {
    for (auto& entry : tiles_) markDirty(entry.second);
}

uint32_t TiledLayer::flushDirty() {
    desc_.clear();
    desc_.reserve(dirtyList_.size() * 3);
    for (Tile* tile : dirtyList_) {
        desc_.push_back(static_cast<uint32_t>(tile->tx));
        desc_.push_back(static_cast<uint32_t>(tile->ty));
        desc_.push_back(static_cast<uint32_t>(reinterpret_cast<uintptr_t>(tile->pixels.get())));
        tile->dirty = false;
    }
    dirtyList_.clear();
    return static_cast<uint32_t>(desc_.size() / 3);
}

uintptr_t TiledLayer::tilePtr(int32_t tx, int32_t ty) const {
    const Tile* tile = findTile(tx, ty);
    return tile ? reinterpret_cast<uintptr_t>(tile->pixels.get()) : 0;
}

const Tile* TiledLayer::findTile(int32_t tx, int32_t ty) const {
    auto it = tiles_.find(key(tx, ty));
    return it == tiles_.end() ? nullptr : &it->second;
}

void TiledLayer::takeDirty(std::vector<std::pair<int32_t, int32_t>>& out) {
    for (Tile* tile : dirtyList_) {
        out.emplace_back(tile->tx, tile->ty);
        tile->dirty = false;
    }
    dirtyList_.clear();
}

// ── History support ───────────────────────────────────────────────────────

void TiledLayer::touchRect(int32_t x, int32_t y, uint32_t w, uint32_t h) {
    const ClippedRect rect = clipRect(x, y, w, h);
    if (rect.empty()) return;
    touchTileRows(rect);
}

void TiledLayer::touchTileRows(const ClippedRect& rect) {
    for (int64_t ty = rect.y0 / TILE_SIZE; ty <= (rect.y1 - 1) / TILE_SIZE; ++ty) {
        touchTileColumns(rect.x0 / TILE_SIZE, (rect.x1 - 1) / TILE_SIZE, ty);
    }
}

void TiledLayer::touchTileColumns(int64_t tx0, int64_t tx1, int64_t ty) {
    for (int64_t tx = tx0; tx <= tx1; ++tx) touchTileAt(static_cast<int32_t>(tx), static_cast<int32_t>(ty));
}

void TiledLayer::touchTileAt(int32_t tx, int32_t ty) {
    auto it = tiles_.find(key(tx, ty));
    if (observer_) observer_->onBeforeTileWrite(*this, tx, ty, it == tiles_.end() ? nullptr : &it->second);
    if (it != tiles_.end()) return;
    getOrCreate(tx, ty);
}

bool TiledLayer::swapTilePixels(int32_t tx, int32_t ty, std::unique_ptr<uint8_t[]>& other) {
    auto it = tiles_.find(key(tx, ty));
    if (it == tiles_.end() && !other) return false;
    if (it == tiles_.end()) {
        Tile& tile = getOrCreate(tx, ty);
        tile.pixels = std::move(other);
        other.reset();
        markDirty(tile);
        return true;
    }
    Tile& tile = it->second;
    if (other) {
        tile.pixels.swap(other);
    } else {
        other = std::move(tile.pixels);
        tile.pixels.reset(new uint8_t[TILE_BYTES]());
    }
    markDirty(tile);
    return true;
}

// ── Region reads ──────────────────────────────────────────────────────────

bool TiledLayer::readRectToJS(int32_t x, int32_t y, uint32_t w, uint32_t h, const val& dst) const {
    const size_t need = static_cast<size_t>(w) * h * 4;
    if (need == 0 || dst["length"].as<unsigned>() < need) return false;
    std::vector<uint8_t> tmp(need, 0);
    const ClippedRect rect = clipRect(x, y, w, h);
    if (!rect.empty()) readTileRows(rect, x, y, w, tmp);
    dst.call<void>("set", val(typed_memory_view(need, tmp.data())));
    return true;
}

void TiledLayer::readTileRows(const ClippedRect& rect, int32_t x, int32_t y, uint32_t w,
                              std::vector<uint8_t>& dst) const {
    for (int64_t ty = rect.y0 / TILE_SIZE; ty <= (rect.y1 - 1) / TILE_SIZE; ++ty) {
        readTileColumns(rect, ty, x, y, w, dst);
    }
}

void TiledLayer::readTileColumns(const ClippedRect& rect, int64_t ty, int32_t x, int32_t y,
                                 uint32_t w, std::vector<uint8_t>& dst) const {
    for (int64_t tx = rect.x0 / TILE_SIZE; tx <= (rect.x1 - 1) / TILE_SIZE; ++tx) {
        readTileRect(rect, tx, ty, x, y, w, dst);
    }
}

void TiledLayer::readTileRect(const ClippedRect& rect, int64_t tx, int64_t ty, int32_t x, int32_t y,
                              uint32_t w, std::vector<uint8_t>& dst) const {
    const Tile* tile = findTile(static_cast<int32_t>(tx), static_cast<int32_t>(ty));
    if (!tile) return;
    copyReadRows(*tile, rect, tx, ty, x, y, w, dst);
}

void TiledLayer::copyReadRows(const Tile& tile, const ClippedRect& rect, int64_t tx, int64_t ty,
                              int32_t x, int32_t y, uint32_t w, std::vector<uint8_t>& dst) const {
    const int64_t tileOriginX = tx * TILE_SIZE;
    const int64_t tileOriginY = ty * TILE_SIZE;
    const int64_t px0 = std::max(rect.x0, tileOriginX);
    const int64_t px1 = std::min(rect.x1, tileOriginX + TILE_SIZE);
    const int64_t py0 = std::max(rect.y0, tileOriginY);
    const int64_t py1 = std::min(rect.y1, tileOriginY + TILE_SIZE);
    for (int64_t py = py0; py < py1; ++py) {
        const size_t destinationOffset = static_cast<size_t>(((py - y) * w + (px0 - x)) * 4);
        const size_t sourceOffset = static_cast<size_t>(((py - tileOriginY) * TILE_SIZE + (px0 - tileOriginX)) * 4);
        std::memcpy(dst.data() + destinationOffset, tile.pixels.get() + sourceOffset,
                    static_cast<size_t>(px1 - px0) * 4);
    }
}

// ── Brush stamp ───────────────────────────────────────────────────────────

void TiledLayer::stampDisc(float cx, float cy, float radius, int r, int g, int b, int a, bool erase) {
    if (radius <= 0.f) return;
    const ClippedRect rect{
        std::max<int32_t>(0, static_cast<int32_t>(std::floor(cx - radius - 1.f))),
        std::max<int32_t>(0, static_cast<int32_t>(std::floor(cy - radius - 1.f))),
        std::min<int32_t>(static_cast<int32_t>(width_), static_cast<int32_t>(std::ceil(cx + radius + 1.f))),
        std::min<int32_t>(static_cast<int32_t>(height_), static_cast<int32_t>(std::ceil(cy + radius + 1.f)))
    };
    if (rect.empty()) return;
    const float brushA = std::min(1.f, std::max(0.f, a / 255.f));
    stampTileRows(rect, cx, cy, radius, brushA, static_cast<float>(r), static_cast<float>(g),
                  static_cast<float>(b), erase);
}

void TiledLayer::stampTileRows(const ClippedRect& rect, float cx, float cy, float radius, float brushA,
                               float rf, float gf, float bf, bool erase) {
    for (int64_t ty = rect.y0 / TILE_SIZE; ty <= (rect.y1 - 1) / TILE_SIZE; ++ty) {
        stampTileColumns(rect, ty, cx, cy, radius, brushA, rf, gf, bf, erase);
    }
}

void TiledLayer::stampTileColumns(const ClippedRect& rect, int64_t ty, float cx, float cy, float radius,
                                  float brushA, float rf, float gf, float bf, bool erase) {
    for (int64_t tx = rect.x0 / TILE_SIZE; tx <= (rect.x1 - 1) / TILE_SIZE; ++tx) {
        stampTile(rect, static_cast<int32_t>(tx), static_cast<int32_t>(ty),
                  cx, cy, radius, brushA, rf, gf, bf, erase);
    }
}

void TiledLayer::stampTile(const ClippedRect& rect, int32_t tx, int32_t ty, float cx, float cy,
                           float radius, float brushA, float rf, float gf, float bf, bool erase) {
    auto it = tiles_.find(key(tx, ty));
    if (erase && it == tiles_.end()) return;
    if (observer_) observer_->onBeforeTileWrite(*this, tx, ty, it == tiles_.end() ? nullptr : &it->second);
    Tile& tile = it == tiles_.end() ? getOrCreate(tx, ty) : it->second;
    const int32_t tileX = tx * static_cast<int32_t>(TILE_SIZE);
    const int32_t tileY = ty * static_cast<int32_t>(TILE_SIZE);
    const int32_t px0 = static_cast<int32_t>(std::max<int64_t>(rect.x0, tileX));
    const int32_t px1 = static_cast<int32_t>(std::min<int64_t>(rect.x1, tileX + TILE_SIZE));
    const int32_t py0 = static_cast<int32_t>(std::max<int64_t>(rect.y0, tileY));
    const int32_t py1 = static_cast<int32_t>(std::min<int64_t>(rect.y1, tileY + TILE_SIZE));
    bool changed = false;
    stampPixelRows(tile, tx, ty, px0, px1, py0, py1, cx, cy, radius, brushA, rf, gf, bf, erase, changed);
    if (changed) markDirty(tile);
}

void TiledLayer::stampPixelRows(Tile& tile, int32_t tx, int32_t ty, int32_t px0, int32_t px1,
                                int32_t py0, int32_t py1, float cx, float cy, float radius,
                                float brushA, float rf, float gf, float bf, bool erase, bool& changed) {
    for (int32_t py = py0; py < py1; ++py) {
        stampPixelRow(tile, tx, ty, px0, px1, py, cx, cy, radius, brushA, rf, gf, bf, erase, changed);
    }
}

void TiledLayer::stampPixelRow(Tile& tile, int32_t tx, int32_t ty, int32_t px0, int32_t px1, int32_t py,
                               float cx, float cy, float radius, float brushA,
                               float rf, float gf, float bf, bool erase, bool& changed) {
    for (int32_t px = px0; px < px1; ++px) {
        changed = stampPixel(tile, tx, ty, px, py, cx, cy, radius, brushA, rf, gf, bf, erase) || changed;
    }
}

bool TiledLayer::stampPixel(Tile& tile, int32_t tx, int32_t ty, int32_t px, int32_t py,
                            float cx, float cy, float radius, float brushA,
                            float rf, float gf, float bf, bool erase) {
    const float dx = px + 0.5f - cx;
    const float dy = py + 0.5f - cy;
    const float coverage = std::min(1.f, std::max(0.f, radius + 0.5f - std::sqrt(dx * dx + dy * dy)));
    if (coverage <= 0.f) return false;
    const float sourceAlpha = coverage * brushA;
    uint8_t* pixel = tile.pixels.get() +
        ((py - ty * static_cast<int32_t>(TILE_SIZE)) * TILE_SIZE +
         (px - tx * static_cast<int32_t>(TILE_SIZE))) * 4;
    const float destinationAlpha = pixel[3] / 255.f;
    if (erase) {
        pixel[3] = to8(destinationAlpha * (1.f - sourceAlpha) * 255.f);
        return true;
    }
    const float outputAlpha = sourceAlpha + destinationAlpha * (1.f - sourceAlpha);
    const float retained = destinationAlpha * (1.f - sourceAlpha);
    pixel[0] = to8((rf * sourceAlpha + pixel[0] * retained) / outputAlpha);
    pixel[1] = to8((gf * sourceAlpha + pixel[1] * retained) / outputAlpha);
    pixel[2] = to8((bf * sourceAlpha + pixel[2] * retained) / outputAlpha);
    pixel[3] = to8(outputAlpha * 255.f);
    return true;
}

} // namespace nvts

EMSCRIPTEN_BINDINGS(nvts_tiles) {
    constant("TILE_SIZE", nvts::TILE_SIZE);
    class_<nvts::TiledLayer>("TiledLayer")
        .constructor<uint32_t, uint32_t>()
        .function("width",          &nvts::TiledLayer::width)
        .function("height",         &nvts::TiledLayer::height)
        .function("tilesX",         &nvts::TiledLayer::tilesX)
        .function("tilesY",         &nvts::TiledLayer::tilesY)
        .function("allocatedTiles", &nvts::TiledLayer::allocatedTiles)
        .function("writeRectFromJS",&nvts::TiledLayer::writeRectFromJS)
        .function("loadFromRGBA",   &nvts::TiledLayer::loadFromRGBA)
        .function("applyBrightness",&nvts::TiledLayer::applyBrightness)
        .function("markRectDirty",  &nvts::TiledLayer::markRectDirty)
        .function("markAllDirty",   &nvts::TiledLayer::markAllDirty)
        .function("flushDirty",     &nvts::TiledLayer::flushDirty)
        .function("dirtyDescPtr",   &nvts::TiledLayer::dirtyDescPtr)
        .function("tilePtr",        &nvts::TiledLayer::tilePtr)
        .function("touchRect",      &nvts::TiledLayer::touchRect)
        .function("readRectToJS",   &nvts::TiledLayer::readRectToJS)
        .function("stampDisc",      &nvts::TiledLayer::stampDisc);
}
