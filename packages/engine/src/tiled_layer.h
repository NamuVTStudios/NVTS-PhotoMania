// tiled_layer.h — Layer split into 256x256 tiles with dirty-tile tracking.
#pragma once
#include <cstdint>
#include <cstddef>
#include <memory>
#include <unordered_map>
#include <utility>
#include <vector>
#include <emscripten/val.h>

namespace nvts {

constexpr uint32_t TILE_SIZE   = 256;
constexpr uint32_t TILE_STRIDE = TILE_SIZE * 4;
constexpr uint32_t TILE_BYTES  = TILE_SIZE * TILE_SIZE * 4;

// A tile owns a stable RGBA8 buffer so its address can be exposed to JavaScript.
struct Tile {
    int32_t tx, ty;
    bool dirty = false;
    std::unique_ptr<uint8_t[]> pixels;

    Tile(int32_t x, int32_t y)
        : tx(x), ty(y), pixels(new uint8_t[TILE_BYTES]()) {}
};

class TiledLayer;

struct TileWriteObserver {
    virtual ~TileWriteObserver() = default;
    virtual void onBeforeTileWrite(TiledLayer& layer, int32_t tx, int32_t ty, const Tile* existing) = 0;
};

class TiledLayer {
public:
    TiledLayer(uint32_t width, uint32_t height);

    uint32_t width() const { return width_; }
    uint32_t height() const { return height_; }
    uint32_t tilesX() const { return tilesX_; }
    uint32_t tilesY() const { return tilesY_; }
    uint32_t allocatedTiles() const { return static_cast<uint32_t>(tiles_.size()); }

    void writeRect(int32_t x, int32_t y, uint32_t w, uint32_t h,
                   const uint8_t* src, size_t srcStride);
    bool writeRectFromJS(int32_t x, int32_t y, uint32_t w, uint32_t h, const emscripten::val& bytes);
    bool loadFromRGBA(const emscripten::val& bytes);
    void applyBrightness(int amount);

    void markRectDirty(int32_t x, int32_t y, uint32_t w, uint32_t h);
    void markAllDirty();
    uint32_t flushDirty();
    uintptr_t dirtyDescPtr() const { return reinterpret_cast<uintptr_t>(desc_.data()); }
    uintptr_t tilePtr(int32_t tx, int32_t ty) const;
    const Tile* findTile(int32_t tx, int32_t ty) const;
    void takeDirty(std::vector<std::pair<int32_t, int32_t>>& out);

    void setObserver(TileWriteObserver* observer) { observer_ = observer; }
    void touchRect(int32_t x, int32_t y, uint32_t w, uint32_t h);
    bool swapTilePixels(int32_t tx, int32_t ty, std::unique_ptr<uint8_t[]>& other);
    bool readRectToJS(int32_t x, int32_t y, uint32_t w, uint32_t h, const emscripten::val& dst) const;
    void stampDisc(float cx, float cy, float radius, int r, int g, int b, int a, bool erase);

private:
    struct ClippedRect {
        int64_t x0 = 0;
        int64_t y0 = 0;
        int64_t x1 = 0;
        int64_t y1 = 0;
        bool empty() const { return x0 >= x1 || y0 >= y1; }
    };

    static uint64_t key(int32_t tx, int32_t ty) {
        return (static_cast<uint64_t>(static_cast<uint32_t>(ty)) << 32) | static_cast<uint32_t>(tx);
    }
    ClippedRect clipRect(int32_t x, int32_t y, uint32_t w, uint32_t h) const;
    Tile& getOrCreate(int32_t tx, int32_t ty);
    void markDirty(Tile& tile);

    void writeTileRows(const ClippedRect& rect, int32_t x, int32_t y, const uint8_t* src, size_t stride);
    void writeTileColumns(const ClippedRect& rect, int64_t ty, int32_t x, int32_t y, const uint8_t* src, size_t stride);
    void writeTileRect(const ClippedRect& rect, int64_t tx, int64_t ty, int32_t x, int32_t y, const uint8_t* src, size_t stride);
    void copyWriteRows(Tile& tile, int64_t tx, int64_t ty, int64_t px0, int64_t px1,
                       int64_t py0, int64_t py1, int32_t x, int32_t y,
                       const uint8_t* src, size_t stride);
    void applyBrightnessToTile(Tile& tile, int amount);
    void markDirtyTileRows(const ClippedRect& rect);
    void markDirtyTileColumns(int64_t tx0, int64_t tx1, int64_t ty);
    void markDirtyAt(int32_t tx, int32_t ty);
    void touchTileRows(const ClippedRect& rect);
    void touchTileColumns(int64_t tx0, int64_t tx1, int64_t ty);
    void touchTileAt(int32_t tx, int32_t ty);
    void readTileRows(const ClippedRect& rect, int32_t x, int32_t y, uint32_t w,
                      std::vector<uint8_t>& dst) const;
    void readTileColumns(const ClippedRect& rect, int64_t ty, int32_t x, int32_t y,
                         uint32_t w, std::vector<uint8_t>& dst) const;
    void readTileRect(const ClippedRect& rect, int64_t tx, int64_t ty, int32_t x, int32_t y,
                      uint32_t w, std::vector<uint8_t>& dst) const;
    void copyReadRows(const Tile& tile, const ClippedRect& rect, int64_t tx, int64_t ty,
                      int32_t x, int32_t y, uint32_t w, std::vector<uint8_t>& dst) const;
    void stampTileRows(const ClippedRect& rect, float cx, float cy, float radius, float brushA,
                       float rf, float gf, float bf, bool erase);
    void stampTileColumns(const ClippedRect& rect, int64_t ty, float cx, float cy, float radius,
                          float brushA, float rf, float gf, float bf, bool erase);
    void stampTile(const ClippedRect& rect, int32_t tx, int32_t ty, float cx, float cy,
                   float radius, float brushA, float rf, float gf, float bf, bool erase);
    void stampPixelRows(Tile& tile, int32_t tx, int32_t ty, int32_t px0, int32_t px1,
                        int32_t py0, int32_t py1, float cx, float cy, float radius,
                        float brushA, float rf, float gf, float bf, bool erase, bool& changed);
    void stampPixelRow(Tile& tile, int32_t tx, int32_t ty, int32_t px0, int32_t px1, int32_t py,
                       float cx, float cy, float radius, float brushA, float rf, float gf, float bf,
                       bool erase, bool& changed);
    bool stampPixel(Tile& tile, int32_t tx, int32_t ty, int32_t px, int32_t py,
                    float cx, float cy, float radius, float brushA,
                    float rf, float gf, float bf, bool erase);

    uint32_t width_, height_, tilesX_, tilesY_;
    std::unordered_map<uint64_t, Tile> tiles_;
    // Buffer reutilizable para las transferencias JS<->C++; evita reservar un vector en cada dab.
    // write/read usan este scratch de forma secuencial en el hilo de ejecución del motor.
    mutable std::vector<uint8_t> ioScratch_;
    std::vector<Tile*> dirtyList_;
    TileWriteObserver* observer_ = nullptr;
    std::vector<uint32_t> desc_;
};

} // namespace nvts
