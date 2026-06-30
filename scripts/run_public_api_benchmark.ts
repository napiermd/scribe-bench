/**
 * Run a resumable ScribeBench benchmark through the public Vercel APIs.
 *
 * This is for build-in-public current-model evidence when production already has
 * provider keys configured. Raw generated notes stay in .scribebench-cache/ for
 * resume/debugging and should not be committed. The output is aggregate-first.
 *
 * Example:
 *   npx tsx scripts/run_public_api_benchmark.ts \
 *     --base-url https://scribe-bench.vercel.app \
 *     --dataset data/primock57/cases \
 *     --system openrouter-nemotron-3-ultra-public-api \
 *     --repeats 1 \
 *     --out leaderboard/_public-api-pending.json
 */

import * as fs from 'fs';
import * as path from 'path';
import { aggregate, aggregateRepeats, datasetLabel, loadCases } from '../eval/run_benchmark';
import { detectLeaks } from '../eval/fabrication';
import type {
  BenchmarkCase,
  BenchmarkScore,
  CaseScore,
  FabricationResult,
  NarrativeDimensions,
  NarrativeResult,
} from '../eval/types';

const DEFAULT_BASE_URL = 'https://scribe-bench.vercel.app';
const DEFAULT_MODEL = 'nvidia/nemotron-3-ultra-550b-a55b:free';
const DEFAULT_SYSTEM = 'openrouter-nemotron-3-ultra-public-api';
const DIM_KEYS: (keyof NarrativeDimensions)[] = [
  'storyCohesion',
  'clinicalCompleteness',
  'naturalFlow',
  'absenceOfArtifacts',
  'physicianReadability',
  'inputFidelity',
];

type Args = Record<string, string | undefined>;

export type PublicApiJudgment = {
  repeat: number;
  model: string;
  provider: string;
  dimensions: NarrativeDimensions;
  total: number;
  normalized: number;
  fabrication: {
    dangerous: string[];
    standard: string[];
  };
  reasoning: string;
  repairAttempted?: boolean;
  compactFallback?: boolean;
  scoredAt: string;
};

type PublicApiCaseRecord = {
  caseId: string;
  note?: string;
  generatedModel?: string;
  generatedProvider?: string;
  generatedAt?: string;
  judgments: PublicApiJudgment[];
  errors: string[];
};

type ProgressFile = {
  schemaVersion: 1;
  baseUrl: string;
  dataset: string;
  system: string;
  provider: string;
  generationModel: string;
  judgeModel: string;
  repeats: number;
  startedAt: string;
  updatedAt: string;
  cases: Record<string, PublicApiCaseRecord>;
};

export function parseArgs(argv: string[]): Args {
  const out: Args = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    out[key] = next && !next.startsWith('--') ? next : 'true';
    if (next && !next.startsWith('--')) i += 1;
  }
  return out;
}

export function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'run';
}

export function caseScoreFromPublicApi(record: PublicApiCaseRecord, repeats: number): CaseScore {
  const note = record.note || '';
  const judgments = record.judgments
    .filter((judgment) => Number.isInteger(judgment.repeat))
    .sort((a, b) => a.repeat - b.repeat)
    .slice(0, repeats);

  if (!note || judgments.length < repeats) {
    return {
      caseId: record.caseId,
      narrative: {
        total: 6,
        normalized: 0,
        dimensions: floorDims(),
        reasoning: record.errors.join('; ') || 'Public API run incomplete.',
        errored: true,
      },
      fabrication: {
        hasFabrication: false,
        hasDangerous: false,
        dangerous: [],
        standard: [],
        reasoning: record.errors.join('; ') || 'Public API run incomplete.',
        errored: true,
      },
      leaks: [],
      errored: true,
      repeats: judgments.length,
      narrativeSpread: 0,
    };
  }

  const narratives: NarrativeResult[] = judgments.map((judgment) => ({
    total: judgment.total,
    normalized: judgment.normalized,
    dimensions: judgment.dimensions,
    reasoning: judgment.reasoning,
  }));
  const fabrications: FabricationResult[] = judgments.map((judgment) => ({
    hasFabrication: judgment.fabrication.dangerous.length + judgment.fabrication.standard.length > 0,
    hasDangerous: judgment.fabrication.dangerous.length > 0,
    dangerous: judgment.fabrication.dangerous,
    standard: judgment.fabrication.standard,
    reasoning: judgment.reasoning,
  }));
  return {
    caseId: record.caseId,
    ...aggregateRepeats(narratives, fabrications, detectLeaks({ note })),
  };
}

