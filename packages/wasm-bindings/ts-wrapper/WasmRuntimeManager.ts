import { EngineClient } from './EngineClient';

/**
 * Singleton del runtime Wasm: comparte una única inicialización y EngineClient
 * por contexto JavaScript (por ejemplo, por hilo principal o por Worker).
 */
export class WasmRuntimeManager {
  private static instance: WasmRuntimeManager | null = null;
  private clientPromise: Promise<EngineClient> | null = null;
  private initializedWith: string | null = null;

  private constructor() {}

  static getInstance(): WasmRuntimeManager {
    if (!WasmRuntimeManager.instance) {
      WasmRuntimeManager.instance = new WasmRuntimeManager();
    }
    return WasmRuntimeManager.instance;
  }

  getEngine(wasmBaseUrl = '/wasm/'): Promise<EngineClient> {
    if (this.clientPromise) {
      if (this.initializedWith !== wasmBaseUrl) {
        throw new Error(
          `El runtime Wasm ya se inicializó con "${this.initializedWith}" y no puede reutilizarse con "${wasmBaseUrl}" en el mismo contexto.`,
        );
      }
      return this.clientPromise;
    }

    this.initializedWith = wasmBaseUrl;
    const pendingClient = EngineClient.create(wasmBaseUrl).catch((error: unknown) => {
      if (this.clientPromise === pendingClient) {
        this.clientPromise = null;
        this.initializedWith = null;
      }
      throw error;
    });
    this.clientPromise = pendingClient;
    return pendingClient;
  }
}
