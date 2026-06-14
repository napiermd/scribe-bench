# ScribeBench methodology

## Why fidelity, not completeness

Most clinical-note evaluation grades structure: is there an HPI, an exam, an assessment and plan, the right sections. That is easy to automate and easy to game, and it does not track what physicians actually want.

In production data across 13 US hospital sites, binary structural checks correlated with blind physician A/B preference at **ρ = −0.077** (Spearman, not significant). A note can pass every structural check and still be one a physician won't sign — because it's generic, because the reasoning is shallow, or because it says things that didn't happen. ScribeBench therefore scores **narrative quality** and **fidelity to the source**, not checkboxes.

## The three components

### 1. Narrative-quality judge (`eval/narrative_judge.ts`)

An LLM-as-judge scores six dimensions, each 1–5:

1. **Story cohesion** — does the history read as a coherent clinical narrative?
2. **Clinical completeness** — are relevant findings present *and interpreted*? (A skeletal exam caps this at 2.)
3. **Natural flow** — does it read like a physician wrote it, with sound, precise reasoning? *Most discriminating dimension.*
4. **Absence of artifacts** — free of template markers, duplication, fabricated content?
5. **Physician readability** — would you sign it?
6. **Input fidelity** — does it faithfully capture what the clinician said? (Neutral 3 when no source is provided.) *Catches the most dangerous failures.*

Scores sum to 6–30 and normalize to 0–100. The judge model matters: a weaker judge (DeepSeek V3) reached only ρ = 0.18 against physician preference; a frontier judge reaches ρ > 0.6. **Always report the judge model.**

A note on rubric design: prescriptive rules can *hurt*. Adding transformation tables and hard gates to a judge prompt drove physician agreement *down* (≈58% → ≈47%) in our experiments. The rubric is deliberately principle-based, not a checklist.

### 2. Fabrication judge (`eval/fabrication.ts`)

A *separate, adversarial* judge — separate on purpose. A "which note is better" judge structurally rewards the more complete-looking note, so it will happily prefer a note that invents a thorough workup. The fabrication judge never rewards completeness. It lists only content in the note the source does not support, and tiers each item:

- **DANGEROUS** — asserts something that *did not happen*: an invented lab value or vital, an exam finding contradicting the source, a diagnosis more specific/severe than the clinician named, workup flowing from an escalated diagnosis, an order contradicting the source.
- **STANDARD** — registering care the clinician actually delivered, or conventional care for the stated problem: critical-care-time and placement attestations, the consults/monitoring indicated for the named problems, routine prophylaxis.

The crucial distinction: **an ambient scribe's job is to register care that was delivered** — captured from the encounter. A critical-care-time attestation or a two-midnight statement is the *value* of the product, not a hallucination. Penalizing it as fabrication mis-measures the system. Only invention of what didn't happen is dangerous. The leaderboard ranks on **dangerous-fabrication rate**.

### 3. Deterministic leak scanner (`eval/fabrication.ts → detectLeaks`)

A 0-token, 100%-precision string scan for raw template placeholders (`*(...)*`) and internal-metadata tokens that must never reach a physician-facing surface. Pure function, no LLM, trivially unit-tested. Deterministic problems belong in deterministic checks — not in a prompt and not in an LLM judge.

## Inter-rater reliability — read this before trusting any single-rater eval

Three board-certified physicians reviewed the same 36 blind A/B note pairs (84 total ratings). The primary overlapping rater pair agreed at **κ = 0.028** across 35 shared ratings, with wide confidence intervals that include chance agreement. A frontier LLM judge on this rubric agreed with a *given* physician about 61% of the time, comparable to physician–physician agreement.

The implication is not "the judge is bad." It is that **clinical-note preference is intrinsically noisy**, and any eval resting on one rater (human or model) is measuring that rater. ScribeBench reports aggregate rates over a dataset for this reason, and we recommend bootstrap confidence intervals on every leaderboard comparison rather than single-case or single-rater claims.

## Provenance

ScribeBench's judges and rubrics were extracted and generalized from a production closed-loop QA system for clinical documentation (companion preprint). The Sayvant-specific clinical conventions, production prompts, and patient data are not part of this repository — only the evaluation methodology and synthetic/public data.
