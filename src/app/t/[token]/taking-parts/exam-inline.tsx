"use client";

// ============================================================================
// /t/[token] 응시면 — 시험지 인라인 렌더(빌더 A4 렌더와 1:1)
//
// **divergence 근본수정(설계 §결정1)**: 기존 exam-markup.renderExamMarkup 은
// `__..__` 밑줄·`___` 빈칸만 처리하고 마커((A)/(a)/ⓐ/positional)는 원문 그대로
// 두었다(계약 §V2). 그 결과 어법(GRAMMAR_ERROR)·어휘(VOCAB_CHOICE) 지문이 응시면
// 에서 `(A)(B)`로 노출되어 웹 시험지 렌더의 `①②③④⑤` 와 어긋났다(진범).
//
// 이 모듈은 빌더 시험지 본문 경로(a4-paper-page.tsx:1221·paper-item-utils)와
// 동일하게 `formatInlineMarkersForSubtype` 로 마커를 원형숫자로 정규화한 뒤
// `renderFormattedInline` 으로 그린다 → 마커전용 4유형(어법/어휘/무관/삽입)의
// 지문 마커가 시험지와 픽셀 동일하게 ①②③④⑤ 로 렌더된다. ANTONYM/네모어법 등
// 알파벳 라벨이 의도적인 유형은 convert set 밖이라 (A) 유지(무회귀 — 정찰C 확인).
//
// 순수 string→ReactNode(정답 접근 0). 학생 안전 페이로드 텍스트만 소비한다.
// ============================================================================

import type { ReactNode } from "react";
import { renderFormattedInline } from "@/components/exams/paper-builder/paper-item-utils";
import { formatInlineMarkersForSubtype } from "@/components/exams/paper-builder/option-display";

/**
 * 응시면 지문/발문/보기 텍스트 인라인 렌더. subType 별 마커 정규화 후 빌더
 * 정본 렌더러(renderFormattedInline)로 그린다. 부모는 whitespace-pre-line 필요.
 */
export function renderExamInline(
  text: string,
  subType?: string | null,
): ReactNode {
  if (!text) return text;
  const normalized = formatInlineMarkersForSubtype(text, subType ?? null);
  return renderFormattedInline(normalized, subType ?? null);
}
