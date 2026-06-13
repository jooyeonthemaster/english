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
