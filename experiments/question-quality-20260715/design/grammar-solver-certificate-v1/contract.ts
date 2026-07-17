import { z } from "zod";

export const GRAMMAR_CERTIFICATE_VERSION = "grammar-solver-certificate-v1" as const;

export const CORE_POINT_TO_RULE_ID = {
  a: "FINITE_VS_NONFINITE",
  b: "RELATIVE_OR_NOMINAL_CLAUSE",
  c: "PARTICIPLE_VOICE",
  d: "SUBJECT_VERB_AGREEMENT",
  e: "ACTIVE_PASSIVE_VOICE",
  f: "ADJECTIVE_ADVERB_FUNCTION",
  g: "PRONOUN_AGREEMENT_CASE",
  h: "OBJECT_COMPLEMENT_FORM",
  i: "PARALLEL_FORM",
  k: "INFINITIVE_GERUND_COMPLEMENT",
} as const;

export type GrammarCertificatePointCode = keyof typeof CORE_POINT_TO_RULE_ID;
export type GrammarCertificateRuleId =
  (typeof CORE_POINT_TO_RULE_ID)[GrammarCertificatePointCode];

const pointCodeSchema = z.enum([
  "a", "b", "c", "d", "e", "f", "g", "h", "i", "k",
]);
const ruleIdSchema = z.enum([
  "FINITE_VS_NONFINITE",
  "RELATIVE_OR_NOMINAL_CLAUSE",
  "PARTICIPLE_VOICE",
  "SUBJECT_VERB_AGREEMENT",
  "ACTIVE_PASSIVE_VOICE",
  "ADJECTIVE_ADVERB_FUNCTION",
  "PRONOUN_AGREEMENT_CASE",
  "OBJECT_COMPLEMENT_FORM",
  "PARALLEL_FORM",
  "INFINITIVE_GERUND_COMPLEMENT",
]);
const markerLabelSchema = z.enum(["(A)", "(B)", "(C)", "(D)", "(E)"]);

export const grammarSolverCertificateSchema = z.object({
  certificateVersion: z.literal(GRAMMAR_CERTIFICATE_VERSION),
  overallVerdict: z.enum([
    "UNIQUE_INVALID",
    "NONE_INVALID",
    "MULTIPLE_INVALID",
    "UNRESOLVED",
  ]),
  studentAnswer: z.enum([
    "(A)", "(B)", "(C)", "(D)", "(E)", "NONE", "MULTIPLE", "UNRESOLVED",
  ]),
  markerAnalyses: z.array(z.object({
    label: markerLabelSchema,
    observedSurfaceExact: z.string().min(1).max(120),
    verdict: z.enum(["GRAMMATICAL", "UNGRAMMATICAL", "UNRESOLVED"]),
    correctedForm: z.string().max(120),
    pointCode: pointCodeSchema,
    ruleId: ruleIdSchema,
    evidenceSpanExact: z.string().min(8).max(500),
    alternativeParse: z.enum([
      "NONE_DEFENSIBLE",
      "PLAUSIBLE_STANDARD_PARSE",
      "UNRESOLVED",
    ]),
  })).length(5),
});

export type GrammarSolverCertificate = z.infer<
  typeof grammarSolverCertificateSchema
>;

type GrammarMarker = {
  label: string;
  expression: string;
  errorExpression?: string;
  correction?: string;
  isError: boolean;
  pointCode?: string;
};

export type GrammarCertificateCandidate = {
  direction: string;
  passageWithMarkers: string;
  correctAnswer: string;
  markedExpressions: GrammarMarker[];
  explanation?: unknown;
  keyPoints?: unknown;
  wrongOptionExplanations?: unknown;
};

export type GrammarCertificateRejectionCode =
  | "CANDIDATE_SHAPE"
  | "SOLVER_NOT_UNIQUE"
  | "ANSWER_MISMATCH"
  | "LABEL_SET_MISMATCH"
  | "SURFACE_MISMATCH"
  | "CORRECTION_MISMATCH"
  | "POINT_CODE_MISMATCH"
  | "RULE_ID_MISMATCH"
  | "EVIDENCE_NOT_BOUND"
  | "KEY_NOT_UNGRAMMATICAL"
  | "DECOY_NOT_GRAMMATICAL"
  | "ALTERNATIVE_PARSE_DEFENSIBLE";

export type GrammarCertificateRenderedExplanation = {
  explanation: string;
  keyPoints: string[];
  wrongOptionExplanations: Record<string, string>;
};

export type GrammarCertificateBindingResult =
  | {
      accepted: false;
      rejectionCodes: GrammarCertificateRejectionCode[];
      rendered: null;
    }
  | {
      accepted: true;
      rejectionCodes: [];
      rendered: GrammarCertificateRenderedExplanation;
    };

const RULE_COPY: Record<
  GrammarCertificateRuleId,
  { label: string; sentence: string }
