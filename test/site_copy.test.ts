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

    expect(summarySection).toContain('NapierMD public clinical AI QA');
    expect(summarySection).toContain('Check whether an AI scribe invented care.');
    expect(summarySection).toContain('Paste the source encounter and the AI-written note.');
    expect(summarySection).toContain('unsupported tests, diagnoses, medications, follow-up, and events');
    expect(summarySection).toContain('Why this exists');
    expect(summarySection).toContain('Documentation AI only matters if the signed record stays true.');
    expect(summarySection).toMatch(/13 hospital sites,\s+42 tracked physician\s+complaints,\s+and 1,089 closed-loop iterations/);
    expect(summarySection).toContain('Read the NapierMD proof trail');
    expect(summarySection).toContain('What this is');
    expect(summarySection).toContain('Who uses it');
    expect(summarySection).toContain('What you leave with');
    expect(summarySection).toContain('A no-account source-vs-note checker.');
    expect(summarySection).toContain('People holding evidence, not spectators.');
    expect(summarySection).toContain('A review packet first; aggregate rows only with many notes.');
    expect(summarySection).toContain('it catches made-up care');
    expect(summarySection).toContain('signed clinical notes have to stay true');
    expect(summarySection).toContain('Start with one review packet; make system claims only');
    expect(summarySection).not.toContain('Paste what happened. Catch what the AI made up.');
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

    expect(labSection).toContain('Use the Lab only when one note needs a second read.');
    expect(labSection).toContain('lab-contract');
    expect(labSection).toContain('Use when');
    expect(labSection).toContain('Start from the browser receipt.');
    expect(labSection).toContain('A flagged source-note pair needs a second read.');
    expect(labSection).toContain('Run or copy the browser receipt.');
    expect(labSection).toContain('A live judge would help adjudicate the flagged claim.');
    expect(labSection).toContain('No ranking from a Lab call.');
    expect(labSection).toContain('Ask live judge for review');
    expect(labSection).toContain('Generate demo candidate');
    expect(labSection).toContain('Provider settings (optional)');
    expect(labSection).toContain('Second-opinion models stay behind the receipt.');
    expect(labSection).toContain('Provider status for second reads');
    expect(labSection).toContain('Test second-read path');
    expect(labSection).not.toContain('Model settings and temporary key');
    expect(labSection).not.toContain('Generate candidate</button>');
    expect(labSection).not.toContain('Use live models only for a second opinion.');
    expect(labSection).not.toContain('Run one-note smoke');
    expect(labSection).not.toContain('Current free models available for smoke checks');
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
    expect(app).toContain('Second-read models available');
    expect(app).toContain('Smoke only');
    expect(app).toContain('Provider ready');
    expect(app).not.toContain('returned ${count} usable model');
    expect(app).not.toContain('Smoke current models');
  });

  it('makes the first copied note artifact reviewer-ready', () => {
    const quickSection = html.match(/<div class="quick-result" id="quick-result"[\s\S]*?<form class="quick-check-form"/)?.[0] || '';

    expect(quickSection).toContain('Copy review packet');
    expect(quickSection).toContain('Copy-ready review packet');
    expect(quickSection).toContain('ScribeBench source-vs-note review packet');
    expect(app).toContain('ScribeBench note review packet');
    expect(app).toContain('function renderQuickUseActions(result)');
    expect(app).toContain('ownNote.textContent = isSeeded ? "Check your own note" : "Check another note";');
    expect(app).toContain('copy.textContent = isSeeded ? "Copy review packet" : "Copy this review packet";');
    expect(app).toContain('copy.className = `button ${isSeeded ? "secondary" : "primary"} compact-button`;');
    expect(app).toContain('Hold the note and copy the review packet.');
    expect(app).toContain('Fix or verify the flagged claim');
    expect(app).toContain('Treat this as clean triage, not clearance.');
    expect(app).toContain('Use now: ${useNow}');
    expect(app).toContain('Verdict: ${verdict.title}');
    expect(app).toContain('What happened: ${verdict.copy}');
    expect(app).toContain('Flagged source-note evidence:');
    expect(app).toContain('What this can support:');
    expect(app).toContain('Boundary: one source-note pair, browser-only local check, not a leaderboard row, system certification, or clinical clearance.');
    expect(app).toContain('setQuickCopyStatus("Review packet copied.");');
    expect(app).toContain('resetQuickArtifacts();');
    expect(app).not.toContain('publicEvidenceCardFromQuickResult');
    expect(app).not.toContain('renderPublicEvidenceCard(publicEvidenceCardFromQuickResult');
    expect(html).toContain('Challenge a claim or test the second-read path to create one concise public card.');
  });

  it('answers the cold visitor question before repo machinery', () => {
    const guideSection = html.match(/<section class="wrap section public-guide-section" id="next-steps">[\s\S]*?<\/section>/)?.[0] || '';
    const answerStripIndex = guideSection.indexOf('guide-answer-strip');
    const artifactKitIndex = guideSection.indexOf('artifact-kit');
    const guideGridIndex = guideSection.indexOf('guide-grid');
    const repoSystemIndex = guideSection.indexOf('guide-system');

    expect(answerStripIndex).toBe(-1);
    expect(guideGridIndex).toBe(-1);
    expect(artifactKitIndex).toBeGreaterThan(-1);
    expect(repoSystemIndex).toBeGreaterThan(artifactKitIndex);
    expect(guideSection).toContain('Leave with one artifact, not another demo screenshot.');
    expect(guideSection).toContain('The first screen already handles the note check.');
    expect(guideSection).toMatch(/packet,\s+ask,\s+blocker receipt,\s+or aggregate row/);
    expect(guideSection).toContain('Public action kit');
    expect(guideSection).toContain('Pick the artifact that matches the evidence you actually have.');
    expect(guideSection).toContain('Review packet');
    expect(guideSection).toContain('For one note that may have invented care.');
    expect(guideSection).toContain('Claim ask');
    expect(guideSection).toContain('For a vendor, model, or pilot claim.');
    expect(guideSection).toContain('Blocker receipt');
    expect(guideSection).toContain('For build-in-public progress.');
    expect(guideSection).toContain('Aggregate row');
    expect(guideSection).toContain('For claims about a system, not one note.');
    expect(guideSection).toContain('Copy what is scored, what is blocked, and the exact next run task.');
    expect(guideSection).not.toContain('For whom');
    expect(guideSection).not.toContain('What to paste');
    expect(guideSection).not.toContain('I need to review one AI-scribe note.');
    expect(guideSection).not.toContain('I need to challenge a public AI-scribe claim.');
    expect(guideSection).not.toContain('I can add evidence people can cite.');
    expect(guideSection).not.toContain('The repo is a public clinical-AI QA workbench');
    expect(guideSection).not.toContain('The site, APIs, TypeScript evaluator');
  });

  it('keeps claim-generated evidence cards in the public-claim context', () => {
    const claimStart = html.indexOf('<section class="wrap section claim-section" id="claim-check">');
    const evidenceStart = html.indexOf('<section class="wrap section" id="leaderboard">', claimStart);
    const claimSection = claimStart >= 0 ? html.slice(claimStart, evidenceStart >= 0 ? evidenceStart : undefined) : '';
    const askIndex = claimSection.indexOf('claim-ask-preview');
    const outputGridIndex = claimSection.indexOf('claim-output-grid');
    const evidencePathIndex = claimSection.indexOf('claim-evidence-path');

    expect(claimSection).toContain('Turn a vague AI-scribe claim into an evidence ask.');
    expect(claimSection).toContain('data-copy-claim-ask');
    expect(claimSection).toContain('Copyable public ask');
    expect(claimSection).toContain('Paste this into the next diligence thread.');
    expect(claimSection).toContain('id="copy-claim-ask-output"');
    expect(claimSection).toContain('<pre class="code-block"><code id="claim-public-ask"></code></pre>');
    expect(askIndex).toBeGreaterThan(-1);
    expect(askIndex).toBeLessThan(outputGridIndex);
    expect(askIndex).toBeLessThan(evidencePathIndex);
    expect(html).toContain('id="public-card-claim-link"');
    expect(html).toContain('id="public-card-row-link"');
    expect(app).toContain('selectStartRoute("buyer")');
    expect(app).toContain('kind: "claim"');
    expect(app).toContain('document.querySelectorAll("[data-copy-claim-ask]").forEach((button) => {');
    expect(app).toContain('function renderPublicEvidenceCardActions(card)');
    expect(app).toContain('copy.textContent = isClaimCard ? "Copy claim card" : "Copy evidence card";');
    expect(app).toContain('ownNote.textContent = isClaimCard ? "Check source-note pair" : "Check your own note";');
    expect(html).not.toContain('id="current-challenge"');
    expect(html).not.toContain('Powered-row challenge');
    expect(app).not.toContain('bindChallengePlanner');
    expect(app).not.toContain('challengePlans');
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
    const taskIndex = leaderboardSection.indexOf('evidence-task-card');
    const answerIndex = leaderboardSection.indexOf('evidence-answer');
    const currentRunIndex = leaderboardSection.indexOf('current-run-card');

    expect(leaderboardSection).toContain('What is useful now, and what still needs public work?');
    expect(taskIndex).toBeGreaterThan(-1);
    expect(answerIndex).toBeGreaterThan(taskIndex);
    expect(currentRunIndex).toBeGreaterThan(taskIndex);
    expect(leaderboardSection).toContain('Make this citeable');
    expect(leaderboardSection).toContain('Copy public task');
    expect(leaderboardSection).toContain('id="copy-current-row-task"');
    expect(leaderboardSection).toContain('data-copy-public-work-task');
    expect(leaderboardSection).toContain('id="evidence-task-title"');
    expect(leaderboardSection).toContain('id="evidence-task-bring"');
    expect(leaderboardSection).toContain('id="current-run-task-copy-status"');
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
    expect(app).toContain('document.querySelectorAll("#copy-public-work-task, [data-copy-public-work-task]")');
    expect(app).toContain('setText("evidence-task-title"');
    expect(app).toContain('setText("evidence-task-bring"');
    expect(app).toContain('const evidenceTaskStatus = document.getElementById("evidence-task-status");');
    expect(app).toContain('const statusLabel = ranked ? "Historical only" : "Smoke only";');
    expect(app).toContain('const statusDetail = ranked ? `Baseline ${index + 1}; not current ranking` : "Plumbing proof; not ranked";');
  });
});
