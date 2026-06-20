"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  applyAiEditToQuestion,
  getQuestionForAiEdit,
  saveAiEditedAsNew,
} from "@/actions/workbench/question-ai-edit";

type Rec = Record<string, unknown>;

export interface EditChange {
  field: string;
  label: string;
  kind: "added" | "removed" | "changed" | "reordered";
}

export interface DetailedDiffEntry {
  id: string;
  category: string;
  ref?: string;
  kind: "added" | "removed" | "changed" | "reordered";
  before?: string;
  after?: string;
  note?: string;
  /** 수정본 미리보기의 변경 마크용 — 렌더러 blockId. */
  blockId?: string;
}

export interface EditQualityWarning {
  code: string;
  message: string;
  severity: string;
}

export interface EditVersion {
  id: number;
  /** 모델에 전달된 합성 지시(전문). */
  instruction: string;
  /** 버전 칩 표시용 짧은 라벨(자유 프롬프트 또는 지시 요약). */
  label: string;
  after: Rec;
  changes: EditChange[];
  detailedChanges: DetailedDiffEntry[];
  warnings: EditQualityWarning[];
  questionText: string;
  /** 모델이 서술한 "요청대로 무엇을 어떻게 바꿨는지" 한국어 변경 요약. */
  editSummary: string;
  acceptedWithWarnings: boolean;
}

/** submit 시 함께 전달할 구조화 옵션. */
export interface SubmitOptions {
  /** 사용자가 클릭으로 지정한 수정 대상 블럭(백엔드 프롬프트 타깃 섹션). */
  targets?: { label: string; field?: string }[];
  /** 버전 칩 표시용 짧은 라벨. */
  label?: string;
}

export interface EditContext {
  subType: string;
  type: string;
  difficulty: string;
  passageContent: string;
  passageTitle: string | null;
  before: Rec;
}

interface UseQuestionAiEditOptions {
  questionId: string;
  /** 적용(덮어쓰기) 성공 후 콜백 — 폼 새로고침 등. */
  onApplied?: () => void;
  /** 새 문제로 저장 성공 후 콜백(새 questionId 전달). */
  onSavedAsNew?: (newQuestionId: string) => void;
}

