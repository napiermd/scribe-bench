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

  it('catches unsupported medication changes without a model', () => {
    const source = [
      'Primary care visit for elevated blood pressure.',
      'Patient takes lisinopril 10 mg daily.',
      'No medication changes were made today.',
      'Continue home medications and follow up in one month.',
    ].join(' ');
    const note = 'Assessment: hypertension. Plan: start amlodipine 5 mg daily and stop lisinopril. Follow up in one month.';
    const result = runLocalReceipt(source, note);
    const dangerous = result.fabrication.dangerous.join(' ');

    expect(dangerous).toMatch(/medication change/i);
    expect(result.evidence.dangerous.some((item) => /medication change/i.test(item.finding) && /start amlodipine/i.test(item.noteExcerpt) && /No medication changes were made/i.test(item.sourceExcerpt))).toBe(true);
  });

  it('catches unsupported medication prescriptions when the source gives no medication support', () => {
    const source = 'Visit for mild back strain. Recommended heat, stretching, and physical therapy. No prescriptions were provided.';
    const note = 'Plan: prescribe gabapentin at bedtime and continue physical therapy.';
    const result = runLocalReceipt(source, note);

    expect(result.fabrication.dangerous.join(' ')).toMatch(/medication change/i);
    expect(result.evidence.dangerous.some((item) => /medication change/i.test(item.finding) && /gabapentin/i.test(item.noteExcerpt) && /No prescriptions were provided/i.test(item.sourceExcerpt))).toBe(true);
  });

  it('does not flag supported or negated medication-change language', () => {
    const supported = runLocalReceipt(
      'Hypertension follow-up. Amlodipine was started and lisinopril was stopped because of cough.',
      'Plan: start amlodipine and stop lisinopril due to cough.'
    );
    const negated = runLocalReceipt(
      'Hypertension follow-up. No medication changes were made today.',
      'No medication changes were made today.'
    );

    expect(supported.fabrication.dangerous).toEqual([]);
    expect(negated.fabrication.dangerous).toEqual([]);
  });

  it('catches unsupported diagnosis escalations without a model', () => {
    const source = [
      'Clinic visit for cough and congestion.',
      'Patient is afebrile, oxygen saturation 99%, lungs clear.',
      'Clinician assessed likely viral upper respiratory infection.',
      'No pneumonia diagnosed. No sepsis or systemic infection.',
    ].join(' ');
    const note = 'Assessment: community-acquired pneumonia with early sepsis.';
    const result = runLocalReceipt(source, note);
    const dangerous = result.fabrication.dangerous.join(' ');

    expect(dangerous).toMatch(/pneumonia diagnosis/i);
    expect(dangerous).toMatch(/sepsis diagnosis/i);
    expect(result.evidence.dangerous.some((item) => /pneumonia diagnosis/i.test(item.finding) && /pneumonia/i.test(item.noteExcerpt) && /No pneumonia diagnosed/i.test(item.sourceExcerpt))).toBe(true);
    expect(result.evidence.dangerous.some((item) => /sepsis diagnosis/i.test(item.finding) && /sepsis/i.test(item.noteExcerpt) && /No sepsis/i.test(item.sourceExcerpt))).toBe(true);
  });

  it('does not flag supported, negated, or rule-out diagnosis language', () => {
    const supported = runLocalReceipt(
      'Chest x-ray showed right lower lobe pneumonia.',
      'Assessment: community-acquired pneumonia.'
    );
    const negated = runLocalReceipt(
      'Viral URI. No pneumonia diagnosed.',
      'Assessment: viral URI. No pneumonia.'
    );
    const ruleOut = runLocalReceipt(
      'Cough with clear lungs. Chest x-ray pending.',
      'Assessment: rule out pneumonia.'
    );

    expect(supported.fabrication.dangerous).toEqual([]);
    expect(negated.fabrication.dangerous).toEqual([]);
    expect(ruleOut.fabrication.dangerous).toEqual([]);
  });

  it('catches unsupported care-plan imaging orders and referrals without a model', () => {
    const source = [
      'Urgent care visit for right ankle sprain.',
      'No x-ray was ordered.',
      'No orthopedic referral was placed.',
      'Patient was discharged home with rest, ice, compression, elevation, and return precautions.',
    ].join(' ');
    const note = [
      'Assessment: right ankle sprain.',
      'Plan: ankle x-ray ordered and orthopedic referral placed.',
      'Patient discharged home with RICE instructions and return precautions.',
    ].join(' ');
    const result = runLocalReceipt(source, note);
    const dangerous = result.fabrication.dangerous.join(' ');

    expect(dangerous).toMatch(/imaging order/i);
    expect(dangerous).toMatch(/specialist referral/i);
    expect(result.evidence.dangerous.some((item) => /imaging order/i.test(item.finding) && /x-ray ordered/i.test(item.noteExcerpt) && /No x-ray was ordered/i.test(item.sourceExcerpt))).toBe(true);
    expect(result.evidence.dangerous.some((item) => /specialist referral/i.test(item.finding) && /orthopedic referral placed/i.test(item.noteExcerpt) && /No orthopedic referral was placed/i.test(item.sourceExcerpt))).toBe(true);
  });

  it('catches unsupported lab orders and admission or ED-transfer escalation without a model', () => {
    const source = [
      'Clinic visit for mild viral symptoms.',
      'No labs were ordered.',
      'Patient was discharged home with supportive care and return precautions.',
    ].join(' ');
    const note = 'Plan: CBC and troponin ordered, and patient transferred to the ED for hospital admission.';
    const result = runLocalReceipt(source, note);
    const dangerous = result.fabrication.dangerous.join(' ');

    expect(dangerous).toMatch(/lab order/i);
    expect(dangerous).toMatch(/hospital admission or ED transfer/i);
    expect(result.evidence.dangerous.some((item) => /lab order/i.test(item.finding) && /CBC and troponin ordered/i.test(item.noteExcerpt) && /No labs were ordered/i.test(item.sourceExcerpt))).toBe(true);
    expect(result.evidence.dangerous.some((item) => /hospital admission or ED transfer/i.test(item.finding) && /transferred to the ED/i.test(item.noteExcerpt) && /discharged home/i.test(item.sourceExcerpt))).toBe(true);
  });

  it('does not flag supported or negated care-plan actions', () => {
    const supported = runLocalReceipt(
      'X-ray was ordered, CBC was ordered, orthopedic referral placed, and patient transferred to the ED for admission.',
      'Plan: x-ray ordered, CBC ordered, orthopedic referral placed, and transferred to the ED for admission.'
    );
    const negated = runLocalReceipt(
      'No x-ray was ordered. No orthopedic referral was placed. No labs were ordered. Patient discharged home.',
      'No x-ray was ordered. No orthopedic referral was placed. No labs were ordered. Patient discharged home.'
    );

    expect(supported.fabrication.dangerous).toEqual([]);
    expect(negated.fabrication.dangerous).toEqual([]);
  });

  it('catches unsupported lab and imaging results without a model', () => {
    const source = [
      'Urgent care visit for right ankle pain after twisting injury.',
      'Exam showed mild swelling and intact pulses.',
      'No labs were obtained.',
      'No x-ray was performed.',
      'Patient was treated as a sprain with rest, ice, compression, elevation, and return precautions.',
    ].join(' ');
    const note = [
      'Assessment: right ankle sprain.',
      'Data: CBC showed WBC 15.2 and ankle x-ray showed no fracture.',
      'Plan: RICE and return precautions.',
    ].join(' ');
    const result = runLocalReceipt(source, note);
    const dangerous = result.fabrication.dangerous.join(' ');

    expect(dangerous).toMatch(/lab result/i);
    expect(dangerous).toMatch(/imaging result/i);
    expect(result.evidence.dangerous.some((item) => /lab result/i.test(item.finding) && /CBC showed WBC 15\.2/i.test(item.noteExcerpt) && /No labs were obtained/i.test(item.sourceExcerpt))).toBe(true);
    expect(result.evidence.dangerous.some((item) => /imaging result/i.test(item.finding) && /x-ray showed no fracture/i.test(item.noteExcerpt) && /No x-ray was performed/i.test(item.sourceExcerpt))).toBe(true);
  });

  it('catches unsupported ECG results without a model', () => {
    const source = 'Clinic visit for intermittent chest discomfort. No ECG was performed. No troponin was drawn.';
    const note = 'Data: ECG showed normal sinus rhythm and troponin was negative.';
    const result = runLocalReceipt(source, note);
    const dangerous = result.fabrication.dangerous.join(' ');

    expect(dangerous).toMatch(/ECG result/i);
    expect(dangerous).toMatch(/lab result/i);
    expect(result.evidence.dangerous.some((item) => /ECG result/i.test(item.finding) && /ECG showed normal sinus rhythm/i.test(item.noteExcerpt) && /No ECG was performed/i.test(item.sourceExcerpt))).toBe(true);
    expect(result.evidence.dangerous.some((item) => /lab result/i.test(item.finding) && /troponin was negative/i.test(item.noteExcerpt) && /No troponin was drawn/i.test(item.sourceExcerpt))).toBe(true);
  });

  it('does not flag supported or negated test-result language', () => {
    const supported = runLocalReceipt(
      'CBC showed WBC 15.2. Ankle x-ray showed no fracture. ECG showed normal sinus rhythm.',
      'Data: CBC showed WBC 15.2, ankle x-ray showed no fracture, and ECG showed normal sinus rhythm.'
    );
    const negated = runLocalReceipt(
      'No labs were obtained. No x-ray was performed. No ECG was performed.',
      'No labs were obtained. No x-ray was performed. No ECG was performed.'
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