export function publicApiDisclosure(args: {
  baseUrl: string;
  provider: string;
  generationModel: string;
  judgeModel: string;
  repeats: number;
  n: number;
  nErrored: number;
}): string {
  const selfJudged = args.generationModel === args.judgeModel;
  const scope = args.nErrored
    ? `${args.n} scored cases with ${args.nErrored} errored/excluded`
    : `${args.n} scored cases`;
  const selfJudgeText = selfJudged
    ? ' Generator and judge are the same model, so treat this as current public-path evidence, not a judge-robustness claim.'
    : '';
  return [
    `Generated and judged through ${args.baseUrl} using provider=${args.provider}.`,
    `Generation model: ${args.generationModel}. Judge model: ${args.judgeModel}.`,
    `Scope: ${scope}, repeats=${args.repeats}. Raw generated notes are not published.`,
    selfJudgeText.trim(),
  ].filter(Boolean).join(' ');
}

function floorDims(): NarrativeDimensions {
  return {
    storyCohesion: 1,
    clinicalCompleteness: 1,
    naturalFlow: 1,
    absenceOfArtifacts: 1,
    physicianReadability: 1,
    inputFidelity: 1,
  };
}

function progressPath(args: Args, system: string): string {
  if (args.progress) return args.progress;
  return path.join('.scribebench-cache', 'public-api-runs', `${slugify(system)}.json`);
}

export function assertProgressConfig(progress: ProgressFile, seed: Omit<ProgressFile, 'startedAt' | 'updatedAt' | 'cases'>) {
  const keys: (keyof typeof seed)[] = [
    'baseUrl',
    'dataset',
    'system',
    'provider',
    'generationModel',
    'judgeModel',
    'repeats',
  ];
  const mismatches = keys.filter((key) => progress[key] !== seed[key]);
  if (mismatches.length) {
    const detail = mismatches
      .map((key) => `${key}: progress=${JSON.stringify(progress[key])}, requested=${JSON.stringify(seed[key])}`)
      .join('; ');
    throw new Error(`Progress file was created for a different public API run. Use a different --system or --progress path. ${detail}`);
  }
}

function readProgress(file: string, seed: Omit<ProgressFile, 'startedAt' | 'updatedAt' | 'cases'>): ProgressFile {
  if (fs.existsSync(file)) {
    const progress = JSON.parse(fs.readFileSync(file, 'utf-8')) as ProgressFile;
    assertProgressConfig(progress, seed);
    return progress;
  }
  return {
    ...seed,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    cases: {},
  };
}

function writeProgress(file: string, progress: ProgressFile) {
  progress.updatedAt = new Date().toISOString();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(progress, null, 2) + '\n');
  fs.renameSync(tmp, file);
}

function ensureRecord(progress: ProgressFile, caseId: string): PublicApiCaseRecord {
  progress.cases[caseId] ||= { caseId, judgments: [], errors: [] };
  progress.cases[caseId].judgments ||= [];
  progress.cases[caseId].errors ||= [];
  return progress.cases[caseId];
}

