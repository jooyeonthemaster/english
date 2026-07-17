// ============================================================================
// 레슨 클라이언트 페이로드 — 정답 경계의 성문화.
//
// 레슨의 CHECK·RECAP 문항은 **드릴 문항 뱅크와 동일 자산**이다(lesson-bundle.ts).
// 따라서 정답·해설·번역을 클라이언트로 내려보내면 드릴의 정답을 함께 흘리는 셈이다.
// → CHECK·RECAP 문항은 ClientItem(정답 미포함)으로 변환해 내려보내고,
//   채점은 기존 서버 채점 경로(POST /api/grammar-drill/submit)를 그대로 쓴다.
//   이렇게 하면 레슨 풀이가 숙달도(EWMA·라이트너)와 단계 게이트에도 그대로 반영된다.
//
// 그 밖의 블록(HOOK·COMPLETION·SORT·SELF_EXPLAIN·GENERATE·ERROR_HUNT…)은
// 채점 자산이 아니라 교수 자료이므로 정답을 포함해 내려보낸다(즉시 피드백용).
// ============================================================================

import type { ClientItem } from "@/lib/grammar-drill/payload";
import type { GrammarLesson, LessonBlock } from "./lesson-types";

export type SafeLessonBlock =
  | Exclude<LessonBlock, { type: "CHECK" } | { type: "RECAP" }>
  | { id: string; type: "CHECK"; tier: 1 | 2 | 3; title?: string; items: ClientItem[] }
  | { id: string; type: "RECAP"; tier: 1 | 2 | 3; title?: string; items: ClientItem[] };

export interface SafeLesson {
  id: string;
  unitId: string;
  unitTitle: string;
  order: number;
  title: string;
  oneLiner: string;
  estimatedMinutes: number;
  lenses: string[];
  gradeStamp: GrammarLesson["gradeStamp"];
  blocks: SafeLessonBlock[];
}
