export type Difficulty = "easy" | "medium" | "hard" | "adversarial";

export interface Case {
  id: string;
  difficulty: Difficulty;
  attack: string | null;
  question: string;
  expected: string;
  actual: string;
  contextRecall: number | null;
  contextPrecision: number | null;
  faithfulness: number;
  relevance: number;
  completeness: number;
  overall: number;
  passed: boolean;
  failureType: string | null;
  chunks: string[];
  goldDocs: string[];
}

export interface Summary {
  total: number;
  passed: number;
  pass_rate: number;
  avg_faithfulness: number;
  avg_relevance: number;
  avg_completeness: number;
  avg_context_recall: number | null;
  avg_context_precision: number | null;
  failure_types: Record<string, number>;
}

export interface Dataset {
  summary: Summary;
  cases: Case[];
  failureAnalysis: {
    counts: Record<string, number>;
    suggestions: string[];
    improvementLog: string;
    rootCauses: Record<string, string>;
  };
}

export interface GateResult {
  total: number;
  passed: number;
  passRate: number;
  cases: { id: string; passed: boolean; breaches: string[] }[];
}

export interface RerankRow {
  id: string;
  recallBefore: number;
  recallAfter: number;
  precisionBefore: number;
  precisionAfter: number;
  delta: number;
  sameSet: boolean;
}

export interface RerankResult {
  strategy: "question" | "expected";
  cases: RerankRow[];
  avgRecallBefore: number;
  avgRecallAfter: number;
  avgPrecisionBefore: number;
  avgPrecisionAfter: number;
  changed: string[];
  recallChanged: string[];
}

export interface ScoreResult {
  faithfulness: number;
  relevance: number;
  completeness: number;
  contextRecall: number | null;
  contextPrecision: number | null;
  overall: number;
  passed: boolean;
  failureType: string | null;
}
