// compositor.cpp — Composición multicapa por tiles + bindings embind.

#include "compositor.h"
#include <emscripten/bind.h>
#include <algorithm>
#include <unordered_set>

using namespace emscripten;

namespace nvts {

namespace {

constexpr uint32_t PIXELS     = TILE_SIZE * TILE_SIZE;
constexpr size_t   ACC_FLOATS = static_cast<size_t>(PIXELS) * 4;
constexpr uint32_t MAX_DEPTH  = 16;   // límite de anidación de grupos (acota la memoria de scratch)

// Mezcla un tile raster (RGBA8 sin premultiplicar) sobre el acumulador float.
template <BlendMode M>
void blendRaster(float* acc, const uint8_t* src, float opacity) {
    constexpr float k = 1.f / 255.f;
    for (uint32_t i = 0; i < PIXELS; ++i) {
        const uint8_t* s = src + i * 4;
        if (s[3] == 0) continue;                         // píxel transparente: no aporta nada
        blendPixel<M>(acc + i * 4, s[0] * k, s[1] * k, s[2] * k, s[3] * k * opacity);
    }
}

// Mezcla el resultado de un grupo (acumulador float premultiplicado) sobre el acumulador padre.
template <BlendMode M>
void blendGroup(float* acc, const float* grp, float opacity) {
    for (uint32_t i = 0; i < PIXELS; ++i) {
        const float* g = grp + i * 4;
        if (g[3] <= 0.f) continue;
        const float inv = 1.f / g[3];                    // des-premultiplica para usarlo como fuente
        blendPixel<M>(acc + i * 4, g[0] * inv, g[1] * inv, g[2] * inv, g[3] * opacity);
    }
}

inline uint8_t to8(float v) {
    v = v < 0.f ? 0.f : (v > 1.f ? 1.f : v);
    return static_cast<uint8_t>(v * 255.f + 0.5f);
}

// Float premultiplicado -> RGBA8 sin premultiplicar (formato que espera el shader WGSL).
void resolve(const float* acc, uint8_t* out) {
    for (uint32_t i = 0; i < PIXELS; ++i) {
        const float* p = acc + i * 4;
        uint8_t* o = out + i * 4;
        if (p[3] <= 0.f) { o[0] = o[1] = o[2] = o[3] = 0; continue; }
        const float inv = 1.f / p[3];
        o[0] = to8(p[0] * inv); o[1] = to8(p[1] * inv); o[2] = to8(p[2] * inv); o[3] = to8(p[3]);
    }
}

} // namespace

// ── Estructura del árbol ──────────────────────────────────────────────────

Compositor::Compositor(uint32_t w, uint32_t h)
    : width_(w), height_(h), output_(w, h), resolved_(TILE_BYTES) {
    auto root = std::make_unique<LayerNode>();   // raíz implícita (id 0): un grupo
    root->isGroup = true;
    root_ = root.get();
    nodes_.emplace(0u, std::move(root));
}

void Compositor::link(LayerNode& parent, LayerNode* child, int index) {
    auto& c = parent.children;
    if (index < 0 || index >= static_cast<int>(c.size())) c.push_back(child);
    else c.insert(c.begin() + index, child);
    child->parent = &parent;
}

void Compositor::unlink(LayerNode* n) {
    auto& c = n->parent->children;
    c.erase(std::remove(c.begin(), c.end(), n), c.end());
    n->parent = nullptr;
}

bool Compositor::addNode(uint32_t id, uint32_t parentId, int index, bool isGroup) {
    if (id == 0 || nodes_.count(id)) return false;
    auto pit = nodes_.find(parentId);
    if (pit == nodes_.end() || !pit->second->isGroup) return false;
    auto n = std::make_unique<LayerNode>();
    n->id = id;
    n->isGroup = isGroup;
    if (!isGroup) n->raster = std::make_unique<TiledLayer>(width_, height_);
    link(*pit->second, n.get(), index);
    nodes_.emplace(id, std::move(n));
    invalidateAll();
    return true;
}

bool Compositor::addGroup (uint32_t id, uint32_t parentId, int index) { return addNode(id, parentId, index, true);  }
bool Compositor::addRaster(uint32_t id, uint32_t parentId, int index) { return addNode(id, parentId, index, false); }

void Compositor::eraseSubtree(LayerNode* n) {
    for (LayerNode* c : n->children) eraseSubtree(c);   // hijos primero
    nodes_.erase(n->id);                                // destruye el nodo y sus píxeles
}

bool Compositor::removeLayer(uint32_t id) {
    auto it = nodes_.find(id);
    if (id == 0 || it == nodes_.end()) return false;
    LayerNode* n = it->second.get();
    unlink(n);
    eraseSubtree(n);                                    // `it` y `n` ya no son válidos
    invalidateAll();
    return true;
}

bool Compositor::moveLayer(uint32_t id, uint32_t newParentId, int index) {
    auto nit = nodes_.find(id), pit = nodes_.find(newParentId);
    if (id == 0 || nit == nodes_.end() || pit == nodes_.end() || !pit->second->isGroup) return false;
    LayerNode* n = nit->second.get();
    for (LayerNode* p = pit->second.get(); p; p = p->parent)   // evita meter un grupo dentro de sí mismo
        if (p == n) return false;
    unlink(n);
    link(*pit->second, n, index);
    invalidateAll();
    return true;
}

bool Compositor::setProps(uint32_t id, bool visible, float opacity, int blendMode) {
    auto it = nodes_.find(id);
    if (it == nodes_.end() || id == 0) return false;
    LayerNode& n = *it->second;
    n.visible = visible;
    n.opacity = std::min(1.f, std::max(0.f, opacity));
    n.blend   = (blendMode >= 0 && blendMode <= 3) ? static_cast<BlendMode>(blendMode) : BlendMode::Normal;
    invalidateAll();   // cambiar propiedades afecta a toda la capa
    return true;
}

TiledLayer* Compositor::layer(uint32_t id) {
    auto it = nodes_.find(id);
    return (it == nodes_.end()) ? nullptr : it->second->raster.get();
}

// ── Composición ───────────────────────────────────────────────────────────

float* Compositor::scratch(uint32_t depth) {
    if (scratch_.size() <= depth) scratch_.resize(depth + 1);
    if (scratch_[depth].size() != ACC_FLOATS) scratch_[depth].assign(ACC_FLOATS, 0.f);
    return scratch_[depth].data();
}

// Compone los hijos del grupo `g` en `acc` (ya puesto a 0) para el tile (tx, ty).
// Orden: ABAJO -> ARRIBA, porque cada modo de fusión necesita el fondo ya acumulado.
void Compositor::renderGroup(const LayerNode& g, int32_t tx, int32_t ty, float* acc, uint32_t depth) {
    for (const LayerNode* n : g.children) {
        if (!n->visible || n->opacity <= 0.f) continue;

        if (!n->isGroup) {
            const Tile* t = n->raster->findTile(tx, ty);
            if (!t) continue;                                   // tile vacío: se salta sin coste
            const uint8_t* px = t->pixels.get();
            withBlend(n->blend, [&](auto m) { blendRaster<decltype(m)::value>(acc, px, n->opacity); });
        } else if (depth + 1 < MAX_DEPTH) {
            // Grupo aislado: se compone aparte y luego se mezcla como una sola "capa".
            float* tmp = scratch(depth + 1);
            std::fill(tmp, tmp + ACC_FLOATS, 0.f);
            renderGroup(*n, tx, ty, tmp, depth + 1);
            withBlend(n->blend, [&](auto m) { blendGroup<decltype(m)::value>(acc, tmp, n->opacity); });
        }
    }
}

uint32_t Compositor::composite() {
    auto key = [](int32_t tx, int32_t ty) {
        return (static_cast<uint64_t>(static_cast<uint32_t>(ty)) << 32) | static_cast<uint32_t>(tx);
    };

    // 1) Unión de tiles sucios de todas las capas raster (siempre se vacían sus listas).
    std::unordered_set<uint64_t> todo;
    std::vector<std::pair<int32_t, int32_t>> dirty;
    for (auto& [id, n] : nodes_) {
        if (!n->raster) continue;
        dirty.clear();
        n->raster->takeDirty(dirty);
        for (auto& [x, y] : dirty) todo.insert(key(x, y));
    }
    // 2) Cambio de estructura/propiedades: hay que recomponer todo el lienzo.
    if (fullInvalidate_) {
        fullInvalidate_ = false;
        for (uint32_t ty = 0; ty < output_.tilesY(); ++ty)
            for (uint32_t tx = 0; tx < output_.tilesX(); ++tx)
                todo.insert(key(static_cast<int32_t>(tx), static_cast<int32_t>(ty)));
    }

    // 3) Compone cada tile y escribe el resultado en el TiledLayer de salida.
    for (uint64_t k : todo) {
        const int32_t tx = static_cast<int32_t>(static_cast<uint32_t>(k));
        const int32_t ty = static_cast<int32_t>(k >> 32);

        float* acc = scratch(0);
        std::fill(acc, acc + ACC_FLOATS, 0.f);
        renderGroup(*root_, tx, ty, acc, 0);
        resolve(acc, resolved_.data());

        // writeRect recorta los tiles del borde, marca el tile de salida como sucio y
        // evita reservar memoria si el resultado es totalmente transparente.
        const uint32_t x0 = tx * TILE_SIZE, y0 = ty * TILE_SIZE;
        output_.writeRect(static_cast<int32_t>(x0), static_cast<int32_t>(y0),
                          std::min(TILE_SIZE, width_ - x0), std::min(TILE_SIZE, height_ - y0),
                          resolved_.data(), TILE_STRIDE);
    }
    return static_cast<uint32_t>(todo.size());
}

} // namespace nvts

// ── Bindings ──────────────────────────────────────────────────────────────
EMSCRIPTEN_BINDINGS(nvts_compositor) {
    class_<nvts::Compositor>("Compositor")
        .constructor<uint32_t, uint32_t>()
        .function("addGroup",      &nvts::Compositor::addGroup)
        .function("addRaster",     &nvts::Compositor::addRaster)
        .function("removeLayer",   &nvts::Compositor::removeLayer)
        .function("moveLayer",     &nvts::Compositor::moveLayer)
        .function("setProps",      &nvts::Compositor::setProps)
        .function("invalidateAll", &nvts::Compositor::invalidateAll)
        .function("composite",     &nvts::Compositor::composite)
        // Punteros no propietarios: el compositor es el dueño de la memoria.
        .function("layer",  &nvts::Compositor::layer,  allow_raw_pointers(), return_value_policy::reference())
        .function("output", &nvts::Compositor::output, allow_raw_pointers(), return_value_policy::reference());
}
