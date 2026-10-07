#!/usr/bin/env bash
# build.sh — Compila engine.cpp a WebAssembly (requiere emsdk activado).
# Uso: ./build.sh [debug]
set -euo pipefail

OUT_DIR="../wasm-bindings/build"
mkdir -p "$OUT_DIR"

# Optimización: -O3 en release, -O0 + símbolos en debug.
if [ "${1:-}" = "debug" ]; then OPT="-O0 -g"; else OPT="-O3 -flto"; fi

em++ src/*.cpp -Isrc -o "$OUT_DIR/engine.js" \
  $OPT -std=c++20 \
  -lembind \
  -msimd128 \
  -s MODULARIZE=1 \
  -s EXPORT_ES6=1 \
  -s EXPORT_NAME=createNvtsEngine \
  -s ENVIRONMENT=web,worker \
  -s ALLOW_MEMORY_GROWTH=1 \
  -s INITIAL_MEMORY=64MB \
  -s MAXIMUM_MEMORY=2GB \
  -s EXPORTED_RUNTIME_METHODS=HEAPU8 \
  -s NO_EXIT_RUNTIME=1

echo "OK -> $OUT_DIR/engine.js + engine.wasm"

# Notas:
#  -lembind                 : activa embind.
#  -msimd128                : SIMD de Wasm (auto-vectoriza el bucle de brillo).
#  EXPORT_ES6 + MODULARIZE  : permite `import createNvtsEngine from './engine.js'`.
#  ALLOW_MEMORY_GROWTH      : imprescindible para imágenes grandes (ver getHeapView).
#  EXPORTED_RUNTIME_METHODS : en versiones recientes de Emscripten, HEAPU8 debe
#                             exportarse explícitamente para poder usarlo desde TS.
#  Hilos (-pthread) se añadirán más adelante; requieren COOP/COEP.
