import {
  HAND_CONNECTIONS,
  LEFT_HAND_START,
  LIPS,
  N_HAND,
  POSE_CONNECTIONS,
  POSE_START,
  RIGHT_HAND_START,
  type Frame,
} from '../ml/landmarks';
import { dictionaryUrl, type ModelMeta, type SignLabel } from '../ml/meta';
import { ModelClient } from '../ml/model-client';
import { Recognizer, type RecognizerEvent } from '../ml/recognizer';
import { TrackerClient, type TrackerFrame } from '../ml/tracker-client';
import type { FramingStatus, WordGuess, WordPredictionEvent } from '../types';

export interface AslWordsCallbacks {
  onReady: (meta: ModelMeta, labels: SignLabel[], delegate: 'GPU' | 'CPU') => void;
  onError: (message: string) => void;
  onFramingStatus: (status: FramingStatus) => void;
  onSigningStart: () => void;
  onClassifying: () => void;
  onPrediction: (event: WordPredictionEvent) => void;
  onFrameLandmarks: (frame: Frame, trackerMs: number) => void;
}

/**
 * Coordinates the MediaPipe Holistic worker and the ONNX 250-word ASL classifier worker.
 */
export class AslWordsEngine {
  private modelClient: ModelClient | null = null;
  private trackerClient: TrackerClient | null = null;
  private recognizer: Recognizer | null = null;
  private meta: ModelMeta | null = null;
  private labels: SignLabel[] = [];
  private disposed = false;
  private minConfidence: number | undefined;

  async start(
    video: HTMLVideoElement,
    callbacks: AslWordsCallbacks,
    minConfidence?: number,
  ): Promise<void> {
    this.disposed = false;
    this.minConfidence = minConfidence;
    try {
      const loaded = await ModelClient.load();
      if (this.disposed) {
        loaded.client.dispose();
        return;
      }
      this.modelClient = loaded.client;
      this.meta = loaded.meta;
      this.labels = loaded.labels;

      const tracker = await TrackerClient.create(loaded.meta.featureSet);
      if (this.disposed) {
        tracker.dispose();
        loaded.client.dispose();
        return;
      }
      this.trackerClient = tracker;

      this.recognizer = new Recognizer(
        loaded.meta,
        loaded.labels,
        (input) => loaded.client.infer(input),
        (event: RecognizerEvent) => this.handleRecognizerEvent(event, callbacks),
        this.minConfidence,
      );

      callbacks.onReady(loaded.meta, loaded.labels, tracker.delegate);

      tracker.start(video, (tracked: TrackerFrame) => {
        if (this.disposed) return;
        callbacks.onFrameLandmarks(tracked.frame, tracked.ms);
        this.recognizer?.push(tracked);
      });
    } catch (err) {
      if (!this.disposed) {
        callbacks.onError(err instanceof Error ? err.message : String(err));
      }
    }
  }

  setMinConfidence(value: number | undefined): void {
    this.minConfidence = value;
    this.recognizer?.setMinConfidence(value);
  }

  resetSegmenter(): void {
    this.recognizer?.reset();
  }

  flush(): void {
    this.recognizer?.flush();
  }

  getMeta(): ModelMeta | null {
    return this.meta;
  }

  getLabels(): SignLabel[] {
    return this.labels;
  }

  dispose(): void {
    this.disposed = true;
    this.trackerClient?.dispose();
    this.trackerClient = null;
    this.modelClient?.dispose();
    this.modelClient = null;
    this.recognizer?.reset();
    this.recognizer = null;
  }

