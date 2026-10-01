// exam-forecast 분석 JSON 계약 — pack.analysis / pack.rangeInfo / passage.prediction / passage.analysis.
// 생산: .tmp-hanguang 분석 함대(WF2) → scripts/exam-forecast/build-bundle.py → DB.

export interface DoctrineRule {
  id: string;
  area: string;
  title: string;
  ruleKo: string;
  evidence: string;
  confidence: "관측" | "강한 추론" | "약한 추론";
  howToApply: string;
  /** 회의론자 3표 중 반증 안 된 표 수 */
  survivedVotes?: number;
  correctedRule?: string;
}

export interface BlueprintSlot {
  no: string;
  qtype: string;
  typeKo: string;
  points: number;
  optLang: string;
  source: string;
  groupKey: string;
  answer: string;
  difficulty: number;
}

export interface LensFinding {
  claim: string;
  evidence: string;
  confidence: string;
  implication: string;
}

export interface LensReport {
  key: string;
  summaryKo: string;
  findings: LensFinding[];
  data?: unknown;
}

export interface TransformFlow {
  examQ: string;
  source: string;
  from: string;
  to: string;
  similarity: number;
  edits: { op: string; original: string; exam: string }[];
}

export interface ForecastAnalysis {
  doctrine?: DoctrineRule[];
  teacherIntentKo?: string;
  blueprint?: BlueprintSlot[];
  stems?: { qtype: string; stemExact: string; note: string }[];
  rangeInferenceKo?: string;
  predictionModelKo?: string;
  lenses?: LensReport[];
  transforms?: TransformFlow[];
  stats?: {
    familyPoints?: { family: string; count: number; points: number }[];
    answerDist?: Record<string, number>;
    sourceMix?: { source: string; count: number; points: number }[];
    grammarFreq?: { category: string; count: number }[];
    difficultyCurve?: { no: string; difficulty: number; points: number }[];
  };
}

export interface RangeEvidence {
  step: string;
  detail: string;
  strength: "확정" | "강함" | "보통" | "약함";
}

export interface ForecastRangeInfo {
  headline?: string;
  evidence?: RangeEvidence[];
  sources?: { group: string; label: string; count: number; expectedItems: string; note: string }[];
  uncertainty?: string[];
  referenceMatches?: { examQ: string; source: string; originalType: string; examType: string }[];
}

export interface PredictedType {
  qtype: string;
  probability: number;
  rationale: string;
  target: string;
  design: string;
}

export interface PassagePrediction {
  code?: string;
  hitLikelihood?: number;
  hitWhy?: string;
  topicKo?: string;
  topicEn?: string;
  logicKo?: string;
  predictedTypes?: PredictedType[];
  grammarSpots?: { span: string; point: string; corruption: string }[];
  vocabSpots?: { word: string; wrongSwap: string; synonymSwap: string }[];
  blankSpots?: { span: string; why: string }[];
  insertionSentence?: string;
  irrelevantSentenceIdea?: string;
  orderSplit?: string;
  summarySentence?: string;
  keyVocab?: string[];
  essayCandidates?: { qtype: string; design: string }[];
}

export interface PassageAnalysis {
  source?: string;
  originalType?: string;
  originalQuestion?: { stem: string; answer: string; options: string[]; target: string; notes: string };
  irrelevantSentence?: string;
  summarySentence?: string;
  keyGrammar?: string[];
  keyVocab?: string[];
  logicFlow?: string;
  vendorPredictedTypes?: string[];
  wordCount?: number;
  origin?: string;
}
