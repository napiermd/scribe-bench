# ScribeBench

![License: MIT](https://img.shields.io/badge/license-MIT-blue) ![Data: CC-BY-4.0](https://img.shields.io/badge/data-CC--BY--4.0-green) ![Ranked: PriMock57 n=57](https://img.shields.io/badge/ranked-PriMock57%20n%3D57-orange) ![Tests: 80](https://img.shields.io/badge/tests-80%20passing-brightgreen)

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

On June 30, 2026, the production Vercel site also passed a live current-model
PriMock57 smoke test: PM57-d1c01 was generated and judged through the public
OpenRouter path with `nvidia/nemotron-3-ultra-550b-a55b:free`, returning a
parseable score of `normalized=100`, `inputFidelity=5`, zero dangerous
fabrications, and zero leaks. That is a plumbing proof, not a ranked claim; a
full public row still needs all 57 cases with declared repeats.

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

† `SYN-003` carries a deliberate seeded fabrication. The claude-sonnet 33% is a **real** catch — on `SYN-003` it fabricated "arrival via EMS" when the source says the daughter brought the patient in. At n=3 these CIs are wide on purpose; the PriMock57 table above is the substantive board.
</details>

Submit a real system to take the top spot — see [`leaderboard/SUBMISSION.md`](leaderboard/SUBMISSION.md).

Live results: [`leaderboard/results.json`](leaderboard/results.json). Rows marked `claimLevel: "smoke"` are visible for transparency but are not ranked.

## Public website

This repo builds a static public ScribeBench site for Vercel, currently live at
`https://scribe-bench.vercel.app`.

The first screen now states the product through concrete visitor jobs:

- **Know who it is for:** clinical AI buyers, builders, reviewers, and public commenters with a source encounter plus an AI-written note.
- **Know the output:** a copyable receipt that names the source-note issues, what the note claimed, what the source supports, and what proof is still missing.
- **Know the boundary:** ScribeBench is not the scribe product, not a patient app, and not a current model popularity board.
- **Check one note:** paste the source encounter plus AI note and catch source-note issues like the seeded CT/syncope workup, demographic changes, side changes, and allergy contradictions.
- **Challenge a claim:** turn "hallucination-free" language into an evidence ask with dataset, n, judge, repeats, and rates.
- **Publish evidence:** use aggregate PriMock57 or real-workflow scores for system claims while keeping raw closed-model notes out.
- **Inspect the proof:** flagged browser-check and demo receipt items now show note and source excerpts, including demographic, laterality, and allergy contradictions, so the receipt reads like evidence instead of a black-box verdict.
- **Start without waiting on models:** the seeded no-key check loads from static demo data before model-list/API calls, so first-time visitors see the useful receipt path first.
- **Keep receipts honest:** editing either quick-check text box clears seeded-case metadata, so copied receipts for pasted examples no longer claim to be `SYN-003`.

The site gives non-repo visitors a walk-up
experience: a job-oriented first screen, a working source-vs-note checker, an evidence
ladder, a NapierMD context section that explains why the project exists after
the demo, a powered PriMock57 leaderboard, a public claim checker, a current-model
challenge planner, a separate not-ranked synthetic smoke-test table, benchmark
snapshot, synthetic demo case receipt viewer, methodology summary, live generate-and-judge
lab, and run-it-yourself submission path. The homepage now answers the product
question directly: it is for clinical AI buyers, builders, and reviewers who have
a source encounter plus an AI-written note and want to know whether the note
invented care. On mobile, that explanation stays before the form instead of opening
with inputs first. The first screen now gives visitors a task router for four concrete
jobs: check one note, evaluate a vendor claim, debug a scribe pipeline, or add a
public evidence row. The note path runs the seeded SYN-003 receipt in place instead
of sending visitors into benchmark machinery. The first screen also includes a
no-key browser checker with the seeded fall case loaded and scored, pasteable
source and note fields for a visitor's own example, and a copyable receipt that
carries findings, note/source evidence excerpts, and next proof steps without copying
raw encounter text into the public ledger. Structured mismatches such as age, sex/gender,
left-vs-right body part, and NKDA-vs-listed-allergy contradictions carry the same
inspectable proof as unsupported clinical-workup flags, and the receipt language now
calls them source-note issues instead of squeezing every flag into "dangerous fabrication"
jargon. The next
section turns that receipt into
an action path: review a flagged note, escalate a clean triage result to the Lab,
challenge a vendor claim, or publish an aggregate powered row before making a
system-level claim. The Why section ties ScribeBench back to the NapierMD clinical
AI lane: this is not the scribe product, it is the public pressure test for whether
the signed note stays true to the source. The Evidence section now opens with what the evidence can prove
today: historical powered launch baselines, fresh smoke and one-note QA checks,
and the still-missing current powered rows. It now starts with a decision matrix
that maps common visitor intents to what they can honestly claim, the current proof
available, and the next click. It also includes a data-backed reader
digest before the tables so visitors see the best historical row, worst historical
failure signal, freshest smoke row, and next public action before they encounter
old GPT-4o/launch-model names. The public Repo map section explains how the project pieces
fit together: the Vercel checker, model-backed APIs, TypeScript eval engine,
synthetic and PriMock57 case data, scores-only evidence ledger, and GitHub
submission path. Buyers and clinical leaders can turn common vendor claims
such as "hallucination-free," "safe note," "better scribe," or "best current model"
into a copyable evidence ask without starting from a blank textarea; builders can
use the Lab for live model-backed scoring; contributors can add the missing current
powered rows. The Lab is now source-first: visitors see the seeded failure, paste
or replace the source encounter and candidate note, run the instant no-key receipt,
then escalate to a live judge or generated candidate only when the one-note result
deserves it. Model/provider/key controls sit behind a settings disclosure instead
of leading the workflow. The Lab can still run an OpenRouter smoke flow that
generates a fresh candidate note, judges it, and leaves the visitor with a verdict.
Visitors can copy a short evidence packet that names the scope, models, finding,
and next proof step, then copy a fuller QA summary before they test their own notes.
The synthetic demo section now runs the same browser-only receipt on each bundled
case, so the examples show what the checker catches instead of acting as a passive
source/note gallery.
The Evidence section now frames the old GPT-4o/launch Claude rows as a historical
baseline board with scored dates and current-row actions, so visitors do not read
stale launch baselines as today's model ranking.
The first-screen route for "I have one note" now lands on the browser-only checker
instead of the full Lab or a surprise seeded-demo action, keeping the fastest path
aligned with the visitor's actual job.
The primary first-screen language now says the visitor is checking a note for
invented care, with the QA receipt framed as the output rather than the job
itself. The same wording carries into the Lab so the no-API-key browser check and
model-backed judge feel like one workflow instead of separate benchmark gadgets.
The judge path
requests JSON-object responses where supported
and repairs common malformed JSON responses from free/current models before failing
closed; the live API also has a compact plain-text fallback for models that keep
mangling JSON. The public framing is
deliberately practical: one-note triage in the Lab, system-level evidence through
PriMock57, and build-in-public updates through GitHub submissions. The Claim
checker turns vague public/vendor statements such as "hallucination-free" or
"best current model" into a required evidence level and a copyable public ask.
The Current-model challenge planner turns the stale-leaderboard objection into
a proof-run picker with one-click plans for current hosted models, open/free
candidates, real scribe workflows, or second-judge robustness checks.
The Run section includes task-first presets for a current powered row, quick
smoke test, real workflow row, or second-judge pass, plus a contribution builder
that generates the candidate-note JSON shape, smoke/powered benchmark command,
and PR checklist from the visitor's selected dataset, generator, judge, and
repeats. The current powered-row preset now defaults to the actual current system
under test and a candidate-note file produced by the visitor's own pipeline, while
OpenRouter/free-model defaults stay in the smoke-test lane unless someone completes
a declared powered run. The Evidence section also carries a public
work log (`/assets/worklog.json`) plus a queue for current frontier, open/free,
real-workflow, and judge-robustness rows, including the proof required and first
action for each target. The current-run card includes the latest blocked PriMock57
public-API attempt plus a copyable resume command for anyone with a non-capped
provider key or credits. That keeps the stale launch baselines framed as an active
contribution backlog rather than a dead leaderboard.

```bash
npm run build
npm run preview
```

Source lives in [`site/`](site/). The build script copies the static app into
`dist/` and publishes bounded JSON from the existing benchmark artifacts.
The live Lab starts with source encounter and candidate note fields, then makes
the browser-only local receipt the primary action. That receipt needs no API key
or network call; it conservatively catches explicit contradictions, unsupported
common workups, transport mismatches, age/sex mismatches, left/right body-part
mismatches, allergy contradictions, and deterministic template leaks so a visitor
can get immediate triage even when free hosted models are slow or capped. The Lab
can also generate a candidate note from the source encounter, then judge that note
in the same browser flow with a separate judge model. It returns a plain-language
verdict and next step, not just a raw score, and can copy either a short public
evidence packet or a detailed QA summary for review notes and public discussion.
It can use a
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

### Current public-API run path

When the live Vercel site has provider keys configured, you can build a current
PriMock57 evidence row through the same public APIs visitors use. This keeps raw
generated notes in the ignored local cache and writes an aggregate pending file:

```bash
npm run bench:public-api -- \
  --base-url https://scribe-bench.vercel.app \
  --dataset data/primock57/cases \
  --system openrouter-nemotron-3-ultra-public-api \
  --repeats 1 \
  --out leaderboard/_public-api-pending.json
```

By default, the runner forwards a local `OPENROUTER_API_KEY` or `BASETEN_API_KEY`
to the public API as the matching temporary provider header. Use `--key-env
MY_OPENROUTER_KEY` to point at a different environment variable. The key is
never written to the progress cache or pending artifact.

The progress cache lives under `.scribebench-cache/public-api-runs/` so interrupted
runs can resume. Do not copy a pending row into `leaderboard/results.json` until
the run has enough completed PriMock57 cases, no unreviewed errors, declared
model/judge details, and the self-judge/second-judge limitation is disclosed.
Free OpenRouter models can be slow and quota-limited; when a judge call times out
or hits the daily cap, the runner records the case as errored/excluded and can
resume once credits or another judge backend are available. The public site exposes
that blocker in `/assets/current-run.json` and gives a copyable resume command in
the Evidence section.

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
