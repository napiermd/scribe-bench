/**
 * run_benchmark.ts — score a candidate system against a ScribeBench dataset.
 *
 * Usage:
 *   tsx eval/run_benchmark.ts \
 *     --dataset data/synthetic/cases \
 *     --candidate path/to/candidate_notes.json \
 *     --system "my-scribe-v1" \
 *     --out leaderboard/_pending.json \
 *     [--repeats 3] [--concurrency 5]
 *
 * candidate_notes.json is an array of { caseId, note }.
 *
 * Each case is judged `--repeats` times (default 3) and averaged, because the LLM
 * judge is non-deterministic — a single observation is noise (the κ=0.028 thesis).
 * Judge calls run with bounded concurrency and are cached by content+repeat, so
 * re-runs are fast and reproducible. A judge that errors after retries marks the
 * case errored (FAIL-CLOSED): it is excluded from the aggregate and the run exits
 * non-zero — a crashed judge never mints a clean leaderboard row.
 *
 * Judge backend via env (SCRIBEBENCH_BACKEND, default "anthropic").
 * Supported backends: anthropic, cli, baseten, openrouter.
 */

import * as fs from 'fs';
import * as path from 'path';
import { evaluateNarrative, NARRATIVE_RUBRIC_VERSION } from './narrative_judge';
import { judgeFabrication, detectLeaks, FABRICATION_RUBRIC_VERSION } from './fabrication';
import { currentBackendName, currentJudgeModel } from './llm';
import { makeKey, readCache, writeCache } from './cache';
import { mean, stdev, bootstrapCI } from './stats';
import type {
  BenchmarkCase, CandidateNote, CaseScore, BenchmarkScore,
  NarrativeResult, FabricationResult, NarrativeDimensions, LeakHit,
} from './types';

const DIM_KEYS: (keyof NarrativeDimensions)[] = [
  'storyCohesion', 'clinicalCompleteness', 'naturalFlow',
  'absenceOfArtifacts', 'physicianReadability', 'inputFidelity',
];

const round1 = (x: number) => Math.round(x * 10) / 10;
const round2 = (x: number) => Math.round(x * 100) / 100;
const round3 = (x: number) => Math.round(x * 1000) / 1000;
const uniq = (xs: string[]) => Array.from(new Set(xs));

// ---------------------------------------------------------------------------
// Pure aggregation (unit-tested)
// ---------------------------------------------------------------------------

/** Combine N judge repeats of one case into a single CaseScore body. Pure. */
export function aggregateRepeats(
  narrs: NarrativeResult[],
  fabs: FabricationResult[],
  leaks: LeakHit[],
): Omit<CaseScore, 'caseId'> {
  const okNarr = narrs.filter((n) => !n.errored);
  const okFab = fabs.filter((f) => !f.errored);

  let narrative: NarrativeResult;
  let spread = 0;
  if (okNarr.length === 0) {
    narrative = { total: 6, normalized: 0, dimensions: floorDims(), reasoning: 'All narrative repeats errored', errored: true };
  } else {
    const norms = okNarr.map((n) => n.normalized);
    spread = stdev(norms);
    const dimensions = Object.fromEntries(
      DIM_KEYS.map((k) => [k, round2(mean(okNarr.map((n) => n.dimensions[k])))]),
    ) as unknown as NarrativeDimensions;
    narrative = {
      total: round2(mean(okNarr.map((n) => n.total))),
      normalized: round1(mean(norms)),
      dimensions,
      reasoning: okNarr[0].reasoning,
      errored: false,
    };
  }

  let fabrication: FabricationResult;
  if (okFab.length === 0) {
    fabrication = { hasFabrication: false, hasDangerous: false, dangerous: [], standard: [], reasoning: 'All fabrication repeats errored', errored: true };
  } else {
    // Majority vote on the dangerous tier; ties resolve to dangerous (conservative
    // for a safety benchmark). Union the specific items across flagging runs.
    const dangerVotes = okFab.filter((f) => f.hasDangerous).length;
    const hasDangerous = dangerVotes * 2 >= okFab.length;
    const dangerous = uniq(okFab.flatMap((f) => f.dangerous));
    const standard = uniq(okFab.flatMap((f) => f.standard));
    fabrication = {
      hasFabrication: dangerous.length + standard.length > 0,
      hasDangerous, dangerous, standard,
      reasoning: okFab[0].reasoning,
      errored: false,
    };
  }

  return {
    narrative, fabrication, leaks,
    errored: okNarr.length === 0 || okFab.length === 0,
    repeats: Math.max(okNarr.length, okFab.length),
    narrativeSpread: round2(spread),
  };
}

