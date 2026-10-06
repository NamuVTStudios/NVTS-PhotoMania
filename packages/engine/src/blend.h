// blend.h — Modos de fusión y operador de composición (estilo W3C Compositing).
//
// Convenciones:
//  • Fuente (capa):  Cs = color SIN premultiplicar [0..1],  αs = alfa de la fuente * opacidad de capa.
//  • Acumulador (fondo): float RGBA PREMULTIPLICADO [Pb = Cb·αb, αb]. Se usa float para no perder
//    precisión entre capas; solo se cuantiza a 8 bits al final.
//
// Fórmula general (B = función de mezcla por canal):
//   αr = αs + αb·(1 − αs)
//   Pr = (1 − αs)·Pb + αs·(1 − αb)·Cs + αs·αb·B(Cb, Cs)      con  Cb = Pb / αb
// Con B = Cs se reduce al clásico "source-over":  Pr = Pb·(1−αs) + Cs·αs.
#pragma once
#include <type_traits>

namespace nvts {

// ¡Mantener sincronizado con BlendMode.ts! (los valores cruzan la frontera TS <-> C++)
enum class BlendMode : int { Normal = 0, Multiply = 1, Screen = 2, Overlay = 3 };

// B(Cb, Cs) por canal; cb = fondo, cs = fuente (ambos en [0..1], sin premultiplicar).
template <BlendMode M> inline float blendChannel(float cb, float cs);

template <> inline float blendChannel<BlendMode::Normal>(float, float cs)   { return cs; }
template <> inline float blendChannel<BlendMode::Multiply>(float cb, float cs) { return cb * cs; }              // oscurece
template <> inline float blendChannel<BlendMode::Screen>(float cb, float cs)   { return cb + cs - cb * cs; }    // aclara
template <> inline float blendChannel<BlendMode::Overlay>(float cb, float cs) {                                  // contraste
    return cb <= 0.5f ? 2.f * cb * cs : 1.f - 2.f * (1.f - cb) * (1.f - cs);
}

// Mezcla UN píxel fuente sobre el acumulador `d` (RGBA premultiplicado, 4 floats).
template <BlendMode M>
inline void blendPixel(float* d, float sr, float sg, float sb, float sa) {
    const float ab = d[3];
    if (ab <= 0.f) {                       // fondo vacío: el resultado es la propia fuente
        d[0] = sr * sa; d[1] = sg * sa; d[2] = sb * sa; d[3] = sa;
        return;
    }
    const float inv_ab = 1.f / ab;
    const float one_sa = 1.f - sa;
    const float cs[3] = { sr, sg, sb };
    for (int c = 0; c < 3; ++c) {
        const float cb = d[c] * inv_ab;                       // fondo sin premultiplicar
        const float B  = blendChannel<M>(cb, cs[c]);
        d[c] = one_sa * d[c] + sa * ((1.f - ab) * cs[c] + ab * B);
    }
    d[3] = sa + ab * one_sa;
}

// Convierte el modo (en tiempo de ejecución) a constante de compilación, para que el
// bucle interno de píxeles quede sin ramas ni llamadas indirectas.
template <typename F>
inline void withBlend(BlendMode m, F&& f) {
    switch (m) {
        case BlendMode::Multiply: f(std::integral_constant<BlendMode, BlendMode::Multiply>{}); break;
        case BlendMode::Screen:   f(std::integral_constant<BlendMode, BlendMode::Screen>{});   break;
        case BlendMode::Overlay:  f(std::integral_constant<BlendMode, BlendMode::Overlay>{});  break;
        default:                  f(std::integral_constant<BlendMode, BlendMode::Normal>{});   break;
    }
}

} // namespace nvts
