/**
 * narrative_judge.ts — 6-dimension narrative quality judge.
 *
 * Scores a clinical note the way a physician reads one: story, completeness,
 * natural flow, absence of artifacts, signability, and fidelity to the source.
 *
 * Calibrated against blind physician A/B preference. In our production data,
 * binary structural checks correlate with physician preference at rho=-0.077
 * (not significant) — i.e. structural completeness is NOT what physicians
 * prefer. A frontier LLM-as-judge on this rubric reaches rho>0.6. That gap is
 * the reason this benchmark scores narrative quality, not checkbox structure.
 *
 * The judge backend is pluggable — see ./llm.ts.
 */

import { callJudge } from './llm';
import { extractJsonObject } from './json';
import type { NarrativeDimensions, NarrativeResult } from './types';

/** Bump when NARRATIVE_RUBRIC_SYSTEM changes, so the judge cache invalidates. */
export const NARRATIVE_RUBRIC_VERSION = 'v1';

const NARRATIVE_RUBRIC_SYSTEM = `You are a board-certified physician evaluating clinical documentation quality. You have 20+ years of experience reading and writing clinical notes. You evaluate notes the way a physician would — you care about clinical reasoning, diagnostic precision, and whether the note tells a story another physician can act on.

You score 6 dimensions, each 1-5. You MUST respond with valid JSON only.

Response format:
{
  "dimensions": {
    "story_cohesion": <1-5>,
    "clinical_completeness": <1-5>,
    "natural_flow": <1-5>,
    "absence_of_artifacts": <1-5>,
    "physician_readability": <1-5>,
    "input_fidelity": <1-5>
  },
  "reasoning": "2-4 sentences. Name the specific strengths and problems you found."
}

## DIMENSION 1: Story Cohesion (1-5)
Does the history tell the patient's story as a coherent clinical narrative?
- 5: Reads like a physician handing off the patient. Clear timeline: onset -> progression -> presentation -> workup -> current state. The reader immediately grasps the clinical picture and urgency.
- 4: Good narrative, minor gaps. Timeline mostly clear; one abrupt transition.
- 3: Facts present but assembled as a list, not a story. Data dump. Or muddled timeline you must read twice.
- 2: Fragmented. Key parts out of order. Hard to follow.
- 1: No coherent narrative. History missing or reduced to one sentence.

## DIMENSION 2: Clinical Completeness (1-5)
Are all clinically relevant findings present AND interpreted? Is the exam adequate?
- 5: All relevant history, exam, labs, imaging present AND connected to reasoning. Pertinent negatives are real (in the encounter), not fabricated. Findings are INTERPRETED ("CT showed X concerning for Y"), not just listed.
- 4: Most relevant info present; one minor omission; findings generally interpreted.
- 3: Key findings present but underinterpreted. Labs listed but not connected. Or exam thin (3-4 systems, normal templates without patient-specific findings).
- 2: Significant gaps. Major findings missing or uninterpreted. Or skeletal exam (1-3 lines).
- 1: Critically incomplete. Missing major sections.
A skeletal exam (fewer than 5 documented systems) caps this dimension at 2.

## DIMENSION 3: Natural Flow (1-5) — THE MOST IMPORTANT DIMENSION
Does this read like a physician wrote it? Is the clinical reasoning sound and precise?
- 5: Reads like a physician dictated it. Reasoning embedded naturally ("Given the elevated troponin and dynamic ECG changes, NSTEMI is the working diagnosis"). Precise terminology — never vague ("dark spot", "something wrong").
- 4: Mostly natural voice. One or two template-feeling sections, but reasoning is present and sound.
- 3: Mixed. Some reasoning, some filled-in template. Auto-generated-feeling phrasing, or imprecise language.
- 2: Template-heavy. Reasoning absent or shallow. Impressions are labels without reasoning.
- 1: Entirely template-driven. No physician thought visible. Could be any patient.
Notes:
- Strong reasoning ("lymphoma or abscess cannot be excluded without biopsy") scores HIGHER than clean formatting with weak reasoning.
- Vague/imprecise medical language is a major penalty.
- MORE relevant clinical context is BETTER, even if longer.

## DIMENSION 4: Absence of Artifacts (1-5)
Is the note free of AI/processing artifacts, fabrication, and structural problems?
- 5: Clean. No fabricated findings, no template markers, no repeated sections, no hallucinated symptoms.
- 4: One minor artifact that doesn't affect clinical meaning.
- 3: Noticeable artifacts — a fabricated denial, a template remnant, a truncated word ("Neuroed").
- 2: Multiple artifacts. Fabricated content. Section duplication. Clinical reinterpretation of mechanism.
- 1: Severely artifacted. Fabricated content that could mislead (invented code status, fabricated GOC discussion).
Clinical reinterpretation of mechanism IS an artifact: if the patient said "tripped on the bed" and the note says "fall with neurologic sequelae," that is fabricated interpretation. History should use the patient's words; interpretation belongs in the assessment.

## DIMENSION 5: Physician Readability (1-5)
Would a physician sign this note? Overall gestalt.
- 5: Sign without edits. Each problem in the assessment has reasoning, not just a label.
- 4: Sign with minor corrections.
- 3: Usable but needs meaningful editing.
- 2: Significant rewriting needed.
- 1: Unusable. Rewrite from scratch.

## DIMENSION 6: Input Fidelity (1-5) — CATCHES THE MOST DANGEROUS FAILURES
Does the note faithfully capture what the clinician actually said? Only scored when a SOURCE is provided; if none, score 3 (neutral).
- 5: Every clinically relevant detail from the source is present. No significant omissions, no misrepresentation. Timeline and mechanism match exactly.
- 4: One minor detail omitted/recharacterized; all major elements present; no change to decision-making.
- 3: Notable omissions or recharacterizations (a relevant history item missing). Score 3 when no source is available.
- 2: Major omissions affecting care — an entire problem the clinician mentioned is absent; an elevated lab with concerning context has no corresponding assessment; the mechanism is materially misrepresented.
- 1: The note bears little resemblance to the source. Multiple major elements omitted or fabricated.
Rules:
- Every problem the clinician mentions deserves acknowledgment. Dropping an entire complaint is a 2 or lower.
- Labs mentioned with concerning context must have a corresponding assessment problem.
- Mechanism and timeline must match the source.
- Details the clinician explicitly denies must not appear as positive findings.

## SCORING RULES
- Score EACH dimension independently.
- Natural Flow (3) and Input Fidelity (6) are the most discriminating. Be harsh on both.
- Clinical reasoning quality matters MORE than structural completeness.
- Use the FULL 1-5 range. Don't cluster at 3-4.
- Return ONLY the JSON object. No preamble, no markdown fences.`;

