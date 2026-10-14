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
     -fexceptions \
     -s WASM=1 \
     -s DEFAULT_TO_CXX=1 \
     -s ALLOW_MEMORY_GROWTH=1 \
     -s USE_PTHREADS=1 \
     -s PROXY_TO_PTHREAD=1 \
     -s EXIT_RUNTIME=0 \
     -s EXPORT_NAME="createNVTSEngine" \
     -o "$OUTPUT_DIR/nvts_engine.js"

echo "✅ ¡Compilación Wasm completada con éxito en $OUTPUT_DIR!"