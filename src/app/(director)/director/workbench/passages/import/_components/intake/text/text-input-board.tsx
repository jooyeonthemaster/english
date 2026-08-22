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
  useRef,
  useState,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import dynamic from "next/dynamic";
import {
  ChevronDown,
  ChevronRight,
  GripVertical,
  Keyboard,
  Layers,
  Loader2,
  PlayCircle,
  Plus,
  ShoppingBasket,
  Trash2,
} from "lucide-react";

import { MAX_PAGES_PER_JOB } from "@/lib/extraction/constants";
import { triggerHintGlow, triggerHintGlowWithin } from "@/lib/hint-glow";
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
  /**
   * 모바일 스텝 플로우(<lg) 연동 — 주면 페이지 하단 고정 바가 시작 버튼을
   * 대신하므로, 내장 시작 버튼은 모바일에서 숨긴다(PC는 그대로). 부모가 이
   * ref 로 handleStart 를 호출한다.
   */
  startRef?: MutableRefObject<(() => void) | null>;
  /** 누적 지문 수·작업 상태 변화 알림 — 하단 바 라벨/비활 판단용. */
  onDraftStateChange?: (state: { count: number; busy: boolean }) => void;
  /**
   * 모바일(<lg)에서 우측 "등록할 지문" 패널을 '담긴 지문' 장바구니 바 + 시작
   * 버튼의 하단 고정 클러스터로 접는다(파일업로드 크롭 보드와 통일). 호스트가
   * 하단 스텝 네비를 숨겨야 함. 기본 false(자료추출 등은 기존 패널 그대로).
   */
  mobileFixedFooter?: boolean;
  /**
   * 좁은 컨테이너 임베드(클래스 스튜디오 워크벤치 중앙 열)용 — 뷰포트가 lg 이상
   * 이어도 좌우 분할(lg:flex-row) 대신 세로 적층을 강제한다. 미디어쿼리는
   * 뷰포트만 보므로, 넓은 화면의 좁은 열에 그대로 임베드하면 입력 패널이
   * 글자 단위로 부서진다(2026-08-10 실측). 부재 시 기존 클래스와 바이트 동일(무회귀).
   */
  stacked?: boolean;
  /**
   * 빈 상태의 「사용 순서」 가이드 박스를 숨긴다(클래스 스튜디오 인테이크
   * 간소화 — §3.9v2.8 D9). 스튜디오 중앙 열은 폭이 좁아 3단 가이드가 시각
   * 소음이라, 대신 muted 한 줄 안내만 둔다. 부재 시(기본 false) 기존 가이드
   * 박스 그대로 — 다른 호스트(추출·복원 등) 바이트 동일(무회귀).
   */
  hideEmptyGuide?: boolean;
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
  emptyTitle = "텍스트를 붙여넣고 지문을 쌓습니다",
  guideStartLabel = "추출 시작",
  startLabel = "다음으로 (내 지문함)",
  restoredStartLabel = "다음으로 (내 지문함)",
  busyLabel = "작업 중",
  suppressTutorial = false,
  startRef,
  onDraftStateChange,
  mobileFixedFooter = false,
  stacked = false,
  hideEmptyGuide = false,
}: TextInputBoardProps) {
  const [draftTitle, setDraftTitle] = useState("");
  const [draftText, setDraftText] = useState("");
  const [passages, setPassages] = useState<TextPassageDraft[]>([]);
  // 막 등록된 지문 id — 해당 블록에 1회성 파란 글로우를 입히기 위해 추적한다.
  const [justAddedId, setJustAddedId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dropIdx, setDropIdx] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // 비활 버튼('지문 추가'·'지문 등록하고 선택') 클릭 시 글로우할 대상:
  // 입력칸(본문 미입력) / 누적 목록(한도 초과 시 줄이라고).
  const inputBoxRef = useRef<HTMLDivElement>(null);
  const reviewListRef = useRef<HTMLDivElement>(null);
  // 우측 누적 패널(aside) 실체 — 드래그 리사이즈 고속 경로가 style.width 를 직접 쓴다.
  const reviewAsideRef = useRef<HTMLElement>(null);
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
      const prevCursor = document.body.style.cursor;
      const prevSelect = document.body.style.userSelect;
      const prevPointerEvents = document.body.style.pointerEvents;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      // 드래그 중 hover 스타일 재평가 차단 — 폭이 프레임마다 바뀌면 커서 아래
      // 요소가 계속 바뀐다(캡처 덕에 move 수신에는 영향 없다).
      document.body.style.pointerEvents = "none";
      let latest = startW;

      // 포인터 캡처 — 커서가 얇은 핸들을 벗어나도 드래그가 끊기지 않는다.
      const handleEl = event.currentTarget as HTMLElement;
      try {
        handleEl.setPointerCapture(event.pointerId);
      } catch {
        /* 캡처 미지원 브라우저는 window 리스너로 폴백 */
      }

      // 드래그 고속 경로 — 매 무브 setReviewWidth 는 보드 전체(좌 입력 보드 +
      // 누적 지문 블록 수십 장)를 프레임마다 리렌더시킨다. 이동 중에는 aside 의
      // style.width 에 rAF 코얼레싱으로 직접 쓰고, 놓을 때 한 번만 setState 로
      // 커밋한다. 앵커가 없으면 종전 setState 경로 폴백(무회귀).
      let rafId: number | null = null;
      const flush = () => {
        rafId = null;
        if (reviewAsideRef.current) {
          reviewAsideRef.current.style.width = `${latest}px`;
        }
      };
      const move = (e: PointerEvent) => {
        e.preventDefault();
        // 왼쪽으로 끌면 누적 패널이 넓어진다(오른쪽 고정 패널).
        latest = clampReviewW(startW - (e.clientX - startX));
        if (reviewAsideRef.current) {
          if (rafId === null) rafId = requestAnimationFrame(flush);
        } else {
          setReviewWidth(latest);
        }
      };
      const finish = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", finish);
        window.removeEventListener("pointercancel", finish);
        if (rafId !== null) cancelAnimationFrame(rafId);
        flush();
        // 커밋은 여기서 한 번 — 드래그 내내 리렌더 0회.
        setReviewWidth(latest);
        // 저장해 둔 이전 값 복원 — 빈 문자열 대입은 남의 잠금까지 지운다.
        document.body.style.cursor = prevCursor;
        document.body.style.userSelect = prevSelect;
        document.body.style.pointerEvents = prevPointerEvents;
        try {
          window.localStorage.setItem(REVIEW_W_KEY, String(latest));
        } catch {
          /* ignore */
        }
        try {
          handleEl.releasePointerCapture(event.pointerId);
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

  // ── 모바일 장바구니(하단 고정) ──
  const [isBelowLg, setIsBelowLg] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia("(max-width: 1023.98px)");
    const update = () => setIsBelowLg(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, []);
  const fixedFooter = mobileFixedFooter && isBelowLg;
  const [cartOpen, setCartOpen] = useState(false);
  // '지문 추가'로 담길 때마다 뱃지를 튀긴다.
  const [cartBump, setCartBump] = useState(0);
  const prevPassagesLenRef = useRef(0);
  useEffect(() => {
    if (passages.length > prevPassagesLenRef.current) setCartBump((n) => n + 1);
    prevPassagesLenRef.current = passages.length;
  }, [passages.length]);

  const addDraft = useCallback(() => {
    if (!draftValid) return;
    const id = crypto.randomUUID();
    const added = { id, title: draftTitle.trim(), text: draftText.trim() };
    // 방금 추가한 블록에 등록 글로우를 한 번 입힌다(애니메이션 종료 시 해제).
    setJustAddedId(id);
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
    if (locked) return;
    if (effectiveCount === 0) {
      // 추출할 지문 없음 → 입력칸을 글로우해 "본문을 먼저 입력하세요" 유도.
      triggerHintGlow(inputBoxRef.current);
      return;
    }
    if (overMax) {
      // 한도 초과 → 누적 목록 카드들을 글로우해 "지문을 줄이세요" 유도.
      triggerHintGlowWithin(reviewListRef.current, ":scope > div");
      return;
    }
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
  }, [
    locked,
    effectiveCount,
    overMax,
    passages,
    draftValid,
    draftTitle,
    draftText,
    onStart,
  ]);

  // 모바일 스텝 플로우: 하단 고정 바가 시작 버튼을 대신 누를 수 있게 등록.
  useEffect(() => {
    if (!startRef) return;
    startRef.current = handleStart;
    return () => {
      startRef.current = null;
    };
  }, [startRef, handleStart]);

  useEffect(() => {
    onDraftStateChange?.({ count: effectiveCount, busy: locked });
  }, [onDraftStateChange, effectiveCount, locked]);

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
      <div
        className={
          "flex min-h-0 flex-1 flex-col overflow-hidden" +
          (stacked ? "" : " lg:flex-row")
        }
      >
        {/* ── 좌: 입력창 (제목 + 본문 + 지문 추가) ───────────────────────── */}
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col border-b border-slate-100 p-2 lg:border-b-0 lg:p-3.5">
          {textTutorialPopup}
          <div
            ref={inputBoxRef}
            className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-slate-200 bg-slate-50/70 p-2 lg:p-3"
          >
            <div className="mb-2 flex items-center gap-2">
              <input
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                disabled={locked}
                placeholder="제목(선택). 예: 2026 고1 3월 모의고사"
                aria-label="제목"
                className={
                  "h-9 min-w-0 flex-1 rounded-md border-2 bg-white px-3 text-[13px] text-slate-900 shadow-sm outline-none transition-colors placeholder:text-slate-400 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50 " +
                  // 비어 있으면 파란 테두리로 입력을 유도, 내용이 있으면 회색.
                  (draftTitle
                    ? "border-slate-200 focus:border-blue-400"
                    : "border-blue-500 focus:border-blue-500")
                }
              />
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
              className={
                // 모바일(<lg)은 '지문 추가' 버튼까지 한 화면에 들어오도록 본문을
                // 화면에 맞는 고정 높이로 둔다(스크롤 없이). PC(lg)는 flex-1로 채운다.
                "min-h-0 flex-1 resize-none rounded-md border-2 bg-white px-3 py-3 text-[13px] leading-6 text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50 max-lg:h-[26vh] max-lg:!min-h-[128px] max-lg:!flex-none lg:leading-7 lg:px-4 " +
                // stacked 임베드: lg 이상에서도 입력을 고정 높이로 접어 아래
                // 누적 목록이 남는 세로 공간을 갖게 한다(max-lg 표현과 동형).
                (stacked ? "!h-[220px] !min-h-[128px] !flex-none " : "") +
                // 비어 있으면 파란 테두리로 입력을 유도, 내용이 있으면 회색.
                (draftText
                  ? "border-slate-200 focus:border-blue-400"
                  : "border-blue-500 focus:border-blue-500")
              }
            />
            <button
              type="button"
              // aria-disabled — 비활처럼 보이되 클릭은 살려, 막힌 이유에 맞는 영역을
              // 글로우해 행동을 유도한다(본문 미입력→입력칸 / 한도 초과→누적 목록).
              onClick={() => {
                if (locked) return;
                if (overMax) {
                  triggerHintGlowWithin(reviewListRef.current, ":scope > div");
                  return;
                }
                if (!draftValid) {
                  triggerHintGlow(inputBoxRef.current);
                  return;
                }
                addDraft();
              }}
              aria-disabled={!draftValid || locked || overMax}
              data-generate-tour="paste-add-button"
              title={
                draftValid
                  ? "이 지문을 오른쪽 목록에 추가"
                  : `최소 ${TEXT_EXTRACTION_MIN_LENGTH}자 이상 입력하세요`
              }
              className="mt-2 inline-flex h-10 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-md border border-blue-500 bg-white px-4 text-[13px] font-extrabold text-blue-700 transition-colors hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 aria-disabled:cursor-not-allowed aria-disabled:border-slate-200 aria-disabled:text-slate-300 aria-disabled:hover:bg-white"
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
          className={
            "group/rhandle no-print hidden h-full min-h-0 w-3 shrink-0 cursor-col-resize touch-none select-none flex-col items-center justify-center gap-1 border-l border-slate-100 bg-slate-50 py-1 text-[10.5px] font-semibold text-slate-400 transition-colors hover:bg-sky-50 hover:text-sky-600 active:bg-sky-100" +
            (stacked ? "" : " lg:flex")
          }
        >
          <GripVertical
            className="size-3 opacity-50 transition-opacity group-hover/rhandle:opacity-80"
            aria-hidden="true"
          />
          <span style={{ writingMode: "vertical-rl" }}>추출 지문</span>
        </button>

        {/* ── 우: 추출될 지문 누적 ──────────────────────────────────────── */}
        <aside
          ref={reviewAsideRef}
          style={{ width: reviewWidth }}
          className={
            "flex min-h-0 flex-col bg-white max-lg:!w-full" +
            (stacked ? " !w-full min-h-0 flex-1" : " lg:shrink-0")
          }
        >
          {/* 모바일: '담긴 지문' 장바구니 바 + 시작 버튼을 하단 고정(파일업로드와
              통일). 목록은 cartOpen일 때 위로 펼침. PC(lg)는 contents로 투명
              처리해 기존 우측 '등록할 지문' 패널을 그대로 유지. */}
          <div
            className={
              fixedFooter
                ? "fixed inset-x-0 bottom-0 z-40 flex flex-col border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] shadow-[0_-6px_20px_-10px_rgba(15,23,42,0.28)]"
                : "contents"
            }
          >
          {/* 목록(등록할 지문) — PC 항상 열림 / 모바일은 장바구니 바를 탭해 시트로. */}
          <div
            className={
              fixedFooter
                ? cartOpen
                  ? "flex max-h-[52vh] min-h-0 flex-col border-b border-slate-100"
                  : "hidden"
                : "contents"
            }
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
              hideEmptyGuide ? (
                // 간소화 임베드(스튜디오): 가이드 박스 대신 muted 한 줄 —
                // 세로·가로 중앙에 두어 빈 패널이 허전하지도 시끄럽지도 않게.
                <p className="flex h-full items-center justify-center text-center text-[12px] text-slate-400">
                  붙여넣은 지문이 여기에 쌓입니다
                </p>
              ) : (
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
              )
            ) : (
              <div ref={reviewListRef} className="space-y-2">
                {passages.map((p, idx) => {
                  const isOpen = !collapsed.has(p.id);
                  const isDragging = dragIdx === idx;
                  const isDropTarget = dropIdx === idx && dragIdx !== idx;
                  const isJustAdded = p.id === justAddedId;
                  const len = p.text.trim().length;
                  return (
                    <div
                      key={p.id}
                      onAnimationEnd={(e) => {
                        if (
                          isJustAdded &&
                          e.animationName === "passage-added-glow"
                        ) {
                          setJustAddedId(null);
                        }
                      }}
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
                            : "border-slate-200 hover:border-slate-300 ") +
                        (isJustAdded ? "passage-added-glow " : "")
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

          </div>

          {/* ── 모바일 '담긴 지문' 장바구니 바 — 시작 버튼 바로 위. 탭하면 위
              목록(수정·삭제·순서변경) 시트를 펼친다. ── */}
          {fixedFooter ? (
            <button
              type="button"
              onClick={() => setCartOpen((o) => !o)}
              aria-expanded={cartOpen}
              aria-label={cartOpen ? "담긴 지문 목록 접기" : "담긴 지문 목록 펼치기"}
              className="flex w-full shrink-0 items-center gap-2.5 border-t border-slate-100 bg-white px-3 py-2 text-left"
            >
              <span className="relative inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                <ShoppingBasket className="size-5" aria-hidden="true" />
                {effectiveCount > 0 ? (
                  <span
                    key={cartBump}
                    className="absolute -right-1.5 -top-1.5 inline-flex min-w-[18px] items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-extrabold leading-none text-white ring-2 ring-white [animation:cart-pop_.45s_ease-out]"
                  >
                    {effectiveCount}
                  </span>
                ) : null}
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-[12.5px] font-bold text-slate-900">
                  담긴 지문 {effectiveCount}개
                </span>
                <span className="truncate text-[10.5px] text-slate-400">
                  {passages.length > 0
                    ? "탭하여 목록 보기·편집"
                    : "본문을 붙여넣고 '지문 추가'로 담아보세요"}
                </span>
              </span>
              {passages.length > 0 ? (
                <span className="max-w-[42%] shrink truncate rounded-md bg-slate-100 px-2 py-1 text-[10.5px] font-medium text-slate-500">
                  {passages[passages.length - 1].title.trim() ||
                    snippet(passages[passages.length - 1].text)}
                </span>
              ) : null}
              <ChevronDown
                className={
                  "size-4 shrink-0 text-slate-400 transition-transform " +
                  (cartOpen ? "rotate-180" : "")
                }
                aria-hidden="true"
              />
            </button>
          ) : null}

          {/* ── 하단: 텍스트 추출 시작. 모바일 고정 클러스터(fixedFooter)에선 이
              버튼을 클러스터 맨 아래에 노출한다. 그 외 스텝 연동(startRef만 있고
              고정 클러스터 아님)에선 페이지 하단 바가 대신하므로 <lg 에서 숨긴다. */}
          <div
            className={
              "shrink-0 border-t border-slate-100 bg-white p-2.5" +
              (startRef && !mobileFixedFooter ? " max-lg:hidden" : "")
            }
          >
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
          </div>
          <style>{`
          @keyframes cart-pop {
            0% { transform: scale(1); }
            35% { transform: scale(1.4); }
            70% { transform: scale(0.9); }
            100% { transform: scale(1); }
          }
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
      // aria-disabled — 비활처럼 보이되 클릭은 살려, onClick(handleStart)이 막힌
      // 사유에 맞는 영역을 글로우해 행동을 유도한다.
      aria-disabled={disabled}
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
          {/* 카운트 표기 정본 「· 지문 N개」 상시 — 업로드 CTA 와 단일 포맷
              (2026-08-11 재검증 V2, 구 「(지문 N개)」 count>0 한정 폐기) */}
          {` · 지문 ${count}개`}
        </>
      )}
    </button>
  );
}
