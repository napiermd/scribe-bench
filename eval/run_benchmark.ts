/**
 * run_benchmark.ts — score a candidate system against a ScribeBench dataset.
 *
 * Usage:
 *   tsx eval/run_benchmark.ts \
 *     --dataset data/synthetic/cases \
 *     --candidate path/to/candidate_notes.json \
 *     --system "my-scribe-v1" \
 *     --out leaderboard/_pending.json
 *
 * candidate_notes.json is an array of { caseId, note } — your system's output
 * for each case in the dataset. The harness scores each note with the narrative
 * judge + fabrication judge + deterministic leak scan, then aggregates into a
 * single leaderboard row.
 *
 * The judge backend is set via env (SCRIBEBENCH_BACKEND, default "anthropic").
 */

import * as fs from 'fs';
import * as path from 'path';
import { evaluateNarrative } from './narrative_judge';
import { judgeFabrication, detectLeaks } from './fabrication';
import type {
  BenchmarkCase, CandidateNote, CaseScore, BenchmarkScore, NarrativeDimensions,
} from './types';

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) out[argv[i].slice(2)] = argv[i + 1];
  }
  return out;
}

function loadCases(dir: string): BenchmarkCase[] {
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
  return files.map((f) => {
    const c = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8'));
    if (!c.id || !c.source) throw new Error(`${f}: case needs at least { id, source }`);
    return c as BenchmarkCase;
  });
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

async function scoreCase(c: BenchmarkCase, note: string): Promise<CaseScore> {
  const [narrative, fabrication] = await Promise.all([
    evaluateNarrative(note, { source: c.source }),
    judgeFabrication(note, c.source),
  ]);
  const leaks = detectLeaks({ note });
  return { caseId: c.id, narrative, fabrication, leaks };
}

function aggregate(system: string, dataset: string, judgeModel: string, scores: CaseScore[]): BenchmarkScore {
  const n = scores.length;
  const dimKeys: (keyof NarrativeDimensions)[] = [
    'storyCohesion', 'clinicalCompleteness', 'naturalFlow',
    'absenceOfArtifacts', 'physicianReadability', 'inputFidelity',
  ];
  const perDimension = Object.fromEntries(
    dimKeys.map((k) => [k, +mean(scores.map((s) => s.narrative.dimensions[k])).toFixed(2)]),
  ) as unknown as NarrativeDimensions;

  return {
    system,
    dataset,
    n,
    narrativeMean: +mean(scores.map((s) => s.narrative.normalized)).toFixed(1),
    dangerousFabricationRate: +mean(scores.map((s) => (s.fabrication.hasDangerous ? 1 : 0))).toFixed(3),
    leakRate: +mean(scores.map((s) => (s.leaks.length > 0 ? 1 : 0))).toFixed(3),
    fidelityMean: +mean(scores.map((s) => s.narrative.dimensions.inputFidelity)).toFixed(2),
    perDimension,
    judgeModel,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const datasetDir = args.dataset || 'data/synthetic/cases';
  const candidatePath = args.candidate;
  const system = args.system || 'unnamed-system';
  const outPath = args.out || 'leaderboard/_pending.json';

  if (!candidatePath) {
    console.error('Missing --candidate <path to [{caseId, note}]>');
    process.exit(1);
  }

  const cases = loadCases(datasetDir);
  const candidate: CandidateNote[] = JSON.parse(fs.readFileSync(candidatePath, 'utf-8'));
  const noteById = new Map(candidate.map((c) => [c.caseId, c.note]));

  const missing = cases.filter((c) => !noteById.has(c.id));
  if (missing.length) {
    console.error(`Candidate is missing notes for ${missing.length} case(s): ${missing.map((c) => c.id).join(', ')}`);
    process.exit(1);
  }

  const judgeModel = process.env.SCRIBEBENCH_JUDGE_MODEL || 'claude-opus-4-8';
  console.log(`Scoring "${system}" on ${cases.length} cases (judge: ${judgeModel}, backend: ${process.env.SCRIBEBENCH_BACKEND || 'anthropic'})\n`);

  const scores: CaseScore[] = [];
  for (const c of cases) {
    const s = await scoreCase(c, noteById.get(c.id)!);
    scores.push(s);
    const danger = s.fabrication.hasDangerous ? ' ⚠ DANGEROUS-FAB' : '';
    const leak = s.leaks.length ? ' ⚠ LEAK' : '';
    console.log(`  ${c.id.padEnd(16)} narrative ${String(s.narrative.normalized).padStart(3)}/100  fidelity ${s.narrative.dimensions.inputFidelity}/5${danger}${leak}`);
  }

  const agg = aggregate(system, path.basename(datasetDir), judgeModel, scores);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify({ summary: agg, perCase: scores }, null, 2));

  console.log('\n' + '='.repeat(56));
  console.log(`SCRIBEBENCH — ${system} on ${agg.dataset} (n=${agg.n})`);
  console.log('='.repeat(56));
  console.log(`  Narrative mean ............ ${agg.narrativeMean}/100   (higher better)`);
  console.log(`  Input fidelity mean ....... ${agg.fidelityMean}/5     (higher better)`);
  console.log(`  Dangerous-fabrication rate  ${(agg.dangerousFabricationRate * 100).toFixed(1)}%      (lower better)`);
  console.log(`  Leak rate ................. ${(agg.leakRate * 100).toFixed(1)}%      (lower better)`);
  console.log('='.repeat(56));
  console.log(`\nWrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
