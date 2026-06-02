/**
 * stats.ts — pure statistics for the harness. Deterministic, unit-tested.
 *
 * - mean / stdev: per-case repeat aggregation + spread (ET2).
 * - bootstrapCI: 95% confidence interval on a metric across cases (E8). Uses a
 *   SEEDED PRNG so the CI is reproducible run-to-run — a leaderboard's error bars
 *   shouldn't move just because you re-rendered them.
 */

import type { CI } from './types';

export function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

/** Sample standard deviation (n-1). 0 for fewer than 2 points. */
export function stdev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
}

/** Deterministic PRNG (mulberry32) so bootstrap CIs are reproducible. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 95% bootstrap CI (percentile method) on the mean of `xs`.
 * Empty → [0,0]; single point → [x,x]. Seeded for reproducibility.
 */
export function bootstrapCI(
  xs: number[],
  opts?: { B?: number; seed?: number; alpha?: number },
): CI {
  if (xs.length === 0) return [0, 0];
  if (xs.length === 1) return [xs[0], xs[0]];
  const B = opts?.B ?? 1000;
  const alpha = opts?.alpha ?? 0.05;
  const rng = mulberry32(opts?.seed ?? 0x5c81be);
  const means: number[] = [];
  for (let b = 0; b < B; b++) {
    let s = 0;
    for (let i = 0; i < xs.length; i++) s += xs[Math.floor(rng() * xs.length)];
    means.push(s / xs.length);
  }
  means.sort((a, b) => a - b);
  const lo = means[Math.floor((alpha / 2) * B)];
  const hi = means[Math.min(B - 1, Math.floor((1 - alpha / 2) * B))];
  return [round2(lo), round2(hi)];
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}
