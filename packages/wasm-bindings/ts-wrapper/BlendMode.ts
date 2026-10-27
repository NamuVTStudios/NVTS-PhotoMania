// BlendMode.ts — Espejo del enum C++ `nvts::BlendMode` (blend.h). Mantener sincronizados.

export const BlendMode = { Normal: 0, Multiply: 1, Screen: 2, Overlay: 3 } as const;
export type BlendModeValue = (typeof BlendMode)[keyof typeof BlendMode];
export type BlendModeManifestName = 'normal' | 'multiply' | 'screen' | 'overlay';

const BLEND_MODE_VALUE_BY_NAME: Record<BlendModeManifestName, BlendModeValue> = {
  normal: BlendMode.Normal,
  multiply: BlendMode.Multiply,
  screen: BlendMode.Screen,
  overlay: BlendMode.Overlay,
};

const BLEND_MODE_NAME_BY_VALUE: Record<BlendModeValue, BlendModeManifestName> = {
  [BlendMode.Normal]: 'normal',
  [BlendMode.Multiply]: 'multiply',
  [BlendMode.Screen]: 'screen',
  [BlendMode.Overlay]: 'overlay',
};

/** Convierte el string del manifest .nvtsphoto al valor numérico del motor. */
export function blendModeFromManifest(name: string): BlendModeValue {
  if (!Object.prototype.hasOwnProperty.call(BLEND_MODE_VALUE_BY_NAME, name)) return BlendMode.Normal;
  return BLEND_MODE_VALUE_BY_NAME[name as BlendModeManifestName];
}

/** Convierte el valor numérico del motor a la etiqueta estable del manifest. */
export function blendModeToManifest(value: number): BlendModeManifestName {
  return BLEND_MODE_NAME_BY_VALUE[value as BlendModeValue] ?? 'normal';
}

/* Flujo completo (compositor -> GPU):

const comp = new mod.Compositor(1024, 1024);

comp.addRaster(1, 0, -1);                        // capa base, en la raíz
comp.addRaster(2, 0, -1);                        // capa encima
comp.setProps(2, true, 0.8, BlendMode.Multiply); // 80 % de opacidad, modo Multiplicar

comp.layer(1)!.loadFromRGBA(fondoRGBA);          // escribir píxeles marca tiles sucios
comp.layer(2)!.writeRectFromJS(100, 100, 64, 64, pincelRGBA);

comp.composite();                                // recompone SOLO los tiles sucios
flushDirtyTiles(mod, comp.output(), uploadTile); // sube SOLO los tiles de salida que cambiaron
renderer.render();

// Cambiar opacidad/modo/orden/visibilidad invalida todo: el siguiente composite() recompone el lienzo.
*/
