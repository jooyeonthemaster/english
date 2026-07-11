// ============================================================================
// /t/[token] OMR 모드 — 공용 상수·헬퍼 (V3 소유, 순수)
//
// 계약(설계문서 §5-V3·§6-1): 이 모듈은 학생 공개면 번들에 들어간다 —
// 정답성 데이터·서버 전용 모듈(question-type-ui 는 KO 레지스트리 전량을
// 끌고 들어와 공개 모바일 번들을 비대화)을 절대 임포트하지 않는다.
// 유형 한글 축약 라벨은 여기 로컬 맵이 정본(QUESTION_TYPE_UI label 의 축약형).
// ============================================================================

import { optionDisplayLabel } from "@/components/exams/paper-builder/option-display";
import type { TakingQuestion } from "@/lib/exam-scoring/taking-payload";

/** 문항 발문·학생 답 입력 텍스트에만 적용 — UI 크롬은 기본 폰트(/a 관례 미러). */
export const EXAM_FONT = '"Malgun Gothic Exam", "Malgun Gothic", sans-serif';

/** 서답형 input 길이 캡 — /a ANSWER_TEXT_MAX 관례(서버 zod 는 4000 코스 게이트). */
export const OMR_TEXT_MAX = 500;

/** MANUAL_ONLY(자유영작) textarea 길이 캡 — 서버 4000 이하. */
export const OMR_MANUAL_TEXT_MAX = 2000;

/** MANUAL_ONLY 답안의 texts 필드 키 — answer-spec 단일필드 관례("answer")와 통일. */
export const MANUAL_TEXT_KEY = "answer";

/** 자동저장 디바운스(과업 계약 1.2s)·실패 자동 재시도 간격. */
export const SAVE_DEBOUNCE_MS = 1200;
export const SAVE_RETRY_MS = 4000;

/** 상단 저장 상태 표시 축 — pending(디바운스 대기)도 사용자에겐 "저장 중". */
export type SaveState = "idle" | "pending" | "saving" | "saved" | "error";

// ── 선지 라벨 ────────────────────────────────────────────────────────────────

/**
 * i번째 선지 표시 라벨 — 빌더 시험지와 **동일하게 위치(index) 기반** 원형숫자
 * (optionDisplayLabel: CUSTOM 만 저장 라벨 존중, 그 외 getCircledNumber(index)).
 * 저장 토큰이 "index+1" 축이라 값·채점 불변, 라벨만 시험지·응시면과 픽셀 일치
 * (값vs인덱스 divergence 제거, 설계 §결정1 2차축). 마커 전용 4유형은 options
 * 미노출이라 optionLabels 부재 → 인덱스 원형숫자 폴백(동일 결과).
 */
export function optionLabelAt(
  labels: string[] | undefined,
  index: number,
  subType?: string | null,
): string {
  return optionDisplayLabel(subType, index, labels?.[index]);
}

// ── 유형 미니 라벨(한글 축약) ────────────────────────────────────────────────

/** 영어 26유형 축약 라벨 — QUESTION_TYPE_UI label 의 배지용 축약형. */
const TYPE_BADGE_LABELS: Record<string, string> = {
  BLANK_INFERENCE: "빈칸",
  GRAMMAR_ERROR: "어법",
  GRAMMAR_CHOICE_COMBO: "네모어법",
  VOCAB_CHOICE: "어휘",
  SENTENCE_ORDER: "순서",
  SENTENCE_INSERT: "삽입",
  TOPIC: "주제",
  MAIN_IDEA: "요지",
  TOPIC_MAIN_IDEA: "주제·요지",
  TITLE: "제목",
  IMPLIED_MEANING: "함축의미",
  REFERENCE: "지칭",
  CONTENT_MATCH: "내용일치",
  SUMMARY_COMPLETE_MC: "요약완성",
  IRRELEVANT: "무관문장",
  CONDITIONAL_WRITING: "조건영작",
  SENTENCE_TRANSFORM: "문장전환",
  FILL_BLANK_KEY: "핵심빈칸",
  SUMMARY_COMPLETE: "요약완성",
  SUMMARY_WRITING: "요약영작",
  WORD_ORDER: "배열영작",
  TOPIC_SENTENCE_WRITING: "주제문영작",
  GRAMMAR_CORRECTION: "오류수정",
  CONTEXT_MEANING: "문맥의미",
  SYNONYM: "동의어",
  ANTONYM: "반의어",
};

/** subType → 배지 라벨. 미등록(커스텀 등)은 원문 폴백, 빈 값은 "기타". */
export function typeBadgeLabel(subType: string): string {
  return TYPE_BADGE_LABELS[subType] ?? (subType || "기타");
}

// ── 디스클로저 발문 1줄 ──────────────────────────────────────────────────────

const BRIEF_MAX = 80;

function clampBrief(value: string): string {
  return value.length > BRIEF_MAX ? `${value.slice(0, BRIEF_MAX)}…` : value;
}

/** 행 펼침 시 참고용 발문 1줄 — direction 우선, 없으면 questionText 앞 80자. */
export function briefOf(question: TakingQuestion): string {
  const direction = question.safe.direction?.trim();
  if (direction) return clampBrief(direction.replace(/\s+/g, " "));
  const text = question.safe.questionText.replace(/\s+/g, " ").trim();
  if (text) return clampBrief(text);
  return "발문 정보가 없습니다.";
}

// ── 시각 라벨(클라 전용 — SSR/hydration 불일치 방지 위해 effect 에서만 호출) ──

export function formatTimeLabel(date: Date): string {
  return date.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
}

export function formatDateTimeLabel(date: Date): string {
  return date.toLocaleString("ko-KR", {
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
