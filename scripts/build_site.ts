/**
 * Build the static ScribeBench site into dist/.
 *
 * The site is intentionally dependency-light: copy static assets, then publish
 * a small bounded data bundle from the benchmark JSON already in this repo.
 */

import * as fs from 'fs';
import * as path from 'path';

const root = process.cwd();
const siteDir = path.join(root, 'site');
const distDir = path.join(root, 'dist');
const assetsDir = path.join(distDir, 'assets');

type CandidateNote = { caseId: string; note: string };
type BenchmarkCase = {
  id: string;
  source: string;
  reference?: string;
  tags?: string[];
  provenance: string;
};

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, 'utf-8')) as T;
}

function copyFile(from: string, to: string) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

function countJsonFiles(dir: string) {
  return fs.readdirSync(dir).filter((f) => f.endsWith('.json')).length;
}

function buildDemoCases() {
  const candidate = readJson<CandidateNote[]>(path.join(root, 'data/synthetic/example_candidate.json'));
  const notes = new Map(candidate.map((c) => [c.caseId, c.note]));
  const casesDir = path.join(root, 'data/synthetic/cases');
  const cases = fs.readdirSync(casesDir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((file) => {
      const c = readJson<BenchmarkCase>(path.join(casesDir, file));
      return {
        id: c.id,
        provenance: c.provenance,
        tags: c.tags ?? [],
        source: c.source,
        reference: c.reference ?? '',
        candidateNote: notes.get(c.id) ?? '',
      };
    });
  return { cases };
}

function main() {
  fs.rmSync(distDir, { recursive: true, force: true });
  fs.mkdirSync(assetsDir, { recursive: true });

  for (const file of ['index.html', 'styles.css', 'app.js']) {
    copyFile(path.join(siteDir, file), path.join(distDir, file));
  }

  copyFile(path.join(root, 'leaderboard/results.json'), path.join(assetsDir, 'results.json'));
  copyFile(path.join(siteDir, 'worklog.json'), path.join(assetsDir, 'worklog.json'));
  fs.writeFileSync(
    path.join(assetsDir, 'demo-cases.json'),
    JSON.stringify(buildDemoCases(), null, 2) + '\n',
  );

  const metadata = {
    generatedAt: new Date().toISOString(),
    caseCounts: {
      synthetic: countJsonFiles(path.join(root, 'data/synthetic/cases')),
      specialty: countJsonFiles(path.join(root, 'data/specialty/cases')),
      primock57: countJsonFiles(path.join(root, 'data/primock57/cases')),
      total:
        countJsonFiles(path.join(root, 'data/synthetic/cases')) +
        countJsonFiles(path.join(root, 'data/primock57/cases')),
    },
    github: 'https://github.com/napiermd/scribe-bench',
    napierMd: 'https://napiermd.me/work#clinical-ai',
  };
  fs.writeFileSync(path.join(assetsDir, 'metadata.json'), JSON.stringify(metadata, null, 2) + '\n');

  console.log(`Built ScribeBench site -> ${path.relative(root, distDir)}`);
}

main();
