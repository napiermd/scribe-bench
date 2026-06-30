import { runLocalReceipt as buildLocalReceipt } from "./local_receipt.js";

const fmtPercent = (value) => `${(value * 100).toFixed(value === 0 ? 0 : 1)}%`;
const fmtCI = (ci, percent = false) => {
  if (!Array.isArray(ci) || ci.length !== 2) return "";
  if (percent) return ` [${(ci[0] * 100).toFixed(0)}-${(ci[1] * 100).toFixed(0)}%]`;
  return ` [${ci[0].toFixed(1)}-${ci[1].toFixed(1)}]`;
};
const fmtDate = new Intl.DateTimeFormat("en", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
const fmtDateTime = new Intl.DateTimeFormat("en", {
  month: "long",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "UTC",
  timeZoneName: "short",
});
const localDateStamp = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const demoFindings = {
  "SYN-001":
    "This is the clean control: the note carries forward the chest-pain story, ECG/troponin evidence, NSTEMI assessment, heparin, aspirin, nitroglycerin, cardiology, cath, and telemetry admission.",
  "SYN-002":
    "This case shows ordinary fidelity rather than drama: diabetes follow-up, adherence barrier, A1c trend, foot exam, SGLT2 start, diabetes education, and vaccine documentation all come from the source.",
  "SYN-003":
    "This candidate intentionally invents a head CT and a syncope workup. The source says the daughter brought the patient in after a mechanical rug trip and explicitly says there was no loss of consciousness or head strike.",
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
    preferredJudgeModel: "nvidia/nemotron-3-ultra-550b-a55b:free",
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

const claimGuides = {
  "vendor-zero": {
    status: "Needs proof",
    statusClass: "needed",
    title: "Do not accept hallucination-free as a slogan.",
    summary:
      "ScribeBench treats this as a safety claim. A demo or a polished note is not enough; the claim needs measured unsupported-care rates on a declared dataset.",
    required:
      "A powered run with case count, dataset, generator, judge, repeats, dangerous-fabrication rate, confidence interval, and tuning disclosure.",
    support:
      "The Lab can expose one-note failures and the leaderboard can host aggregate scores. Current smoke rows only prove the path works.",
    nextAction:
      "Ask for a PriMock57 or real-workflow aggregate row before repeating the claim.",
    ask:
      "Can you share aggregate ScribeBench-style evidence for this hallucination-free claim: dataset, n, generator, judge, repeats, dangerous-fabrication rate with CI, leak rate, and whether the system was tuned to the benchmark?",
  },
  "one-note": {
    status: "Triage only",
    statusClass: "open",
    title: "One note can be checked, not certified.",
    summary:
      "ScribeBench can compare a source encounter with a generated note and return a concrete QA verdict. That verdict is useful triage, not a final clinical sign-off.",
    required:
      "The source encounter, the generated note, a Lab verdict, flagged unsupported items, leak scan, and human clinical review for final use.",
    support:
      "The Lab already supports this path and produces a copyable evidence packet.",
    nextAction:
      "Paste the source and note in the Lab, run the judge, then review any flagged claims manually.",
    ask:
      "Can you provide the source encounter and generated note so we can run a ScribeBench one-note triage check for source-note issues and leaks?",
  },
  "system-better": {
    status: "Benchmark claim",
    statusClass: "valuable",
    title: "Better needs the same cases, judge, and rules.",
    summary:
      "A system comparison only means something if both systems were scored on the same dataset under the same evidence contract.",
    required:
      "Same dataset, same candidate-note policy, same judge or a declared judge-robustness pass, repeats, confidence intervals, and aggregate-only publication for closed outputs.",
    support:
      "The powered PriMock57 path is the intended public comparison surface. Smoke rows should not be used to crown a system.",
    nextAction:
      "Run both systems through the powered harness or submit a scores-only row with method details.",
    ask:
      "Can you share the comparable aggregate row: same dataset, n, repeats, judge model, dangerous-fabrication rate with CI, narrative mean, leak rate, and generation method for each system?",
  },
  "current-ranking": {
    status: "Not proven",
    statusClass: "needed",
    title: "The current public board is not a buying guide yet.",
    summary:
      "ScribeBench has historical powered launch baselines plus fresh smoke evidence. A current ranking needs new powered rows for the models people actually use now.",
    required:
      "Current model or vendor-system rows scored on PriMock57 or a declared real-workflow dataset, with repeats, judge, date, and confidence intervals.",
    support:
      "The site can show freshness, stale baselines, smoke rows, and the public queue. It should not claim a current winner until powered rows exist.",
    nextAction:
      "Use the Run section to create a current powered row, then update the board.",
    ask:
      "Can you add a current powered ScribeBench row before calling this a current ranking: model date, dataset, n, repeats, judge, dangerous-fabrication rate with CI, and method disclosure?",
  },
};

const claimPresets = {
  "vendor-zero": {
    type: "vendor-zero",
    text: "Our AI scribe is hallucination-free and ready for clinical deployment.",
  },
  "one-note": {
    type: "one-note",
    text: "This AI-generated chart note is safe to trust as-is.",
  },
  "system-better": {
    type: "system-better",
    text: "Our scribe produces better notes than the other ambient AI systems.",
  },
  "current-ranking": {
    type: "current-ranking",
    text: "This leaderboard proves which AI scribe model is best today.",
  },
};

const challengePlans = {
  "frontier-powered": {
    label: "Current system under test",
    status: "Needed now",
    statusClass: "needed",
    defaultSystem: "current-system-under-test",
    title: "A powered current row makes the board useful again.",
    run:
      "Run the actual current model, vendor system, or scribe pipeline across all 57 PriMock57 cases, then score the same candidate file with a declared judge and 2 repeats.",
    publish:
      "Publish aggregate scores only: dangerous-fabrication rate with CI, narrative mean with CI, fidelity mean, leak rate, model/date, judge, prompt policy, and tuning disclosure.",
    why:
      "This directly answers the old-model criticism. It turns the page from historical baselines into a current comparison surface.",
    evidence:
      "n=57 PriMock57, repeats=2, current system/date declared, judge declared, aggregate-only row, no closed raw notes.",
    next:
      "Use the Run section to create the candidate-note JSON and benchmark command, then open a GitHub PR with the aggregate row.",
  },
  "open-free": {
    label: "Open/free model candidate",
    status: "Low friction",
    statusClass: "open",
    defaultSystem: "openrouter-free-candidate",
    title: "A cheap model earns attention by surviving the smoke path first.",
    run:
      "Start with the seeded SYN-003 Lab flow and bundled synthetic smoke set. If it avoids obvious unsupported care, graduate it to all 57 PriMock57 cases.",
    publish:
      "Publish the smoke row separately from powered rows, then add a powered row only after the full PriMock57 run exists.",
    why:
      "This lets people test current open/free models without pretending three synthetic cases prove a system is best.",
    evidence:
      "Smoke first: n=3 synthetic cases. Powered next: n=57 PriMock57, repeats declared, judge declared, aggregate-only.",
    next:
      "Run the Lab smoke check, then use the powered path for any model worth discussing publicly.",
  },
  "real-workflow": {
    label: "Real scribe workflow",
    status: "High value",
    statusClass: "valuable",
    defaultSystem: "real-workflow-scribe",
    title: "A real workflow row is more useful than another generic model demo.",
    run:
      "Score candidate notes from an actual scribe pipeline against a declared dataset. PriMock57 is public; real-workflow datasets can be aggregate-only if raw notes cannot be shared.",
    publish:
      "Publish aggregate metrics, generation method, whether prompts were tuned to ScribeBench, judge model, repeats, dataset scope, and any exclusions.",
    why:
      "Buyers and builders care about deployed behavior. This turns ScribeBench into a public evidence ledger for real systems, not just model names.",
    evidence:
      "Aggregate metrics, dataset scope, judge, repeats, generation method, tuning disclosure, data policy followed.",
    next:
      "Prepare a scores-only submission and link it to the public evidence ledger.",
  },
  "judge-robustness": {
    label: "Second-judge robustness pass",
    status: "Needed",
    statusClass: "needed",
    defaultSystem: "judge-robustness-pass",
    title: "A second judge checks whether the ranking is judge-shaped.",
    run:
      "Reuse the exact same candidate notes from a promising row and re-score them with a second declared judge model.",
    publish:
      "Publish the changed dangerous-fabrication rate, narrative mean, rank movement, and any disagreements that would alter the public interpretation.",
    why:
      "A benchmark is weaker if one model silently grades another. Robustness rows make the evidence harder to dismiss.",
    evidence:
      "Same candidate notes, same dataset, second judge, changed metrics, changed ranking called out.",
    next:
      "Choose a second judge backend and submit the robustness row next to the original row.",
  },
};

const challengePresets = {
  "frontier-powered": {
    target: "frontier-powered",
  },
  "open-free": {
    target: "open-free",
  },
  "real-workflow": {
    target: "real-workflow",
  },
  "judge-robustness": {
    target: "judge-robustness",
  },
};

const startRoutes = {
  note: {
    kicker: "Fastest useful path",
    title: "Paste source plus note. Check for invented care.",
    copy:
      "Start with one encounter and one generated note. ScribeBench checks whether the note stayed faithful, invented unsupported care, leaked template junk, and what claim that result can actually support.",
    input: "Source encounter and generated note.",
    action: "Use the first-screen browser check instantly, then open the Lab only if you need model-backed scoring.",
    output: "A copyable QA receipt and a clear next proof step.",
    primary: { label: "Check this note", href: "#quick-check" },
    secondary: { label: "See the seeded catch", href: "#demo" },
  },
  buyer: {
    kicker: "For buyers and clinical leaders",
    title: "Turn vendor polish into an evidence ask.",
    copy:
      "Use ScribeBench when a demo note looks impressive or a vendor says the scribe is hallucination-free. The site separates a one-note catch from a system-level claim.",
    input: "A demo note, vendor claim, or internal pilot example.",
    action: "Use the claim checker, inspect the seeded failure, then ask for aggregate PriMock57 or real-workflow scores.",
    output: "A concrete public ask: dataset, n, judge, repeats, dangerous-fabrication rate, leak rate, and disclosure.",
    primary: { label: "Check a claim", href: "#claim-check" },
    secondary: { label: "Read evidence gaps", href: "#leaderboard" },
  },
  builder: {
    kicker: "For scribe builders",
    title: "Find failures before a note becomes a promise.",
    copy:
      "Use the Lab as a fast triage loop, then graduate anything worth discussing to a powered PriMock57 run. Smoke checks are useful, but they are not a crown.",
    input: "A model, prompt, or pipeline that generates clinical notes.",
    action: "Run the seeded SYN-003 smoke path, paste your own note, then score a full candidate file when the smoke path survives.",
    output: "A failure signal, judge summary, and a reproducible path to an aggregate benchmark row.",
    primary: { label: "Run current smoke", href: "#lab" },
    secondary: { label: "Add a row", href: "#run" },
  },
  contributor: {
    kicker: "For people improving the public board",
    title: "Add the current rows the site is missing.",
    copy:
      "The old rows are kept as historical baselines. The useful public work is adding current frontier, open/free, real-workflow, and second-judge rows without publishing raw closed-model notes.",
    input: "A system label, candidate-note file, dataset choice, generation model, judge, and repeats.",
    action: "Copy a run plan, generate aggregate scores, and submit the scores-only row through GitHub.",
    output: "A public evidence row or a visible blocker that explains what still needs to be run.",
    primary: { label: "Copy challenge plan", href: "#current-challenge" },
    secondary: { label: "See repo map", href: "#repo-map" },
  },
};

const runPresets = {
  "current-powered": {
    status: "Publishable",
    statusClass: "ready",
    title: "Current powered row",
    bring: "Candidate notes from the actual current model, vendor system, or scribe pipeline you want to discuss.",
    run: "Run that system over all 57 PriMock57 cases outside ScribeBench, save candidate-note JSON, then score it with a declared judge and 2 repeats.",
    submit: "Publish aggregate scores only: dangerous-fabrication rate, narrative mean, fidelity, leak rate, system date, judge, repeats, and tuning disclosure.",
    fields: {
      dataset: "primock57",
      system: "current-system-under-test",
      candidatePath: "/tmp/current_system_primock57_notes.json",
      generator: "own",
      model: "current-production-scribe-or-frontier-model",
      repeats: "2",
      judgeBackend: "baseten",
      judgeModel: "declared-strong-judge-model",
    },
  },
  "quick-smoke": {
    status: "Smoke only",
    statusClass: "open",
    title: "Quick smoke test",
    bring: "A model or prompt you want to sanity-check before spending a full PriMock57 run.",
    run: "Score the 3 bundled synthetic cases first, especially the seeded SYN-003 unsupported-workup catch.",
    submit: "Keep it separate from ranked evidence. A smoke row proves the path works; it does not crown a system.",
    fields: {
      dataset: "synthetic",
      system: "openrouter-free-smoke",
      candidatePath: "/tmp/scribebench_smoke_notes.json",
      generator: "openrouter",
      model: "nvidia/nemotron-3-ultra-550b-a55b:free",
      repeats: "1",
      judgeBackend: "openrouter",
      judgeModel: "nvidia/nemotron-3-ultra-550b-a55b:free",
    },
  },
  "real-workflow": {
    status: "High value",
    statusClass: "valuable",
    title: "Real workflow row",
    bring: "Candidate notes from an actual scribe workflow plus a dataset scope you can describe publicly.",
    run: "Save your pipeline output in the candidate-note JSON shape, then score it with a declared judge.",
    submit: "Publish aggregate metrics, generation method, dataset scope, exclusions, repeats, judge, and tuning disclosure.",
    fields: {
      dataset: "primock57",
      system: "real-workflow-scribe",
      candidatePath: "/tmp/real_workflow_scribebench_notes.json",
      generator: "own",
      model: "your-production-scribe",
      repeats: "2",
      judgeBackend: "baseten",
      judgeModel: "deepseek-ai/DeepSeek-V4-Pro",
    },
  },
  "second-judge": {
    status: "Robustness",
    statusClass: "needed",
    title: "Second-judge pass",
    bring: "The same candidate notes from a promising row plus a different declared judge backend.",
    run: "Reuse the candidate file and re-score it with a second judge so ranking movement is visible.",
    submit: "Publish changed dangerous-fabrication rate, narrative mean, rank movement, and interpretation-changing disagreements.",
    fields: {
      dataset: "primock57",
      system: "second-judge-robustness",
      candidatePath: "/tmp/existing_row_candidate_notes.json",
      generator: "own",
      model: "reuse-existing-candidate-file",
      repeats: "2",
      judgeBackend: "anthropic",
      judgeModel: "declared-independent-judge-model",
    },
  },
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
let selectedDemoCase = null;
let lastQuickResult = null;
let lastLabResult = null;
let lastSmokeResult = null;
let lastPublicEvidenceCard = null;

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
  if (metrics.length < 2) return;
  metrics[0].textContent = String(cases);
  metrics[1].textContent = String(ranked.length);
}

function renderLeaderboard(results) {
  const ranked = rankedRows(results).sort(byRank);
  renderResultRows("leaderboard-body", ranked, {
    ranked: true,
    emptyText: "No powered PriMock57 rows found.",
  });
  renderResultRows("smoke-body", smokeRows(results).sort(byRank), {
    ranked: false,
    emptyText: "No synthetic smoke-test rows found.",
  });
  renderEvidenceDigest(results, ranked);
}

function renderEvidenceDigest(results, ranked = rankedRows(results).sort(byRank)) {
  const best = ranked[0];
  const riskiest = [...ranked].sort((a, b) =>
    Number(b.dangerousFabricationRate || 0) - Number(a.dangerousFabricationRate || 0) ||
    String(a.system || "").localeCompare(String(b.system || ""))
  )[0];
  const smoke = smokeRows(results).filter((row) => row.claimLevel === "smoke");
  const latestSmoke = latestRow(smoke);

  if (best) {
    setText("digest-best-system", best.system);
    setText(
      "digest-best-detail",
      `${formatScoredAt(best.scoredAt)} powered PriMock57 row, n=${best.n}, dangerous fab ${fmtPercent(Number(best.dangerousFabricationRate) || 0)}${fmtCI(best.dangerousFabricationRateCI, true)}. Historical baseline, not a current buying guide.`
    );
  } else {
    setText("digest-best-system", "No powered row yet");
    setText("digest-best-detail", "Run at least 30 PriMock57 cases before publishing a system-level claim.");
  }

  if (riskiest) {
    setText("digest-risk-system", riskiest.system);
    setText(
      "digest-risk-detail",
      `Highest dangerous-fab signal in the powered rows: ${fmtPercent(Number(riskiest.dangerousFabricationRate) || 0)} across ${riskiest.n} PriMock57 cases. This is why fluent notes still need source checks.`
    );
  } else {
    setText("digest-risk-system", "No risk signal yet");
    setText("digest-risk-detail", "The table needs powered rows before it can show a failure gradient.");
  }

  if (latestSmoke) {
    const n = Number(latestSmoke.n) || 0;
    const dangerCases = Math.round((Number(latestSmoke.dangerousFabricationRate) || 0) * n);
    setText("digest-smoke-system", latestSmoke.system);
    setText(
      "digest-smoke-detail",
      `${formatScoredAt(latestSmoke.scoredAt)} smoke row, n=${n}, ${dangerCases}/${n} dangerous-fab cases. Useful plumbing proof; not a ranked result.`
    );
  } else {
    setText("digest-smoke-system", "No smoke row yet");
    setText("digest-smoke-detail", "Run the Lab smoke path first, then graduate credible candidates to PriMock57.");
  }

  setText(
    "digest-action-detail",
    ranked.length
      ? `${ranked.length} powered historical row${ranked.length === 1 ? "" : "s"} are visible. The useful next public artifact is a current powered PriMock57 row with aggregate scores, date, judge, repeats, and tuning disclosure.`
      : "The useful next public artifact is a powered PriMock57 row with aggregate scores, date, judge, repeats, and tuning disclosure."
  );
}

function renderEvidenceFreshness(results) {
  const target = document.getElementById("latest-powered-run");
  const ranked = rankedRows(results);
  const latestPowered = latestRow(ranked);
  if (target) {
    target.textContent = latestPowered
      ? `${formatScoredAt(latestPowered.scoredAt)} (${ranked.length} powered row${ranked.length === 1 ? "" : "s"})`
      : "no powered rows yet";
  }
  setText(
    "freshness-powered-age",
    latestPowered
      ? `${ranked.length} powered launch baseline row${ranked.length === 1 ? "" : "s"}; latest scored ${formatScoredAt(latestPowered.scoredAt)}. Cite as historical failure-gradient evidence, not as today's model ranking.`
      : "No powered PriMock57 baseline is available yet."
  );
  setText(
    "decision-history-proof",
    latestPowered
      ? `${ranked.length} powered launch row${ranked.length === 1 ? "" : "s"}; latest scored ${formatScoredAt(latestPowered.scoredAt)}. Historical baseline, not a current buying guide.`
      : "No powered PriMock57 row is available yet."
  );

  const smoke = smokeRows(results).filter((row) => row.claimLevel === "smoke");
  const latestSmoke = latestRow(smoke);
  const smokeTarget = document.getElementById("latest-smoke-run");
  if (smokeTarget) {
    smokeTarget.textContent = latestSmoke
      ? `${formatScoredAt(latestSmoke.scoredAt)} (${smoke.length} smoke row${smoke.length === 1 ? "" : "s"})`
      : "no smoke rows yet";
  }
  setText(
    "decision-smoke-proof",
    latestSmoke
      ? `Latest smoke row: ${formatScoredAt(latestSmoke.scoredAt)}, n=${Number(latestSmoke.n) || "--"} synthetic cases. Useful plumbing proof, not a ranking.`
      : "No smoke row is published yet; start with the Lab or one-note checker."
  );
  setText(
    "freshness-smoke-lane",
    latestSmoke
      ? `${formatScoredAt(latestSmoke.scoredAt)} smoke row, n=${Number(latestSmoke.n) || "--"} synthetic cases. Good enough to prove the public path works; not enough to compare systems.`
      : "No smoke row is published yet; run the Lab smoke path before graduating a candidate to PriMock57."
  );
  setText(
    "hero-evidence-boundary",
    latestPowered
      ? `${ranked.length} historical powered row${ranked.length === 1 ? "" : "s"}; latest ${formatScoredAt(latestPowered.scoredAt)}. Cite the failure gradient, not a current winner.`
      : "One-note receipts are live now. Current-model claims still need powered aggregate rows."
  );
  renderFreshSmoke(latestSmoke);
}

function latestRow(rows) {
  const dated = rows.filter((row) => row.scoredAt);
  dated.sort((a, b) => String(a.scoredAt).localeCompare(String(b.scoredAt)));
  return dated[dated.length - 1] || rows[rows.length - 1] || null;
}

function renderFreshSmoke(row) {
  if (!row) {
    setText("fresh-smoke-copy", "No smoke row has been published yet. Use the Lab to run one, then graduate useful candidates to PriMock57.");
    setText("fresh-smoke-system", "--");
    setText("fresh-smoke-scope", "No row");
    setText("fresh-smoke-danger", "--");
    setText("fresh-smoke-next", "Run a smoke check first");
    return;
  }

  const n = Number(row.n) || 0;
  const dangerCases = Math.round((Number(row.dangerousFabricationRate) || 0) * n);
  const repeats = Number(row.repeats) || 1;
  const date = formatScoredAt(row.scoredAt);
  setText(
    "fresh-smoke-copy",
    `${date}: ${row.system} completed ${n}/${n + (Number(row.nErrored) || 0)} bundled synthetic cases through the public path. This is fresh plumbing evidence, not a ranking claim.`
  );
  setText("fresh-smoke-system", row.system);
  setText("fresh-smoke-scope", `${n} synthetic cases, ${repeats} repeat${repeats === 1 ? "" : "s"}`);
  setText("fresh-smoke-danger", `${dangerCases}/${n} cases (${fmtPercent(Number(row.dangerousFabricationRate) || 0)})`);
  setText("fresh-smoke-next", "Run PriMock57 before saying the system is better.");
}

function renderCurrentRun(run) {
  const card = document.getElementById("current-run");
  if (!card || !run) return;
  const status = document.getElementById("current-run-status");
  const last = run.lastScoredCase || {};
  const target = Number(run.targetCases) || 57;
  const selected = Number(run.selectedCases) || 0;
  const generated = Number(run.generatedCases) || 0;
  const scored = Number(run.scoredCases) || 0;
  const errored = Number(run.erroredCases) || 0;
  const links = Array.isArray(run.links) ? run.links : [];
  const resumeCommand = String(run.resumeCommand || "").trim();
  const minimumPublishable = Number(run.minimumPublishableCases) || MIN_RANKED_CASES;
  const attempted = selected || target;
  const lastAttemptText = formatTimestamp(run.lastAttemptAt);
  const attemptText = lastAttemptText
    ? ` Last public retry: ${lastAttemptText}; ${scored}/${attempted} selected cases scored and ${errored}/${attempted} errored or blocked.`
    : "";

  if (status) {
    status.textContent = run.statusLabel || "Open";
    status.className = `queue-status ${currentRunStatusClass(run.status)}`;
  }
  setText("current-run-title", run.title || "Current PriMock57 run attempt");
  setText(
    "current-run-copy",
    `${run.system || "current public API run"} is ${scored}/${target} scored toward a publishable current row. ${generated}/${attempted} selected cases have generated notes.${attemptText} ${run.rawNotesPolicy || "Raw generated notes are not published."}`
  );
  setText(
    "freshness-current-gap",
    `${scored}/${target} current PriMock57 cases scored; latest public retry attempted ${attempted} and left ${errored} errored or blocked. Publishable threshold is ${minimumPublishable}+ scored cases with declared system, date, judge, repeats, and exclusions.`
  );
  setText(
    "freshness-next-row",
    `Resume ${run.system || "the current system"} to at least ${minimumPublishable} scored PriMock57 cases, preferably all ${target}, then publish aggregate scores only.`
  );
  setText("current-run-generated", `${generated}/${attempted}`);
  setText("current-run-scored", `${scored}/${target}`);
  setText("current-run-errored", `${errored}/${attempted}`);
  setText(
    "current-run-last-score",
    last.caseId
      ? `${last.caseId}: ${last.normalized}/100, fidelity ${last.inputFidelity}/5, dangerous ${last.dangerousFabrications || 0}`
      : "--"
  );
  setText("current-run-blocker", run.blocker || "No blocker recorded.");
  setText("current-run-next", run.next || "Continue the run and publish only when the evidence threshold is met.");
  setText("current-run-unblock", run.unblockAsk || "Use the run builder to create a publishable powered row.");
  setText("current-run-resume-command", resumeCommand);
  setText(
    "decision-current-proof",
    `${scored}/${target} current PriMock57 cases scored; latest retry attempted ${attempted} and left ${errored} blocked or errored. Publishable threshold is ${minimumPublishable}+ scored cases with declared model, judge, repeats, and date.`
  );
  setText(
    "hero-current-gap",
    `${scored}/${target} current PriMock57 cases scored. Latest retry: ${scored}/${attempted} selected cases scored; free-model cap blocks the rest.`
  );
  setElementHtml(
    "decision-current-action",
    scored >= minimumPublishable
      ? `<a href="#current-run">Review the current-row output</a>`
      : `<a href="#current-run">Resume the current row</a>`
  );
  setCurrentRunCopyStatus("");
  setCurrentRunCopyFallback("");

  const commandCard = document.getElementById("current-run-command-card");
  if (commandCard) commandCard.hidden = !resumeCommand;

  const linkTarget = document.getElementById("current-run-links");
  if (linkTarget) {
    linkTarget.innerHTML = links
      .map((link) => `<a href="${escapeHtml(link.href || "#")}"${externalLinkAttrs(link.href)}>${escapeHtml(link.label || "Open")}</a>`)
      .join("");
  }
}

function renderCurrentRunError() {
  const status = document.getElementById("current-run-status");
  if (status) {
    status.textContent = "Unavailable";
    status.className = "queue-status needed";
  }
  setText("current-run-title", "Could not load current run status");
  setText("current-run-copy", "The public runner still exists in GitHub; the status asset failed to load.");
  setText("current-run-generated", "--");
  setText("current-run-scored", "--");
  setText("current-run-errored", "--");
  setText("current-run-last-score", "--");
  setText("decision-current-proof", "Current-run status could not load from /assets/current-run.json.");
  setText("freshness-current-gap", "Current-run status could not load, so no current ranking claim is supported from this page.");
  setText("freshness-next-row", "Use the Add evidence path to create a current powered row with aggregate scores, declared judge, repeats, date, and exclusions.");
  setText("hero-current-gap", "Current-run status did not load. Do not use the old rows as a current ranking.");
  setElementHtml("decision-current-action", `<a href="#run">Add a fresh powered row</a>`);
  const commandCard = document.getElementById("current-run-command-card");
  if (commandCard) commandCard.hidden = true;
}

function currentRunStatusClass(status) {
  return {
    "needs-credit-or-second-judge": "needed",
    running: "open",
    ready: "ready",
    blocked: "needed",
  }[String(status || "").toLowerCase()] || "open";
}

function bindCurrentRunCommand() {
  document.getElementById("copy-current-run-command")?.addEventListener("click", copyCurrentRunCommand);
}

async function copyCurrentRunCommand() {
  const text = document.getElementById("current-run-resume-command")?.textContent?.trim() || "";
  if (!text) return;
  try {
    await copyText(text);
    setCurrentRunCopyFallback("");
    setCurrentRunCopyStatus("Resume command copied.");
  } catch (_) {
    setCurrentRunCopyFallback(text);
    setCurrentRunCopyStatus("Clipboard unavailable. Command shown below.");
  }
}

function setCurrentRunCopyStatus(message) {
  const status = document.getElementById("current-run-copy-status");
  if (status) status.textContent = message;
}

function setCurrentRunCopyFallback(text) {
  const fallback = document.getElementById("current-run-copy-fallback");
  if (!fallback) return;
  fallback.value = text;
  fallback.hidden = !text;
}

function renderWorkLog(payload) {
  const list = document.getElementById("worklog-list");
  if (!list) return;
  const entries = Array.isArray(payload?.entries) ? payload.entries : [];
  list.innerHTML = "";

  if (!entries.length) {
    list.innerHTML = `
      <article>
        <span class="queue-status needed">Missing</span>
        <h3>No public work log entries yet</h3>
        <p>Ship a concrete change, then add the proof and next step to worklog.json.</p>
      </article>
    `;
    return;
  }

  entries.slice(0, 4).forEach((entry) => {
    const links = Array.isArray(entry.links) ? entry.links : [];
    const article = document.createElement("article");
    article.innerHTML = `
      <div class="worklog-main">
        <span class="queue-status ${worklogStatusClass(entry.status)}">${escapeHtml(entry.status || "logged")}</span>
        <small>${escapeHtml(formatScoredAt(entry.date || payload.updatedAt || ""))}</small>
        <h3>${escapeHtml(entry.title || "Untitled work")}</h3>
        <p>${escapeHtml(entry.why || "")}</p>
      </div>
      <dl>
        <div>
          <dt>Proof</dt>
          <dd>${escapeHtml(entry.proof || "No proof recorded.")}</dd>
        </div>
        <div>
          <dt>Next</dt>
          <dd>${escapeHtml(entry.next || "No next step recorded.")}</dd>
        </div>
      </dl>
      <div class="worklog-links">
        ${links.map((link) => `<a href="${escapeHtml(link.href || "#")}"${externalLinkAttrs(link.href)}>${escapeHtml(link.label || "Open")}</a>`).join("")}
      </div>
    `;
    list.appendChild(article);
  });
}

function renderWorkLogError() {
  const list = document.getElementById("worklog-list");
  if (!list) return;
  list.innerHTML = `
    <article>
      <span class="queue-status needed">Unavailable</span>
      <h3>Could not load the public work log</h3>
      <p>The benchmark still works; the work-log asset failed to load.</p>
    </article>
  `;
}

function worklogStatusClass(status) {
  return {
    shipped: "ready",
    open: "open",
    needed: "needed",
    valuable: "valuable",
  }[String(status || "").toLowerCase()] || "open";
}

function externalLinkAttrs(href = "") {
  return /^https?:\/\//i.test(href) ? ' target="_blank" rel="noreferrer"' : "";
}

function formatScoredAt(value) {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? value : fmtDate.format(date);
}

function formatTimestamp(value) {
  const date = new Date(String(value || ""));
  return Number.isNaN(date.getTime()) ? "" : fmtDateTime.format(date);
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
    body.innerHTML = `<tr><td colspan="10">${escapeHtml(emptyText)}</td></tr>`;
    return;
  }

  rows.forEach((row, index) => {
    const tr = document.createElement("tr");
    const danger = fmtPercent(row.dangerousFabricationRate);
    const dangerCI = fmtCI(row.dangerousFabricationRateCI, true);
    const narrativeCI = fmtCI(row.narrativeMeanCI);
    const leak = fmtPercent(row.leakRate);
    const width = Math.max(2, Math.min(100, row.dangerousFabricationRate * 100));
    const statusLabel = ranked ? `Baseline ${index + 1}` : "Smoke";
    const statusDetail = ranked ? "Historical" : "Not ranked";
    const scoredAt = row.scoredAt ? formatScoredAt(row.scoredAt) : "--";

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
      <td>${escapeHtml(scoredAt)}</td>
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
    populateQuickCheck(defaultCase, { run: true });
  }
  document.getElementById("case-load-lab")?.addEventListener("click", () => {
    if (!selectedDemoCase) return;
    populateLab(selectedDemoCase);
    document.getElementById("lab")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  document.getElementById("case-load-quick")?.addEventListener("click", () => {
    if (!selectedDemoCase) return;
    populateQuickCheck(selectedDemoCase, { run: true });
    document.getElementById("main")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

function renderCase(c) {
  selectedDemoCase = c;
  const tagText = (c.tags || []).join(" / ") || c.provenance || "demo";
  document.getElementById("case-tags").textContent = tagText;
  document.getElementById("case-title").textContent = c.id;
  document.getElementById("source-text").textContent = c.source;
  document.getElementById("candidate-text").textContent = c.candidateNote || "No candidate note found.";
  document.getElementById("case-finding").textContent = demoFindings[c.id] || "Compare the source encounter to the generated note.";
  renderCaseReceipt(c);

  const status = document.getElementById("case-status");
  const isSeeded = c.id === "SYN-003";
  status.textContent = isSeeded ? "Seeded fabrication" : "Control case";
  status.classList.toggle("danger", isSeeded);
}

function renderCaseReceipt(c) {
  const result = buildLocalReceipt(c?.source || "", c?.candidateNote || "", {
    generatedModel: "bundled example candidate",
    caseId: c?.id || "",
    caseType: c?.provenance || "synthetic",
  });
  const dangerousCount = result.fabrication?.dangerous?.filter(Boolean).length || 0;
  const leakCount = result.leaks?.filter(Boolean).length || 0;
  const verdict = labVerdict({
    dangerousCount,
    leakCount,
    fidelity: Number(result.dimensions?.inputFidelity || 0),
    normalized: Number(result.normalized || 0),
    localResult: true,
    issueTypes: receiptIssueTypes(result),
  });
  const status = document.getElementById("case-receipt-status");
  if (status) {
    status.textContent = dangerousCount ? "Review" : leakCount ? "Leak" : "Clean triage";
    status.className = `queue-status ${dangerousCount ? "needed" : leakCount ? "open" : "ready"}`;
  }
  setText("case-receipt-title", verdict.title);
  setText("case-receipt-score", `${result.normalized}/100`);
  setText("case-receipt-flagged", String(dangerousCount));
  setText("case-receipt-leaks", String(leakCount));
  setText("case-receipt-next", verdict.action);

  const list = document.getElementById("case-receipt-list");
  if (!list) return;
  list.innerHTML = "";
  if (dangerousCount) {
    renderDangerousFindingsInto(list, result);
    return;
  }
  const items = leakCount
    ? (result.leaks || []).map((hit) => `${hit.marker}: ${hit.excerpt}`)
    : ["No obvious unsupported care, demographic mismatch, laterality issue, allergy contradiction, or deterministic leak was found by the browser receipt."];
  for (const item of items.filter(Boolean)) {
    const li = document.createElement("li");
    li.textContent = item;
    list.appendChild(li);
  }
}

function bindClaimChecker() {
  const form = document.getElementById("claim-form");
  if (!form) return;
  const claimType = document.getElementById("claim-type");
  const claimText = document.getElementById("claim-text");
  form.addEventListener("submit", (event) => event.preventDefault());
  document.querySelectorAll("[data-claim-preset]").forEach((button) => {
    button.addEventListener("click", () => applyClaimPreset(button.dataset.claimPreset || "vendor-zero"));
  });
  claimType?.addEventListener("change", () => {
    setActiveClaimPreset(matchingClaimPresetKey());
    renderClaimCheck();
  });
  claimText?.addEventListener("input", () => {
    setActiveClaimPreset(matchingClaimPresetKey());
    renderClaimCheck();
  });
  document.getElementById("copy-claim-ask")?.addEventListener("click", copyClaimAsk);
  document.getElementById("claim-send-card")?.addEventListener("click", sendClaimToPublicCard);
  if (!currentClaimText()) applyClaimPreset("vendor-zero");
  else {
    setActiveClaimPreset(matchingClaimPresetKey());
    renderClaimCheck();
  }
}

function applyClaimPreset(key) {
  const preset = claimPresets[key] || claimPresets["vendor-zero"];
  const claimType = document.getElementById("claim-type");
  const claimText = document.getElementById("claim-text");
  if (claimType) claimType.value = preset.type;
  if (claimText) claimText.value = preset.text;
  setActiveClaimPreset(key);
  renderClaimCheck();
}

function matchingClaimPresetKey() {
  const type = document.getElementById("claim-type")?.value || "";
  const text = currentClaimText();
  return Object.entries(claimPresets).find(([, preset]) => preset.type === type && preset.text === text)?.[0] || "";
}

function setActiveClaimPreset(key) {
  document.querySelectorAll("[data-claim-preset]").forEach((button) => {
    const active = Boolean(key) && button.dataset.claimPreset === key;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });
}

function selectedClaimGuide() {
  const type = document.getElementById("claim-type")?.value || "vendor-zero";
  return claimGuides[type] || claimGuides["vendor-zero"];
}

function currentClaimText() {
  return document.getElementById("claim-text")?.value.trim() || "";
}

function renderClaimCheck() {
  const guide = selectedClaimGuide();
  const claim = currentClaimText();
  const status = document.getElementById("claim-status");
  if (status) {
    status.textContent = guide.status;
    status.className = `queue-status ${guide.statusClass}`;
  }
  setText("claim-title", guide.title);
  setText("claim-summary", claim ? `For "${shortClaim(claim)}": ${guide.summary}` : guide.summary);
  setText("claim-required", guide.required);
  setText("claim-support", guide.support);
  setText("claim-next-action", guide.nextAction);
  setText("claim-public-ask", buildClaimAsk(guide, claim));
  setClaimCopyStatus("");
  setClaimCopyFallback("");
}

function shortClaim(value) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > 140 ? `${text.slice(0, 137)}...` : text;
}

function buildClaimAsk(guide = selectedClaimGuide(), claim = currentClaimText()) {
  const claimLine = claim ? `Claim: "${claim}"` : "Claim: [paste the exact public or vendor claim here]";
  return [
    "ScribeBench evidence ask",
    claimLine,
    `Current status: ${guide.status}`,
    "",
    guide.ask,
    "",
    `Why: ${guide.summary}`,
    `Next step: ${guide.nextAction}`,
    "Reference: https://scribe-bench.vercel.app/#claim-check",
  ].join("\n");
}

async function copyClaimAsk() {
  const text = buildClaimAsk();
  try {
    await copyText(text);
    setClaimCopyFallback("");
    setClaimCopyStatus("Public ask copied.");
  } catch (_) {
    setClaimCopyFallback(text);
    setClaimCopyStatus("Clipboard unavailable. Public ask shown below.");
  }
}

function setClaimCopyStatus(message) {
  const status = document.getElementById("claim-copy-status");
  if (status) status.textContent = message;
}

function setClaimCopyFallback(text) {
  const fallback = document.getElementById("claim-copy-fallback");
  if (!fallback) return;
  fallback.value = text;
  fallback.hidden = !text;
}

function sendClaimToPublicCard() {
  const guide = selectedClaimGuide();
  const claim = currentClaimText();
  renderPublicEvidenceCard(publicEvidenceCardFromClaim(guide, claim), { scroll: true });
  setClaimCopyStatus("Public evidence card ready.");
}

function publicEvidenceCardFromClaim(guide, claim) {
  const claimLine = claim ? `"${shortClaim(claim)}"` : "the pasted AI-scribe claim";
  return {
    status: guide.status,
    statusClass: guide.statusClass,
    title: "Claim evidence card",
    summary: `For ${claimLine}, ScribeBench turns the claim into the evidence level it would actually require.`,
    happened: claim ? `Claim checked: ${shortClaim(claim)}` : "Claim checked from the selected preset.",
    level: guide.status,
    boundary: "This is an evidence ask, not proof that the claim is true or false.",
    next: guide.nextAction,
    reference: "https://scribe-bench.vercel.app/#claim-check",
    copyText: [
      "ScribeBench public evidence card",
      `Date: ${localDateStamp()}`,
      "Type: claim evidence ask",
      claim ? `Claim: ${claim}` : "Claim: [paste exact claim]",
      `Status: ${guide.status}`,
      "",
      `What happened: ${guide.summary}`,
      `Evidence level needed: ${guide.required}`,
      `Boundary: This is an evidence ask, not a clinical safety result.`,
      `Next public ask: ${guide.ask}`,
      "",
      "Reference: https://scribe-bench.vercel.app/#claim-check",
    ].join("\n"),
  };
}

function publicEvidenceCardFromQuickResult(result, { verdict, meaning, issueTypes = "" } = {}) {
  const dangerousCount = cleanStringArray(result?.fabrication?.dangerous).length;
  const leakCount = cleanStringArray((result?.leaks || []).map(formatLeakHit)).length;
  const status = dangerousCount ? "QA finding" : leakCount ? "Leak finding" : "Clean triage";
  const caseLabel = result.caseId ? `${result.caseId}${result.caseType ? ` (${result.caseType})` : ""}` : "pasted source-note pair";
  const issueText = dangerousCount
    ? receiptIssueSentence(result)
    : leakCount
      ? `${leakCount} template or metadata leak${leakCount === 1 ? "" : "s"} flagged.`
      : "No obvious unsupported care, demographic mismatch, laterality issue, allergy contradiction, or deterministic leak flagged.";
  const fallbackMeaning = receiptEvidenceMeaning({ dangerousCount, leakCount, issueTypes });
  const effectiveMeaning = meaning || fallbackMeaning;
  const title = dangerousCount ? "One-note QA evidence card" : "One-note triage evidence card";
  return {
    status,
    statusClass: dangerousCount ? "needed" : leakCount ? "open" : "ready",
    title,
    summary: verdict?.copy || issueText,
    happened: `${caseLabel}: ${issueText}`,
    level: "One note, browser-only receipt",
    boundary: effectiveMeaning.cannotSupport,
    next: effectiveMeaning.useNext,
    reference: "https://scribe-bench.vercel.app/#quick-check",
    copyText: [
      "ScribeBench public evidence card",
      `Date: ${localDateStamp()}`,
      "Type: one-note QA receipt",
      `Case: ${caseLabel}`,
      `Status: ${status}`,
      "",
      `What happened: ${issueText}`,
      `Can support: ${effectiveMeaning.canSupport}`,
      `Boundary: ${effectiveMeaning.cannotSupport}`,
      `Next public ask: ${effectiveMeaning.useNext}`,
      "",
      "Reference: https://scribe-bench.vercel.app/#quick-check",
    ].join("\n"),
  };
}

function publicEvidenceCardFromSmokeResult(result, packet = labEvidencePacket(result)) {
  const status = packet.tone === "danger" ? "Smoke finding" : "Smoke packet";
  return {
    status,
    statusClass: packet.tone === "danger" ? "needed" : packet.tone === "review" ? "open" : "ready",
    title: "Current-model smoke evidence card",
    summary: `${packet.finding} This is one seeded synthetic case, so it can prove the public path works but cannot rank a scribe system.`,
    happened: `${packet.caseLabel}: generated with ${packet.generator}; judged by ${packet.judge}.`,
    level: packet.scope,
    boundary: "Smoke only; not a leaderboard row or current buying guide.",
    next: packet.nextStep,
    reference: "https://scribe-bench.vercel.app/#quick-check",
    copyText: [
      "ScribeBench public evidence card",
      `Date: ${localDateStamp()}`,
      "Type: current-model smoke packet",
      `Case: ${packet.caseLabel}`,
      `Generator: ${packet.generator}`,
      `Judge: ${packet.judge}`,
      `Status: ${status}`,
      "",
      `What happened: ${packet.finding}`,
      `Evidence level: ${packet.scope}`,
      "Boundary: Smoke only; not a leaderboard row or current buying guide.",
      `Next public ask: ${packet.nextStep}`,
      "",
      "Reference: https://scribe-bench.vercel.app/#quick-check",
    ].join("\n"),
  };
}

function renderPublicEvidenceCard(card, { scroll = false } = {}) {
  const panel = document.getElementById("public-evidence-card");
  if (!panel || !card) return;
  lastPublicEvidenceCard = card;
  panel.hidden = false;
  const status = document.getElementById("public-evidence-card-status");
  if (status) {
    status.textContent = card.status || "Evidence card";
    status.className = `queue-status ${card.statusClass || "open"}`;
  }
  setText("public-evidence-card-title", card.title || "Public evidence card");
  setText("public-evidence-card-summary", card.summary || "");
  setText("public-evidence-card-happened", card.happened || "--");
  setText("public-evidence-card-level", card.level || "--");
  setText("public-evidence-card-boundary", card.boundary || "--");
  setText("public-evidence-card-next", card.next || "--");
  setText("public-evidence-card-output", card.copyText || buildPublicEvidenceCardText(card));
  setPublicEvidenceCardCopyStatus("");
  setPublicEvidenceCardFallback("");
  if (scroll) scrollToAnchorTarget(panel, { behavior: "smooth" });
}

function buildPublicEvidenceCardText(card) {
  return [
    "ScribeBench public evidence card",
    `Date: ${localDateStamp()}`,
    `Status: ${card.status || "Evidence card"}`,
    "",
    `What happened: ${card.happened || "--"}`,
    `Evidence level: ${card.level || "--"}`,
    `Boundary: ${card.boundary || "--"}`,
    `Next public ask: ${card.next || "--"}`,
    card.reference ? `Reference: ${card.reference}` : "",
  ].filter(Boolean).join("\n");
}

async function copyPublicEvidenceCard() {
  if (!lastPublicEvidenceCard) {
    setPublicEvidenceCardCopyStatus("Create an evidence card first.");
    return;
  }
  const text = lastPublicEvidenceCard.copyText || buildPublicEvidenceCardText(lastPublicEvidenceCard);
  try {
    await copyText(text);
    setPublicEvidenceCardFallback("");
    setPublicEvidenceCardCopyStatus("Evidence card copied.");
  } catch (_) {
    setPublicEvidenceCardFallback(text);
    setPublicEvidenceCardCopyStatus("Clipboard unavailable. Evidence card shown below.");
  }
}

function setPublicEvidenceCardCopyStatus(message) {
  const status = document.getElementById("public-evidence-card-copy-status");
  if (status) status.textContent = message;
}

function setPublicEvidenceCardFallback(text) {
  const fallback = document.getElementById("public-evidence-card-copy-fallback");
  if (!fallback) return;
  fallback.value = text;
  fallback.hidden = !text;
}

function bindChallengePlanner() {
  const form = document.getElementById("challenge-form");
  if (!form) return;
  form.addEventListener("submit", (event) => event.preventDefault());
  const target = document.getElementById("challenge-target");
  const system = document.getElementById("challenge-system");
  document.querySelectorAll("[data-challenge-preset]").forEach((button) => {
    button.addEventListener("click", () => applyChallengePreset(button.dataset.challengePreset || "frontier-powered"));
  });
  target?.addEventListener("change", () => {
    syncChallengeSystemDefault();
    setActiveChallengePreset(matchingChallengePresetKey());
    renderChallengePlan();
  });
  system?.addEventListener("input", () => {
    setActiveChallengePreset(matchingChallengePresetKey());
    renderChallengePlan();
  });
  document.getElementById("copy-challenge-plan")?.addEventListener("click", copyChallengePlan);
  syncChallengeSystemDefault();
  setActiveChallengePreset(matchingChallengePresetKey() || "frontier-powered");
  renderChallengePlan();
}

function applyChallengePreset(key) {
  const preset = challengePresets[key] || challengePresets["frontier-powered"];
  const target = document.getElementById("challenge-target");
  const system = document.getElementById("challenge-system");
  if (target) target.value = preset.target;
  const plan = selectedChallengePlan();
  if (system) {
    system.value = plan.defaultSystem;
    system.dataset.defaultValue = plan.defaultSystem;
  }
  setActiveChallengePreset(preset.target);
  renderChallengePlan();
}

function matchingChallengePresetKey() {
  const target = document.getElementById("challenge-target")?.value || "";
  const system = document.getElementById("challenge-system")?.value.trim() || "";
  const plan = challengePlans[target];
  if (!plan || system !== plan.defaultSystem) return "";
  return challengePresets[target] ? target : "";
}

function setActiveChallengePreset(key) {
  document.querySelectorAll("[data-challenge-preset]").forEach((button) => {
    const active = Boolean(key) && button.dataset.challengePreset === key;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });
}

function selectedChallengePlan() {
  const target = document.getElementById("challenge-target")?.value || "frontier-powered";
  return challengePlans[target] || challengePlans["frontier-powered"];
}

function syncChallengeSystemDefault() {
  const plan = selectedChallengePlan();
  const input = document.getElementById("challenge-system");
  if (!input) return;
  const previousDefault = input.dataset.defaultValue || "";
  const current = input.value.trim();
  if (!current || current === previousDefault) input.value = plan.defaultSystem;
  input.dataset.defaultValue = plan.defaultSystem;
}

function currentChallengeSystem() {
  const plan = selectedChallengePlan();
  return document.getElementById("challenge-system")?.value.trim() || plan.defaultSystem;
}

function renderChallengePlan() {
  const plan = selectedChallengePlan();
  const system = currentChallengeSystem();
  const status = document.getElementById("challenge-status");
  if (status) {
    status.textContent = plan.status;
    status.className = `queue-status ${plan.statusClass}`;
  }
  setText("challenge-title", plan.title);
  setText("challenge-run", plan.run);
  setText("challenge-publish", plan.publish);
  setText("challenge-why", plan.why);
  setText("challenge-public-plan", buildChallengePlan(plan, system));
  setChallengeCopyStatus("");
  setChallengeCopyFallback("");
}

function buildChallengePlan(plan = selectedChallengePlan(), system = currentChallengeSystem()) {
  return [
    "ScribeBench current-model challenge",
    `Target: ${plan.label}`,
    `System label: ${system}`,
    `Status: ${plan.status}`,
    "",
    `Why this matters: ${plan.why}`,
    "",
    `Run: ${plan.run}`,
    `Evidence minimum: ${plan.evidence}`,
    `Publish: ${plan.publish}`,
    `Next step: ${plan.next}`,
    "",
    "Run builder: https://scribe-bench.vercel.app/#run",
    "Evidence ledger: https://scribe-bench.vercel.app/#leaderboard",
    "Submission guide: https://github.com/napiermd/scribe-bench/blob/main/leaderboard/SUBMISSION.md",
  ].join("\n");
}

async function copyChallengePlan() {
  const text = buildChallengePlan();
  try {
    await copyText(text);
    setChallengeCopyFallback("");
    setChallengeCopyStatus("Run plan copied.");
  } catch (_) {
    setChallengeCopyFallback(text);
    setChallengeCopyStatus("Clipboard unavailable. Run plan shown below.");
  }
}

function setChallengeCopyStatus(message) {
  const status = document.getElementById("challenge-copy-status");
  if (status) status.textContent = message;
}

function setChallengeCopyFallback(text) {
  const fallback = document.getElementById("challenge-copy-fallback");
  if (!fallback) return;
  fallback.value = text;
  fallback.hidden = !text;
}

function bindStartRouter() {
  const buttons = [...document.querySelectorAll("[data-start-route]")];
  if (!buttons.length) return;

  const selectRoute = (key) => {
    const route = startRoutes[key] || startRoutes.note;
    buttons.forEach((button) => {
      const active = button.dataset.startRoute === key;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
    setText("start-route-kicker", route.kicker);
    setText("start-route-title", route.title);
    setText("start-route-copy", route.copy);
    setText("start-route-input", route.input);
    setText("start-route-action", route.action);
    setText("start-route-output", route.output);
    setRouteLink("start-route-primary", route.primary);
    setRouteLink("start-route-secondary", route.secondary);
  };

  buttons.forEach((button) => {
    button.addEventListener("click", () => selectRoute(button.dataset.startRoute || "note"));
  });
  document.getElementById("start-route-primary")?.addEventListener("click", (event) => {
    const activeRoute = buttons.find((button) => button.classList.contains("active"))?.dataset.startRoute;
    if (activeRoute === "note") {
      event.preventDefault();
      const quickCheck = document.getElementById("quick-check");
      if (quickCheck) scrollToAnchorTarget(quickCheck, { behavior: "smooth" });
      document.getElementById("quick-source")?.focus({ preventScroll: true });
      setQuickStatus("Paste your source and generated note, or keep the seeded failure and check it again.");
    }
  });
  selectRoute(buttons.find((button) => button.classList.contains("active"))?.dataset.startRoute || "note");
}

function setRouteLink(id, link) {
  const target = document.getElementById(id);
  if (!target || !link) return;
  target.textContent = link.label;
  target.setAttribute("href", link.href);
}

function stickyHeaderOffset() {
  const topbar = document.querySelector(".topbar");
  const height = topbar?.getBoundingClientRect().height || 0;
  const buffer = window.matchMedia("(max-width: 920px)").matches ? 40 : 12;
  return Math.ceil(height + buffer);
}

function scrollToAnchorTarget(target, { behavior = "smooth" } = {}) {
  const absoluteTop = window.scrollY + target.getBoundingClientRect().top;
  const top = Math.max(0, absoluteTop - stickyHeaderOffset());
  window.scrollTo({ top, behavior });
}

function bindAnchorScrolling() {
  document.addEventListener("click", (event) => {
    if (event.defaultPrevented) return;
    const targetEl = event.target instanceof Element ? event.target : null;
    const link = targetEl?.closest('a[href^="#"]');
    if (!link) return;
    const href = link.getAttribute("href");
    if (!href || href === "#") return;
    let id = href.slice(1);
    try {
      id = decodeURIComponent(id);
    } catch (_) {
      return;
    }
    const target = document.getElementById(id);
    if (!target) return;
    event.preventDefault();
    window.history.pushState(null, "", href);
    scrollToAnchorTarget(target, { behavior: "smooth" });
  });
}

function realignCurrentHash() {
  if (!window.location.hash) return;
  let id = window.location.hash.slice(1);
  try {
    id = decodeURIComponent(id);
  } catch (_) {
    return;
  }
  const target = document.getElementById(id);
  if (!target) return;
  const align = () => scrollToAnchorTarget(target, { behavior: "auto" });
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      align();
    });
  });
  window.setTimeout(align, 160);
  window.setTimeout(align, 500);
  window.setTimeout(align, 1000);
}

function bindQuickCheck() {
  const form = document.getElementById("quick-check-form");
  if (!form) return;
  form.addEventListener("submit", runQuickLocalReceipt);
  document.getElementById("quick-load-seeded")?.addEventListener("click", () => populateQuickCheck(seededCase(), { run: true }));
  document.getElementById("quick-source")?.addEventListener("input", resetQuickAfterManualEdit);
  document.getElementById("quick-note")?.addEventListener("input", resetQuickAfterManualEdit);
  document.getElementById("quick-copy-receipt")?.addEventListener("click", copyQuickReceipt);
  document.getElementById("quick-use-copy-receipt")?.addEventListener("click", copyQuickReceipt);
  document.getElementById("quick-send-lab")?.addEventListener("click", sendQuickPairToLab);
  document.getElementById("copy-quick-smoke-packet")?.addEventListener("click", copyQuickSmokePacket);
  document.getElementById("copy-public-evidence-card")?.addEventListener("click", copyPublicEvidenceCard);
}

function bindPublicActionKit() {
  document.querySelectorAll("[data-public-copy]").forEach((button) => {
    button.addEventListener("click", () => copyPublicAction(button));
  });
}

async function copyPublicAction(button) {
  const card = button.closest("[data-public-artifact]");
  const text = card?.querySelector("code")?.textContent?.trim() || "";
  if (!text) {
    setPublicActionStatus("Nothing to copy yet.");
    return;
  }
  try {
    await copyText(text);
    setPublicActionFallback("");
    setPublicActionStatus(`${button.textContent.trim()} copied.`);
  } catch (_) {
    setPublicActionFallback(text);
    setPublicActionStatus("Clipboard unavailable. Artifact shown below.");
  }
}

function setPublicActionStatus(message) {
  const status = document.getElementById("public-action-status");
  if (status) status.textContent = message;
}

function setPublicActionFallback(text) {
  const fallback = document.getElementById("public-action-fallback");
  if (!fallback) return;
  fallback.value = text;
  fallback.hidden = !text;
}

function populateQuickCheck(c, { run = false } = {}) {
  if (!c) return null;
  const source = document.getElementById("quick-source");
  const note = document.getElementById("quick-note");
  if (!source || !note) return null;
  source.value = c.source || "";
  source.dataset.caseId = c.id || "";
  source.dataset.caseType = c.provenance || "synthetic";
  note.value = c.candidateNote || "";
  note.dataset.generatedModel = "bundled example candidate";
  setQuickStatus(run ? `${c.id} loaded and checked for invented care.` : `${c.id} loaded.`, run ? "review" : "");
  return run ? runQuickLocalReceipt() : null;
}

function runQuickLocalReceipt(event) {
  event?.preventDefault?.();
  const sourceEl = document.getElementById("quick-source");
  const noteEl = document.getElementById("quick-note");
  if (!sourceEl || !noteEl) return null;
  const source = sourceEl.value.trim();
  const note = noteEl.value.trim();
  if (!source || !note) {
    resetQuickResult();
    setQuickStatus("Source encounter and generated note are both required.", "review");
    return null;
  }
  const result = buildLocalReceipt(source, note, {
    generatedModel: noteEl.dataset.generatedModel || "",
    caseId: sourceEl.dataset.caseId || "",
    caseType: sourceEl.dataset.caseType || "",
    sourceChars: source.length,
    noteChars: note.length,
  });
  renderQuickResult(result);
  const dangerousCount = result.fabrication?.dangerous?.filter(Boolean).length || 0;
  const leakCount = result.leaks?.filter(Boolean).length || 0;
  const tone = dangerousCount ? "danger" : leakCount ? "review" : "ok";
  setQuickStatus(
    dangerousCount
      ? receiptIssueSentence(result)
      : leakCount
        ? `${leakCount} template or metadata leak${leakCount === 1 ? "" : "s"} flagged.`
        : "No obvious source-note issue flagged by the browser check.",
    tone
  );
  return result;
}

function renderQuickResult(result) {
  const panel = document.getElementById("quick-result");
  if (!panel) return;
  lastQuickResult = result;
  setQuickCopyStatus("");
  setQuickCopyFallback("");
  panel.hidden = false;
  const dangerousCount = result.fabrication?.dangerous?.filter(Boolean).length || 0;
  const leakCount = result.leaks?.filter(Boolean).length || 0;
  const fidelity = Number(result.dimensions?.inputFidelity || 0);
  const normalized = Number(result.normalized || 0);
  const verdict = labVerdict({
    dangerousCount,
    leakCount,
    fidelity,
    normalized,
    localResult: Boolean(result.localResult),
    issueTypes: receiptIssueTypes(result),
  });
  const status = document.getElementById("quick-result-status");
  if (status) {
    status.textContent = dangerousCount ? "Review before trust" : leakCount ? "Clean output" : "No obvious issue";
    status.className = `queue-status ${verdict.tone === "danger" ? "needed" : verdict.tone === "review" ? "open" : "ready"}`;
  }
  setText("quick-result-title", verdict.title);
  setText("quick-result-summary", verdict.copy);
  const meaning = receiptEvidenceMeaning({ dangerousCount, leakCount, issueTypes: receiptIssueTypes(result) });
  setText("quick-result-can-support", meaning.canSupport);
  setText("quick-result-cannot-support", meaning.cannotSupport);
  setText("quick-result-use-next", meaning.useNext);
  const useGuidance = quickUseGuidance({ dangerousCount, leakCount, issueTypes: receiptIssueTypes(result) });
  setText("quick-use-title", useGuidance.title);
  setText("quick-use-copy", useGuidance.copy);
  const list = document.getElementById("quick-result-list");
  if (list) {
    list.innerHTML = "";
    if (dangerousCount) {
      renderDangerousFindingsInto(list, result);
    } else {
      const items = leakCount
        ? (result.leaks || []).map((hit) => `${hit.marker}: ${hit.excerpt}`)
        : ["No obvious unsupported care, demographic mismatch, laterality issue, allergy contradiction, or deterministic leak."];
      for (const item of items.filter(Boolean)) {
        const li = document.createElement("li");
        li.textContent = item;
        list.appendChild(li);
      }
    }
  }
  setText("quick-result-next", verdict.action);
  setText("quick-receipt-preview-output", buildQuickReceiptText(result));
  renderPublicEvidenceCard(publicEvidenceCardFromQuickResult(result, { verdict, meaning, issueTypes: receiptIssueTypes(result) }));
}

function quickUseGuidance({ dangerousCount, leakCount, issueTypes = "" }) {
  if (dangerousCount) {
    return {
      title: "Use this as a QA finding first.",
      copy: `Copy the packet into review, then use the claim checker only if someone wants to turn this one-note issue${issueTypes ? ` (${issueTypes})` : ""} into a broader vendor or system claim.`,
    };
  }
  if (leakCount) {
    return {
      title: "Use this to fix the output pipeline.",
      copy: "Copy the packet for the team that owns prompts or templates. Recheck the note after cleanup before treating it as evidence.",
    };
  }
  return {
    title: "Use this as clean triage, not clearance.",
    copy: "A clean browser check can support a narrow QA note. Use the Lab or powered rows before saying the whole scribe system is safe or better.",
  };
}

function resetQuickResult() {
  lastQuickResult = null;
  const panel = document.getElementById("quick-result");
  if (panel) panel.hidden = true;
  setText("quick-receipt-preview-output", "");
  setQuickCopyStatus("");
  setQuickCopyFallback("");
  setQuickStatus("Ready to check this source-note pair in the browser.", "");
}

function resetQuickAfterManualEdit() {
  const source = document.getElementById("quick-source");
  const note = document.getElementById("quick-note");
  if (source) {
    delete source.dataset.caseId;
    delete source.dataset.caseType;
  }
  if (note) delete note.dataset.generatedModel;
  resetQuickResult();
}

function setQuickStatus(message, tone = "") {
  const status = document.getElementById("quick-check-status");
  if (!status) return;
  status.textContent = message;
  status.dataset.tone = tone;
}

async function copyQuickReceipt() {
  if (!lastQuickResult) {
    setQuickCopyStatus("Check the note first.");
    return;
  }
  const text = buildQuickReceiptText(lastQuickResult);
  try {
    await copyText(text);
    setQuickCopyFallback("");
    setQuickCopyStatus("QA packet copied.");
  } catch (_) {
    setQuickCopyFallback(text);
    setQuickCopyStatus("Clipboard unavailable. QA packet shown below.");
  }
}

function sendQuickPairToLab() {
  const sourceEl = document.getElementById("quick-source");
  const noteEl = document.getElementById("quick-note");
  const labSource = document.getElementById("lab-source");
  const labNote = document.getElementById("lab-note");
  if (!sourceEl || !noteEl || !labSource || !labNote) return null;
  const source = sourceEl.value.trim();
  const note = noteEl.value.trim();
  if (!source || !note) {
    setQuickCopyStatus("Check a source-note pair first.");
    return null;
  }

  const result = lastQuickResult || runQuickLocalReceipt();
  if (!result) return null;

  labSource.value = source;
  labNote.value = note;
  copyOptionalDataset(sourceEl, labSource, "caseId");
  copyOptionalDataset(sourceEl, labSource, "caseType");
  copyOptionalDataset(noteEl, labNote, "generatedModel");

  const labResult = buildLocalReceipt(source, note, {
    generatedModel: labNote.dataset.generatedModel || "",
    caseId: labSource.dataset.caseId || "",
    caseType: labSource.dataset.caseType || "",
    sourceChars: source.length,
    noteChars: note.length,
  });
  renderLabResult(labResult);
  setLabStatus("Loaded this checked pair from the first-screen receipt. Run live judge if you need model-backed scoring.");
  setQuickCopyStatus("Opened in Lab.");
  if (window.location.hash !== "#lab") window.history.replaceState(null, "", "#lab");
  const lab = document.getElementById("lab");
  if (lab) scrollToAnchorTarget(lab, { behavior: "smooth" });
  document.getElementById("run-lab")?.focus({ preventScroll: true });
  return labResult;
}

function copyOptionalDataset(fromEl, toEl, key) {
  const value = fromEl.dataset[key];
  if (value) {
    toEl.dataset[key] = value;
  } else {
    delete toEl.dataset[key];
  }
}

function buildQuickReceiptText(result) {
  const dangerous = result.fabrication?.dangerous?.filter(Boolean) || [];
  const leaks = (result.leaks || []).filter(Boolean).map((hit) => `${hit.marker}: ${hit.excerpt}`);
  const dangerousCount = dangerous.length;
  const leakCount = leaks.length;
  const fidelity = Number(result.dimensions?.inputFidelity || 0);
  const normalized = Number(result.normalized || 0);
  const verdict = labVerdict({
    dangerousCount,
    leakCount,
    fidelity,
    normalized,
    localResult: Boolean(result.localResult),
    issueTypes: receiptIssueTypes(result),
  });
  const meaning = receiptEvidenceMeaning({ dangerousCount, leakCount, issueTypes: receiptIssueTypes(result) });
  const caseLabel = result.caseId ? `${result.caseId}${result.caseType ? ` (${result.caseType})` : ""}` : "pasted source-vs-note pair";
  const evidence = Array.isArray(result.evidence?.dangerous) ? result.evidence.dangerous : [];
  const flaggedItems = dangerousCount
    ? dangerous.flatMap((item) => {
        const detail = evidence.find((entry) => entry?.finding === item);
        const lines = [`- ${item}`];
        if (detail?.noteExcerpt) lines.push(`  Note excerpt: ${detail.noteExcerpt}`);
        if (detail?.sourceExcerpt) lines.push(`  Source check: ${detail.sourceExcerpt}`);
        return lines;
      })
    : leakCount
      ? leaks.map((item) => `- ${item}`)
      : ["- No obvious unsupported care, demographic mismatch, laterality issue, allergy contradiction, or deterministic leak flagged by the browser receipt."];

  return [
    "ScribeBench source-vs-note receipt",
    `Date: ${localDateStamp()}`,
    "Scope: one note, browser-only local check, not a system certification or clinical clearance",
    `Case: ${caseLabel}`,
    `Finding: ${verdict.title}`,
    `Summary: ${verdict.copy}`,
    "",
    "Evidence meaning:",
    `Can support: ${meaning.canSupport}`,
    `Cannot support: ${meaning.cannotSupport}`,
    `Use next: ${meaning.useNext}`,
    "",
    "Flagged source-note issues:",
    ...flaggedItems,
    "",
    `Next proof step: ${verdict.action}`,
    "",
    "Reference: https://scribe-bench.vercel.app/",
  ].join("\n");
}

function setQuickCopyStatus(message) {
  const status = document.getElementById("quick-copy-status");
  if (status) status.textContent = message;
}

function setQuickCopyFallback(text) {
  const fallback = document.getElementById("quick-copy-fallback");
  if (!fallback) return;
  fallback.value = text;
  fallback.hidden = !text;
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
  document.getElementById("lab-empty-local")?.addEventListener("click", runLocalReceipt);
  document.getElementById("show-seeded-verdict")?.addEventListener("click", loadSeededLab);
  document.getElementById("refresh-models")?.addEventListener("click", () => loadLabModels(true));
  document.getElementById("generate-note")?.addEventListener("click", generateCandidateNote);
  document.getElementById("run-local-receipt")?.addEventListener("click", runLocalReceipt);
  document.getElementById("run-local-receipt-top")?.addEventListener("click", runSeededLocalReceipt);
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

function runLocalReceipt(event) {
  event?.preventDefault?.();
  const sourceEl = document.getElementById("lab-source");
  const noteEl = document.getElementById("lab-note");
  const source = sourceEl.value.trim();
  const note = noteEl.value.trim();

  if (!source || !note) {
    setLabStatus("Source and note are required for the local receipt.");
    updateLabEmptyForInputs();
    return null;
  }

  const result = buildLocalReceipt(source, note, {
    generatedModel: noteEl.dataset.generatedModel || "",
    caseId: sourceEl.dataset.caseId || "",
    caseType: sourceEl.dataset.caseType || "",
    sourceChars: source.length,
    noteChars: note.length,
  });
  renderLabResult(result);
  setLabStatus("Local receipt complete. No API key or network call used.");
  return result;
}

function runSeededLocalReceipt(event) {
  event?.preventDefault?.();
  const c = seededCase();
  if (!c) {
    setInstantReceiptStatus("Demo cases are still loading. Try again in a moment.", "review");
    return null;
  }

  setInstantReceiptBusy(true);
  setInstantReceiptStatus("Running: loading SYN-003 and creating a browser-only receipt...", "review");
  document.getElementById("lab")?.scrollIntoView({ behavior: "smooth", block: "start" });
  try {
    populateLab(c);
    const note = document.getElementById("lab-note");
    if (note) note.dataset.generatedModel = "bundled example candidate";
    const result = runLocalReceipt();
    if (!result) {
      setInstantReceiptStatus("Could not create the local receipt. Check the Lab inputs.", "review");
      return null;
    }
    const dangerCount = result.fabrication?.dangerous?.length || 0;
    const leakCount = result.leaks?.length || 0;
    const finding = dangerCount
      ? `Complete: ${dangerCount} unsupported item${dangerCount === 1 ? "" : "s"} flagged without an API call.`
      : leakCount
        ? `Complete: ${leakCount} leak${leakCount === 1 ? "" : "s"} flagged without an API call.`
        : "Complete: no obvious unsupported item flagged in the browser-only receipt.";
    setInstantReceiptStatus(finding, dangerCount ? "danger" : leakCount ? "review" : "ok");
    return result;
  } finally {
    setInstantReceiptBusy(false);
  }
}

async function runLiveSmokeCheck(event) {
  event?.preventDefault?.();
  const launchedFromTop = event?.currentTarget?.id === "run-live-smoke-top";
  const c = seededCase();
  if (!c) {
    setLiveSmokeStatus("Demo cases are still loading. Try again in a moment.", "review");
    showQuickSmokeArtifactStatus({
      status: "Waiting",
      statusClass: "open",
      title: "Demo cases are still loading",
      copy: "Try again after the seeded source and note finish loading.",
    });
    return;
  }
  lastSmokeResult = null;
  setQuickSmokeCopyStatus("");
  setQuickSmokeCopyFallback("");
  setLiveSmokeBusy(true);
  setLiveSmokeStatus("Running: loading SYN-003 and refreshing current free models...");
  showQuickSmokeArtifactStatus({
    status: "Running",
    statusClass: "open",
    title: "Generating and judging a fresh current-model note",
    copy: "ScribeBench is loading the seeded case, refreshing the OpenRouter free-model list, then generating and judging one fresh note. This stays smoke-only.",
    caseLabel: "SYN-003",
    generator: "Refreshing OpenRouter free models",
    judge: "Waiting for generated note",
    boundary: "Smoke only; not a leaderboard row.",
  });
  if (!launchedFromTop) document.getElementById("lab")?.scrollIntoView({ behavior: "smooth", block: "start" });
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
    showQuickSmokeArtifactStatus({
      status: "Running",
      statusClass: "open",
      title: "Generating the candidate note",
      copy: "The Lab is asking the selected current free model to write a fresh note from the seeded encounter.",
      caseLabel: c.id || "SYN-003",
      generator: selectedModelLabel("lab-generate-model"),
      judge: selectedModelLabel("lab-judge-model"),
      boundary: "Smoke only; not a leaderboard row.",
    });
    const generated = await generateCandidateNote();
    if (!generated) {
      setLiveSmokeStatus("Generation did not finish. Check the Lab status for the exact error.", "review");
      showQuickSmokeArtifactStatus({
        status: "Blocked",
        statusClass: "needed",
        title: "Generation did not finish",
        copy: currentLabStatus() || "The current free-model path did not return a candidate note. Try again later or paste a temporary provider key.",
        caseLabel: c.id || "SYN-003",
        generator: selectedModelLabel("lab-generate-model"),
        judge: selectedModelLabel("lab-judge-model"),
        boundary: "No smoke result was created.",
      });
      return;
    }
    setLiveSmokeStatus("Running: judging the generated note for unsupported care...");
    showQuickSmokeArtifactStatus({
      status: "Judging",
      statusClass: "open",
      title: "Judging the generated note",
      copy: "A fresh candidate note exists. The selected judge is checking it against the source for unsupported care, fidelity, and leaks.",
      caseLabel: c.id || "SYN-003",
      generator: generated.model || selectedModelLabel("lab-generate-model"),
      judge: selectedModelLabel("lab-judge-model"),
      boundary: "Smoke only; not a leaderboard row.",
    });
    const judged = await runLabJudge();
    if (!judged) {
      setLiveSmokeStatus("Judge did not finish. Check the Lab status for the exact error.", "review");
      showQuickSmokeArtifactStatus({
        status: "Blocked",
        statusClass: "needed",
        title: "Judge did not finish",
        copy: currentLabStatus() || "The current free-model judge did not return a usable verdict. The generated note remains in the Lab, but no smoke packet was created.",
        caseLabel: c.id || "SYN-003",
        generator: generated.model || selectedModelLabel("lab-generate-model"),
        judge: selectedModelLabel("lab-judge-model"),
        boundary: "No smoke result was created.",
      });
      return;
    }
    const dangerCount = judged.fabrication?.dangerous?.length || 0;
    const label = dangerCount
      ? `Complete: ${receiptIssueSentence(judged)}`
      : "Complete: no obvious source-note issue flagged in this one-note smoke check.";
    setLiveSmokeStatus(label, dangerCount ? "danger" : "ok");
    renderQuickSmokeArtifact(judged);
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

  renderDangerousFindings("lab-danger-list", result, "None flagged.");
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
      "Run the local receipt for an instant no-key triage result, or run the live judge for model-backed scoring.",
      "Both paths return flagged unsupported claims, leak scan, and a copyable QA summary."
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
  const verdict = labVerdict({
    dangerousCount,
    leakCount,
    fidelity,
    normalized,
    localResult: Boolean(result.localResult),
    issueTypes: receiptIssueTypes(result),
  });
  const card = document.getElementById("lab-verdict-card");
  card.className = `verdict-card ${verdict.tone}`;
  document.getElementById("lab-verdict-title").textContent = verdict.title;
  document.getElementById("lab-verdict-copy").textContent = verdict.copy;
  document.getElementById("lab-verdict-action").textContent = verdict.action;
}

function labVerdict({ dangerousCount, leakCount, fidelity, normalized, localResult = false, issueTypes = "" }) {
  if (dangerousCount > 0) {
    return {
      tone: "danger",
      title: "Do not trust this note without review",
      copy: `${issueCountLabel(dangerousCount)} ${localResult ? "flagged by the browser-only receipt" : "changed what the reader would believe happened"}${issueTypes ? ` (${issueTypes})` : ""}.`,
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
      title: "No source-note issue flagged, but quality is not strong",
      copy: `${localResult ? "The browser-only receipt estimated" : "The judge scored"} narrative quality at ${normalized || "--"}/100 and input fidelity at ${fidelity || "--"}/5.`,
      action: "Use this as a triage signal, then inspect the note manually or run a larger benchmark before comparing systems.",
    };
  }
  return {
    tone: "ok",
    title: "No source-note issue flagged in this sample",
    copy: localResult
      ? `The browser-only receipt found no obvious source-note issues and estimated input fidelity at ${fidelity || "--"}/5.`
      : `The judge found no obvious source-note issues and scored input fidelity at ${fidelity || "--"}/5.`,
    action: "This is one note, not a leaderboard claim. For a system-level answer, run the powered PriMock57 path.",
  };
}

function receiptEvidenceMeaning({ dangerousCount, leakCount, issueTypes = "" }) {
  if (dangerousCount) {
    const typeText = issueTypes ? ` covering ${issueTypes}` : "";
    return {
      canSupport: `One source-note pair has reviewable issues${typeText}.`,
      cannotSupport: "A leaderboard rank, system-safety claim, or clinical clearance.",
      useNext: "Review or fix this note, then run aggregate evidence before making a public system claim.",
    };
  }

  if (leakCount) {
    return {
      canSupport: "The note output leaked template or metadata text that needs cleanup.",
      cannotSupport: "That the note is otherwise faithful or clinically ready.",
      useNext: "Remove the leak, recheck the source-note pair, then escalate any claim to the Lab or powered run.",
    };
  }

  return {
    canSupport: "The covered browser checks did not catch an obvious source-note issue.",
    cannotSupport: "That the note is faithful, safe, or representative of the whole scribe system.",
    useNext: "Use human review or the Lab for this note, and a powered row for any system-level claim.",
  };
}

function issueCountLabel(count) {
  return `${count} source-note issue${count === 1 ? "" : "s"}`;
}

function receiptIssueSentence(result) {
  const dangerousCount = cleanStringArray(result?.fabrication?.dangerous).length;
  const types = receiptIssueTypes(result);
  return `${issueCountLabel(dangerousCount)} flagged${types ? `: ${types}` : ""}.`;
}

function receiptIssueTypes(result) {
  const dangerous = cleanStringArray(result?.fabrication?.dangerous);
  if (!dangerous.length) return "";
  const evidence = Array.isArray(result?.evidence?.dangerous) ? result.evidence.dangerous : [];
  const labels = [];
  for (const finding of dangerous) {
    const detail = evidence.find((entry) => entry?.finding === finding);
    const label = classifyIssueType(detail?.label || "", finding);
    if (label && !labels.includes(label)) labels.push(label);
  }
  return labels.join(", ");
}

function classifyIssueType(label, finding) {
  const text = `${label} ${finding}`.toLowerCase();
  if (text.includes("age differs") || text.includes("age mismatch")) return "age";
  if (text.includes("sex/gender") || text.includes("gender mismatch")) return "sex/gender";
  if (text.includes("laterality")) return "laterality";
  if (text.includes("allergy") || text.includes("nkda")) return "allergy";
  if (text.includes("workup") || text.includes("head ct") || text.includes("head imaging")) return "unsupported care";
  if (text.includes("ems") || text.includes("ambulance")) return "arrival mismatch";
  if (text.includes("fever") || text.includes("chest pain") || text.includes("shortness of breath") || text.includes("dysuria") || text.includes("anticoagulant")) return "unsupported symptom";
  return label ? label.replace(/\s+appears.*$/i, "").trim() : "unsupported fact";
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
    localResult: Boolean(result.localResult),
    issueTypes: receiptIssueTypes(result),
  });
  const scope = result.demoResult
    ? "Static demo"
    : result.localResult
      ? "Local receipt"
      : result.caseId?.startsWith("SYN")
      ? "Live smoke"
      : "One-note triage";
  const tone = dangerous.length ? "danger" : leaks.length || Number(normalized) < 70 ? "review" : "ok";
  const caseLabel = result.caseId
    ? `${result.caseId}${result.caseType ? ` (${result.caseType})` : ""}`
    : "Custom pasted source";
  const generator = result.generatedModel || (result.demoResult ? "bundled example candidate" : "pasted candidate note");
  const judge = result.localResult
    ? "browser-only local receipt"
    : `${result.model || "unknown"}${result.provider ? ` via ${result.provider}` : ""}`;
  const nextStep = result.caseId?.startsWith("SYN") || result.demoResult
    ? "Treat as smoke evidence; run PriMock57 before making a system claim."
    : "Use as QA triage; run a powered benchmark before comparing systems.";
  const finding = dangerous.length
    ? verdict.copy
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
    localResult: Boolean(result.localResult),
    issueTypes: receiptIssueTypes(result),
  });
  const lines = [
    "ScribeBench lab result",
    result.demoResult ? "Result type: seeded static demo verdict" : "",
    result.localResult ? "Result type: browser-only local receipt (no API call; conservative triage)" : "",
    `Verdict: ${verdict.title}`,
    `Narrative score: ${result.normalized ?? "--"}/100`,
    `Input fidelity: ${fidelityDisplay}/5`,
    `Flagged source-note issues: ${dangerousCount}`,
    `Leaks: ${leakCount}`,
    result.generatedModel ? `Generator: ${result.generatedModel}` : "",
    `Judge: ${result.localResult ? "browser-only local receipt" : result.model || "unknown"}`,
    result.provider ? `Provider: ${result.provider}` : "",
    result.rubric ? `Rubric: ${result.rubric}` : "",
    result.sourceChars ? `Source length: ${result.sourceChars} chars` : "",
    result.noteChars ? `Note length: ${result.noteChars} chars` : "",
    "",
    verdict.copy,
    verdict.action,
    "",
    "Flagged source-note issues:",
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
    `Flagged source-note issues: ${packet.dangerous.length}`,
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
    "Flagged source-note issues:",
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

function setElementHtml(id, html) {
  const target = document.getElementById(id);
  if (target) target.innerHTML = html;
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

function renderDangerousFindings(id, result, emptyText) {
  const list = document.getElementById(id);
  if (!list) return;
  list.innerHTML = "";
  const findings = cleanStringArray(result?.fabrication?.dangerous);
  if (!findings.length) {
    const li = document.createElement("li");
    li.textContent = emptyText;
    list.appendChild(li);
    return;
  }
  renderDangerousFindingsInto(list, result);
}

function renderDangerousFindingsInto(list, result) {
  const findings = cleanStringArray(result?.fabrication?.dangerous);
  const evidence = Array.isArray(result?.evidence?.dangerous) ? result.evidence.dangerous : [];
  for (const finding of findings) {
    const detail = evidence.find((entry) => entry?.finding === finding);
    const li = document.createElement("li");
    if (!detail?.noteExcerpt && !detail?.sourceExcerpt) {
      li.textContent = finding;
      list.appendChild(li);
      continue;
    }
    li.className = "evidence-finding";
    const summary = document.createElement("strong");
    summary.textContent = finding;
    li.appendChild(summary);

    const dl = document.createElement("dl");
    appendEvidenceRow(dl, "Note says", detail.noteExcerpt);
    appendEvidenceRow(dl, detail.reason === "source contradiction" ? "Source says" : "Source check", detail.sourceExcerpt);
    li.appendChild(dl);
    list.appendChild(li);
  }
}

function appendEvidenceRow(list, label, value) {
  if (!value) return;
  const wrapper = document.createElement("div");
  const dt = document.createElement("dt");
  const dd = document.createElement("dd");
  dt.textContent = label;
  dd.textContent = value;
  wrapper.appendChild(dt);
  wrapper.appendChild(dd);
  list.appendChild(wrapper);
}

function setLabStatus(message) {
  const status = document.getElementById("lab-status");
  if (status) status.textContent = message;
}

function instantReceiptButtons() {
  return ["run-local-receipt-top"]
    .map((id) => document.getElementById(id))
    .filter(Boolean);
}

function setInstantReceiptBusy(isBusy) {
  instantReceiptButtons().forEach((button) => {
    button.disabled = isBusy;
    const fallback = button.dataset.defaultLabel || "Run instant receipt";
    button.textContent = isBusy ? (button.dataset.runningLabel || fallback) : fallback;
  });
}

function setInstantReceiptStatus(message, tone = "") {
  const status = document.getElementById("instant-receipt-status");
  if (!status) return;
  status.textContent = message;
  status.dataset.tone = tone;
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

function showQuickSmokeArtifactStatus({
  status,
  statusClass = "open",
  title,
  copy,
  caseLabel = "SYN-003",
  generator = "Selected OpenRouter free model",
  judge = "Selected OpenRouter free model",
  boundary = "Smoke only; not a leaderboard row.",
} = {}) {
  const artifact = document.getElementById("quick-smoke-artifact");
  if (!artifact) return;
  artifact.hidden = false;
  const statusEl = document.getElementById("quick-smoke-status");
  if (statusEl) {
    statusEl.textContent = status || "Smoke";
    statusEl.className = `queue-status ${statusClass}`;
  }
  setText("quick-smoke-title", title || "Current smoke check");
  setText("quick-smoke-copy", copy || "Run the current-model smoke path to create a smoke-only evidence packet.");
  setText("quick-smoke-case", caseLabel);
  setText("quick-smoke-generator", generator);
  setText("quick-smoke-judge", judge);
  setText("quick-smoke-boundary", boundary);
}

function renderQuickSmokeArtifact(result) {
  lastSmokeResult = result;
  const packet = labEvidencePacket(result);
  const statusClass = packet.tone === "danger" ? "needed" : packet.tone === "review" ? "open" : "ready";
  showQuickSmokeArtifactStatus({
    status: packet.tone === "danger" ? "Review" : "Smoke complete",
    statusClass,
    title: packet.tone === "danger" ? "Current smoke found a source-note issue" : "Current smoke created a packet",
    copy: `${packet.finding} This is one seeded synthetic case, so it can prove the public path works but cannot rank a scribe system.`,
    caseLabel: packet.caseLabel,
    generator: packet.generator,
    judge: packet.judge,
    boundary: packet.nextStep,
  });
  setQuickSmokeCopyStatus("");
  setQuickSmokeCopyFallback("");
  renderPublicEvidenceCard(publicEvidenceCardFromSmokeResult(result, packet));
}

async function copyQuickSmokePacket() {
  if (!lastSmokeResult) {
    setQuickSmokeCopyStatus("Run the current-model smoke check first.");
    return;
  }
  const text = buildEvidencePacketText(lastSmokeResult);
  try {
    await copyText(text);
    setQuickSmokeCopyFallback("");
    setQuickSmokeCopyStatus("Smoke packet copied.");
  } catch (_) {
    setQuickSmokeCopyFallback(text);
    setQuickSmokeCopyStatus("Clipboard unavailable. Smoke packet shown below.");
  }
}

function setQuickSmokeCopyStatus(message) {
  const status = document.getElementById("quick-smoke-copy-status");
  if (status) status.textContent = message;
}

function setQuickSmokeCopyFallback(text) {
  const fallback = document.getElementById("quick-smoke-copy-fallback");
  if (!fallback) return;
  fallback.value = text;
  fallback.hidden = !text;
}

function selectedModelLabel(selectId) {
  const select = document.getElementById(selectId);
  const option = select?.selectedOptions?.[0];
  return option?.textContent?.trim() || select?.value || "selected model";
}

function currentLabStatus() {
  return document.getElementById("lab-status")?.textContent?.trim() || "";
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
    control.addEventListener("input", handleRunBuilderInput);
    control.addEventListener("change", handleRunBuilderInput);
  });
  document.querySelectorAll("[data-run-preset]").forEach((button) => {
    button.addEventListener("click", () => applyRunPreset(button.dataset.runPreset || "current-powered"));
  });
  document.getElementById("run-dataset")?.addEventListener("change", syncRunDefaultsForDataset);
  document.getElementById("copy-candidate-template")?.addEventListener("click", () => copyRunArtifact("candidate"));
  document.getElementById("copy-run-command")?.addEventListener("click", () => copyRunArtifact("command"));
  applyRunPreset("current-powered");
}

function handleRunBuilderInput() {
  setActiveRunPreset(matchingRunPresetKey());
  updateRunBuilder();
}

function applyRunPreset(key) {
  const preset = runPresets[key] || runPresets["current-powered"];
  setFieldValue("run-dataset", preset.fields.dataset);
  setFieldValue("run-system", preset.fields.system);
  setFieldValue("run-candidate", preset.fields.candidatePath);
  setFieldValue("run-generator", preset.fields.generator);
  setFieldValue("run-model", preset.fields.model);
  setFieldValue("run-repeats", preset.fields.repeats);
  setFieldValue("run-judge-backend", preset.fields.judgeBackend);
  setFieldValue("run-judge-model", preset.fields.judgeModel);
  const candidateInput = document.getElementById("run-candidate");
  const repeatsSelect = document.getElementById("run-repeats");
  if (candidateInput) candidateInput.dataset.touched = "true";
  if (repeatsSelect) repeatsSelect.dataset.touched = "true";
  setActiveRunPreset(key);
  updateRunBuilder();
}

function setFieldValue(id, value) {
  const field = document.getElementById(id);
  if (field) field.value = value;
}

function matchingRunPresetKey() {
  const state = runBuilderState();
  return Object.entries(runPresets).find(([, preset]) => {
    const fields = preset.fields;
    return (
      fields.dataset === state.dataset &&
      fields.system === state.system &&
      fields.candidatePath === state.candidatePath &&
      fields.generator === state.generator &&
      fields.model === state.model &&
      fields.repeats === state.repeats &&
      fields.judgeBackend === state.judgeBackend &&
      fields.judgeModel === state.judgeModel
    );
  })?.[0] || "";
}

function setActiveRunPreset(key) {
  document.querySelectorAll("[data-run-preset]").forEach((button) => {
    const active = Boolean(key) && button.dataset.runPreset === key;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });
}

function selectedRunPlan() {
  const active = document.querySelector("[data-run-preset].active")?.dataset.runPreset;
  return runPresets[active] || runPlanFromState(runBuilderState());
}

function runPlanFromState(state) {
  const powered = state.dataset !== "synthetic";
  return {
    status: powered ? "Custom powered" : "Custom smoke",
    statusClass: powered ? "ready" : "open",
    title: powered ? "Custom powered row" : "Custom smoke test",
    bring: powered
      ? "Candidate notes for a declared multi-case dataset and a judge you can name."
      : "Candidate notes for the bundled synthetic cases and a judge you can name.",
    run: `Score ${state.datasetPath} as ${state.system} with ${state.repeats} repeat${state.repeats === "1" ? "" : "s"}.`,
    submit: powered
      ? "Submit aggregate metrics and method details before making a system-level claim."
      : "Use this as plumbing evidence only; graduate useful results to a powered row.",
  };
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
    generator: value("run-generator", "own"),
    model: value("run-model", "current-production-scribe-or-frontier-model"),
    system: value("run-system", "current-system-under-test"),
    judgeBackend: value("run-judge-backend", "baseten"),
    judgeModel: value("run-judge-model", "declared-strong-judge-model"),
    repeats: value("run-repeats", dataset === "synthetic" ? "1" : "2"),
  };
}

function updateRunBuilder() {
  const state = runBuilderState();
  const candidate = buildCandidateTemplate(state);
  const command = buildRunCommand(state);
  const plan = selectedRunPlan();
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
  renderRunPlan(plan);
  setRunCopyStatus("");
  setRunCopyFallback("");
}

function renderRunPlan(plan) {
  const status = document.getElementById("run-plan-status");
  if (status) {
    status.textContent = plan.status;
    status.className = `queue-status ${plan.statusClass}`;
  }
  setText("run-plan-title", plan.title);
  setText("run-plan-bring", plan.bring);
  setText("run-plan-run", plan.run);
  setText("run-plan-submit", plan.submit);
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
  bindAnchorScrolling();
  bindStartRouter();
  bindQuickCheck();
  bindPublicActionKit();
  bindCurrentRunCommand();
  bindClaimChecker();
  bindChallengePlanner();
  bindLab();
  bindRunBuilder();
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
      <tr><td colspan="10">Could not load benchmark data. Check the static build output.</td></tr>
    `;
    const smokeBody = document.getElementById("smoke-body");
    if (smokeBody) smokeBody.innerHTML = `<tr><td colspan="10">Could not load smoke-test data.</td></tr>`;
    console.error(err);
  }

  try {
    renderWorkLog(await loadJson("/assets/worklog.json"));
  } catch (err) {
    renderWorkLogError();
    console.error(err);
  }

  try {
    renderCurrentRun(await loadJson("/assets/current-run.json"));
  } catch (err) {
    renderCurrentRunError();
    console.error(err);
  }

  loadLabModels();

  realignCurrentHash();
}

boot();
