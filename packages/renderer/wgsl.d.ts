// wgsl.d.ts — Permite `import code from './x.wgsl?raw'` con tipado en TypeScript.
declare module '*.wgsl?raw' {
  const source: string;
  export default source;
}
