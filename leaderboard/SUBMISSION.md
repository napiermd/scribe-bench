# Submitting to the ScribeBench leaderboard

1. **Generate notes.** Run your system on every case in a dataset. Produce a JSON array:
   ```json
   [
     { "caseId": "SYN-001", "note": "HPI: ..." },
     { "caseId": "SYN-002", "note": "HPI: ..." }
   ]
   ```

2. **Score.**
   ```bash
   export SCRIBEBENCH_BACKEND=anthropic   # or: cli
   export ANTHROPIC_API_KEY=sk-ant-...    # if using the anthropic backend
   npx tsx eval/run_benchmark.ts \
     --dataset data/synthetic/cases \
     --candidate your_notes.json \
     --system "your-system" \
     --out leaderboard/_pending.json
   ```

3. **Record.** Copy the `summary` object from `_pending.json` into the `results` array in
   `leaderboard/results.json`, add an ISO `scoredAt`, and set `claimLevel`:
   - `powered` for ranked benchmark rows, currently PriMock57 runs with at least 30 cases.
   - `smoke` for synthetic/demo rows or any small-n check that should not be ranked.

   Add powered rows to the README table. Smoke rows can be described in the demo section, but
   they must not be presented as leaderboard evidence.

4. **Open a PR.** In the description, state:
   - the judge model + backend (required — scores are not comparable across judge models),
   - whether the candidate was tuned against this benchmark in any way,
   - how the notes were generated (model, prompt summary, post-processing).

## Rules

- **Report the judge model.** A run scored by a weak judge is not comparable to one scored by a frontier judge. Submissions without a judge model are rejected.
- **Powered rows only rank.** The public site ranks only `claimLevel: "powered"` rows that meet the current n-floor. The bundled n=3 synthetic cases are smoke tests for scoring plumbing and demo behavior.
- **No PHI** in candidate notes or any added cases. Synthetic or public-licensed only.
- **No judge-gaming.** Don't fit your system to the judge prompt and report it as a general capability. Disclose any benchmark-specific tuning.
- Prefer reporting **bootstrap confidence intervals** for head-to-head claims. Single-case wins are noise (see `docs/methodology.md` on κ = 0.028).
