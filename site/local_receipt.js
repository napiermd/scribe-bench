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

const TREATMENT_GROUPS = [
  {
    label: "antibiotic treatment",
    note: treatmentPatterns([
      "antibiotics?",
      "amoxicillin",
      "augmentin",
      "azithromycin",
      "ceftriaxone",
      "cephalexin",
      "ciprofloxacin",
      "clindamycin",
      "doxycycline",
      "vancomycin",
    ]),
    support: [/\b(antibiotics?|amoxicillin|augmentin|azithromycin|ceftriaxone|cephalexin|ciprofloxacin|clindamycin|doxycycline|vancomycin)\b/i],
    contradiction: [
      /\bno\s+(antibiotics?|antimicrobials?)\s+(were\s+)?(given|started|prescribed|needed|indicated)\b/i,
      /\bnot\s+(given|started|prescribed|treated)\s+(with\s+)?(antibiotics?|antimicrobials?)\b/i,
    ],
  },
  {
    label: "IV fluid treatment",
    note: treatmentPatterns(["iv\\s+fluids?", "intravenous\\s+fluids?", "normal\\s+saline", "saline\\s+bolus", "lactated\\s+ringers?", "LR\\b"]),
    support: [/\b(iv\s+fluids?|intravenous\s+fluids?|normal\s+saline|saline\s+bolus|lactated\s+ringers?|LR)\b/i],
    contradiction: [
      /\bno\s+(iv\s+|intravenous\s+)?fluids?\s+(were\s+)?(given|administered|started|needed|indicated)\b/i,
      /\bnot\s+(given|administered|started)\s+(iv\s+|intravenous\s+)?fluids?\b/i,
    ],
  },
  {
    label: "steroid treatment",
    note: treatmentPatterns(["steroids?", "prednisone", "dexamethasone", "methylprednisolone", "solu-medrol"]),
    support: [/\b(steroids?|prednisone|dexamethasone|methylprednisolone|solu-medrol)\b/i],
    contradiction: [
      /\bno\s+steroids?\s+(were\s+)?(given|started|prescribed|needed|indicated)\b/i,
      /\bnot\s+(given|started|prescribed|treated)\s+(with\s+)?steroids?\b/i,
    ],
  },
  {
    label: "insulin treatment",
    note: treatmentPatterns(["insulin", "glargine", "lispro"]),
    support: [/\b(insulin|glargine|lispro)\b/i],
    contradiction: [
      /\bno\s+insulin\s+(was\s+|were\s+)?(given|started|prescribed|needed|indicated)\b/i,
      /\bnot\s+(given|started|prescribed|treated)\s+(with\s+)?insulin\b/i,
    ],
  },
];

const MEDICATION_CHANGE_GROUPS = [
  {
    label: "medication change",
    note: medicationChangePatterns([
      "amlodipine",
      "lisinopril",
      "losartan",
      "metoprolol",
      "hydrochlorothiazide",
      "furosemide",
      "atorvastatin",
      "rosuvastatin",
      "metformin",
      "glipizide",
      "semaglutide",
      "albuterol",
      "inhaler",
      "gabapentin",
      "sertraline",
      "fluoxetine",
      "omeprazole",
      "pantoprazole",
      "oxycodone",
      "hydrocodone",
      "tramadol",
      "acetaminophen",
      "tylenol",
      "ibuprofen",
      "naproxen",
      "apixaban",
      "eliquis",
      "rivaroxaban",
      "xarelto",
      "warfarin",
      "aspirin",
      "clopidogrel",
      "plavix",
      "(?:new\\s+)?medications?",
      "prescriptions?",
    ]),
    support: medicationChangePatterns([
      "amlodipine",
      "lisinopril",
      "losartan",
      "metoprolol",
      "hydrochlorothiazide",
      "furosemide",
      "atorvastatin",
      "rosuvastatin",
      "metformin",
      "glipizide",
      "semaglutide",
      "albuterol",
      "inhaler",
      "gabapentin",
      "sertraline",
      "fluoxetine",
      "omeprazole",
      "pantoprazole",
      "oxycodone",
      "hydrocodone",
      "tramadol",
      "acetaminophen",
      "tylenol",
      "ibuprofen",
      "naproxen",
      "apixaban",
      "eliquis",
      "rivaroxaban",
      "xarelto",
      "warfarin",
      "aspirin",
      "clopidogrel",
      "plavix",
      "(?:new\\s+)?medications?",
      "prescriptions?",
    ]),
    contradiction: [
      /\bno\s+(?:medication|med|prescription)s?\s+changes?\s+(?:were\s+|was\s+)?(?:made|needed|indicated)\b/i,
      /\bmedications?\s+(?:were\s+|was\s+)?(?:unchanged|not\s+changed)\b/i,
      /\bcontinue\s+(?:home\s+|current\s+)?medications?\s+(?:without\s+changes?|unchanged)\b/i,
      /\bno\s+new\s+(?:medications?|prescriptions?)\b/i,
      /\bno\s+(?:medications?|prescriptions?)\s+(?:were\s+|was\s+)?(?:provided|given|written|sent|prescribed)\b/i,
      /\bnot\s+(?:started|prescribed|given)\s+(?:any\s+)?(?:new\s+)?(?:medications?|prescriptions?)\b/i,
      /\b(?:did\s+not|no\s+plan\s+to)\s+(?:start|stop|change|adjust|increase|decrease|prescribe)\s+(?:any\s+)?(?:medications?|prescriptions?)\b/i,
    ],
  },
];

