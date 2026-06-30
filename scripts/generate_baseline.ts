/**
 * generate_baseline.ts — generate candidate notes from a model, for baseline rows (E2).
 *
 * Produces a [{ caseId, note }] file you can feed to eval/run_benchmark.ts. Used to
 * seed the leaderboard with real model baselines.
 *
 * DATA POLICY: for the public leaderboard we publish SCORES ONLY for closed models
 * (provider output terms). The generated notes here stay local — score them, record
 * the aggregate row, do NOT commit closed-model note text. Open-weight / own-run notes
 * may be published.
 *
 * Usage:
 *   # Claude via OAuth CLI (no key):
 *   tsx scripts/generate_baseline.ts --gen claude --model sonnet \
 *     --dataset data/synthetic/cases --out /tmp/claude_notes.json
 *
 *   # OpenAI (needs OPENAI_API_KEY):
 *   tsx scripts/generate_baseline.ts --gen openai --model gpt-4o \
 *     --dataset data/synthetic/cases --out /tmp/gpt_notes.json
 *
 *   # OpenRouter (needs OPENROUTER_API_KEY):
 *   tsx scripts/generate_baseline.ts --gen openrouter \
 *     --model nvidia/nemotron-3-ultra-550b-a55b:free \
 *     --dataset data/synthetic/cases --out /tmp/openrouter_notes.json
 *
 *   # Baseten Model APIs (needs BASETEN_API_KEY):
 *   tsx scripts/generate_baseline.ts --gen baseten \
 *     --model deepseek-ai/DeepSeek-V4-Pro \
 *     --dataset data/synthetic/cases --out /tmp/baseten_notes.json
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

const SCRIBE_SYSTEM = `You are a clinical scribe. Write a complete, professional clinical note from the encounter transcript below. Use standard clinical structure (HPI; physical exam if present in the encounter; assessment and plan). Capture what the clinician said and did. Do NOT invent findings, labs, vitals, diagnoses, or workups the encounter does not support. Output only the note text.`;
type ChatGeneratorConfig = {
  name: string;
  endpoint: string;
  apiKeyEnv: string;
  defaultModel: string;
  extraHeaders?: Record<string, string>;
};

const CHAT_GENERATORS: Record<string, ChatGeneratorConfig> = {
  openai: {
    name: 'openai',
    endpoint: 'https://api.openai.com/v1/chat/completions',
    apiKeyEnv: 'OPENAI_API_KEY',
    defaultModel: 'gpt-4o',
  },
  openrouter: {
    name: 'openrouter',
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    apiKeyEnv: 'OPENROUTER_API_KEY',
    defaultModel: 'nvidia/nemotron-3-ultra-550b-a55b:free',
    extraHeaders: {
      'http-referer': 'https://scribe-bench.vercel.app',
      'x-openrouter-title': 'ScribeBench Candidate Generation',
    },
  },
  baseten: {
    name: 'baseten',
    endpoint: 'https://inference.baseten.co/v1/chat/completions',
    apiKeyEnv: 'BASETEN_API_KEY',
    defaultModel: 'deepseek-ai/DeepSeek-V4-Pro',
  },
};

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) if (argv[i].startsWith('--')) out[argv[i].slice(2)] = argv[i + 1];
  return out;
}

function loadCases(dir: string): { id: string; source: string }[] {
  return fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort()
    .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8')));
}

function shellEscape(s: string): string {
  return "$'" + s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')
    .replace(/\t/g, '\\t').replace(/\$/g, '\\$').replace(/`/g, '\\`').replace(/!/g, '\\!')
    .replace(/\x00/g, '').replace(/\x1b/g, '\\x1b') + "'";
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const fileSafe = (value: string) => value.replace(/[^a-z0-9_.-]+/gi, '-').replace(/^-|-$/g, '');

async function genClaude(model: string, source: string, maxRetries = 4): Promise<string> {
  const prompt = `${SCRIBE_SYSTEM}\n\n---\n\nEncounter transcript:\n\n${source}\n\nWrite the clinical note.`;
  let lastErr = '';
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = execSync(
        `claude -p ${shellEscape(prompt)} --model ${shellEscape(model)} --output-format json --max-turns 1 --allowedTools ""`,
        { timeout: 300_000, maxBuffer: 10 * 1024 * 1024, encoding: 'utf-8', shell: '/bin/bash' },
      );
      const parsed = JSON.parse(res);
      // The CLI returns is_error:true for transient API/socket errors — retry those.
      if (parsed.is_error) throw new Error(String(parsed.result || 'is_error').slice(0, 140));
      if (!parsed.result) throw new Error('empty result');
      return parsed.result;
    } catch (e: any) {
      lastErr = e?.message?.slice(0, 160) || String(e);
      if (attempt < maxRetries) await sleep(2000 * 2 ** (attempt - 1));
    }
  }
  throw new Error(`claude gen failed after ${maxRetries} attempts: ${lastErr}`);
}

async function genChatCompletion(config: ChatGeneratorConfig, model: string, source: string, maxRetries = 4): Promise<string> {
  const key = process.env[config.apiKeyEnv];
  if (!key) throw new Error(`${config.apiKeyEnv} not set`);
  let lastErr = '';
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(config.endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${key}`,
          ...(config.extraHeaders || {}),
        },
        body: JSON.stringify({
          model,
          temperature: 0.3,
          max_tokens: 2200,
          messages: [
            { role: 'system', content: SCRIBE_SYSTEM },
            { role: 'user', content: `Encounter transcript:\n\n${source}\n\nWrite the clinical note.` },
          ],
        }),
      });
      const raw = await res.text();
      let data: any = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch (_) {
        data = { error: { message: raw.slice(0, 300) } };
      }
      if (!res.ok) {
        const detail = data?.error?.message || data?.message || JSON.stringify(data).slice(0, 300);
        throw new Error(`${config.name} HTTP ${res.status}: ${detail}`);
      }
      const content = data?.choices?.[0]?.message?.content || data?.choices?.[0]?.text || '';
      const note = Array.isArray(content)
        ? content.map((part: any) => part?.text || '').join('')
        : String(content || '');
      if (!note) throw new Error('empty completion');
      return note;
    } catch (e: any) {
      lastErr = e?.message?.slice(0, 160) || String(e);
      if (attempt < maxRetries) await sleep(2000 * 2 ** (attempt - 1));
    }
  }
  throw new Error(`${config.name} gen failed after ${maxRetries} attempts: ${lastErr}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const gen = (args.gen || 'claude').toLowerCase();
  const supported = new Set(['claude', ...Object.keys(CHAT_GENERATORS)]);
  if (!supported.has(gen)) {
    console.error(`Unsupported --gen "${gen}". Use one of: ${Array.from(supported).join(', ')}`);
    process.exit(1);
  }
  const model = args.model || CHAT_GENERATORS[gen]?.defaultModel || 'sonnet';
  const datasetDir = args.dataset || 'data/synthetic/cases';
  const outPath = args.out || `/tmp/baseline_${gen}_${fileSafe(model)}.json`;

  const cases = loadCases(datasetDir);
  console.log(`Generating ${cases.length} notes with ${gen}:${model} from ${datasetDir}`);

  const notes: { caseId: string; note: string }[] = [];
  for (const c of cases) {
    const note = gen === 'claude'
      ? await genClaude(model, c.source)
      : await genChatCompletion(CHAT_GENERATORS[gen] || CHAT_GENERATORS.openai, model, c.source);
    notes.push({ caseId: c.id, note });
    console.log(`  ${c.id}: ${note.length} chars`);
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(notes, null, 2));
  console.log(`\nWrote ${notes.length} notes → ${outPath}`);
  console.log('Reminder: SCORES-ONLY for closed models. Score with run_benchmark, record the row, do not commit closed-model note text.');
}

main().catch((err) => { console.error(err); process.exit(1); });
