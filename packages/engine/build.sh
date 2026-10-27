#!/bin/bash
# packages/engine/build.sh

# Salir inmediatamente si ocurre un error
set -e

echo "🚀 Iniciando compilación de NVTS Photomania Engine a WebAssembly..."

# El módulo de bindings importa estos nombres desde packages/wasm-bindings/build.
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/../.." && pwd)"
OUTPUT_DIR="$REPO_ROOT/packages/wasm-bindings/build"
mkdir -p "$OUTPUT_DIR"

# Compilación con Emscripten (emcc)
emcc "$SCRIPT_DIR/src/engine.cpp" \
     "$SCRIPT_DIR/src/tiled_layer.cpp" \
     "$SCRIPT_DIR/src/compositor.cpp" \
     "$SCRIPT_DIR/src/history.cpp" \
     -O3 \
     -std=c++17 \
     --bind \
     -fexceptions \
     -s WASM=1 \
     -s DEFAULT_TO_CXX=1 \
     -s ALLOW_MEMORY_GROWTH=1 \
     -s EXIT_RUNTIME=0 \
     -s ENVIRONMENT=web,worker,node \
     -s MODULARIZE=1 \
     -s EXPORT_ES6=1 \
     -s EXPORT_NAME="createNvtsEngine" \
     -o "$OUTPUT_DIR/engine.js"

echo "✅ ¡Compilación Wasm completada con éxito en $OUTPUT_DIR!"
