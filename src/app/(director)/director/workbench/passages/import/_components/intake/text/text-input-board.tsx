"use client";

// ============================================================================
// TextInputBoard — 텍스트 모드에서 "여러 지문"을 한 번에 추출한다(파일 모드와 동일 개념).
//
// 좌측: 입력창(제목 + 본문). "지문 추가"를 누르면 우측 목록으로 쌓인다.
// 우측: 추출될 지문이 섹션 카드로 누적. 각 카드는 접기/펴기·인라인 수정·삭제·드래그
//        순서변경이 된다(검수 패널 카드와 통일된 디자인).
// 하단: "텍스트 추출 시작 (지문 N개)" — 누적된 지문 + (입력 중인 유효 지문)을 한 작업으로
//        묶어 onStart에 배열로 넘긴다. 백엔드는 한 작업·N지문으로 처리.
// ============================================================================

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import dynamic from "next/dynamic";
import {
  ChevronRight,
  GripVertical,
  Keyboard,
  Layers,
  Loader2,
  PlayCircle,
  Plus,
  Trash2,
} from "lucide-react";

import { MAX_PAGES_PER_JOB } from "@/lib/extraction/constants";
import {
  GENERATE_TOUR_CLEAR_SAMPLE_TEXT_EVENT,
  GENERATE_TOUR_FILL_SAMPLE_TEXT_EVENT,
  GENERATE_TOUR_SAMPLE_TEXT,
  GENERATE_TOUR_SAMPLE_TEXT_TITLE,
  dispatchGenerateTourMilestone,
  hasAllGenerateTourSampleTexts,
  isGenerateTourSampleText,
  type GenerateTourSampleTextDetail,
} from "@/lib/generate-tour-demo";
import { TEXT_EXTRACTION_MIN_LENGTH } from "../../bulk-extract-client/constants";
import { TutorialVideoPopup } from "../tutorial/tutorial-video-popup";

interface TextPassageDraft {
  id: string;
  title: string;
  text: string;
}

export interface TextInputBoardProps {
  busy: boolean;
  /** 누적 지문을 한 작업으로 추출. 성공 시 true를 반환하면 입력을 비운다. */
  onStart: (
    passages: { title?: string; text: string }[],
  ) => boolean | Promise<boolean>;
  outputMode?: "verbatim" | "restored";
  reviewLabel?: string;
  emptyTitle?: string;
  guideStartLabel?: string;
  startLabel?: string;
  restoredStartLabel?: string;
  busyLabel?: string;
  suppressTutorial?: boolean;
}

/** 본문 앞부분 미리보기(제목이 없을 때 카드 라벨로 사용). */
function snippet(text: string): string {
  const t = text.trim().replace(/\s+/g, " ");
  return t.length > 38 ? `${t.slice(0, 38)}…` : t || "내용 없음";
}

// 우측(추출될 지문) 패널 폭 조절 — 파일 모드 검수 패널과 동일 방식.
const REVIEW_W_KEY = "smoat:extraction:text-review-width";
const TEXT_TUTORIAL_NEVER_KEY = "smoat.extraction.textTutorialNeverShow.v2";
const clampReviewW = (w: number) => Math.min(760, Math.max(320, Math.round(w)));

const TextTutorialPlayer = dynamic(
  () =>
    import("../tutorial/text-tutorial-player").then(
      (m) => m.TextTutorialPlayer,
    ),
  {
    ssr: false,
    loading: () => (
      <div
        className="w-full animate-pulse rounded-xl bg-slate-100"
        style={{ aspectRatio: "1280 / 720" }}
      />
    ),
  },
);

