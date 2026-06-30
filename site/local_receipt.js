const LEAK_TOKENS = [
  "icd10cm",
  "cms:",
  "codingClinicRef",
  "defensibilityValue",
  "source: \"",
  "system_prompt",
  "<|",
  "|>",
];

const PLACEHOLDER_RE = /\*\([^)\n]{1,60}\)\*/g;
const PLACEHOLDER_THRESHOLD = 2;

const CLAIM_GROUPS = [
  {
    label: "head CT or head imaging",
    note: [/\b(head|brain|cranial)\s+(ct|scan)\b/i, /\bct\s+(head|brain)\b/i],
    support: [/\b(head|brain|cranial)\s+(ct|scan)\b/i, /\bct\s+(head|brain)\b/i],
    contradiction: [/\bno\s+head\s+(strike|injury|trauma)\b/i, /\bdid\s+not\s+(hit|strike)\s+(her\s+|his\s+|their\s+)?head\b/i],
  },
  {
    label: "syncope or loss-of-consciousness workup",
    note: [/\bsyncope\b/i, /\bsyncopal\b/i, /\bloss\s+of\s+consciousness\b/i, /\bLOC\b/, /\bpassed\s+out\b/i],
    support: [/\bsyncope\b/i, /\bsyncopal\b/i, /\bloss\s+of\s+consciousness\b/i, /\bLOC\b/, /\bpassed\s+out\b/i],
    contradiction: [/\bno\s+loss\s+of\s+consciousness\b/i, /\bdid\s+not\s+lose\s+consciousness\b/i, /\bden(y|ies|ied)\s+.*\bloss\s+of\s+consciousness\b/i, /\bno\s+syncope\b/i],
  },
  {
    label: "EMS or ambulance arrival",
    note: [/\bEMS\b/, /\bambulance\b/i, /\bparamedic/i],
    support: [/\bEMS\b/, /\bambulance\b/i, /\bparamedic/i],
    contradiction: [
      /\bdaughter\s+drove\b/i,
      /\bdrove\s+(her|him|them)\s+in\b/i,
      /\bbrought\s+in\s+by\s+(her\s+|his\s+|their\s+)?(daughter|son|family|spouse|wife|husband|friend)\b/i,
      /\bprivate\s+vehicle\b/i,
      /\bwalk(ed)?\s+in\b/i,
    ],
  },
  {
    label: "fever",
    note: [/\bfever\b/i, /\bfebrile\b/i, /\btemperature\s+(of\s+)?10[01]\b/i],
    support: [/\bfever\b/i, /\bfebrile\b/i, /\btemperature\s+(of\s+)?10[01]\b/i],
    contradiction: [/\bno\s+fever\b/i, /\bafebrile\b/i, /\bden(y|ies|ied)\s+.*\bfever\b/i],
  },
  {
    label: "chest pain",
    note: [/\bchest\s+pain\b/i, /\bsubsternal\b/i],
    support: [/\bchest\s+pain\b/i, /\bsubsternal\b/i],
    contradiction: [/\bno\s+chest\s+pain\b/i, /\bden(y|ies|ied)\s+.*\bchest\s+pain\b/i],
  },
  {
    label: "shortness of breath",
    note: [/\bshort(ness)?\s+of\s+breath\b/i, /\bdyspnea\b/i, /\bSOB\b/],
    support: [/\bshort(ness)?\s+of\s+breath\b/i, /\bdyspnea\b/i, /\bSOB\b/],
    contradiction: [/\bno\s+short(ness)?\s+of\s+breath\b/i, /\bden(y|ies|ied)\s+.*\b(shortness\s+of\s+breath|dyspnea|SOB)\b/i],
  },
  {
    label: "dysuria or urinary infection symptoms",
    note: [/\bdysuria\b/i, /\burinary\s+tract\s+infection\b/i, /\bUTI\b/],
    support: [/\bdysuria\b/i, /\burinary\s+tract\s+infection\b/i, /\bUTI\b/],
    contradiction: [/\bno\s+dysuria\b/i, /\bden(y|ies|ied)\s+.*\bdysuria\b/i, /\bno\s+urinary\s+symptoms\b/i],
  },
  {
    label: "anticoagulant or blood-thinner use",
    note: [/\banticoagul/i, /\bblood\s+thinner/i, /\bwarfarin\b/i, /\beliquis\b/i, /\bxarelto\b/i],
    support: [/\banticoagul/i, /\bblood\s+thinner/i, /\bwarfarin\b/i, /\beliquis\b/i, /\bxarelto\b/i],
    contradiction: [/\bno\s+(anticoagulants?|blood\s+thinners?)\b/i, /\bnot\s+on\s+(anticoagulants?|blood\s+thinners?)\b/i],
  },
];

