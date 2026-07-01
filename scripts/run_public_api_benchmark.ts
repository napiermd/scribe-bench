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
const DEFAULT_STATUS_OUT = 'site/current-run.json';
const RANKED_DATASET = 'primock57';
const MIN_PUBLISHABLE_CASES = 30;
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

export type PublicApiCaseRecord = {
  caseId: string;
  note?: string;
  generatedModel?: string;
  generatedProvider?: string;
  generatedAt?: string;
  judgments: PublicApiJudgment[];
  errors: string[];
};

export type ProgressFile = {
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

export type CurrentRunStatus = {
  updatedAt: string;
  title: string;
  status: string;
  statusLabel: string;
  lastAttemptAt: string;
  system: string;
  dataset: string;
  targetCases: number;
  selectedCases: number;
  attemptedCases: number;
  generatedCases: number;
  scoredCases: number;
  erroredCases: number;
  minimumPublishableCases: number;
  repeats: number;
  provider: string;
  generationModel: string;
  judgeModel: string;
  lastScoredCase?: {
    caseId: string;
    normalized: number;
    inputFidelity: number;
    dangerousFabrications: number;
    standardAssumptions: number;
  };
  partialAggregate?: {
    claimLevel: 'powered' | 'smoke';
    scoredCases: number;
    erroredCases: number;
    narrativeMean: number;
    fidelityMean: number;
    dangerousFabricationRate: number;
    leakRate: number;
    note: string;
  };
  blocker: string;
  next: string;
  unblockAsk: string;
  resumeCommand: string;
  rawNotesPolicy: string;
  links: { label: string; href: string }[];
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
  callerKeyForwarded?: boolean;
}): string {
  const selfJudged = args.generationModel === args.judgeModel;
  const scope = args.nErrored
    ? `${args.n} scored cases with ${args.nErrored} errored/excluded`
    : `${args.n} scored cases`;
  const selfJudgeText = selfJudged
    ? ' Generator and judge are the same model, so treat this as current public-path evidence, not a judge-robustness claim.'
    : '';
  const keyText = args.callerKeyForwarded
    ? ' A caller-supplied provider key was forwarded to the public API headers and was not stored in the progress cache.'
    : '';
  return [
    `Generated and judged through ${args.baseUrl} using provider=${args.provider}.`,
    `Generation model: ${args.generationModel}. Judge model: ${args.judgeModel}.`,
    `Scope: ${scope}, repeats=${args.repeats}. Raw generated notes are not published.`,
    keyText.trim(),
    selfJudgeText.trim(),
  ].filter(Boolean).join(' ');
}

export function providerKeyHeaders(
  provider: string,
  env: Record<string, string | undefined> = process.env,
  explicitEnvName?: string,
): Record<string, string> {
  const keyEnvName = explicitEnvName || {
    openrouter: 'OPENROUTER_API_KEY',
    baseten: 'BASETEN_API_KEY',
  }[provider];
  const headerName = {
    openrouter: 'x-openrouter-key',
    baseten: 'x-baseten-key',
  }[provider];
  const value = keyEnvName ? env[keyEnvName] : undefined;
  return headerName && value ? { [headerName]: value } : {};
}

export function isProviderRateLimitError(value = '') {
  return /rate limit|too many requests|HTTP 429|quota exceeded|free-models?-per-(?:day|min|minute)|free model/i.test(value);
}

export function attemptedRecord(record: PublicApiCaseRecord) {
  return Boolean(record.note) || (record.judgments || []).length > 0 || (record.errors || []).length > 0;
}

export function summarizeIds(ids: string[], limit = 6) {
  if (ids.length <= limit) return ids.join(', ');
  return `${ids.slice(0, limit).join(', ')}; +${ids.length - limit} more`;
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

async function postJson(url: string, body: unknown, timeoutMs: number, extraHeaders: Record<string, string> = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...extraHeaders },
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
  callerKeyForwarded: boolean;
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
    callerKeyForwarded: args.callerKeyForwarded,
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
      callerKeyForwarded: args.callerKeyForwarded,
    },
  };
}

