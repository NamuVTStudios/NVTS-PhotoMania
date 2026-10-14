#!/bin/bash
# packages/engine/build.sh

# Salir inmediatamente si ocurre un error
set -e

echo "🚀 Iniciando compilación de NVTS Photomania Engine a WebAssembly..."

# Directorio de salida para los enlaces de Wasm
OUTPUT_DIR="../wasm-bindings/src"
mkdir -p $OUTPUT_DIR

# Compilación con Emscripten (emcc)
emcc src/engine.cpp \
     src/tiled_layer.cpp \
     src/compositor.cpp \
     src/history.cpp \
     -O3 \
     -std=c++17 \
     --bind \
     -s WASM=1 \
     -s ALLOW_MEMORY_GROWTH=1 \
     -s USE_PTHREADS=1 \
     -s PROXY_TO_PTHREAD=1 \
     -s EXIT_RUNTIME=0 \
     -s MODULARIZE=1 \
     -s EXPORT_NAME="createNVTSEngine" \
     -o "$OUTPUT_DIR/nvts_engine.js"

echo "✅ ¡Compilación Wasm completada con éxito en $OUTPUT_DIR!"


# Notas:
#  -lembind                 : activa embind.
#  -msimd128                : SIMD de Wasm (auto-vectoriza el bucle de brillo).
#  EXPORT_ES6 + MODULARIZE  : permite `import createNvtsEngine from './engine.js'`.
#  ALLOW_MEMORY_GROWTH      : imprescindible para imágenes grandes (ver getHeapView).
#  EXPORTED_RUNTIME_METHODS : en versiones recientes de Emscripten, HEAPU8 debe
#                             exportarse explícitamente para poder usarlo desde TS.
#  Hilos (-pthread) se añadirán más adelante; requieren COOP/COEP.