const WORKUP_GROUPS = [
  { label: "syncope workup", pattern: /\bsyncope\s+workup\b/i, support: [/\bsyncope\b/i, /\bloss\s+of\s+consciousness\b/i] },
  { label: "cardiac workup", pattern: /\b(cardiac|acs)\s+workup\b/i, support: [/\b(chest\s+pain|troponin|ecg|ekg|acs|cardiac)\b/i] },
  { label: "head injury workup", pattern: /\b(head\s+injury|trauma)\s+workup\b/i, support: [/\b(head\s+injury|head\s+strike|head\s+trauma)\b/i] },
];

const SIDE_PART_RE = /\b(left|right)\s+(hip|knee|ankle|foot|wrist|hand|shoulder|elbow|arm|leg|eye|ear)\b/gi;

const ALLERGY_TERMS = [
  { key: "penicillin", patterns: [/\bpenicillin\b/i, /\bpcn\b/i] },
  { key: "sulfa", patterns: [/\bsulfa\b/i] },
  { key: "latex", patterns: [/\blatex\b/i] },
  { key: "contrast", patterns: [/\bcontrast\b/i] },
  { key: "morphine", patterns: [/\bmorphine\b/i] },
  { key: "codeine", patterns: [/\bcodeine\b/i] },
  { key: "aspirin", patterns: [/\baspirin\b/i] },
  { key: "ibuprofen", patterns: [/\bibuprofen\b/i] },
  { key: "shellfish", patterns: [/\bshellfish\b/i] },
];

function normalize(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function excerptAround(text, index, span = 56) {
  const normalized = normalize(text);
  const safeIndex = Math.max(0, Math.min(index, normalized.length));
  let start = Math.max(0, safeIndex - span);
  let end = Math.min(normalized.length, safeIndex + span);

  if (start > 0) {
    const nextSpace = normalized.slice(start, Math.min(safeIndex, start + 32)).search(/\s/);
    if (nextSpace >= 0) start += nextSpace + 1;
  }
  if (end < normalized.length) {
    const previousSpace = normalized.slice(Math.max(safeIndex, end - 32), end).lastIndexOf(" ");
    if (previousSpace >= 0) end = Math.max(safeIndex, end - 32) + previousSpace;
  }

  const excerpt = normalize(normalized.slice(start, end));
  return `${start > 0 ? "... " : ""}${excerpt}${end < normalized.length ? " ..." : ""}`;
}

function sentenceExcerptAround(text, index, span = 72) {
  const normalized = normalize(text);
  const safeIndex = Math.max(0, Math.min(index, normalized.length));
  const before = normalized.slice(0, safeIndex);
  const start = Math.max(before.lastIndexOf("."), before.lastIndexOf("?"), before.lastIndexOf("!"), before.lastIndexOf(";")) + 1;
  const after = normalized.slice(safeIndex);
  const endOffsets = [after.indexOf("."), after.indexOf("?"), after.indexOf("!"), after.indexOf(";")]
    .filter((value) => value >= 0);
  const end = endOffsets.length ? safeIndex + Math.min(...endOffsets) + 1 : normalized.length;
  const sentence = normalize(normalized.slice(start, end));
  return sentence && sentence.length <= 220 ? sentence : excerptAround(normalized, safeIndex, span);
}

function firstMatch(text, patterns) {
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match) return { match, pattern };
  }
  return null;
}