/** Aggregate per-case scores into a leaderboard row. Errored cases excluded. Pure. */
export function aggregate(
  system: string, dataset: string, judgeModel: string, repeats: number, all: CaseScore[],
): BenchmarkScore {
  const scored = all.filter((s) => !s.errored);
  const narrNorms = scored.map((s) => s.narrative.normalized);
  const dangerFlags = scored.map((s) => (s.fabrication.hasDangerous ? 1 : 0));
  const leakFlags = scored.map((s) => (s.leaks.length > 0 ? 1 : 0));
  const perDimension = Object.fromEntries(
    DIM_KEYS.map((k) => [k, round2(mean(scored.map((s) => s.narrative.dimensions[k])))]),
  ) as unknown as NarrativeDimensions;

  return {
    system, dataset,
    n: scored.length,
    nErrored: all.length - scored.length,
    repeats,
    narrativeMean: round1(mean(narrNorms)),
    narrativeMeanCI: bootstrapCI(narrNorms),
    dangerousFabricationRate: round3(mean(dangerFlags)),
    dangerousFabricationRateCI: bootstrapCI(dangerFlags),
    leakRate: round3(mean(leakFlags)),
    fidelityMean: round2(mean(scored.map((s) => s.narrative.dimensions.inputFidelity))),
    perDimension,
    judgeModel,
  };
}

function floorDims(): NarrativeDimensions {
  return { storyCohesion: 1, clinicalCompleteness: 1, naturalFlow: 1, absenceOfArtifacts: 1, physicianReadability: 1, inputFidelity: 1 };
}

// ---------------------------------------------------------------------------
// IO + orchestration
// ---------------------------------------------------------------------------

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) out[argv[i].slice(2)] = argv[i + 1];
  }
  return out;
}

export function loadCases(dir: string): BenchmarkCase[] {
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
  return files.map((f) => {
    const c = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8'));
    if (!c.id || !c.source) throw new Error(`${f}: case needs at least { id, source }`);
    return c as BenchmarkCase;
  });
}

export function datasetLabel(datasetDir: string): string {
  const base = path.basename(datasetDir);
  const parent = path.basename(path.dirname(datasetDir));
  if (base === 'cases' && parent === 'primock57') return 'primock57';
  if (base === 'cases' && parent === 'specialty') return 'specialty';
  return base;
}

/** Run async thunks with a bounded concurrency cap, preserving order. */
async function pool<T>(jobs: (() => Promise<T>)[], concurrency: number): Promise<T[]> {
  const results: T[] = new Array(jobs.length);
  let next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const i = next++;
      results[i] = await jobs[i]();
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, jobs.length)) }, worker));
  return results;
}

async function cachedNarrative(note: string, source: string, repeat: number, judgeModel: string, backend: string): Promise<NarrativeResult> {
  const key = makeKey({ kind: 'narrative', v: NARRATIVE_RUBRIC_VERSION, backend, judgeModel, note, source, repeat });
  const hit = readCache<NarrativeResult>(key);
  if (hit) return hit;
  const r = await evaluateNarrative(note, { source });
  if (!r.errored) writeCache(key, r);
  return r;
}

