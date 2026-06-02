/**
 * build_primock57_cases.ts — convert PriMock57 into ScribeBench cases (E4).
 *
 * PriMock57 ships:
 *   - transcripts/<base>_doctor.TextGrid + <base>_patient.TextGrid  (Praat format)
 *   - notes/<base>.json   { day, consultation, presenting_complaint, note }
 *
 * This parses both speaker TextGrids, merges their utterances in time order into a
 * Doctor:/Patient: transcript (the `source`), and pairs it with the clinician-written
 * note (the `reference`). Output: one ScribeBench case JSON per consultation.
 *
 * Usage:
 *   tsx scripts/build_primock57_cases.ts \
 *     --src data/primock57/primock57 \
 *     --out data/primock57/cases \
 *     [--limit N]
 *
 * Fetch PriMock57 first: bash scripts/fetch_primock57.sh
 */

import * as fs from 'fs';
import * as path from 'path';

interface Utterance { t: number; speaker: string; text: string; }

/** Strip Praat/PriMock57 inline markup: drop empty markers, unwrap <UNSURE>x</UNSURE>. */
function cleanText(raw: string): string {
  return raw
    .replace(/""/g, '"')      // TextGrid escapes " as ""
    .replace(/<[^>]+>/g, '')  // <UNIN/>, <UNCLEAR/> -> ''; <UNSURE>x</UNSURE> -> x
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Parse a single-tier PriMock57 TextGrid into utterances. The tier `name`
 * (Doctor/Patient) is the speaker for every interval in the file.
 */
function parseTextGrid(file: string): Utterance[] {
  const lines = fs.readFileSync(file, 'utf-8').split('\n');
  let speaker = 'Unknown';
  for (const l of lines) {
    const m = l.match(/name = "(.+?)"/);
    if (m) { speaker = m[1]; break; }
  }
  const utterances: Utterance[] = [];
  let lastXmin = 0;
  for (const l of lines) {
    const xm = l.match(/^\s*xmin = ([\d.]+)\s*$/);
    if (xm) { lastXmin = parseFloat(xm[1]); continue; }
    const tm = l.match(/^\s*text = "(.*)"\s*$/);
    if (tm) {
      const text = cleanText(tm[1]);
      if (text) utterances.push({ t: lastXmin, speaker, text });
    }
  }
  return utterances;
}

/** Merge two speakers' utterances into a time-ordered transcript string. */
function buildTranscript(doctor: Utterance[], patient: Utterance[]): string {
  const all = [...doctor, ...patient].sort((a, b) => a.t - b.t);
  return all.map((u) => `${u.speaker}: ${u.text}`).join('\n');
}

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) if (argv[i].startsWith('--')) out[argv[i].slice(2)] = argv[i + 1];
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const src = args.src || 'data/primock57/primock57';
  const outDir = args.out || 'data/primock57/cases';
  const limit = args.limit ? parseInt(args.limit, 10) : Infinity;

  const notesDir = path.join(src, 'notes');
  const transDir = path.join(src, 'transcripts');
  if (!fs.existsSync(notesDir) || !fs.existsSync(transDir)) {
    console.error(`PriMock57 not found at ${src}. Run: bash scripts/fetch_primock57.sh`);
    process.exit(1);
  }

  fs.mkdirSync(outDir, { recursive: true });
  const noteFiles = fs.readdirSync(notesDir).filter((f) => f.endsWith('.json')).sort();

  let built = 0, skipped = 0;
  for (const nf of noteFiles) {
    if (built >= limit) break;
    const base = nf.replace(/\.json$/, '');
    const docFile = path.join(transDir, `${base}_doctor.TextGrid`);
    const patFile = path.join(transDir, `${base}_patient.TextGrid`);
    if (!fs.existsSync(docFile) || !fs.existsSync(patFile)) {
      console.warn(`  skip ${base}: missing TextGrid pair`);
      skipped++;
      continue;
    }
    const note = JSON.parse(fs.readFileSync(path.join(notesDir, nf), 'utf-8'));
    const reference: string = (note.note || '').trim();
    if (!reference) { console.warn(`  skip ${base}: empty reference note`); skipped++; continue; }

    const source = buildTranscript(parseTextGrid(docFile), parseTextGrid(patFile));
    if (!source) { console.warn(`  skip ${base}: empty transcript`); skipped++; continue; }

    const day = note.day ?? base.match(/day(\d+)/)?.[1];
    const consult = note.consultation ?? base.match(/consultation(\d+)/)?.[1];
    const id = `PM57-d${day}c${String(consult).padStart(2, '0')}`;
    const out = {
      id,
      provenance: 'primock57',
      tags: ['primock57', 'primary-care'],
      source,
      reference,
    };
    fs.writeFileSync(path.join(outDir, `${id}.json`), JSON.stringify(out, null, 2) + '\n');
    built++;
  }

  console.log(`\nBuilt ${built} PriMock57 cases -> ${outDir} (${skipped} skipped)`);
  console.log('License: PriMock57 is CC-BY-4.0 (Babylon Health). Cite arXiv:2204.00333.');
}

main();
