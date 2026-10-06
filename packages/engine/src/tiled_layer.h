// tiled_layer.h — Capa dividida en mosaicos de 256x256 con seguimiento de "dirty tiles".
#pragma once
#include <cstdint>
#include <cstddef>
#include <memory>
#include <unordered_map>
#include <utility>
#include <vector>
#include <emscripten/val.h>

namespace nvts {

constexpr uint32_t TILE_SIZE   = 256;                        // lado del tile en píxeles
constexpr uint32_t TILE_STRIDE = TILE_SIZE * 4;              // bytes por fila (RGBA8) = 1024
constexpr uint32_t TILE_BYTES  = TILE_SIZE * TILE_SIZE * 4;  // 256 KiB por tile

// Un mosaico. Los píxeles están en un bloque de heap propio: su dirección es ESTABLE
// (no cambia aunque el mapa se rehashee), lo que permite exponerla a JS sin copiar.
struct Tile {
    int32_t tx, ty;                       // coordenadas de tile (no de píxel)
    bool    dirty = false;                // ¿cambió desde el último flush?
    std::unique_ptr<uint8_t[]> pixels;    // RGBA8 fila a fila, stride = TILE_STRIDE

    Tile(int32_t x, int32_t y)
        : tx(x), ty(y), pixels(new uint8_t[TILE_BYTES]()) {}  // "()" => inicializado a 0
};

class TiledLayer;

// Observador "justo antes de escribir": permite al historial guardar los píxeles previos
// de un tile la primera vez que se toca (copy-on-write).
struct TileWriteObserver {
    virtual ~TileWriteObserver() = default;
    // `existing` = tile actual SIN mutar (nullptr si aún no existe, es decir, era transparente).
    virtual void onBeforeTileWrite(TiledLayer& layer, int32_t tx, int32_t ty, const Tile* existing) = 0;
};

class TiledLayer {
public:
    TiledLayer(uint32_t width, uint32_t height);

    uint32_t width()  const { return width_; }
    uint32_t height() const { return height_; }
    uint32_t tilesX() const { return tilesX_; }
    uint32_t tilesY() const { return tilesY_; }
    uint32_t allocatedTiles() const { return static_cast<uint32_t>(tiles_.size()); }

    // ── Escritura (todas marcan los tiles tocados como sucios) ──
    // Copia una región RGBA8 al lienzo (recortada a los límites). Reparte entre tiles.
    void writeRect(int32_t x, int32_t y, uint32_t w, uint32_t h,
                   const uint8_t* src, size_t srcStride);
    // Variantes para JS (copian desde Uint8Array/Uint8ClampedArray).
    bool writeRectFromJS(int32_t x, int32_t y, uint32_t w, uint32_t h, const emscripten::val& bytes);
    bool loadFromRGBA(const emscripten::val& bytes);   // lienzo completo (width*height*4)
    void applyBrightness(int amount);                  // filtro dummy sobre tiles existentes

    // ── Dirty tracking ──
    void markRectDirty(int32_t x, int32_t y, uint32_t w, uint32_t h); // tras editar vía tilePtr()
    void markAllDirty();                                              // p.ej. tras perder el contexto GPU

    // Consume la lista de sucios: devuelve cuántos hay y prepara el buffer de descriptores.
    // Cada descriptor = 3 x uint32: [tx, ty, punteroAPíxeles]. Limpia las banderas dirty.
    uint32_t  flushDirty();
    uintptr_t dirtyDescPtr() const { return reinterpret_cast<uintptr_t>(desc_.data()); }

    // Acceso directo (herramientas/tests). 0 si el tile no existe (= totalmente transparente).
    uintptr_t tilePtr(int32_t tx, int32_t ty) const;

    // ── Uso interno C++ (compositor) ──
    // nullptr si el tile no existe (= transparente).
    const Tile* findTile(int32_t tx, int32_t ty) const;
    // Vuelca las coordenadas de los tiles sucios en `out` y limpia las banderas.
    // Alternativa a flushDirty() para consumidores C++ (no genera descriptores para JS).
    void takeDirty(std::vector<std::pair<int32_t, int32_t>>& out);

    // ── Historial (undo/redo) ──
    void setObserver(TileWriteObserver* o) { observer_ = o; }
    // Declara que se editará una región escribiendo directo en tilePtr(): crea los tiles que falten
    // y avisa al observador (el historial guarda aquí los píxeles previos). Luego llama a markRectDirty().
    void touchRect(int32_t x, int32_t y, uint32_t w, uint32_t h);
    // Intercambia los píxeles de un tile con `other` (nullptr = transparente). Marca el tile como sucio.
    // Es la base de undo/redo: aplicar un snapshot deja en él el estado que se acaba de reemplazar.
    bool swapTilePixels(int32_t tx, int32_t ty, std::unique_ptr<uint8_t[]>& other);

    // ── Lectura y herramientas ──
    // Copia una región a un Uint8Array de JS (RGBA8). Lo no existente sale transparente. Para guardar.
    bool readRectToJS(int32_t x, int32_t y, uint32_t w, uint32_t h, const emscripten::val& dst) const;
    // Pincel redondo con borde suave de 1 px. erase=false: "source-over" con (r,g,b,a); erase=true: reduce el alfa.
    // Avisa al historial y marca los tiles tocados como sucios.
    void stampDisc(float cx, float cy, float radius, int r, int g, int b, int a, bool erase);

private:
    static uint64_t key(int32_t tx, int32_t ty) {
        return (static_cast<uint64_t>(static_cast<uint32_t>(ty)) << 32) | static_cast<uint32_t>(tx);
    }
    Tile& getOrCreate(int32_t tx, int32_t ty);
    void  markDirty(Tile& t);

    uint32_t width_, height_, tilesX_, tilesY_;
    std::unordered_map<uint64_t, Tile> tiles_;  // dispersa: solo existen tiles con contenido
    std::vector<Tile*>   dirtyList_;            // sin duplicados (filtrado por Tile::dirty)
    TileWriteObserver*    observer_ = nullptr;  // historial (opcional)
    std::vector<uint32_t> desc_;                // buffer de descriptores leído por TS
};

} // namespace nvts
