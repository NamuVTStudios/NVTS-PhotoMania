// compositor.h — Layer tree and dirty-tile composition into an output layer.
#pragma once
#include "tiled_layer.h"
#include "blend.h"
#include <memory>
#include <unordered_map>
#include <unordered_set>
#include <vector>

namespace nvts {

struct LayerNode {
    uint32_t id = 0;
    bool isGroup = false;
    bool visible = true;
    float opacity = 1.f;
    BlendMode blend = BlendMode::Normal;
    std::unique_ptr<TiledLayer> raster;
    std::vector<LayerNode*> children;
    LayerNode* parent = nullptr;
};

class Compositor {
public:
    Compositor(uint32_t width, uint32_t height);
    bool addGroup(uint32_t id, uint32_t parentId, int index);
    bool addRaster(uint32_t id, uint32_t parentId, int index);
    bool removeLayer(uint32_t id);
    bool moveLayer(uint32_t id, uint32_t newParentId, int index);
    bool setProps(uint32_t id, bool visible, float opacity, int blendMode);
    TiledLayer* layer(uint32_t id);
    TiledLayer* output() { return &output_; }
    void invalidateAll() { fullInvalidate_ = true; }
    uint32_t composite();

private:
    bool addNode(uint32_t id, uint32_t parentId, int index, bool isGroup);
    void link(LayerNode& parent, LayerNode* child, int index);
    void unlink(LayerNode* node);
    void eraseSubtree(LayerNode* node);
    bool containsAncestor(LayerNode* parent, const LayerNode* target) const;
    float* scratch(uint32_t depth);
    void renderGroup(const LayerNode& group, int32_t tx, int32_t ty, float* accumulator, uint32_t depth);
    void renderChild(const LayerNode& node, int32_t tx, int32_t ty, float* accumulator, uint32_t depth);
    void renderRasterChild(const LayerNode& node, int32_t tx, int32_t ty, float* accumulator);
    void renderGroupChild(const LayerNode& node, int32_t tx, int32_t ty, float* accumulator, uint32_t depth);
    void collectLayerDirtyTiles(LayerNode& node, std::unordered_set<uint64_t>& tiles,
                                std::vector<std::pair<int32_t, int32_t>>& dirty);
    void collectAllOutputTiles(std::unordered_set<uint64_t>& tiles);
    void collectOutputTileRow(std::unordered_set<uint64_t>& tiles, uint32_t ty);
    void compositeTile(uint64_t tileKey);

    uint32_t width_, height_;
    TiledLayer output_;
    std::unordered_map<uint32_t, std::unique_ptr<LayerNode>> nodes_;
    LayerNode* root_ = nullptr;
    bool fullInvalidate_ = true;
    std::vector<std::vector<float>> scratch_;
    std::vector<uint8_t> resolved_;
};

} // namespace nvts
