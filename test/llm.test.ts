// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { defaultJudgeModelForBackend, shellEscape } from '../eval/llm';

// shellEscape guards an execSync over UNTRUSTED model output. A miss here is a
// shell-injection vector, so the adversarial inputs matter.
describe('shellEscape', () => {
  it('wraps output in $\'...\'', () => {
    const out = shellEscape('hello');
    expect(out.startsWith("$'")).toBe(true);
    expect(out.endsWith("'")).toBe(true);
  });

  it('escapes single quotes so they cannot break out', () => {
    const out = shellEscape("it's a note");
    expect(out).toContain("\\'");
    // no raw, unescaped closing quote in the middle
    expect(out.slice(2, -1)).not.toMatch(/(^|[^\\])'/);
  });

  it('escapes $ to neutralize variable/command expansion', () => {
    expect(shellEscape('cost is $5 and $(rm -rf /)')).toContain('\\$');
  });

  it('escapes backticks (command substitution)', () => {
    expect(shellEscape('run `whoami`')).toContain('\\`');
  });

  it('escapes ! (history expansion)', () => {
    expect(shellEscape('really!')).toContain('\\!');
  });

  it('converts newlines to literal \\n (no raw newline survives)', () => {
    const out = shellEscape('line1\nline2');
    expect(out).toContain('\\n');
    expect(out).not.toContain('\n');
  });

  it('strips null bytes entirely', () => {
    const out = shellEscape('a\x00b');
    expect(out).not.toContain('\x00');
  });

  it('escapes the ESC control character', () => {
    const out = shellEscape('a\x1bb');
    expect(out).toContain('\\x1b');
    expect(out).not.toContain('\x1b');
  });

  it('handles a combined injection payload without raw breakout chars', () => {
    const payload = "'; rm -rf /; echo `id` $HOME !! \x00\x1b";
    const out = shellEscape(payload);
    expect(out.startsWith("$'")).toBe(true);
    expect(out.endsWith("'")).toBe(true);
    expect(out).not.toContain('\x00');
    expect(out).not.toContain('\n');
  });
});

describe('defaultJudgeModelForBackend', () => {
  it('uses a Baseten model when the Baseten backend is selected', () => {
    expect(defaultJudgeModelForBackend('baseten')).toBe('deepseek-ai/DeepSeek-V4-Pro');
  });

  it('keeps provider-specific defaults distinct for cache provenance', () => {
    expect(defaultJudgeModelForBackend('anthropic')).not.toBe(defaultJudgeModelForBackend('baseten'));
    expect(defaultJudgeModelForBackend('cli')).not.toBe(defaultJudgeModelForBackend('openrouter'));
  });
});
