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
    const modelLaneStart = html.indexOf('<div class="current-model-lane"');

    expect(quickForm).toContain('id="quick-run-local"');
    expect(quickForm).toContain('href="#lab"');
    expect(quickForm).not.toContain('run-live-smoke-top');
    expect(quickForm).not.toContain('Smoke current models');
    expect(labSectionStart).toBeGreaterThan(-1);
    expect(modelLaneStart).toBeGreaterThan(labSectionStart);
    expect(app).toContain('return ["current-model-run-smoke"]');
  });
});