const DIAGNOSIS_GROUPS = [
  {
    label: "pneumonia diagnosis",
    note: diagnosisPatterns(["pneumonia", "PNA\\b"]),
    support: [/\bpneumonia\b/i, /\bPNA\b/],
    contradiction: [
      /\bno\s+(?:evidence\s+of\s+)?pneumonia\b/i,
      /\bwithout\s+pneumonia\b/i,
      /\bpneumonia\s+(?:was\s+)?(?:not\s+)?(?:diagnosed|suspected|seen)\b/i,
    ],
  },
  {
    label: "sepsis diagnosis",
    note: diagnosisPatterns(["sepsis", "septic"]),
    support: [/\bsepsis\b/i, /\bseptic\b/i],
    contradiction: [
      /\bno\s+(?:evidence\s+of\s+)?sepsis\b/i,
      /\bnot\s+septic\b/i,
      /\bwithout\s+sepsis\b/i,
      /\bno\s+systemic\s+infection\b/i,
    ],
  },
  {
    label: "fracture diagnosis",
    note: diagnosisPatterns(["fracture", "fractured", "broken"]),
    support: [/\bfracture\b/i, /\bfractured\b/i, /\bbroken\b/i],
    contradiction: [
      /\bno\s+(?:acute\s+)?fracture\b/i,
      /\bnegative\s+(?:x[- ]?ray|radiograph)\b/i,
      /\bwithout\s+(?:acute\s+)?fracture\b/i,
    ],
  },
  {
    label: "stroke diagnosis",
    note: diagnosisPatterns(["stroke", "CVA\\b", "TIA\\b", "transient\\s+ischemic\\s+attack"]),
    support: [/\bstroke\b/i, /\bCVA\b/, /\bTIA\b/, /\btransient\s+ischemic\s+attack\b/i],
    contradiction: [
      /\bno\s+(?:evidence\s+of\s+)?(?:stroke|CVA|TIA)\b/i,
      /\bwithout\s+(?:stroke|CVA|TIA)\b/i,
      /\bneuro(?:logic|logical)?\s+exam\s+(?:was\s+)?(?:normal|nonfocal)\b/i,
    ],
  },
];

