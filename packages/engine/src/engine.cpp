// engine.cpp — Núcleo mínimo de NVTS Photomania
// Compilar con Emscripten (ver build.sh). Expone ImageProcessor vía embind.

#include <emscripten/bind.h>
#include <emscripten/val.h>
#include <cstdint>
#include <cstddef>
#include <vector>
#include <algorithm>

using namespace emscripten;

class ImageProcessor {
public:
    // Reserva un buffer RGBA8 (4 bytes por píxel) inicializado a 0.
    ImageProcessor(uint32_t width, uint32_t height)
        : width_(width), height_(height),
          pixels_(static_cast<size_t>(width) * height * 4, 0) {}

    uint32_t width()  const { return width_; }
    uint32_t height() const { return height_; }
    size_t   byteLength() const { return pixels_.size(); }

    // Puntero (offset en memoria lineal de Wasm) al buffer de píxeles.
    // TS crea una vista sobre HEAPU8 sin copiar. ¡Invalidada si la memoria crece!
    uintptr_t dataPtr() { return reinterpret_cast<uintptr_t>(pixels_.data()); }

    // Copia datos desde JS (ej. ImageData.data) al buffer interno.
    void loadFromJS(const val& jsBytes) {
        const size_t n = std::min(pixels_.size(),
                                  static_cast<size_t>(jsBytes["length"].as<unsigned>()));
        // Copia directa JS -> memoria Wasm, sin pasos intermedios.
        val view = val(typed_memory_view(n, pixels_.data()));
        view.call<void>("set", jsBytes.call<val>("subarray", 0, static_cast<unsigned>(n)));
    }

    // Filtro dummy de brillo. amount en [-255, 255]. Alpha (canal 3) no se toca.
    void applyBrightness(int amount) {
        uint8_t* p = pixels_.data();
        const size_t total = pixels_.size();
        for (size_t i = 0; i < total; i += 4) {
            p[i]     = clamp8(p[i]     + amount); // R
            p[i + 1] = clamp8(p[i + 1] + amount); // G
            p[i + 2] = clamp8(p[i + 2] + amount); // B
        }
    }

private:
    static inline uint8_t clamp8(int v) {
        return static_cast<uint8_t>(v < 0 ? 0 : (v > 255 ? 255 : v));
    }

    uint32_t width_, height_;
    std::vector<uint8_t> pixels_;
};

// Registro de bindings: nombre del módulo = "NvtsEngine" (usado en engine.d.ts).
EMSCRIPTEN_BINDINGS(nvts_engine) {
    class_<ImageProcessor>("ImageProcessor")
        .constructor<uint32_t, uint32_t>()
        .function("width",           &ImageProcessor::width)
        .function("height",          &ImageProcessor::height)
        .function("byteLength",      &ImageProcessor::byteLength)
        .function("dataPtr",         &ImageProcessor::dataPtr)
        .function("loadFromJS",      &ImageProcessor::loadFromJS)
        .function("applyBrightness", &ImageProcessor::applyBrightness);
}
