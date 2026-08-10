// ============================================================================
// 학생 분석 — 도메인 라벨 해석기 (플레인 모듈, 클라이언트 공유 가능)
//
// 분석 킷(hub/analytics/*)의 카탈로그 직임포트 금지 규약(v3 design §D1-2)의
// 반대편 — 도메인 카탈로그를 아는 유일한 층이 이 파일이다. 각 탭이 자기
// 도메인 해석기를 골라 AnalyticsLabelResolver props 로 킷에 주입한다.
// 전 함수 total: 미등록 키는 원문 반환 — 라벨 부재가 렌더를 죽이지 않는다.
// 도메인 밖 축(예: 학습지 해석기의 conceptLabel)도 원문 반환으로 통일한다.
// ============================================================================

import { QUESTION_SUBTYPES, QUESTION_TYPES } from "@/lib/constants";
import {
  CONCEPT_SKELETON_BY_ID,
  UNIT_BY_ID,
  unitLabel as unitShortLabel,
} from "@/lib/grammar-drill/curriculum";
import { GRAMMAR_TYPE_LABEL } from "@/lib/grammar-drill/display";
import { GRAMMAR_POINT_CATALOG } from "@/lib/grammar-point-catalog";
import { STUDY_SKILL_LABELS, STUDY_STAGE_META } from "@/lib/worksheet-study/types";
import type { AnalyticsLabelResolver } from "./types";

// ── 시험 유형 라벨 (subType → 한글) — trend.ts SUBTYPE_LABELS 관용 미러 ──────
// TrendTypeStat.typeLabel 이 이 평탄화로 산출되므로, 같은 소스를 써야
// 히트맵 축 라벨과 WeakSpot.label 이 문자 단위로 일치한다.

const SUBTYPE_LABELS: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const group of Object.values(QUESTION_SUBTYPES)) {
    for (const item of group) map[item.value] = item.label;
  }
  return map;
})();

const TYPE_LABELS: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const item of QUESTION_TYPES) map[item.value] = item.label;
  return map;
})();

/**
 * 라벨 → subType 코드 역인덱스 — 시험 히트맵 셀(TrendTypeStat 은 typeLabel 만
 * 보유)에서 QUESTIONS 배포 프리필터(questionFilter.subTypes, D2-2)를 만들 때
 * 사용한다. 미등록 라벨(커스텀/"기타")은 빈 배열 — 프리필터 없이 진입.
 */
export function examSubTypesByLabel(label: string): string[] {
  return Object.keys(SUBTYPE_LABELS).filter((code) => SUBTYPE_LABELS[code] === label);
}

// ── 도메인별 해석기 3종 ──────────────────────────────────────────────────────

/** 학습지 탭 — 스테이지·스킬·어법 포인트 코드(a~m) 축 해석 */
export const studyLabels: AnalyticsLabelResolver = {
  stageLabel: (stageId) =>
    (STUDY_STAGE_META as Record<string, { title: string }>)[stageId]?.title ?? stageId,
  skillLabel: (skill) =>
    (STUDY_SKILL_LABELS as Record<string, string>)[skill] ?? skill,
  grammarCodeLabel: (code) =>
    (GRAMMAR_POINT_CATALOG as Record<string, { label: string }>)[code]?.label ?? code,
  typeLabel: (type) => type,
  conceptLabel: (conceptId) => conceptId,
};

/** 시험 탭 — 유형(subType) 축 해석. subType 우선 → type 폴백 → 원문 */
export const examLabels: AnalyticsLabelResolver = {
  stageLabel: (stageId) => stageId,
  skillLabel: (skill) => skill,
  grammarCodeLabel: (code) => code,
  typeLabel: (subType) => SUBTYPE_LABELS[subType] ?? TYPE_LABELS[subType] ?? subType,
  conceptLabel: (conceptId) => conceptId,
};

/** 어법 훈련 탭 — 드릴 문항 유형·개념·유닛 축 해석 */
export const grammarLabels: AnalyticsLabelResolver = {
  stageLabel: (stageId) => stageId,
  skillLabel: (skill) => skill,
  grammarCodeLabel: (code) => code,
  typeLabel: (itemType) => GRAMMAR_TYPE_LABEL[itemType] ?? itemType,
  conceptLabel: (conceptId) =>
    CONCEPT_SKELETON_BY_ID.get(conceptId)?.title ?? conceptId,
  unitLabel: (unitId) => {
    const unit = UNIT_BY_ID.get(unitId);
    return unit ? `${unitShortLabel(unitId)} ${unit.title}` : unitId;
  },
};