export function buildCurrentRunStatus(args: {
  progress: ProgressFile;
  selectedCases: BenchmarkCase[];
  scores: CaseScore[];
  targetCases: number;
  baseUrl: string;
  outPath: string;
  timeoutMs: number;
  keyEnv?: string;
  updatedAt?: string;
}): CurrentRunStatus {
  const selectedIds = new Set(args.selectedCases.map((c) => c.id));
  const records = args.selectedCases.map((c) => ensureRecord(args.progress, c.id));
  const attempted = records.filter(attemptedRecord).length;
  const generated = records.filter((record) => Boolean(record.note)).length;
  const scored = records.filter((record) => Boolean(record.note) && completeJudgments(record, args.progress.repeats)).length;
  const errored = records.filter((record) => !completeJudgments(record, args.progress.repeats) && record.errors.length > 0).length;
  const latestScored = [...args.scores].reverse().find((score) => selectedIds.has(score.caseId) && !score.errored);
  const latestErrorRecord = latestErroredRecord(records, args.progress.repeats);
  const latestError = latestErrorRecord ? cleanRunError(latestErrorRecord.errors[latestErrorRecord.errors.length - 1]) : '';
  const summary = aggregate(
    args.progress.system,
    datasetLabel(args.progress.dataset),
    args.progress.judgeModel,
    args.progress.repeats,
    args.scores,
  );
  const claimLevel = summary.dataset === RANKED_DATASET && summary.n >= MIN_PUBLISHABLE_CASES ? 'powered' : 'smoke';
  const blockedIds = records
    .filter((record) => !completeJudgments(record, args.progress.repeats) && record.errors.length > 0)
    .map((record) => record.caseId);
  const status = scored >= MIN_PUBLISHABLE_CASES ? 'ready' : latestError ? 'needs-credit-or-second-judge' : 'running';
  const rateLimited = isProviderRateLimitError(latestError);
  const statusLabel = status === 'ready'
    ? 'Ready for review'
    : status === 'running'
      ? 'Running'
      : rateLimited
        ? 'Free-model cap hit'
        : 'Needs credits or second judge';
  const datasetName = displayDatasetName(args.progress.dataset);
  const blocker = latestError
    ? [
      `Latest public API retry selected ${records.length} ${datasetName} cases through ${args.baseUrl}.`,
      `${scored}/${records.length} selected cases are scored and ${generated}/${records.length} have generated notes.`,
      rateLimited ? 'Provider rate limit stopped this attempt before the remaining selected cases could be scored.' : '',
      blockedIds.length ? `Blocked/errored cases: ${summarizeIds(blockedIds)}.` : '',
      `Latest blocker: ${latestError}.`,
    ].filter(Boolean).join(' ')
    : scored >= MIN_PUBLISHABLE_CASES
      ? `Current public API run has ${scored}/${args.targetCases} scored cases and is ready for aggregate review before publication.`
      : `Current public API run has ${scored}/${args.targetCases} scored cases and no active blocker recorded. Continue the cached run before making a ranked claim.`;

  return {
    updatedAt: dateOnly(args.updatedAt || new Date().toISOString()),
    title: 'Current PriMock57 public API attempt',
    status,
    statusLabel,
    lastAttemptAt: args.progress.updatedAt,
    system: args.progress.system,
    dataset: datasetLabel(args.progress.dataset) === RANKED_DATASET ? 'PriMock57' : datasetLabel(args.progress.dataset),
    targetCases: args.targetCases,
    selectedCases: records.length,
    attemptedCases: attempted,
    generatedCases: generated,
    scoredCases: scored,
    erroredCases: errored,
    minimumPublishableCases: MIN_PUBLISHABLE_CASES,
    repeats: args.progress.repeats,
    provider: args.progress.provider,
    generationModel: args.progress.generationModel,
    judgeModel: args.progress.judgeModel,
    ...(latestScored ? {
      lastScoredCase: {
        caseId: latestScored.caseId,
        normalized: Math.round(latestScored.narrative.normalized),
        inputFidelity: latestScored.narrative.dimensions.inputFidelity,
        dangerousFabrications: latestScored.fabrication.dangerous.length,
        standardAssumptions: latestScored.fabrication.standard.length,
      },
    } : {}),
    ...(summary.n ? {
      partialAggregate: {
        claimLevel,
        scoredCases: summary.n,
        erroredCases: summary.nErrored,
        narrativeMean: summary.narrativeMean,
        fidelityMean: summary.fidelityMean,
        dangerousFabricationRate: summary.dangerousFabricationRate,
        leakRate: summary.leakRate,
        note: claimLevel === 'powered'
          ? 'Meets the minimum case threshold, but still needs method review before publication.'
          : `Partial current public-path evidence only: ${summary.n}/${args.targetCases} target cases scored, below the ${MIN_PUBLISHABLE_CASES}-case publishable threshold.`,
      },
    } : {}),
    blocker,
    next: scored >= MIN_PUBLISHABLE_CASES
      ? 'Review exclusions, judge details, confidence intervals, and self-judge limitations before copying the aggregate row into leaderboard/results.json.'
      : 'Add OpenRouter credits, pass a non-capped local provider key with --key-env, or configure a faster second judge, then resume the cached run toward at least 30 completed PriMock57 cases before publishing any ranked current row.',
    unblockAsk: scored >= MIN_PUBLISHABLE_CASES
      ? 'This run has enough scored cases for aggregate review. Verify the method details and publish scores only, not raw closed-model notes.'
      : `This is not a model result yet: ${scored}/${attempted || records.length} attempted cases and ${scored}/${args.targetCases} target cases are scored. Have a non-capped provider key or credits? Keep the key in your shell, resume the public API runner, and publish aggregate scores only after at least 30 PriMock57 cases are scored.`,
    resumeCommand: buildResumeCommand({
      baseUrl: args.baseUrl,
      dataset: args.progress.dataset,
      system: args.progress.system,
      repeats: args.progress.repeats,
      limit: Math.max(records.length, MIN_PUBLISHABLE_CASES),
      timeoutMs: args.timeoutMs,
      keyEnv: args.keyEnv || defaultKeyEnv(args.progress.provider),
      outPath: args.outPath,
    }),
    rawNotesPolicy: 'Raw generated notes remain in the ignored local progress cache and are not committed.',
    links: [
      { label: 'Runner source', href: 'https://github.com/napiermd/scribe-bench/blob/main/scripts/run_public_api_benchmark.ts' },
      { label: 'Evidence ledger', href: '#leaderboard' },
      { label: 'Run builder', href: '#run' },
    ],
  };
}

