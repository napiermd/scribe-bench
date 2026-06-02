/**
 * llm.ts — pluggable judge backend.
 *
 * ScribeBench judges are LLM-as-judge. The judge model matters: in our
 * production data, a weaker judge (DeepSeek V3) scored rho=0.18 against
 * physician preference vs the rho>0.6 a frontier model reaches. Use the
 * strongest model you can for the judge; the candidate-under-test can be
 * anything.
 *
 * Two backends are supported out of the box:
 *
 *   1. Anthropic API  (SCRIBEBENCH_BACKEND=anthropic, ANTHROPIC_API_KEY=...)
 *   2. Claude CLI      (SCRIBEBENCH_BACKEND=cli) — OAuth via a Claude Max/Pro
 *                       plan, no API key. This is what we use internally.
 *
 * To add your own backend (OpenAI, a local model, a gateway), implement
 * the JudgeBackend interface and register it in resolveBackend().
 */

import { execSync } from 'child_process';

export interface JudgeBackend {
  /** Single-turn completion. Returns the model's text. */
  complete(system: string, user: string, maxRetries?: number): Promise<string>;
  readonly name: string;
}

// ---------------------------------------------------------------------------
// Backend 1: Anthropic API (portable — most contributors will use this)
// ---------------------------------------------------------------------------

class AnthropicBackend implements JudgeBackend {
  readonly name = 'anthropic';
  private model: string;
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.ANTHROPIC_API_KEY || '';
    this.model = process.env.SCRIBEBENCH_JUDGE_MODEL || 'claude-opus-4-8';
    if (!this.apiKey) {
      throw new Error('ANTHROPIC_API_KEY not set (required for SCRIBEBENCH_BACKEND=anthropic)');
    }
  }

  async complete(system: string, user: string, maxRetries = 3): Promise<string> {
    let lastErr = '';
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-key': this.apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: this.model,
            max_tokens: 1500,
            system,
            messages: [{ role: 'user', content: user }],
          }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
        const data: any = await res.json();
        const text = (data.content || []).map((b: any) => b.text || '').join('');
        if (!text) throw new Error('empty completion');
        return text;
      } catch (err: any) {
        lastErr = err?.message?.slice(0, 300) || String(err);
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, 2000 * 2 ** (attempt - 1)));
        }
      }
    }
    throw new Error(`Anthropic backend failed after ${maxRetries} attempts: ${lastErr}`);
  }
}

// ---------------------------------------------------------------------------
// Backend 2: Claude CLI (OAuth, no API key)
// ---------------------------------------------------------------------------

class ClaudeCliBackend implements JudgeBackend {
  readonly name = 'claude-cli';
  private model = process.env.SCRIBEBENCH_JUDGE_MODEL || 'opus';

  async complete(system: string, user: string, maxRetries = 3): Promise<string> {
    const combined = `${system}\n\n---\n\n${user}`;
    let lastErr = '';
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = execSync(
          `claude -p ${shellEscape(combined)} --model ${this.model} --output-format json --max-turns 1 --allowedTools ""`,
          { timeout: 300_000, maxBuffer: 10 * 1024 * 1024, encoding: 'utf-8', shell: '/bin/bash' },
        );
        const parsed = JSON.parse(result);
        if (parsed.is_error) throw new Error(`Claude CLI error: ${parsed.result?.slice(0, 300)}`);
        return parsed.result || '';
      } catch (err: any) {
        lastErr = err?.message?.slice(0, 300) || String(err);
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, 2000 * 2 ** (attempt - 1)));
        }
      }
    }
    throw new Error(`Claude CLI backend failed after ${maxRetries} attempts: ${lastErr}`);
  }
}

/** $'...' shell-escape — judge inputs are untrusted model output. */
function shellEscape(s: string): string {
  return (
    "$'" +
    s
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
      .replace(/\n/g, '\\n')
      .replace(/\t/g, '\\t')
      .replace(/\$/g, '\\$')
      .replace(/`/g, '\\`')
      .replace(/!/g, '\\!')
      .replace(/\x00/g, '')
      .replace(/\x1b/g, '\\x1b') +
    "'"
  );
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

let cached: JudgeBackend | null = null;

export function resolveBackend(): JudgeBackend {
  if (cached) return cached;
  const which = (process.env.SCRIBEBENCH_BACKEND || 'anthropic').toLowerCase();
  switch (which) {
    case 'cli':
    case 'claude-cli':
      cached = new ClaudeCliBackend();
      break;
    case 'anthropic':
    default:
      cached = new AnthropicBackend();
      break;
  }
  return cached;
}

/** Convenience wrapper used by the judges. */
export async function callJudge(system: string, user: string, maxRetries = 3): Promise<string> {
  return resolveBackend().complete(system, user, maxRetries);
}
