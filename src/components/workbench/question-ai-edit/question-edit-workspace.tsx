"use client";

// ============================================================================
// 문제 수정 워크스페이스 — 단일 모달 셸 (AI 수정 ↔ 직접 수정 뷰 토글)
// ============================================================================
// "수정" 진입 시 기본은 AI 수정 뷰. 같은 모달 안에서 "직접 수정"으로 전환할 수 있어
// 모달-온-모달이 없다. EditQuestionDialog(모달)·페이지 라우트 양쪽에서 사용.
//   - AI 수정 가능 유형(QUESTION_TYPE_META 등록 subType) → 기본 "ai"
//   - 그 외(레거시/커스텀) → 기본 "manual"
// ============================================================================

import { useState } from "react";
import { useRouter } from "next/navigation";

import { QUESTION_TYPE_META } from "@/lib/question-schemas";
import { QuestionEditClient } from "@/components/workbench/question-edit-client";

import { AiEditView } from "./ai-edit-view";

interface WorkspaceQuestion {
  id: string;
  subType?: string | null;
  [key: string]: unknown;
}

interface Props {
  question: WorkspaceQuestion;
  mode?: "page" | "modal";
  onClose?: () => void;
  onDeleted?: (questionId: string) => void;
  onSaved?: () => void;
  onApproved?: () => void;
  onSavedAsNew?: (newQuestionId: string) => void;
  onBack?: () => void;
}

export function QuestionEditWorkspace({
  question,
  mode = "page",
  onClose,
  onDeleted,
  onSaved,
  onApproved,
  onSavedAsNew,
  onBack,
}: Props) {
  const router = useRouter();
  const isModal = mode === "modal";
  // AI 수정 지원 유형인지 — 등록된 subType 만 제약 재생성 가능.
  const aiEditable = !!question.subType && question.subType in QUESTION_TYPE_META;
  const [view, setView] = useState<"ai" | "manual">(aiEditable ? "ai" : "manual");

  function closeWorkspace() {
    if (isModal) onClose?.();
    else router.push("/director/questions");
  }

  if (view === "manual") {
    return (
      <QuestionEditClient
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        question={question as any}
        mode={mode}
        onClose={onClose}
        onDeleted={onDeleted}
        onSaved={onSaved}
        onApproved={onApproved}
        onSavedAsNew={onSavedAsNew}
        onBack={onBack}
        onOpenAiEdit={aiEditable ? () => setView("ai") : undefined}
      />
    );
  }

  const aiView = (
    <AiEditView
      questionId={question.id}
      onSwitchToManual={() => setView("manual")}
      onClose={closeWorkspace}
      onBack={onBack}
      onApplied={() => {
        // 페이지 모드: 서버 컴포넌트 갱신. 모달(임베드): 목록 재조회.
        router.refresh();
        onSaved?.();
      }}
      onSavedAsNew={onSavedAsNew}
    />
  );

  if (isModal) return aiView; // EditQuestionDialog(Radix)가 셸 제공 — AiEditView 는 h-full

  // 페이지 모드 — 뷰포트 채우기(직접 수정 폼의 페이지 사이징과 동일 규격).
  return (
    <div className="-m-6 flex min-h-0 flex-col overflow-hidden" style={{ height: "calc(100vh - 56px)" }}>
      {aiView}
    </div>
  );
}
