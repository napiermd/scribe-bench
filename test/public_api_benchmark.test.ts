// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  assertProgressConfig,
  caseScoreFromPublicApi,
  parseArgs,
  publicApiDisclosure,
  slugify,
} from '../scripts/run_public_api_benchmark';

const dims = {
  storyCohesion: 5,
  clinicalCompleteness: 4,
  naturalFlow: 5,
  absenceOfArtifacts: 5,
  physicianReadability: 4,
  inputFidelity: 3,
};

function judgment(repeat: number, normalized: number, dangerous: string[] = []) {
  return {
    repeat,
    model: 'judge-model',
    provider: 'openrouter',
    dimensions: dims,
    total: 26,
    normalized,
    fabrication: {
      dangerous,
      standard: [],
    },
    reasoning: 'reviewed',
    scoredAt: '2026-06-30T00:00:00.000Z',
  };
}

describe('public API benchmark helpers', () => {
  it('parses CLI-style args with boolean flags', () => {
    expect(parseArgs(['--dataset', 'data/primock57/cases', '--dry-run'])).toEqual({
      dataset: 'data/primock57/cases',
      'dry-run': 'true',
    });
  });

  it('builds filesystem-safe slugs', () => {
    expect(slugify('OpenRouter: Nemotron 3 Ultra / Public API')).toBe('openrouter-nemotron-3-ultra-public-api');
  });

  it('converts public API judgments into CaseScore with repeat spread', () => {
    const score = caseScoreFromPublicApi({
      caseId: 'PM57-d1c01',
      note: 'HPI...',
      judgments: [
        judgment(0, 80, ['invented CT']),
        judgment(1, 60),
      ],
      errors: [],
    }, 2);

    expect(score.errored).toBe(false);
    expect(score.narrative.normalized).toBe(70);
    expect(score.narrativeSpread).toBeGreaterThan(0);
    expect(score.fabrication.hasDangerous).toBe(true);
    expect(score.leaks).toEqual([]);
  });

  it('fails closed when a case is incomplete', () => {
    const score = caseScoreFromPublicApi({
      caseId: 'PM57-d1c01',
      note: 'HPI...',
      judgments: [judgment(0, 80)],
      errors: ['missing repeat'],
    }, 2);

    expect(score.errored).toBe(true);
    expect(score.repeats).toBe(1);
  });

  it('discloses self-judged public-path evidence', () => {
    const disclosure = publicApiDisclosure({
      baseUrl: 'https://scribe-bench.vercel.app',
      provider: 'openrouter',
      generationModel: 'model-a',
      judgeModel: 'model-a',
      repeats: 1,
      n: 57,
      nErrored: 0,
    });

    expect(disclosure).toContain('Generator and judge are the same model');
    expect(disclosure).toContain('Raw generated notes are not published');
  });

  it('rejects progress files from a different judge configuration', () => {
    const seed = {
      schemaVersion: 1 as const,
      baseUrl: 'https://scribe-bench.vercel.app',
      dataset: 'data/primock57/cases',
      system: 'sys',
      provider: 'openrouter',
      generationModel: 'gen-a',
      judgeModel: 'judge-a',
      repeats: 1,
    };
    const progress = {
      ...seed,
      judgeModel: 'judge-b',
      startedAt: '2026-06-30T00:00:00.000Z',
      updatedAt: '2026-06-30T00:00:00.000Z',
      cases: {},
    };

    expect(() => assertProgressConfig(progress, seed)).toThrow(/different public API run/);
  });
});