const CARE_PLAN_GROUPS = [
  {
    label: "imaging order",
    note: orderPatterns(["x[- ]?rays?", "radiographs?", "plain\\s+films?", "imaging", "MRI", "CT", "ultrasounds?"]),
    support: [/\b(x[- ]?rays?|radiographs?|plain\s+films?|imaging|MRI|CT|ultrasounds?)\b/i],
    contradiction: [
      /\bno\s+(?:x[- ]?rays?|radiographs?|plain\s+films?|imaging|MRI|CT|ultrasounds?)\s+(?:was\s+|were\s+)?(?:ordered|scheduled|arranged|needed|indicated)\b/i,
      /\b(?:x[- ]?rays?|radiographs?|plain\s+films?|imaging|MRI|CT|ultrasounds?)\s+(?:was\s+|were\s+)?not\s+(?:ordered|scheduled|arranged|needed|indicated)\b/i,
      /\bdeferred\s+(?:x[- ]?rays?|radiographs?|plain\s+films?|imaging|MRI|CT|ultrasounds?)\b/i,
    ],
  },
  {
    label: "specialist referral",
    note: [
      /\b(?:referr(?:ed|al)|consult(?:ed)?|consultation|follow(?:ed)?[-\s]?up\s+with)\b[^.!?;]{0,90}\b(?:orthopedic(?:s)?|ortho|cardiology|neurology|urology|dermatology|specialist)\b/i,
      /\b(?:orthopedic(?:s)?|ortho|cardiology|neurology|urology|dermatology|specialist)\s+referral\s+(?:placed|ordered|made|arranged)\b/i,
    ],
    support: [
      /\b(?:referr(?:ed|al)|consult(?:ed)?|consultation|follow(?:ed)?[-\s]?up\s+with)\b[^.!?;]{0,90}\b(?:orthopedic(?:s)?|ortho|cardiology|neurology|urology|dermatology|specialist)\b/i,
      /\b(?:orthopedic(?:s)?|ortho|cardiology|neurology|urology|dermatology|specialist)\s+referral\b/i,
    ],
    contradiction: [
      /\bno\s+(?:orthopedic(?:s)?\s+|ortho\s+|specialist\s+)?referral\s+(?:was\s+)?(?:placed|made|ordered|needed|indicated)\b/i,
      /\b(?:referral|consultation|consult)\s+(?:was\s+)?not\s+(?:placed|made|ordered|needed|indicated)\b/i,
      /\bno\s+(?:orthopedic(?:s)?|ortho|specialist)\s+(?:consult|follow[-\s]?up)\b/i,
    ],
  },
  {
    label: "lab order",
    note: orderPatterns(["labs?", "blood\\s+work", "CBC\\b", "CMP\\b", "troponin", "urinalysis", "UA\\b"]),
    support: [/\b(labs?|blood\s+work|CBC|CMP|troponin|urinalysis|UA)\b/i],
    contradiction: [
      /\bno\s+(?:labs?|blood\s+work|CBC|CMP|troponin|urinalysis|UA)\s+(?:was\s+|were\s+)?(?:ordered|sent|drawn|needed|indicated)\b/i,
      /\b(?:labs?|blood\s+work|CBC|CMP|troponin|urinalysis|UA)\s+(?:was\s+|were\s+)?not\s+(?:ordered|sent|drawn|needed|indicated)\b/i,
    ],
  },
  {
    label: "hospital admission or ED transfer",
    note: [
      /\b(?:admit(?:ted)?|admission)\b[^.!?;]{0,70}\b(?:hospital|inpatient|medicine|floor|service)\b/i,
      /\b(?:sent|referred|transferred)\s+(?:to\s+)?(?:the\s+)?(?:ED|ER|emergency\s+department)\b/i,
      /\bhospitali[sz]ed\b/i,
    ],
    support: [
      /\b(?:admit(?:ted)?|admission)\b[^.!?;]{0,70}\b(?:hospital|inpatient|medicine|floor|service)\b/i,
      /\b(?:sent|referred|transferred)\s+(?:to\s+)?(?:the\s+)?(?:ED|ER|emergency\s+department)\b/i,
      /\bhospitali[sz]ed\b/i,
    ],
    contradiction: [
      /\bdischarged\s+home\b/i,
      /\bmanaged\s+(?:as\s+)?outpatient\b/i,
      /\bnot\s+admitted\b/i,
      /\bno\s+(?:hospital\s+)?admission\b/i,
      /\b(?:ED|ER|emergency\s+department)\s+(?:transfer|referral)\s+(?:was\s+)?not\s+(?:needed|indicated|placed|made)\b/i,
    ],
  },
];

