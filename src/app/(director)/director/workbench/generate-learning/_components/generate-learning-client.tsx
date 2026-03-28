"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Sparkles, ArrowLeft, ChevronRight, X } from "lucide-react";
import { PassageSelector, type PassageItem } from "./passage-selector";
import { CategoryConfig, getTargetCounts } from "./category-config";
import { GenerationResults } from "./generation-results";
import { saveNaeshinQuestions } from "@/actions/learning-questions";
import {
  SUBTYPE_TO_CATEGORY,
  SUBTYPE_TO_INTERACTION,
  LEARNING_SUBTYPE_LABELS,
} from "@/lib/learning-constants";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GeneratedQuestion {
  _typeId: string;
  _typeLabel: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

type Step = "select-passage" | "configure" | "results";

export function GenerateLearningClient({ academyId }: { academyId: string }) {
  const router = useRouter();

  const [step, setStep] = useState<Step>("select-passage");
  const [selectedPassage, setSelectedPassage] = useState<PassageItem | null>(null);
  const [typeCounts, setTypeCounts] = useState<Record<string, number>>({});
  const [generating, setGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState<Record<string, "pending" | "done" | "error">>({});
  const [generatedQuestions, setGeneratedQuestions] = useState<GeneratedQuestion[] | null>(null);
  const [autoFill, setAutoFill] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);

  const totalQuestions = Object.values(typeCounts).reduce((a, b) => a + b, 0);

  const handlePassageSelect = (p: PassageItem) => {
    setSelectedPassage(p);
    setStep("configure");
  };

  const handleTypeCountChange = (id: string, count: number) => {
    setTypeCounts((prev) => {
      const next = { ...prev };
      if (count <= 0) delete next[id];
      else next[id] = count;
      return next;
    });
  };

  const handleToggleAutoFill = () => {
    if (autoFill) {
      setAutoFill(false);
      setTypeCounts({});
    } else {
      setAutoFill(true);
      setTypeCounts(getTargetCounts());
    }
  };

  // 결과 파싱 헬퍼
  const parseQuestions = (data: Record<string, unknown>): GeneratedQuestion[] => {
    const questions: GeneratedQuestion[] = [];
    for (const [typeId, items] of Object.entries(data.results || {})) {
      for (const item of items as Record<string, unknown>[]) {
        questions.push({ ...item, _typeId: typeId, _typeLabel: LEARNING_SUBTYPE_LABELS[typeId] || typeId });
      }
    }
    return questions;
  };

  // 카테고리별 4번 병렬 호출
  const handleGenerate = async () => {
    if (!selectedPassage || totalQuestions === 0) return;
    setGenerating(true);
    setGeneratedQuestions(null);
    setStep("results");

    const byCategory: Record<string, Record<string, number>> = {};
    for (const [typeId, count] of Object.entries(typeCounts)) {
      if (count <= 0) continue;
      const cat = SUBTYPE_TO_CATEGORY[typeId] || "VOCAB";
      if (!byCategory[cat]) byCategory[cat] = {};
      byCategory[cat][typeId] = count;
    }

    const progress: Record<string, "pending" | "done" | "error"> = {};
    Object.keys(byCategory).forEach((cat) => { progress[cat] = "pending"; });
    setGenerationProgress({ ...progress });

    try {
      const promises = Object.entries(byCategory).map(async ([category, counts]) => {
        try {
          const res = await fetch("/api/ai/generate-learning-question", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ passageId: selectedPassage.id, category, counts }),
          });
          const data = await res.json();
          if (data.error) {
            setGenerationProgress((prev) => ({ ...prev, [category]: "error" }));
            return [];
          }
          setGenerationProgress((prev) => ({ ...prev, [category]: "done" }));
          return parseQuestions(data);
        } catch {
          setGenerationProgress((prev) => ({ ...prev, [category]: "error" }));
          return [];
        }
      });

      const results = await Promise.all(promises);
      const allQuestions = results.flat();
      setGeneratedQuestions(allQuestions);
      if (allQuestions.length > 0) toast.success(`${allQuestions.length}개 학습 문제 생성 완료`);
    } catch {
      toast.error("생성 실패");
    } finally {
      setGenerating(false);
    }
  };

  const handleSaveWithSet = async (setInfo: { publisher: string; textbook?: string; grade?: number; unit?: string }) => {
    if (!generatedQuestions || !selectedPassage) return;
    setSaving(true);

    try {
      const questionsToSave = generatedQuestions.map((q) => ({
        passageId: selectedPassage.id,
        type: SUBTYPE_TO_INTERACTION[q._typeId] || "FOUR_CHOICE",
        subType: q._typeId || null,
        questionText: JSON.stringify(
          Object.fromEntries(
            Object.entries(q).filter(([k]) => !k.startsWith("_") && k !== "explanation" && k !== "correctAnswer"),
          ),
        ),
        options: null,
        correctAnswer: String(q.correctAnswer ?? q.isTrue ?? q.isCorrect ?? ""),
        difficulty: "INTERMEDIATE",
        tags: null,
        explanation: typeof q.explanation === "string" ? q.explanation : null,
        keyPoints: null,
        wrongOptionExplanations: null,
      }));

      const result = await saveNaeshinQuestions(questionsToSave, {
        passageId: selectedPassage.id,
        publisher: setInfo.publisher,
        textbook: setInfo.textbook,
        grade: setInfo.grade,
        unit: setInfo.unit,
        title: selectedPassage.title,
      });

      if (result.success) {
        toast.success("학습 문제가 저장되었습니다.");
        router.push("/director/learning-questions");
      } else {
        toast.error(result.error || "저장 실패");
      }
    } catch {
      toast.error("저장 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
      setShowSaveModal(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/director/workbench" className="flex items-center justify-center w-9 h-9 rounded-xl hover:bg-slate-100 transition-colors">
          <ArrowLeft className="w-4 h-4 text-slate-500" />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-blue-600" />
            학습 문제 생성
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">학원 지문을 기반으로 학습 문제를 AI로 대량 생성합니다.</p>
        </div>
        <div className="flex items-center gap-2 text-[12px]">
          {(["select-passage", "configure", "results"] as const).map((s, i) => (
            <span key={s}>
              {i > 0 && <ChevronRight className="w-3 h-3 text-slate-300 inline mr-2" />}
              <span className={`px-3 py-1.5 rounded-full font-medium transition-all ${step === s ? "bg-blue-100 text-blue-700" : "text-slate-400"}`}>
                {i + 1}. {["지문 선택", "카테고리 설정", "결과"][i]}
              </span>
            </span>
          ))}
        </div>
      </div>

      {step === "select-passage" && (
        <PassageSelector mode="NAESHIN" academyId={academyId} onSelect={handlePassageSelect} />
      )}

      {step === "configure" && selectedPassage && (
        <CategoryConfig
          selectedPassage={selectedPassage}
          typeCounts={typeCounts}
          autoFill={autoFill}
          onTypeCountChange={handleTypeCountChange}
          onResetAll={() => setTypeCounts({})}
          onToggleAutoFill={handleToggleAutoFill}
          onBack={() => { setStep("select-passage"); setSelectedPassage(null); }}
          onGenerate={handleGenerate}
          totalQuestions={totalQuestions}
        />
      )}

      {step === "results" && (
        <GenerationResults
          generating={generating}
          generationProgress={generationProgress}
          generatedQuestions={generatedQuestions}
          onSave={() => setShowSaveModal(true)}
          onBack={() => { setStep("configure"); setGeneratedQuestions(null); }}
          saving={saving}
        />
      )}

      {/* 저장 모달: 출판사/학년/교재 입력 */}
      {showSaveModal && (
        <SaveModal
          passageTitle={selectedPassage?.title || ""}
          onSave={handleSaveWithSet}
          onClose={() => setShowSaveModal(false)}
          saving={saving}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Save Modal
// ---------------------------------------------------------------------------

function SaveModal({ passageTitle, onSave, onClose, saving }: {
  passageTitle: string;
  onSave: (data: { publisher: string; textbook?: string; grade?: number; unit?: string }) => void;
  onClose: () => void;
  saving: boolean;
}) {
  const [publisher, setPublisher] = useState("");
  const [textbook, setTextbook] = useState("");
  const [grade, setGrade] = useState("");
  const [unit, setUnit] = useState("");

  const canSave = publisher.trim().length > 0;

  const PUBLISHER_PRESETS = [
    "능률(김)", "능률(양)", "비상(김)", "비상(홍)", "금성", "지학사", "천재(이)", "천재(정)", "YBM(박)", "YBM(한)", "동아(윤)", "동아(이)",
  ];

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h3 className="text-base font-bold text-slate-900">학습 세트 정보</h3>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded-lg"><X className="w-4 h-4 text-slate-400" /></button>
        </div>

        <div className="px-5 pb-5 space-y-4">
          <p className="text-[12px] text-slate-500 -mt-1">
            저장할 문제 세트의 출판사/교재 정보를 입력하세요.
          </p>

          {/* 출판사 (필수) */}
          <div>
            <label className="text-[12px] font-semibold text-slate-700 block mb-1.5">출판사 <span className="text-red-400">*</span></label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {PUBLISHER_PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPublisher(p)}
                  className={`text-[11px] px-2.5 py-1 rounded-lg border transition-all ${
                    publisher === p
                      ? "bg-blue-50 border-blue-300 text-blue-700 font-semibold"
                      : "bg-white border-slate-200 text-slate-500 hover:border-slate-300"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
            <input
              value={publisher}
              onChange={(e) => setPublisher(e.target.value)}
              placeholder="직접 입력"
              className="w-full h-9 px-3 text-[13px] rounded-lg border border-slate-200 bg-slate-50 outline-none focus:border-blue-400"
            />
          </div>

          {/* 학년 */}
          <div>
            <label className="text-[12px] font-semibold text-slate-700 block mb-1.5">학년</label>
            <div className="flex gap-2">
              {[1, 2, 3].map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setGrade(grade === String(g) ? "" : String(g))}
                  className={`flex-1 h-9 rounded-lg border text-[13px] font-medium transition-all ${
                    grade === String(g)
                      ? "bg-blue-50 border-blue-300 text-blue-700"
                      : "bg-white border-slate-200 text-slate-500 hover:border-slate-300"
                  }`}
                >
                  {g}학년
                </button>
              ))}
            </div>
          </div>

          {/* 교재명 */}
          <div>
            <label className="text-[12px] font-semibold text-slate-700 block mb-1.5">교재명</label>
            <input
              value={textbook}
              onChange={(e) => setTextbook(e.target.value)}
              placeholder="예: 영어1, 영어2, 영독해와 작문"
              className="w-full h-9 px-3 text-[13px] rounded-lg border border-slate-200 bg-slate-50 outline-none focus:border-blue-400"
            />
          </div>

          {/* 단원 */}
          <div>
            <label className="text-[12px] font-semibold text-slate-700 block mb-1.5">단원/과</label>
            <input
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="예: Lesson 3, 1과"
              className="w-full h-9 px-3 text-[13px] rounded-lg border border-slate-200 bg-slate-50 outline-none focus:border-blue-400"
            />
          </div>

          {/* 지문 제목 표시 */}
          <div className="bg-slate-50 rounded-lg px-3 py-2">
            <span className="text-[10px] text-slate-400 font-semibold block mb-0.5">지문</span>
            <p className="text-[12px] text-slate-600 truncate">{passageTitle}</p>
          </div>

          {/* 저장 버튼 */}
          <button
            onClick={() => onSave({
              publisher: publisher.trim(),
              textbook: textbook.trim() || undefined,
              grade: grade ? Number(grade) : undefined,
              unit: unit.trim() || undefined,
            })}
            disabled={!canSave || saving}
            className="w-full h-11 rounded-xl text-[14px] font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {saving ? "저장 중..." : "학습 문제 저장"}
          </button>
        </div>
      </div>
    </div>
  );
}
