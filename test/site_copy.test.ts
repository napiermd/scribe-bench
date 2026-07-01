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
});
