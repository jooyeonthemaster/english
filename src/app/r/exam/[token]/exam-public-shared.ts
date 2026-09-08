// ============================================================================
// 공개 시험지 분석 리포트 — 페이지 계약(서버 page.tsx 가 조립) + 공용 조판 토큰
// (본문 exam-public-content.tsx 와 문항 카드 exam-public-question-card.tsx 가 공유).
// ============================================================================

import type { ExamLevelAnalysis, ExamQuestionKind } from "@/lib/exam-report/types";

export interface ExamPublicQuestionAnalysis {
  difficulty: 1 | 2 | 3 | 4 | 5;
  difficultyRationale: string;
  examPoint: string;
  intent: string;
  keyConcepts: string[];
  solvingStrategy: string;
  explanation: string;
  traps: { choice: string; why: string; attractiveness: 1 | 2 | 3 }[];
}

export interface ExamPublicQuestion {
  number: string;
  kind: ExamQuestionKind | null;
  typeLabel: string;
  points: number | null;
  brief: string | null;
  /** 공개 정답 — null 이면 없음 또는 비공개(answerHidden 참조) */
  answer: string | null;
  /** 정답은 있으나 검수 전이라 비공개 */
  answerHidden: boolean;
  /** null = 이 문항의 AI 분석 없음(실패·미분석) */
  analysis: ExamPublicQuestionAnalysis | null;
}

export interface ExamPublicData {
  academyName: string;
  title: string;
  schoolName: string | null;
  grade: string | null;
  examTypeLabel: string;
  examYear: number | null;
  semester: string | null;
  questionCount: number;
  totalPoints: number | null;
  examLevel: ExamLevelAnalysis | null;
  questions: ExamPublicQuestion[];
  hiddenAnswerCount: number;
  sharedAt: string | null;
}

// ── 조판 토큰 ────────────────────────────────────────────────────────────────

export const CARD =
  "xp-card rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] sm:p-6";

export const CHIP =
  "inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset";

export const CIRCLED: Record<string, string> = {
  "1": "①",
  "2": "②",
  "3": "③",
  "4": "④",
  "5": "⑤",
};

/** 문항 난이도 1~5 → 버킷 라벨·칩 색(synthesis.ts 경계 1~2 쉬움·3 보통·4 어려움·5 킬러). */
export const DIFF_CHIP: Record<
  1 | 2 | 3 | 4 | 5,
  { label: string; className: string; fill: string }
> = {
  1: { label: "쉬움", className: "bg-emerald-50 text-emerald-700 ring-emerald-200/60", fill: "bg-emerald-500" },
  2: { label: "쉬움", className: "bg-emerald-50 text-emerald-700 ring-emerald-200/60", fill: "bg-emerald-500" },
  3: { label: "보통", className: "bg-blue-50 text-blue-700 ring-blue-200/60", fill: "bg-blue-500" },
  4: { label: "어려움", className: "bg-amber-50 text-amber-700 ring-amber-200/60", fill: "bg-amber-500" },
  5: { label: "킬러", className: "bg-rose-50 text-rose-700 ring-rose-200/60", fill: "bg-rose-500" },
};
