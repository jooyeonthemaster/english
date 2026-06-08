"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Loader2, Save, Wand2, X } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";

import {
  answerShapeLabel,
  builtinLabel,
  CONFIDENCE_LABEL,
  DIFFICULTY_LABEL,
  tierLabel,
} from "./custom-type-utils";

type AnswerShape = "MULTIPLE_CHOICE" | "SHORT_ANSWER" | "OTHER";
type Difficulty = "BASIC" | "INTERMEDIATE" | "KILLER";

interface FullSpec {
  tier: string;
  nearestBuiltin: string | null;
  matchConfidence: string;
  answerShape: AnswerShape;
  optionCount: number;
  correctAnswerCount: number;
  multipleAnswers: boolean;
  passageBased: boolean;
  difficulty: Difficulty;
  targetPoints: string[];
  invariants: string[];
  variableAxes: string[];
  prompt: string;
  description: string;
}

interface VersionRow {
  id: string;
  version: number;
  note: string | null;
  createdAt: string;
  isActive: boolean;
}

// version.source = QuestionAnalysis. 그 안의 .source 가 원본 문항의 발문/지문/보기/정답/해설.
interface OriginalSource {
  source?: {
    direction?: string;
    passage?: string | null;
    options?: Array<{ label: string; text: string; isCorrect?: boolean }>;
    correctAnswerLabels?: string[];
    originalExplanation?: string | null;
  };
}

interface FormSnapshot {
  name: string;
  answerShape: AnswerShape;
  optionCount: number;
  correctAnswerCount: number;
  multipleAnswers: boolean;
  passageBased: boolean;
  difficulty: Difficulty;
}

