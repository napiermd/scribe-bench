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
    expect(result.evidence.dangerous.some((item) => /head CT|head imaging/i.test(item.finding) && /negative head CT/i.test(item.noteExcerpt) && /No head strike/i.test(item.sourceExcerpt))).toBe(true);
    expect(result.evidence.dangerous.some((item) => /syncope/i.test(item.finding) && /syncope workup/i.test(item.noteExcerpt) && /No loss of consciousness/i.test(item.sourceExcerpt))).toBe(true);
    expect(result.normalized).toBeLessThan(80);
  });

  it('does not treat CT head without contrast as a negated imaging claim', () => {
    const source = 'Mechanical fall. No head strike. No loss of consciousness.';
    const note = 'Data: CT head without contrast obtained after the fall, with no acute hemorrhage.';
    const result = runLocalReceipt(source, note);

    expect(result.fabrication.dangerous.join(' ')).toMatch(/head CT|head imaging/i);
  });

  it('does not flag a note that repeats a source negation as a positive claim', () => {
    const source = 'Patient denies chest pain and shortness of breath.';
    const note = 'ROS: denies chest pain. Denies shortness of breath.';
    const result = runLocalReceipt(source, note);

    expect(result.fabrication.dangerous).toEqual([]);
  });

  it('catches age, sex, and laterality mismatches without a model', () => {
    const source = '79-year-old woman with right hip pain after a fall.';
    const note = 'HPI: 89-year-old man with left hip pain after a fall.';
    const result = runLocalReceipt(source, note);
    const dangerous = result.fabrication.dangerous.join(' ');

    expect(dangerous).toMatch(/age differs/i);
    expect(dangerous).toMatch(/sex\/gender differs/i);
    expect(dangerous).toMatch(/laterality differs for hip/i);
    expect(result.evidence.dangerous.some((item) => /age differs/i.test(item.finding) && /79-year-old woman/i.test(item.sourceExcerpt) && /89-year-old man/i.test(item.noteExcerpt))).toBe(true);
    expect(result.evidence.dangerous.some((item) => /sex\/gender differs/i.test(item.finding) && /woman/i.test(item.sourceExcerpt) && /man/i.test(item.noteExcerpt))).toBe(true);
    expect(result.evidence.dangerous.some((item) => /laterality differs for hip/i.test(item.finding) && /right hip/i.test(item.sourceExcerpt) && /left hip/i.test(item.noteExcerpt))).toBe(true);
  });

  it('catches allergy contradictions without a model', () => {
    const source = 'Allergies: penicillin causes rash.';
    const note = 'Allergies: NKDA.';
    const result = runLocalReceipt(source, note);

    expect(result.fabrication.dangerous.join(' ')).toMatch(/no known allergies.*penicillin|penicillin.*no known allergies/i);
    expect(result.evidence.dangerous.some((item) => /allerg/i.test(item.finding) && /penicillin causes rash/i.test(item.sourceExcerpt) && /NKDA/i.test(item.noteExcerpt))).toBe(true);
  });

  it('catches unsupported treatment inventions without a model', () => {
    const source = [
      'Clinic visit for viral upper respiratory symptoms.',
      'Afebrile. Lungs clear.',
      'Clinician recommended rest, oral hydration, and acetaminophen as needed.',
      'No antibiotics were given. No IV fluids were given.',
    ].join(' ');
    const note = 'Plan: started azithromycin and administered IV normal saline bolus in clinic.';
    const result = runLocalReceipt(source, note);
    const dangerous = result.fabrication.dangerous.join(' ');

    expect(dangerous).toMatch(/antibiotic treatment/i);
    expect(dangerous).toMatch(/IV fluid treatment/i);
    expect(result.evidence.dangerous.some((item) => /antibiotic treatment/i.test(item.finding) && /azithromycin/i.test(item.noteExcerpt) && /No antibiotics were given/i.test(item.sourceExcerpt))).toBe(true);
    expect(result.evidence.dangerous.some((item) => /IV fluid treatment/i.test(item.finding) && /normal saline/i.test(item.noteExcerpt) && /No IV fluids were given/i.test(item.sourceExcerpt))).toBe(true);
  });

  it('does not flag treatments when the source supports them or the note repeats a negation', () => {
    const supported = runLocalReceipt(
      'Patient received azithromycin and one liter of IV normal saline for pneumonia with dehydration.',
      'Treatment: azithromycin was started and IV normal saline was administered.'
    );
    const negated = runLocalReceipt(
      'Viral URI. No antibiotics were given.',
      'Assessment: viral URI. No antibiotics were given.'
    );

    expect(supported.fabrication.dangerous).toEqual([]);
    expect(negated.fabrication.dangerous).toEqual([]);
  });

  it('does not flag matching demographics, laterality, and allergy facts', () => {
    const source = '62-year-old woman with right knee pain. No known drug allergies.';
    const note = '62-year-old woman with right knee pain. Allergies: NKDA.';
    const result = runLocalReceipt(source, note);

    expect(result.fabrication.dangerous).toEqual([]);
  });

  it('flags template leaks locally', () => {
    const leaks = detectLocalLeaks('Plan cms: keep *(value)* and *(dose)* in output.');

    expect(leaks.some((hit) => hit.marker === 'cms:')).toBe(true);
    expect(leaks.some((hit) => hit.marker.startsWith('raw-template-placeholders'))).toBe(true);
  });
});
