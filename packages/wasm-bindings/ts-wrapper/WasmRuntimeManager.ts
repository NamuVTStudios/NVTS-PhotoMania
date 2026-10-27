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
    if (!this.clientPromise) return this.initializeEngine(wasmBaseUrl);
    return this.reuseInitializedEngine(wasmBaseUrl);
  }

  private reuseInitializedEngine(wasmBaseUrl: string): Promise<EngineClient> {
    if (this.initializedWith !== wasmBaseUrl) throw this.createBaseUrlMismatchError(wasmBaseUrl);
    return this.clientPromise!;
  }

  private createBaseUrlMismatchError(wasmBaseUrl: string): Error {
    return new Error(
      `El runtime Wasm ya se inicializó con "${this.initializedWith}" y no puede reutilizarse con "${wasmBaseUrl}" en el mismo contexto.`,
    );
  }

  private initializeEngine(wasmBaseUrl: string): Promise<EngineClient> {
    this.initializedWith = wasmBaseUrl;
    const pendingClient = EngineClient.create(wasmBaseUrl).catch((error: unknown) => {
      this.resetFailedInitialization(pendingClient);
      throw error;
    });
    this.clientPromise = pendingClient;
    return pendingClient;
  }

  private resetFailedInitialization(pendingClient: Promise<EngineClient>): void {
    if (this.clientPromise !== pendingClient) return;
    this.clientPromise = null;
    this.initializedWith = null;
  }
}

