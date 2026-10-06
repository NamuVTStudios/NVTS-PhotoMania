// tiled_layer.cpp — Implementación del sistema de tiles + bindings embind.

#include "tiled_layer.h"
#include <emscripten/bind.h>
#include <algorithm>
#include <cmath>
#include <cstring>

using namespace emscripten;

namespace nvts {

TiledLayer::TiledLayer(uint32_t width, uint32_t height)
    : width_(width), height_(height),
      tilesX_((width  + TILE_SIZE - 1) / TILE_SIZE),
      tilesY_((height + TILE_SIZE - 1) / TILE_SIZE) {}

// ── Internos ──────────────────────────────────────────────────────────────

Tile& TiledLayer::getOrCreate(int32_t tx, int32_t ty) {
    // try_emplace construye el Tile in situ solo si no existe (sin copias ni movimientos).
    return tiles_.try_emplace(key(tx, ty), tx, ty).first->second;
}

// Marca un tile como sucio y lo añade a la lista una sola vez (sin duplicados).
void TiledLayer::markDirty(Tile& t) {
    if (!t.dirty) {
        t.dirty = true;
        dirtyList_.push_back(&t);  // seguro: los nodos de unordered_map no se mueven
    }
}

static bool regionIsTransparent(const uint8_t* src, size_t stride, uint32_t w, uint32_t h) {
    for (uint32_t row = 0; row < h; ++row) {
        const uint8_t* p = src + row * stride;
        for (uint32_t i = 0; i < w; ++i) if (p[i * 4 + 3] != 0) return false;
    }
    return true;
}

// ── Escritura ─────────────────────────────────────────────────────────────

void TiledLayer::writeRect(int32_t x, int32_t y, uint32_t w, uint32_t h,
                           const uint8_t* src, size_t srcStride) {
    // 1) Recorta la región a los límites del lienzo.
    const int64_t x0 = std::max<int64_t>(0, x),  y0 = std::max<int64_t>(0, y);
    const int64_t x1 = std::min<int64_t>(width_,  static_cast<int64_t>(x) + w);
    const int64_t y1 = std::min<int64_t>(height_, static_cast<int64_t>(y) + h);
    if (x0 >= x1 || y0 >= y1) return;

    const int64_t T = TILE_SIZE;
    // 2) Recorre solo los tiles que intersectan la región.
    for (int64_t ty = y0 / T; ty <= (y1 - 1) / T; ++ty) {
        for (int64_t tx = x0 / T; tx <= (x1 - 1) / T; ++tx) {
            // Intersección región ∩ tile, en coordenadas de lienzo.
            const int64_t px0 = std::max(x0, tx * T), px1 = std::min(x1, (tx + 1) * T);
            const int64_t py0 = std::max(y0, ty * T), py1 = std::min(y1, (ty + 1) * T);
            const uint8_t* s0 = src + (py0 - y) * srcStride + (px0 - x) * 4;

            // Un tile inexistente ya es transparente: escribir transparencia sería no-op.
            // Esto evita reservar 256 KiB para zonas vacías.
            auto it = tiles_.find(key(static_cast<int32_t>(tx), static_cast<int32_t>(ty)));
            if (it == tiles_.end() &&
                regionIsTransparent(s0, srcStride, static_cast<uint32_t>(px1 - px0),
                                    static_cast<uint32_t>(py1 - py0))) continue;

            // Aviso previo al historial: guarda los píxeles anteriores (copy-on-write).
            if (observer_) observer_->onBeforeTileWrite(*this, static_cast<int32_t>(tx), static_cast<int32_t>(ty),
                                                         it != tiles_.end() ? &it->second : nullptr);

            Tile& t = (it != tiles_.end()) ? it->second
                                           : getOrCreate(static_cast<int32_t>(tx), static_cast<int32_t>(ty));
            // 3) Copia fila a fila al interior del tile.
            for (int64_t py = py0; py < py1; ++py) {
                const uint8_t* s = src + (py - y) * srcStride + (px0 - x) * 4;
                uint8_t* d = t.pixels.get() + ((py - ty * T) * T + (px0 - tx * T)) * 4;
                std::memcpy(d, s, static_cast<size_t>(px1 - px0) * 4);
            }
            markDirty(t);  // <- aquí se marca como sucio
        }
    }
}

bool TiledLayer::writeRectFromJS(int32_t x, int32_t y, uint32_t w, uint32_t h, const val& bytes) {
    const size_t need = static_cast<size_t>(w) * h * 4;
    if (bytes["length"].as<unsigned>() < need) return false;
    // Copia JS -> memoria temporal Wasm (una sola vez), luego reparte a los tiles.
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
    auto c8 = [](int v) { return static_cast<uint8_t>(v < 0 ? 0 : (v > 255 ? 255 : v)); };
    for (auto& [k, t] : tiles_) {          // solo tiles existentes: los vacíos no cambian
        if (observer_) observer_->onBeforeTileWrite(*this, t.tx, t.ty, &t);
        uint8_t* p = t.pixels.get();
        for (uint32_t i = 0; i < TILE_BYTES; i += 4) {
            p[i] = c8(p[i] + amount); p[i + 1] = c8(p[i + 1] + amount); p[i + 2] = c8(p[i + 2] + amount);
        }
        markDirty(t);
    }
}

// ── Dirty tracking ────────────────────────────────────────────────────────

void TiledLayer::markRectDirty(int32_t x, int32_t y, uint32_t w, uint32_t h) {
    const int64_t x0 = std::max<int64_t>(0, x),  y0 = std::max<int64_t>(0, y);
    const int64_t x1 = std::min<int64_t>(width_,  static_cast<int64_t>(x) + w);
    const int64_t y1 = std::min<int64_t>(height_, static_cast<int64_t>(y) + h);
    if (x0 >= x1 || y0 >= y1) return;
    for (int64_t ty = y0 / TILE_SIZE; ty <= (y1 - 1) / TILE_SIZE; ++ty)
        for (int64_t tx = x0 / TILE_SIZE; tx <= (x1 - 1) / TILE_SIZE; ++tx) {
            auto it = tiles_.find(key(static_cast<int32_t>(tx), static_cast<int32_t>(ty)));
            if (it != tiles_.end()) markDirty(it->second);
        }
}

void TiledLayer::markAllDirty() {
    for (auto& [k, t] : tiles_) markDirty(t);
}

uint32_t TiledLayer::flushDirty() {
    desc_.clear();
    desc_.reserve(dirtyList_.size() * 3);
    for (Tile* t : dirtyList_) {
        desc_.push_back(static_cast<uint32_t>(t->tx));
        desc_.push_back(static_cast<uint32_t>(t->ty));
        desc_.push_back(static_cast<uint32_t>(reinterpret_cast<uintptr_t>(t->pixels.get())));
        t->dirty = false;
    }
    dirtyList_.clear();
    return static_cast<uint32_t>(desc_.size() / 3);
}

uintptr_t TiledLayer::tilePtr(int32_t tx, int32_t ty) const {
    auto it = tiles_.find(key(tx, ty));
    return it == tiles_.end() ? 0 : reinterpret_cast<uintptr_t>(it->second.pixels.get());
}

void TiledLayer::touchRect(int32_t x, int32_t y, uint32_t w, uint32_t h) {
    const int64_t x0 = std::max<int64_t>(0, x),  y0 = std::max<int64_t>(0, y);
    const int64_t x1 = std::min<int64_t>(width_,  static_cast<int64_t>(x) + w);
    const int64_t y1 = std::min<int64_t>(height_, static_cast<int64_t>(y) + h);
    if (x0 >= x1 || y0 >= y1) return;
    for (int64_t ty = y0 / TILE_SIZE; ty <= (y1 - 1) / TILE_SIZE; ++ty)
        for (int64_t tx = x0 / TILE_SIZE; tx <= (x1 - 1) / TILE_SIZE; ++tx) {
            const int32_t cx = static_cast<int32_t>(tx), cy = static_cast<int32_t>(ty);
            auto it = tiles_.find(key(cx, cy));
            if (observer_) observer_->onBeforeTileWrite(*this, cx, cy, it != tiles_.end() ? &it->second : nullptr);
            if (it == tiles_.end()) getOrCreate(cx, cy);   // para que tilePtr() ya sea válido
        }
}

bool TiledLayer::swapTilePixels(int32_t tx, int32_t ty, std::unique_ptr<uint8_t[]>& other) {
    auto it = tiles_.find(key(tx, ty));
    if (it == tiles_.end()) {
        if (!other) return false;               // transparente <-> transparente: nada que hacer
        Tile& t = getOrCreate(tx, ty);
        t.pixels = std::move(other);            // la capa recupera el contenido guardado...
        other.reset();                          // ...y el snapshot pasa a "transparente" (nulo)
        markDirty(t);
        return true;
    }
    Tile& t = it->second;
    if (other) {
        t.pixels.swap(other);                   // intercambio de punteros: sin copiar 256 KiB
    } else {
        other = std::move(t.pixels);            // el snapshot se queda con lo que había
        t.pixels.reset(new uint8_t[TILE_BYTES]());  // el tile pasa a transparente (sigue reservado)
    }
    markDirty(t);                               // ¡importante!: el compositor y la GPU deben enterarse
    return true;
}

bool TiledLayer::readRectToJS(int32_t x, int32_t y, uint32_t w, uint32_t h, const val& dst) const {
    const size_t need = static_cast<size_t>(w) * h * 4;
    if (need == 0 || dst["length"].as<unsigned>() < need) return false;
    std::vector<uint8_t> tmp(need, 0);              // sin tile / fuera del lienzo = transparente

    const int64_t x0 = std::max<int64_t>(0, x),  y0 = std::max<int64_t>(0, y);
    const int64_t x1 = std::min<int64_t>(width_,  static_cast<int64_t>(x) + w);
    const int64_t y1 = std::min<int64_t>(height_, static_cast<int64_t>(y) + h);
    const int64_t T = TILE_SIZE;
    for (int64_t ty = y0 / T; x0 < x1 && y0 < y1 && ty <= (y1 - 1) / T; ++ty)
        for (int64_t tx = x0 / T; tx <= (x1 - 1) / T; ++tx) {
            const Tile* t = findTile(static_cast<int32_t>(tx), static_cast<int32_t>(ty));
            if (!t) continue;
            const int64_t px0 = std::max(x0, tx * T), px1 = std::min(x1, (tx + 1) * T);
            const int64_t py0 = std::max(y0, ty * T), py1 = std::min(y1, (ty + 1) * T);
            for (int64_t py = py0; py < py1; ++py)
                std::memcpy(tmp.data() + ((py - y) * w + (px0 - x)) * 4,
                            t->pixels.get() + ((py - ty * T) * T + (px0 - tx * T)) * 4,
                            static_cast<size_t>(px1 - px0) * 4);
        }
    // Una sola copia memoria Wasm -> Uint8Array de JS.
    dst.call<void>("set", val(typed_memory_view(need, tmp.data())));
    return true;
}

void TiledLayer::stampDisc(float cx, float cy, float radius, int r, int g, int b, int a, bool erase) {
    if (radius <= 0.f) return;
    const int32_t x0 = std::max<int32_t>(0, static_cast<int32_t>(std::floor(cx - radius - 1.f)));
    const int32_t y0 = std::max<int32_t>(0, static_cast<int32_t>(std::floor(cy - radius - 1.f)));
    const int32_t x1 = std::min<int32_t>(static_cast<int32_t>(width_),  static_cast<int32_t>(std::ceil(cx + radius + 1.f)));
    const int32_t y1 = std::min<int32_t>(static_cast<int32_t>(height_), static_cast<int32_t>(std::ceil(cy + radius + 1.f)));
    if (x0 >= x1 || y0 >= y1) return;

    const float brushA = std::min(1.f, std::max(0.f, a / 255.f));
    const float rf = static_cast<float>(r), gf = static_cast<float>(g), bf = static_cast<float>(b);
    auto to8 = [](float v) { return static_cast<uint8_t>(std::min(255.f, std::max(0.f, v)) + 0.5f); };
    const int32_t T = TILE_SIZE;

    for (int32_t ty = y0 / T; ty <= (y1 - 1) / T; ++ty)
        for (int32_t tx = x0 / T; tx <= (x1 - 1) / T; ++tx) {
            auto it = tiles_.find(key(tx, ty));
            if (erase && it == tiles_.end()) continue;           // borrar donde no hay nada: no-op
            if (observer_) observer_->onBeforeTileWrite(*this, tx, ty, it != tiles_.end() ? &it->second : nullptr);
            Tile& t = (it != tiles_.end()) ? it->second : getOrCreate(tx, ty);

            const int32_t px0 = std::max(x0, tx * T), px1 = std::min(x1, (tx + 1) * T);
            const int32_t py0 = std::max(y0, ty * T), py1 = std::min(y1, (ty + 1) * T);
            bool changed = false;
            for (int32_t py = py0; py < py1; ++py)
                for (int32_t px = px0; px < px1; ++px) {
                    const float dx = px + 0.5f - cx, dy = py + 0.5f - cy;
                    const float cov = std::min(1.f, std::max(0.f, radius + 0.5f - std::sqrt(dx * dx + dy * dy)));
                    if (cov <= 0.f) continue;
                    const float sa = cov * brushA;               // alfa efectivo de este píxel
                    uint8_t* d = t.pixels.get() + ((py - ty * T) * T + (px - tx * T)) * 4;
                    const float da = d[3] / 255.f;
                    if (erase) {
                        d[3] = to8(da * (1.f - sa) * 255.f);
                    } else {                                     // source-over sobre color SIN premultiplicar
                        const float oa = sa + da * (1.f - sa);
                        const float k = da * (1.f - sa);
                        d[0] = to8((rf * sa + d[0] * k) / oa);
                        d[1] = to8((gf * sa + d[1] * k) / oa);
                        d[2] = to8((bf * sa + d[2] * k) / oa);
                        d[3] = to8(oa * 255.f);
                    }
                    changed = true;
                }
            if (changed) markDirty(t);
        }
}

const Tile* TiledLayer::findTile(int32_t tx, int32_t ty) const {
    auto it = tiles_.find(key(tx, ty));
    return it == tiles_.end() ? nullptr : &it->second;
}

void TiledLayer::takeDirty(std::vector<std::pair<int32_t, int32_t>>& out) {
    for (Tile* t : dirtyList_) { out.emplace_back(t->tx, t->ty); t->dirty = false; }
    dirtyList_.clear();
}

} // namespace nvts

// ── Bindings ──────────────────────────────────────────────────────────────
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
