"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { KeyPointsList } from "./exam-points/key-points-list";
import { TypeSelector } from "./exam-points/type-selector";
import { GenerationProgress } from "./exam-points/generation-progress";
import { GeneratedResults } from "./exam-points/generated-results";
import {
  generateQuestions,
  saveGeneratedQuestionsToBank,
} from "./exam-points/actions";

// ---------------------------------------------------------------------------
// Exam Points Editor — editable key points + generation prompt
// ---------------------------------------------------------------------------

export function ExamPointsEditor({
  keyPoints,
  onUpdate,
  passageId,
}: {
  keyPoints: string[];
  onUpdate: (points: string[]) => void;
  passageId: string;
}) {
  const router = useRouter();
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const [newPoint, setNewPoint] = useState("");
  const [generationPrompt, setGenerationPrompt] = useState("");
  const [typeCounts, setTypeCounts] = useState<Record<string, number>>({});
  const [generating, setGenerating] = useState(false);
  const [generatedQuestions, setGeneratedQuestions] = useState<any[] | null>(null);

  const startEdit = (idx: number) => {
    setEditingIdx(idx);
    setEditValue(keyPoints[idx]);
  };

  const confirmEdit = () => {
    if (editingIdx === null) return;
    const updated = [...keyPoints];
    updated[editingIdx] = editValue.trim();
    onUpdate(updated.filter(Boolean));
    setEditingIdx(null);
    setEditValue("");
  };

  const removePoint = (idx: number) => {
    onUpdate(keyPoints.filter((_, i) => i !== idx));
  };

  const addPoint = () => {
    if (!newPoint.trim()) return;
    onUpdate([...keyPoints, newPoint.trim()]);
    setNewPoint("");
  };

  const setTypeCount = (id: string, count: number) => {
    setTypeCounts((prev) => {
      const next = { ...prev };
      if (count <= 0) delete next[id];
      else next[id] = count;
      return next;
    });
  };

  const totalQuestions = Object.values(typeCounts).reduce((a, b) => a + b, 0);
  const activeTypes = Object.keys(typeCounts).filter((k) => typeCounts[k] > 0);

  // Parallel per-type API calls
  const [generationProgress, setGenerationProgress] = useState<Record<string, "pending" | "done" | "error">>({});

  const handleGenerate = async () => {
    await generateQuestions({
      passageId,
      activeTypes,
      typeCounts,
      generationPrompt,
      totalQuestions,
      setGenerating,
      setGeneratedQuestions,
      setGenerationProgress,
    });
  };

  // Save generated questions to question bank
  const handleSaveQuestions = async () => {
    await saveGeneratedQuestionsToBank({
      passageId,
      generatedQuestions,
      router,
    });
  };

  return (
    <div className="space-y-4">
      {/* Editable key points */}
      <KeyPointsList
        keyPoints={keyPoints}
        editingIdx={editingIdx}
        editValue={editValue}
        newPoint={newPoint}
        setEditValue={setEditValue}
        setEditingIdx={setEditingIdx}
        setNewPoint={setNewPoint}
        startEdit={startEdit}
        confirmEdit={confirmEdit}
        removePoint={removePoint}
        addPoint={addPoint}
      />

      <Separator />

      {/* Question type selection + generation prompt */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-blue-600" />
          <span className="text-sm font-semibold text-slate-900">문제 생성</span>
          {totalQuestions > 0 && (
            <span className="text-[11px] text-blue-600 font-medium">총 {totalQuestions}문제</span>
          )}
        </div>

        <TypeSelector
          typeCounts={typeCounts}
          totalQuestions={totalQuestions}
          activeTypes={activeTypes}
          setTypeCount={setTypeCount}
          setTypeCounts={setTypeCounts}
        />

        {/* Prompt */}
        <textarea
          placeholder="추가 지시사항 (선택) — 예: 킬러 문항은 빈칸 추론으로, 서술형은 조건부 영작 위주로..."
          value={generationPrompt}
          onChange={(e) => setGenerationPrompt(e.target.value)}
          className="w-full min-h-[56px] px-3 py-2 text-[13px] leading-relaxed rounded-lg border border-slate-200 bg-slate-50/60 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/10 placeholder:text-slate-300 resize-none"
          spellCheck={false}
        />

        {/* Generate button */}
        <Button
          className="w-full bg-blue-600 hover:bg-blue-700 h-10"
          onClick={handleGenerate}
          disabled={generating || totalQuestions === 0}
        >
          {generating ? (
            <>
              <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
              문제 생성 중... ({totalQuestions}문제)
            </>
          ) : (
            <>
              <Layers className="w-4 h-4 mr-1.5" />
              {totalQuestions > 0 ? `${totalQuestions}문제 생성하기` : "유형과 개수를 선택하세요"}
            </>
          )}
        </Button>

        {/* Generation progress */}
        <GenerationProgress
          generating={generating}
          activeTypes={activeTypes}
          typeCounts={typeCounts}
          generationProgress={generationProgress}
        />

        {/* Generated questions result — grouped by type */}
        <GeneratedResults
          generatedQuestions={generatedQuestions}
          onSaveQuestions={handleSaveQuestions}
        />
      </div>
    </div>
  );
}