function hasAny(text, patterns) {
  return Boolean(firstMatch(text, patterns));
}

function noteHasPositive(text, patterns) {
  return Boolean(firstPositiveHit(text, patterns));
}

function firstPositiveHit(text, patterns) {
  const sentences = splitSentences(text);
  for (const sentence of sentences) {
    for (const pattern of patterns) {
      const match = pattern.exec(sentence);
      if (match && !hasLocalNegation(sentence, match.index)) {
        return {
          match,
          sentence,
          excerpt: sentenceExcerptAround(sentence, match.index, 72),
        };
      }
    }
  }
  return null;
}

function splitSentences(text) {
  return normalize(text)
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function hasLocalNegation(sentence, claimIndex = sentence.length) {
  const beforeClaim = sentence.slice(Math.max(0, claimIndex - 64), claimIndex);
  return /\b(no|not|denies|denied|without|negative\s+for|free\s+of)\b/i.test(beforeClaim);
}

export function detectLocalLeaks(note) {
  const text = String(note || "");
  const hits = [];
  for (const token of LEAK_TOKENS) {
    const index = text.indexOf(token);
    if (index >= 0) hits.push({ surface: "note", marker: token, excerpt: excerptAround(text, index) });
  }
  const placeholders = text.match(PLACEHOLDER_RE);
  if (placeholders && placeholders.length >= PLACEHOLDER_THRESHOLD) {
    const index = text.indexOf(placeholders[0]);
    hits.push({
      surface: "note",
      marker: `raw-template-placeholders x${placeholders.length}`,
      excerpt: excerptAround(text, index),
    });
  }
  return hits;
}

export function runLocalReceipt(source, note, metadata = {}) {
  const sourceText = normalize(source);
  const noteText = normalize(note);
  if (!sourceText || !noteText) {
    return {
      normalized: 0,
      dimensions: floorDimensions(),
      fabrication: { dangerous: [], standard: [] },
      leaks: detectLocalLeaks(noteText),
      reasoning: "Local receipt needs both source and candidate note.",
      model: "browser-local-receipt",
      provider: "local",
      rubric: "local-receipt-v1",
      localResult: true,
      ...metadata,
    };
  }

  const dangerous = [];
  const standard = [];
  const dangerousEvidence = [];
  for (const group of CLAIM_GROUPS) {
    const noteMatch = firstPositiveHit(noteText, group.note);
    if (!noteMatch) continue;
    const supportHit = firstMatch(sourceText, group.support);
    const contradictionHit = firstMatch(sourceText, group.contradiction);
    const sourceSupports = Boolean(supportHit);
    const sourceContradicts = Boolean(contradictionHit);
    if (sourceContradicts || !sourceSupports) {
      const finding = sourceContradicts
        ? `${group.label} appears in the note, but the source explicitly denies or contradicts it.`
        : `${group.label} appears in the note, but the source does not visibly support it.`;
      dangerous.push(finding);
      dangerousEvidence.push({
        finding,
        label: group.label,
        reason: sourceContradicts ? "source contradiction" : "missing visible support",
        noteExcerpt: noteMatch.excerpt,
        sourceExcerpt: contradictionHit
          ? sentenceExcerptAround(sourceText, contradictionHit.match.index, 72)
          : "No matching support phrase found in the source text.",
      });
    }
  }

  for (const group of WORKUP_GROUPS) {
    const noteMatch = group.pattern.exec(noteText);
    const supportHit = firstMatch(sourceText, group.support);
    if (noteMatch && !supportHit) {
      const finding = `${group.label} appears in the note, but the source does not support that workup.`;
      dangerous.push(finding);
      dangerousEvidence.push({
        finding,
        label: group.label,
        reason: "missing visible support",
        noteExcerpt: sentenceExcerptAround(noteText, noteMatch.index, 72),
        sourceExcerpt: "No matching support phrase found in the source text.",
      });
    }
  }

  const structuredEvidence = detectStructuredMismatchEvidence(sourceText, noteText);
  dangerous.push(...structuredEvidence.map((item) => item.finding));
  dangerousEvidence.push(...structuredEvidence);

  const leaks = detectLocalLeaks(noteText);
  const uniqueDangerous = [...new Set(dangerous)];
  const uniqueDangerousEvidence = uniqueDangerous.map(
    (finding) =>
      dangerousEvidence.find((item) => item.finding === finding) || {
        finding,
        label: "structured mismatch",
        reason: "source-note mismatch",
        noteExcerpt: "",
        sourceExcerpt: "",
      }
  );
  const overlap = sourceNoteOverlap(sourceText, noteText);
  const dimensions = localDimensions({ dangerous: uniqueDangerous.length, standard: standard.length, leaks: leaks.length, overlap });
  const total = Object.values(dimensions).reduce((sum, value) => sum + value, 0);
  const normalizedScore = Math.round(((total - 6) / 24) * 100);
  const reasoning = uniqueDangerous.length
    ? `Browser-only receipt found ${uniqueDangerous.length} obvious unsupported or contradicted clinical fact${uniqueDangerous.length === 1 ? "" : "s"}. It checks common claims, demographics, laterality, allergies, and leaks, but is still conservative triage.`
    : leaks.length
      ? `Browser-only receipt found ${leaks.length} template or metadata leak${leaks.length === 1 ? "" : "s"}. It did not find an obvious unsupported clinical claim.`
      : "Browser-only receipt found no obvious unsupported clinical claim, demographic mismatch, laterality mismatch, allergy contradiction, or deterministic leak. This does not prove the note is faithful; use the live judge or powered run for stronger evidence.";

  return {
    normalized: Math.max(0, Math.min(100, normalizedScore)),
    dimensions,
    fabrication: { dangerous: uniqueDangerous, standard },
    evidence: { dangerous: uniqueDangerousEvidence },
    leaks,
    reasoning,
    model: "browser-local-receipt",
    provider: "local",
    rubric: "local-receipt-v1",
    localResult: true,
    ...metadata,
  };
}

function floorDimensions() {
  return {
    storyCohesion: 1,
    clinicalCompleteness: 1,
    naturalFlow: 1,
    absenceOfArtifacts: 1,
    physicianReadability: 1,
    inputFidelity: 1,
  };
}

function localDimensions({ dangerous, leaks, overlap }) {
  const fidelity = dangerous ? 2 : overlap < 0.12 ? 3 : 4;
  const artifacts = leaks ? 2 : dangerous ? 3 : 4;
  return {
    storyCohesion: 3,
    clinicalCompleteness: dangerous ? 3 : 4,
    naturalFlow: 3,
    absenceOfArtifacts: artifacts,
    physicianReadability: dangerous || leaks ? 3 : 4,
    inputFidelity: fidelity,
  };
}

function detectStructuredMismatches(source, note) {
  return detectStructuredMismatchEvidence(source, note).map((item) => item.finding);
}

function detectStructuredMismatchEvidence(source, note) {
  const findings = [];
  const sourceAge = extractAgeHit(source);
  const noteAge = extractAgeHit(note);
  if (sourceAge && noteAge && Math.abs(sourceAge.value - noteAge.value) >= 2) {
    const finding = `age differs between source (${sourceAge.value}) and note (${noteAge.value}).`;
    findings.push(structuredFinding(finding, "age mismatch", source, sourceAge.index, note, noteAge.index));
  }

  const sourceSex = extractExplicitSexHit(source);
  const noteSex = extractExplicitSexHit(note);
  if (sourceSex && noteSex && sourceSex.value !== noteSex.value) {
    const finding = `sex/gender differs between source (${sourceSex.value}) and note (${noteSex.value}).`;
    findings.push(structuredFinding(finding, "sex/gender mismatch", source, sourceSex.index, note, noteSex.index));
  }

  findings.push(...detectLateralityMismatchEvidence(source, note));
  findings.push(...detectAllergyMismatchEvidence(source, note));
  return findings;
}

function structuredFinding(finding, label, source, sourceIndex, note, noteIndex) {
  return {
    finding,
    label,
    reason: "source contradiction",
    noteExcerpt: sentenceExcerptAround(note, noteIndex, 72),
    sourceExcerpt: sentenceExcerptAround(source, sourceIndex, 72),
  };
}

function extractAge(text) {
  return extractAgeHit(text)?.value || null;
}

function extractAgeHit(text) {
  const patterns = [
    /\b(\d{1,3})\s*[- ]?\s*year[- ]old\b/i,
    /\b(\d{1,3})\s*(?:yo|y\/o)\b/i,
    /\bage[:\s]+(\d{1,3})\b/i,
  ];
  const match = firstMatch(text, patterns);
  if (!match) return null;
  const age = Number(match.match[1]);
  return age > 0 && age <= 120 ? { value: age, index: match.match.index, phrase: match.match[0] } : null;
}

function extractExplicitSex(text) {
  return extractExplicitSexHit(text)?.value || null;
}

function extractExplicitSexHit(text) {
  const firstLines = splitSentences(text).slice(0, 4).join(" ");
  const femaleMatch = /\b(female|woman|girl|lady)\b/i.exec(firstLines);
  const maleMatch = /\b(male|man|boy|gentleman)\b/i.exec(firstLines);
  if (femaleMatch && !maleMatch) {
    return { value: "female", index: indexOfSurface(text, femaleMatch[0]), phrase: femaleMatch[0] };
  }
  if (maleMatch && !femaleMatch) {
    return { value: "male", index: indexOfSurface(text, maleMatch[0]), phrase: maleMatch[0] };
  }
  return null;
}

function indexOfSurface(text, surface) {
  const index = String(text || "").toLowerCase().indexOf(String(surface || "").toLowerCase());
  return index >= 0 ? index : 0;
}

function detectLateralityMismatches(source, note) {
  return detectLateralityMismatchEvidence(source, note).map((item) => item.finding);
}

function detectLateralityMismatchEvidence(source, note) {
  const findings = [];
  const sourceSides = extractSidePartEvidenceMap(source);
  const noteSides = extractSidePartEvidenceMap(note);
  for (const [part, noteSideSet] of noteSides.entries()) {
    const sourceSideSet = sourceSides.get(part);
    if (!sourceSideSet) continue;
    for (const [noteSide, noteHit] of noteSideSet.entries()) {
      const opposite = noteSide === "left" ? "right" : "left";
      if (sourceSideSet.has(opposite) && !sourceSideSet.has(noteSide)) {
        const sourceHit = sourceSideSet.get(opposite);
        const finding = `laterality differs for ${part}: source says ${opposite} ${part}, but note says ${noteSide} ${part}.`;
        findings.push(structuredFinding(finding, "laterality mismatch", source, sourceHit.index, note, noteHit.index));
      }
    }
  }
  return findings;
}

function extractSidePartMap(text) {
  const evidenceMap = extractSidePartEvidenceMap(text);
  const map = new Map();
  for (const [part, sideHits] of evidenceMap.entries()) {
    map.set(part, new Set(sideHits.keys()));
  }
  return map;
}

function extractSidePartEvidenceMap(text) {
  const map = new Map();
  for (const match of text.matchAll(SIDE_PART_RE)) {
    const side = match[1].toLowerCase();
    const part = match[2].toLowerCase();
    if (!map.has(part)) map.set(part, new Map());
    if (!map.get(part).has(side)) {
      map.get(part).set(side, { side, part, index: match.index || 0, phrase: match[0] });
    }
  }
  return map;
}

function detectAllergyMismatches(source, note) {
  return detectAllergyMismatchEvidence(source, note).map((item) => item.finding);
}

function detectAllergyMismatchEvidence(source, note) {
  const findings = [];
  const sourceState = extractAllergyState(source);
  const noteState = extractAllergyState(note);
  if (sourceState.noKnown && noteState.substances.size) {
    const noteHit = firstSubstanceHit(noteState);
    const finding = `allergy claim appears in the note (${joinTerms(noteState.substances)}), but the source says no known allergies.`;
    findings.push(structuredFinding(finding, "allergy mismatch", source, sourceState.noKnownHit.index, note, noteHit.index));
  }
  if (sourceState.substances.size && noteState.noKnown) {
    const sourceHit = firstSubstanceHit(sourceState);
    const finding = `note says no known allergies, but the source lists ${joinTerms(sourceState.substances)} allergy.`;
    findings.push(structuredFinding(finding, "allergy mismatch", source, sourceHit.index, note, noteState.noKnownHit.index));
  }
  if (sourceState.substances.size && noteState.substances.size) {
    for (const noteSubstance of noteState.substances) {
      if (!sourceState.substances.has(noteSubstance)) {
        const noteHit = noteState.substanceHits.get(noteSubstance);
        const sourceHit = firstSubstanceHit(sourceState);
        const finding = `allergy claim appears in the note (${noteSubstance}), but the source allergy list only supports ${joinTerms(sourceState.substances)}.`;
        findings.push(structuredFinding(finding, "allergy mismatch", source, sourceHit.index, note, noteHit.index));
      }
    }
  }
  return findings;
}

function extractAllergyState(text) {
  const noKnownMatch = /\b(nkda|no known (?:drug )?allerg(?:y|ies)|no (?:drug )?allerg(?:y|ies))\b/i.exec(text);
  const state = {
    noKnown: Boolean(noKnownMatch),
    noKnownHit: noKnownMatch ? { index: noKnownMatch.index, phrase: noKnownMatch[0] } : null,
    substances: new Set(),
    substanceHits: new Map(),
  };
  for (const { sentence, index } of splitSentenceSpans(text)) {
    const hasAllergyContext = /\ballerg(?:y|ic|ies)\b/i.test(sentence);
    for (const term of ALLERGY_TERMS) {
      const termMatch = firstMatch(sentence, term.patterns);
      if (termMatch) {
        const reactionContext = /\b(causes?|rash|hives|anaphylaxis|reaction)\b/i.test(sentence);
        if (hasAllergyContext || reactionContext) {
          state.substances.add(term.key);
          if (!state.substanceHits.has(term.key)) {
            state.substanceHits.set(term.key, { index: index + termMatch.match.index, phrase: termMatch.match[0] });
          }
        }
      }
    }
  }
  return state;
}

function splitSentenceSpans(text) {
  const normalized = normalize(text);
  const spans = [];
  const pattern = /[^.!?;]+[.!?;]?/g;
  for (const match of normalized.matchAll(pattern)) {
    const raw = match[0] || "";
    const sentence = normalize(raw);
    if (!sentence) continue;
    const leadingOffset = raw.search(/\S/);
    spans.push({ sentence, index: (match.index || 0) + Math.max(0, leadingOffset) });
  }
  return spans;
}

function firstSubstanceHit(state) {
  const firstTerm = [...state.substances].sort()[0];
  return state.substanceHits.get(firstTerm) || { index: 0, phrase: firstTerm || "" };
}

function joinTerms(terms) {
  return [...terms].sort().join(", ");
}

function sourceNoteOverlap(source, note) {
  const sourceTerms = new Set(contentWords(source));
  const noteTerms = contentWords(note);
  if (!sourceTerms.size || !noteTerms.length) return 0;
  const overlap = noteTerms.filter((word) => sourceTerms.has(word)).length;
  return overlap / noteTerms.length;
}

function contentWords(text) {
  const stop = new Set([
    "the", "and", "with", "that", "this", "from", "were", "was", "are", "for", "not", "has", "had",
    "patient", "note", "source", "she", "her", "his", "him", "they", "them", "you", "but", "all",
  ]);
  return normalize(text)
    .toLowerCase()
    .match(/[a-z][a-z0-9-]{2,}/g)
    ?.filter((word) => !stop.has(word)) || [];
}
