export interface Landmark {
  x: number;
  y: number;
  z: number;
}

export type RecognitionMode = 'fingerspell' | 'asl-words';

export interface RecognitionResult {
  sign: string;
  confidence: number;
  type: 'letter' | 'gesture' | 'number' | 'word';
  description?: string;
  handedness?: 'Left' | 'Right';
}

export interface WordGuess {
  index: number;
  sign: string;
  label: string;
  lookup: string;
  probability: number;
}

export type WordPipelineStatus = 'loading' | 'ready' | 'signing' | 'thinking' | 'error';

export type FramingStatus = 'nothing' | 'no-hands' | 'crowded' | 'partial' | 'ok';

export interface WordPredictionEvent {
  kind: 'recognized' | 'not-sure' | 'discarded';
  top: WordGuess[];
  logits?: Float32Array;
  reason?: 'low-confidence' | 'partial';
  inferenceMs?: number;
  durationMs?: number;
}

export interface SignGuideItem {
  symbol: string;
  name: string;
  category: 'alphabet' | 'number' | 'gesture' | 'word';
  description: string;
  tips: string;
  emoji?: string;
  lookupUrl?: string;
  heldOutTop1?: number | null;
}