export function TextInputBoard({
  busy,
  onStart,
  outputMode,
  reviewLabel = "추출될 지문",
  emptyTitle = "텍스트를 붙여넣고 지문을 쌓아요",
  guideStartLabel = "추출 시작",
  startLabel = "텍스트 추출 시작",
  restoredStartLabel = "복원하여 추출 시작",
  busyLabel = "작업 중",
  suppressTutorial = false,
}: TextInputBoardProps) {
  const [draftTitle, setDraftTitle] = useState("");
  const [draftText, setDraftText] = useState("");
  const [passages, setPassages] = useState<TextPassageDraft[]>([]);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dropIdx, setDropIdx] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [textTutorialClosed, setTextTutorialClosed] = useState(false);
  const [textTutorialHidden, setTextTutorialHidden] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem(TEXT_TUTORIAL_NEVER_KEY) === "true";
    } catch {
      return false;
    }
  });
  // 우측 누적 패널 폭(lg+). 가운데 핸들을 끌어 조절(파일 모드와 동일).
  const [reviewWidth, setReviewWidth] = useState<number>(() => {
    if (typeof window === "undefined") return 460;
    const raw = window.localStorage.getItem(REVIEW_W_KEY);
    const n = raw ? parseInt(raw, 10) : NaN;
    return Number.isNaN(n) ? 460 : clampReviewW(n);
  });
  const beginReviewResize = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      event.preventDefault();
      const startX = event.clientX;
      const startW = reviewWidth;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      let latest = startW;
      const move = (e: PointerEvent) => {
        e.preventDefault();
        // 왼쪽으로 끌면 누적 패널이 넓어진다(오른쪽 고정 패널).
        latest = clampReviewW(startW - (e.clientX - startX));
        setReviewWidth(latest);
      };
      const finish = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", finish);
        window.removeEventListener("pointercancel", finish);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        try {
          window.localStorage.setItem(REVIEW_W_KEY, String(latest));
        } catch {
          /* ignore */
        }
      };
      window.addEventListener("pointermove", move, { passive: false });
      window.addEventListener("pointerup", finish, { once: true });
      window.addEventListener("pointercancel", finish, { once: true });
    },
    [reviewWidth],
  );

  const isRestored = outputMode === "restored";
  const locked = busy || submitting;
  const showTextTutorial =
    passages.length === 0 &&
    !textTutorialClosed &&
    !textTutorialHidden &&
    !suppressTutorial;
  const hideTextTutorialPermanently = () => {
    setTextTutorialHidden(true);
    try {
      window.localStorage.setItem(TEXT_TUTORIAL_NEVER_KEY, "true");
    } catch {
      /* ignore */
    }
  };
  useEffect(() => {
    if (passages.length === 0) {
      setTextTutorialClosed(false);
    }
  }, [outputMode, passages.length]);

  useEffect(() => {
    const handleSampleText = (event: Event) => {
      const detail = (event as CustomEvent<GenerateTourSampleTextDetail>)
        .detail;
      setDraftTitle(detail?.title ?? GENERATE_TOUR_SAMPLE_TEXT_TITLE);
      setDraftText(detail?.text ?? GENERATE_TOUR_SAMPLE_TEXT);
      setTextTutorialClosed(true);
    };
    window.addEventListener(
      GENERATE_TOUR_FILL_SAMPLE_TEXT_EVENT,
      handleSampleText,
    );
    return () => {
      window.removeEventListener(
        GENERATE_TOUR_FILL_SAMPLE_TEXT_EVENT,
        handleSampleText,
      );
    };
  }, []);

  useEffect(() => {
    const handleClearSampleText = () => {
      if (isGenerateTourSampleText(draftTitle, draftText)) {
        setDraftTitle("");
        setDraftText("");
      }
    };
    window.addEventListener(
      GENERATE_TOUR_CLEAR_SAMPLE_TEXT_EVENT,
      handleClearSampleText,
    );
    return () => {
      window.removeEventListener(
        GENERATE_TOUR_CLEAR_SAMPLE_TEXT_EVENT,
        handleClearSampleText,
      );
    };
  }, [draftTitle, draftText]);

  const draftLen = draftText.trim().length;
  const draftValid = draftLen >= TEXT_EXTRACTION_MIN_LENGTH;

  // 추출 대상 = 누적 지문 + (입력 중인 유효 지문). 입력칸에 남은 글이 있어도 유실 방지.
  const effectiveCount = passages.length + (draftValid ? 1 : 0);
  const overMax = effectiveCount > MAX_PAGES_PER_JOB;

  const addDraft = useCallback(() => {
    if (!draftValid) return;
    const id = crypto.randomUUID();
    const added = { id, title: draftTitle.trim(), text: draftText.trim() };
    setPassages((prev) => {
      const next = [...prev, added];
      if (isGenerateTourSampleText(added.title, added.text)) {
        dispatchGenerateTourMilestone("paste-draft-added");
      }
      if (hasAllGenerateTourSampleTexts(next)) {
        dispatchGenerateTourMilestone("paste-two-drafts-added");
      }
      return next;
    });
    // 방금 추가한 카드만 펼치고, 기존 카드는 모두 자동으로 접는다(아코디언).
    setCollapsed(new Set(passages.map((p) => p.id)));
    setDraftTitle("");
    setDraftText("");
  }, [draftValid, draftTitle, draftText, passages]);

  const removePassage = useCallback((id: string) => {
    setPassages((prev) => prev.filter((p) => p.id !== id));
    setCollapsed((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const updatePassage = useCallback(
    (id: string, patch: Partial<Pick<TextPassageDraft, "title" | "text">>) => {
      setPassages((prev) =>
        prev.map((p) => (p.id === id ? { ...p, ...patch } : p)),
      );
    },
    [],
  );

  const toggleCollapse = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const reorder = useCallback((from: number, to: number) => {
    if (from === to) return;
    setPassages((prev) => {
      if (from < 0 || from >= prev.length || to < 0 || to >= prev.length)
        return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }, []);

  const handleStart = useCallback(async () => {
    const all = [...passages];
    if (draftValid)
      all.push({
        id: "draft",
        title: draftTitle.trim(),
        text: draftText.trim(),
      });
    const payload = all
      .map((p) => ({ title: p.title.trim() || undefined, text: p.text.trim() }))
      .filter((p) => p.text.length >= TEXT_EXTRACTION_MIN_LENGTH);
    if (payload.length === 0 || payload.length > MAX_PAGES_PER_JOB) return;
    setSubmitting(true);
    try {
      const ok = await onStart(payload);
      if (ok) {
        setPassages([]);
        setCollapsed(new Set());
        setDraftTitle("");
        setDraftText("");
        dispatchGenerateTourMilestone("paste-registered");
      }
    } finally {
      setSubmitting(false);
    }
  }, [passages, draftValid, draftTitle, draftText, onStart]);

  const placeholder = useMemo(
    () =>
      `본문을 입력하세요. 최소 ${TEXT_EXTRACTION_MIN_LENGTH}자 이상 입력하면 추가할 수 있습니다.\n\n예: Soft drink companies attract consumers by adding bright colors...\n\n(A) Also, the artificial flavor...\n(B) Studies have shown...\n(C) They are artificial chemicals...`,
    [],
  );
  const textTutorialPopup = showTextTutorial ? (
    <TutorialVideoPopup
      durationLabel={
        isRestored ? "30초 텍스트 원문 복원 사용법" : "30초 텍스트 추출 사용법"
      }
      title={
        isRestored
          ? "문제·선지까지 붙여넣고, 원문으로 복원"
          : "텍스트를 붙여넣고, 지문을 쌓는 방법"
      }
      description={
        isRestored
          ? "빈칸·순서·삽입형은 지문만 넣지 말고 문제와 선지도 함께 붙여넣어야 AI가 원문을 복원할 수 있어요."
          : "처음이라면 영상을 보고 본문 붙여넣기부터 여러 지문을 한 번에 추출하는 흐름까지 따라가세요."
      }
      closeLabel="텍스트 추출 사용법 영상 닫기"
      onClose={() => setTextTutorialClosed(true)}
      onHidePermanently={hideTextTutorialPermanently}
    >
      <TextTutorialPlayer mode={isRestored ? "restored" : "verbatim"} />
    </TutorialVideoPopup>
  ) : null;

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
        {/* ── 좌: 입력창 (제목 + 본문 + 지문 추가) ───────────────────────── */}
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col border-b border-slate-100 p-3.5 lg:border-b-0">
          {textTutorialPopup}
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-slate-200 bg-slate-50/70 p-3">
            <div className="mb-2 flex items-center gap-2">
              <input
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                disabled={locked}
                placeholder="제목(선택). 예: 2026 고1 3월 모의고사"
                aria-label="제목"
                className="h-9 min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-3 text-[13px] text-slate-900 shadow-sm outline-none transition-colors placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50"
              />
              <span
                className={
                  "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 " +
                  (draftValid
                    ? "bg-emerald-50 text-emerald-700 ring-emerald-100"
                    : "bg-white text-slate-500 ring-slate-200")
                }
              >
                {draftLen.toLocaleString()}자
              </span>
            </div>
            <textarea
              value={draftText}
              onChange={(e) => setDraftText(e.target.value)}
              disabled={locked}
              onKeyDown={(e) => {
                // ⌘/Ctrl + Enter = 빠른 추가.
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                  e.preventDefault();
                  addDraft();
                }
              }}
              placeholder={placeholder}
              aria-label="본문"
              className="min-h-0 flex-1 resize-none rounded-md border border-dashed border-slate-300 bg-white px-4 py-3 text-[13px] leading-7 text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50"
            />
            <button
              type="button"
              onClick={addDraft}
              disabled={!draftValid || locked || overMax}
              data-generate-tour="paste-add-button"
              title={
                draftValid
                  ? "이 지문을 오른쪽 목록에 추가"
                  : `최소 ${TEXT_EXTRACTION_MIN_LENGTH}자 이상 입력하세요`
              }
              className="mt-2 inline-flex h-10 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-md border border-blue-500 bg-white px-4 text-[13px] font-extrabold text-blue-700 transition-colors hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-300"
            >
              <Plus className="size-4" aria-hidden="true" />
              지문 추가
            </button>
          </div>
        </div>

        {/* ── 좌우 폭 조절 핸들 (lg+) — 가운데 바를 끌어 누적 패널 폭 조절 ── */}
        <button
          type="button"
          onPointerDown={beginReviewResize}
          title="드래그하여 누적 패널 폭 조절"
          aria-label="누적 패널 폭 조절"
          className="group/rhandle no-print hidden h-full min-h-0 w-3 shrink-0 cursor-col-resize touch-none select-none flex-col items-center justify-center gap-1 border-l border-slate-100 bg-slate-50 py-1 text-[10.5px] font-semibold text-slate-400 transition-colors hover:bg-sky-50 hover:text-sky-600 active:bg-sky-100 lg:flex"
        >
          <GripVertical
            className="size-3 opacity-50 transition-opacity group-hover/rhandle:opacity-80"
            aria-hidden="true"
          />
          <span style={{ writingMode: "vertical-rl" }}>추출 지문</span>
        </button>

        {/* ── 우: 추출될 지문 누적 ──────────────────────────────────────── */}
        <aside
          style={{ width: reviewWidth }}
          className="flex min-h-0 flex-col bg-white max-lg:!w-full lg:shrink-0"
        >
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-100 px-3.5 py-2.5">
            <span className="inline-flex items-center gap-1.5 text-[12.5px] font-bold text-slate-900">
              <Layers className="size-4 text-blue-600" aria-hidden="true" />
              {reviewLabel} {effectiveCount}개
            </span>
            {passages.length > 0 ? (
              <button
                type="button"
                onClick={() => {
                  setPassages([]);
                  setCollapsed(new Set());
                }}
                disabled={locked}
                className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md border border-slate-200 px-2.5 text-[11px] font-semibold text-slate-600 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50"
              >
                <Trash2 className="size-3.5" aria-hidden="true" />
                비우기
              </button>
            ) : null}
          </div>

          <div className="smoat-text-review-scroll min-h-0 flex-1 overflow-y-auto bg-slate-50/40 p-2.5">
            {passages.length === 0 ? (
              <div className="smoat-text-empty-guide mx-auto flex w-full max-w-[640px] flex-col rounded-lg border border-slate-200 bg-slate-50/80 p-4">
                <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                  <div className="inline-flex w-fit items-center gap-1.5 rounded-md bg-blue-600 px-2 py-1 text-[11px] font-bold text-white">
                    <PlayCircle className="size-3.5" aria-hidden="true" />
                    사용 순서
                  </div>
                  <h3 className="smoat-text-empty-guide__title min-w-0 flex-1 text-[15px] font-extrabold leading-snug text-slate-950">
                    {emptyTitle}
                  </h3>
                </div>
                <ol className="smoat-text-empty-guide__steps mt-3 grid gap-2">
                  {[
                    { icon: Keyboard, label: "본문 붙여넣기" },
                    { icon: Plus, label: "지문 추가" },
                    { icon: PlayCircle, label: guideStartLabel },
                  ].map((step, index) => (
                    <li
                      key={step.label}
                      className="smoat-text-empty-guide__step flex min-w-0 items-center gap-2 rounded-md bg-white px-2.5 py-2 text-[12px] font-bold text-slate-700 ring-1 ring-slate-200"
                    >
                      <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[10px] font-extrabold text-blue-700">
                        {index + 1}
                      </span>
                      <step.icon
                        className="size-3.5 text-blue-600"
                        aria-hidden="true"
                      />
                      <span className="min-w-0 leading-snug">{step.label}</span>
                    </li>
                  ))}
                </ol>
              </div>
            ) : (
              <div className="space-y-2">
                {passages.map((p, idx) => {
                  const isOpen = !collapsed.has(p.id);
                  const isDragging = dragIdx === idx;
                  const isDropTarget = dropIdx === idx && dragIdx !== idx;
                  const len = p.text.trim().length;
                  return (
                    <div
                      key={p.id}
                      onDragOver={(e) => {
                        if (dragIdx === null) return;
                        e.preventDefault();
                        e.stopPropagation();
                        e.dataTransfer.dropEffect = "move";
                        if (dropIdx !== idx) setDropIdx(idx);
                      }}
                      onDrop={(e) => {
                        if (dragIdx === null) return;
                        e.preventDefault();
                        e.stopPropagation();
                        if (dragIdx !== idx) reorder(dragIdx, idx);
                        setDragIdx(null);
                        setDropIdx(null);
                      }}
                      className={
                        "overflow-hidden rounded-lg border bg-white transition-all " +
                        (isDragging
                          ? "border-blue-300 opacity-40 "
                          : isDropTarget
                            ? "border-blue-500 ring-2 ring-blue-200 "
                            : "border-slate-200 hover:border-slate-300 ")
                      }
                    >
                      <div className="flex items-center gap-1.5 border-b border-slate-100 px-2 py-1.5">
                        <span
                          draggable={!locked}
                          onDragStart={(e) => {
                            if (locked) return;
                            e.dataTransfer.effectAllowed = "move";
                            e.dataTransfer.setData("text/plain", String(idx));
                            setDragIdx(idx);
                          }}
                          onDragEnd={() => {
                            setDragIdx(null);
                            setDropIdx(null);
                          }}
                          title="드래그해 지문 순서 변경"
                          aria-label={`지문 ${idx + 1} 순서 변경 핸들`}
                          className={
                            "inline-flex size-5 shrink-0 items-center justify-center rounded text-slate-300 transition-colors hover:text-slate-500 " +
                            (locked
                              ? "cursor-not-allowed"
                              : "cursor-grab active:cursor-grabbing")
                          }
                        >
                          <GripVertical
                            className="size-3.5"
                            aria-hidden="true"
                          />
                        </span>
                        <span className="inline-flex shrink-0 items-center gap-1 rounded bg-blue-600 px-2 py-0.5 text-[11px] font-bold text-white">
                          지문 {idx + 1}
                        </span>
                        <button
                          type="button"
                          onClick={() => toggleCollapse(p.id)}
                          aria-expanded={isOpen}
                          title={isOpen ? "지문 접기" : "지문 펼치기"}
                          className="min-w-0 flex-1 cursor-pointer truncate rounded px-1 py-0.5 text-left text-[11px] font-medium text-slate-700 transition-colors hover:bg-slate-50"
                        >
                          {p.title.trim() || snippet(p.text)}
                        </button>
                        <button
                          type="button"
                          onClick={() => removePassage(p.id)}
                          disabled={locked}
                          aria-label={`지문 ${idx + 1} 삭제`}
                          title="이 지문 삭제"
                          className="inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md border border-red-200 bg-white text-red-600 transition-colors hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <Trash2 className="size-3.5" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleCollapse(p.id)}
                          aria-expanded={isOpen}
                          aria-label={
                            isOpen
                              ? `지문 ${idx + 1} 접기`
                              : `지문 ${idx + 1} 펼치기`
                          }
                          title={isOpen ? "지문 접기" : "지문 펼치기"}
                          className="inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
                        >
                          <ChevronRight
                            className={
                              "size-3.5 motion-safe:transition-transform motion-safe:duration-150 " +
                              (isOpen ? "rotate-90" : "")
                            }
                            aria-hidden="true"
                          />
                        </button>
                      </div>
                      {isOpen ? (
                        <div className="space-y-1.5 bg-slate-50/60 p-2">
                          <input
                            value={p.title}
                            onChange={(e) =>
                              updatePassage(p.id, { title: e.target.value })
                            }
                            disabled={locked}
                            placeholder="제목(선택)"
                            aria-label={`지문 ${idx + 1} 제목`}
                            className="h-8 w-full rounded-md border border-slate-200 bg-white px-2.5 text-[12px] text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50"
                          />
                          <textarea
                            value={p.text}
                            onChange={(e) =>
                              updatePassage(p.id, { text: e.target.value })
                            }
                            disabled={locked}
                            rows={5}
                            aria-label={`지문 ${idx + 1} 본문`}
                            className="w-full resize-y rounded-md border border-slate-200 bg-white px-3 py-2 text-[12px] leading-6 text-slate-900 outline-none transition-colors focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50"
                          />
                          <div className="flex justify-end">
                            <span
                              className={
                                "rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 " +
                                (len >= TEXT_EXTRACTION_MIN_LENGTH
                                  ? "bg-emerald-50 text-emerald-700 ring-emerald-100"
                                  : "bg-amber-50 text-amber-700 ring-amber-100")
                              }
                            >
                              {len >= TEXT_EXTRACTION_MIN_LENGTH
                                ? `${len.toLocaleString()}자`
                                : `${len}/${TEXT_EXTRACTION_MIN_LENGTH}자`}
                            </span>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── 하단: 텍스트 추출 시작 ── */}
          <div className="shrink-0 border-t border-slate-100 bg-white p-2.5">
            {overMax ? (
              <p className="mb-1.5 text-center text-[11px] font-bold text-red-600">
                지문 한도({MAX_PAGES_PER_JOB}개) 초과 — 지문을 줄여 주세요.
              </p>
            ) : null}
            <StartButton
              disabled={effectiveCount === 0 || overMax || locked}
              busy={locked}
              count={effectiveCount}
              label={isRestored ? restoredStartLabel : startLabel}
              busyLabel={busyLabel}
              onClick={handleStart}
            />
          </div>
          <style>{`
          .smoat-text-review-scroll {
            container-type: inline-size;
          }
          .smoat-text-empty-guide {
            margin-top: clamp(0.75rem, 5cqw, 1.5rem);
            padding: clamp(0.75rem, 4cqw, 1rem);
          }
          .smoat-text-empty-guide__steps {
            grid-template-columns: 1fr;
          }
          @container (max-width: 359px) {
            .smoat-text-empty-guide__title {
              flex-basis: 100%;
              font-size: 13px;
            }
            .smoat-text-empty-guide__step {
              padding-block: 0.45rem;
            }
          }
          @container (min-width: 420px) {
            .smoat-text-empty-guide__title {
              flex-basis: 100%;
            }
            .smoat-text-empty-guide__steps {
              grid-template-columns: repeat(3, minmax(0, 1fr));
            }
            .smoat-text-empty-guide__step {
              align-items: flex-start;
              flex-direction: column;
              min-height: 4.5rem;
            }
          }
          @container (min-width: 560px) {
            .smoat-text-empty-guide__title {
              flex-basis: auto;
            }
            .smoat-text-empty-guide__step {
              min-height: 4rem;
            }
          }
        `}</style>
        </aside>
      </div>
    </>
  );
}

function StartButton({
  disabled,
  busy,
  count,
  label,
  busyLabel,
  onClick,
}: {
  disabled: boolean;
  busy: boolean;
  count: number;
  label: string;
  busyLabel: string;
  onClick: () => void;
}): ReactNode {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-generate-tour="paste-register-button"
      className={
        "inline-flex h-12 w-full items-center justify-center rounded-lg border text-[14px] font-extrabold text-white shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 " +
        (busy
          ? "cursor-wait border-blue-600 bg-blue-600"
          : disabled
            ? "cursor-not-allowed border-blue-200 bg-blue-300"
            : "cursor-pointer border-blue-600 bg-blue-600 hover:bg-blue-700")
      }
    >
      {busy ? (
        <>
          <Loader2 className="mr-2 size-5 animate-spin" aria-hidden="true" />
          {busyLabel}
        </>
      ) : (
        <>
          <PlayCircle className="mr-2 size-5" aria-hidden="true" />
          {label}
          {count > 0 ? ` (지문 ${count}개)` : ""}
        </>
      )}
    </button>
  );
}
