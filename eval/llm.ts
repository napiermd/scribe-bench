/**
 * llm.ts — pluggable judge backend.
 *
 * ScribeBench judges are LLM-as-judge. The judge model matters: in our
 * production data, a weaker judge (DeepSeek V3) scored rho=0.18 against
 * physician preference vs the rho>0.6 a frontier model reaches. Use the
 * strongest model you can for the judge; the candidate-under-test can be
 * anything.
 *
 * Four backends are supported out of the box:
 *
 *   1. Anthropic API  (SCRIBEBENCH_BACKEND=anthropic, ANTHROPIC_API_KEY=...)
 *   2. Claude CLI      (SCRIBEBENCH_BACKEND=cli) — OAuth via a Claude Max/Pro
 *                       plan, no API key. This is what we use internally.
 *   3. Baseten APIs    (SCRIBEBENCH_BACKEND=baseten, BASETEN_API_KEY=...)
 *   4. OpenRouter      (SCRIBEBENCH_BACKEND=openrouter, OPENROUTER_API_KEY=...)
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

const DEFAULT_ANTHROPIC_MODEL = 'claude-opus-4-8';
const DEFAULT_CLI_MODEL = 'opus';
const DEFAULT_BASETEN_MODEL = 'deepseek-ai/DeepSeek-V4-Pro';
const DEFAULT_OPENROUTER_MODEL = 'nvidia/nemotron-3-ultra-550b-a55b:free';

export function defaultJudgeModelForBackend(backend: string): string {
  switch (backend.toLowerCase()) {
    case 'cli':
    case 'claude-cli':
      return DEFAULT_CLI_MODEL;
    case 'baseten':
      return DEFAULT_BASETEN_MODEL;
    case 'openrouter':
      return DEFAULT_OPENROUTER_MODEL;
    case 'anthropic':
    default:
      return DEFAULT_ANTHROPIC_MODEL;
  }
}

export function currentBackendName(): string {
  return (process.env.SCRIBEBENCH_BACKEND || 'anthropic').toLowerCase();
}

export function currentJudgeModel(): string {
  return process.env.SCRIBEBENCH_JUDGE_MODEL || defaultJudgeModelForBackend(currentBackendName());
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
    this.model = process.env.SCRIBEBENCH_JUDGE_MODEL || defaultJudgeModelForBackend('anthropic');
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
// Backend 2: OpenAI-compatible chat completions providers
// ---------------------------------------------------------------------------

type ChatProviderConfig = {
  name: string;
  endpoint: string;
  apiKeyEnv: string;
  defaultModel: string;
  jsonMode?: boolean;
  extraHeaders?: Record<string, string>;
};

class ChatCompletionsBackend implements JudgeBackend {
  readonly name: string;
  private model: string;
  private apiKey: string;
  private endpoint: string;
  private jsonMode: boolean;
  private extraHeaders: Record<string, string>;

  constructor(config: ChatProviderConfig) {
    this.name = config.name;
    this.apiKey = process.env[config.apiKeyEnv] || '';
    this.model = process.env.SCRIBEBENCH_JUDGE_MODEL || config.defaultModel;
    this.endpoint = config.endpoint;
    this.jsonMode = Boolean(config.jsonMode);
    this.extraHeaders = config.extraHeaders || {};
    if (!this.apiKey) {
      throw new Error(`${config.apiKeyEnv} not set (required for SCRIBEBENCH_BACKEND=${config.name})`);
    }
  }

  async complete(system: string, user: string, maxRetries = 3): Promise<string> {
    let lastErr = '';
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const res = await fetch(this.endpoint, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${this.apiKey}`,
            'content-type': 'application/json',
            ...this.extraHeaders,
          },
          body: JSON.stringify({
            model: this.model,
            temperature: 0.1,
            max_tokens: 1500,
            ...(this.jsonMode ? { response_format: { type: 'json_object' } } : {}),
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: user },
            ],
          }),
        });
        const raw = await res.text();
        let data: any = {};
        try {
          data = raw ? JSON.parse(raw) : {};
        } catch (_) {
          data = { error: { message: raw.slice(0, 300) } };
        }
        if (!res.ok) {
          const detail = data?.error?.message || data?.message || JSON.stringify(data).slice(0, 300);
          throw new Error(`HTTP ${res.status}: ${detail}`);
        }
        const text = data?.choices?.[0]?.message?.content || data?.choices?.[0]?.text || '';
        if (!text) throw new Error('empty completion');
        return Array.isArray(text) ? text.map((part: any) => part?.text || '').join('') : String(text);
      } catch (err: any) {
        lastErr = err?.message?.slice(0, 300) || String(err);
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, 2000 * 2 ** (attempt - 1)));
        }
      }
    }
    throw new Error(`${this.name} backend failed after ${maxRetries} attempts: ${lastErr}`);
  }
}

// ---------------------------------------------------------------------------
// Backend 3: Claude CLI (OAuth, no API key)
// ---------------------------------------------------------------------------

class ClaudeCliBackend implements JudgeBackend {
  readonly name = 'claude-cli';
  private model = process.env.SCRIBEBENCH_JUDGE_MODEL || defaultJudgeModelForBackend('cli');

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

/** $'...' shell-escape — judge inputs are untrusted model output. Exported for tests. */
export function shellEscape(s: string): string {
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
  const which = currentBackendName();
  switch (which) {
    case 'cli':
    case 'claude-cli':
      cached = new ClaudeCliBackend();
      break;
    case 'baseten':
      cached = new ChatCompletionsBackend({
        name: 'baseten',
        endpoint: 'https://inference.baseten.co/v1/chat/completions',
        apiKeyEnv: 'BASETEN_API_KEY',
        defaultModel: defaultJudgeModelForBackend('baseten'),
      });
      break;
    case 'openrouter':
      cached = new ChatCompletionsBackend({
        name: 'openrouter',
        endpoint: 'https://openrouter.ai/api/v1/chat/completions',
        apiKeyEnv: 'OPENROUTER_API_KEY',
        defaultModel: defaultJudgeModelForBackend('openrouter'),
        jsonMode: true,
        extraHeaders: {
          'http-referer': 'https://scribe-bench.vercel.app',
          'x-openrouter-title': 'ScribeBench Eval',
        },
      });
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