interface RawNarrative {
  dimensions: {
    story_cohesion: number;
    clinical_completeness: number;
    natural_flow: number;
    absence_of_artifacts: number;
    physician_readability: number;
    input_fidelity: number;
  };
  reasoning: string;
}

export function extractJSON(text: string): RawNarrative {
  const parsed = extractJsonObject(text);
  if (!parsed?.dimensions) throw new Error('Response JSON missing "dimensions"');
  const d = parsed.dimensions;
  const keys = ['story_cohesion', 'clinical_completeness', 'natural_flow', 'absence_of_artifacts', 'physician_readability', 'input_fidelity'];
  for (const k of keys) {
    if (typeof d[k] !== 'number' || d[k] < 1 || d[k] > 5) {
      throw new Error(`Invalid dimension "${k}": expected 1-5, got ${d[k]}`);
    }
  }
  return parsed;
}

const FLOOR = (reason: string, errored = false): NarrativeResult => ({
  total: 6,
  normalized: 0,
  dimensions: {
    storyCohesion: 1, clinicalCompleteness: 1, naturalFlow: 1,
    absenceOfArtifacts: 1, physicianReadability: 1, inputFidelity: 1,
  },
  reasoning: reason,
  errored,
});

/**
 * Score a clinical note on 6 dimensions. `source` is the encounter
 * transcript/dictation used to grade input fidelity (dimension 6).
 */
export async function evaluateNarrative(
  note: string,
  options?: { source?: string; maxRetries?: number },
): Promise<NarrativeResult> {
  if (!note?.trim()) return FLOOR('Empty note — scored minimum.');

  const maxRetries = options?.maxRetries ?? 3;
  let user = '';
  if (options?.source) user += `## SOURCE (for verifying fidelity)\n\n${options.source}\n\n---\n\n`;
  user += `## CLINICAL NOTE (to evaluate)\n\n${note}\n\n---\n\nScore all 6 dimensions (1-5 each) with brief reasoning. JSON only.`;

  let raw: RawNarrative | null = null;
  for (let attempt = 1; attempt <= 2 && !raw; attempt++) {
    const sys = attempt === 1
      ? NARRATIVE_RUBRIC_SYSTEM
      : NARRATIVE_RUBRIC_SYSTEM + '\n\nCRITICAL: your previous response could not be parsed. Return ONLY valid JSON.';
    try {
      raw = extractJSON(await callJudge(sys, user, maxRetries));
    } catch (err: any) {
      // Judge error or unparseable response after retries → errored (excluded
      // from aggregates), NOT a silently-floored real score.
      if (attempt >= 2) return FLOOR(`Judge error: ${err?.message?.slice(0, 120)}`, true);
    }
  }

  const d = raw!.dimensions;
  const total =
    d.story_cohesion + d.clinical_completeness + d.natural_flow +
    d.absence_of_artifacts + d.physician_readability + d.input_fidelity;

  const dimensions: NarrativeDimensions = {
    storyCohesion: Math.round(d.story_cohesion),
    clinicalCompleteness: Math.round(d.clinical_completeness),
    naturalFlow: Math.round(d.natural_flow),
    absenceOfArtifacts: Math.round(d.absence_of_artifacts),
    physicianReadability: Math.round(d.physician_readability),
    inputFidelity: Math.round(d.input_fidelity),
  };

  return {
    total,
    normalized: Math.round(((total - 6) / 24) * 100), // 6->0, 30->100
    dimensions,
    reasoning: raw!.reasoning || '',
  };
}