export function useQuestionAiEdit({
  questionId,
  onApplied,
  onSavedAsNew,
}: UseQuestionAiEditOptions) {
  const [loading, setLoading] = useState(true);
  const [context, setContext] = useState<EditContext | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [versions, setVersions] = useState<EditVersion[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1); // -1 = 아직 수정본 없음
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [creditsRemaining, setCreditsRemaining] = useState<number | null>(null);
  const [applying, setApplying] = useState(false);
  const [savingAsNew, setSavingAsNew] = useState(false);
  const [savedVersionIds, setSavedVersionIds] = useState<Set<number>>(new Set());

  const versionCounter = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  // 동기 in-flight 가드 — sending(비동기 state)이 반영되기 전 같은 프레임의 중복 전송이
  // 두 번 과금되는 것을 차단한다(크레딧 정합).
  const inFlightRef = useRef(false);
  // 사용자가 전송 중 다른 버전 탭을 직접 선택했는지 — 응답 도착 시 강제 이동 방지.
  const userPinnedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    getQuestionForAiEdit(questionId)
      .then((res) => {
        if (cancelled) return;
        if (res.ok) {
          setContext({
            subType: res.subType,
            type: res.type,
            difficulty: res.difficulty,
            passageContent: res.passageContent,
            passageTitle: res.passageTitle,
            before: res.before,
          });
        } else {
          setLoadError(res.error);
        }
      })
      .catch((e) => {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "불러오기 실패");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [questionId]);

  const activeVersion = activeIndex >= 0 ? versions[activeIndex] : null;
  /** 다음 수정의 베이스라인 — 활성 수정본이 있으면 누적, 없으면 원본. */
  const editBaseline: Rec | null = activeVersion?.after ?? context?.before ?? null;

  const submit = useCallback(
    async (instruction: string, options?: SubmitOptions): Promise<boolean> => {
      const trimmed = instruction.trim();
      // 동기 가드 우선 — sending(state)은 다음 렌더에야 반영되므로 같은 프레임 중복 전송은
      // inFlightRef 로만 막을 수 있다(이중 과금 방지).
      if (!trimmed || inFlightRef.current || !context) return false;
      inFlightRef.current = true;
      userPinnedRef.current = false;
      setSending(true);
      setSendError(null);
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      try {
        const targets = options?.targets?.length ? options.targets : undefined;
        const res = await fetch("/api/ai/question-edit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            questionId,
            instruction: trimmed,
            baseline: editBaseline ?? undefined,
            targets,
          }),
          signal: ac.signal,
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          setSendError(data?.error || "수정 생성에 실패했습니다.");
          return false;
        }
        const v: EditVersion = {
          id: ++versionCounter.current,
          instruction: trimmed,
          label: (options?.label || trimmed).slice(0, 60),
          after: data.after,
          changes: data.changes ?? [],
          detailedChanges: data.detailedChanges ?? [],
          warnings: data.qualityWarnings ?? [],
          questionText: data.questionText ?? "",
          editSummary: typeof data.editSummary === "string" ? data.editSummary : "",
          acceptedWithWarnings: !!data.acceptedWithWarnings,
        };
        setVersions((prev) => {
          const next = [...prev, v];
          // 사용자가 전송 중 다른 버전을 직접 고르지 않았을 때만 최신본으로 이동.
          if (!userPinnedRef.current) setActiveIndex(next.length - 1);
          return next;
        });
        if (typeof data.creditsRemaining === "number") {
          setCreditsRemaining(data.creditsRemaining);
        }
        return true;
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return false;
        setSendError(e instanceof Error ? e.message : "요청 중 오류가 발생했습니다.");
        return false;
      } finally {
        inFlightRef.current = false;
        setSending(false);
      }
    },
    [context, editBaseline, questionId],
  );

  /** 사용자가 직접 버전 탭을 선택 — 전송 중이면 자동 이동을 막도록 pin 표시. */
  const selectVersion = useCallback((index: number) => {
    userPinnedRef.current = true;
    setActiveIndex(index);
  }, []);

  const apply = useCallback(async () => {
    if (!activeVersion || applying) return false;
    setApplying(true);
    try {
      const res = await applyAiEditToQuestion(questionId, {
        questionText: activeVersion.questionText,
        edited: activeVersion.after,
      });
      if (res.success) {
        onApplied?.();
        return true;
      }
      setSendError(res.error || "적용에 실패했습니다.");
      return false;
    } finally {
      setApplying(false);
    }
  }, [activeVersion, applying, onApplied, questionId]);

  const saveAsNew = useCallback(async () => {
    if (!activeVersion || savingAsNew) return false;
    // 이미 새 문제로 저장한 버전이면 중복 생성 방지.
    if (savedVersionIds.has(activeVersion.id)) return false;
    setSavingAsNew(true);
    try {
      const res = await saveAiEditedAsNew(questionId, {
        questionText: activeVersion.questionText,
        edited: activeVersion.after,
      });
      if (res.success && res.questionId) {
        setSavedVersionIds((prev) => new Set(prev).add(activeVersion.id));
        onSavedAsNew?.(res.questionId);
        return true;
      }
      setSendError(res.error || "저장에 실패했습니다.");
      return false;
    } finally {
      setSavingAsNew(false);
    }
  }, [activeVersion, onSavedAsNew, questionId, savingAsNew, savedVersionIds]);

  const activeVersionSaved = !!activeVersion && savedVersionIds.has(activeVersion.id);

  return {
    loading,
    context,
    loadError,
    versions,
    activeIndex,
    selectVersion,
    activeVersion,
    sending,
    sendError,
    creditsRemaining,
    applying,
    savingAsNew,
    activeVersionSaved,
    submit,
    apply,
    saveAsNew,
  };
}
