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
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

const SCRIBE_SYSTEM = `You are a clinical scribe. Write a complete, professional clinical note from the encounter transcript below. Use standard clinical structure (HPI; physical exam if present in the encounter; assessment and plan). Capture what the clinician said and did. Do NOT invent findings, labs, vitals, diagnoses, or workups the encounter does not support. Output only the note text.`;

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

function genClaude(model: string, source: string): string {
  const prompt = `${SCRIBE_SYSTEM}\n\n---\n\nEncounter transcript:\n\n${source}\n\nWrite the clinical note.`;
  const res = execSync(
    `claude -p ${shellEscape(prompt)} --model ${model} --output-format json --max-turns 1 --allowedTools ""`,
    { timeout: 300_000, maxBuffer: 10 * 1024 * 1024, encoding: 'utf-8', shell: '/bin/bash' },
  );
  return JSON.parse(res).result || '';
}

async function genOpenAI(model: string, source: string): Promise<string> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY not set');
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: SCRIBE_SYSTEM },
        { role: 'user', content: `Encounter transcript:\n\n${source}\n\nWrite the clinical note.` },
      ],
      temperature: 0.3,
    }),
  });
  if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data: any = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const gen = (args.gen || 'claude').toLowerCase();
  const model = args.model || (gen === 'openai' ? 'gpt-4o' : 'sonnet');
  const datasetDir = args.dataset || 'data/synthetic/cases';
  const outPath = args.out || `/tmp/baseline_${gen}_${model}.json`;

  const cases = loadCases(datasetDir);
  console.log(`Generating ${cases.length} notes with ${gen}:${model} from ${datasetDir}`);

  const notes: { caseId: string; note: string }[] = [];
  for (const c of cases) {
    const note = gen === 'openai' ? await genOpenAI(model, c.source) : genClaude(model, c.source);
    notes.push({ caseId: c.id, note });
    console.log(`  ${c.id}: ${note.length} chars`);
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(notes, null, 2));
  console.log(`\nWrote ${notes.length} notes → ${outPath}`);
  console.log('Reminder: SCORES-ONLY for closed models. Score with run_benchmark, record the row, do not commit closed-model note text.');
}

main().catch((err) => { console.error(err); process.exit(1); });
