# Contributing to ScribeBench

Two kinds of contribution: **leaderboard submissions** (score your system) and **dataset/eval contributions** (improve the benchmark).

## ⚠️ The one hard rule: no real patient data

ScribeBench contains **zero** protected health information and never will. Any case you contribute must be one of:

1. **Fully synthetic** — invented, with no relationship to a real patient. Demographics, dates, and clinical details must be fabricated.
2. **Already public and appropriately licensed** — e.g. PriMock57 (CC-BY-4.0).

PRs adding data will be reviewed for PHI before merge. De-identified real clinical text is **not** acceptable — re-identification risk and consent/IRB questions put it out of scope here. When in doubt, don't.

## Leaderboard submissions

1. Generate your system's note for every case in a dataset, as a JSON array of `{ "caseId", "note" }`.
2. Score it:
   ```bash
   npx tsx eval/run_benchmark.ts \
     --dataset data/<dataset>/cases \
     --candidate your_notes.json \
     --system "your-system-name" \
     --out leaderboard/_pending.json
   ```
3. Append the `summary` block from `_pending.json` to `leaderboard/results.json`, add a row to the README table, and open a PR. Include the judge model and backend you used (the judge model materially affects scores — report it).
4. CI re-runs the deterministic checks and validates your submission shape.

**Report honestly.** Use the strongest judge you can; weaker judges under-discriminate. Don't tune the candidate against the judge prompt and then report it as a general result.

## Eval / dataset contributions

- New synthetic cases: one JSON file per case in `data/<dataset>/cases/`, matching `BenchmarkCase` in `eval/types.ts`.
- Rubric or judge changes: include a calibration argument. The rubric is calibrated to physician preference; changes should be defended against that, not against intuition. Note that adding prescriptive rules to a judge prompt can *reduce* agreement with physicians — measure before you add.
- Run `npm run typecheck` and `npm test` before opening a PR.

## Code style

Small, dependency-light, TypeScript. Match the surrounding code.
