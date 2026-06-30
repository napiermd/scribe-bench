const fmtPercent = (value) => `${(value * 100).toFixed(value === 0 ? 0 : 1)}%`;
const fmtCI = (ci, percent = false) => {
  if (!Array.isArray(ci) || ci.length !== 2) return "";
  if (percent) return ` [${(ci[0] * 100).toFixed(0)}-${(ci[1] * 100).toFixed(0)}%]`;
  return ` [${ci[0].toFixed(1)}-${ci[1].toFixed(1)}]`;
};

const demoFindings = {
  "SYN-001":
    "This is the clean control: the note carries forward the chest-pain story, ECG/troponin evidence, NSTEMI assessment, heparin, aspirin, nitroglycerin, cardiology, cath, and telemetry admission.",
  "SYN-002":
    "This case shows ordinary fidelity rather than drama: diabetes follow-up, adherence barrier, A1c trend, foot exam, SGLT2 start, diabetes education, and vaccine documentation all come from the source.",
  "SYN-003":
    "This candidate intentionally invents a head CT and a syncope workup. The source says the daughter drove the patient in after a mechanical rug trip and explicitly says there was no loss of consciousness or head strike.",
};

const RANKED_DATASET = "primock57";
const MIN_RANKED_CASES = 30;

const providerConfigs = {
  openrouter: {
    label: "OpenRouter free",
    keyHeader: "x-openrouter-key",
    keyStorage: "scribebench-openrouter-key",
    keyHint: "OpenRouter free models use the configured site key; paste a temporary key only to override it.",
    slowNotice: "Still running. Free OpenRouter models can take about a minute on full notes.",
    preferredGenerationModel: "nvidia/nemotron-3-ultra-550b-a55b:free",
    preferredJudgeModel: "openai/gpt-oss-120b:free",
    defaultModels: [
      { id: "nvidia/nemotron-3-ultra-550b-a55b:free", name: "NVIDIA: Nemotron 3 Ultra (free)" },
      { id: "nvidia/nemotron-3-super-120b-a12b:free", name: "NVIDIA: Nemotron 3 Super (free)" },
      { id: "openai/gpt-oss-120b:free", name: "OpenAI: gpt-oss-120b (free)" },
      { id: "meta-llama/llama-3.3-70b-instruct:free", name: "Meta: Llama 3.3 70B Instruct (free)" },
    ],
  },
  baseten: {
    label: "Baseten Model APIs",
    keyHeader: "x-baseten-key",
    keyStorage: "scribebench-baseten-key",
    keyHint: "Baseten is optional here; add BASETEN_API_KEY in Vercel or paste a temporary key to list and run models.",
    slowNotice: "Still running. Baseten model latency depends on the selected hosted model.",
    preferredGenerationModel: "",
    preferredJudgeModel: "",
    defaultModels: [],
  },
};

const dimensionLabels = {
  storyCohesion: "Story cohesion",
  clinicalCompleteness: "Clinical completeness",
  naturalFlow: "Natural flow",
  absenceOfArtifacts: "Absence of artifacts",
  physicianReadability: "Physician readability",
  inputFidelity: "Input fidelity",
};

let syntheticCases = [];

function byRank(a, b) {
  return (
    a.dangerousFabricationRate - b.dangerousFabricationRate ||
    b.narrativeMean - a.narrativeMean ||
    a.system.localeCompare(b.system)
  );
}

