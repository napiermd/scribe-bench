# ScribeBench

![License: MIT](https://img.shields.io/badge/license-MIT-blue) ![Data: CC-BY-4.0](https://img.shields.io/badge/data-CC--BY--4.0-green) ![Ranked: PriMock57 n=57](https://img.shields.io/badge/ranked-PriMock57%20n%3D57-orange) ![Tests: 62](https://img.shields.io/badge/tests-62%20passing-brightgreen)

**A public workbench for finding invented care in AI-generated clinical notes.**

ScribeBench measures whether an AI-generated clinical note is **faithful to the source encounter** — it rewards capturing what the clinician said and did, and penalizes **fabrication**: invented findings, escalated diagnoses, workups that never happened.

The public website is not a consumer app or a model popularity contest. It gives
visitors three concrete paths:

1. **Evaluate an AI scribe:** inspect a seeded failure case and see why fluent notes can still be unsafe.
2. **Test a pipeline:** generate a candidate note in the live lab, or paste one from your own scribe, then run a quick triage check.
3. **Add evidence:** generate PriMock57 notes, run the harness, and submit aggregate powered scores.

Hallucination-and-omission scoring for clinical notes is not new — [ACI-Bench](#prior-work), MEDIQA-Chat, and MedHallu established it. ScribeBench adds two things they don't:

1. **A fabrication tier that distinguishes *registering delivered care* from *inventing what didn't happen*.** An ambient scribe's job is to register care the clinician actually delivered — a critical-care-time attestation, a placement statement captured from the encounter. That is the product working, not a hallucination. Other taxonomies flag it as one. ScribeBench tiers it as STANDARD and reserves DANGEROUS for content asserting something that *did not happen*. See [`docs/fabrication-taxonomy.md`](docs/fabrication-taxonomy.md).

2. **An honest accounting of rater fragility.** In the calibration work behind ScribeBench, three board-certified physicians reviewed the same 36 blind A/B note pairs (84 total ratings). The primary overlapping rater pair agreed at **κ = 0.028** across 35 shared ratings (wide confidence interval), barely above chance. And in the same production data, binary structural completeness correlated with physician preference at **ρ = −0.077** (not significant): the *most complete* note is not the one physicians prefer. If your eval rests on a single rater or a checklist, you are measuring the rater or the checklist, not quality. ScribeBench reports aggregate rates with bootstrap confidence intervals for this reason.

> Companion preprint: *Closed-Loop Quality Assurance for Production Clinical AI Documentation* (link on release). ScribeBench is its open reproducibility artifact. **Disclosure:** authored by a Sayvant co-founder; the judges and rubric are generalized from Sayvant's production QA system. See [Disclosure](#disclosure).

---

## Evidence ledger and leaderboard

Rank powered PriMock57 runs by **dangerous-fabrication rate** (lower is better), then **narrative mean** (higher is better). Submit your system via PR — see [`leaderboard/SUBMISSION.md`](leaderboard/SUBMISSION.md).

> **Data policy:** the leaderboard stores **aggregate scores only** — never raw model-generated note text. Full candidate notes are published only for open-weight models or your own runs. This respects provider output terms (publishing closed-model outputs as a redistributable dataset is not something we do). The bundled dataset is CC-BY synthetic + PriMock57 only.

The current ranked rows are **historical launch baselines from June 2, 2026**. They prove the powered PriMock57 path and show the failure gradient, but they are not a current buying guide. The next public work is to add current production, frontier, open-weight, and vendor-system rows as powered PriMock57 runs.

| System | Dataset | n | Narrative ↑ (95% CI) | Fidelity ↑ | Dangerous-fab ↓ (95% CI) | Leak ↓ | Judge |
|--------|---------|---|----------------------|-----------|--------------------------|--------|-------|
| claude-sonnet (scribe) | PriMock57 | 57 | **78.4** [76.5, 80.4] | 4.46 | **5.3%** [0–12%] | 0.0% | claude-opus |
| gpt-4.1 (scribe) | PriMock57 | 57 | 73.6 [72.3, 74.9] | 4.27 | 5.3% [0–12%] | 0.0% | claude-opus |
| gpt-4o (scribe) | PriMock57 | 57 | 67.4 [65.9, 68.7] | 3.91 | 8.8% [2–18%] | 0.0% | claude-opus |
| claude-haiku (scribe) | PriMock57 | 57 | 67.5 [65.7, 69.3] | 4.22 | 24.6% [14–35%] | 0.0% | claude-opus |

All are **scores-only launch baselines** (closed-model note text not published per the data policy) from a *generic scribe prompt* — not tuned production systems and not a current market ranking — judged by Claude Opus at `repeats=2` over the 57 audio-grounded PriMock57 consults. The point is the **failure gradient** and the public harness: frontier launch models (claude-sonnet, gpt-4.1) fabricated dangerous content on ~5% of real consultations, gpt-4o on ~9%, and a small model (claude-haiku) on ~25%. Current model rows should be added as new powered PriMock57 runs.

<details>
<summary>Synthetic demo set (n=3, illustrative — wide CIs by design)</summary>

| System | n | Narrative ↑ | Fidelity ↑ | Dangerous-fab ↓ | Judge |
|--------|---|------------|-----------|-----------------|-------|
| openrouter-nemotron-3-ultra-live-smoke | 3 | 100.0 | 5.00 | 0.0% | nvidia/nemotron-3-super-120b-a12b-20230311:free |
| gpt-4o (scribe) | 3 | 71.7 | 4.67 | 0.0% | claude-opus |
| claude-sonnet (scribe) | 3 | 68.0 | 4.67 | 33.3% | claude-opus |
| example-baseline (seeded fab) † | 3 | 59.0 | 3.50 | 33.3% | claude-opus |

The OpenRouter row was generated through the production Vercel API on **June 30,
2026** with the current free-model path (`n=3`, `repeats=1`). It is useful as
fresh plumbing evidence and deliberately **not ranked**. The production judge
JSON-repair path was exercised on `SYN-003`, which is exactly the kind of
operational fragility the public Lab should expose before anyone claims a
system-level result.

† `SYN-003` carries a deliberate seeded fabrication. The claude-sonnet 33% is a **real** catch — on `SYN-003` it fabricated "arrival via EMS" when the source says the daughter drove the patient in. At n=3 these CIs are wide on purpose; the PriMock57 table above is the substantive board.
</details>

Submit a real system to take the top spot — see [`leaderboard/SUBMISSION.md`](leaderboard/SUBMISSION.md).

Live results: [`leaderboard/results.json`](leaderboard/results.json). Rows marked `claimLevel: "smoke"` are visible for transparency but are not ranked.

## Public website

This repo builds a static public ScribeBench site for Vercel, currently live at
`https://scribe-bench.vercel.app`. The site gives non-repo visitors a walk-up
experience: a decision-oriented homepage, role-based entry points, an evidence
ledger, a powered PriMock57 leaderboard, a public claim checker, a separate
not-ranked synthetic smoke-test table, benchmark snapshot, synthetic demo case
viewer, methodology summary, live generate-and-judge lab, and run-it-yourself
submission path. The homepage shows
the seeded CT/syncope fabrication catch before asking visitors to click deeper,
then gives first-screen paths to run a current free-model smoke check, check
one note, publish aggregate evidence for a scribe system, or evaluate whether a
public claim is backed by proof. The Lab opens with that seeded failure already
loaded plus a precomputed demo verdict, and the homepage can launch a one-click
OpenRouter smoke flow that generates a fresh candidate note from SYN-003, judges
it, and leaves the visitor with a verdict. Visitors can also run the live judge,
read the fabrication verdict, copy a short evidence packet that names the scope,
models, finding, and next proof step, then copy a fuller QA summary before they
test their own notes. The public framing is
deliberately practical: one-note triage in the Lab, system-level evidence through
PriMock57, and build-in-public updates through GitHub submissions. The Claim
checker turns vague public/vendor statements such as "hallucination-free" or
"best current model" into a required evidence level and a copyable public ask.
The Run section includes a contribution builder that generates the candidate-note JSON shape,
smoke/powered benchmark command, and PR checklist from the visitor's selected
dataset, generator, judge, and repeats. The Evidence section also carries a public
work log (`/assets/worklog.json`) plus a queue for current frontier, open/free,
real-workflow, and judge-robustness rows, including the proof required and first
action for each target. That keeps the stale launch baselines framed as an active
contribution backlog rather than a dead leaderboard.

```bash
npm run build
npm run preview
```

Source lives in [`site/`](site/). The build script copies the static app into
`dist/` and publishes bounded JSON from the existing benchmark artifacts.
The live Lab can generate a candidate note from the source encounter, then judge
that note in the same browser flow with a separate judge model. It returns a
plain-language verdict and next step, not just a raw score, and can copy either
a short public evidence packet or a detailed QA summary for review notes and
public discussion. It can use a
Vercel `OPENROUTER_API_KEY` environment variable, or a temporary OpenRouter key
pasted into the browser for that session. Baseten's OpenAI-compatible Model APIs
are wired as an optional provider and become available when `BASETEN_API_KEY` is
configured on Vercel or supplied temporarily in the lab.

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

# First generate candidate notes with the system under test.
# This example uses an OpenRouter-hosted model; replace it with your own scribe.
export OPENROUTER_API_KEY=...
npx tsx scripts/generate_baseline.ts \
  --gen openrouter \
  --model nvidia/nemotron-3-ultra-550b-a55b:free \
  --dataset data/primock57/cases \
  --out /tmp/openrouter_primock57_notes.json

# Then score those notes with a separate judge backend:
#   anthropic  — needs ANTHROPIC_API_KEY
#   cli        — uses the `claude` CLI over OAuth (Max/Pro plan, no key)
#   baseten    — OpenAI-compatible Baseten Model APIs, needs BASETEN_API_KEY
#   openrouter — OpenAI-compatible OpenRouter, needs OPENROUTER_API_KEY
export SCRIBEBENCH_BACKEND=baseten
export BASETEN_API_KEY=...
export SCRIBEBENCH_JUDGE_MODEL=deepseek-ai/DeepSeek-V4-Pro

# Powered run for a public leaderboard claim:
npx tsx eval/run_benchmark.ts \
  --dataset data/primock57/cases \
  --candidate /tmp/openrouter_primock57_notes.json \
  --system "openrouter-nemotron-3-ultra" \
  --repeats 2 \
  --out leaderboard/_pending.json

# Smoke test only; do not submit this as a ranked row:
npx tsx eval/run_benchmark.ts \
  --dataset data/synthetic/cases \
  --candidate data/synthetic/example_candidate.json \
  --system "example-baseline" \
  --out leaderboard/_pending.json
```

The example candidate deliberately seeds one fabrication (case `SYN-003` invents a head CT and a syncope workup the source rules out) so you can see the fabrication judge fire. It is useful for plumbing and demos, not for ranking systems.

## Datasets

- **`data/synthetic/cases/`** — 3 fully synthetic encounters (ED, clinic, inpatient). Ships in-repo; the runnable quickstart set.
- **`data/specialty/cases/`** — synthetic **emergency-medicine + hospital-admission** cases (physician-authored), broadening coverage beyond primary care. Extensible — PRs welcome.
- **`data/primock57/cases/`** — 57 audio-grounded mock primary-care consultations derived from [PriMock57](https://github.com/babylonhealth/primock57) (Babylon Health, **CC-BY-4.0**), vendored as ScribeBench cases. Regenerate from upstream with `bash scripts/fetch_primock57.sh && npx tsx scripts/build_primock57_cases.ts`. This is the scored leaderboard set.

**ScribeBench contains no real patient data.** Synthetic or already-public, appropriately licensed corpora only. See [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Bring your own pipeline

The eval engine is a small, dependency-light TypeScript library:

- `eval/narrative_judge.ts` — `evaluateNarrative(note, { source })`
- `eval/fabrication.ts` — `judgeFabrication(note, source)` + `detectLeaks(surfaces)` (pure, no LLM)
- `eval/llm.ts` — pluggable backend (Anthropic API / Claude CLI / Baseten / OpenRouter / your own)

See [`docs/model-backends.md`](docs/model-backends.md) for Baseten, OpenRouter, and powered-run examples.

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
