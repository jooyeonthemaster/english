import { z } from "zod";

export const BLANK_SEMANTIC_CERTIFICATE_VERSION =
  "blank-semantic-certificate-v1" as const;

const LABELS = ["1", "2", "3", "4", "5"] as const;
const ROLE_IDS = ["R1", "R2", "R3", "R4", "R5", "R6", "R7", "R8"] as const;

export const BLANK_SEMANTIC_AXES = [
  "ACTOR_TARGET",
  "POLARITY",
  "CONDITION_MODALITY",
  "CAUSAL_RELATION",
  "SCOPE_QUANTIFIER",
] as const;

export type BlankSemanticAxis = (typeof BLANK_SEMANTIC_AXES)[number];

const roleIdSchema = z.enum(ROLE_IDS);
const semanticAxisSchema = z.enum(BLANK_SEMANTIC_AXES);

const propositionSchema = z
  .object({
    actorRoleIds: z.array(roleIdSchema).min(1).max(3),
    targetRoleIds: z.array(roleIdSchema).max(3),
    polarity: z.enum(["AFFIRMATIVE", "NEGATED", "PRIVATIVE", "MIXED"]),
    condition: z.enum([
      "UNCONDITIONAL",
      "CONTEXT_DEPENDENT",
      "NECESSARY_CONDITION",
      "SUFFICIENT_CONDITION",
      "COUNTERFACTUAL",
    ]),
    modality: z.enum([
      "ASSERTED",
      "POSSIBLE",
      "LIKELY",
      "QUALIFIED",
      "NECESSARY",
      "IMPOSSIBLE",
    ]),
    relation: z.enum([
      "IDENTITY",
      "CAUSES",
      "ENABLES",
      "INHIBITS",
      "REQUIRES",
      "CONTRASTS",
      "IMPROVES",
      "WORSENS",
      "PREDICTS",
      "COEXISTS",
    ]),
    causalDirection: z.enum([
      "NONE",
      "ACTOR_TO_TARGET",
      "TARGET_TO_ACTOR",
      "MUTUAL",
    ]),
    scope: z.enum([
      "SINGLE_INSTANCE",
      "LOCAL_SUBSET",
      "LOCAL_RELATION",
      "GENERAL_CLASS",
      "PASSAGE_THESIS",
      "UNIVERSAL",
    ]),
    quantifier: z.enum([
      "ONE",
      "SOME",
      "MANY",
      "MOST",
      "ALL",
      "NON_UNIVERSAL",
      "UNSPECIFIED",
    ]),
  })
  .strict();

const evidenceRoleSchema = z
  .object({
    roleId: roleIdSchema,
    roleClass: z.enum([
      "PERSON_OR_GROUP",
      "INSTITUTION",
      "OBJECT_OR_SYSTEM",
      "PROCESS",
      "STATE",
      "OUTCOME",
      "CONDITION",
      "CLAIM",
    ]),
    evidenceSpanExact: z.string().min(4).max(360),
  })
  .strict();

const optionAnalysisSchema = z
  .object({
    label: z.enum(LABELS),
    optionTextExact: z.string().min(1).max(360),
    verdict: z.enum([
      "FULL_EQUIVALENT",
      "ONE_AXIS_DISTORTION",
      "MULTI_AXIS_DISTORTION",
      "UNRESOLVED",
    ]),
    proposition: propositionSchema,
    divergentAxes: z.array(semanticAxisSchema).max(5),
    semanticOverlap: z.enum(["HIGH", "MEDIUM", "LOW"]),
    supportingRoleIds: z.array(roleIdSchema).min(1).max(8),
    sourceEvidenceExact: z.array(z.string().min(4).max(500)).min(1).max(3),
    competingEquivalentReading: z.enum([
      "NONE_DEFENSIBLE",
      "PLAUSIBLE_EQUIVALENT",
      "UNRESOLVED",
    ]),
  })
  .strict();

export const blankSemanticCertificateSchema = z
  .object({
    certificateVersion: z.literal(BLANK_SEMANTIC_CERTIFICATE_VERSION),
    overallVerdict: z.enum([
      "UNIQUE_ANSWER",
      "NO_ANSWER",
      "MULTIPLE_ANSWERS",
      "UNRESOLVED",
    ]),
    studentAnswer: z.enum([...LABELS, "NONE", "MULTIPLE", "UNRESOLVED"]),
    evidenceRoles: z.array(evidenceRoleSchema).min(2).max(8),
    inferredTargetProposition: propositionSchema,
    targetEvidenceExact: z.array(z.string().min(4).max(500)).min(1).max(3),
    optionAnalyses: z.array(optionAnalysisSchema).length(5),
  })
  .strict();

