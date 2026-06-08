import { z } from "zod";

// ============================================================================
// CompiledCustomType — 강사 커스텀 유형의 "유형 정의"(데이터형 스펙)
// ============================================================================
// 빌트인 22유형은 (프롬프트 + 스키마 + 후처리 + validator)가 코드로 묶여 품질을 낸다.
// 커스텀 유형은 그 정의를 "데이터"로 컴파일해 저장하고, 생성기가 이 정의를 읽어 생성한다.
// 코드 수정/배포 없이 정의(데이터)만 편집·버전업해 품질을 끌어올리는 게 핵심.
//
// 퀄리티 사다리(생성 티어):
//  - BUILTIN_OVERRIDE(②): 가장 가까운 빌트인 엔진 경로로 태우고, 합성 프롬프트를 customPrompt 로
//      주입(grounding·검증·재시도·relaxed fallback 공짜). 기본 엔진 무수정(import 만).
//  - GENERIC(④): 빌트인에 못 태우는 신규 구조 → 자체 생성기로 free-form 생성 + 스펙기반 검증.
//  (③ GENERIC + 결정적 지문 재구성, critique→repair 는 P2 에서 확장.)

export const RECONSTRUCTION_PRIMITIVES = [
  "NONE",
  "BLANK_SPAN",
  "MARK_SPANS",
  "REMOVE_SENTENCE",
  "INSERT_SENTENCE",
  "REORDER",
] as const;
export type ReconstructionPrimitive = (typeof RECONSTRUCTION_PRIMITIVES)[number];

export const CUSTOM_TYPE_TIERS = ["BUILTIN_OVERRIDE", "GENERIC"] as const;
export type CustomTypeTier = (typeof CUSTOM_TYPE_TIERS)[number];

export const SPEC_FORMAT_VERSION = 1;

/** 저장되는 유형 정의. CustomQuestionTypeVersion.spec(Json) 에 그대로 들어간다. */
export const compiledCustomTypeSchema = z.object({
  // 스펙 포맷 버전(정의 구조가 바뀔 때 마이그레이션 분기용). 유형 버전(version Int)과 별개.
  specFormat: z.number().int().catch(SPEC_FORMAT_VERSION).default(SPEC_FORMAT_VERSION),

  tier: z.enum(CUSTOM_TYPE_TIERS).catch("GENERIC").default("GENERIC"),

  // 가장 가까운 빌트인 유형(엔진 ID) — BUILTIN_OVERRIDE 시 이 경로로 태움. 없으면 null.
  nearestBuiltin: z.string().nullable().catch(null).default(null),
  matchConfidence: z.enum(["high", "medium", "low"]).catch("medium").default("medium"),

  // 자료 형태 / 지문 기반 여부.
  passageBased: z.boolean().catch(true).default(true),
  stimulusKind: z
    .enum(["PASSAGE", "NONE", "LISTENING", "VISUAL", "OTHER"])
    .catch("PASSAGE")
    .default("PASSAGE"),

  // 정답/보기 구조(스펙기반 검증의 계약).
  answerShape: z
    .enum(["MULTIPLE_CHOICE", "SHORT_ANSWER", "OTHER"])
    .catch("MULTIPLE_CHOICE")
    .default("MULTIPLE_CHOICE"),
  optionCount: z.number().int().min(0).max(20).catch(0).default(0),
  multipleAnswers: z.boolean().catch(false).default(false),
  correctAnswerCount: z.number().int().min(0).max(20).catch(1).default(1),

  difficulty: z.enum(["BASIC", "INTERMEDIATE", "KILLER"]).catch("INTERMEDIATE").default("INTERMEDIATE"),

  // 동형 생성 시 반드시 반영할 분석 포인트(평가 스킬 + 변형 규칙). 엔진 plan 의 targetPoints.
  targetPoints: z.array(z.string().max(400).catch("")).max(24).catch([]).default([]),

  // 타입의 본질 — 모든 생성에서 반드시 보존(예: "다의어를 문맥으로 구분하는 5예문 포맷", "1→2형식 전환 규칙").
  // 특정 인스턴스 단어/문장(예: 'lose')은 여기 넣지 않는다.
  invariants: z.array(z.string().max(600).catch("")).max(20).catch([]).default([]),
  // 매번 새로 정할 가변 축 — 인스턴스 디테일(예: "타겟 어휘", "지문 소재"). 원본 예시의 특정 단어/문장은 예시일 뿐.
  variableAxes: z.array(z.string().max(600).catch("")).max(20).catch([]).default([]),

  // 이 유형의 "조절 가능한 수치 파라미터"(유형 고유) — 예: 요약문 빈칸 수, 순서배열 분할 개수, 어법 밑줄 개수.
  // 정체성(invariants)이 아니라 정체성을 안 깨고 바뀔 수 있는 값. 생성 시 임시 override 가능(이 값이 기본).
  // 보기 수/정답 수는 별도 필드(optionCount/correctAnswerCount)로 관리하므로 여기 넣지 않는다.
  tunableParams: z
    .array(
      z.object({
        key: z.string().max(40).catch("").default(""), // 영문 머신 키(프롬프트 주입/override 식별)
        label: z.string().max(60).catch("").default(""), // 한글 라벨(UI 표시)
        value: z.number().int().min(0).max(50).catch(0).default(0), // 원본 기준 기본값
        min: z.number().int().min(0).max(50).catch(0).default(0),
        max: z.number().int().min(0).max(50).catch(0).default(0),
      }),
    )
    .max(8)
    .catch([])
    .default([]),

  // base 형태로 합성한 "유형 지식" 블록(핵심 규칙·출제 포인트·변형·재현 형식·변형 축).
  // ② 에선 customPrompt 로, ④ 에선 자체 생성 프롬프트의 본문으로 쓰인다.
  prompt: z.string().catch("").default(""),

  // ② 전용: 엔진 typeSettings(어법 마커 수 등). P1 은 null.
  typeSettings: z.record(z.string(), z.unknown()).nullable().catch(null).default(null),

  // ④/③ 전용: 결정적 지문 재구성 프리미티브. P1 은 NONE(free-form), ③에서 확장.
  reconstruction: z
    .object({ primitive: z.enum(RECONSTRUCTION_PRIMITIVES).catch("NONE").default("NONE") })
    .catch({ primitive: "NONE" })
    .default({ primitive: "NONE" }),

  // 사람이 읽는 유형 설명(원본 출제의도/특이점 요약).
  description: z.string().max(2000).catch("").default(""),
});

export type CompiledCustomType = z.infer<typeof compiledCustomTypeSchema>;

/** 컴파일 산출물 — 저장 전 검토용. */
export interface CompileCustomTypeResult {
  spec: CompiledCustomType;
  /** 기본 유형 이름 제안(강사가 편집 가능). */
  suggestedName: string;
}

/** spec(Json) 을 안전하게 파싱. 손상/구버전이면 catch 폴백으로 최대한 복구. */
export function parseCompiledCustomType(value: unknown): CompiledCustomType {
  return compiledCustomTypeSchema.parse(value ?? {});
}