export function CustomTypeReviseModal({
  typeId,
  typeName,
  onClose,
  onRevised,
}: {
  typeId: string;
  typeName: string;
  onClose: () => void;
  onRevised: () => void;
}) {
  const [spec, setSpec] = useState<FullSpec | null>(null);
  const [original, setOriginal] = useState<OriginalSource | null>(null);
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [loading, setLoading] = useState(false);

  // 직접 편집 폼 + 로드 스냅샷(dirty 비교용)
  const [name, setName] = useState(typeName);
  const [answerShape, setAnswerShape] = useState<AnswerShape>("MULTIPLE_CHOICE");
  const [optionCount, setOptionCount] = useState(5);
  const [correctAnswerCount, setCorrectAnswerCount] = useState(1);
  const [multipleAnswers, setMultipleAnswers] = useState(false);
  const [passageBased, setPassageBased] = useState(true);
  const [difficulty, setDifficulty] = useState<Difficulty>("INTERMEDIATE");
  const [loaded, setLoaded] = useState<FormSnapshot | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);

  const [showPrompt, setShowPrompt] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [applying, setApplying] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/custom-question-types/${typeId}`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) return;
      const json = (await res.json()) as {
        type?: { name?: string };
        spec?: FullSpec;
        source?: OriginalSource;
        versions?: VersionRow[];
      };
      const s = json.spec ?? null;
      setSpec(s);
      setOriginal(json.source ?? null);
      setVersions(json.versions ?? []);
      const nm = json.type?.name ?? typeName;
      setName(nm);
      if (s) {
        setAnswerShape(s.answerShape);
        setOptionCount(s.optionCount);
        setCorrectAnswerCount(s.correctAnswerCount);
        setMultipleAnswers(s.multipleAnswers);
        setPassageBased(s.passageBased);
        setDifficulty(s.difficulty);
        setLoaded({
          name: nm,
          answerShape: s.answerShape,
          optionCount: s.optionCount,
          correctAnswerCount: s.correctAnswerCount,
          multipleAnswers: s.multipleAnswers,
          passageBased: s.passageBased,
          difficulty: s.difficulty,
        });
      }
    } finally {
      setLoading(false);
    }
  }, [typeId, typeName]);

  useEffect(() => {
    void load();
  }, [load]);

  const isMc = answerShape === "MULTIPLE_CHOICE";
  const settingsDirty =
    loaded != null &&
    (name.trim() !== loaded.name ||
      answerShape !== loaded.answerShape ||
      optionCount !== loaded.optionCount ||
      correctAnswerCount !== loaded.correctAnswerCount ||
      multipleAnswers !== loaded.multipleAnswers ||
      passageBased !== loaded.passageBased ||
      difficulty !== loaded.difficulty);

  const saveSettings = useCallback(async () => {
    if (!name.trim()) {
      toast.error("이름을 입력하세요.");
      return;
    }
    setSavingSettings(true);
    try {
      const res = await fetch(`/api/custom-question-types/${typeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: name.trim(),
          answerShape,
          optionCount,
          correctAnswerCount,
          multipleAnswers,
          passageBased,
          difficulty,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "수정에 실패했습니다.");
      toast.success(json.version ? `설정 저장 — v${json.version}` : "설정을 저장했어요.");
      // 낙관적 dirty 클리어(후속 GET 실패해도 stale-dirty 안 남게). load() 가 클램프값까지 정확히 재동기.
      setLoaded({
        name: name.trim(),
        answerShape,
        optionCount,
        correctAnswerCount,
        multipleAnswers,
        passageBased,
        difficulty,
      });
      await load();
      onRevised();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "수정에 실패했습니다.");
    } finally {
      setSavingSettings(false);
    }
  }, [
    typeId,
    name,
    answerShape,
    optionCount,
    correctAnswerCount,
    multipleAnswers,
    passageBased,
    difficulty,
    load,
    onRevised,
  ]);

  const applyAi = useCallback(async () => {
    const text = instruction.trim();
    if (text.length < 2) {
      toast.error("수정 요청을 입력하세요.");
      return;
    }
    setApplying(true);
    try {
      const res = await fetch(`/api/custom-question-types/${typeId}/revise`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ instruction: text }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "수정에 실패했습니다.");
      toast.success(`v${json.version} 으로 수정했어요.`);
      setInstruction("");
      await load();
      onRevised();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "수정에 실패했습니다.");
    } finally {
      setApplying(false);
    }
  }, [instruction, typeId, load, onRevised]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[88vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
          <h3 className="truncate text-[14px] font-black text-slate-900">유형 상세 · 수정</h3>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto shrink-0 text-slate-400 hover:text-slate-600"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
          {loading && !spec ? (
            <p className="py-8 text-center text-[12.5px] text-slate-400">
              <Loader2 className="mr-1 inline size-4 animate-spin" /> 불러오는 중…
            </p>
          ) : (
            <>
              {/* ── 기본 설정: 프롬프트 변경 없이 직접 수정 ── */}
              <section>
                <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">
                  기본 설정 (AI 없이 직접 수정)
                </p>
                <div className="space-y-2.5 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                  {spec?.tier === "BUILTIN_OVERRIDE" ? (
                    <p className="rounded-md bg-amber-50 px-2 py-1.5 text-[11px] leading-relaxed text-amber-700">
                      이 유형은 빌트인 엔진 구조를 따라 보기/정답 수·답형 편집이 생성에 반영되지 않습니다(난이도·이름만
                      반영).
                    </p>
                  ) : null}
                  <label className="flex items-center justify-between gap-2 text-[12px] text-slate-600">
                    이름
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-56 rounded-md border border-slate-300 px-2 py-1 text-[12px]"
                    />
                  </label>
                  <label className="flex items-center justify-between gap-2 text-[12px] text-slate-600">
                    답형
                    <select
                      value={answerShape}
                      onChange={(e) => setAnswerShape(e.target.value as AnswerShape)}
                      className="w-56 rounded-md border border-slate-300 px-2 py-1 text-[12px]"
                    >
                      <option value="MULTIPLE_CHOICE">객관식</option>
                      <option value="SHORT_ANSWER">서술형/단답</option>
                      <option value="OTHER">기타</option>
                    </select>
                  </label>
                  <label
                    className={cn(
                      "flex items-center justify-between gap-2 text-[12px]",
                      isMc ? "text-slate-600" : "text-slate-300",
                    )}
                  >
                    보기 수
                    <input
                      type="number"
                      min={0}
                      max={20}
                      disabled={!isMc}
                      value={optionCount}
                      onChange={(e) =>
                        setOptionCount(Math.min(20, Math.max(0, Number(e.target.value) || 0)))
                      }
                      className="w-56 rounded-md border border-slate-300 px-2 py-1 text-[12px] disabled:bg-slate-100"
                    />
                  </label>
                  <label
                    className={cn(
                      "flex items-center justify-between gap-2 text-[12px]",
                      isMc ? "text-slate-600" : "text-slate-300",
                    )}
                  >
                    정답 수
                    <input
                      type="number"
                      min={1}
                      max={20}
                      disabled={!isMc}
                      value={correctAnswerCount}
                      onChange={(e) =>
                        setCorrectAnswerCount(Math.min(20, Math.max(1, Number(e.target.value) || 1)))
                      }
                      className="w-56 rounded-md border border-slate-300 px-2 py-1 text-[12px] disabled:bg-slate-100"
                    />
                  </label>
                  <label
                    className={cn(
                      "flex items-center justify-between gap-2 text-[12px]",
                      isMc ? "text-slate-600" : "text-slate-300",
                    )}
                  >
                    복수 정답
                    <input
                      type="checkbox"
                      disabled={!isMc}
                      checked={multipleAnswers}
                      onChange={(e) => setMultipleAnswers(e.target.checked)}
                      className="size-4"
                    />
                  </label>
                  <label className="flex items-center justify-between gap-2 text-[12px] text-slate-600">
                    지문 기반
                    <input
                      type="checkbox"
                      checked={passageBased}
                      onChange={(e) => setPassageBased(e.target.checked)}
                      className="size-4"
                    />
                  </label>
                  <label className="flex items-center justify-between gap-2 text-[12px] text-slate-600">
                    난이도
                    <select
                      value={difficulty}
                      onChange={(e) => setDifficulty(e.target.value as Difficulty)}
                      className="w-56 rounded-md border border-slate-300 px-2 py-1 text-[12px]"
                    >
                      <option value="BASIC">기본</option>
                      <option value="INTERMEDIATE">중급</option>
                      <option value="KILLER">킬러</option>
                    </select>
                  </label>
                  <div className="flex justify-end pt-1">
                    <button
                      type="button"
                      onClick={saveSettings}
                      disabled={!settingsDirty || savingSettings}
                      className="inline-flex h-9 items-center gap-1.5 rounded-md bg-slate-800 px-4 text-[13px] font-semibold text-white shadow-sm transition-colors hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {savingSettings ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Save className="size-4" />
                      )}
                      {savingSettings ? "저장 중…" : "설정 저장"}
                    </button>
                  </div>
                </div>
              </section>

              {/* ── 유형 정보 (읽기전용) ── */}
              {spec ? (
                <section>
                  <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">
                    유형 정보
                  </p>
                  <div className="space-y-3 rounded-lg border border-slate-200 p-3">
                    <div className="flex flex-wrap gap-1.5">
                      <Badge>{tierLabel(spec.tier)}</Badge>
                      <Badge>가까운 빌트인: {builtinLabel(spec.nearestBuiltin)}</Badge>
                      <Badge>매칭: {CONFIDENCE_LABEL[spec.matchConfidence] ?? spec.matchConfidence}</Badge>
                      <Badge>{answerShapeLabel(spec.answerShape)}</Badge>
                      <Badge>난이도: {DIFFICULTY_LABEL[spec.difficulty] ?? spec.difficulty}</Badge>
                    </div>
                    {spec.description ? (
                      <p className="rounded-md bg-slate-50 px-3 py-2 text-[12.5px] leading-relaxed text-slate-700">
                        {spec.description}
                      </p>
                    ) : null}
                    <DefList label="반드시 보존 (invariants)" items={spec.invariants} />
                    <DefList label="매번 가변 (variableAxes)" items={spec.variableAxes} />
                    <button
                      type="button"
                      onClick={() => setShowPrompt((v) => !v)}
                      className="inline-flex items-center gap-1 text-[12px] font-semibold text-blue-500 hover:text-blue-700"
                    >
                      {showPrompt ? (
                        <ChevronUp className="size-3.5" />
                      ) : (
                        <ChevronDown className="size-3.5" />
                      )}
                      생성 프롬프트 {showPrompt ? "접기" : "보기"}
                    </button>
                    {showPrompt ? (
                      <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-words rounded-md bg-slate-900 p-3 text-[11px] leading-relaxed text-slate-100">
                        {spec.prompt}
                      </pre>
                    ) : null}
                  </div>
                </section>
              ) : null}

              {/* ── 참조한 원본 문제 ── */}
              {original?.source ? (
                <section>
                  <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">
                    참조한 원본 문제
                  </p>
                  <div className="space-y-2 rounded-lg border border-slate-200 p-3">
                    {original.source.direction ? (
                      <p className="text-[12.5px] font-semibold text-slate-800">
                        {original.source.direction}
                      </p>
                    ) : null}
                    {original.source.passage ? (
                      <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md bg-slate-50 p-2 text-[11.5px] leading-relaxed text-slate-700">
                        {original.source.passage}
                      </pre>
                    ) : null}
                    {original.source.options && original.source.options.length > 0 ? (
                      <ol className="space-y-0.5">
                        {original.source.options.map((o, i) => {
                          const correct =
                            o.isCorrect ||
                            (original.source?.correctAnswerLabels ?? []).includes(o.label);
                          return (
                            <li
                              key={i}
                              className={cn(
                                "rounded px-1.5 py-0.5 text-[11.5px] leading-relaxed",
                                correct
                                  ? "bg-emerald-50 font-semibold text-emerald-700"
                                  : "text-slate-700",
                              )}
                            >
                              {o.label}. {o.text}
                            </li>
                          );
                        })}
                      </ol>
                    ) : null}
                    {original.source.correctAnswerLabels &&
                    original.source.correctAnswerLabels.length > 0 ? (
                      <p className="text-[11px]">
                        <span className="font-bold text-slate-700">정답: </span>
                        <span className="text-blue-700">
                          {original.source.correctAnswerLabels.join(", ")}
                        </span>
                      </p>
                    ) : null}
                    {original.source.originalExplanation ? (
                      <div className="rounded-md bg-amber-50/60 p-2 text-[11px] leading-relaxed text-slate-700">
                        <span className="font-bold">해설: </span>
                        {original.source.originalExplanation}
                      </div>
                    ) : null}
                  </div>
                </section>
              ) : null}

              {/* ── AI 수정 (자연어) ── */}
              <section>
                <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">
                  AI 수정 (자연어 — 본질·지시문)
                </p>
                <div className="rounded-lg border border-blue-200 bg-blue-50/40 p-3">
                  <textarea
                    value={instruction}
                    onChange={(e) => setInstruction(e.target.value)}
                    placeholder="예: 오답을 더 어렵게 만들어줘 / 해설을 더 자세히 / 함정 선지를 추가해줘"
                    rows={3}
                    className="w-full resize-none rounded-md border border-slate-300 px-3 py-2 text-[12.5px]"
                  />
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <p className="text-[10.5px] leading-tight text-slate-400">
                      구조는 위 설정에서, 본질·지시문은 여기서. 매 수정은 새 버전으로 기록됩니다.
                    </p>
                    <button
                      type="button"
                      onClick={applyAi}
                      disabled={applying || instruction.trim().length < 2}
                      className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-blue-600 px-4 text-[13px] font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {applying ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Wand2 className="size-4" />
                      )}
                      {applying ? "수정 중…" : "AI 수정 적용"}
                    </button>
                  </div>
                </div>
              </section>

              {/* ── 버전 이력 ── */}
              {versions.length > 0 ? (
                <section>
                  <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">
                    버전 이력
                  </p>
                  <ul className="space-y-1">
                    {versions.map((v) => (
                      <li key={v.id} className="flex items-start gap-2 text-[11.5px]">
                        <span
                          className={cn(
                            "shrink-0 rounded px-1.5 py-0.5 font-bold",
                            v.isActive
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-slate-100 text-slate-500",
                          )}
                        >
                          v{v.version}
                          {v.isActive ? " ·활성" : ""}
                        </span>
                        <span className="leading-relaxed text-slate-600">
                          {v.note || "최초 생성"}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
      {children}
    </span>
  );
}

function DefList({ label, items }: { label: string; items: string[] }) {
  return (
    <div>
      <p className="mb-1 text-[11px] font-bold text-slate-500">{label}</p>
      {items.length ? (
        <ul className="space-y-0.5">
          {items.map((it, k) => (
            <li key={k} className="text-[12px] leading-relaxed text-slate-700">
              • {it}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[12px] text-slate-400">(없음)</p>
      )}
    </div>
  );
}
