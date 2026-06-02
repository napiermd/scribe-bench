// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { mean, stdev, bootstrapCI } from '../eval/stats';

describe('mean', () => {
  it('averages', () => expect(mean([2, 4, 6])).toBe(4));
  it('empty → 0', () => expect(mean([])).toBe(0));
});

describe('stdev', () => {
  it('is 0 for fewer than 2 points', () => {
    expect(stdev([])).toBe(0);
    expect(stdev([5])).toBe(0);
  });
  it('is 0 for identical values', () => expect(stdev([3, 3, 3])).toBe(0));
  it('computes sample stdev (n-1)', () => {
    // [2,4,6]: mean 4, sumsq=8, /(3-1)=4, sqrt=2
    expect(stdev([2, 4, 6])).toBeCloseTo(2, 6);
  });
});

describe('bootstrapCI', () => {
  it('empty → [0,0]', () => expect(bootstrapCI([])).toEqual([0, 0]));
  it('single point → [x,x]', () => expect(bootstrapCI([42])).toEqual([42, 42]));

  it('is deterministic across calls (seeded)', () => {
    const xs = [60, 70, 75, 80, 50, 90, 65];
    expect(bootstrapCI(xs)).toEqual(bootstrapCI(xs));
  });

  it('brackets the sample mean', () => {
    const xs = [60, 70, 75, 80, 50, 90, 65];
    const m = mean(xs);
    const [lo, hi] = bootstrapCI(xs);
    expect(lo).toBeLessThanOrEqual(m);
    expect(hi).toBeGreaterThanOrEqual(m);
  });

  it('a rate of all-zeros has a [0,0] CI', () => {
    expect(bootstrapCI([0, 0, 0, 0])).toEqual([0, 0]);
  });
});
