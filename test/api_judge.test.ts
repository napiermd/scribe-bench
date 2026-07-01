// @vitest-environment node
import { describe, expect, it } from 'vitest';
// @ts-expect-error The Vercel API route is plain JS but still safe to import in Vitest.
import { MAX_CHARS, parseCompactJudgeText } from '../api/judge.js';

describe('parseCompactJudgeText', () => {
  it('parses compact fallback judge output', () => {
    const parsed = parseCompactJudgeText(`SCORES: storyCohesion=4; clinicalCompleteness=3; naturalFlow=4; absenceOfArtifacts=5; physicianReadability=4; inputFidelity=2
DANGEROUS: invented CT head | invented syncope workup
STANDARD: routine DVT prophylaxis
REASONING: The note is readable but invents care not supported by the source.`);

    expect(parsed.dimensions).toEqual({
      storyCohesion: 4,
      clinicalCompleteness: 3,
      naturalFlow: 4,
      absenceOfArtifacts: 5,
      physicianReadability: 4,
      inputFidelity: 2,
    });
    expect(parsed.fabrication.dangerous).toEqual(['invented CT head', 'invented syncope workup']);
    expect(parsed.fabrication.standard).toEqual(['routine DVT prophylaxis']);
    expect(parsed.reasoning).toContain('invents care');
  });

  it('treats none as an empty fabrication list', () => {
    const parsed = parseCompactJudgeText(`SCORES: story=5; clinical=4; flow=5; artifacts=5; readability=5; fidelity=5
DANGEROUS: none
STANDARD: none
REASONING: Faithful note.`);

    expect(parsed.fabrication.dangerous).toEqual([]);
    expect(parsed.fabrication.standard).toEqual([]);
  });

  it('keeps the live judge large enough for generated PriMock57 notes', () => {
    expect(MAX_CHARS).toBeGreaterThanOrEqual(60000);
  });
});
