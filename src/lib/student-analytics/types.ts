// ============================================================================
// 학생 분석 — 취약점 타입 계약 정본 (플레인 모듈, 타입 전용)
//
// 학생 허브 3탭(학습지·시험·어법)의 "보충 필요" 표면을 단일 계약으로 묶는다
// (docs/director-console-v3-design.md §D2-1). 분석 킷(hub/analytics/*)은 이
// 타입 + 해석기 주입(AnalyticsLabelResolver)만 소비하고 도메인 카탈로그
// (STUDY_STAGE_META·GRAMMAR_TYPE_LABEL 등)를 직접 임포트하지 않는다(오염 방어).
// 해석기 구현은 ./resolvers.ts, 취약 선정은 @/lib/grammar-drill/weakness.ts.
//
// 이 파일의 임포트는 전부 import type — 런타임 의존 0. study-assignments/types
// 와의 상호 참조(AnalysisSeed ↔ WeakSpot)는 타입 전용 순환이라 번들에서 소거된다.
// ============================================================================

import type { GrammarAssignmentPayload } from "@/lib/study-assignments/types";
import type { WeakConceptPreset } from "@/components/study-assignments/composer-grammar-spec";
import type { PickedContent } from "@/components/study-assignments/composer-content-picker";

// ── 지표 ─────────────────────────────────────────────────────────────────────

/**
 * 취약 지표 종별 — mastery=어법 숙달도(EWMA) · first-try=학습지 첫 시도 정답률 ·
 * accuracy=시험 유형별 정답률(재시도 개념 없음 — trend.ts 실측 기반 정직 명명).
 * 워딩 규칙은 D6: 「첫 시도 정답률」은 학습지 전용, 시험·어법에 사용 금지.
 */
export type WeakMetricKind = "mastery" | "first-try" | "accuracy";

/**
 * 점수+근거 평면 계약 — scoreExplain(director-glossary)·WeakSpotRow 가 소비하는
 * 최소 형태. WeakSpot 은 { ...spot.metric, ...spot.evidence } 로 이를 충족한다.
 */
export interface ScoreLike {
  kind: WeakMetricKind;
  /** 0~100 정수(표시 기준 반올림 값) */
  value: number;
  attempts: number;
  wrong: number;
  /** 최근 오답 시각 ISO — 없으면 미표기 */
  lastWrongAt?: string;
}

// ── 취약점 단일 계약 (v3 design §D2-1 정본) ─────────────────────────────────

export interface WeakSpot {
  domain: "study" | "exam" | "grammar";
  axis: "word" | "sentence" | "grammar-code" | "exam-type" | "concept";
  key: string;                       // wordKey · 문장번호 · a~m · subType · conceptId
  label: string;                     // 해석기 산출 확정 라벨
  metric: { kind: WeakMetricKind; value: number };
  // accuracy = 시험 유형별 정답률(재시도 개념 없음 — trend.ts 실측 기반 정직 명명)
  evidence: { attempts: number; wrong: number; lastWrongAt?: string };
  deploy: WeakDeployTarget | null;   // null = 배포 경로 없음(사유 툴팁만)
}

/** 취약 표면 → 과제 kind 매핑 결과 — 매핑표는 v3 design §D2-2 정본 */
export type WeakDeployTarget =
  | { kind: "GRAMMAR"; grammarSpec: Partial<GrammarAssignmentPayload>; weakConcepts: WeakConceptPreset[] }
  | { kind: "QUESTIONS"; questionFilter: { subTypes: string[] } }
  | { kind: "WORKSHEET"; content: PickedContent; studyMode: "standard" };  // 기존 모드 유니온 내 — 'review' 금지

// ── 라벨 해석기 주입 계약 ────────────────────────────────────────────────────

/**
 * 도메인 라벨 해석기 — 킷 컴포넌트가 도메인 카탈로그를 직임포트하지 않기 위한
 * 주입 계약. 각 탭이 resolvers.ts 의 studyLabels/examLabels/grammarLabels 를
 * 골라 props 로 넘긴다. 전 함수 total — 미등록 키는 원문을 그대로 반환한다.
 */
export interface AnalyticsLabelResolver {
  /** 학습지 스테이지 id("vocab-quiz" 등) → 제목 */
  stageLabel: (stageId: string) => string;
  /** 학습지 스킬축("vocab" 등) → 한글 라벨 */
  skillLabel: (skill: string) => string;
  /** 학습지 어법 출제 포인트 코드(a~m) → 라벨 */
  grammarCodeLabel: (code: string) => string;
  /** 문항 유형 — 시험(subType)·어법 드릴(itemType) 도메인별 해석 */
  typeLabel: (type: string) => string;
  /** 어법 드릴 개념 id → 개념 title */
  conceptLabel: (conceptId: string) => string;
  /** 어법 드릴 유닛 id → 라벨("U3 능동 vs 수동 (태)") — 어법 도메인 전용 선택 구현 */
  unitLabel?: (unitId: string) => string;
}
