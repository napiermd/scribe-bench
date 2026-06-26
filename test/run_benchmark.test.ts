// @vitest-environment node
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { aggregateRepeats, aggregate, datasetLabel, loadCases } from '../eval/run_benchmark';
import type { NarrativeResult, FabricationResult, CaseScore, NarrativeDimensions } from '../eval/types';

function dims(v: number): NarrativeDimensions {
  return { storyCohesion: v, clinicalCompleteness: v, naturalFlow: v, absenceOfArtifacts: v, physicianReadability: v, inputFidelity: v };
}
function narr(normalized: number, errored = false): NarrativeResult {
  return { total: 6, normalized, dimensions: dims(3), reasoning: 'r', errored };
}
function fab(hasDangerous: boolean, dangerous: string[] = [], errored = false): FabricationResult {
  return { hasFabrication: hasDangerous, hasDangerous, dangerous, standard: [], reasoning: 'r', errored };
}

describe('aggregateRepeats', () => {
  it('averages narrative across repeats and reports spread', () => {
    const r = aggregateRepeats([narr(60), narr(80), narr(70)], [fab(false), fab(false), fab(false)], []);
    expect(r.narrative.normalized).toBe(70);
    expect(r.narrativeSpread).toBeGreaterThan(0);
    expect(r.errored).toBe(false);
    expect(r.repeats).toBe(3);
  });

  it('majority-votes dangerous (2 of 3 → dangerous)', () => {
    const r = aggregateRepeats([narr(50), narr(50), narr(50)], [fab(true), fab(true), fab(false)], []);
    expect(r.fabrication.hasDangerous).toBe(true);
  });

  it('majority-votes dangerous (1 of 3 → not dangerous)', () => {
    const r = aggregateRepeats([narr(50), narr(50), narr(50)], [fab(true), fab(false), fab(false)], []);
    expect(r.fabrication.hasDangerous).toBe(false);
  });

  it('resolves a tie to dangerous (1 of 2 → dangerous, conservative)', () => {
    const r = aggregateRepeats([narr(50), narr(50)], [fab(true), fab(false)], []);
    expect(r.fabrication.hasDangerous).toBe(true);
  });

  it('unions dangerous items across flagging runs', () => {
    const r = aggregateRepeats([narr(50), narr(50)], [fab(true, ['ct head']), fab(true, ['syncope workup'])], []);
    expect(r.fabrication.dangerous.sort()).toEqual(['ct head', 'syncope workup']);
  });

  it('marks the case errored when all narrative repeats errored', () => {
    const r = aggregateRepeats([narr(0, true), narr(0, true)], [fab(false), fab(false)], []);
    expect(r.errored).toBe(true);
  });

  it('marks the case errored when all fabrication repeats errored', () => {
    const r = aggregateRepeats([narr(70), narr(70)], [fab(false, [], true), fab(false, [], true)], []);
    expect(r.errored).toBe(true);
  });

  it('uses only the non-errored repeats when some succeed', () => {
    const r = aggregateRepeats([narr(80), narr(0, true)], [fab(false), fab(false, [], true)], []);
    expect(r.narrative.normalized).toBe(80); // errored repeat excluded
    expect(r.errored).toBe(false);
  });
});

describe('aggregate', () => {
  const mk = (id: string, normalized: number, danger: boolean, leak: boolean, errored = false): CaseScore => ({
    caseId: id,
    narrative: narr(normalized, errored),
    fabrication: fab(danger, [], errored),
    leaks: leak ? [{ surface: 'note', marker: 'x', excerpt: '' }] : [],
    errored,
    repeats: 3,
    narrativeSpread: 0,
  });

  it('excludes errored cases from n and counts them in nErrored', () => {
    const a = aggregate('sys', 'ds', 'opus', 3, [mk('a', 70, false, false), mk('b', 0, false, false, true)]);
    expect(a.n).toBe(1);
    expect(a.nErrored).toBe(1);
  });

  it('computes rates over scored cases only', () => {
    const a = aggregate('sys', 'ds', 'opus', 3, [
      mk('a', 80, true, false),
      mk('b', 60, false, true),
    ]);
    expect(a.narrativeMean).toBe(70);
    expect(a.dangerousFabricationRate).toBe(0.5);
    expect(a.leakRate).toBe(0.5);
    expect(a.narrativeMeanCI.length).toBe(2);
    expect(a.dangerousFabricationRateCI.length).toBe(2);
  });
});

describe('loadCases', () => {
  it('throws when a case file is missing source', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-'));
    fs.writeFileSync(path.join(dir, 'bad.json'), JSON.stringify({ id: 'X', provenance: 'synthetic' }));
    expect(() => loadCases(dir)).toThrow(/needs at least/);
  });

  it('loads a valid case', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sb-'));
    fs.writeFileSync(path.join(dir, 'ok.json'), JSON.stringify({ id: 'X', source: 'hi', provenance: 'synthetic' }));
    const cases = loadCases(dir);
    expect(cases).toHaveLength(1);
    expect(cases[0].id).toBe('X');
  });
});

describe('datasetLabel', () => {
  it('labels PriMock57 case directories as primock57 for powered rows', () => {
    expect(datasetLabel('data/primock57/cases')).toBe('primock57');
  });

  it('keeps the synthetic smoke dataset label as cases', () => {
    expect(datasetLabel('data/synthetic/cases')).toBe('cases');
  });
});
