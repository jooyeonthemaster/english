/**
 * 기본 학습지(core)와 실전 학습지(worksheet)의 경계를 결정론적으로 강제하는 게이트.
 *
 * 기본 분석의 learning-worksheet 섹션은 logicRows(논리 구조 표) 전용이고, 실전
 * 학습지 콘텐츠(workbookSet/inferenceSet/cloze/practice/drills/questions)는 옵트인
 * 생성 단계에서만 만들어진다. 모델이 프롬프트 금지를 어기고 끼워 넣어도 스키마가
 * 해당 필드를 허용하므로 코드에서 제거해야 한다.
 *
 * 서버 생성 경로(generate.ts)와 학습지 미리보기의 "기본 학습지" 뷰가 이 함수를
 * 공유한다 — 사용자가 미리보기에서 보는 기본/실전 차이가 실제 생성 결과와
 * 구조적으로 일치하는 것을 보장하기 위함이다.
 */
export function stripWorksheetContentFields<T extends { kind: string }>(
  sections: T[],
): T[] {
  return sections.map((section) =>
    section.kind === "learning-worksheet"
      ? ({
          ...section,
          cloze: undefined,
          practice: undefined,
          drills: undefined,
          workbookSet: undefined,
          inferenceSet: undefined,
          questions: [],
        } as T)
      : section,
  );
}

/** 위 strip 이 소거하는 실전 학습지 필드 목록 — 판별·복원이 같은 정본을 공유한다. */
const WORKSHEET_CONTENT_KEYS = [
  "cloze",
  "practice",
  "drills",
  "workbookSet",
  "inferenceSet",
] as const;

/**
 * learning-worksheet 섹션이 실전(worksheet-grade)인가 — 코어 lw(logicRows 전용)와 구분.
 * 실전 보유 판정(구매 버튼 노출)과 부분 분석 병합의 오버레이 조건이 함께 쓴다.
 */
export function hasWorksheetContentFields(section: { kind: string } | null | undefined): boolean {
  if (!section || section.kind !== "learning-worksheet") return false;
  const rec = section as Record<string, unknown>;
  if (WORKSHEET_CONTENT_KEYS.some((k) => rec[k] != null)) return true;
  return Array.isArray(rec.questions) && rec.questions.length > 0;
}

/**
 * 실전 학습지 필드 복원 오버레이 — 부분 분석의 생성기 조립(strip)이 소거한 유료(+5크레딧)
 * 콘텐츠를 직전 신선본에서 되살린다. logicRows 등 코어 몫은 core 본을 유지한다.
 */
export function overlayWorksheetContentFields<T extends { kind: string }>(
  core: T,
  previous: { kind: string },
): T {
  if (core.kind !== "learning-worksheet" || !hasWorksheetContentFields(previous)) return core;
  const prev = previous as Record<string, unknown>;
  const out = { ...core } as Record<string, unknown>;
  for (const k of WORKSHEET_CONTENT_KEYS) {
    if (prev[k] != null) out[k] = prev[k];
  }
  if (Array.isArray(prev.questions) && prev.questions.length > 0) out.questions = prev.questions;
  return out as T;
}
