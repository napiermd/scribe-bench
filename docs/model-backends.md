# Model Backends

ScribeBench separates two things:

- **Candidate system**: the scribe model that generated the note being tested.
- **Judge backend**: the model/provider used by ScribeBench to score narrative quality and unsupported clinical content.

The public leaderboard should use powered runs over `data/primock57/cases` with repeated judge calls. The 3-case synthetic set is a smoke test only.

## Candidate Generation

`scripts/generate_baseline.ts` creates the `[{ "caseId", "note" }]` file that
`eval/run_benchmark.ts` scores. Candidate generation and judging are separate
on purpose: the candidate model is the scribe under test; the judge model is the
auditor that scores the output.

```bash
# OpenRouter candidate model
export OPENROUTER_API_KEY=...
npx tsx scripts/generate_baseline.ts \
  --gen openrouter \
  --model nvidia/nemotron-3-ultra-550b-a55b:free \
  --dataset data/primock57/cases \
  --out /tmp/openrouter_primock57_notes.json

# Baseten candidate model
export BASETEN_API_KEY=...
npx tsx scripts/generate_baseline.ts \
  --gen baseten \
  --model deepseek-ai/DeepSeek-V4-Pro \
  --dataset data/primock57/cases \
  --out /tmp/baseten_primock57_notes.json
```

Closed-model candidate notes should stay local unless the provider terms allow
redistribution. Submit aggregate scores, not raw closed-model note text.

## Supported Judge Backends

| Backend | Env | Default model | Use when |
|---------|-----|---------------|----------|
| `anthropic` | `ANTHROPIC_API_KEY` | `claude-opus-4-8` | You want the default frontier-style judge path. |
| `cli` | Claude CLI auth | `opus` | You have Claude CLI OAuth available locally. |
| `baseten` | `BASETEN_API_KEY` | `deepseek-ai/DeepSeek-V4-Pro` | You want Baseten Model APIs through their OpenAI-compatible endpoint. |
| `openrouter` | `OPENROUTER_API_KEY` | `nvidia/nemotron-3-ultra-550b-a55b:free` | You want OpenRouter-hosted models. Set `SCRIBEBENCH_JUDGE_MODEL` for paid/stronger models. |

Override any default with:

```bash
export SCRIBEBENCH_JUDGE_MODEL=<provider-model-slug>
```

## Baseten Powered Run

Baseten Model APIs use the OpenAI-compatible chat-completions endpoint at `https://inference.baseten.co/v1/chat/completions` and list models at `https://inference.baseten.co/v1/models`.

```bash
export SCRIBEBENCH_BACKEND=baseten
export BASETEN_API_KEY=...
export SCRIBEBENCH_JUDGE_MODEL=deepseek-ai/DeepSeek-V4-Pro

npx tsx eval/run_benchmark.ts \
  --dataset data/primock57/cases \
  --candidate your_primock57_notes.json \
  --system "your-system" \
  --repeats 2 \
  --out leaderboard/_pending.json
```

Copy `_pending.json.summary` into `leaderboard/results.json` with `claimLevel: "powered"` only if the run covers enough cases and has no errored cases.
