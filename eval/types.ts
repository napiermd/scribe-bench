/**
 * types.ts — shared shapes for ScribeBench.
 */

/** One benchmark case: a source encounter + (optional) reference note. */
export interface BenchmarkCase {
  id: string;
  /** The ground-truth source: a transcript or dictation of the encounter. */
  source: string;
  /** Optional clinician-written reference note (PriMock57 ships these). */
  reference?: string;
  /** Free-form tags: setting (ed/clinic/inpatient), complaint, etc. */
  tags?: string[];
  /** Where the case came from: "primock57" | "synthetic" | ... */
  provenance: string;
}

/** A candidate system's generated note for one case (what gets scored). */
export interface CandidateNote {
  caseId: string;
  note: string;
}

/** 6-dimension narrative quality result. */
export interface NarrativeDimensions {
  storyCohesion: number;        // 1-5
  clinicalCompleteness: number; // 1-5
  naturalFlow: number;          // 1-5
  absenceOfArtifacts: number;   // 1-5
  physicianReadability: number; // 1-5
  inputFidelity: number;        // 1-5 (3 = neutral when no source given)
}

export interface NarrativeResult {
  total: number;       // 6-30
  normalized: number;  // 0-100
  dimensions: NarrativeDimensions;
  reasoning: string;
}

/** Deterministic leak hit (pure string scan, no LLM). */
export interface LeakHit {
  surface: string;
  marker: string;
  excerpt: string;
}

/** Adversarial fabrication result. */
export interface FabricationResult {
  hasFabrication: boolean;
  hasDangerous: boolean;
  dangerous: string[];
  standard: string[];
  reasoning: string;
}

/** Per-case score row. */
export interface CaseScore {
  caseId: string;
  narrative: NarrativeResult;
  fabrication: FabricationResult;
  leaks: LeakHit[];
}

/** Aggregate benchmark result for a candidate system (the leaderboard row). */
export interface BenchmarkScore {
  system: string;
  dataset: string;
  n: number;
  /** Mean narrative score, 0-100. Higher is better. */
  narrativeMean: number;
  /** Fraction of cases with a DANGEROUS fabrication. Lower is better. */
  dangerousFabricationRate: number;
  /** Fraction of cases with any deterministic leak. Lower is better. */
  leakRate: number;
  /** Mean input-fidelity dimension (1-5). The headline fidelity metric. */
  fidelityMean: number;
  perDimension: NarrativeDimensions;
  judgeModel: string;
  scoredAt?: string; // ISO; stamped by the caller, not the harness
}