export type BlankSemanticCertificate = z.infer<
  typeof blankSemanticCertificateSchema
>;
export type BlankProposition = z.infer<typeof propositionSchema>;

type BlankOption = { label: string; text: string };

export type BlankSemanticCandidate = {
  direction: string;
  passageText: string;
  originalExpression: string;
  surroundingText: string;
  blankAnswerMode?: "SOURCE_EXACT" | "PARAPHRASE" | "DOUBLE_NEGATIVE";
  options: BlankOption[];
  correctAnswer: string;
  difficulty: "BASIC" | "INTERMEDIATE" | "KILLER";
  explanation?: unknown;
  wrongOptionExplanations?: unknown;
  blankDesign?: unknown;
  blankBlueprint?: unknown;
};

export type BlankCertificateRejectionCode =
  | "CANDIDATE_SHAPE"
  | "SOURCE_SPAN_NOT_UNIQUE"
  | "CERTIFICATE_SHAPE"
  | "SOLVER_NOT_UNIQUE"
  | "ANSWER_MISMATCH"
  | "LABEL_SET_MISMATCH"
  | "OPTION_TEXT_MISMATCH"
  | "ROLE_MAP_DUPLICATE"
  | "EVIDENCE_NOT_BOUND"
  | "ROLE_REFERENCE_UNKNOWN"
  | "ANSWER_ROLE_MISMATCH"
  | "ANSWER_NOT_EQUIVALENT"
  | "DECOY_NOT_DISTORTED"
  | "AXIS_DECLARATION_MISMATCH"
  | "VERDICT_AXIS_MISMATCH"
  | "TOO_MANY_DISTORTION_AXES"
  | "OVERLAP_TOO_LOW"
  | "AXIS_DIVERSITY_LOW"
  | "ALTERNATIVE_READING_DEFENSIBLE";

export type BlankCertificateRenderedExplanation = {
  explanation: string;
  keyPoints: string[];
  wrongOptionExplanations: Record<string, string>;
};

export type BlankCertificateBindingResult =
  | {
      accepted: false;
      rejectionCodes: BlankCertificateRejectionCode[];
      rendered: null;
      calculatedDecoyAxes: Record<string, BlankSemanticAxis[]>;
    }
  | {
      accepted: true;
      rejectionCodes: [];
      rendered: BlankCertificateRenderedExplanation;
      calculatedDecoyAxes: Record<string, BlankSemanticAxis[]>;
    };

type DifficultyPolicy = {
  maxAxesPerDecoy: number;
  minDistinctPrimaryAxes: number;
  requireSingleAxis: boolean;
  minimumOverlap: "MEDIUM" | "HIGH";
};

const DIFFICULTY_POLICY: Record<
  BlankSemanticCandidate["difficulty"],
  DifficultyPolicy
> = {
  BASIC: {
    maxAxesPerDecoy: 2,
    minDistinctPrimaryAxes: 2,
    requireSingleAxis: false,
    minimumOverlap: "MEDIUM",
  },
  INTERMEDIATE: {
    maxAxesPerDecoy: 2,
    minDistinctPrimaryAxes: 3,
    requireSingleAxis: false,
    minimumOverlap: "MEDIUM",
  },
  KILLER: {
    maxAxesPerDecoy: 1,
    minDistinctPrimaryAxes: 4,
    requireSingleAxis: true,
    minimumOverlap: "HIGH",
  },
};

const AXIS_COPY: Record<BlankSemanticAxis, string> = {
  ACTOR_TARGET: "행위자나 대상의 역할을 바꾼다",
  POLARITY: "핵심 명제의 긍정·부정 방향을 뒤집는다",
  CONDITION_MODALITY: "성립 조건이나 가능·필연의 강도를 바꾼다",
  CAUSAL_RELATION: "원인·결과의 관계나 방향을 바꾼다",
  SCOPE_QUANTIFIER: "주장의 적용 범위나 수량 강도를 바꾼다",
};

