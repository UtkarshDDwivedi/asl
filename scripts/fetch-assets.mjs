import { copyFile, mkdir, rm, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const DOWNLOADS = [
  {
    dest: join(ROOT, 'public', 'models', 'model-meta.json'),
    url: 'https://shashank11yadav.github.io/GestureSign/models/model-meta.json',
    expectedBytes: 865,
  },
  {
    dest: join(ROOT, 'public', 'models', 'labels.json'),
    url: 'https://shashank11yadav.github.io/GestureSign/models/labels.json',
    expectedBytes: 35890,
  },
  {
    dest: join(ROOT, 'public', 'models', 'model.onnx'),
    url: 'https://shashank11yadav.github.io/GestureSign/models/model.onnx',
    expectedBytes: 5622355,
  },
  {
    dest: join(ROOT, 'public', 'vendor', 'mediapipe', 'models', 'holistic_landmarker.task'),
    url: 'https://storage.googleapis.com/mediapipe-models/holistic_landmarker/holistic_landmarker/float16/1/holistic_landmarker.task',
    expectedBytes: 13683609,
  },
];

const VENDOR_COPIES = [
  ['@mediapipe/tasks-vision/wasm/vision_wasm_module_internal.js', 'mediapipe/wasm'],
  ['@mediapipe/tasks-vision/wasm/vision_wasm_module_internal.wasm', 'mediapipe/wasm'],
  ['@mediapipe/tasks-vision/wasm/vision_wasm_internal.js', 'mediapipe/wasm'],
  ['@mediapipe/tasks-vision/wasm/vision_wasm_internal.wasm', 'mediapipe/wasm'],
  ['onnxruntime-web/dist/ort-wasm-simd-threaded.mjs', 'ort'],
  ['onnxruntime-web/dist/ort-wasm-simd-threaded.wasm', 'ort'],
];

async function fileSize(path) {
  try {
    return (await stat(path)).size;
  } catch {
    return -1;
  }
}

async function downloadFile(item) {
  const current = await fileSize(item.dest);
  if (current === item.expectedBytes) {
    console.log(`cached     ${item.dest}`);
    return;
  }
  await mkdir(dirname(item.dest), { recursive: true });
  const res = await fetch(item.url);
  if (!res.ok) throw new Error(`${item.url}: HTTP ${res.status}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.byteLength !== item.expectedBytes) {
    throw new Error(`${item.dest}: got ${buf.byteLength} bytes, expected ${item.expectedBytes}`);
  }
  const { writeFile } = await import('node:fs/promises');
  await writeFile(item.dest, buf);
  console.log(`downloaded ${item.dest} (${buf.byteLength} bytes)`);
}

async function copyVendor() {
  const vendorDir = join(ROOT, 'public', 'vendor');
  await rm(join(vendorDir, 'ort'), { recursive: true, force: true });
  for (const [source, folder] of VENDOR_COPIES) {
    const from = join(ROOT, 'node_modules', source);
    const to = join(vendorDir, folder, source.split('/').pop());
    await mkdir(dirname(to), { recursive: true });
    await copyFile(from, to);
  }
  console.log('copied     MediaPipe & ONNX Runtime WASM files to public/vendor/');
}

async function main() {
  await copyVendor();
  for (const item of DOWNLOADS) {
    await downloadFile(item);
  }
}

main().catch((err) => {
  console.error(`fetch-assets: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
