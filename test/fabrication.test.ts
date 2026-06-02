// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { detectLeaks, hasLeak, DEFAULT_LEAK_TOKENS, extractFabricationJSON } from '../eval/fabrication';

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

describe('extractFabricationJSON', () => {
  it('splits dangerous and standard by severity', () => {
    const r = extractFabricationJSON('{"fabrications":[{"item":"x","severity":"dangerous"},{"item":"y","severity":"standard"}],"reasoning":"r"}');
    expect(r.dangerous).toEqual(['x']);
    expect(r.standard).toEqual(['y']);
    expect(r.reasoning).toBe('r');
  });

  it('defaults a bare-string fabrication to dangerous (never silently below the floor)', () => {
    const r = extractFabricationJSON('{"fabrications":["z"]}');
    expect(r.dangerous).toEqual(['z']);
  });

  it('defaults an unknown severity to dangerous', () => {
    const r = extractFabricationJSON('{"fabrications":[{"item":"q","severity":"banana"}]}');
    expect(r.dangerous).toEqual(['q']);
  });

  it('empty fabrications → faithful (both lists empty)', () => {
    const r = extractFabricationJSON('{"fabrications":[],"reasoning":"faithful"}');
    expect(r.dangerous).toEqual([]);
    expect(r.standard).toEqual([]);
  });
});
