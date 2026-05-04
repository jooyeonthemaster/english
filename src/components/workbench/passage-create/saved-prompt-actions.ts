"use client";

import { toast } from "sonner";
import {
  getCustomPrompts,
  createCustomPrompt,
  deleteCustomPrompt,
} from "@/actions/custom-prompts";
import type { SavedPrompt } from "./types";

interface SavePromptArgs {
  newPromptName: string;
  analysisPrompt: string;
  setSavingPrompt: (v: boolean) => void;
  setNewPromptName: (v: string) => void;
  setSavedPrompts: (prompts: SavedPrompt[]) => void;
}

export async function handleSavePrompt({
  newPromptName,
  analysisPrompt,
  setSavingPrompt,
  setNewPromptName,
  setSavedPrompts,
}: SavePromptArgs) {
  if (!newPromptName.trim() || !analysisPrompt.trim()) {
    toast.error("프롬프트 이름과 내용을 모두 입력해주세요.");
    return;
  }
  setSavingPrompt(true);
  try {
    const result = await createCustomPrompt({
      name: newPromptName.trim(),
      content: analysisPrompt.trim(),
      promptType: "PASSAGE_ANALYSIS",
    });
    if (result.success) {
      toast.success("프롬프트가 저장되었습니다.");
      setNewPromptName("");
      const prompts = await getCustomPrompts("PASSAGE_ANALYSIS");
      setSavedPrompts(prompts as SavedPrompt[]);
    }
  } catch {
    toast.error("저장에 실패했습니다.");
  } finally {
    setSavingPrompt(false);
  }
}

interface DeletePromptArgs {
  id: string;
  setSavedPrompts: React.Dispatch<React.SetStateAction<SavedPrompt[]>>;
}

export async function handleDeletePrompt({ id, setSavedPrompts }: DeletePromptArgs) {
  await deleteCustomPrompt(id);
  setSavedPrompts((prev) => prev.filter((p) => p.id !== id));
  toast.success("삭제되었습니다.");
}
