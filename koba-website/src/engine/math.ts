/** Small numeric helpers. Standard operations, written for this engine — not lifted from a reference repo. */

export function dot(a: number[], b: number[]): number {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += a[i]! * b[i]!;
  return s;
}

export function norm(a: number[]): number {
  return Math.sqrt(dot(a, a));
}

export function cosine(a: number[], b: number[]): number {
  const d = norm(a) * norm(b);
  if (d < 1e-9) return 0;
  return dot(a, b) / d;
}

export function sigmoid(z: number): number {
  const x = Math.max(-12, Math.min(12, z));
  return 1 / (1 + Math.exp(-x));
}

export function softmax(values: number[], temperature: number): number[] {
  const t = Math.max(temperature, 1e-4);
  const m = Math.max(...values);
  const exps = values.map((v) => Math.exp((v - m) / t));
  const sum = exps.reduce((a, b) => a + b, 0) || 1;
  return exps.map((e) => e / sum);
}

export function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

export function mean(rows: number[][]): number[] {
  const dim = rows[0]?.length ?? 0;
  const acc = new Array(dim).fill(0);
  for (const row of rows) {
    for (let i = 0; i < dim; i++) acc[i] += row[i] ?? 0;
  }
  return acc.map((v) => v / rows.length);
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !STOP.has(t));
}

const STOP = new Set([
  "the",
  "and",
  "for",
  "with",
  "this",
  "that",
  "from",
  "into",
  "your",
  "you",
  "are",
  "was",
]);
