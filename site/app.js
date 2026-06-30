const fmtPercent = (value) => `${(value * 100).toFixed(value === 0 ? 0 : 1)}%`;
const fmtCI = (ci, percent = false) => {
  if (!Array.isArray(ci) || ci.length !== 2) return "";
  if (percent) return ` [${(ci[0] * 100).toFixed(0)}-${(ci[1] * 100).toFixed(0)}%]`;
  return ` [${ci[0].toFixed(1)}-${ci[1].toFixed(1)}]`;
};
const fmtDate = new Intl.DateTimeFormat("en", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

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
    preferredJudgeModel: "nvidia/nemotron-3-super-120b-a12b:free",
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

const seededDemoResults = {
  "SYN-003": {
    dimensions: {
      storyCohesion: 4,
      clinicalCompleteness: 3,
      naturalFlow: 4,
      absenceOfArtifacts: 5,
      physicianReadability: 4,
      inputFidelity: 2,
    },
    total: 22,
    normalized: 67,
    fabrication: {
      dangerous: [
        "Invented CT head without contrast and a negative intracranial hemorrhage result; the source says no head strike or loss of consciousness and does not mention head imaging.",
        "Invented syncope as a possible cause of the fall plus orthostatic vitals, telemetry monitoring, and TSH workup; the source describes a mechanical rug trip.",
      ],
      standard: [
        "Orthopedics consult, surgical fixation plan, NPO after midnight, pain control, DVT prophylaxis, holding lisinopril, and calcium/vitamin D continuation are supported by the source.",
      ],
    },
    leaks: [],
    reasoning:
      "The note is readable and carries forward the hip-fracture plan, but it adds clinically meaningful events and workup that are not in the source. The head CT result would reassure a reader about an evaluation that never occurred. The syncope workup also changes the causal story from a mechanical fall to possible medical syncope.",
    model: "seeded-demo",
    provider: "static-demo",
    rubric: "site-demo-v1",
    demoResult: true,
  },
};

let syntheticCases = [];
let lastLabResult = null;

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

function renderEvidenceFreshness(results) {
  const target = document.getElementById("latest-powered-run");
  if (!target) return;
  const ranked = rankedRows(results);
  const latestDate = ranked
    .map((row) => row.scoredAt)
    .filter(Boolean)
    .sort()
    .pop();
  target.textContent = latestDate
    ? `${formatScoredAt(latestDate)} (${ranked.length} powered row${ranked.length === 1 ? "" : "s"})`
    : "no powered rows yet";
}

function formatScoredAt(value) {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? value : fmtDate.format(date);
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
  const defaultCase = seededCase();

  cases.forEach((c) => {
    const button = document.createElement("button");
    button.className = `case-button${c.id === defaultCase?.id ? " active" : ""}`;
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

  if (defaultCase) {
    renderCase(defaultCase);
    populateLab(defaultCase);
  }
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
  const loadSeededLab = () => populateLab(seededCase());
  document.getElementById("load-seeded-lab")?.addEventListener("click", loadSeededLab);
  document.getElementById("lab-empty-load-demo")?.addEventListener("click", loadSeededLab);
  document.getElementById("lab-empty-run")?.addEventListener("click", () => document.getElementById("lab-form")?.requestSubmit());
  document.getElementById("show-seeded-verdict")?.addEventListener("click", loadSeededLab);
  document.getElementById("refresh-models")?.addEventListener("click", () => loadLabModels(true));
  document.getElementById("generate-note")?.addEventListener("click", generateCandidateNote);
  liveSmokeButtons().forEach((button) => button.addEventListener("click", runLiveSmokeCheck));
  document.getElementById("copy-evidence-packet")?.addEventListener("click", copyEvidencePacket);
  document.getElementById("copy-lab-summary")?.addEventListener("click", copyLabSummary);
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
    resetLabResult();
    setLabStatus("");
  });
  document.getElementById("lab-source")?.addEventListener("input", (event) => {
    delete event.currentTarget.dataset.caseId;
    delete event.currentTarget.dataset.caseType;
    resetLabResult();
  });
  document.getElementById("lab-note")?.addEventListener("input", (event) => {
    delete event.currentTarget.dataset.generatedModel;
    resetLabResult();
  });
  document.getElementById("lab-form")?.addEventListener("submit", runLabJudge);

  syncProviderUi();
  setLiveSmokeStatus("Loading current free-model list...");
}

async function generateCandidateNote() {
  const source = document.getElementById("lab-source").value.trim();
  const model = document.getElementById("lab-generate-model").value;
  const provider = selectedProvider();
  const key = document.getElementById("lab-key").value.trim();

  if (!source) {
    setLabStatus("Source encounter is required before generation.");
    return null;
  }
  if (!model) {
    setLabStatus("Choose a generation model before generating a note.");
    return null;
  }
  if (key) sessionStorage.setItem(providerConfigs[provider].keyStorage, key);

  const generateButton = document.getElementById("generate-note");
  const runButton = document.getElementById("run-lab");
  generateButton.disabled = true;
  runButton.disabled = true;
  resetLabResult();
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
    updateLabEmptyForInputs();
    const usage = payload.usage?.total_tokens ? ` Tokens: ${payload.usage.total_tokens}.` : "";
    setLabStatus(`Generated candidate with ${payload.model || model}. Run the judge next.${usage}`);
    return payload;
  } catch (error) {
    setLabStatus(error.message || "Candidate generation failed.");
    return null;
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
    updateLiveSmokeReadiness(payload.models || config.defaultModels, payload.configured);
    if (payload.warning) setLabStatus(payload.warning);
    else if (force) setLabStatus(`${config.label} model list refreshed.`);
  } catch (_) {
    renderModelOptions(config.defaultModels);
    updateLiveSmokeReadiness(config.defaultModels, false);
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

function seededCase() {
  return syntheticCases.find((c) => c.id === "SYN-003") || syntheticCases[2] || syntheticCases[0];
}

function populateLab(c) {
  if (!c) return;
  const source = document.getElementById("lab-source");
  source.value = c.source || "";
  source.dataset.caseId = c.id || "";
  source.dataset.caseType = c.provenance || "synthetic";
  const note = document.getElementById("lab-note");
  note.value = c.candidateNote || "";
  delete note.dataset.generatedModel;
  const seededResult = buildSeededLabResult(c);
  if (seededResult) {
    renderLabResult(seededResult);
    setLabStatus(`Loaded ${c.id} with the seeded demo verdict. Run live judge to re-score with the selected model.`);
    return;
  }
  resetLabResult();
  setLabEmptyState(
    "Case ready",
    `${c.id} is loaded. Run the live judge to review fabrication, fidelity, leaks, and narrative quality.`,
    "Use this first, then replace the text with your own source and note."
  );
  setLabStatus(`Loaded ${c.id}.`);
}

function populateLabForLiveSmoke(c) {
  if (!c) return;
  const source = document.getElementById("lab-source");
  source.value = c.source || "";
  source.dataset.caseId = c.id || "";
  source.dataset.caseType = c.provenance || "synthetic";
  const note = document.getElementById("lab-note");
  note.value = "";
  delete note.dataset.generatedModel;
  resetLabResult();
  setLabEmptyState(
    "Ready for a live smoke check",
    `${c.id} is loaded. ScribeBench will generate a fresh note with the selected free model, then judge it against the source.`,
    "This is a one-note smoke check, not a ranked leaderboard row."
  );
  setLabStatus(`Loaded ${c.id}. Generating with the selected model next.`);
}

function buildSeededLabResult(c) {
  const result = seededDemoResults[c?.id];
  if (!result) return null;
  return {
    ...result,
    dimensions: { ...result.dimensions },
    fabrication: {
      dangerous: [...result.fabrication.dangerous],
      standard: [...result.fabrication.standard],
    },
    leaks: [...result.leaks],
    generatedModel: "bundled example candidate",
    caseId: c.id || "",
    caseType: c.provenance || "synthetic",
    sourceChars: String(c.source || "").length,
    noteChars: String(c.candidateNote || "").length,
  };
}

async function runLabJudge(event) {
  event?.preventDefault?.();
  const source = document.getElementById("lab-source").value.trim();
  const note = document.getElementById("lab-note").value.trim();
  const model = document.getElementById("lab-judge-model").value;
  const provider = selectedProvider();
  const key = document.getElementById("lab-key").value.trim();

  if (!source || !note) {
    setLabStatus("Source and note are required.");
    return null;
  }
  if (!model) {
    setLabStatus("Choose a judge model before running the judge.");
    return null;
  }
  if (key) sessionStorage.setItem(providerConfigs[provider].keyStorage, key);

  const runButton = document.getElementById("run-lab");
  runButton.disabled = true;
  setLabEmptyState(
    "Judge running",
    "The live judge is reviewing the source and candidate note for fabrication, fidelity, leaks, and narrative quality.",
    "Free hosted models can be slow on full notes."
  );
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
    const sourceEl = document.getElementById("lab-source");
    payload.caseId = sourceEl.dataset.caseId || "";
    payload.caseType = sourceEl.dataset.caseType || "";
    payload.sourceChars = source.length;
    payload.noteChars = note.length;
    renderLabResult(payload);
    setLabStatus("Done.");
    return payload;
  } catch (error) {
    setLabStatus(error.message || "Judge failed.");
    updateLabEmptyForInputs();
    return null;
  } finally {
    window.clearTimeout(slowNotice);
    runButton.disabled = false;
  }
}

async function runLiveSmokeCheck() {
  const c = seededCase();
  if (!c) {
    setLiveSmokeStatus("Demo cases are still loading. Try again in a moment.", "review");
    return;
  }
  setLiveSmokeBusy(true);
  setLiveSmokeStatus("Running: loading SYN-003 and refreshing current free models...");
  document.getElementById("lab")?.scrollIntoView({ behavior: "smooth", block: "start" });
  try {
    const providerSelect = document.getElementById("lab-provider");
    if (providerSelect) {
      cacheProviderKey(providerSelect.dataset.previousProvider || providerSelect.value);
      providerSelect.value = "openrouter";
      providerSelect.dataset.previousProvider = "openrouter";
      syncProviderUi();
    }
    await loadLabModels(false);
    populateLabForLiveSmoke(c);
    setLiveSmokeStatus("Running: generating a fresh candidate note...");
    const generated = await generateCandidateNote();
    if (!generated) {
      setLiveSmokeStatus("Generation did not finish. Check the Lab status for the exact error.", "review");
      return;
    }
    setLiveSmokeStatus("Running: judging the generated note for unsupported care...");
    const judged = await runLabJudge();
    if (!judged) {
      setLiveSmokeStatus("Judge did not finish. Check the Lab status for the exact error.", "review");
      return;
    }
    const dangerCount = judged.fabrication?.dangerous?.length || 0;
    const label = dangerCount
      ? `Complete: ${dangerCount} unsupported clinical item${dangerCount === 1 ? "" : "s"} flagged.`
      : "Complete: no dangerous fabrication flagged in this one-note smoke check.";
    setLiveSmokeStatus(label, dangerCount ? "danger" : "ok");
  } finally {
    setLiveSmokeBusy(false);
  }
}

function renderLabResult(result) {
  lastLabResult = result;
  document.getElementById("lab-empty").hidden = true;
  document.getElementById("lab-output").hidden = false;
  setCopyStatus("");
  setSummaryFallback("");
  const label = document.getElementById("lab-result-label");
  if (label) label.textContent = result.demoResult ? "Seeded demo result" : "Result";
  document.getElementById("lab-score").textContent = `${result.normalized ?? "--"}/100`;
  document.getElementById("lab-danger").textContent = String(result.fabrication?.dangerous?.length ?? 0);
  renderLabVerdict(result);
  renderEvidencePacket(result);

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
  const demo = result.demoResult ? "Demo result: precomputed from bundled SYN-003; run live judge to re-score. " : "";
  document.getElementById("lab-meta").textContent = `${demo}${generated}Judge: ${result.model || "unknown"}.${provider} Rubric: ${result.rubric || "site-lab"}.${usage}`;
}

function resetLabResult() {
  lastLabResult = null;
  const empty = document.getElementById("lab-empty");
  const output = document.getElementById("lab-output");
  const label = document.getElementById("lab-result-label");
  if (empty) empty.hidden = false;
  if (output) output.hidden = true;
  if (label) label.textContent = "Result";
  updateLabEmptyForInputs();
  setCopyStatus("");
  setSummaryFallback("");
}

function renderEvidencePacket(result) {
  const packet = labEvidencePacket(result);
  const scope = document.getElementById("packet-scope");
  if (scope) {
    scope.textContent = packet.scope;
    scope.dataset.tone = packet.tone;
  }
  setText("packet-case", packet.caseLabel);
  setText("packet-generator", packet.generator);
  setText("packet-judge", packet.judge);
  setText("packet-next-step", packet.nextStep);
  setText("packet-finding", packet.finding);
}

function setLabEmptyState(title, copy, detail = "") {
  const titleEl = document.getElementById("lab-empty-title");
  const copyEl = document.getElementById("lab-empty-copy");
  const detailEl = document.getElementById("lab-empty-detail");
  if (titleEl) titleEl.textContent = title;
  if (copyEl) copyEl.textContent = copy;
  if (detailEl) {
    detailEl.textContent = detail;
    detailEl.hidden = !detail;
  }
}

function updateLabEmptyForInputs() {
  const source = document.getElementById("lab-source")?.value.trim() || "";
  const note = document.getElementById("lab-note")?.value.trim() || "";
  if (!source && !note) {
    setLabEmptyState(
      "Waiting for a note",
      "Paste a source encounter and candidate note, or load the seeded demo.",
      "The judge needs both sides before it can review fabrication and source fidelity."
    );
    return;
  }
  if (source && note) {
    setLabEmptyState(
      "Ready to judge",
      "Run the live judge to get a verdict, flagged unsupported claims, leak scan, and copyable QA summary.",
      "Edit either text area anytime; stale results clear automatically."
    );
    return;
  }
  setLabEmptyState(
    "One side missing",
    "The judge needs both the source encounter and the candidate note.",
    "Paste the missing text or load the seeded demo."
  );
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

function labEvidencePacket(result) {
  const dangerous = cleanStringArray(result.fabrication?.dangerous);
  const leaks = cleanStringArray((result.leaks || []).map(formatLeakHit));
  const fidelityValue = Number(result.dimensions?.inputFidelity);
  const fidelityDisplay = Number.isFinite(fidelityValue) ? `${fidelityValue}/5` : "--";
  const normalized = Number(result.normalized);
  const scoreDisplay = Number.isFinite(normalized) ? `${normalized}/100` : "--";
  const verdict = labVerdict({
    dangerousCount: dangerous.length,
    leakCount: leaks.length,
    fidelity: Number.isFinite(fidelityValue) ? fidelityValue : 0,
    normalized: Number.isFinite(normalized) ? normalized : 0,
  });
  const scope = result.demoResult
    ? "Static demo"
    : result.caseId?.startsWith("SYN")
      ? "Live smoke"
      : "One-note triage";
  const tone = dangerous.length ? "danger" : leaks.length || Number(normalized) < 70 ? "review" : "ok";
  const caseLabel = result.caseId
    ? `${result.caseId}${result.caseType ? ` (${result.caseType})` : ""}`
    : "Custom pasted source";
  const generator = result.generatedModel || (result.demoResult ? "bundled example candidate" : "pasted candidate note");
  const judge = `${result.model || "unknown"}${result.provider ? ` via ${result.provider}` : ""}`;
  const nextStep = result.caseId?.startsWith("SYN") || result.demoResult
    ? "Treat as smoke evidence; run PriMock57 before making a system claim."
    : "Use as QA triage; run a powered benchmark before comparing systems.";
  const finding = dangerous.length
    ? `${dangerous.length} unsupported clinical item${dangerous.length === 1 ? "" : "s"} flagged. ${verdict.copy}`
    : `${verdict.title}. Narrative ${scoreDisplay}; input fidelity ${fidelityDisplay}.`;
  return {
    scope,
    tone,
    caseLabel,
    generator,
    judge,
    nextStep,
    finding,
    verdict,
    dangerous,
    leaks,
    scoreDisplay,
    fidelityDisplay,
  };
}

async function copyEvidencePacket() {
  if (!lastLabResult) {
    setCopyStatus("Run the judge first.");
    return;
  }
  const text = buildEvidencePacketText(lastLabResult);
  try {
    await copyText(text);
    setSummaryFallback("");
    setCopyStatus("Evidence packet copied.");
  } catch (_) {
    setSummaryFallback(text);
    setCopyStatus("Clipboard unavailable. Evidence packet shown below.");
  }
}

async function copyLabSummary() {
  if (!lastLabResult) {
    setCopyStatus("Run the judge first.");
    return;
  }
  const text = buildLabSummary(lastLabResult);
  try {
    await copyText(text);
    setSummaryFallback("");
    setCopyStatus("Summary copied.");
  } catch (_) {
    setSummaryFallback(text);
    setCopyStatus("Clipboard unavailable. Summary shown below.");
  }
}

function buildLabSummary(result) {
  const dangerous = cleanStringArray(result.fabrication?.dangerous);
  const standard = cleanStringArray(result.fabrication?.standard);
  const leaks = cleanStringArray((result.leaks || []).map(formatLeakHit));
  const fidelityValue = Number(result.dimensions?.inputFidelity);
  const fidelity = Number.isFinite(fidelityValue) ? fidelityValue : 0;
  const fidelityDisplay = Number.isFinite(fidelityValue) ? fidelityValue : "--";
  const normalized = Number(result.normalized);
  const dangerousCount = dangerous.length;
  const leakCount = leaks.length;
  const verdict = labVerdict({
    dangerousCount,
    leakCount,
    fidelity,
    normalized: Number.isFinite(normalized) ? normalized : 0,
  });
  const lines = [
    "ScribeBench lab result",
    result.demoResult ? "Result type: seeded static demo verdict" : "",
    `Verdict: ${verdict.title}`,
    `Narrative score: ${result.normalized ?? "--"}/100`,
    `Input fidelity: ${fidelityDisplay}/5`,
    `Dangerous fabrications: ${dangerousCount}`,
    `Leaks: ${leakCount}`,
    result.generatedModel ? `Generator: ${result.generatedModel}` : "",
    `Judge: ${result.model || "unknown"}`,
    result.provider ? `Provider: ${result.provider}` : "",
    result.rubric ? `Rubric: ${result.rubric}` : "",
    result.sourceChars ? `Source length: ${result.sourceChars} chars` : "",
    result.noteChars ? `Note length: ${result.noteChars} chars` : "",
    "",
    verdict.copy,
    verdict.action,
    "",
    "Dangerous items:",
    ...(dangerous.length ? dangerous.map((item) => `- ${item}`) : ["- None flagged."]),
    "",
    "Standard / accepted items:",
    ...(standard.length ? standard.map((item) => `- ${item}`) : ["- None listed."]),
    "",
    "Leak scan:",
    ...(leaks.length ? leaks.map((item) => `- ${item}`) : ["- No deterministic leaks."]),
    "",
    "Reasoning:",
    result.reasoning || "No reasoning returned.",
  ];
  return lines.filter((line, index, arr) => line || arr[index - 1]).join("\n").trim();
}

function buildEvidencePacketText(result) {
  const packet = labEvidencePacket(result);
  const lines = [
    "ScribeBench evidence packet",
    `Scope: ${packet.scope} (not a leaderboard row)`,
    `Case: ${packet.caseLabel}`,
    `Verdict: ${packet.verdict.title}`,
    `Narrative score: ${packet.scoreDisplay}`,
    `Input fidelity: ${packet.fidelityDisplay}`,
    `Dangerous fabrications: ${packet.dangerous.length}`,
    `Leaks: ${packet.leaks.length}`,
    `Generator: ${packet.generator}`,
    `Judge: ${packet.judge}`,
    result.rubric ? `Rubric: ${result.rubric}` : "",
    result.sourceChars ? `Source length: ${result.sourceChars} chars` : "",
    result.noteChars ? `Note length: ${result.noteChars} chars` : "",
    "URL: https://scribe-bench.vercel.app/#lab",
    "",
    "Public finding:",
    packet.finding,
    "",
    "What this supports:",
    packet.nextStep,
    "",
    "Flagged dangerous items:",
    ...(packet.dangerous.length ? packet.dangerous.map((item) => `- ${item}`) : ["- None flagged."]),
  ];
  return lines.filter((line, index, arr) => line || arr[index - 1]).join("\n").trim();
}

function cleanStringArray(value) {
  return Array.isArray(value)
    ? value.map((item) => String(item).trim()).filter(Boolean)
    : [];
}

function formatLeakHit(hit) {
  if (!hit) return "";
  if (typeof hit === "string") return hit;
  const marker = hit.marker ? `${hit.marker}: ` : "";
  return `${marker}${hit.excerpt || hit.surface || ""}`;
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("Copy command failed.");
}

function setCopyStatus(message) {
  const status = document.getElementById("lab-copy-status");
  if (status) status.textContent = message;
}

function setSummaryFallback(text) {
  const fallback = document.getElementById("lab-summary-fallback");
  if (!fallback) return;
  fallback.value = text;
  fallback.hidden = !text;
}

function setText(id, text) {
  const target = document.getElementById(id);
  if (target) target.textContent = text;
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

function liveSmokeButtons() {
  return ["run-live-smoke-top", "run-live-smoke-lab"]
    .map((id) => document.getElementById(id))
    .filter(Boolean);
}

function setLiveSmokeBusy(isBusy) {
  liveSmokeButtons().forEach((button) => {
    button.disabled = isBusy;
    const fallback = button.dataset.defaultLabel || "Run current-model smoke";
    button.textContent = isBusy ? (button.dataset.runningLabel || fallback) : fallback;
  });
}

function setLiveSmokeStatus(message, tone = "") {
  const status = document.getElementById("live-smoke-status");
  if (!status) return;
  status.textContent = message;
  status.dataset.tone = tone;
}

function updateLiveSmokeReadiness(models, configured) {
  if (selectedProvider() !== "openrouter") return;
  const usable = Array.isArray(models) && models.length > 0;
  if (configured && usable) {
    setLiveSmokeStatus(`Ready: ${models.length} current free model${models.length === 1 ? "" : "s"} available.`, "ok");
  } else if (usable) {
    setLiveSmokeStatus("Model list loaded. Paste a temporary key if generation asks for one.", "review");
  } else {
    setLiveSmokeStatus("Model list unavailable. Refresh models or paste a temporary OpenRouter key.", "review");
  }
}

function bindRunBuilder() {
  const builder = document.getElementById("run-builder");
  if (!builder) return;
  const candidateInput = document.getElementById("run-candidate");
  const repeatsSelect = document.getElementById("run-repeats");
  candidateInput?.addEventListener("input", () => {
    candidateInput.dataset.touched = "true";
  });
  repeatsSelect?.addEventListener("change", () => {
    repeatsSelect.dataset.touched = "true";
  });
  builder.querySelectorAll("input, select").forEach((control) => {
    control.addEventListener("input", updateRunBuilder);
    control.addEventListener("change", updateRunBuilder);
  });
  document.getElementById("run-dataset")?.addEventListener("change", syncRunDefaultsForDataset);
  document.getElementById("copy-candidate-template")?.addEventListener("click", () => copyRunArtifact("candidate"));
  document.getElementById("copy-run-command")?.addEventListener("click", () => copyRunArtifact("command"));
  syncRunDefaultsForDataset();
  updateRunBuilder();
}

function syncRunDefaultsForDataset() {
  const dataset = document.getElementById("run-dataset")?.value || "primock57";
  const candidateInput = document.getElementById("run-candidate");
  const repeatsSelect = document.getElementById("run-repeats");
  if (candidateInput && candidateInput.dataset.touched !== "true") {
    candidateInput.value = dataset === "synthetic" ? "/tmp/scribebench_smoke_notes.json" : "/tmp/scribebench_candidate_notes.json";
  }
  if (repeatsSelect && repeatsSelect.dataset.touched !== "true") {
    repeatsSelect.value = dataset === "synthetic" ? "1" : "2";
  }
  updateRunBuilder();
}

function runBuilderState() {
  const value = (id, fallback = "") => document.getElementById(id)?.value?.trim() || fallback;
  const dataset = value("run-dataset", "primock57");
  return {
    dataset,
    datasetPath: dataset === "synthetic" ? "data/synthetic/cases" : "data/primock57/cases",
    candidatePath: value(
      "run-candidate",
      dataset === "synthetic" ? "/tmp/scribebench_smoke_notes.json" : "/tmp/scribebench_candidate_notes.json"
    ),
    generator: value("run-generator", "openrouter"),
    model: value("run-model", "nvidia/nemotron-3-ultra-550b-a55b:free"),
    system: value("run-system", "openrouter-nemotron-3-ultra"),
    judgeBackend: value("run-judge-backend", "baseten"),
    judgeModel: value("run-judge-model", "deepseek-ai/DeepSeek-V4-Pro"),
    repeats: value("run-repeats", dataset === "synthetic" ? "1" : "2"),
  };
}

function updateRunBuilder() {
  const state = runBuilderState();
  const candidate = buildCandidateTemplate(state);
  const command = buildRunCommand(state);
  const candidateOutput = document.getElementById("candidate-template-output");
  const commandOutput = document.getElementById("run-command-output");
  const summary = document.getElementById("run-generate-summary");
  if (candidateOutput) candidateOutput.textContent = candidate;
  if (commandOutput) commandOutput.textContent = command;
  if (summary) {
    summary.textContent = state.generator === "own"
      ? `Run your own scribe over ${state.datasetPath}, save candidate notes to ${state.candidatePath}, then score them.`
      : `Generate candidate notes with ${state.generator}:${state.model}, then score ${state.datasetPath}.`;
  }
  setRunCopyStatus("");
  setRunCopyFallback("");
}

function buildCandidateTemplate(state = runBuilderState()) {
  const rows = state.dataset === "synthetic"
    ? [
        { caseId: "SYN-001", note: "HPI: ..." },
        { caseId: "SYN-003", note: "HPI: ..." },
      ]
    : [
        { caseId: "PM57-d1c01", note: "HPI: ..." },
        { caseId: "PM57-d1c02", note: "HPI: ..." },
      ];
  return JSON.stringify(rows, null, 2);
}

function buildRunCommand(state = runBuilderState()) {
  const generate = buildGenerateCommand(state);
  const judgeEnv = judgeEnvLines(state);
  const outPath = state.dataset === "synthetic" ? "leaderboard/_smoke-pending.json" : "leaderboard/_pending.json";
  const score = [
    "npm install",
    "",
    ...judgeEnv,
    "",
    "npx tsx eval/run_benchmark.ts \\",
    `  --dataset ${state.datasetPath} \\`,
    `  --candidate ${state.candidatePath} \\`,
    `  --system "${state.system}" \\`,
    `  --repeats ${state.repeats} \\`,
    `  --out ${outPath}`,
  ].join("\n");
  const policy = state.dataset === "synthetic"
    ? "# Smoke-test output is visible for plumbing, but not ranked."
    : "# For closed-model outputs, submit aggregate scores only; do not commit raw generated notes.";
  return [generate, score, policy].join("\n\n");
}

function buildGenerateCommand(state) {
  if (state.generator === "own") {
    return [
      "# Run your own scribe pipeline over the dataset.",
      `# Dataset: ${state.datasetPath}`,
      `# Save candidate notes to: ${state.candidatePath}`,
      "# Required JSON shape is shown in Artifact 1.",
    ].join("\n");
  }
  const env = state.generator === "baseten" ? "export BASETEN_API_KEY=..." : "export OPENROUTER_API_KEY=...";
  return [
    env,
    "",
    "npx tsx scripts/generate_baseline.ts \\",
    `  --gen ${state.generator} \\`,
    `  --model ${state.model} \\`,
    `  --dataset ${state.datasetPath} \\`,
    `  --out ${state.candidatePath}`,
  ].join("\n");
}

function judgeEnvLines(state) {
  const keyLine = {
    baseten: "export BASETEN_API_KEY=...",
    openrouter: "export OPENROUTER_API_KEY=...",
    anthropic: "export ANTHROPIC_API_KEY=...",
    cli: "# Claude CLI judge uses local OAuth; no API key export required.",
  }[state.judgeBackend];
  return [
    `export SCRIBEBENCH_BACKEND=${state.judgeBackend}`,
    keyLine,
    `export SCRIBEBENCH_JUDGE_MODEL=${state.judgeModel}`,
  ];
}

async function copyRunArtifact(kind) {
  const state = runBuilderState();
  const text = kind === "candidate" ? buildCandidateTemplate(state) : buildRunCommand(state);
  try {
    await copyText(text);
    setRunCopyFallback("");
    setRunCopyStatus(kind === "candidate" ? "Candidate template copied." : "Run command copied.");
  } catch (_) {
    setRunCopyFallback(text);
    setRunCopyStatus("Clipboard unavailable. Text shown below.");
  }
}

function setRunCopyStatus(message) {
  const status = document.getElementById("run-copy-status");
  if (status) status.textContent = message;
}

function setRunCopyFallback(text) {
  const fallback = document.getElementById("run-copy-fallback");
  if (!fallback) return;
  fallback.value = text;
  fallback.hidden = !text;
}

async function boot() {
  bindLab();
  bindRunBuilder();
  await loadLabModels();
  try {
    const [resultsPayload, casesPayload, metadata] = await Promise.all([
      loadJson("/assets/results.json"),
      loadJson("/assets/demo-cases.json"),
      loadJson("/assets/metadata.json"),
    ]);
    const results = resultsPayload.results || [];
    renderSnapshot(results, metadata);
    renderEvidenceFreshness(results);
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
