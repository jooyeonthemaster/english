// @ts-nocheck
"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { getWorkbenchQuestion } from "@/actions/workbench";

export function useQuestionEditor(onAfterDelete: (id: string) => void) {
  const router = useRouter();
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [editingQuestion, setEditingQuestion] = useState<Awaited<
    ReturnType<typeof getWorkbenchQuestion>
  > | null>(null);
  const [questionLoading, setQuestionLoading] = useState(false);
  const [questionLoadError, setQuestionLoadError] = useState<string | null>(null);
  const editLoadTokenRef = useRef(0);

  async function openEditor(id: string) {
    const token = editLoadTokenRef.current + 1;
    editLoadTokenRef.current = token;
    setEditDialogOpen(true);
    setEditingQuestionId(id);
    setEditingQuestion(null);
    setQuestionLoadError(null);
    setQuestionLoading(true);

    try {
      const question = await getWorkbenchQuestion(id);
      if (editLoadTokenRef.current !== token) return;
      if (!question) {
        setQuestionLoadError("문제를 찾을 수 없습니다.");
        toast.error("문제를 찾을 수 없습니다.");
        return;
      }
      setEditingQuestion(question);
    } catch {
      if (editLoadTokenRef.current !== token) return;
      setQuestionLoadError("문제를 불러오는 중 오류가 발생했습니다.");
      toast.error("문제를 불러오지 못했습니다.");
    } finally {
      if (editLoadTokenRef.current === token) setQuestionLoading(false);
    }
  }

  function closeEditor() {
    editLoadTokenRef.current += 1;
    setEditDialogOpen(false);
    setEditingQuestionId(null);
    setEditingQuestion(null);
    setQuestionLoadError(null);
    setQuestionLoading(false);
  }

  function handleEditorDeleted(id: string) {
    onAfterDelete(id);
    closeEditor();
    router.refresh();
  }

  return {
    editDialogOpen,
    setEditDialogOpen,
    editingQuestion,
    editingQuestionId,
    questionLoading,
    questionLoadError,
    openEditor,
    closeEditor,
    handleEditorDeleted,
  };
}
