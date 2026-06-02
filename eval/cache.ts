/**
 * cache.ts — content-addressed cache for judge results (ET3).
 *
 * Key includes the judge kind, note, source, rubric version, judge model, AND the
 * repeat index — so re-running the SAME (case, model, repeat) returns the identical
 * score (reproducible leaderboard rows) while DIFFERENT repeats still capture the
 * judge's run-to-run variance (ET2). Errored results are never cached, so a transient
 * outage doesn't freeze a bad result.
 *
 * Disable with SCRIBEBENCH_NO_CACHE=1. Location: SCRIBEBENCH_CACHE_DIR or .scribebench-cache.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

const CACHE_DIR = process.env.SCRIBEBENCH_CACHE_DIR || '.scribebench-cache';
const ENABLED = !process.env.SCRIBEBENCH_NO_CACHE;

export function makeKey(parts: Record<string, string | number>): string {
  return crypto.createHash('sha256').update(JSON.stringify(parts)).digest('hex');
}

function fileFor(key: string): string {
  return path.join(CACHE_DIR, key.slice(0, 2), `${key}.json`);
}

export function readCache<T>(key: string): T | undefined {
  if (!ENABLED) return undefined;
  try {
    const f = fileFor(key);
    if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf-8')) as T;
  } catch {
    /* corrupt/unreadable cache entry — treat as miss */
  }
  return undefined;
}

export function writeCache(key: string, value: unknown): void {
  if (!ENABLED) return;
  try {
    const f = fileFor(key);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, JSON.stringify(value));
  } catch {
    /* cache write is best-effort */
  }
}
