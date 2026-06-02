# The ScribeBench Fabrication Taxonomy

*A tiering for fabrication in ambient clinical documentation that separates **registering delivered care** from **inventing what did not happen**.*

## The problem with one-tier fabrication scoring

Most clinical-note hallucination metrics ask a single question: *is there content in the note that the source does not contain?* That question mis-scores ambient scribes.

An ambient scribe's job is to **register care the clinician actually delivered** — captured from the encounter, with consent. A critical-care-time attestation, a two-midnight / inpatient-placement statement, the consults and monitoring the clinician indicated for the problem they named: none of these are word-for-word "in" a dictation, but all of them *happened*. A one-tier metric flags them as hallucinations. They are the product working.

The failure that actually matters is different: content asserting something that **did not happen** — a finding never observed, a value never measured, a diagnosis never assessed, an order contradicting what was said. That is what harms a patient and erodes trust.

ScribeBench tiers fabrication accordingly. The leaderboard ranks on the **dangerous** tier.

## The test

> **Did this work or decision actually happen in the encounter?**
> Not: *is the exact phrase in the source text?*

If the encounter supports it (the clinician did it, ordered it, or it is the conventional care for the problem they named) → **STANDARD**.
If it asserts something the encounter does not support → **DANGEROUS**.

## Decision tree

```
                  Content in NOTE not verbatim in SOURCE
                                │
                ┌───────────────┴───────────────┐
        Does the encounter support             Is it a normal/templated
        that this happened?                    PHYSICAL EXAM or ROS, or a
                │                              paraphrase/reformat?
        ┌───────┴────────┐                            │
       NO               YES                          YES
        │                │                            │
   ┌────┴─────┐    ┌─────┴───────────┐         NOT FABRICATION
   │          │    │                 │         (standard charting —
 Care-level/  │  Care-level/      Conventional   do not flag)
 billing/     │  billing/time/    care for the
 time/        │  placement        named problem
 placement    │  attestation?     (consult,
 attestation? │     │             monitoring,
   │          │    YES            prophylaxis)?
  YES         NO    │                 │
   │          │  STANDARD          STANDARD
STANDARD   DANGEROUS
(absolute   (invented finding/value/history,
carve-out)   escalated or un-assessed dx,
             order contradicting the source,
             workup flowing from an invented dx)
```

The care-level/billing/time/placement carve-out is **absolute**: it overrides "contradicts the source." Reconciling a time attestation against a structured template field ("Critical Care Time: 0 min") is a separate deterministic guard's job, not semantic fabrication. Genuine clinical inventions — a fabricated lab value, a contradicted exam finding, an escalated diagnosis — remain DANGEROUS regardless.

## DANGEROUS — asserts something that did not happen

Changes what a reader believes about the patient.

- Invented patient **history or events** ("presented to the ED the day prior for dysuria" — not in the encounter).
- Invented **lab values, vitals, or measured findings** ("WBC >11.0" with no WBC mentioned; "febrile" at a normal temp).
- Exam findings that **contradict** the source ("no edema" when edema was noted; "pulses intact" for an amputee).
- A diagnosis **more specific or severe** than the clinician named, or one not assessed, asserted as the patient's problem (benign effusion → "concerning for periprosthetic joint infection"; "dizziness" → "acute encephalopathy").
- **Workup flowing from a fabricated/escalated diagnosis** (inventing blood cultures + ESR/CRP to "rule out" an infection the clinician never raised).
- **Orders contradicting** the source ("diabetic diet" when the source orders NPO).

## STANDARD — registering delivered care, or conventional care for the named problem

Accepted clinical charting. Not penalized on the leaderboard.

- **Care-level / billing / time / placement attestations**: critical-care-time statements, two-midnight / medical-necessity statements. Capturing the level of care delivered is the product's purpose.
- The **orders, consults, and monitoring** the clinician indicated for the problems they named (cardiology consult + telemetry for a worked-up troponin).
- **Routine** monitoring/prophylaxis appropriate to the stated problem (telemetry, DVT prophylaxis, glucose monitoring for a known diabetic).
- A **differential consideration explicitly framed as "on the differential"** (not asserted as the diagnosis).
- A **normal/templated physical exam** when the source lacks exam detail — standard charting, not invention.

## Worked examples

| Source (encounter) | Note content | Tier | Why |
|---|---|---|---|
| "admit for washout" (cloudy knee aspirate) | "blood cultures, ESR, CRP to rule out periprosthetic joint infection" | **DANGEROUS** | Invented workup flowing from an escalated dx the clinician never raised |
| "35 minutes managing the critically ill patient" | "Critical care time: 35 minutes" | **STANDARD** | Registering the level of care delivered — the product's purpose |
| mechanical fall, "no head strike, no LOC" | "CT head obtained, no acute hemorrhage; concern for syncope" | **DANGEROUS** | Asserts imaging + an etiology the encounter rules out |
| troponin 0.42 with ST changes, "call cardiology" | "cardiology consulted, admit telemetry" | **STANDARD** | Conventional care for the problem the clinician worked up |
| no exam dictated | "HEENT normocephalic, lungs CTA, RRR, abdomen soft" | **NOT FABRICATION** | Normal-exam template is standard charting |
| "blood pressure was fine" | "BP 118/76" | **DANGEROUS** | A specific value that was never measured |

## How ScribeBench applies it

The tier is assigned by an adversarial LLM judge (`eval/fabrication.ts → judgeFabrication`) that is shown the source and the note and instructed to find only unsupported content, then tier each item. It is deliberately **separate** from the quality judge: a "which note is better" judge structurally rewards the more complete-looking note, so it will happily prefer one that invents a thorough workup. The fabrication judge never rewards completeness — omission is fine, invention is the failure. The leaderboard's primary rank key is **dangerous-fabrication rate**.

*Cite this taxonomy as part of ScribeBench (see `CITATION.cff`).*
