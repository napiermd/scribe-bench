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
});
