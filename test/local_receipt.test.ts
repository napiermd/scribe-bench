// @ts-nocheck
import { describe, expect, it } from 'vitest';
import { detectLocalLeaks, runLocalReceipt } from '../site/local_receipt.js';

describe('browser local receipt', () => {
  it('catches the seeded fall-case head CT and syncope inventions without a model', () => {
    const source = 'Mechanical trip over a rug. No head strike. No loss of consciousness. Daughter drove her in.';
    const note = 'Assessment: fall with negative head CT. Plan includes syncope workup after EMS arrival.';
    const result = runLocalReceipt(source, note);

    expect(result.localResult).toBe(true);
    expect(result.provider).toBe('local');
    expect(result.fabrication.dangerous.join(' ')).toMatch(/head CT|head imaging/i);
    expect(result.fabrication.dangerous.join(' ')).toMatch(/syncope/i);
    expect(result.fabrication.dangerous.join(' ')).toMatch(/EMS|ambulance/i);
    expect(result.normalized).toBeLessThan(80);
  });

  it('does not flag a note that repeats a source negation as a positive claim', () => {
    const source = 'Patient denies chest pain and shortness of breath.';
    const note = 'ROS: denies chest pain. Denies shortness of breath.';
    const result = runLocalReceipt(source, note);

    expect(result.fabrication.dangerous).toEqual([]);
  });

  it('flags template leaks locally', () => {
    const leaks = detectLocalLeaks('Plan cms: keep *(value)* and *(dose)* in output.');

    expect(leaks.some((hit) => hit.marker === 'cms:')).toBe(true);
    expect(leaks.some((hit) => hit.marker.startsWith('raw-template-placeholders'))).toBe(true);
  });
});