function countExact(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let offset = 0;
  while (offset <= haystack.length - needle.length) {
    const found = haystack.indexOf(needle, offset);
    if (found < 0) break;
    count += 1;
    offset = found + needle.length;
  }
  return count;
}

export function renderStudentBlankPassage(
  candidate: BlankSemanticCandidate,
): string | null {
  if (countExact(candidate.passageText, candidate.originalExpression) !== 1) {
    return null;
  }
  return candidate.passageText.replace(candidate.originalExpression, "__________");
}

function uniqueSorted<T extends string>(values: readonly T[]): T[] {
  return [...new Set(values)].sort() as T[];
}

function equalSet(left: readonly string[], right: readonly string[]): boolean {
  const a = uniqueSorted(left);
  const b = uniqueSorted(right);
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

export function propositionAxisDifferences(
  expected: BlankProposition,
  observed: BlankProposition,
): BlankSemanticAxis[] {
  const axes: BlankSemanticAxis[] = [];
  if (
    !equalSet(expected.actorRoleIds, observed.actorRoleIds) ||
    !equalSet(expected.targetRoleIds, observed.targetRoleIds)
  ) {
    axes.push("ACTOR_TARGET");
  }
  if (expected.polarity !== observed.polarity) axes.push("POLARITY");
  if (
    expected.condition !== observed.condition ||
    expected.modality !== observed.modality
  ) {
    axes.push("CONDITION_MODALITY");
  }
  if (
    expected.relation !== observed.relation ||
    expected.causalDirection !== observed.causalDirection
  ) {
    axes.push("CAUSAL_RELATION");
  }
  if (
    expected.scope !== observed.scope ||
    expected.quantifier !== observed.quantifier
  ) {
    axes.push("SCOPE_QUANTIFIER");
  }
  return axes;
}

function evidenceIsBound(studentPassage: string, evidence: string): boolean {
  return evidence !== "__________" && studentPassage.includes(evidence);
}

function propositionRoleIds(proposition: BlankProposition): string[] {
  return uniqueSorted([
    ...proposition.actorRoleIds,
    ...proposition.targetRoleIds,
  ]);
}

function quoteCompact(value: string): string {
  const compact = value.replace(/\s+/gu, " ").trim();
  const clipped = compact.length > 120 ? `${compact.slice(0, 117)}...` : compact;
  return `“${clipped.replace(/[“”]/gu, "'")}”`;
}

function renderExplanation(
  candidate: BlankSemanticCandidate,
  certificate: BlankSemanticCertificate,
  calculatedDecoyAxes: Record<string, BlankSemanticAxis[]>,
): BlankCertificateRenderedExplanation {
  const key = certificate.optionAnalyses.find(
    (analysis) => analysis.label === candidate.correctAnswer,
  )!;
  const evidence = key.sourceEvidenceExact[0] ?? certificate.targetEvidenceExact[0];
  const decoys = certificate.optionAnalyses
    .filter((analysis) => analysis.label !== candidate.correctAnswer)
    .sort((left, right) => left.label.localeCompare(right.label, "en"));
  const wrongOptionExplanations = Object.fromEntries(
    decoys.map((analysis) => {
      const axes = calculatedDecoyAxes[analysis.label] ?? [];
      return [
        analysis.label,
        `${analysis.label}번은 ${axes.map((axis) => AXIS_COPY[axis]).join(" 또한 ")}는 점에서 빈칸의 논리와 어긋납니다.`,
      ];
    }),
  );
  return {
    explanation:
      `정답은 ${candidate.correctAnswer}번입니다. ${quoteCompact(evidence)}가 제시하는 행위자·극성·조건·인과·범위를 모두 유지하는 선지는 ${candidate.correctAnswer}번뿐입니다. ` +
      "나머지 선지는 지문 개념을 사용하지만 위 의미 축 중 적어도 하나를 바꿉니다.",
    keyPoints: [
      `정답 근거: ${quoteCompact(evidence)}`,
      "판단 기준: 행위자·극성·조건/양태·인과 관계·범위/수량의 동시 보존",
    ],
    wrongOptionExplanations,
  };
}

export function buildBlindBlankSemanticCertificatePrompt(
  candidate: BlankSemanticCandidate,
): string {
  const studentPassage = renderStudentBlankPassage(candidate);
  if (!studentPassage) {
    throw new Error("SOURCE_SPAN_NOT_UNIQUE");
  }
  const options = [...candidate.options]
    .sort((left, right) => left.label.localeCompare(right.label, "en"))
    .map((option) => `${option.label}. ${option.text}`)
    .join("\n");
  return [
    "다음 빈칸 문항을 출제자의 정답·설계·해설 없이 독립적으로 먼저 푸십시오.",
    `## 발문\n${candidate.direction}`,
    `## 학생용 지문\n${studentPassage}`,
    `## 선지\n${options}`,
    [
      "## 구조화 판정 계약",
      "- 정답이 정확히 하나일 때만 UNIQUE_ANSWER를 사용하고, 없거나 둘 이상이거나 확정할 수 없으면 각각 NO_ANSWER, MULTIPLE_ANSWERS, UNRESOLVED를 사용합니다.",
      "- 지문에 실제로 보이는 근거만 evidenceRoles와 sourceEvidenceExact에 축자 복사합니다. 빈칸 자체를 근거로 쓰지 않습니다.",
      "- inferredTargetProposition과 다섯 option proposition을 같은 역할 ID와 닫힌 의미 필드로 표현합니다.",
      "- divergentAxes는 두 proposition을 비교해 실제로 달라지는 축만 기록합니다.",
      "- 표준 독해에서 오답도 정답과 동치일 가능성이 있으면 PLAUSIBLE_EQUIVALENT, 판단이 불가능하면 UNRESOLVED를 사용합니다.",
      `- 의미 축: ${BLANK_SEMANTIC_AXES.join(", ")}.`,
    ].join("\n"),
  ].join("\n\n");
}

export function bindAndRenderBlankSemanticCertificate(
  candidate: BlankSemanticCandidate,
  rawCertificate: unknown,
): BlankCertificateBindingResult {
  const calculatedDecoyAxes: Record<string, BlankSemanticAxis[]> = {};
  const labels = candidate.options.map((option) => option.label);
  if (
    typeof candidate.passageText !== "string" ||
    typeof candidate.originalExpression !== "string" ||
    candidate.options.length !== 5 ||
    !LABELS.includes(candidate.correctAnswer as (typeof LABELS)[number]) ||
    !DIFFICULTY_POLICY[candidate.difficulty]
  ) {
    return {
      accepted: false,
      rejectionCodes: ["CANDIDATE_SHAPE"],
      rendered: null,
      calculatedDecoyAxes,
    };
  }
  const studentPassage = renderStudentBlankPassage(candidate);
  if (!studentPassage) {
    return {
      accepted: false,
      rejectionCodes: ["SOURCE_SPAN_NOT_UNIQUE"],
      rendered: null,
      calculatedDecoyAxes,
    };
  }
  const parsed = blankSemanticCertificateSchema.safeParse(rawCertificate);
  if (!parsed.success) {
    return {
      accepted: false,
      rejectionCodes: ["CERTIFICATE_SHAPE"],
      rendered: null,
      calculatedDecoyAxes,
    };
  }

  const certificate = parsed.data;
  const rejectionCodes = new Set<BlankCertificateRejectionCode>();
  const optionByLabel = new Map(candidate.options.map((option) => [option.label, option]));
  const analysisByLabel = new Map(
    certificate.optionAnalyses.map((analysis) => [analysis.label, analysis]),
  );
  if (
    new Set(labels).size !== 5 ||
    new Set(certificate.optionAnalyses.map((analysis) => analysis.label)).size !== 5 ||
    LABELS.some(
      (label) => !optionByLabel.has(label) || !analysisByLabel.has(label),
    )
  ) {
    rejectionCodes.add("LABEL_SET_MISMATCH");
  }
  if (
    certificate.overallVerdict !== "UNIQUE_ANSWER" ||
    !LABELS.includes(certificate.studentAnswer as (typeof LABELS)[number])
  ) {
    rejectionCodes.add("SOLVER_NOT_UNIQUE");
  }
  if (certificate.studentAnswer !== candidate.correctAnswer) {
    rejectionCodes.add("ANSWER_MISMATCH");
  }

  const roleIds = certificate.evidenceRoles.map((role) => role.roleId);
  const knownRoleIds = new Set<string>(roleIds);
  if (knownRoleIds.size !== roleIds.length) {
    rejectionCodes.add("ROLE_MAP_DUPLICATE");
  }
  for (const role of certificate.evidenceRoles) {
    if (!evidenceIsBound(studentPassage, role.evidenceSpanExact)) {
      rejectionCodes.add("EVIDENCE_NOT_BOUND");
    }
  }
  for (const evidence of certificate.targetEvidenceExact) {
    if (!evidenceIsBound(studentPassage, evidence)) {
      rejectionCodes.add("EVIDENCE_NOT_BOUND");
    }
  }
  for (const roleId of propositionRoleIds(certificate.inferredTargetProposition)) {
    if (!knownRoleIds.has(roleId)) rejectionCodes.add("ROLE_REFERENCE_UNKNOWN");
  }

  const policy = DIFFICULTY_POLICY[candidate.difficulty];
  const distinctPrimaryAxes = new Set<BlankSemanticAxis>();
  for (const label of LABELS) {
    const option = optionByLabel.get(label);
    const analysis = analysisByLabel.get(label);
    if (!option || !analysis) continue;
    if (analysis.optionTextExact !== option.text) {
      rejectionCodes.add("OPTION_TEXT_MISMATCH");
    }
    for (const roleId of [
      ...propositionRoleIds(analysis.proposition),
      ...analysis.supportingRoleIds,
    ]) {
      if (!knownRoleIds.has(roleId)) rejectionCodes.add("ROLE_REFERENCE_UNKNOWN");
    }
    for (const evidence of analysis.sourceEvidenceExact) {
      if (!evidenceIsBound(studentPassage, evidence)) {
        rejectionCodes.add("EVIDENCE_NOT_BOUND");
      }
    }
    if (analysis.competingEquivalentReading !== "NONE_DEFENSIBLE") {
      rejectionCodes.add("ALTERNATIVE_READING_DEFENSIBLE");
    }

    const axes = propositionAxisDifferences(
      certificate.inferredTargetProposition,
      analysis.proposition,
    );
    if (!equalSet(axes, analysis.divergentAxes)) {
      rejectionCodes.add("AXIS_DECLARATION_MISMATCH");
    }
    if (label === candidate.correctAnswer) {
      if (axes.length !== 0) {
        rejectionCodes.add("ANSWER_ROLE_MISMATCH");
        rejectionCodes.add("ANSWER_NOT_EQUIVALENT");
      }
      if (
        analysis.verdict !== "FULL_EQUIVALENT" ||
        analysis.semanticOverlap !== "HIGH"
      ) {
        rejectionCodes.add("ANSWER_NOT_EQUIVALENT");
      }
      continue;
    }

    calculatedDecoyAxes[label] = axes;
    if (axes.length === 0) rejectionCodes.add("DECOY_NOT_DISTORTED");
    if (axes.length > policy.maxAxesPerDecoy) {
      rejectionCodes.add("TOO_MANY_DISTORTION_AXES");
    }
    if (policy.requireSingleAxis && axes.length !== 1) {
      rejectionCodes.add("TOO_MANY_DISTORTION_AXES");
    }
    const expectedVerdict =
      axes.length === 1
        ? "ONE_AXIS_DISTORTION"
        : axes.length > 1
          ? "MULTI_AXIS_DISTORTION"
          : "FULL_EQUIVALENT";
    if (analysis.verdict !== expectedVerdict) {
      rejectionCodes.add("VERDICT_AXIS_MISMATCH");
    }
    if (
      analysis.semanticOverlap === "LOW" ||
      (policy.minimumOverlap === "HIGH" && analysis.semanticOverlap !== "HIGH")
    ) {
      rejectionCodes.add("OVERLAP_TOO_LOW");
    }
    if (axes[0]) distinctPrimaryAxes.add(axes[0]);
  }

  if (distinctPrimaryAxes.size < policy.minDistinctPrimaryAxes) {
    rejectionCodes.add("AXIS_DIVERSITY_LOW");
  }
  if (rejectionCodes.size > 0) {
    return {
      accepted: false,
      rejectionCodes: [...rejectionCodes].sort(),
      rendered: null,
      calculatedDecoyAxes,
    };
  }
  return {
    accepted: true,
    rejectionCodes: [],
    rendered: renderExplanation(candidate, certificate, calculatedDecoyAxes),
    calculatedDecoyAxes,
  };
}
