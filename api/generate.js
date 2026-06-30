const MAX_SOURCE_CHARS = 16000;

const PROVIDERS = {
  openrouter: {
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    defaultModel: 'nvidia/nemotron-3-ultra-550b-a55b:free',
    envKey: 'OPENROUTER_API_KEY',
    headerKey: 'x-openrouter-key',
    title: 'OpenRouter',
    extraHeaders: {
      'http-referer': 'https://scribe-bench.vercel.app',
      'x-openrouter-title': 'ScribeBench Candidate Generation',
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

const SCRIBE_SYSTEM = `You are a clinical scribe. Write a complete, professional clinical note from the encounter transcript below. Use standard clinical structure (HPI; physical exam if present in the encounter; assessment and plan). Capture what the clinician said and did. Do NOT invent findings, labs, vitals, diagnoses, or workups the encounter does not support. Output only the note text.`;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = await readJsonBody(req);
  const source = String(body.source || '').trim();
  const provider = normalizeProvider(body.provider);
  const providerConfig = PROVIDERS[provider];
  const model = String(body.model || providerConfig.defaultModel).trim();
  const apiKey = process.env[providerConfig.envKey] || firstHeader(req.headers[providerConfig.headerKey]);

  if (!source) return res.status(400).json({ error: 'Source encounter is required.' });
  if (!model) return res.status(400).json({ error: 'Model is required.' });
  if (source.length > MAX_SOURCE_CHARS) {
    return res.status(413).json({ error: `Source encounter must be under ${MAX_SOURCE_CHARS} characters for the live lab.` });
  }
  if (!apiKey) {
    return res.status(401).json({
      error: providerConfig.missingKeyMessage,
      needsKey: true,
      provider,
    });
  }

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
        temperature: 0.25,
        max_tokens: 2200,
        messages: [
          { role: 'system', content: SCRIBE_SYSTEM },
          { role: 'user', content: `Encounter transcript:\n\n${source}\n\nWrite the clinical note.` },
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

    const raw = payload.choices?.[0]?.message?.content || payload.choices?.[0]?.text || '';
    const note = cleanGeneratedNote(raw);
    if (!note) return res.status(502).json({ error: `${providerConfig.title} returned an empty candidate note.`, provider });

    return res.status(200).json({
      note,
      model: payload.model || model,
      provider,
      usage: payload.usage || null,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Candidate generation failed.' });
  }
}

function normalizeProvider(value) {
  const provider = String(value || 'openrouter').toLowerCase();
  return PROVIDERS[provider] ? provider : 'openrouter';
}

function firstHeader(value) {
  return Array.isArray(value) ? value[0] : value;
}

function cleanGeneratedNote(value) {
  const text = Array.isArray(value)
    ? value.map((part) => part?.text || '').join('')
    : String(value || '');
  return text
    .replace(/^```(?:\w+)?\s*/i, '')
    .replace(/```$/i, '')
    .trim();
}

async function readJsonBody(req) {
  if (req.body) return typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf-8');
  return raw ? JSON.parse(raw) : {};
}