  private handleRecognizerEvent(event: RecognizerEvent, callbacks: AslWordsCallbacks): void {
    if (this.disposed) return;
    switch (event.type) {
      case 'status':
        callbacks.onFramingStatus(event.status);
        break;
      case 'signing':
        callbacks.onSigningStart();
        break;
      case 'classifying':
        callbacks.onClassifying();
        break;
      case 'discarded':
        callbacks.onPrediction({
          kind: 'discarded',
          top: [],
          discardReason: event.reason,
        });
        break;
      case 'error':
        callbacks.onError(event.message);
        break;
      case 'result': {
        const { decision, inference, segment } = event.result;
        const top: WordGuess[] = decision.top.map((g) => {
          const entry = this.labels[g.index];
          return {
            index: g.index,
            sign: entry?.sign ?? `#${g.index}`,
            label: entry?.label ?? entry?.sign ?? `#${g.index}`,
            lookup: entry?.lookup ?? entry?.sign ?? '',
            probability: g.probability,
          };
        });
        callbacks.onPrediction({
          kind: decision.kind === 'sign' ? 'recognized' : 'not-sure',
          top,
          logits: inference.logits,
          reason: decision.reason,
          durationMs: segment.durationMs,
        });
        break;
      }
    }
  }
}

/**
 * Draw MediaPipe Holistic upper-body pose, lip contour, and both hands onto a canvas.
 */
export function drawHolisticFrame(
  ctx: CanvasRenderingContext2D,
  frame: Frame,
  width: number,
  height: number,
  isMirrored = true,
): void {
  const px = (idx: number) => {
    const rawX = frame[idx * 3];
    if (rawX === undefined || !Number.isFinite(rawX)) return null;
    return isMirrored ? (1 - rawX) * width : rawX * width;
  };
  const py = (idx: number) => {
    const rawY = frame[idx * 3 + 1];
    if (rawY === undefined || !Number.isFinite(rawY)) return null;
    return rawY * height;
  };

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Upper body pose skeleton
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.55)';
  for (const [a, b] of POSE_CONNECTIONS) {
    const x1 = px(POSE_START + a);
    const y1 = py(POSE_START + a);
    const x2 = px(POSE_START + b);
    const y2 = py(POSE_START + b);
    if (x1 === null || y1 === null || x2 === null || y2 === null) continue;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  // Lips dots
  ctx.fillStyle = 'rgba(56, 189, 248, 0.75)';
  for (const idx of LIPS) {
    const x = px(idx);
    const y = py(idx);
    if (x === null || y === null) continue;
    ctx.beginPath();
    ctx.arc(x, y, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  // Hands (Left & Right)
  for (const handStart of [LEFT_HAND_START, RIGHT_HAND_START]) {
    ctx.lineWidth = 3;
    for (const [a, b] of HAND_CONNECTIONS) {
      const x1 = px(handStart + a);
      const y1 = py(handStart + a);
      const x2 = px(handStart + b);
      const y2 = py(handStart + b);
      if (x1 === null || y1 === null || x2 === null || y2 === null) continue;
      const grad = ctx.createLinearGradient(x1, y1, x2, y2);
      grad.addColorStop(0, '#6366f1');
      grad.addColorStop(1, '#06b6d4');
      ctx.strokeStyle = grad;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }

    for (let i = 0; i < N_HAND; i++) {
      const x = px(handStart + i);
      const y = py(handStart + i);
      if (x === null || y === null) continue;
      const isTip = i === 4 || i === 8 || i === 12 || i === 16 || i === 20;
      const isWrist = i === 0;
      ctx.beginPath();
      ctx.arc(x, y, isTip ? 5.5 : isWrist ? 6.5 : 3.5, 0, Math.PI * 2);
      ctx.fillStyle = isTip ? '#f43f5e' : isWrist ? '#ec4899' : '#38bdf8';
      ctx.fill();
    }
  }

  ctx.restore();
}

export async function fetchAllAslLabels(): Promise<SignLabel[]> {
  const res = await fetch(`${import.meta.env.BASE_URL}models/labels.json`);
  if (!res.ok) throw new Error(`Failed to load 250-word ASL labels (HTTP ${res.status})`);
  const raw = (await res.json()) as { signs?: SignLabel[] };
  if (!Array.isArray(raw.signs)) throw new Error('Invalid labels.json format');
  return raw.signs;
}

export { dictionaryUrl };