async function loadJson(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Could not load ${path}`);
  return res.json();
}

function renderSnapshot(results, metadata) {
  const ranked = rankedRows(results);
  const inferredCases = Math.max(...ranked.map((r) => Number(r.n) || 0), 0);
  const cases = (metadata.caseCounts?.primock57 ?? inferredCases) || "--";
  const metrics = document.querySelectorAll("#snapshot-metrics dd");
  metrics[0].textContent = String(cases);
  metrics[1].textContent = String(ranked.length);
}

function renderLeaderboard(results) {
  renderResultRows("leaderboard-body", rankedRows(results).sort(byRank), {
    ranked: true,
    emptyText: "No powered PriMock57 rows found.",
  });
  renderResultRows("smoke-body", smokeRows(results).sort(byRank), {
    ranked: false,
    emptyText: "No synthetic smoke-test rows found.",
  });
}

function rankedRows(results) {
  return results.filter((row) => row.claimLevel === "powered" && row.dataset === RANKED_DATASET && Number(row.n) >= MIN_RANKED_CASES);
}

function smokeRows(results) {
  const ranked = new Set(rankedRows(results));
  return results.filter((row) => !ranked.has(row));
}

function renderResultRows(bodyId, rows, { ranked, emptyText }) {
  const body = document.getElementById(bodyId);
  if (!body) return;
  body.innerHTML = "";

  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="9">${escapeHtml(emptyText)}</td></tr>`;
    return;
  }

  rows.forEach((row, index) => {
    const tr = document.createElement("tr");
    const danger = fmtPercent(row.dangerousFabricationRate);
    const dangerCI = fmtCI(row.dangerousFabricationRateCI, true);
    const narrativeCI = fmtCI(row.narrativeMeanCI);
    const leak = fmtPercent(row.leakRate);
    const width = Math.max(2, Math.min(100, row.dangerousFabricationRate * 100));
    const statusLabel = ranked ? `#${index + 1}` : "No rank";
    const statusDetail = ranked ? "Powered" : "n too small";

    tr.innerHTML = `
      <td class="rank-cell">
        <strong>${statusLabel}</strong>
        <span>${statusDetail}</span>
      </td>
      <td class="system-cell">
        <strong>${escapeHtml(row.system)}</strong>
        <span>${escapeHtml(row.note || "Public aggregate score")}</span>
      </td>
      <td>${escapeHtml(row.dataset)}</td>
      <td>${row.n}</td>
      <td>
        <div class="rate-bar">
          <strong>${danger}</strong>
          <span class="rate-track" aria-hidden="true"><span class="rate-fill" style="--w:${width}%"></span></span>
        </div>
        <small>${dangerCI}</small>
      </td>
      <td><strong>${row.narrativeMean.toFixed(1)}</strong><small>${narrativeCI}</small></td>
      <td>${row.fidelityMean.toFixed(2)}</td>
      <td>${leak}</td>
      <td>${escapeHtml(row.judgeModel)}</td>
    `;
    body.appendChild(tr);
  });
}

function renderCases(cases) {
  syntheticCases = cases;
  const buttons = document.getElementById("case-buttons");
  buttons.innerHTML = "";

  cases.forEach((c, idx) => {
    const button = document.createElement("button");
    button.className = `case-button${idx === 2 ? " active" : ""}`;
    button.type = "button";
    button.innerHTML = `
      <strong>${escapeHtml(c.id)}</strong>
      <small>${escapeHtml((c.tags || []).join(", "))}</small>
    `;
    button.addEventListener("click", () => {
      document.querySelectorAll(".case-button").forEach((b) => b.classList.remove("active"));
      button.classList.add("active");
      renderCase(c);
    });
    buttons.appendChild(button);
  });

  renderCase(cases[2] || cases[0]);
  populateLab(cases[2] || cases[0]);
}