const RESULT_GROUPS = [
  {
    label: "lab result",
    note: resultPatterns([
      "labs?",
      "blood\\s+work",
      "CBC\\b",
      "CMP\\b",
      "WBC\\b",
      "white\\s+blood\\s+cell",
      "hemoglobin",
      "Hgb\\b",
      "creatinine",
      "Cr\\b",
      "glucose",
      "troponin",
      "BNP\\b",
      "A1c\\b",
      "HbA1c\\b",
      "urinalysis",
      "UA\\b",
    ]),
    support: resultPatterns([
      "labs?",
      "blood\\s+work",
      "CBC\\b",
      "CMP\\b",
      "WBC\\b",
      "white\\s+blood\\s+cell",
      "hemoglobin",
      "Hgb\\b",
      "creatinine",
      "Cr\\b",
      "glucose",
      "troponin",
      "BNP\\b",
      "A1c\\b",
      "HbA1c\\b",
      "urinalysis",
      "UA\\b",
    ]),
    contradiction: [
      /\bno\s+(?:labs?|blood\s+work|CBC|CMP|WBC|white\s+blood\s+cell|hemoglobin|Hgb|creatinine|Cr|glucose|troponin|BNP|A1c|HbA1c|urinalysis|UA)\s+(?:was\s+|were\s+)?(?:obtained|drawn|sent|performed|collected|run|resulted|ordered)\b/i,
      /\b(?:labs?|blood\s+work|CBC|CMP|WBC|white\s+blood\s+cell|hemoglobin|Hgb|creatinine|Cr|glucose|troponin|BNP|A1c|HbA1c|urinalysis|UA)\s+(?:was\s+|were\s+)?not\s+(?:obtained|drawn|sent|performed|collected|run|resulted|ordered)\b/i,
    ],
  },
  {
    label: "imaging result",
    note: resultPatterns(["x[- ]?rays?", "radiographs?", "plain\\s+films?", "imaging", "MRI", "CT", "ultrasounds?"]),
    support: resultPatterns(["x[- ]?rays?", "radiographs?", "plain\\s+films?", "imaging", "MRI", "CT", "ultrasounds?"]),
    contradiction: [
      /\bno\s+(?:x[- ]?rays?|radiographs?|plain\s+films?|imaging|MRI|CT|ultrasounds?)\s+(?:was\s+|were\s+)?(?:obtained|performed|done|completed|ordered)\b/i,
      /\b(?:x[- ]?rays?|radiographs?|plain\s+films?|imaging|MRI|CT|ultrasounds?)\s+(?:was\s+|were\s+)?not\s+(?:obtained|performed|done|completed|ordered)\b/i,
    ],
  },
  {
    label: "ECG result",
    note: resultPatterns(["ECG\\b", "EKG\\b", "electrocardiogram"]),
    support: resultPatterns(["ECG\\b", "EKG\\b", "electrocardiogram"]),
    contradiction: [
      /\bno\s+(?:ECG|EKG|electrocardiogram)\s+(?:was\s+|were\s+)?(?:obtained|performed|done|completed|ordered)\b/i,
      /\b(?:ECG|EKG|electrocardiogram)\s+(?:was\s+|were\s+)?not\s+(?:obtained|performed|done|completed|ordered)\b/i,
    ],
  },
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
  const start = lastSentenceStartOffset(before);
  const after = normalized.slice(safeIndex);
  const endOffset = firstSentenceEndOffset(after);
  const end = endOffset >= 0 ? safeIndex + endOffset + 1 : normalized.length;
  const sentence = normalize(normalized.slice(start, end));
  return sentence && sentence.length <= 220 ? sentence : excerptAround(normalized, safeIndex, span);
}

function lastSentenceStartOffset(text) {
  for (let index = text.length - 1; index >= 0; index -= 1) {
    const char = text[index];
    if (!/[.!?;]/.test(char)) continue;
    if (char === "." && /\d/.test(text[index - 1] || "") && /\d/.test(text[index + 1] || "")) continue;
    return index + 1;
  }
  return 0;
}

