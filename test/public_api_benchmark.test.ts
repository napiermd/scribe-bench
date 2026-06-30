// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  assertProgressConfig,
  buildCurrentRunStatus,
  caseScoreFromPublicApi,
  parseArgs,
  providerKeyHeaders,
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
      callerKeyForwarded: true,
    });

    expect(disclosure).toContain('Generator and judge are the same model');
    expect(disclosure).toContain('Raw generated notes are not published');
    expect(disclosure).toContain('caller-supplied provider key was forwarded');
  });

  it('maps local provider keys to public API headers without exposing values elsewhere', () => {
    expect(providerKeyHeaders('openrouter', { OPENROUTER_API_KEY: 'test-key' })).toEqual({
      'x-openrouter-key': 'test-key',
    });
    expect(providerKeyHeaders('baseten', { MY_BASETEN_KEY: 'bt-key' }, 'MY_BASETEN_KEY')).toEqual({
      'x-baseten-key': 'bt-key',
    });
    expect(providerKeyHeaders('openrouter', {})).toEqual({});
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

  it('builds a public current-run status receipt from partial progress', () => {
    const progress = {
      schemaVersion: 1 as const,
      baseUrl: 'https://scribe-bench.vercel.app',
      dataset: 'data/primock57/cases',
      system: 'openrouter-nemotron-3-ultra-public-api',
      provider: 'openrouter',
      generationModel: 'gen-model',
      judgeModel: 'judge-model',
      repeats: 1,
      startedAt: '2026-06-30T20:00:00.000Z',
      updatedAt: '2026-06-30T20:09:45.000Z',
      cases: {
        'PM57-d1c01': {
          caseId: 'PM57-d1c01',
          note: 'note',
          judgments: [judgment(0, 100)],
          errors: [],
        },
        'PM57-d1c02': {
          caseId: 'PM57-d1c02',
          note: 'note',
          judgments: [],
          errors: ['2026-06-30T20:09:42.175Z Rate limit exceeded: free-models-per-day'],
        },
      },
    };
    const selectedCases = [
      { id: 'PM57-d1c01', source: 'source 1', provenance: 'primock57' },
      { id: 'PM57-d1c02', source: 'source 2', provenance: 'primock57' },
    ];
    const scores = Object.values(progress.cases).map((record) => caseScoreFromPublicApi(record, 1));

    const status = buildCurrentRunStatus({
      progress,
      selectedCases,
      scores,
      targetCases: 57,
      baseUrl: 'https://scribe-bench.vercel.app',
      outPath: 'leaderboard/_public-api-pending.json',
      timeoutMs: 180000,
      keyEnv: 'OPENROUTER_API_KEY',
      updatedAt: '2026-07-01T00:00:00.000Z',
    });

    expect(status.status).toBe('needs-credit-or-second-judge');
    expect(status.selectedCases).toBe(2);
    expect(status.generatedCases).toBe(2);
    expect(status.scoredCases).toBe(1);
    expect(status.erroredCases).toBe(1);
    expect(status.lastScoredCase).toMatchObject({
      caseId: 'PM57-d1c01',
      normalized: 100,
      inputFidelity: 3,
    });
    expect(status.blocker).toContain('Blocked cases: PM57-d1c02');
    expect(status.blocker).toContain('Rate limit exceeded');
    expect(status.unblockAsk).toContain('This is not a model result yet: 1/2 attempted cases');
    expect(status.resumeCommand).toContain('--status-out site/current-run.json');
    expect(status.resumeCommand).toContain('--key-env OPENROUTER_API_KEY');
  });
});