async function cachedFabrication(note: string, source: string, repeat: number, judgeModel: string, backend: string): Promise<FabricationResult> {
  const key = makeKey({ kind: 'fab', v: FABRICATION_RUBRIC_VERSION, backend, judgeModel, note, source, repeat });
  const hit = readCache<FabricationResult>(key);
  if (hit) return hit;
  const r = await judgeFabrication(note, source);
  if (!r.errored) writeCache(key, r);
  return r;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const datasetDir = args.dataset || 'data/synthetic/cases';
  const candidatePath = args.candidate;
  const system = args.system || 'unnamed-system';
  const outPath = args.out || 'leaderboard/_pending.json';
  const repeats = Math.max(1, parseInt(args.repeats || '3', 10));
  const concurrency = Math.max(1, parseInt(args.concurrency || '5', 10));

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

  const backend = currentBackendName();
  const judgeModel = currentJudgeModel();
  console.log(`Scoring "${system}" on ${cases.length} cases × ${repeats} repeats (judge: ${judgeModel}, backend: ${backend}, concurrency: ${concurrency})\n`);

  // Build all judge jobs (case × repeat × {narrative, fab}); leaks are deterministic.
  type Job = { caseIdx: number; kind: 'n' | 'f'; run: () => Promise<NarrativeResult | FabricationResult> };
  const jobs: Job[] = [];
  cases.forEach((c, ci) => {
    const note = noteById.get(c.id)!;
    for (let r = 0; r < repeats; r++) {
      jobs.push({ caseIdx: ci, kind: 'n', run: () => cachedNarrative(note, c.source, r, judgeModel, backend) });
      jobs.push({ caseIdx: ci, kind: 'f', run: () => cachedFabrication(note, c.source, r, judgeModel, backend) });
    }
  });

  const jobResults = await pool(jobs.map((j) => j.run), concurrency);

  // Group results back per case.
  const narrByCase: NarrativeResult[][] = cases.map(() => []);
  const fabByCase: FabricationResult[][] = cases.map(() => []);
  jobs.forEach((j, i) => {
    if (j.kind === 'n') narrByCase[j.caseIdx].push(jobResults[i] as NarrativeResult);
    else fabByCase[j.caseIdx].push(jobResults[i] as FabricationResult);
  });

  const scores: CaseScore[] = cases.map((c, ci) => {
    const leaks = detectLeaks({ note: noteById.get(c.id)! });
    return { caseId: c.id, ...aggregateRepeats(narrByCase[ci], fabByCase[ci], leaks) };
  });

  for (const s of scores) {
    if (s.errored) { console.log(`  ${s.caseId.padEnd(16)} ⚠ ERRORED (judge failed after retries — excluded)`); continue; }
    const danger = s.fabrication.hasDangerous ? ' ⚠ DANGEROUS-FAB' : '';
    const leak = s.leaks.length ? ' ⚠ LEAK' : '';
    const spread = s.narrativeSpread ? ` ±${s.narrativeSpread}` : '';
    console.log(`  ${s.caseId.padEnd(16)} narrative ${String(Math.round(s.narrative.normalized)).padStart(3)}/100${spread}  fidelity ${s.narrative.dimensions.inputFidelity}/5${danger}${leak}`);
  }

  const agg = aggregate(system, datasetLabel(datasetDir), judgeModel, repeats, scores);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify({ summary: agg, perCase: scores }, null, 2));

  const ci = (c: [number, number]) => `[${c[0]}, ${c[1]}]`;
  console.log('\n' + '='.repeat(60));
  console.log(`SCRIBEBENCH — ${system} on ${agg.dataset} (n=${agg.n}${agg.nErrored ? `, ${agg.nErrored} errored/excluded` : ''}, repeats=${agg.repeats})`);
  console.log('='.repeat(60));
  console.log(`  Narrative mean ............ ${agg.narrativeMean}/100  95% CI ${ci(agg.narrativeMeanCI)}   (higher better)`);
  console.log(`  Input fidelity mean ....... ${agg.fidelityMean}/5                       (higher better)`);
  console.log(`  Dangerous-fabrication rate  ${(agg.dangerousFabricationRate * 100).toFixed(1)}%  95% CI [${(agg.dangerousFabricationRateCI[0] * 100).toFixed(1)}%, ${(agg.dangerousFabricationRateCI[1] * 100).toFixed(1)}%]   (lower better)`);
  console.log(`  Leak rate ................. ${(agg.leakRate * 100).toFixed(1)}%                       (lower better)`);
  console.log('='.repeat(60));
  console.log(`\nWrote ${outPath}`);

  if (agg.nErrored > 0) {
    console.error(`\n⚠ ${agg.nErrored} case(s) excluded due to judge errors. Re-run to score them — do NOT submit a leaderboard row with errored cases.`);
    process.exitCode = 1;
  }
}

// Only run main() when executed directly, not when imported by tests.
const invokedDirectly = process.argv[1] && /run_benchmark\.(ts|js)$/.test(process.argv[1]);
if (invokedDirectly) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
