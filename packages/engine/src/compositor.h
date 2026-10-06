// compositor.h — Árbol de capas + composición por tiles sucios hacia un TiledLayer de salida.
#pragma once
#include "tiled_layer.h"
#include "blend.h"
#include <memory>
#include <unordered_map>
#include <vector>

namespace nvts {

// Nodo del árbol. Capa raster (con píxeles) o grupo (con hijos).
struct LayerNode {
    uint32_t  id = 0;
    bool      isGroup = false;
    bool      visible = true;
    float     opacity = 1.f;                       // [0..1]
    BlendMode blend   = BlendMode::Normal;
    std::unique_ptr<TiledLayer> raster;            // solo capas raster
    std::vector<LayerNode*>     children;          // índice 0 = abajo, último = arriba
    LayerNode*                  parent = nullptr;
};

class Compositor {
public:
    Compositor(uint32_t width, uint32_t height);

    // ── Estructura (el id lo asigna TS; 0 está reservado para la raíz) ──
    // index: posición entre los hermanos (0 = abajo); <0 o fuera de rango = arriba del todo.
    bool addGroup (uint32_t id, uint32_t parentId, int index);
    bool addRaster(uint32_t id, uint32_t parentId, int index);
    bool removeLayer(uint32_t id);                                 // borra también sus hijos
    bool moveLayer(uint32_t id, uint32_t newParentId, int index);  // reordenar / cambiar de grupo
    bool setProps(uint32_t id, bool visible, float opacity, int blendMode);

    // Capa raster por id (nullptr si no existe o es un grupo). Propiedad del compositor:
    // JS NO debe llamar delete() sobre lo que devuelve.
    TiledLayer* layer(uint32_t id);
    // Buffer de salida compuesto (RGBA8 sin premultiplicar): se sube a WebGPU con flushDirtyTiles().
    TiledLayer* output() { return &output_; }

    void invalidateAll() { fullInvalidate_ = true; }  // recomponer todo en el próximo composite()

    // Recompone SOLO los tiles sucios (de cualquier capa) y escribe el resultado en output().
    // Devuelve cuántos tiles se recompusieron.
    uint32_t composite();

private:
    bool addNode(uint32_t id, uint32_t parentId, int index, bool isGroup);
    void link(LayerNode& parent, LayerNode* child, int index);
    void unlink(LayerNode* n);
    void eraseSubtree(LayerNode* n);
    float* scratch(uint32_t depth);
    void renderGroup(const LayerNode& g, int32_t tx, int32_t ty, float* acc, uint32_t depth);

    uint32_t width_, height_;
    TiledLayer output_;                                            // resultado final
    std::unordered_map<uint32_t, std::unique_ptr<LayerNode>> nodes_;
    LayerNode* root_ = nullptr;
    bool fullInvalidate_ = true;                                   // la 1ª vez se compone todo
    std::vector<std::vector<float>> scratch_;                      // acumuladores float por profundidad
    std::vector<uint8_t> resolved_;                                // tile final RGBA8 (256 KiB)
};

} // namespace nvts
