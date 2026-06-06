"use client";

import { useCallback, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Loader2, Save, Sparkles, Upload } from "lucide-react";
import { toast } from "sonner";

import { revokeSlotUrls, splitPdfToImages } from "@/lib/extraction/pdf-splitter";

import {
  answerShapeLabel,
  type AnalyzeResponse,
  blobToBase64,
  builtinLabel,
  CONFIDENCE_LABEL,
  DIFFICULTY_LABEL,
  mediaTypeForBlob,
  tierLabel,
} from "./custom-type-utils";

interface StagedImage {
  blob: Blob;
  previewUrl: string;
  fileName: string;
}

function Badge({ children, tone = "slate" }: { children: React.ReactNode; tone?: "slate" | "blue" | "emerald" | "amber" }) {
  const cls =
    tone === "blue"
      ? "bg-blue-50 text-blue-700"
      : tone === "emerald"
        ? "bg-emerald-50 text-emerald-700"
        : tone === "amber"
          ? "bg-amber-50 text-amber-700"
          : "bg-slate-100 text-slate-600";
  return <span className={`rounded-md px-2 py-0.5 text-[11.5px] font-semibold ${cls}`}>{children}</span>;
}

export function CustomTypeCreatePanel({ onCreated }: { onCreated: () => void }) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [staged, setStaged] = useState<StagedImage | null>(null);
  const [gradeInfo, setGradeInfo] = useState("고3");
  const [analyzing, setAnalyzing] = useState(false);
  const [draft, setDraft] = useState<AnalyzeResponse | null>(null);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearStaged = useCallback(() => {
    setStaged((cur) => {
      if (cur) URL.revokeObjectURL(cur.previewUrl);
      return null;
    });
    setDraft(null);
    setName("");
    setError(null);
  }, []);

  const pickFile = useCallback(async (file: File) => {
    setError(null);
    setDraft(null);
    try {
      let blob: Blob = file;
      if (file.type === "application/pdf") {
        const slots = await splitPdfToImages(file, {});
        if (slots.length === 0) throw new Error("PDF에서 페이지를 추출하지 못했습니다.");
        if (slots.length > 1) toast.warning("여러 페이지 PDF는 첫 페이지만 사용합니다.");
        blob = slots[0].blob;
        revokeSlotUrls(slots);
      }
      const previewUrl = URL.createObjectURL(blob);
      setStaged((cur) => {
        if (cur) URL.revokeObjectURL(cur.previewUrl);
        return { blob, previewUrl, fileName: file.name };
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "파일을 준비하지 못했습니다.";
      setError(message);
      toast.error(message);
    }
  }, []);

  const analyze = useCallback(async () => {
    if (!staged) {
      toast.error("문항 이미지를 먼저 올리세요.");
      return;
    }
    setAnalyzing(true);
    setError(null);
    try {
      const data = await blobToBase64(staged.blob);
      const res = await fetch("/api/custom-question-types/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          images: [{ data, mediaType: mediaTypeForBlob(staged.blob) }],
          gradeInfo,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "분석에 실패했습니다.");
      const result = json as AnalyzeResponse;
      setDraft(result);
      setName(result.suggestedName || "커스텀 유형");
      toast.success("분석 완료 — 유형 정의를 검토하고 저장하세요.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "분석에 실패했습니다.";
      setError(message);
      toast.error(message);
    } finally {
      setAnalyzing(false);
    }
  }, [staged, gradeInfo]);

  const save = useCallback(async () => {
    if (!draft) return;
    if (!name.trim()) {
      toast.error("유형 이름을 입력하세요.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/custom-question-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: name.trim(), spec: draft.spec, source: draft.source }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "저장에 실패했습니다.");
      toast.success(`'${name.trim()}' 유형을 저장했어요.`);
      clearStaged();
      onCreated();
    } catch (err) {
      const message = err instanceof Error ? err.message : "저장에 실패했습니다.";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }, [draft, name, clearStaged, onCreated]);

  const spec = draft?.spec ?? null;

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-5">
      {/* 입력 */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-300 px-3 text-[13px] font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Upload className="size-4" />
            문항 이미지/PDF 선택
          </button>
          <label className="flex items-center gap-1.5 text-[12px] text-slate-600">
            학년
            <input
              value={gradeInfo}
              onChange={(e) => setGradeInfo(e.target.value)}
              className="w-16 rounded-md border border-slate-300 px-2 py-1 text-[12px]"
            />
          </label>
          <div className="ml-auto flex items-center gap-2">
            {staged ? (
              <button
                type="button"
                onClick={clearStaged}
                className="text-[12px] font-semibold text-slate-400 hover:text-slate-600"
              >
                초기화
              </button>
            ) : null}
            <button
              type="button"
              onClick={analyze}
              disabled={!staged || analyzing}
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-blue-600 px-4 text-[13px] font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {analyzing ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              {analyzing ? "분석 중…" : "분석"}
            </button>
          </div>
        </div>

        {staged ? (
          <div className="mt-3 overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={staged.previewUrl} alt={staged.fileName} className="max-h-72 w-full object-contain" />
          </div>
        ) : (
          <p className="mt-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-8 text-center text-[13px] text-slate-500">
            우리 엔진에 없는 유형의 문항 한 개(이미지 1장 또는 1페이지 PDF)를 올리고 분석하세요.
          </p>
        )}

        {error ? <p className="mt-2 text-[12px] text-rose-600">{error}</p> : null}
        {analyzing ? (
          <p className="mt-2 flex items-center gap-1.5 text-[12px] text-blue-600">
            <Loader2 className="size-3.5 animate-spin" /> 원본 문항을 분석해 유형 정의를 만드는 중… (수십 초 걸릴 수 있어요)
          </p>
        ) : null}
      </div>

      {/* 컴파일된 유형 정의 검토 */}
      {draft && spec ? (
        <div className="rounded-xl border border-blue-200 bg-white p-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-[13px] font-black text-slate-900">유형 정의 (검토 후 저장)</h3>
            {draft.otherQuestionCount > 0 ? (
              <span className="text-[11px] text-slate-400">
                +{draft.otherQuestionCount}개 문항은 이번엔 사용 안 함
              </span>
            ) : null}
          </div>

          <label className="mt-3 block">
            <span className="text-[11.5px] font-semibold text-slate-500">유형 이름</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 어휘 관계 짝짓기"
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-[13px]"
            />
          </label>

          <div className="mt-3 flex flex-wrap gap-1.5">
            <Badge tone={spec.tier === "BUILTIN_OVERRIDE" ? "emerald" : "blue"}>{tierLabel(spec.tier)}</Badge>
            <Badge>가까운 빌트인: {builtinLabel(spec.nearestBuiltin)}</Badge>
            <Badge>매칭 신뢰도: {CONFIDENCE_LABEL[spec.matchConfidence] ?? spec.matchConfidence}</Badge>
            <Badge>난이도: {DIFFICULTY_LABEL[spec.difficulty] ?? spec.difficulty}</Badge>
            <Badge>{answerShapeLabel(spec.answerShape)}</Badge>
            {spec.answerShape !== "SHORT_ANSWER" && spec.optionCount > 0 ? (
              <Badge>보기 {spec.optionCount}개</Badge>
            ) : null}
            <Badge>정답 {spec.correctAnswerCount}개</Badge>
            <Badge>지문 {spec.passageBased ? "있음" : "없음"}</Badge>
            {spec.multipleAnswers ? <Badge tone="amber">복수정답</Badge> : null}
          </div>

          {spec.description ? (
            <p className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-[12.5px] leading-relaxed text-slate-700">
              {spec.description}
            </p>
          ) : null}

          <button
            type="button"
            onClick={() => setShowPrompt((v) => !v)}
            className="mt-3 inline-flex items-center gap-1 text-[12px] font-semibold text-blue-500 hover:text-blue-700"
          >
            {showPrompt ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
            합성된 유형 프롬프트 {showPrompt ? "접기" : "보기"}
          </button>
          {showPrompt ? (
            <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-md bg-slate-900 p-3 text-[11px] leading-relaxed text-slate-100">
              {spec.prompt}
            </pre>
          ) : null}

          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-emerald-600 px-4 text-[13px] font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:opacity-50"
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              {saving ? "저장 중…" : "이 유형 저장"}
            </button>
          </div>
        </div>
      ) : null}

      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void pickFile(file);
          event.currentTarget.value = "";
        }}
      />
    </div>
  );
}
