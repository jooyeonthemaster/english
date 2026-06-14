"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  History,
  Loader2,
  Microscope,
  Pencil,
  Save,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { seedFormatSpecFromSpec } from "@/lib/custom-question-types/format-seed";
import {
  readCustomTypeSource,
  type CustomTypeSourcePayload,
} from "@/lib/custom-question-types/source-payload";
import { parseCompiledCustomType, type CompiledCustomType } from "@/lib/custom-question-types/types";
import { cn } from "@/lib/utils";

import { AnatomyView } from "./anatomy-view";
import { StudioView } from "./studio-view";
import { type LabTab, type LabTypeInfo, type LabVersionRow } from "./lab-types";

// 유형 실험실 — 풀스크린 오버레이. 해부 분석(원본 캡처) + 스튜디오(스펙 편집·라이브 미리보기·AI).
// 모든 편집은 workingSpec(클라이언트 상태)에만 반영되고, [버전 저장] 시에만 DB 에 새 버전이 생긴다.

const EMPTY_SOURCE: CustomTypeSourcePayload = {
  analysis: null,
  annotations: [],
  analysisJobId: null,
  analysisModel: null,
};

function formatVersionTime(iso: string): string {
  try {
    const d = new Date(iso);
    return `${d.getMonth() + 1}.${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  } catch {
    return "";
  }
}

export function CustomTypeLab({
  typeId,
  initialTab = "studio",
  onClose,
  onChanged,
}: {
  typeId: string;
  initialTab?: LabTab;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [tab, setTab] = useState<LabTab>(initialTab);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [typeInfo, setTypeInfo] = useState<LabTypeInfo | null>(null);
  const [versions, setVersions] = useState<LabVersionRow[]>([]);
  const [source, setSource] = useState<CustomTypeSourcePayload>(EMPTY_SOURCE);
  const [workingSpec, setWorkingSpec] = useState<CompiledCustomType | null>(null);
  // v1 유형(format=null)을 열면 기본 FormatSpec 을 시드해 주입 — 저장 전까지는 클라 상태일 뿐.
  const [seededFromV1, setSeededFromV1] = useState(false);
  // 마지막 로드/저장 시점의 spec 직렬화 — dirty 판정 기준(시드된 v1 은 처음부터 dirty).
  const baselineRef = useRef("");

  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [savingName, setSavingName] = useState(false);

  const [saveNote, setSaveNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/custom-question-types/${typeId}`, {
        credentials: "include",
        cache: "no-store",
      });
      const json = (await res.json().catch(() => ({}))) as {
        type?: LabTypeInfo;
        spec?: unknown;
        source?: unknown;
        versions?: LabVersionRow[];
        error?: string;
      };
      if (!res.ok) throw new Error(json?.error || "유형을 불러오지 못했습니다.");

      const spec = parseCompiledCustomType(json.spec);
      // dirty 기준은 서버 상태 그대로(v1 이면 format=null) — 시드 주입분이 자연스럽게 dirty 가 된다.
      baselineRef.current = JSON.stringify(spec);
      const seeded = !spec.format;
      setSeededFromV1(seeded);
      setWorkingSpec(seeded ? { ...spec, format: seedFormatSpecFromSpec(spec) } : spec);

      setTypeInfo(json.type ?? null);
      setNameDraft(json.type?.name ?? "");
      setVersions(json.versions ?? []);
      setSource(readCustomTypeSource(json.source));
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "유형을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [typeId]);

  useEffect(() => {
    void load();
  }, [load]);

  const dirty = workingSpec != null && JSON.stringify(workingSpec) !== baselineRef.current;
  const activeVersion = useMemo(() => versions.find((v) => v.isActive)?.version ?? null, [versions]);

  const handleClose = useCallback(() => {
    if (dirty && !window.confirm("저장하지 않은 변경이 있습니다. 닫을까요?")) return;
    onClose();
  }, [dirty, onClose]);

  // 이름 인라인 편집 — spec 버전과 무관하게 즉시 PATCH.
  const submitName = useCallback(async () => {
    const next = nameDraft.trim();
    setEditingName(false);
    if (!next || !typeInfo || next === typeInfo.name) {
      setNameDraft(typeInfo?.name ?? "");
      return;
    }
    setSavingName(true);
    try {
      const res = await fetch(`/api/custom-question-types/${typeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: next }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "이름 변경에 실패했습니다.");
      setTypeInfo((prev) => (prev ? { ...prev, name: next } : prev));
      toast.success("유형 이름을 변경했어요.");
      onChanged();
    } catch (err) {
      setNameDraft(typeInfo.name);
      toast.error(err instanceof Error ? err.message : "이름 변경에 실패했습니다.");
    } finally {
      setSavingName(false);
    }
  }, [nameDraft, typeId, typeInfo, onChanged]);

  // [버전 저장] — workingSpec 전체를 새 버전으로 활성화.
  const saveVersion = useCallback(async () => {
    if (!workingSpec || saving) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/custom-question-types/${typeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          spec: workingSpec,
          ...(saveNote.trim() ? { note: saveNote.trim() } : {}),
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { version?: number; error?: string };
      if (!res.ok) throw new Error(json?.error || "저장에 실패했습니다.");
      baselineRef.current = JSON.stringify(workingSpec);
      setSeededFromV1(false);
      setSaveNote("");
      toast.success(json.version ? `v${json.version} 으로 저장했어요.` : "저장했어요.");
      onChanged();
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }, [workingSpec, saving, typeId, saveNote, onChanged, load]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      {/* ── 헤더: 이름(인라인 편집) · 버전 · 더티 · 탭 · 이력 · 버전 저장 · 닫기 ── */}
      <header className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-slate-200 bg-white px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <Microscope className="size-4 shrink-0 text-blue-600" />
          {editingName ? (
            <input
              value={nameDraft}
              autoFocus
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={() => void submitName()}
              onKeyDown={(e) => {
                if (e.key === "Enter") void submitName();
                if (e.key === "Escape") {
                  setNameDraft(typeInfo?.name ?? "");
                  setEditingName(false);
                }
              }}
              className="w-56 rounded-md border border-blue-300 px-2 py-1 text-[13px] font-bold text-slate-900 outline-none"
            />
          ) : (
            <button
              type="button"
              onClick={() => setEditingName(true)}
              disabled={!typeInfo || savingName}
              className="group flex min-w-0 items-center gap-1.5 rounded-md px-1 py-0.5 text-left hover:bg-slate-50"
              title="이름 수정"
            >
              <span className="truncate text-[14px] font-black text-slate-900">
                {typeInfo?.name ?? "유형 실험실"}
              </span>
              {savingName ? (
                <Loader2 className="size-3 shrink-0 animate-spin text-slate-400" />
              ) : (
                <Pencil className="size-3 shrink-0 text-slate-300 group-hover:text-slate-500" />
              )}
            </button>
          )}
          {activeVersion != null ? (
            <span className="shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-bold text-slate-600">
              v{activeVersion}
            </span>
          ) : null}
          {dirty ? (
            <span className="shrink-0 rounded-full bg-blue-50 px-2 py-0.5 text-[10.5px] font-semibold text-blue-600">
              저장 안 된 변경
            </span>
          ) : null}
          {seededFromV1 ? (
            <span className="hidden shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10.5px] font-semibold text-slate-500 lg:inline">
              기본 형식 스펙을 생성했습니다 — 저장 시 v2 로 업그레이드
            </span>
          ) : null}
        </div>

        {/* 탭 전환 */}
        <div className="flex shrink-0 rounded-lg border border-slate-200 bg-slate-50 p-0.5">
          {(
            [
              { value: "anatomy" as const, label: "해부 분석", icon: Microscope },
              { value: "studio" as const, label: "스튜디오", icon: SlidersHorizontal },
            ]
          ).map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setTab(t.value)}
              className={cn(
                "inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[12px] font-bold transition-colors",
                tab === t.value ? "bg-white text-blue-700 shadow-sm" : "text-slate-500 hover:text-slate-700",
              )}
            >
              <t.icon className="size-3.5" />
              {t.label}
            </button>
          ))}
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {/* 버전 이력(읽기 전용) */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setHistoryOpen((v) => !v)}
              className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-[11.5px] font-semibold text-slate-600 transition-colors hover:border-blue-200 hover:text-blue-700"
            >
              <History className="size-3.5" />
              이력
            </button>
            {historyOpen ? (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setHistoryOpen(false)} />
                <div className="absolute right-0 top-full z-20 mt-1 max-h-80 w-80 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
                  {versions.length === 0 ? (
                    <p className="px-2 py-4 text-center text-[11.5px] text-slate-400">버전이 없습니다.</p>
                  ) : (
                    <ul className="space-y-1">
                      {versions.map((v) => (
                        <li key={v.id} className="flex items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50">
                          <span
                            className={cn(
                              "mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10.5px] font-bold",
                              v.isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500",
                            )}
                          >
                            v{v.version}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-[11.5px] leading-snug text-slate-700">{v.note || "최초 생성"}</p>
                            <p className="text-[10px] text-slate-400">{formatVersionTime(v.createdAt)}</p>
                          </div>
                          {v.isActive ? <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-500" /> : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            ) : null}
          </div>

          <input
            value={saveNote}
            onChange={(e) => setSaveNote(e.target.value)}
            placeholder="버전 노트(선택)"
            className="hidden h-8 w-36 rounded-lg border border-slate-200 px-2.5 text-[11.5px] text-slate-700 placeholder:text-slate-300 md:block"
          />
          <button
            type="button"
            onClick={() => void saveVersion()}
            disabled={saving || !workingSpec}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 text-[12px] font-bold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
            {saving ? "저장 중…" : "버전 저장"}
          </button>
          <button
            type="button"
            onClick={handleClose}
            className="flex size-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
            aria-label="닫기"
          >
            <X className="size-4" />
          </button>
        </div>
      </header>

      {/* ── 본문 ── */}
      <div className="min-h-0 flex-1 overflow-hidden bg-white">
        {loading ? (
          <div className="flex h-full items-center justify-center gap-2 text-[13px] text-slate-400">
            <Loader2 className="size-4 animate-spin" />
            유형을 불러오는 중…
          </div>
        ) : loadError || !workingSpec ? (
          <div className="flex h-full flex-col items-center justify-center gap-3">
            <p className="text-[13px] text-red-500">{loadError ?? "유형을 불러오지 못했습니다."}</p>
            <button
              type="button"
              onClick={() => void load()}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-[12px] font-semibold text-slate-600 hover:border-blue-200 hover:text-blue-700"
            >
              다시 시도
            </button>
          </div>
        ) : tab === "anatomy" ? (
          <AnatomyView source={source} spec={workingSpec} onGoStudio={() => setTab("studio")} />
        ) : (
          <StudioView typeId={typeId} spec={workingSpec} onSpecChange={setWorkingSpec} />
        )}
      </div>
    </div>
  );
}
