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

  it('uses hero space to explain the product in plain English', () => {
    const summarySection = html.match(/<section class="summary-band">[\s\S]*?<\/section>/)?.[0] || '';

    expect(summarySection).toContain('Paste what happened. Catch what the AI made up.');
    expect(summarySection).toContain('ScribeBench is a public checker for AI-written clinical notes.');
    expect(summarySection).toContain('What this is');
    expect(summarySection).toContain('Who uses it');
    expect(summarySection).toContain('Why care');
    expect(summarySection).toContain('A no-account source-vs-note reviewer.');
    expect(summarySection).toContain('Fluent notes can invent care.');
    expect(summarySection).toContain('head CT and syncope workup that never happened');
    expect(summarySection).toContain('Paste the source encounter and the AI-written note.');
    expect(summarySection).toContain('it catches made-up care');
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
    const labStart = html.indexOf('<section class="wrap section lab-section" id="lab">');
    const demoStart = html.indexOf('<section class="wrap section split" id="demo">', labStart);
    const labSection = labStart >= 0 ? html.slice(labStart, demoStart >= 0 ? demoStart : undefined) : '';

    expect(labSection).toContain('Use the Lab when one note needs a second opinion');
    expect(labSection).toContain('lab-contract');
    expect(labSection).toContain('Use when');
    expect(labSection).toContain('One note needs review.');
    expect(labSection).toContain('Run the no-key receipt.');
    expect(labSection).toContain('You need a live judge.');
    expect(labSection).toContain('No ranking from one note.');
    expect(labSection).toContain('Ask live judge for review');
    expect(labSection).toContain('Generate demo candidate');
    expect(labSection).toContain('Provider settings (optional)');
    expect(labSection).toContain('Live models are review aids, not leaderboard rows.');
    expect(labSection).not.toContain('Model settings and temporary key');
    expect(labSection).not.toContain('Generate candidate</button>');
    expect(labSection).not.toContain('Use live models only for a second opinion.');
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
    const runStart = html.indexOf('<section class="wrap section run-panel" id="run">');
    const footerStart = html.indexOf('<footer', runStart);
    const runSection = runStart >= 0 ? html.slice(runStart, footerStart >= 0 ? footerStart : undefined) : '';
    const chooserIndex = runSection.indexOf('Choose your entry point');
    const queueIndex = runSection.indexOf('Public work queue');
    const builderIndex = runSection.indexOf('Aggregate row command builder');

    expect(runSection).toContain('Help make ScribeBench worth citing.');
    expect(runSection).toContain('You do not need to be a benchmark person.');
    expect(runSection).toContain('Only many scored notes');
    expect(runSection).toContain('What do you have in hand?');
    expect(runSection).toContain('I can unblock the current run.');
    expect(runSection).toContain('Open the blocker task');
    expect(chooserIndex).toBeGreaterThan(-1);
    expect(queueIndex).toBeGreaterThan(chooserIndex);
    expect(builderIndex).toBeGreaterThan(queueIndex);
    expect(runSection).toContain('id="public-work-queue-task"');
    expect(runSection).toContain('Copyable public task');
    expect(runSection).toContain('id="copy-public-work-task"');
    expect(runSection).toContain('Generated ScribeBench public contribution task');
    expect(runSection).not.toContain('Pick the artifact before touching the builder.');
    expect(runSection).not.toContain('Start from evidence in hand');
    expect(app).toContain('let currentPublicWorkTask = "";');
    expect(app).toContain('function buildPublicWorkTask(run, counts)');
    expect(app).toContain('ScribeBench public contribution task');
    expect(app).toContain('status: "Only for rows"');
    expect(app).toContain('Boundary: no raw closed-model notes in the public repo; this is not a current ranking until the row is complete and reviewed.');
    expect(app).toContain('bindPublicWorkTaskCopy();');
    expect(app).toContain('setPublicWorkQueueCopyStatus("Public task copied.");');
  });

  it('keeps the evidence tables framed as claim-boundary ledgers', () => {
    const leaderboardSection = html.match(/<section class="wrap section" id="leaderboard">[\s\S]*?<\/section>/)?.[0] || '';

    expect(leaderboardSection).toContain('What is useful now, and what still needs public work?');
    expect(leaderboardSection).toContain('Use it now for note review; help finish the current row for comparisons.');
    expect(leaderboardSection).toContain('Open public task');
    expect(leaderboardSection).toContain('Finish the current row before ranking anyone.');
    expect(leaderboardSection).toContain('Need 21 more scored PriMock57 cases');
    expect(leaderboardSection).toContain('A non-capped OpenRouter key, credits, or another declared provider.');
    expect(leaderboardSection).toContain('id="current-run-task-title"');
    expect(leaderboardSection).toContain('id="current-run-task-bring"');
    expect(leaderboardSection).not.toContain('Loading current PriMock57 run status');
    expect(leaderboardSection).not.toContain('Loading current-run status.');
    expect(leaderboardSection).toContain('Claim boundary');
    expect(leaderboardSection).toContain("Historical rows can support a failure-gradient claim only; they cannot crown today's best AI scribe.");
    expect(leaderboardSection).toContain('Smoke rows prove plumbing on tiny synthetic sets; they are never ranked evidence.');
    expect(app).toContain('setText("current-run-task-title"');
    expect(app).toContain('setText("current-run-task-copy"');
    expect(app).toContain('setText("current-run-task-done"');
    expect(app).toContain('const statusLabel = ranked ? "Historical only" : "Smoke only";');
    expect(app).toContain('const statusDetail = ranked ? `Baseline ${index + 1}; not current ranking` : "Plumbing proof; not ranked";');
  });
});