function displayDatasetName(dataset: string) {
  const label = datasetLabel(dataset);
  return label === RANKED_DATASET ? 'PriMock57' : label;
}

function completeJudgments(record: PublicApiCaseRecord, repeats: number) {
  return (record.judgments || []).filter((judgment) => Number.isInteger(judgment.repeat)).length >= repeats;
}

function latestErroredRecord(records: PublicApiCaseRecord[], repeats: number) {
  return records
    .filter((record) => !completeJudgments(record, repeats) && record.errors.length > 0)
    .sort((a, b) => String(a.errors[a.errors.length - 1]).localeCompare(String(b.errors[b.errors.length - 1])))
    .at(-1);
}

function cleanRunError(value = '') {
  return String(value).replace(/^\d{4}-\d{2}-\d{2}T[^\s]+\s+/, '').trim();
}

function dateOnly(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value.slice(0, 10) : date.toISOString().slice(0, 10);
}

function defaultKeyEnv(provider: string) {
  return {
    openrouter: 'OPENROUTER_API_KEY',
    baseten: 'BASETEN_API_KEY',
  }[provider] || 'PROVIDER_API_KEY';
}

function buildResumeCommand(args: {
  baseUrl: string;
  dataset: string;
  system: string;
  repeats: number;
  limit: number;
  timeoutMs: number;
  keyEnv: string;
  outPath: string;
}) {
  return [
    `export ${args.keyEnv}=...`,
    'npm run bench:public-api -- \\',
    `  --base-url ${args.baseUrl} \\`,
    `  --dataset ${args.dataset} \\`,
    `  --system ${args.system} \\`,
    `  --repeats ${args.repeats} \\`,
    `  --limit ${args.limit} \\`,
    `  --timeout ${args.timeoutMs} \\`,
    `  --key-env ${args.keyEnv} \\`,
    `  --out ${args.outPath} \\`,
    `  --status-out ${DEFAULT_STATUS_OUT}`,
  ].join('\n');
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
  const apiHeaders = providerKeyHeaders(provider, process.env, args['key-env']);
  const callerKeyForwarded = Object.keys(apiHeaders).length > 0;
  const allCases = loadCases(datasetDir);
  const cases = selectedCases(allCases, args);

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
  console.log(`  callerKeyForwarded=${callerKeyForwarded ? 'yes' : 'no'}`);
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
        }, timeoutMs, apiHeaders);
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
        }, timeoutMs, apiHeaders);
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
      if (isProviderRateLimitError(message)) {
        console.log('Stopping run: provider rate limit reached. Resume after adding credits, waiting for the cap, or forwarding a non-capped key.');
        break;
      }
    }
  }

  const scores = cases
    .map((c) => ensureRecord(progress, c.id))
    .filter(attemptedRecord)
    .map((record) => caseScoreFromPublicApi(record, repeats));
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
    callerKeyForwarded,
  });
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2) + '\n');
  console.log(`\nWrote ${outPath}`);
  console.log(JSON.stringify(output.summary, null, 2));

  const statusOut = statusOutPath(args, datasetDir);
  if (statusOut) {
    const status = buildCurrentRunStatus({
      progress,
      selectedCases: cases,
      scores,
      targetCases: allCases.length,
      baseUrl,
      outPath,
      timeoutMs,
      keyEnv: args['key-env'],
    });
    fs.mkdirSync(path.dirname(statusOut), { recursive: true });
    fs.writeFileSync(statusOut, JSON.stringify(status, null, 2) + '\n');
    console.log(`Wrote ${statusOut}`);
  }

  if (summary.nErrored > 0) {
    process.exitCode = 1;
  }
}

function statusOutPath(args: Args, datasetDir: string) {
  if (args['no-status'] === 'true' || args['status-out'] === 'false') return '';
  if (args['status-out'] && args['status-out'] !== 'true') return args['status-out'];
  return datasetLabel(datasetDir) === RANKED_DATASET ? DEFAULT_STATUS_OUT : '';
}

const invokedDirectly = process.argv[1] && /run_public_api_benchmark\.(ts|js)$/.test(process.argv[1]);
if (invokedDirectly) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
