"use client";

import { toast } from "sonner";
import { createWorkbenchPassage } from "@/actions/workbench";
import { buildAnalysisPrompt } from "@/lib/annotation-prompt";
import type { Annotation } from "@/components/workbench/editor";
import type { QuestionGenerationPlan } from "@/lib/question-generation-plans";
import { extractTextFromImage } from "./image-handlers";

interface ResetFormArgs {
  setTitle: (v: string) => void;
  setContent: (v: string) => void;
  setAnnotations: (v: Annotation[]) => void;
  setImageFile: (f: File | null) => void;
  setImagePreview: (v: string | null) => void;
  setUnit: (v: string) => void;
  setSource: (v: string) => void;
  setTagInput: (v: string) => void;
  setTags: (v: string[]) => void;
}

export function resetForm({
  setTitle,
  setContent,
  setAnnotations,
  setImageFile,
  setImagePreview,
  setUnit,
  setSource,
  setTagInput,
  setTags,
}: ResetFormArgs) {
  setTitle("");
  setContent("");
  setAnnotations([]);
  setImageFile(null);
  setImagePreview(null);
  setUnit("");
  setSource("");
  setTagInput("");
  setTags([]);
  // Keep: schoolId, grade, semester, publisher, analysisPrompt
}

interface HandleSaveArgs {
  runAnalysis: boolean;

  // Form state
  content: string;
  imageFile: File | null;
  title: string;
  annotations: Annotation[];
  schoolId: string;
  grade: string;
  semester: string;
  unit: string;
  effectivePublisher: string;
  source: string;
  tags: string[];
  analysisPrompt: string;
  analysisGenerationPlan: QuestionGenerationPlan;
  sourceDraftId?: string | null;

  // External
  schools: Array<{ id: string; name: string; type: string; publisher: string | null }>;

  // Setters / actions
  setSaving: (v: boolean) => void;
  addToQueue: (
    passage: {
      id: string;
      title: string;
      content: string;
      schoolId?: string;
      schoolName?: string;
      grade?: number;
      semester?: string;
      unit?: string;
      publisher?: string;
      tags?: string[];
      source?: string;
    },
    promptConfig: { customPrompt: string; focusAreas: string[]; targetLevel: string; generationPlan?: QuestionGenerationPlan },
    runAnalysis: boolean
  ) => void | Promise<void>;
  resetForm: () => void;
  onSaved?: () => void;
}

export async function handleSave({
  runAnalysis,
  content,
  imageFile,
  title,
  annotations,
  schoolId,
  grade,
  semester,
  unit,
  effectivePublisher,
  source,
  tags,
  analysisPrompt,
  analysisGenerationPlan,
  sourceDraftId,
  schools,
  setSaving,
  addToQueue,
  resetForm: resetFormFn,
  onSaved,
}: HandleSaveArgs) {
  if (!content.trim() && !imageFile) {
    toast.error("지문 내용을 입력하거나 이미지를 업로드해주세요.");
    return;
  }

  setSaving(true);
  try {
    const normalizedSchoolId = schoolId && schoolId !== "NONE" ? schoolId : "";
    let finalContent = content.trim();
    if (imageFile && !finalContent) {
      const extracted = await extractTextFromImage(imageFile);
      if (!extracted) {
        toast.error("이미지에서 텍스트를 추출하지 못했습니다.");
        setSaving(false);
        return;
      }
      finalContent = extracted;
    }

    const finalTitle = title.trim() || finalContent.split(/[.\n]/)[0].slice(0, 60) || "제목 없음";

    const result = await createWorkbenchPassage({
      title: finalTitle,
      content: finalContent,
      schoolId: normalizedSchoolId || undefined,
      grade: grade ? parseInt(grade) : undefined,
      semester: semester || undefined,
      unit: unit.trim() || undefined,
      publisher: effectivePublisher || undefined,
      source: source.trim() || undefined,
      tags: tags.length > 0 ? tags : undefined,
      sourceDraftId: sourceDraftId ?? undefined,
      // Persist teacher markings alongside the passage so they survive
      // reloads, flow into future re-analyses, and can be injected into
      // question generation prompts.
      annotations: annotations.length > 0
        ? annotations.map((a) => ({
            id: a.id,
            type: a.type,
            text: a.text,
            memo: a.memo,
            from: a.from,
            to: a.to,
          }))
        : undefined,
    });

    if (result.success && result.id) {
      // Build prompt config
      const combinedPrompt = buildAnalysisPrompt(analysisPrompt, annotations);
      const schoolName = schools.find((s) => s.id === normalizedSchoolId)?.name;

      // Add to queue
      await addToQueue(
        {
          id: result.id,
          title: finalTitle,
          content: finalContent,
          schoolId: normalizedSchoolId || undefined,
          schoolName,
          grade: grade ? parseInt(grade) : undefined,
          semester: semester || undefined,
          unit: unit.trim() || undefined,
          publisher: effectivePublisher || undefined,
          tags: tags.length > 0 ? tags : undefined,
          source: source.trim() || undefined,
        },
        {
          customPrompt: combinedPrompt,
          focusAreas: [],
          targetLevel: "",
          generationPlan: analysisGenerationPlan,
        },
        runAnalysis
      );

      toast.success(
        runAnalysis
          ? "지문이 등록되었습니다. 백그라운드에서 AI 분석을 시작합니다."
          : "지문이 등록되었습니다."
      );

      // Reset form for next entry
      resetFormFn();
      onSaved?.();

      // Form stays open for continuous entry — no auto-collapse
    } else {
      toast.error(result.error || "오류가 발생했습니다.");
    }
  } catch (err) {
    toast.error(err instanceof Error ? err.message : "저장 중 오류가 발생했습니다.");
  } finally {
    setSaving(false);
  }
}
