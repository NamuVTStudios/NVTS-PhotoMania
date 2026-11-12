import '@nvts/shared-ui/styles/theme.css';
import '@nvts/shared-ui/styles/components.css';
import { App } from '@nvts/ui';
import './styles.css';

type StartupProjectPayload = { name: string; bytes: number[] };
type TauriWindow = Window & {
  __TAURI__?: { core?: { invoke: <T>(command: string) => Promise<T> } };
};

const root = document.getElementById('app')!;
const wasmBaseUrl = import.meta.env.BASE_URL + 'wasm/';

async function readStartupProject(): Promise<File | undefined> {
  const invoke = (window as TauriWindow).__TAURI__?.core?.invoke;
  if (!invoke) return undefined;

  const payload = await invoke<StartupProjectPayload | null>('take_startup_project');
  if (!payload) return undefined;

  const bytes = new Uint8Array(payload.bytes);
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return new File([buffer], payload.name, {
    type: 'application/x-nvtsphoto',
    lastModified: Date.now(),
  });
}

async function startApplication(): Promise<void> {
  try {
    const initialFile = await readStartupProject();
    await App.start(root, wasmBaseUrl, initialFile);
  } catch (error) {
    root.textContent = `No se pudo iniciar NVTS Photomania: ${error instanceof Error ? error.message : error}`;
    console.error(error);
  }
}

void startApplication();