async function postJson(url: string, body: unknown, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await response.text();
    let payload: any = {};
    try {
      payload = text ? JSON.parse(text) : {};
    } catch (_) {
      payload = { error: text.slice(0, 500) };
    }
    if (!response.ok) {
      throw new Error(payload.error || payload.message || `HTTP ${response.status}`);
    }
    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

function assertJudgePayload(payload: any, repeat: number): PublicApiJudgment {
  const dimensions = payload?.dimensions || {};
  const missing = DIM_KEYS.filter((key) => !Number.isFinite(Number(dimensions[key])));
  if (missing.length) throw new Error(`Judge response missing dimensions: ${missing.join(', ')}`);
  return {
    repeat,
    model: String(payload.model || ''),
    provider: String(payload.provider || ''),
    dimensions: Object.fromEntries(DIM_KEYS.map((key) => [key, Number(dimensions[key])])) as unknown as NarrativeDimensions,
    total: Number(payload.total || 0),
    normalized: Number(payload.normalized || 0),
    fabrication: {
      dangerous: Array.isArray(payload.fabrication?.dangerous) ? payload.fabrication.dangerous.map(String) : [],
      standard: Array.isArray(payload.fabrication?.standard) ? payload.fabrication.standard.map(String) : [],
    },
    reasoning: String(payload.reasoning || ''),
    repairAttempted: Boolean(payload.repairAttempted),
    compactFallback: Boolean(payload.compactFallback),
    scoredAt: new Date().toISOString(),
  };
}

function selectedCases(cases: BenchmarkCase[], args: Args): BenchmarkCase[] {
  const offset = Math.max(0, Number(args.offset || 0));
  const limit = args.limit ? Math.max(1, Number(args.limit)) : cases.length;
  return cases.slice(offset, offset + limit);
}

function buildOutput(args: {
  summary: BenchmarkScore;
  scores: CaseScore[];
  progressFile: string;
  baseUrl: string;
  provider: string;
  generationModel: string;
  judgeModel: string;
  repeats: number;
}) {
  const claimLevel = args.summary.dataset === 'primock57' && args.summary.n >= 30 ? 'powered' : 'smoke';
  const note = publicApiDisclosure({
    baseUrl: args.baseUrl,
    provider: args.provider,
    generationModel: args.generationModel,
    judgeModel: args.judgeModel,
    repeats: args.repeats,
    n: args.summary.n,
    nErrored: args.summary.nErrored,
  });
  return {
    summary: {
      ...args.summary,
      claimLevel,
      scoredAt: new Date().toISOString().slice(0, 10),
      notesPublished: false,
      note,
    },
    perCase: args.scores,
    provenance: {
      runner: 'scripts/run_public_api_benchmark.ts',
      progressFile: args.progressFile,
      rawNotesPolicy: 'Raw generated notes remain in ignored local progress cache and are not committed.',
    },
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const baseUrl = String(args['base-url'] || DEFAULT_BASE_URL).replace(/\/$/, '');
  const datasetDir = args.dataset || 'data/primock57/cases';
  const system = args.system || DEFAULT_SYSTEM;
  const provider = args.provider || 'openrouter';
  const generationModel = args['generation-model'] || args.model || DEFAULT_MODEL;
  const judgeModel = args['judge-model'] || args.model || DEFAULT_MODEL;
  const repeats = Math.max(1, Number(args.repeats || 1));
  const timeoutMs = Math.max(1000, Number(args.timeout || 240000));
  const outPath = args.out || 'leaderboard/_public-api-pending.json';
  const progressFile = progressPath(args, system);

  const cases = selectedCases(loadCases(datasetDir), args);
  const progress = readProgress(progressFile, {
    schemaVersion: 1,
    baseUrl,
    dataset: datasetDir,
    system,
    provider,
    generationModel,
    judgeModel,
    repeats,
  });

  console.log(`Public API run: ${system}`);
  console.log(`  baseUrl=${baseUrl}`);
  console.log(`  dataset=${datasetDir} (${cases.length} selected)`);
  console.log(`  provider=${provider}`);
  console.log(`  generation=${generationModel}`);
  console.log(`  judge=${judgeModel}`);
  console.log(`  repeats=${repeats}`);
  console.log(`  progress=${progressFile}\n`);

  for (const c of cases) {
    const record = ensureRecord(progress, c.id);
    try {
      if (!record.note) {
        process.stdout.write(`${c.id} generate... `);
        const generated = await postJson(`${baseUrl}/api/generate`, {
          provider,
          model: generationModel,
          source: c.source,
        }, timeoutMs);
        record.note = String(generated.note || '').trim();
        record.generatedModel = String(generated.model || generationModel);
        record.generatedProvider = String(generated.provider || provider);
        record.generatedAt = new Date().toISOString();
        if (!record.note) throw new Error('Generation returned an empty note.');
        writeProgress(progressFile, progress);
        process.stdout.write('ok ');
      } else {
        process.stdout.write(`${c.id} generate cached `);
      }

      for (let repeat = 0; repeat < repeats; repeat++) {
        if (record.judgments.some((judgment) => judgment.repeat === repeat)) {
          process.stdout.write(`judge${repeat + 1} cached `);
          continue;
        }
        process.stdout.write(`judge${repeat + 1}... `);
        const judged = await postJson(`${baseUrl}/api/judge`, {
          provider,
          model: judgeModel,
          source: c.source,
          note: record.note,
        }, timeoutMs);
        record.judgments.push(assertJudgePayload(judged, repeat));
        writeProgress(progressFile, progress);
        process.stdout.write('ok ');
      }
      const score = caseScoreFromPublicApi(record, repeats);
      const danger = score.fabrication.hasDangerous ? ' DANGEROUS' : '';
      console.log(`=> ${Math.round(score.narrative.normalized)}/100 fidelity ${score.narrative.dimensions.inputFidelity}/5${danger}`);
    } catch (error: any) {
      const message = `${new Date().toISOString()} ${error?.message || error}`;
      record.errors.push(message);
      writeProgress(progressFile, progress);
      console.log(`failed: ${message}`);
    }
  }

  const scores = cases.map((c) => caseScoreFromPublicApi(ensureRecord(progress, c.id), repeats));
  const summary = aggregate(system, datasetLabel(datasetDir), judgeModel, repeats, scores);
  const output = buildOutput({
    summary,
    scores,
    progressFile,
    baseUrl,
    provider,
    generationModel,
    judgeModel,
    repeats,
  });
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2) + '\n');
  console.log(`\nWrote ${outPath}`);
  console.log(JSON.stringify(output.summary, null, 2));

  if (summary.nErrored > 0) {
    process.exitCode = 1;
  }
}

const invokedDirectly = process.argv[1] && /run_public_api_benchmark\.(ts|js)$/.test(process.argv[1]);
if (invokedDirectly) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
