"use client";

// ============================================================================
// 시험지 생성 이동 공유 유틸 — 선택한 문제 id 목록을 sessionStorage 로 넘겨
// 시험지 빌더가 미리보기(시험지)에 바로 올린다. BottomQueueSection 과
// EmbeddedQuestionBank 두 표면이 같은 로직을 각자 들고 있던 것을 통일한다.
// 사전 가드(빈 선택 처리·creatingExam 가드 등)는 호출부가 각자 유지한다.
// ============================================================================

import type { useRouter } from "next/navigation";
import { EXAM_SEED_QUESTION_IDS_KEY } from "@/lib/exam-paper-seed";

export function seedExamAndNavigate(
  router: ReturnType<typeof useRouter>,
  ids: string[],
) {
  try {
    window.sessionStorage.setItem(
      EXAM_SEED_QUESTION_IDS_KEY,
      JSON.stringify(ids),
    );
  } catch {
    // sessionStorage 실패해도 이동은 진행 (빈 빌더로 열림).
  }
  router.push("/director/workbench/exams/create");
}
