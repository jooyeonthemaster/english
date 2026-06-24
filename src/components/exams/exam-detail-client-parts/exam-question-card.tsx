"use client";

import { QuestionBankCard } from "@/components/workbench/question-bank-card";
import type { QuestionBankItem } from "@/components/workbench/question-bank-card/types";
import type { ExamQuestion } from "./types";

// ---------------------------------------------------------------------------
// 문제 목록 탭의 단일 카드
// ---------------------------------------------------------------------------
// 문제 관리 페이지의 문제 카드(QuestionBankCard)를 그대로 재사용해 디자인을 통일한다.
// 읽기 전용 미리보기이므로 embedded 모드로 띄워 손잡이/체크박스/별/삭제/검수·사용이력
// footer 등 관리 UI는 모두 숨기고, 발문·지문·선지·해설 본문만 펼친 상태로 보여준다.

export function ExamQuestionCard({ eq }: { eq: ExamQuestion }) {
  return (
    <QuestionBankCard
      q={eq.question as unknown as QuestionBankItem}
      num={eq.orderNum}
      selected={false}
      onToggle={() => {}}
      embedded
    />
  );
}
