import { createPixiApplication, loadPixiJS } from '@nvts/shared-core/libraries/pixijs';
import type { PixiApplication, PixiApplicationOptions } from '@nvts/shared-core/libraries/pixijs';

let pixiRuntimePromise: ReturnType<typeof loadPixiJS> | undefined;

/** Creates an asynchronously initialized PixiJS application using the Shared Core runtime. */
export async function createSharedCorePixiApplication(
  options: PixiApplicationOptions = {},
): Promise<PixiApplication> {
  pixiRuntimePromise ??= loadPixiJS();
  await pixiRuntimePromise;
  const application = createPixiApplication();
  await application.init(options);
  return application;
}

export function resetSharedCorePixiRuntimeForTests(): void {
  pixiRuntimePromise = undefined;
}