> = {
  FINITE_VS_NONFINITE: {
    label: "정동사와 준동사",
    sentence: "절 경계와 문장의 본동사 수에 맞는 정동사·준동사 형태가 필요합니다.",
  },
  RELATIVE_OR_NOMINAL_CLAUSE: {
    label: "관계사·명사절",
    sentence: "선행사 유무와 뒤 절의 완전성에 맞는 관계사·명사절 표지가 필요합니다.",
  },
  PARTICIPLE_VOICE: {
    label: "분사의 능동·수동",
    sentence: "분사의 의미상 주어와 동작 사이의 능동·수동 관계에 맞는 형태가 필요합니다.",
  },
  SUBJECT_VERB_AGREEMENT: {
    label: "주어와 동사의 수일치",
    sentence: "수식어가 아니라 실제 주어의 수에 동사 형태를 일치시켜야 합니다.",
  },
  ACTIVE_PASSIVE_VOICE: {
    label: "능동태와 수동태",
    sentence: "동사의 논항 구조와 주어·목적어의 의미 관계에 맞는 태가 필요합니다.",
  },
  ADJECTIVE_ADVERB_FUNCTION: {
    label: "형용사와 부사의 기능",
    sentence: "보어와 수식어의 문장 기능에 맞게 형용사 또는 부사를 써야 합니다.",
  },
  PRONOUN_AGREEMENT_CASE: {
    label: "대명사의 일치와 격",
    sentence: "대명사는 지시 대상의 수와 문장 안의 격·재귀 관계에 맞아야 합니다.",
  },
  OBJECT_COMPLEMENT_FORM: {
    label: "목적격 보어",
    sentence: "지배 동사와 목적어·보어의 관계에 맞는 목적격 보어 형태가 필요합니다.",
  },
  PARALLEL_FORM: {
    label: "병렬 구조",
    sentence: "접속사나 비교 구조가 연결하는 성분의 문법적 형태를 병렬로 맞춰야 합니다.",
  },
  INFINITIVE_GERUND_COMPLEMENT: {
    label: "to부정사와 동명사",
    sentence: "지배 표현이 요구하는 to부정사·동명사 보어 형태를 써야 합니다.",
  },
};

function normalize(value: unknown): string {
  return String(value ?? "").normalize("NFKC").replace(/\s+/gu, " ").trim();
}

function visiblePassage(passageWithMarkers: string): string {
  return normalize(
    passageWithMarkers.replace(
      /__\([A-E]\)\s*([^_]+?)__/gu,
      (_full, surface: string) => surface,
    ),
  );
}

function quote(value: string): string {
  return `‘${value.replace(/[‘’]/gu, "'")}’`;
}

export function buildBlindGrammarSolverCertificatePrompt(
  candidate: GrammarCertificateCandidate,
): string {
  const ruleLegend = Object.entries(CORE_POINT_TO_RULE_ID)
    .map(([code, ruleId]) => `(${code})=${ruleId}`)
    .join(" · ");
  return [
    "아래 학생용 어법 문항을 정답 키나 기존 해설 없이 독립적으로 풉니다.",
    `## 발문\n${candidate.direction}`,
    `## 학생용 지문\n${candidate.passageWithMarkers}`,
    [
      "## 구조화 판정 계약",
      "- 다섯 마커를 모두 한 번씩 분석하고 observedSurfaceExact와 evidenceSpanExact는 위 지문에서 그대로 복사합니다.",
      "- 정확히 하나만 비문이면 UNIQUE_INVALID와 그 라벨, 전부 정문이면 NONE_INVALID, 둘 이상이면 MULTIPLE_INVALID, 확정 불가면 UNRESOLVED입니다.",
      "- 비문은 correctedForm에 최소 자연 교정형을, 정문은 observedSurfaceExact를 그대로 씁니다.",
      "- 표준 현대 영어에서 방어 가능한 대안 해석이 있으면 PLAUSIBLE_STANDARD_PARSE이며 단일 정답으로 인증하지 않습니다.",
      `- pointCode/ruleId 대응은 고정입니다: ${ruleLegend}.`,
    ].join("\n"),
  ].join("\n\n");
}

function renderExplanation(
  candidate: GrammarCertificateCandidate,
  certificate: GrammarSolverCertificate,
): GrammarCertificateRenderedExplanation {
  const analyses = [...certificate.markerAnalyses].sort((left, right) =>
    left.label.localeCompare(right.label, "en"),
  );
  const key = analyses.find((analysis) => analysis.label === candidate.correctAnswer)!;
  const copy = RULE_COPY[key.ruleId];
  const explanation = [
    `정답은 ${key.label}입니다.`,
    `${key.label}의 ${quote(key.observedSurfaceExact)}는 이 문맥의 ${copy.label} 구조에 맞지 않습니다.`,
    `${quote(key.correctedForm)}로 고쳐야 하며, ${copy.sentence}`,
  ].join(" ");
  const decoys = analyses.filter((analysis) => analysis.label !== key.label);
  const wrongOptionExplanations = Object.fromEntries(
    decoys.map((analysis) => {
      const itemCopy = RULE_COPY[analysis.ruleId];
      return [
        analysis.label,
        `${analysis.label}의 ${quote(analysis.observedSurfaceExact)}는 ${itemCopy.label} 구조에 맞는 형태이므로 적절합니다.`,
      ];
    }),
  );
  const keyPoints = [key, ...decoys.slice(0, 2)].map((analysis) => {
    const itemCopy = RULE_COPY[analysis.ruleId];
    return `${analysis.label} ${itemCopy.label} — ${analysis.label === key.label ? `${quote(analysis.observedSurfaceExact)}를 ${quote(analysis.correctedForm)}로 교정` : `${quote(analysis.observedSurfaceExact)}는 정문`}`;
  });
  return { explanation, keyPoints, wrongOptionExplanations };
}

