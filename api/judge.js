const DEFAULT_LEAK_TOKENS = [
  'icd10cm',
  'cms:',
  'codingClinicRef',
  'defensibilityValue',
  'source: "',
  'system_prompt',
  '<|',
  '|>',
];

const PLACEHOLDER_RE = /\*\([^)\n]{1,60}\)\*/g;
const MAX_CHARS = 18000;
const PROVIDERS = {
  openrouter: {
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    defaultModel: 'nvidia/nemotron-3-ultra-550b-a55b:free',
    envKey: 'OPENROUTER_API_KEY',
    headerKey: 'x-openrouter-key',
    title: 'OpenRouter',
    extraHeaders: {
      'http-referer': 'https://scribe-bench.vercel.app',
      'x-openrouter-title': 'ScribeBench Lab',
    },
    missingKeyMessage: 'OpenRouter API key required. Add OPENROUTER_API_KEY to Vercel or paste a temporary key in the lab.',
  },
  baseten: {
    endpoint: 'https://inference.baseten.co/v1/chat/completions',
    defaultModel: 'deepseek-ai/DeepSeek-V4-Pro',
    envKey: 'BASETEN_API_KEY',
    headerKey: 'x-baseten-key',
    title: 'Baseten',
    extraHeaders: {},
    missingKeyMessage: 'Baseten API key required. Add BASETEN_API_KEY to Vercel or paste a temporary Baseten key in the lab.',
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = await readJsonBody(req);
  const source = String(body.source || '').trim();
  const note = String(body.note || '').trim();
  const provider = normalizeProvider(body.provider);
  const providerConfig = PROVIDERS[provider];
  const model = String(body.model || providerConfig.defaultModel).trim();
  const apiKey = process.env[providerConfig.envKey] || firstHeader(req.headers[providerConfig.headerKey]);

  if (!source || !note) return res.status(400).json({ error: 'Source and note are required.' });
  if (source.length + note.length > MAX_CHARS) {
    return res.status(413).json({ error: `Source plus note must be under ${MAX_CHARS} characters for the live lab.` });
  }
  if (!apiKey) {
    return res.status(401).json({
      error: providerConfig.missingKeyMessage,
      needsKey: true,
      provider,
    });
  }

  const leaks = detectLeaks({ note });
  const prompt = buildJudgePrompt(source, note);

  try {
    const response = await fetch(providerConfig.endpoint, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
        ...providerConfig.extraHeaders,
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        max_tokens: 1500,
        messages: [
          { role: 'system', content: ScribeBenchSystemPrompt },
          { role: 'user', content: prompt },
        ],
      }),
    });

    const payload = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({
        error: payload.error?.message || payload.message || `${providerConfig.title} HTTP ${response.status}`,
        provider,
      });
    }

    const raw = payload.choices?.[0]?.message?.content || '';
    const parsed = extractJsonObject(raw);
    const normalized = normalizeJudgeResult(parsed);
    const result = {
      ...normalized,
      leaks,
      model: payload.model || model,
      provider,
      usage: payload.usage || null,
      rubric: 'site-lab-v1',
    };
    if (process.env.SCRIBEBENCH_DEBUG_RAW === '1') result.raw = raw;
    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Judge failed.' });
  }
}

function normalizeProvider(value) {
  const provider = String(value || 'openrouter').toLowerCase();
  return PROVIDERS[provider] ? provider : 'openrouter';
}

function firstHeader(value) {
  return Array.isArray(value) ? value[0] : value;
}

const ScribeBenchSystemPrompt = `You are a clinical documentation auditor. Score the generated clinical note against the source encounter.

Return valid JSON only with this exact shape:
{
  "dimensions": {
    "storyCohesion": 1,
    "clinicalCompleteness": 1,
    "naturalFlow": 1,
    "absenceOfArtifacts": 1,
    "physicianReadability": 1,
    "inputFidelity": 1
  },
  "fabrication": {
    "dangerous": ["specific unsupported clinical content"],
    "standard": ["conventional charting content, if any"]
  },
  "reasoning": "2-5 concise sentences"
}

Use scores from 1 to 5.
Dangerous fabrication means the note asserts something clinically meaningful that the source does not support: invented history, labs, vitals, findings, diagnoses, workups, orders, contradictory plans, or escalated diagnoses. Standard means conventional charting or registering delivered care without changing what the reader believes happened.
Do not reward completeness when it comes from invention.`;

function buildJudgePrompt(source, note) {
  return `## SOURCE ENCOUNTER\n\n${source}\n\n---\n\n## GENERATED NOTE\n\n${note}\n\n---\n\nScore the note and list unsupported clinical content. JSON only.`;
}

function normalizeJudgeResult(parsed) {
  const dimensions = parsed?.dimensions || {};
  const cleanDimensions = {
    storyCohesion: clampScore(dimensions.storyCohesion),
    clinicalCompleteness: clampScore(dimensions.clinicalCompleteness),
    naturalFlow: clampScore(dimensions.naturalFlow),
    absenceOfArtifacts: clampScore(dimensions.absenceOfArtifacts),
    physicianReadability: clampScore(dimensions.physicianReadability),
    inputFidelity: clampScore(dimensions.inputFidelity),
  };
  const total = Object.values(cleanDimensions).reduce((sum, value) => sum + value, 0);
  const normalized = Math.round(((total - 6) / 24) * 100);
  const fabrication = parsed?.fabrication || {};
  return {
    dimensions: cleanDimensions,
    total,
    normalized,
    fabrication: {
      dangerous: cleanStringArray(fabrication.dangerous),
      standard: cleanStringArray(fabrication.standard),
    },
    reasoning: String(parsed?.reasoning || '').trim(),
  };
}

function clampScore(value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return 1;
  return Math.min(5, Math.max(1, n));
}

function cleanStringArray(value) {
  return Array.isArray(value)
    ? value.map((item) => String(item).trim()).filter(Boolean)
    : [];
}

function extractJsonObject(text) {
  const raw = String(text || '').trim();
  try {
    return JSON.parse(raw);
  } catch (_) {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(raw.slice(start, end + 1));
    throw new Error('Judge did not return parseable JSON.');
  }
}

function detectLeaks(surfaces) {
  const hits = [];
  for (const [surface, raw] of Object.entries(surfaces)) {
    const text = raw || '';
    for (const marker of DEFAULT_LEAK_TOKENS) {
      const idx = text.indexOf(marker);
      if (idx >= 0) hits.push({ surface, marker, excerpt: excerptAround(text, idx) });
    }
    const placeholders = text.match(PLACEHOLDER_RE);
    if (placeholders && placeholders.length >= 2) {
      hits.push({
        surface,
        marker: `raw-template-placeholders x${placeholders.length}`,
        excerpt: excerptAround(text, text.indexOf(placeholders[0])),
      });
    }
  }
  return hits;
}

function excerptAround(text, idx, span = 40) {
  return text.slice(Math.max(0, idx - span), idx + span).replace(/\s+/g, ' ').trim();
}

async function readJsonBody(req) {
  if (req.body) return typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf-8');
  return raw ? JSON.parse(raw) : {};
}
