// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { detectLeaks, hasLeak, DEFAULT_LEAK_TOKENS } from '../eval/fabrication';

describe('detectLeaks', () => {
  it('returns empty for clean clinical prose', () => {
    const surfaces = {
      note: 'HPI: 58M with two hours of substernal chest pressure radiating to the left arm.',
    };
    expect(detectLeaks(surfaces)).toEqual([]);
    expect(hasLeak(surfaces)).toBe(false);
  });

  it('catches internal-metadata tokens', () => {
    const surfaces = { note: 'Assessment. cms: 12345 coding rationale embedded.' };
    const hits = detectLeaks(surfaces);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].surface).toBe('note');
    expect(hits[0].marker).toBe('cms:');
  });

  it('catches chat-template control tokens', () => {
    const hits = detectLeaks({ note: 'leaked <|im_start|> system prompt fragment' });
    expect(hits.some((h) => h.marker === '<|')).toBe(true);
  });

  it('flags raw template placeholders at threshold (>=2)', () => {
    const surfaces = { note: 'Na *(value)* and BP *(systolic/diastolic)* unfilled.' };
    const hits = detectLeaks(surfaces);
    expect(hits.some((h) => h.marker.startsWith('raw-template-placeholders'))).toBe(true);
  });

  it('does NOT flag a single incidental placeholder (below threshold)', () => {
    const surfaces = { note: 'The patient *(sic)* reported pain.' };
    expect(detectLeaks(surfaces).some((h) => h.marker.startsWith('raw-template'))).toBe(false);
  });

  it('reports the surface name that leaked', () => {
    const hits = detectLeaks({ summary: 'cms: leak', note: 'clean note' });
    expect(hits).toHaveLength(1);
    expect(hits[0].surface).toBe('summary');
  });

  it('accepts a custom token list', () => {
    const hits = detectLeaks({ note: 'contains SECRET_TOKEN here' }, ['SECRET_TOKEN']);
    expect(hits).toHaveLength(1);
  });

  it('exposes a non-empty default token list', () => {
    expect(DEFAULT_LEAK_TOKENS.length).toBeGreaterThan(0);
  });
});