export function bindAndRenderGrammarSolverCertificate(
  candidate: GrammarCertificateCandidate,
  rawCertificate: unknown,
): GrammarCertificateBindingResult {
  const parsed = grammarSolverCertificateSchema.safeParse(rawCertificate);
  const rejectionCodes = new Set<GrammarCertificateRejectionCode>();
  if (
    !parsed.success ||
    !Array.isArray(candidate.markedExpressions) ||
    candidate.markedExpressions.length !== 5 ||
    !["(A)", "(B)", "(C)", "(D)", "(E)"].includes(candidate.correctAnswer)
  ) {
    return { accepted: false, rejectionCodes: ["CANDIDATE_SHAPE"], rendered: null };
  }
  const certificate = parsed.data;
  if (
    certificate.overallVerdict !== "UNIQUE_INVALID" ||
    !["(A)", "(B)", "(C)", "(D)", "(E)"].includes(certificate.studentAnswer)
  ) {
    rejectionCodes.add("SOLVER_NOT_UNIQUE");
  }
  if (certificate.studentAnswer !== candidate.correctAnswer) {
    rejectionCodes.add("ANSWER_MISMATCH");
  }
  const candidateByLabel = new Map(
    candidate.markedExpressions.map((marker) => [normalize(marker.label), marker]),
  );
  const analysisByLabel = new Map(
    certificate.markerAnalyses.map((analysis) => [normalize(analysis.label), analysis]),
  );
  const expectedLabels = ["(A)", "(B)", "(C)", "(D)", "(E)"];
  if (
    candidateByLabel.size !== 5 ||
    analysisByLabel.size !== 5 ||
    expectedLabels.some(
      (label) => !candidateByLabel.has(label) || !analysisByLabel.has(label),
    )
  ) {
    rejectionCodes.add("LABEL_SET_MISMATCH");
  }

  const passage = visiblePassage(candidate.passageWithMarkers);
  for (const label of expectedLabels) {
    const marker = candidateByLabel.get(label);
    const analysis = analysisByLabel.get(label);
    if (!marker || !analysis) continue;
    const isKey = label === candidate.correctAnswer;
    const expectedObserved = normalize(
      isKey ? marker.errorExpression ?? marker.expression : marker.expression,
    );
    const expectedCorrection = normalize(
      isKey ? marker.correction ?? marker.expression : expectedObserved,
    );
    if (normalize(analysis.observedSurfaceExact) !== expectedObserved) {
      rejectionCodes.add("SURFACE_MISMATCH");
    }
    if (normalize(analysis.correctedForm) !== expectedCorrection) {
      rejectionCodes.add("CORRECTION_MISMATCH");
    }
    if (normalize(analysis.pointCode).toLowerCase() !== normalize(marker.pointCode).toLowerCase()) {
      rejectionCodes.add("POINT_CODE_MISMATCH");
    }
    const expectedRule = CORE_POINT_TO_RULE_ID[
      normalize(marker.pointCode).toLowerCase() as GrammarCertificatePointCode
    ];
    if (!expectedRule || analysis.ruleId !== expectedRule) {
      rejectionCodes.add("RULE_ID_MISMATCH");
    }
    const evidence = normalize(analysis.evidenceSpanExact);
    if (!evidence || !passage.includes(evidence) || !evidence.includes(expectedObserved)) {
      rejectionCodes.add("EVIDENCE_NOT_BOUND");
    }
    if (isKey && analysis.verdict !== "UNGRAMMATICAL") {
      rejectionCodes.add("KEY_NOT_UNGRAMMATICAL");
    }
    if (!isKey && analysis.verdict !== "GRAMMATICAL") {
      rejectionCodes.add("DECOY_NOT_GRAMMATICAL");
    }
    if (analysis.alternativeParse !== "NONE_DEFENSIBLE") {
      rejectionCodes.add("ALTERNATIVE_PARSE_DEFENSIBLE");
    }
  }

  if (rejectionCodes.size > 0) {
    return {
      accepted: false,
      rejectionCodes: [...rejectionCodes].sort(),
      rendered: null,
    };
  }
  return {
    accepted: true,
    rejectionCodes: [],
    rendered: renderExplanation(candidate, certificate),
  };
}

