const DEFAULT_FREE_MODELS = [
  { id: 'nvidia/nemotron-3-ultra-550b-a55b:free', name: 'NVIDIA: Nemotron 3 Ultra (free)', context_length: 1000000 },
  { id: 'nvidia/nemotron-3-super-120b-a12b:free', name: 'NVIDIA: Nemotron 3 Super (free)', context_length: 1000000 },
  { id: 'openai/gpt-oss-120b:free', name: 'OpenAI: gpt-oss-120b (free)', context_length: 131072 },
  { id: 'meta-llama/llama-3.3-70b-instruct:free', name: 'Meta: Llama 3.3 70B Instruct (free)', context_length: 131072 },
];

const PREFERRED_MODEL_IDS = DEFAULT_FREE_MODELS.map((model) => model.id);
const PROVIDERS = new Set(['openrouter', 'baseten']);

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const provider = normalizeProvider(req);
  if (provider === 'baseten') return listBasetenModels(req, res);
  return listOpenRouterModels(req, res);
}

async function listOpenRouterModels(req, res) {
  try {
    const apiKey = process.env.OPENROUTER_API_KEY || firstHeader(req.headers['x-openrouter-key']);
    const headers = apiKey ? { authorization: `Bearer ${apiKey}` } : {};
    const response = await fetch('https://openrouter.ai/api/v1/models', { headers });
    if (!response.ok) throw new Error(`OpenRouter models HTTP ${response.status}`);
    const payload = await response.json();
    const models = (payload.data || [])
      .filter((model) => {
        const pricing = model.pricing || {};
        const input = model.architecture?.input_modalities || [];
        const output = model.architecture?.output_modalities || [];
        return pricing.prompt === '0' &&
          pricing.completion === '0' &&
          input.includes('text') &&
          output.includes('text') &&
          model.id.includes(':free');
      })
      .sort((a, b) => preferredRank(a.id) - preferredRank(b.id))
      .slice(0, 24)
      .map((model) => ({
        id: model.id,
        name: model.name,
        context_length: model.context_length,
      }));

    return res.status(200).json({
      provider: 'openrouter',
      configured: Boolean(process.env.OPENROUTER_API_KEY),
      models: models.length ? models : DEFAULT_FREE_MODELS,
    });
  } catch (error) {
    return res.status(200).json({
      provider: 'openrouter',
      configured: Boolean(process.env.OPENROUTER_API_KEY),
      models: DEFAULT_FREE_MODELS,
      warning: 'Using fallback OpenRouter free-model list.',
      detail: error.message,
    });
  }
}

async function listBasetenModels(req, res) {
  const apiKey = process.env.BASETEN_API_KEY || firstHeader(req.headers['x-baseten-key']);
  if (!apiKey) {
    return res.status(200).json({
      provider: 'baseten',
      configured: false,
      models: [],
      warning: 'Baseten is not configured yet. Add BASETEN_API_KEY to Vercel or paste a temporary Baseten key.',
    });
  }

  try {
    const response = await fetch('https://inference.baseten.co/v1/models', {
      headers: { authorization: `Bearer ${apiKey}` },
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error?.message || payload.message || `Baseten models HTTP ${response.status}`);
    const data = Array.isArray(payload.data) ? payload.data : [];
    const models = data
      .map((model) => ({
        id: model.id || model.model || model.name,
        name: model.name || model.id || model.model,
        context_length: model.context_length,
      }))
      .filter((model) => model.id)
      .slice(0, 40);

    return res.status(200).json({
      provider: 'baseten',
      configured: Boolean(process.env.BASETEN_API_KEY),
      models,
      warning: models.length ? undefined : 'Baseten returned no listable models for this key.',
    });
  } catch (error) {
    return res.status(200).json({
      provider: 'baseten',
      configured: Boolean(process.env.BASETEN_API_KEY),
      models: [],
      warning: 'Could not load Baseten models.',
      detail: error.message,
    });
  }
}

function preferredRank(id) {
  const index = PREFERRED_MODEL_IDS.indexOf(id);
  return index === -1 ? 100 : index;
}

function normalizeProvider(req) {
  const fromQuery = req.query?.provider || new URL(req.url || '/', 'https://scribe-bench.vercel.app').searchParams.get('provider');
  const provider = String(fromQuery || 'openrouter').toLowerCase();
  return PROVIDERS.has(provider) ? provider : 'openrouter';
}

function firstHeader(value) {
  return Array.isArray(value) ? value[0] : value;
}
