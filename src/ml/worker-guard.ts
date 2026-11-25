export function isTrustedOrigin(origin: string, ownOrigin: string): boolean {
  return origin === '' || origin === ownOrigin;
}

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function isCount(v: unknown, max: number): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= max;
}

export type Parsed<In, Out> =
  | { ok: true; message: In }
  | { ok: false; reply: Out | null };
