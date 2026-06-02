# ScribeBench

**A fidelity benchmark for clinical documentation AI.**

Ambient clinical scribes and note-generation systems are graded today on structural completeness — does the note have an HPI, an exam, an assessment. That is the wrong target. In production data across 13 US hospital sites, structural completeness correlated with physician preference at **ρ = −0.077** (not significant). Physicians do not prefer the most *complete* note. They prefer the most *faithful* one — the note that says what actually happened in the encounter, and nothing that didn't.

ScribeBench scores that. It measures whether a generated note is **faithful to the source encounter**: it rewards capturing what the clinician said and did, and penalizes **fabrication** — invented findings, escalated diagnoses, workups that never happened.

It also surfaces a finding that should change how the field evaluates scribes: **physician preference itself is fragile.** Two board-certified physicians, scoring the same 35 blind A/B note pairs, agreed at **κ = 0.028** (95% CI includes zero). If your eval rests on a single rater, you are measuring that rater, not quality.

> Companion preprint: *Closed-Loop Quality Assurance for Production Clinical AI Documentation* (link on release). ScribeBench is its open reproducibility artifact.

---

## Leaderboard

Rank by **dangerous-fabrication rate** (lower is better), then **narrative mean** (higher is better). Submit your system via PR — see [`leaderboard/SUBMISSION.md`](leaderboard/SUBMISSION.md).

| System | Dataset | n | Narrative ↑ | Fidelity ↑ | Dangerous-fab ↓ | Leak ↓ | Judge |
|--------|---------|---|------------|-----------|-----------------|--------|-------|
| example-baseline † | synthetic | 3 | 59.7 | 3.67 | 33.3% | 0.0% | claude-opus-4-8 |

† Reference row shipped with the repo. `SYN-003` carries a deliberate seeded fabrication, so the 33% rate demonstrates the judge firing — not a system failure. Submit a real system to take the top spot.

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

## License

- Code: **MIT** ([`LICENSE`](LICENSE))
- Synthetic data + rubrics: **CC-BY-4.0** ([`LICENSE-DATA`](LICENSE-DATA))
- PriMock57 retains its upstream CC-BY-4.0 license.

## Citation

See [`CITATION.cff`](CITATION.cff).
