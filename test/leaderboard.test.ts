// @vitest-environment node
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const MIN_POWERED_N = 30;
type LeaderboardRow = {
  system: string;
  dataset: string;
  claimLevel: string;
  n: number;
  narrativeMean: number;
  dangerousFabricationRate: number;
};
const results = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'leaderboard/results.json'), 'utf-8')) as { results: LeaderboardRow[] };

describe('leaderboard result tiers', () => {
  it('keeps ranked rows powered and sufficiently sampled', () => {
    const powered = results.results.filter((row) => row.claimLevel === 'powered');
    expect(powered.length).toBeGreaterThan(0);
    for (const row of powered) {
      expect(row.dataset).toBe('primock57');
      expect(row.n).toBeGreaterThanOrEqual(MIN_POWERED_N);
    }
  });

  it('keeps n=3 synthetic rows out of ranked evidence', () => {
    const synthetic = results.results.filter((row) => row.dataset === 'cases' || row.n < MIN_POWERED_N);
    expect(synthetic.length).toBeGreaterThan(0);
    for (const row of synthetic) {
      expect(row.claimLevel).toBe('smoke');
    }
  });

  it('does not let a smoke row win the powered board', () => {
    const byRank = (a: LeaderboardRow, b: LeaderboardRow) =>
      a.dangerousFabricationRate - b.dangerousFabricationRate ||
      b.narrativeMean - a.narrativeMean ||
      a.system.localeCompare(b.system);
    const top = results.results
      .filter((row) => row.claimLevel === 'powered' && row.n >= MIN_POWERED_N)
      .sort(byRank)[0];
    expect(top.dataset).toBe('primock57');
    expect(top.n).toBe(57);
  });
});