function renderCase(c) {
  const tagText = (c.tags || []).join(" / ") || c.provenance || "demo";
  document.getElementById("case-tags").textContent = tagText;
  document.getElementById("case-title").textContent = c.id;
  document.getElementById("source-text").textContent = c.source;
  document.getElementById("candidate-text").textContent = c.candidateNote || "No candidate note found.";
  document.getElementById("case-finding").textContent = demoFindings[c.id] || "Compare the source encounter to the generated note.";

  const status = document.getElementById("case-status");
  const isSeeded = c.id === "SYN-003";
  status.textContent = isSeeded ? "Seeded fabrication" : "Control case";
  status.classList.toggle("danger", isSeeded);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function bindLab() {
  document.getElementById("load-seeded-lab")?.addEventListener("click", () => populateLab(syntheticCases[2] || syntheticCases[0]));
  document.getElementById("refresh-models")?.addEventListener("click", () => loadLabModels(true));
  document.getElementById("generate-note")?.addEventListener("click", generateCandidateNote);
  const providerSelect = document.getElementById("lab-provider");
  if (providerSelect) {
    providerSelect.dataset.previousProvider = providerSelect.value;
    providerSelect.addEventListener("change", () => {
      cacheProviderKey(providerSelect.dataset.previousProvider);
      providerSelect.dataset.previousProvider = providerSelect.value;
      syncProviderUi();
      loadLabModels(true);
    });
  }
  document.getElementById("clear-lab")?.addEventListener("click", () => {
    document.getElementById("lab-source").value = "";
    const note = document.getElementById("lab-note");
    note.value = "";
    delete note.dataset.generatedModel;
    setLabStatus("");
  });
  document.getElementById("lab-note")?.addEventListener("input", (event) => {
    delete event.currentTarget.dataset.generatedModel;
  });
  document.getElementById("lab-form")?.addEventListener("submit", runLabJudge);

  syncProviderUi();
}

async function generateCandidateNote() {
  const source = document.getElementById("lab-source").value.trim();
  const model = document.getElementById("lab-generate-model").value;
  const provider = selectedProvider();
  const key = document.getElementById("lab-key").value.trim();

  if (!source) {
    setLabStatus("Source encounter is required before generation.");
    return;
  }
  if (!model) {
    setLabStatus("Choose a generation model before generating a note.");
    return;
  }
  if (key) sessionStorage.setItem(providerConfigs[provider].keyStorage, key);

  const generateButton = document.getElementById("generate-note");
  const runButton = document.getElementById("run-lab");
  generateButton.disabled = true;
  runButton.disabled = true;
  setLabStatus("Generating candidate note...");
  const slowNotice = window.setTimeout(() => {
    setLabStatus(providerConfigs[provider].slowNotice);
  }, 8000);

  try {
    const headers = { "content-type": "application/json" };
    if (key) headers[providerConfigs[provider].keyHeader] = key;
    const response = await fetch("/api/generate", {
      method: "POST",
      headers,
      body: JSON.stringify({ source, model, provider }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || `Generation failed (${response.status})`);
    const note = document.getElementById("lab-note");
    note.value = payload.note || "";
    note.dataset.generatedModel = payload.model || model;
    const usage = payload.usage?.total_tokens ? ` Tokens: ${payload.usage.total_tokens}.` : "";
    setLabStatus(`Generated candidate with ${payload.model || model}. Run the judge next.${usage}`);
  } catch (error) {
    setLabStatus(error.message || "Candidate generation failed.");
  } finally {
    window.clearTimeout(slowNotice);
    generateButton.disabled = false;
    runButton.disabled = false;
  }
}

async function loadLabModels(force = false) {
  if (!modelSelects().length) return;
  const provider = selectedProvider();
  const config = providerConfigs[provider];
  if (force) setLabStatus(`Refreshing ${config.label} models...`);
  try {
    const headers = providerKeyHeaders(provider);
    const response = await fetch(`/api/models?provider=${encodeURIComponent(provider)}`, { headers });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || `Models failed (${response.status})`);
    renderModelOptions(payload.models || config.defaultModels);
    if (payload.warning) setLabStatus(payload.warning);
    else if (force) setLabStatus(`${config.label} model list refreshed.`);
  } catch (_) {
    renderModelOptions(config.defaultModels);
    if (force) setLabStatus(`Could not reach ${config.label} model list; using fallback models.`);
  }
}

function renderModelOptions(models) {
  const provider = selectedProvider();
  const config = providerConfigs[provider];
  populateModelSelect(document.getElementById("lab-generate-model"), models, config.preferredGenerationModel);
  populateModelSelect(document.getElementById("lab-judge-model"), models, config.preferredJudgeModel || config.preferredGenerationModel);
}

function populateModelSelect(select, models, preferredId) {
  if (!select) return;
  const previous = select.value;
  select.innerHTML = "";
  if (!models.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No models available";
    select.appendChild(option);
    select.disabled = true;
    return;
  }
  select.disabled = false;
  for (const model of models) {
    const option = document.createElement("option");
    option.value = model.id;
    option.textContent = model.name ? `${model.name} (${model.id})` : model.id;
    select.appendChild(option);
  }
  const options = [...select.options];
  if (previous && options.some((option) => option.value === previous)) {
    select.value = previous;
  } else if (preferredId && options.some((option) => option.value === preferredId)) {
    select.value = preferredId;
  }
}

function modelSelects() {
  return ["lab-generate-model", "lab-judge-model"]
    .map((id) => document.getElementById(id))
    .filter(Boolean);
}

function populateLab(c) {
  if (!c) return;
  document.getElementById("lab-source").value = c.source || "";
  const note = document.getElementById("lab-note");
  note.value = c.candidateNote || "";
  delete note.dataset.generatedModel;
  setLabStatus(`Loaded ${c.id}.`);
}

async function runLabJudge(event) {
  event.preventDefault();
  const source = document.getElementById("lab-source").value.trim();
  const note = document.getElementById("lab-note").value.trim();
  const model = document.getElementById("lab-judge-model").value;
  const provider = selectedProvider();
  const key = document.getElementById("lab-key").value.trim();

  if (!source || !note) {
    setLabStatus("Source and note are required.");
    return;
  }
  if (!model) {
    setLabStatus("Choose a judge model before running the judge.");
    return;
  }
  if (key) sessionStorage.setItem(providerConfigs[provider].keyStorage, key);

  const runButton = document.getElementById("run-lab");
  runButton.disabled = true;
  setLabStatus("Running judge...");
  const slowNotice = window.setTimeout(() => {
    setLabStatus(providerConfigs[provider].slowNotice);
  }, 8000);

  try {
    const headers = { "content-type": "application/json" };
    if (key) headers[providerConfigs[provider].keyHeader] = key;
    const response = await fetch("/api/judge", {
      method: "POST",
      headers,
      body: JSON.stringify({ source, note, model, provider }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || `Judge failed (${response.status})`);
    payload.generatedModel = document.getElementById("lab-note").dataset.generatedModel || "";
    renderLabResult(payload);
    setLabStatus("Done.");
  } catch (error) {
    setLabStatus(error.message || "Judge failed.");
  } finally {
    window.clearTimeout(slowNotice);
    runButton.disabled = false;
  }
}

function renderLabResult(result) {
  document.getElementById("lab-empty").hidden = true;
  document.getElementById("lab-output").hidden = false;
  document.getElementById("lab-score").textContent = `${result.normalized ?? "--"}/100`;
  document.getElementById("lab-danger").textContent = String(result.fabrication?.dangerous?.length ?? 0);
  renderLabVerdict(result);

  const dims = document.getElementById("lab-dimensions");
  dims.innerHTML = "";
  for (const [key, label] of Object.entries(dimensionLabels)) {
    const value = Number(result.dimensions?.[key] || 0);
    const row = document.createElement("div");
    row.className = "dimension-row";
    row.innerHTML = `
      <span>${escapeHtml(label)}</span>
      <strong>${value}/5</strong>
      <span class="dimension-track" aria-hidden="true"><span class="dimension-fill" style="--w:${Math.max(0, value / 5 * 100)}%"></span></span>
    `;
    dims.appendChild(row);
  }

  renderList("lab-danger-list", result.fabrication?.dangerous, "None flagged.");
  renderList("lab-standard-list", result.fabrication?.standard, "None listed.");
  renderList("lab-leak-list", (result.leaks || []).map((hit) => `${hit.marker}: ${hit.excerpt}`), "No deterministic leaks.");
  document.getElementById("lab-reasoning").textContent = result.reasoning || "No reasoning returned.";

  const generated = result.generatedModel ? `Generated: ${result.generatedModel}. ` : "";
  const usage = result.usage ? ` Tokens: ${result.usage.total_tokens || "unknown"}.` : "";
  const provider = result.provider ? ` Provider: ${result.provider}.` : "";
  document.getElementById("lab-meta").textContent = `${generated}Judge: ${result.model || "unknown"}.${provider} Rubric: ${result.rubric || "site-lab"}.${usage}`;
}

function renderLabVerdict(result) {
  const dangerousCount = result.fabrication?.dangerous?.filter(Boolean).length || 0;
  const leakCount = result.leaks?.filter(Boolean).length || 0;
  const fidelity = Number(result.dimensions?.inputFidelity || 0);
  const normalized = Number(result.normalized || 0);
  const verdict = labVerdict({ dangerousCount, leakCount, fidelity, normalized });
  const card = document.getElementById("lab-verdict-card");
  card.className = `verdict-card ${verdict.tone}`;
  document.getElementById("lab-verdict-title").textContent = verdict.title;
  document.getElementById("lab-verdict-copy").textContent = verdict.copy;
  document.getElementById("lab-verdict-action").textContent = verdict.action;
}

function labVerdict({ dangerousCount, leakCount, fidelity, normalized }) {
  if (dangerousCount > 0) {
    return {
      tone: "danger",
      title: "Do not trust this note without review",
      copy: `${dangerousCount} unsupported clinical item${dangerousCount === 1 ? "" : "s"} changed what the reader would believe happened.`,
      action: "Compare each flagged item against the source. A system with this pattern needs a powered benchmark run before any public claim.",
    };
  }
  if (leakCount > 0) {
    return {
      tone: "review",
      title: "Clean the pipeline before trusting the result",
      copy: `${leakCount} template or metadata leak${leakCount === 1 ? "" : "s"} appeared in the note output.`,
      action: "Fix prompt/template plumbing, regenerate the note, then judge again.",
    };
  }
  if (normalized < 70 || fidelity <= 3) {
    return {
      tone: "review",
      title: "No dangerous fabrication flagged, but quality is not strong",
      copy: `The judge scored narrative quality at ${normalized || "--"}/100 and input fidelity at ${fidelity || "--"}/5.`,
      action: "Use this as a triage signal, then inspect the note manually or run a larger benchmark before comparing systems.",
    };
  }
  return {
    tone: "ok",
    title: "No dangerous fabrication flagged in this sample",
    copy: `The judge found no unsupported clinical claims and scored input fidelity at ${fidelity || "--"}/5.`,
    action: "This is one note, not a leaderboard claim. For a system-level answer, run the powered PriMock57 path.",
  };
}

function selectedProvider() {
  const value = document.getElementById("lab-provider")?.value || "openrouter";
  return providerConfigs[value] ? value : "openrouter";
}

function providerKeyHeaders(provider = selectedProvider()) {
  const key = document.getElementById("lab-key")?.value.trim();
  return key ? { [providerConfigs[provider].keyHeader]: key } : {};
}

function cacheProviderKey(provider) {
  if (!providerConfigs[provider]) return;
  const key = document.getElementById("lab-key")?.value.trim();
  if (key) sessionStorage.setItem(providerConfigs[provider].keyStorage, key);
}

function syncProviderUi() {
  const provider = selectedProvider();
  const config = providerConfigs[provider];
  const keyInput = document.getElementById("lab-key");
  const hint = document.getElementById("provider-hint");
  const label = document.getElementById("lab-key-label");
  if (keyInput) keyInput.value = sessionStorage.getItem(config.keyStorage) || "";
  if (hint) hint.textContent = config.keyHint;
  if (label) label.textContent = `${config.label} API key`;
}

function renderList(id, items, emptyText) {
  const list = document.getElementById(id);
  list.innerHTML = "";
  const clean = Array.isArray(items) ? items.filter(Boolean) : [];
  if (!clean.length) {
    const li = document.createElement("li");
    li.textContent = emptyText;
    list.appendChild(li);
    return;
  }
  for (const item of clean) {
    const li = document.createElement("li");
    li.textContent = item;
    list.appendChild(li);
  }
}

function setLabStatus(message) {
  const status = document.getElementById("lab-status");
  if (status) status.textContent = message;
}

async function boot() {
  bindLab();
  await loadLabModels();
  try {
    const [resultsPayload, casesPayload, metadata] = await Promise.all([
      loadJson("/assets/results.json"),
      loadJson("/assets/demo-cases.json"),
      loadJson("/assets/metadata.json"),
    ]);
    const results = resultsPayload.results || [];
    renderSnapshot(results, metadata);
    renderLeaderboard(results);
    renderCases(casesPayload.cases || []);
  } catch (err) {
    document.getElementById("leaderboard-body").innerHTML = `
      <tr><td colspan="9">Could not load benchmark data. Check the static build output.</td></tr>
    `;
    const smokeBody = document.getElementById("smoke-body");
    if (smokeBody) smokeBody.innerHTML = `<tr><td colspan="9">Could not load smoke-test data.</td></tr>`;
    console.error(err);
  }
}

boot();
