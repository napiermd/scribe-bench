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
  /** True when the judge errored (after retries) rather than scoring. Fail-closed:
   *  an errored result is excluded from aggregates, never counted as a real score. */
  errored?: boolean;
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
  /** True when the judge errored (after retries). Fail-closed: NEVER treated as a
   *  clean result — the case is excluded from aggregates and the run flags it. */
  errored?: boolean;
}

/** Per-case score row. */
export interface CaseScore {
  caseId: string;
  narrative: NarrativeResult;
  fabrication: FabricationResult;
  leaks: LeakHit[];
  /** True if either judge errored after retries on every repeat — excluded from aggregate. */
  errored: boolean;
  /** Number of judge repeats that contributed to this case's averaged score. */
  repeats: number;
  /** Std-dev of the normalized narrative score across repeats (0 if repeats<2). */
  narrativeSpread: number;
}

/** A [low, high] confidence interval. */
export type CI = [number, number];

/** Aggregate benchmark result for a candidate system (the leaderboard row). */
export interface BenchmarkScore {
  system: string;
  dataset: string;
  /** Cases that produced a real score (errored cases excluded). */
  n: number;
  /** Cases excluded because a judge errored after retries (fail-closed). */
  nErrored: number;
  /** Judge repeats per case (ET2). */
  repeats: number;
  /** Mean narrative score, 0-100. Higher is better. */
  narrativeMean: number;
  /** 95% bootstrap CI on narrativeMean across cases. */
  narrativeMeanCI: CI;
  /** Fraction of cases with a DANGEROUS fabrication. Lower is better. */
  dangerousFabricationRate: number;
  /** 95% bootstrap CI on dangerousFabricationRate across cases. */
  dangerousFabricationRateCI: CI;
  /** Fraction of cases with any deterministic leak. Lower is better. */
  leakRate: number;
  /** Mean input-fidelity dimension (1-5). The headline fidelity metric. */
  fidelityMean: number;
  perDimension: NarrativeDimensions;
  judgeModel: string;
  scoredAt?: string; // ISO; stamped by the caller, not the harness
}
