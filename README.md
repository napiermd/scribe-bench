# ScribeBench

**A fidelity benchmark for clinical documentation AI.**

ScribeBench measures whether an AI-generated clinical note is **faithful to the source encounter** — it rewards capturing what the clinician said and did, and penalizes **fabrication**: invented findings, escalated diagnoses, workups that never happened.

Hallucination-and-omission scoring for clinical notes is not new — [ACI-Bench](#prior-work), MEDIQA-Chat, and MedHallu established it. ScribeBench adds two things they don't:

1. **A fabrication tier that distinguishes *registering delivered care* from *inventing what didn't happen*.** An ambient scribe's job is to register care the clinician actually delivered — a critical-care-time attestation, a placement statement captured from the encounter. That is the product working, not a hallucination. Other taxonomies flag it as one. ScribeBench tiers it as STANDARD and reserves DANGEROUS for content asserting something that *did not happen*. See [`docs/fabrication-taxonomy.md`](docs/fabrication-taxonomy.md).

2. **An honest accounting of rater fragility.** Two board-certified physicians scoring the same 35 blind A/B note pairs agreed at **κ = 0.028** (95% CI includes zero) — barely above chance. And in the same production data, binary structural completeness correlated with physician preference at **ρ = −0.077** (not significant): the *most complete* note is not the one physicians prefer. If your eval rests on a single rater or a checklist, you are measuring the rater or the checklist, not quality. ScribeBench reports aggregate rates with bootstrap confidence intervals for this reason.

> Companion preprint: *Closed-Loop Quality Assurance for Production Clinical AI Documentation* (link on release). ScribeBench is its open reproducibility artifact. **Disclosure:** authored by a Sayvant co-founder; the judges and rubric are generalized from Sayvant's production QA system. See [Disclosure](#disclosure).

---

## Leaderboard

Rank by **dangerous-fabrication rate** (lower is better), then **narrative mean** (higher is better). Submit your system via PR — see [`leaderboard/SUBMISSION.md`](leaderboard/SUBMISSION.md).

> **Data policy:** the leaderboard stores **aggregate scores only** — never raw model-generated note text. Full candidate notes are published only for open-weight models or your own runs. This respects provider output terms (publishing closed-model outputs as a redistributable dataset is not something we do). The bundled dataset is CC-BY synthetic + PriMock57 only.

| System | Dataset | n | Narrative ↑ | Fidelity ↑ | Dangerous-fab ↓ | Leak ↓ | Judge |
|--------|---------|---|------------|-----------|-----------------|--------|-------|
| gpt-4o (scribe) | synthetic | 3 | 71.7 | 4.67 | **0.0%** | 0.0% | claude-opus |
| claude-sonnet (scribe) | synthetic | 3 | 68.0 | 4.67 | 33.3% | 0.0% | claude-opus |
| example-baseline (seeded fab) † | synthetic | 3 | 59.0 | 3.50 | 33.3% | 0.0% | claude-opus |

† Reference row with a deliberate seeded fabrication in `SYN-003`. The Claude-sonnet row's 33% is a **real** catch — on `SYN-003` it fabricated "arrival via EMS" when the source says the daughter drove the patient in.

Baselines are **scores-only** (closed-model note text not published), generated with a generic scribe prompt (not tuned systems), `n=3` synthetic cases, `repeats=2`. CIs are wide at n=3 by design — the 57-case PriMock57 set (`data/primock57/cases/`) tightens them. Submit a real system to take the top spot.

Live results: [`leaderboard/results.json`](leaderboard/results.json).

---

## Metrics

| Metric | Direction | What it measures |
|--------|-----------|------------------|
| **Narrative mean** | higher | 6-dimension physician-style quality (0–100), calibrated to blind preference |
| **Input fidelity** | higher | Does the note faithfully capture what the clinician said? (1–5) |
| **Dangerous-fabrication rate** | lower | Fraction of notes that assert something that *did not happen* — invented findings, escalated diagnoses, contradicting orders |
| **Leak rate** | lower | Fraction of notes containing raw template placeholders or internal-metadata tokens (deterministic, 0-token scan) |

The fabrication judge draws a line most metrics miss: **registering care the clinician actually delivered is not fabrication** — a critical-care-time attestation or a placement statement captured from the encounter is the *value* of an ambient scribe, not a hallucination. Only content asserting something that *did not happen* is dangerous. See [`docs/methodology.md`](docs/methodology.md).

---

## Quickstart

```bash
npm install

# Pick a judge backend:
#   anthropic (default) — needs ANTHROPIC_API_KEY
#   cli                 — uses the `claude` CLI over OAuth (Max/Pro plan, no key)
export SCRIBEBENCH_BACKEND=anthropic
export ANTHROPIC_API_KEY=sk-ant-...

# Score the bundled example candidate on the synthetic dataset:
npx tsx eval/run_benchmark.ts \
  --dataset data/synthetic/cases \
  --candidate data/synthetic/example_candidate.json \
  --system "example-baseline" \
  --out leaderboard/_pending.json
```

The example candidate deliberately seeds one fabrication (case `SYN-003` invents a head CT and a syncope workup the source rules out) so you can see the fabrication judge fire.

## Datasets

- **`data/synthetic/`** — fully synthetic encounters (no PHI, ever). Ships in-repo; runnable immediately.
- **`data/primock57/`** — [PriMock57](https://github.com/babylonhealth/primock57), 57 audio-grounded mock primary-care consultations with clinician-written reference notes, CC-BY 4.0. Fetched, not vendored: `bash scripts/fetch_primock57.sh`.

**ScribeBench contains no real patient data.** Contributions must be synthetic or already-public, appropriately licensed corpora. See [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Bring your own pipeline

The eval engine is a small, dependency-light TypeScript library:

- `eval/narrative_judge.ts` — `evaluateNarrative(note, { source })`
- `eval/fabrication.ts` — `judgeFabrication(note, source)` + `detectLeaks(surfaces)` (pure, no LLM)
- `eval/llm.ts` — pluggable backend (Anthropic API / Claude CLI / your own)

## Prior work

ScribeBench builds on a line of clinical-note evaluation work and is explicit about what it adds:

- **ACI-Bench** (Yim et al.) — ambient clinical-note generation with a hallucination + omission taxonomy (major/minor severity). The closest prior art. ScribeBench differs in the delivered-care-vs-invented fabrication tier and in physician-preference calibration.
- **MEDIQA-Chat / MEDIQA-Sum** — clinical dialogue-to-note shared tasks.
- **MedHallu, MedHallBench** — medical-LLM hallucination benchmarks (mostly QA, not note generation).
- **npj Digital Medicine (2025)** — a clinical-safety/hallucination framework for LLM medical summarization.

What ScribeBench adds: (1) the fabrication tier that does not penalize registering delivered care; (2) physician-preference calibration with an honest rater-fragility result (κ); (3) a fidelity-first, scores-only leaderboard.

## Disclosure

ScribeBench is authored by a Sayvant co-founder. Sayvant builds clinical documentation AI and competes with vendors who may appear on this leaderboard. The judges and rubric are generalized from Sayvant's production QA system (no production prompts, no patient data — see `docs/methodology.md`). To keep the benchmark neutral:

- **Sayvant does not submit its own leaderboard row** at launch. If it ever does, it will be clearly flagged and scored under an independent judge configuration.
- The eval engine, rubric, and synthetic data are fully open so anyone can audit or re-run the scoring.
- Prior work is credited above; the novel contributions are scoped narrowly and honestly.

## License

- Code: **MIT** ([`LICENSE`](LICENSE))
- Synthetic data + rubrics: **CC-BY-4.0** ([`LICENSE-DATA`](LICENSE-DATA))
- PriMock57 retains its upstream CC-BY-4.0 license.

## Citation

See [`CITATION.cff`](CITATION.cff).