function firstSentenceEndOffset(text) {
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (!/[.!?;]/.test(char)) continue;
    if (char === "." && /\d/.test(text[index - 1] || "") && /\d/.test(text[index + 1] || "")) continue;
    return index;
  }
  return -1;
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
  return /\b(no|not|denies|denied|without|negative\s+for|free\s+of|rule\s+out|r\/o|low\s+suspicion\s+for|unlikely)\b/i.test(beforeClaim);
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

  for (const group of TREATMENT_GROUPS) {
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

  for (const group of MEDICATION_CHANGE_GROUPS) {
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
          : "No matching medication-change support phrase found in the source text.",
      });
    }
  }

  for (const group of DIAGNOSIS_GROUPS) {
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

  for (const group of CARE_PLAN_GROUPS) {
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

  for (const group of RESULT_GROUPS) {
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
          : "No matching test-result support phrase found in the source text.",
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
    ? `Browser-only receipt found ${uniqueDangerous.length} obvious unsupported or contradicted clinical fact${uniqueDangerous.length === 1 ? "" : "s"}. It checks common claims, diagnoses, treatments, medication changes, care-plan actions, test results, demographics, laterality, allergies, and leaks, but is still conservative triage.`
    : leaks.length
      ? `Browser-only receipt found ${leaks.length} template or metadata leak${leaks.length === 1 ? "" : "s"}. It did not find an obvious unsupported clinical claim.`
      : "Browser-only receipt found no obvious unsupported clinical claim, diagnosis, treatment action, medication change, care-plan order/referral/disposition, test-result claim, demographic mismatch, laterality mismatch, allergy contradiction, or deterministic leak. This does not prove the note is faithful; use the live judge or powered run for stronger evidence.";

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

function treatmentPatterns(terms) {
  const termGroup = `(?:${terms.join("|")})`;
  return [
    new RegExp(`\\b(?:start(?:ed)?|give|gave|given|administer(?:ed)?|prescrib(?:ed|e)|treated\\s+with|placed\\s+(?:him|her|them|the\\s+patient)\\s+on)\\b[^.!?;]{0,80}\\b${termGroup}\\b`, "i"),
    new RegExp(`\\b${termGroup}\\b[^.!?;]{0,70}\\b(?:start(?:ed)?|given|administer(?:ed)?|prescrib(?:ed|e))\\b`, "i"),
  ];
}

function medicationChangePatterns(terms) {
  const termGroup = `(?:${terms.join("|")})`;
  const actionGroup = "(?:start(?:ed)?|begin|began|prescrib(?:ed|e)|add(?:ed)?|initiat(?:ed|e)|increase(?:d)?|decrease(?:d)?|reduce(?:d)?|stop(?:ped|ping)?|discontinu(?:ed|e)|hold(?:ing)?|held|resume(?:d)?)";
  return [
    new RegExp(`\\b${actionGroup}\\b[^.!?;]{0,90}\\b${termGroup}\\b`, "i"),
    new RegExp(`\\b${termGroup}\\b[^.!?;]{0,80}\\b${actionGroup}\\b`, "i"),
    /\b(?:new|changed|adjusted)\s+(?:medications?|prescriptions?)\b/i,
  ];
}

function diagnosisPatterns(terms) {
  const termGroup = `(?:${terms.join("|")})`;
  return [
    new RegExp(`\\b(?:assessment|impression)\\s*:\\s*(?![^.!?;]{0,60}\\b(?:rule\\s+out|r\\/o|low\\s+suspicion\\s+for|unlikely|no)\\b)[^.!?;]{0,80}\\b${termGroup}\\b`, "i"),
    new RegExp(`\\b(?:diagnos(?:is|ed\\s+with)?|dx|has|with|consistent\\s+with|treated\\s+for)\\b[^.!?;]{0,80}\\b${termGroup}\\b`, "i"),
    new RegExp(`\\b${termGroup}\\b[^.!?;]{0,60}\\b(?:diagnos(?:is|ed)?|confirmed|present)\\b`, "i"),
  ];
}

function orderPatterns(terms) {
  const termGroup = `(?:${terms.join("|")})`;
  return [
    new RegExp(`\\b(?:order(?:ed)?|schedule(?:d)?|arrange(?:d)?|sent\\s+(?:for|to))\\b[^.!?;]{0,80}\\b${termGroup}\\b`, "i"),
    new RegExp(`\\b${termGroup}\\b[^.!?;]{0,70}\\b(?:order(?:ed)?|schedule(?:d)?|arrange(?:d)?)\\b`, "i"),
  ];
}

function resultPatterns(terms) {
  const termGroup = `(?:${terms.join("|")})`;
  const resultDescriptor = "(?:negative|positive|normal|abnormal|elevated|low|high|within\\s+normal\\s+limits|WNL|sinus\\s+rhythm|ST\\s+elevation|ischemi(?:a|c)|infiltrate|pneumonia|fracture|hemorrhage|DVT|stone|no\\s+(?:acute\\s+)?(?:fracture|hemorrhage|infiltrate|pneumonia|DVT|stone)|\\d+(?:\\.\\d+)?)";
  return [
    new RegExp(`\\b${termGroup}\\b[^.!?;]{0,90}\\b(?:show(?:ed|s)?|reveal(?:ed|s)?|demonstrat(?:ed|es)?|returned|came\\s+back|result(?:ed)?|was|were|is|are)\\b[^.!?;]{0,90}\\b${resultDescriptor}\\b`, "i"),
    new RegExp(`\\b(?:show(?:ed|s)?|reveal(?:ed|s)?|demonstrat(?:ed|es)?|returned|came\\s+back)\\b[^.!?;]{0,90}\\b${termGroup}\\b`, "i"),
    new RegExp(`\\b${termGroup}\\b\\s*(?::|=)?\\s*\\d+(?:\\.\\d+)?\\b`, "i"),
    new RegExp(`\\b${resultDescriptor}\\s+${termGroup}\\b`, "i"),
  ];
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
