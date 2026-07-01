import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const html = readFileSync(new URL('../site/index.html', import.meta.url), 'utf8');
const app = readFileSync(new URL('../site/app.js', import.meta.url), 'utf8');

describe('site copy and labels', () => {
  it('keeps quick-check result ownership dynamic instead of demo-labeled', () => {
    expect(html).toContain('id="quick-result-label"');
    expect(html).not.toContain('>Default artifact<');
    expect(app).toContain('setText("quick-result-label", quickResultLabel(result));');
    expect(app).toContain('function quickResultLabel(result)');
    expect(app).toContain('"Your QA packet"');
    expect(app).toContain('"Seeded example receipt"');
  });

  it('uses hero space to explain visitor jobs instead of duplicating the seeded receipt', () => {
    const summarySection = html.match(/<section class="summary-band">[\s\S]*?<\/section>/)?.[0] || '';

    expect(summarySection).toContain('What people do here');
    expect(summarySection).toContain('Turn source-vs-note doubt into a shareable artifact.');
    expect(summarySection).toContain('Clinical reviewer');
    expect(summarySection).toContain('Buyer or operator');
    expect(summarySection).toContain('Builder or contributor');
    expect(summarySection).toContain('Paste one encounter and AI note');
    expect(summarySection).not.toContain('The first loaded case shows the point immediately.');
    expect(summarySection).not.toContain('CT head was negative; syncope workup started.');
  });

  it('keeps model smoke out of the first note-checking task', () => {
    const quickForm = html.match(/<form class="quick-check-form"[\s\S]*?<\/form>/)?.[0] || '';
    const labSectionStart = html.indexOf('<section class="wrap section lab-section" id="lab">');
    const labWorkbenchStart = html.indexOf('<div class="lab-shell" id="lab-workbench">');
    const modelLaneStart = html.indexOf('<div class="current-model-lane"');

    expect(quickForm).toContain('id="quick-run-local"');
    expect(quickForm).toContain('href="#lab-workbench"');
    expect(quickForm).not.toContain('run-live-smoke-top');
    expect(quickForm).not.toContain('Smoke current models');
    expect(labSectionStart).toBeGreaterThan(-1);
    expect(labWorkbenchStart).toBeGreaterThan(labSectionStart);
    expect(modelLaneStart).toBeGreaterThan(labWorkbenchStart);
    expect(app).toContain('return ["current-model-run-smoke"]');
  });

  it('opens second-opinion handoffs on the Lab workbench', () => {
    expect(app).toContain('window.history.replaceState(null, "", "#lab-workbench")');
    expect(app).toContain('document.getElementById("lab-workbench")');
    expect(app).toContain('Use for note review now; add aggregate rows only when comparing systems.');
    expect(app).toContain('URL: https://scribe-bench.vercel.app/#lab-workbench');
  });

  it('makes Lab copied packets reviewer-ready instead of benchmark-first', () => {
    expect(html).toContain('Copy review packet');
    expect(html).toContain('Copy detailed review');
    expect(html).toContain('What to do with this result');
    expect(html).not.toContain('Copy evidence packet');
    expect(html).not.toContain('Copy full QA summary');
    expect(app).toContain('ScribeBench note review packet');
    expect(app).toContain('ScribeBench detailed note review');
    expect(app).toContain('Use now: ${packet.nextStep}');
    expect(app).toContain('Boundary: one source-note pair, not a leaderboard row, system certification, or clinical clearance.');
    expect(app).toContain('Note says: ${detail.noteExcerpt}');
    expect(app).toContain('${label}: ${detail.sourceExcerpt}');
  });

  it('makes the first copied note artifact reviewer-ready', () => {
    const quickSection = html.match(/<div class="quick-result" id="quick-result"[\s\S]*?<form class="quick-check-form"/)?.[0] || '';

    expect(quickSection).toContain('Copy review packet');
    expect(quickSection).toContain('Copy-ready review packet');
    expect(quickSection).toContain('ScribeBench source-vs-note review packet');
    expect(app).toContain('ScribeBench note review packet');
    expect(app).toContain('Use now: ${useNow}');
    expect(app).toContain('Verdict: ${verdict.title}');
    expect(app).toContain('What happened: ${verdict.copy}');
    expect(app).toContain('Flagged source-note evidence:');
    expect(app).toContain('What this can support:');
    expect(app).toContain('Boundary: one source-note pair, browser-only local check, not a leaderboard row, system certification, or clinical clearance.');
    expect(app).toContain('setQuickCopyStatus("Review packet copied.");');
  });

  it('answers the cold visitor question before repo machinery', () => {
    const guideSection = html.match(/<section class="wrap section public-guide-section" id="next-steps">[\s\S]*?<\/section>/)?.[0] || '';
    const answerStripIndex = guideSection.indexOf('guide-answer-strip');
    const guideGridIndex = guideSection.indexOf('guide-grid');
    const repoSystemIndex = guideSection.indexOf('guide-system');

    expect(answerStripIndex).toBeGreaterThan(-1);
    expect(answerStripIndex).toBeLessThan(guideGridIndex);
    expect(answerStripIndex).toBeLessThan(repoSystemIndex);
    expect(guideSection).toContain('For whom');
    expect(guideSection).toContain('What to paste');
    expect(guideSection).toContain('What you get');
    expect(guideSection).toContain('What not to claim');
    expect(guideSection).toContain('Paste a source encounter and generated note');
    expect(guideSection).toContain('Someone holding evidence.');
    expect(guideSection).toContain('Source plus generated note.');
    expect(guideSection).toContain('A review packet.');
    expect(guideSection).toContain('Not a ranking or clearance.');
    expect(guideSection).toContain('I need to review one AI-scribe note.');
    expect(guideSection).toContain('I need to challenge a public AI-scribe claim.');
    expect(guideSection).toContain('I can add evidence people can cite.');
    expect(guideSection).not.toContain('The repo is a public clinical-AI QA workbench');
    expect(guideSection).not.toContain('The site, APIs, TypeScript evaluator');
  });

  it('keeps claim-generated evidence cards in the public-claim context', () => {
    expect(html).toContain('id="public-card-claim-link"');
    expect(html).toContain('id="public-card-row-link"');
    expect(app).toContain('selectStartRoute("buyer")');
    expect(app).toContain('kind: "claim"');
    expect(app).toContain('function renderPublicEvidenceCardActions(card)');
    expect(app).toContain('copy.textContent = isClaimCard ? "Copy claim card" : "Copy evidence card";');
    expect(app).toContain('ownNote.textContent = isClaimCard ? "Check source-note pair" : "Check your own note";');
  });

  it('makes the public work queue copyable as a contribution task', () => {
    const runSection = html.match(/<section class="wrap section run-panel" id="run">[\s\S]*?<\/section>/)?.[0] || '';

    expect(runSection).toContain('id="public-work-queue-task"');
    expect(runSection).toContain('Copyable public task');
    expect(runSection).toContain('id="copy-public-work-task"');
    expect(runSection).toContain('Generated ScribeBench public contribution task');
    expect(app).toContain('let currentPublicWorkTask = "";');
    expect(app).toContain('function buildPublicWorkTask(run, counts)');
    expect(app).toContain('ScribeBench public contribution task');
    expect(app).toContain('Boundary: no raw closed-model notes in the public repo; this is not a current ranking until the row is complete and reviewed.');
    expect(app).toContain('bindPublicWorkTaskCopy();');
    expect(app).toContain('setPublicWorkQueueCopyStatus("Public task copied.");');
  });

  it('keeps the evidence tables framed as claim-boundary ledgers', () => {
    const leaderboardSection = html.match(/<section class="wrap section" id="leaderboard">[\s\S]*?<\/section>/)?.[0] || '';

    expect(leaderboardSection).toContain('Claim boundary');
    expect(leaderboardSection).toContain("Historical rows can support a failure-gradient claim only; they cannot crown today's best AI scribe.");
    expect(leaderboardSection).toContain('Smoke rows prove plumbing on tiny synthetic sets; they are never ranked evidence.');
    expect(app).toContain('const statusLabel = ranked ? "Historical only" : "Smoke only";');
    expect(app).toContain('const statusDetail = ranked ? `Baseline ${index + 1}; not current ranking` : "Plumbing proof; not ranked";');
  });
});
