import type { RowOverride } from "@/app/(director)/director/workbench/generate/workspace/workspace-types";

// 문항 일괄 발사 공유 타입 정본 — 감독 소유. 순수 타입만.
// use-studio-question-gen(발사 계약) · library-pane(QuestionGenBridge)이 맞춘다.
// 구 WorkspaceBridge(일괄 생성 패널 업링크)는 §3.10(E6 — BatchGeneratePane
// 전면 폐기)으로 함께 삭제됐다.

/** 실전 문제 일괄 발사 설정(§3.9v2.5-4) — 전 행 override 덮어쓰기 의미론 */
export interface BatchQuestionSettings {
  /** 유형 id → 문항 수(0 초과만 유효) */
  typeCounts: Record<string, number>;
  difficulty: "BASIC" | "INTERMEDIATE" | "KILLER" | null;
  generationPlan: "STANDARD" | "PREMIUM";
  /**
   * 덮어쓸 override 의 **나머지 필드 원본**(§3.10.18 E18-e, additive).
   * 미전달이면 위 3필드만 쓰던 기존 동작과 완전히 동일하다.
   *
   * 왜 필요한가: 직행 다중 발사는 사용자가 모달에서 **활성 행 하나에** 지정한
   * 설정을 나머지 행에 복제하는 것이다. 그런데 유형별 세부설정
   * (questionTypeSettings)·추가 지시문(customPrompt)·생성 모드(mode)는 위 3필드에
   * 없어서, 3필드만 덮어쓰면 사용자가 고른 세부설정이 통째로 버려진다
   * (적대 검수 확정 major). 이 필드로 원본을 함께 실어 보존한다.
   */
  overrideTemplate?: Partial<RowOverride> | null;
}

/** batchGenerateQuestions 반환 — 발사된 행 수(0 = 유형 미지정 등으로 무발사) */
export interface BatchQuestionLaunchResult {
  launchedRows: number;
  error?: string;
}
