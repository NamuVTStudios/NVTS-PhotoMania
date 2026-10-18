// compositor.cpp — Multi-layer tiled composition and embind bindings.

#include "compositor.h"
#include <emscripten/bind.h>
#include <algorithm>

using namespace emscripten;

namespace nvts {
namespace {

constexpr uint32_t PIXELS = TILE_SIZE * TILE_SIZE;
constexpr size_t ACC_FLOATS = static_cast<size_t>(PIXELS) * 4;
constexpr uint32_t MAX_DEPTH = 16;

uint64_t makeTileKey(int32_t tx, int32_t ty) {
    return (static_cast<uint64_t>(static_cast<uint32_t>(ty)) << 32) | static_cast<uint32_t>(tx);
}

template <BlendMode M>
void blendRasterPixel(float* accumulator, const uint8_t* pixel, float opacity) {
    if (pixel[3] == 0) return;
    constexpr float scale = 1.f / 255.f;
    blendPixel<M>(accumulator, pixel[0] * scale, pixel[1] * scale,
                  pixel[2] * scale, pixel[3] * scale * opacity);
}

template <BlendMode M>
void blendRaster(float* accumulator, const uint8_t* source, float opacity) {
    for (uint32_t i = 0; i < PIXELS; ++i) blendRasterPixel<M>(accumulator + i * 4, source + i * 4, opacity);
}

template <BlendMode M>
void blendGroupPixel(float* accumulator, const float* pixel, float opacity) {
    if (pixel[3] <= 0.f) return;
    const float inverseAlpha = 1.f / pixel[3];
    blendPixel<M>(accumulator, pixel[0] * inverseAlpha, pixel[1] * inverseAlpha,
                  pixel[2] * inverseAlpha, pixel[3] * opacity);
}

template <BlendMode M>
void blendGroup(float* accumulator, const float* group, float opacity) {
    for (uint32_t i = 0; i < PIXELS; ++i) blendGroupPixel<M>(accumulator + i * 4, group + i * 4, opacity);
}

uint8_t to8(float value) {
    value = value < 0.f ? 0.f : (value > 1.f ? 1.f : value);
    return static_cast<uint8_t>(value * 255.f + 0.5f);
}

void resolvePixel(const float* source, uint8_t* destination) {
    if (source[3] <= 0.f) {
        destination[0] = destination[1] = destination[2] = destination[3] = 0;
        return;
    }
    const float inverseAlpha = 1.f / source[3];
    destination[0] = to8(source[0] * inverseAlpha);
    destination[1] = to8(source[1] * inverseAlpha);
    destination[2] = to8(source[2] * inverseAlpha);
    destination[3] = to8(source[3]);
}

void resolve(const float* accumulator, uint8_t* output) {
    for (uint32_t i = 0; i < PIXELS; ++i) resolvePixel(accumulator + i * 4, output + i * 4);
}

} // namespace

Compositor::Compositor(uint32_t width, uint32_t height)
    : width_(width), height_(height), output_(width, height), resolved_(TILE_BYTES) {
    auto root = std::make_unique<LayerNode>();
    root->isGroup = true;
    root_ = root.get();
    nodes_.emplace(0u, std::move(root));
}

void Compositor::link(LayerNode& parent, LayerNode* child, int index) {
    auto& children = parent.children;
    const bool append = index < 0 || index >= static_cast<int>(children.size());
    if (append) children.push_back(child);
    else children.insert(children.begin() + index, child);
    child->parent = &parent;
}

void Compositor::unlink(LayerNode* node) {
    auto& children = node->parent->children;
    children.erase(std::remove(children.begin(), children.end(), node), children.end());
    node->parent = nullptr;
}

bool Compositor::addNode(uint32_t id, uint32_t parentId, int index, bool isGroup) {
    if (id == 0 || nodes_.count(id)) return false;
    auto parentIt = nodes_.find(parentId);
    if (parentIt == nodes_.end() || !parentIt->second->isGroup) return false;
    auto node = std::make_unique<LayerNode>();
    node->id = id;
    node->isGroup = isGroup;
    if (!isGroup) node->raster = std::make_unique<TiledLayer>(width_, height_);
    link(*parentIt->second, node.get(), index);
    nodes_.emplace(id, std::move(node));
    invalidateAll();
    return true;
}

bool Compositor::addGroup(uint32_t id, uint32_t parentId, int index) {
    return addNode(id, parentId, index, true);
}

bool Compositor::addRaster(uint32_t id, uint32_t parentId, int index) {
    return addNode(id, parentId, index, false);
}

void Compositor::eraseSubtree(LayerNode* node) {
    for (LayerNode* child : node->children) eraseSubtree(child);
    nodes_.erase(node->id);
}

bool Compositor::removeLayer(uint32_t id) {
    auto it = nodes_.find(id);
    if (id == 0 || it == nodes_.end()) return false;
    LayerNode* node = it->second.get();
    unlink(node);
    eraseSubtree(node);
    invalidateAll();
    return true;
}

bool Compositor::containsAncestor(LayerNode* parent, const LayerNode* target) const {
    bool found = false;
    for (LayerNode* current = parent; current; current = current->parent) found = found || current == target;
    return found;
}

bool Compositor::moveLayer(uint32_t id, uint32_t newParentId, int index) {
    auto nodeIt = nodes_.find(id);
    auto parentIt = nodes_.find(newParentId);
    if (id == 0 || nodeIt == nodes_.end() || parentIt == nodes_.end() || !parentIt->second->isGroup) return false;
    LayerNode* node = nodeIt->second.get();
    if (containsAncestor(parentIt->second.get(), node)) return false;
    unlink(node);
    link(*parentIt->second, node, index);
    invalidateAll();
    return true;
}

bool Compositor::setProps(uint32_t id, bool visible, float opacity, int blendMode) {
    auto it = nodes_.find(id);
    if (it == nodes_.end() || id == 0) return false;
    LayerNode& node = *it->second;
    node.visible = visible;
    node.opacity = std::min(1.f, std::max(0.f, opacity));
    node.blend = (blendMode >= 0 && blendMode <= 3)
        ? static_cast<BlendMode>(blendMode) : BlendMode::Normal;
    invalidateAll();
    return true;
}

TiledLayer* Compositor::layer(uint32_t id) {
    auto it = nodes_.find(id);
    return it == nodes_.end() ? nullptr : it->second->raster.get();
}

float* Compositor::scratch(uint32_t depth) {
    if (scratch_.size() <= depth) scratch_.resize(depth + 1);
    if (scratch_[depth].size() != ACC_FLOATS) scratch_[depth].assign(ACC_FLOATS, 0.f);
    return scratch_[depth].data();
}

void Compositor::renderGroup(const LayerNode& group, int32_t tx, int32_t ty,
                             float* accumulator, uint32_t depth) {
    for (const LayerNode* node : group.children) renderChild(*node, tx, ty, accumulator, depth);
}

void Compositor::renderChild(const LayerNode& node, int32_t tx, int32_t ty,
                             float* accumulator, uint32_t depth) {
    if (!node.visible || node.opacity <= 0.f) return;
    if (!node.isGroup) {
        renderRasterChild(node, tx, ty, accumulator);
        return;
    }
    if (depth + 1 >= MAX_DEPTH) return;
    renderGroupChild(node, tx, ty, accumulator, depth);
}

void Compositor::renderRasterChild(const LayerNode& node, int32_t tx, int32_t ty, float* accumulator) {
    const Tile* tile = node.raster->findTile(tx, ty);
    if (!tile) return;
    const uint8_t* pixels = tile->pixels.get();
    withBlend(node.blend, [&](auto mode) {
        blendRaster<decltype(mode)::value>(accumulator, pixels, node.opacity);
    });
}

void Compositor::renderGroupChild(const LayerNode& node, int32_t tx, int32_t ty,
                                  float* accumulator, uint32_t depth) {
    float* temporary = scratch(depth + 1);
    std::fill(temporary, temporary + ACC_FLOATS, 0.f);
    renderGroup(node, tx, ty, temporary, depth + 1);
    withBlend(node.blend, [&](auto mode) {
        blendGroup<decltype(mode)::value>(accumulator, temporary, node.opacity);
    });
}

void Compositor::collectLayerDirtyTiles(LayerNode& node, std::unordered_set<uint64_t>& tiles,
                                        std::vector<std::pair<int32_t, int32_t>>& dirty) {
    if (!node.raster) return;
    dirty.clear();
    node.raster->takeDirty(dirty);
    for (const auto& point : dirty) tiles.insert(makeTileKey(point.first, point.second));
}

void Compositor::collectAllOutputTiles(std::unordered_set<uint64_t>& tiles) {
    for (uint32_t ty = 0; ty < output_.tilesY(); ++ty) collectOutputTileRow(tiles, ty);
}

void Compositor::collectOutputTileRow(std::unordered_set<uint64_t>& tiles, uint32_t ty) {
    for (uint32_t tx = 0; tx < output_.tilesX(); ++tx) {
        tiles.insert(makeTileKey(static_cast<int32_t>(tx), static_cast<int32_t>(ty)));
    }
}

void Compositor::compositeTile(uint64_t encodedKey) {
    const int32_t tx = static_cast<int32_t>(static_cast<uint32_t>(encodedKey));
    const int32_t ty = static_cast<int32_t>(encodedKey >> 32);
    float* accumulator = scratch(0);
    std::fill(accumulator, accumulator + ACC_FLOATS, 0.f);
    renderGroup(*root_, tx, ty, accumulator, 0);
    resolve(accumulator, resolved_.data());
    const uint32_t x0 = static_cast<uint32_t>(tx) * TILE_SIZE;
    const uint32_t y0 = static_cast<uint32_t>(ty) * TILE_SIZE;
    output_.writeRect(static_cast<int32_t>(x0), static_cast<int32_t>(y0),
                      std::min(TILE_SIZE, width_ - x0), std::min(TILE_SIZE, height_ - y0),
                      resolved_.data(), TILE_STRIDE);
}

uint32_t Compositor::composite() {
    std::unordered_set<uint64_t> tiles;
    std::vector<std::pair<int32_t, int32_t>> dirty;
    for (auto& entry : nodes_) collectLayerDirtyTiles(*entry.second, tiles, dirty);
    if (fullInvalidate_) {
        fullInvalidate_ = false;
        collectAllOutputTiles(tiles);
    }
    for (uint64_t tile : tiles) compositeTile(tile);
    return static_cast<uint32_t>(tiles.size());
}

} // namespace nvts

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
        .function("layer",  &nvts::Compositor::layer,  allow_raw_pointers(), return_value_policy::reference())
        .function("output", &nvts::Compositor::output, allow_raw_pointers(), return_value_policy::reference());
}
