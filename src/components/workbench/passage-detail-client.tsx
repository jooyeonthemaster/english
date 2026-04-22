"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  TooltipProvider,
} from "@/components/ui/tooltip";
import { toast } from "sonner";
import { deleteWorkbenchPassage, updatePassageAnalysis } from "@/actions/workbench";
import type { PassageAnalysisData } from "@/types/passage-analysis";
import {
  AnalysisPromptPanel,
  type AnalysisPromptConfig,
} from "./analysis-prompt-panel";
import { InteractivePassageView } from "./interactive-passage-view";
import { AnalysisLoadingOverlay } from "./analysis-loading-overlay";
import { PassageAddToExamDialog } from "./passage-add-to-exam-dialog";
import { PassageAssignToClassDialog } from "./passage-assign-to-class-dialog";
import type { PassageDetailProps } from "./passage-detail/types";
import { QuestionsSection } from "./passage-detail/questions-section";
import { PassageActionBar } from "./passage-detail/passage-action-bar";
import { PassageDetailHeader } from "./passage-detail/sections/passage-detail-header";

export function PassageDetailClient({ passage, academyId, autoAnalyze, initialPrompt, initialFocus, initialLevel }: PassageDetailProps) {
  const router = useRouter();
  const [analysisData, setAnalysisData] = useState<PassageAnalysisData | null>(
    passage.analysis ? JSON.parse(passage.analysis.analysisData) : null
  );
  const [analyzing, setAnalyzing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [lastPromptConfig, setLastPromptConfig] =
    useState<AnalysisPromptConfig>({
      customPrompt: initialPrompt || "",
      focusAreas: initialFocus || [],
      targetLevel: initialLevel || "",
    });
  const autoAnalyzeTriggered = useRef(false);

  const tags: string[] = passage.tags ? JSON.parse(passage.tags) : [];

  // --- Analysis with prompt config ---
  const runAnalysisWithConfig = useCallback(
    async (config: AnalysisPromptConfig) => {
      setAnalyzing(true);
      setLastPromptConfig(config);
      try {
        const hasConfig =
          config.customPrompt ||
          config.focusAreas.length > 0 ||
          config.targetLevel;

        let res: Response;
        if (hasConfig) {
          // POST with custom parameters — always fresh
          res = await fetch(`/api/ai/passage-analysis/${passage.id}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              customPrompt: config.customPrompt,
              focusAreas: config.focusAreas,
              targetLevel: config.targetLevel,
            }),
          });
        } else {
          // GET — uses cache
          res = await fetch(`/api/ai/passage-analysis/${passage.id}`);
        }

        const json = await res.json();
        if (json.error) {
          toast.error(json.error);
        } else {
          setAnalysisData(json.data);
          setHasUnsavedChanges(false);
          toast.success(
            json.cached
              ? "캐시된 분석을 불러왔습니다."
              : "AI 분석이 완료되었습니다."
          );
        }
      } catch {
        toast.error("분석 중 오류가 발생했습니다.");
      } finally {
        setAnalyzing(false);
      }
    },
    [passage.id]
  );

  // --- Quick re-analysis (no prompt panel) ---
  const runQuickAnalysis = useCallback(async () => {
    await runAnalysisWithConfig(lastPromptConfig);
  }, [runAnalysisWithConfig, lastPromptConfig]);

  // Auto-analyze on mount if coming from create page with autoAnalyze=true
  useEffect(() => {
    if (autoAnalyze && !autoAnalyzeTriggered.current && !analysisData) {
      autoAnalyzeTriggered.current = true;
      runAnalysisWithConfig(lastPromptConfig);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Save edited analysis ---
  async function handleSave() {
    if (!analysisData) return;
    setSaving(true);
    try {
      const result = await updatePassageAnalysis(
        passage.id,
        JSON.stringify(analysisData)
      );
      if (result.success) {
        setHasUnsavedChanges(false);
        toast.success("분석 데이터가 저장되었습니다.");
      } else {
        toast.error(result.error || "저장 실패");
      }
    } catch {
      toast.error("저장 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  }

  // --- Update helpers that track dirty state ---
  function updateSentences(sentences: PassageAnalysisData["sentences"]) {
    if (!analysisData) return;
    setAnalysisData({ ...analysisData, sentences });
    setHasUnsavedChanges(true);
  }

  function updateVocabulary(vocabulary: PassageAnalysisData["vocabulary"]) {
    if (!analysisData) return;
    setAnalysisData({ ...analysisData, vocabulary });
    setHasUnsavedChanges(true);
  }

  function updateGrammarPoints(
    grammarPoints: PassageAnalysisData["grammarPoints"]
  ) {
    if (!analysisData) return;
    setAnalysisData({ ...analysisData, grammarPoints });
    setHasUnsavedChanges(true);
  }

  function updateStructure(structure: PassageAnalysisData["structure"]) {
    if (!analysisData) return;
    setAnalysisData({ ...analysisData, structure });
    setHasUnsavedChanges(true);
  }

  // --- Delete passage ---
  async function handleDelete() {
    if (!confirm("이 지문을 삭제하시겠습니까? 관련 문제도 모두 삭제됩니다."))
      return;
    setDeleting(true);
    const result = await deleteWorkbenchPassage(passage.id);
    if (result.success) {
      toast.success("지문이 삭제되었습니다.");
      router.push("/director/workbench/passages");
    } else {
      toast.error(result.error || "삭제 실패");
      setDeleting(false);
    }
  }

  const [examDialogOpen, setExamDialogOpen] = useState(false);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);

  return (
    <TooltipProvider>
      {/* Full-screen analysis loading overlay */}
      {analyzing && <AnalysisLoadingOverlay />}

      <div className="p-6 space-y-6">
        {/* Header */}
        <PassageDetailHeader
          passage={passage}
          tags={tags}
          hasUnsavedChanges={hasUnsavedChanges}
          saving={saving}
          deleting={deleting}
          onSave={handleSave}
          onDelete={handleDelete}
        />

        {/* ─── Action Bar: "이 지문을 ..." ─── */}
        <PassageActionBar
          passageId={passage.id}
          onRunAnalysis={runQuickAnalysis}
          analyzing={analyzing}
          onOpenExamDialog={() => setExamDialogOpen(true)}
          onOpenAssignDialog={() => setAssignDialogOpen(true)}
        />

        {/* ─── Quick-add dialogs ─── */}
        <PassageAddToExamDialog
          open={examDialogOpen}
          onOpenChange={setExamDialogOpen}
          academyId={academyId}
          passageId={passage.id}
          passageTitle={passage.title}
        />
        <PassageAssignToClassDialog
          open={assignDialogOpen}
          onOpenChange={setAssignDialogOpen}
          academyId={academyId}
          passageId={passage.id}
          passageTitle={passage.title}
        />

        {/* Interactive Passage View — integrated analysis */}
        <InteractivePassageView
          content={passage.content}
          analysisData={analysisData}
        />

        {/* AI 분석 설정 — collapsible */}
        <AnalysisPromptPanel
          onRunAnalysis={runAnalysisWithConfig}
          analyzing={analyzing}
          hasExistingAnalysis={!!analysisData}
          initialConfig={lastPromptConfig}
        />

        {/* ExamPointsEditor removed — exam design info is shown in InteractivePassageView summary */}

        {/* 연결된 문제 — toggle + 2-column grid */}
        {passage.questions.length > 0 && (
          <QuestionsSection questions={passage.questions} />
        )}
        </div>
      </TooltipProvider>
  );
}
