export const ASSETS = {
  mediapipeWasm: 'vendor/mediapipe/wasm',
  mediapipeModels: 'vendor/mediapipe/models/',
  ortRuntime: 'vendor/ort/',
  signModel: 'models/model.onnx',
  modelMeta: 'models/model-meta.json',
  labels: 'models/labels.json',
} as const;

export type AssetName = keyof typeof ASSETS;

export function assetUrl(
  name: AssetName,
  location: string = globalThis.location.href,
  base: string = import.meta.env.BASE_URL,
): string {
  if (!Object.prototype.hasOwnProperty.call(ASSETS, name)) {
    throw new Error(`unknown asset ${name}`);
  }
  const origin = new URL(location).origin;
  const normalizedBase = base.endsWith('/') ? base : `${base}/`;
  const url = new URL(`${normalizedBase}${ASSETS[name]}`, origin);
  if (url.origin !== origin) throw new Error(`${name} must load from the same origin as the page`);
  return url.href;
}
