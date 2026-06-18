"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CircleAlert,
  Cpu,
  FileText,
  Gem,
  Loader2,
  Minus,
  MousePointer2,
  Plus,
  Redo2,
  RotateCcw,
  Scissors,
  SlidersHorizontal,
  TextCursorInput,
  Trash2,
  Undo2,
  Wand2,
  X,
} from "lucide-react";
import { PearlIcon } from "@/components/icons/pearl-icon";
import { toast } from "sonner";

import { Textarea } from "@/components/ui/textarea";
import { CREDIT_COSTS } from "@/lib/credit-costs";
import { CreditCostChip } from "@/components/credits/credit-cost-chip";
import { dispatchGenerateTourMilestone } from "@/lib/generate-tour-demo";
import {
  RestoreIntroDialog,
  readRestoreIntroDismissed,
} from "../intake/restore-intro-dialog";
import { formatExtractedTextForDisplay } from "../../passages/import/_components/extraction-manage-client/utils/display-text";
import {
  countWords,
  isRowDirty,
  overrideHasTypeCounts,
  type RowHighlight,
  type RowRange,
  type WorkspaceRow,
} from "./workspace-types";
import {
  difficultyLabel,
  overrideTypeSummary,
} from "./type-override-popover";
import {
  ParaphrasePreviewPanel,
  PrependPreviewPanel,
} from "./transform-panels";
import {
  VariantMenuButton,
  WholePassageVariantPreviewPanel,
  type VariantAction,
} from "./whole-passage-variant-controls";
import { RowHistoryPopover } from "./row-history-popover";
import type { QueueItem } from "../generate-page-types";
import type { QuestionCardItem } from "@/components/workbench/question-card";
import {
  defaultVariantTitle,
  variantModeLabel,
  type VariantDirection,
  type WholePassageTransformMode,
} from "@/lib/passage-transform/schema";

// ============================================================================
// 워크스페이스 지문 행 — 본문 직접 편집 + AI 변형(문장 재작성·앞 맥락 추가) +
// 출제 범위 지정 + 지문별 유형 오버라이드 + 생성 이력 + 행별 undo/redo.
//
// 앞 맥락 추가는 "본문 첫 글자 바로 위"의 삽입 바로 노출한다 — 문단이
// 들어갈 자리가 곧 버튼이라, 처음 보는 사람도 무엇이 어디에 생기는지 안다.
// AI가 추가/변형한 구간은 textarea 뒤 백드롭 레이어로 하이라이트한다.
// ============================================================================

const MIN_PARAPHRASE_CHARS = 12;
const MIN_RANGE_CHARS = 40;
const PREPEND_COUNT_KEY = "smoat:generate:prepend-sentence-count";
/** 드래그 모션 코치 — 한 번 직접 드래그/편집하면 다시 보지 않는다. */
const DRAG_COACH_KEY = "smoat:generate:drag-coach-dismissed";
/** 앞 맥락 추가 모션 코치 — 한 번 사용하면 다시 보지 않는다. */
const PREPEND_COACH_KEY = "smoat:generate:prepend-coach-dismissed";
/** 코치 1사이클 길이 — CSS keyframes 의 duration 과 반드시 일치해야 한다. */
const DRAG_COACH_CYCLE_MS = 4_400;
const PREPEND_COACH_CYCLE_MS = 5_400;

function readCoachDismissed(key: string): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return true;
  }
}
/** 수동 편집 버스트 묶음 간격 — 이 안의 연속 타이핑은 undo 1단계. */
const TYPING_BURST_MS = 800;
/**
 * 에디터·하이라이트 백드롭 공통 텍스트 메트릭 — 인라인으로 강제한다.
 * (전역 스타일이 textarea 폰트를 가로채면 두 레이어의 줄바꿈이 어긋나
 * 하이라이트가 엉뚱한 위치에 칠해진다.)
 */
const EDITOR_TEXT_STYLE: React.CSSProperties = {
  fontSize: "13px",
  lineHeight: 1.625,
};

interface SelectionState {
  start: number;
  end: number;
  text: string;
}

type PreviewState =
  | {
      kind: "paraphrase";
      start: number;
      end: number;
      original: string;
      text: string;
      note: string;
    }
  | { kind: "prepend"; text: string; note: string };

/** 전체 변형(새 지문) 미리보기 — 적용 시 새 행으로 추가된다(원본 유지). */
interface VariantPreviewState {
  mode: WholePassageTransformMode;
  direction?: VariantDirection;
  label: string;
  text: string;
  title: string;
  summary: string;
}

async function requestTransform(body: {
  mode: "PARAPHRASE" | "PREPEND" | WholePassageTransformMode;
  passageText: string;
  selectedText?: string;
  avoidTexts?: string[];
  sentenceCount?: number;
  direction?: VariantDirection;
}): Promise<{ text: string; note: string; title: string; summary: string }> {
  const res = await fetch("/api/workbench/passage-transform", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    throw new Error(data.error || "AI 변형에 실패했습니다.");
  }
  return {
    text: String(data.text || ""),
    note: String(data.note || ""),
    title: String(data.title || ""),
    summary: String(data.summary || ""),
  };
}

/** 선택 액션 팝오버 추정 크기 — 좌우 클램프·상하 플립 판정용. */
const SELECTION_POPUP_W = 320;
const SELECTION_POPUP_H = 48;

interface SelectionAnchor {
  /** 에디터 relative 컨테이너 기준 px. 화살표가 가리킬 지점. */
  x: number;
  topY: number;
  bottomY: number;
  containerW: number;
  containerH: number;
}

/**
 * textarea 선택 구간의 화면 좌표 측정 — textarea 는 DOM Range 가 없어
 * 동일 메트릭 미러 div 를 임시로 만들어 선택 span 의 ClientRects 를 잰다
 * (하이라이트 백드롭과 같은 원리). 학습지 필기 툴바와 동일한 앵커 규칙:
 * 같은 줄 선택 = 중앙, 여러 줄 = 끝 지점.
 */
function measureSelectionAnchor(
  el: HTMLTextAreaElement,
  start: number,
  end: number,
): SelectionAnchor | null {
  const host = el.parentElement;
  if (!host) return null;
  const cs = window.getComputedStyle(el);
  const mirror = document.createElement("div");
  mirror.setAttribute("aria-hidden", "true");
  mirror.style.position = "absolute";
  mirror.style.left = "0";
  mirror.style.top = "0";
  mirror.style.visibility = "hidden";
  mirror.style.pointerEvents = "none";
  mirror.style.boxSizing = "border-box";
  mirror.style.width = `${el.clientWidth}px`;
  mirror.style.whiteSpace = "pre-wrap";
  mirror.style.overflowWrap = "break-word";
  mirror.style.fontFamily = cs.fontFamily;
  mirror.style.fontSize = cs.fontSize;
  mirror.style.fontWeight = cs.fontWeight;
  mirror.style.lineHeight = cs.lineHeight;
  mirror.style.letterSpacing = cs.letterSpacing;
  mirror.style.paddingTop = cs.paddingTop;
  mirror.style.paddingRight = cs.paddingRight;
  mirror.style.paddingBottom = cs.paddingBottom;
  mirror.style.paddingLeft = cs.paddingLeft;
  mirror.appendChild(document.createTextNode(el.value.slice(0, start)));
  const marker = document.createElement("span");
  marker.textContent = el.value.slice(start, end) || "​";
  mirror.appendChild(marker);
  mirror.appendChild(document.createTextNode(el.value.slice(end)));
  host.appendChild(mirror);
  const rects = Array.from(marker.getClientRects());
  const hostRect = host.getBoundingClientRect();
  mirror.remove();
  if (rects.length === 0) return null;
  const first = rects[0];
  const last = rects[rects.length - 1];
  const sameLine = Math.abs(first.top - last.top) < 4;
  return {
    x: (sameLine ? (first.left + last.right) / 2 : last.right) - hostRect.left,
    topY: first.top - hostRect.top - el.scrollTop,
    bottomY: last.bottom - hostRect.top - el.scrollTop,
    containerW: host.clientWidth,
    containerH: host.clientHeight,
  };
}

/** 하이라이트 구간을 렌더 세그먼트로 변환 (겹침/범위 밖은 안전하게 클램프). */
function buildHighlightSegments(
  content: string,
  highlights: RowHighlight[],
): { text: string; kind: RowHighlight["kind"] | null; original?: string }[] {
  if (highlights.length === 0) return [{ text: content, kind: null }];
  const sorted = [...highlights].sort((a, b) => a.start - b.start);
  const segments: {
    text: string;
    kind: RowHighlight["kind"] | null;
    original?: string;
  }[] = [];
  let pos = 0;
  for (const h of sorted) {
    const start = Math.max(pos, Math.min(h.start, content.length));
    const end = Math.max(start, Math.min(h.end, content.length));
    if (start > pos)
      segments.push({ text: content.slice(pos, start), kind: null });
    if (end > start)
      segments.push({
        text: content.slice(start, end),
        kind: h.kind,
        original: h.original,
      });
    pos = Math.max(pos, end);
  }
  if (pos < content.length)
    segments.push({ text: content.slice(pos), kind: null });
  return segments;
}

interface WorkspacePassageRowProps {
  index: number;
  row: WorkspaceRow;
  /** 첫 행에서만 드래그 모션 코치를 보여준다. */
  dragCoach?: boolean;
  /** 전체 공통 난이도 — 이 지문에 개별 난이도 지정이 없을 때 기본 뱃지로 표시. */
  globalDifficulty: "BASIC" | "INTERMEDIATE" | "KILLER";
  /** 전체 공통 생성 플랜 — 개별 지정이 없을 때 기본 뱃지로 표시. */
  globalGenerationPlan: "STANDARD" | "PREMIUM";
  disabled: boolean;
  onChangeContent: (content: string) => void;
  /** 수동 편집 버스트 시작 — undo 스냅샷 저장. */
  onPushHistory: () => void;
  /** AI 변형 적용 (히스토리+하이라이트 포함 원자 처리). */
  onApplyAi: (content: string, highlight: RowHighlight) => void;
  onUndo: () => void;
  onRedo: () => void;
  onClearHighlights: () => void;
  onSetRange: (range: RowRange | null) => void;
  onToggleCollapsed: () => void;
  onRemove: () => void;
  /** 이 지문(원본+변형)의 진행 큐 — 문제 히스토리 팝오버용. */
  sessionQueue: QueueItem[];
  /** 이 지문으로 저장된 문제 수 — 히스토리 팝오버 표시용. */
  savedQuestionCount: number;
  /** 이 지문(원본+변형)으로 저장된 문제 목록 — 히스토리 팝오버에 실제 표시. */
  questions: QuestionCardItem[];
  /** 히스토리 팝오버의 문제 행 클릭 시 '문제 상세' 모달을 연다. */
  onOpenQuestionDetail?: (q: QuestionCardItem) => void;
  /**
   * 전체 변형본을 새 Passage 로 저장하고 워크스페이스에 새 행으로 추가한다.
   * 성공하면 true 를 반환 — 행은 그때 미리보기를 닫는다.
   */
  onAddVariant: (input: {
    sourcePassageId: string;
    title: string;
    content: string;
    mode: WholePassageTransformMode;
    direction?: VariantDirection;
  }) => Promise<boolean>;
  /** 이 행이 일괄 삭제용 다중 선택 체크박스로 선택돼 있는지. */
  selected?: boolean;
  /** 다중 선택 체크박스 토글 (전체선택/일괄 삭제용 — 설정 대상 선택과 무관). */
  onToggleSelected?: () => void;
  /** 이 행이 '개별 설정' 대상으로 선택돼 있는지 (선택 링 표시). */
  active?: boolean;
  /** 다른 지문이 설정 대상으로 선택돼 있어, 이 행은 흐리게(스포트라이트 밖). */
  dimmed?: boolean;
  /** 행 본문 클릭 → 이 지문을 선택(설정 대상)으로 바인딩 (모달은 열지 않음). */
  onSetActive: () => void;
  /** '문제 생성' / 설정 배지 클릭 → 이 지문의 문제 생성 모달을 연다. */
  onOpenSettings: () => void;
  /** 이 지문이 현재 설정으로 만들어낼 문제 수·크레딧 (푸터 버튼 라벨용). */
  genStats?: { questions: number; creditCost: number };
}

export function WorkspacePassageRow({
  index,
  row,
  dragCoach = false,
  globalDifficulty,
  globalGenerationPlan,
  disabled,
  sessionQueue,
  savedQuestionCount,
  questions,
  onOpenQuestionDetail,
  onChangeContent,
  onPushHistory,
  onApplyAi,
  onUndo,
  onRedo,
  onClearHighlights,
  onSetRange,
  onToggleCollapsed,
  onRemove,
  onAddVariant,
  selected = false,
  onToggleSelected,
  active = false,
  dimmed = false,
  onSetActive,
  onOpenSettings,
  genStats,
}: WorkspacePassageRowProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const rangeBackdropRef = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState<SelectionState | null>(null);
  const [selectionAnchor, setSelectionAnchor] =
    useState<SelectionAnchor | null>(null);
  const [busy, setBusy] = useState<
    "paraphrase" | "prepend" | "restore" | "variant" | null
  >(null);
  const [restoreIntroOpen, setRestoreIntroOpen] = useState(false);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  // 전체 변형(새 지문) 미리보기 + 적용 진행 상태.
  const [variantPreview, setVariantPreview] =
    useState<VariantPreviewState | null>(null);
  const [variantAdding, setVariantAdding] = useState(false);
  // "다시 생성" 회피 목록 — 같은 변형 액션에 대한 직전 결과들.
  const variantAvoidRef = useRef<string[]>([]);
  // 변형 문장 위에 커서를 올리면 원문을 보여주는 툴팁 (에디터 컨테이너 기준 좌표).
  const [originalTip, setOriginalTip] = useState<{
    left: number;
    top: number;
    /** 호버 중인 줄의 윗변 — 아래 공간이 부족할 때 위로 뒤집는 기준. */
    lineTop: number;
    text: string;
  } | null>(null);
  const originalTipRef = useRef<HTMLDivElement>(null);
  // 툴팁은 overflow-hidden 에디터 안에 뜨므로, 렌더 직후 실제 크기를 재서
  // 좌우는 컨테이너 안으로 클램프하고 아래 공간이 부족하면 줄 위로 뒤집는다.
  useLayoutEffect(() => {
    const tip = originalTipRef.current;
    const host = tip?.parentElement;
    if (!tip || !host || !originalTip) return;
    const w = tip.offsetWidth;
    const h = tip.offsetHeight;
    const left = Math.min(
      Math.max(originalTip.left - w / 2, 8),
      Math.max(host.clientWidth - w - 8, 8),
    );
    const top =
      originalTip.top + h > host.clientHeight - 4
        ? Math.max(originalTip.lineTop - h - 4, 4)
        : originalTip.top;
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
  }, [originalTip]);

  // ── 하이라이트(앞 맥락·출제 범위) 호버 액션 메뉴 ──
  // 백드롭은 textarea 뒤라 직접 클릭이 안 되므로, 하이라이트 위에 커서를
  // 올리면 그 줄 근처에 삭제/해제 버튼을 띄운다. 메뉴까지 커서가 닿도록
  // 짧은 지연(scheduleHlHide) 후에만 닫는다.
  const [hlMenu, setHlMenu] = useState<{
    left: number;
    top: number;
    lineTop: number;
    kind: "prepend" | "range";
    start: number;
    end: number;
  } | null>(null);
  const hlMenuRef = useRef<HTMLDivElement>(null);
  const hlHideTimerRef = useRef<number | null>(null);
  const cancelHlHide = useCallback(() => {
    if (hlHideTimerRef.current !== null) {
      window.clearTimeout(hlHideTimerRef.current);
      hlHideTimerRef.current = null;
    }
  }, []);
  const scheduleHlHide = useCallback(() => {
    cancelHlHide();
    hlHideTimerRef.current = window.setTimeout(() => {
      hlHideTimerRef.current = null;
      setHlMenu(null);
    }, 180);
  }, [cancelHlHide]);
  // 메뉴도 overflow 컨테이너 안에 뜨므로 좌우 클램프 + 아래 공간 부족 시 위로.
  useLayoutEffect(() => {
    const menu = hlMenuRef.current;
    const host = menu?.parentElement;
    if (!menu || !host || !hlMenu) return;
    const w = menu.offsetWidth;
    const h = menu.offsetHeight;
    const left = Math.min(
      Math.max(hlMenu.left - w / 2, 8),
      Math.max(host.clientWidth - w - 8, 8),
    );
    const top =
      hlMenu.top + h > host.clientHeight - 4
        ? Math.max(hlMenu.lineTop - h - 4, 4)
        : hlMenu.top;
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
  }, [hlMenu]);

  // "다시 생성" 회피 목록 — 같은 대상에 대한 직전 결과들.
  const avoidRef = useRef<string[]>([]);
  // 타이핑 버스트 타이머 — 활성인 동안의 연속 입력은 undo 1단계로 묶는다.
  const typingTimerRef = useRef<number | null>(null);

  // 앞 맥락 문단의 문장 수 (1~5) — 마지막 선택을 기억한다.
  const [prependCount, setPrependCount] = useState<number>(() => {
    if (typeof window === "undefined") return 3;
    try {
      const n = parseInt(
        window.localStorage.getItem(PREPEND_COUNT_KEY) || "",
        10,
      );
      return Number.isNaN(n) ? 3 : Math.min(5, Math.max(1, n));
    } catch {
      return 3;
    }
  });
  const changePrependCount = useCallback((delta: number) => {
    setPrependCount((prev) => {
      const next = Math.min(5, Math.max(1, prev + delta));
      try {
        window.localStorage.setItem(PREPEND_COUNT_KEY, String(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const words = useMemo(() => countWords(row.content), [row.content]);
  const dirty = isRowDirty(row);
  // 이 지문에 개별 유형이 지정돼 있는지 — 유형 요약 표시·생성 포함 여부 기준.
  const hasTypes = overrideHasTypeCounts(row.override);
  // 이 지문에 개별 지정된 생성 모드 — 없으면 '미설정'(전체 공통 설정을 따름).
  // 우측 패널에서 이 지문을 선택해 모드를 고르면 여기에 반영된다.
  const rowMode: "manual" | "set" | null =
    row.override?.mode ?? (hasTypes ? "manual" : null);
  // 헤더 설정 배지 — 이 지문에 적용될 생성 설정을 한눈에 보여준다.
  // 미설정/유형(요약)/장문 세트, 그리고 유형 지정인데 아직 유형이 없는
  // 미완성 상태(생성 제외)는 점선 슬레이트(미설정) 톤으로 또렷하게 구분한다.
  const settingsBadge: {
    Icon: typeof SlidersHorizontal;
    label: string;
    title: string;
    tone: "neutral" | "configured" | "warn";
  } =
    rowMode === "set"
      ? {
          Icon: FileText,
          label:
            row.override?.setMembers && row.override.setMembers.length > 0
              ? `장문 세트 ${row.override.setMembers.length}`
              : "장문 세트",
          title: "이 지문으로 장문 세트를 구성합니다 — 클릭해 편집",
          tone: "configured",
        }
      : rowMode === "manual"
        ? hasTypes
          ? {
              Icon: SlidersHorizontal,
              label: overrideTypeSummary(row.override),
              title: "이 지문의 유형 설정 — 클릭해 편집",
              tone: "configured",
            }
          : {
              Icon: CircleAlert,
              label: "유형 지정 필요",
              title:
                "유형 지정 모드인데 아직 유형이 없어요 (생성 제외) — 클릭해 지정",
              tone: "warn",
            }
        : {
            Icon: CircleAlert,
            label: "유형 지정 필요",
            title: "아직 유형이 지정되지 않았어요 — 클릭해 지정",
            tone: "warn",
          };
  const locked =
    disabled || busy !== null || preview !== null || variantPreview !== null;
  const editorLocked =
    preview !== null || busy !== null || variantPreview !== null;

  const highlightSegments = useMemo(
    () => buildHighlightSegments(row.content, row.highlights),
    [row.content, row.highlights],
  );
  const hasPrependHl = row.highlights.some((h) => h.kind === "prepend");
  const hasParaphraseHl = row.highlights.some((h) => h.kind === "paraphrase");

  // textarea 는 글자 단위 hover 이벤트가 없으므로, 동일 메트릭으로 뒤에 깔린
  // 앞 맥락(prepend) / 출제 범위(range) 하이라이트를 삭제·해제한다.
  // 영역 텍스트를 잘라내면 setContent 의 하이라이트 보정으로 그 표시도 사라진다.
  const handleDeleteHighlightRegion = useCallback(
    (start: number, end: number) => {
      onPushHistory();
      onChangeContent(row.content.slice(0, start) + row.content.slice(end));
      setHlMenu(null);
    },
    [row.content, onPushHistory, onChangeContent],
  );

  // 백드롭의 하이라이트 mark 들에 마우스 좌표를 히트테스트한다. 변형(paraphrase)
  // 은 원문 미리보기 툴팁, 앞 맥락/출제 범위는 삭제·해제 액션 메뉴를 띄운다.
  const handleEditorMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const container = textareaRef.current?.parentElement;
      if (!container) {
        setOriginalTip(null);
        scheduleHlHide();
        return;
      }
      const marks =
        container.querySelectorAll<HTMLElement>("mark[data-hl-kind]");
      for (const mark of marks) {
        const kind = mark.dataset.hlKind;
        if (!kind) continue;
        for (const rect of mark.getClientRects()) {
          if (
            e.clientX >= rect.left &&
            e.clientX <= rect.right &&
            e.clientY >= rect.top &&
            e.clientY <= rect.bottom
          ) {
            const cRect = container.getBoundingClientRect();
            const base = {
              left: e.clientX - cRect.left,
              top: rect.bottom - cRect.top + 4,
              lineTop: rect.top - cRect.top,
            };
            if (kind === "paraphrase") {
              scheduleHlHide();
              const original = mark.dataset.hlOriginal || "";
              setOriginalTip((prev) => {
                const next = { ...base, text: original };
                if (prev && prev.text === next.text && prev.top === next.top) {
                  return prev;
                }
                return next;
              });
            } else {
              setOriginalTip(null);
              cancelHlHide();
              const start = Number(mark.dataset.hlStart);
              const end = Number(mark.dataset.hlEnd);
              setHlMenu((prev) => {
                const next = {
                  ...base,
                  kind: kind as "prepend" | "range",
                  start,
                  end,
                };
                if (
                  prev &&
                  prev.kind === next.kind &&
                  prev.start === next.start &&
                  prev.top === next.top
                ) {
                  return prev;
                }
                return next;
              });
            }
            return;
          }
        }
      }
      setOriginalTip(null);
      scheduleHlHide();
    },
    [scheduleHlHide, cancelHlHide],
  );

  const syncBackdropScroll = useCallback(() => {
    const el = textareaRef.current;
    const bd = backdropRef.current;
    if (el && bd) {
      bd.scrollTop = el.scrollTop;
      bd.scrollLeft = el.scrollLeft;
    }
    const rbd = rangeBackdropRef.current;
    if (el && rbd) {
      rbd.scrollTop = el.scrollTop;
      rbd.scrollLeft = el.scrollLeft;
    }
    // 내부 스크롤 시 선택 팝오버 위치도 따라가야 한다.
    if (el && selection) {
      setSelectionAnchor(
        measureSelectionAnchor(el, selection.start, selection.end),
      );
    }
  }, [selection]);
  useEffect(() => {
    syncBackdropScroll();
  }, [row.content, row.highlights, row.range, syncBackdropScroll]);

  // 생성 시 변형본으로 리바인드되면(passageId 교체) 본문이 외부에서 바뀐다 —
  // 이전 본문 기준의 선택/미리보기 오프셋은 무효이므로 즉시 폐기한다.
  useEffect(() => {
    setSelection(null);
    setPreview(null);
    setVariantPreview(null);
    avoidRef.current = [];
    variantAvoidRef.current = [];
  }, [row.passageId]);

  // ── 드래그 모션 코치 (첫 행) — 마운트 후 판정해 하이드레이션 안전.
  //    5사이클 후 자동 정지(세션 한정) → 이어서 앞 맥락 코치가 시작된다.
  const [dragCoachVisible, setDragCoachVisible] = useState(false);
  useEffect(() => {
    if (!dragCoach || readCoachDismissed(DRAG_COACH_KEY)) return;
    setDragCoachVisible(true);
    const stopTimer = window.setTimeout(
      () => setDragCoachVisible(false),
      DRAG_COACH_CYCLE_MS * 5 + 200,
    );
    return () => window.clearTimeout(stopTimer);
  }, [dragCoach]);
  const dismissDragCoach = useCallback((persist: boolean) => {
    setDragCoachVisible(false);
    if (!persist) return;
    try {
      window.localStorage.setItem(DRAG_COACH_KEY, "1");
    } catch {
      /* ignore */
    }
  }, []);

  // ── 앞 맥락 추가 모션 코치 — 드래그 코치가 완전히 끝난 뒤 1.2초 쉬고
  //    시작한다 (동시 재생 금지). 시작 지연 타이머 + cleanup 으로 마운트
  //    레이스(드래그 코치가 켜지기 직전 상태를 읽는 문제)를 차단.
  const [prependCoachVisible, setPrependCoachVisible] = useState(false);
  useEffect(() => {
    if (
      !dragCoach ||
      dragCoachVisible ||
      readCoachDismissed(PREPEND_COACH_KEY)
    ) {
      setPrependCoachVisible(false);
      return;
    }
    const startTimer = window.setTimeout(
      () => setPrependCoachVisible(true),
      1_200,
    );
    const stopTimer = window.setTimeout(
      () => setPrependCoachVisible(false),
      1_200 + PREPEND_COACH_CYCLE_MS * 3 + 200,
    );
    return () => {
      window.clearTimeout(startTimer);
      window.clearTimeout(stopTimer);
    };
  }, [dragCoach, dragCoachVisible]);
  const dismissPrependCoach = useCallback(() => {
    setPrependCoachVisible(false);
    try {
      window.localStorage.setItem(PREPEND_COACH_KEY, "1");
    } catch {
      /* ignore */
    }
  }, []);

  // 타이핑 버스트 타이머 정리.
  useEffect(
    () => () => {
      if (typingTimerRef.current !== null) {
        window.clearTimeout(typingTimerRef.current);
      }
    },
    [],
  );
  const endTypingBurst = useCallback(() => {
    if (typingTimerRef.current !== null) {
      window.clearTimeout(typingTimerRef.current);
      typingTimerRef.current = null;
    }
  }, []);

  // ── 텍스트 선택 추적 — 선택 좌표를 재서 액션 팝오버를 선택 근처에 띄운다 ──
  const handleSelect = useCallback(() => {
    const el = textareaRef.current;
    // 변형 미리보기/생성 중에는 에디터가 잠겨 있으므로 선택 액션도 막는다.
    if (!el || preview || variantPreview || busy) return;
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    if (end - start >= MIN_PARAPHRASE_CHARS) {
      setSelection({ start, end, text: row.content.slice(start, end) });
      setSelectionAnchor(measureSelectionAnchor(el, start, end));
      dispatchGenerateTourMilestone("workspace-text-selected");
      // 직접 드래그에 성공했다 — 코치는 임무 완료, 영구 종료.
      dismissDragCoach(true);
    } else {
      setSelection(null);
      setSelectionAnchor(null);
    }
  }, [row.content, preview, variantPreview, busy, dismissDragCoach]);

  // ── AI 문장 변형 ──
  const runParaphrase = useCallback(
    async (target: SelectionState, avoidTexts: string[]) => {
      setBusy("paraphrase");
      try {
        const r = await requestTransform({
          mode: "PARAPHRASE",
          passageText: row.content,
          selectedText: target.text,
          avoidTexts: avoidTexts.length > 0 ? avoidTexts : undefined,
        });
        setPreview({
          kind: "paraphrase",
          start: target.start,
          end: target.end,
          original: target.text,
          text: r.text,
          note: r.note,
        });
        dispatchGenerateTourMilestone("workspace-paraphrase-previewed");
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "AI 문장 변형에 실패했습니다.",
        );
      } finally {
        setBusy(null);
      }
    },
    [row.content],
  );

  const handleParaphraseClick = useCallback(() => {
    if (!selection || busy || disabled || preview || variantPreview) return;
    avoidRef.current = [];
    void runParaphrase(selection, []);
  }, [selection, busy, disabled, preview, variantPreview, runParaphrase]);

  // ── AI 복원 (문제 형태 → 원문) — intake 붙여넣기와 동일 API·플로우 ──
  const runRestore = useCallback(async () => {
    setBusy("restore");
    try {
      const res = await fetch("/api/workbench/restore-passage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ passageText: row.content.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.error || "복원에 실패했습니다.");
        return;
      }
      const restoredText = formatExtractedTextForDisplay(
        String(data.restoredText || row.content),
      );
      // undo 1단계로 묶어 적용 — 마음에 안 들면 ↶ 한 번으로 원복.
      endTypingBurst();
      onPushHistory();
      onChangeContent(restoredText);
      setSelection(null);
      const changeCount = Array.isArray(data.changes) ? data.changes.length : 0;
      if (data.degraded) {
        toast.warning("AI 복원에 실패해 마커 제거만 적용했습니다.");
      } else if (data.status === "NO_RESTORATION_NEEDED") {
        toast.info("이미 깨끗한 지문이에요 — 크레딧은 차감되지 않았습니다.");
      } else {
        toast.success(
          `복원이 적용됐습니다 (변경 ${changeCount}건) — 되돌리기(↶)로 취소할 수 있어요.`,
        );
      }
      const firstWarning = Array.isArray(data.warnings)
        ? data.warnings[0]
        : null;
      if (firstWarning) toast.info(String(firstWarning));
    } catch {
      toast.error("복원 요청 중 오류가 발생했습니다.");
    } finally {
      setBusy(null);
    }
  }, [row.content, endTypingBurst, onPushHistory, onChangeContent]);

  const handleRestoreClick = useCallback(() => {
    if (locked || row.content.trim().length < 20) return;
    if (readRestoreIntroDismissed()) {
      void runRestore();
    } else {
      setRestoreIntroOpen(true);
    }
  }, [locked, row.content, runRestore]);

  // ── 앞 맥락 추가 ──
  const runPrepend = useCallback(
    async (avoidTexts: string[]) => {
      setBusy("prepend");
      try {
        const r = await requestTransform({
          mode: "PREPEND",
          passageText: row.content,
          avoidTexts: avoidTexts.length > 0 ? avoidTexts : undefined,
          sentenceCount: prependCount,
        });
        setPreview({ kind: "prepend", text: r.text, note: r.note });
        dispatchGenerateTourMilestone("workspace-prepend-previewed");
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "앞 문단 생성에 실패했습니다.",
        );
      } finally {
        setBusy(null);
      }
    },
    [row.content, prependCount],
  );

  const handlePrependClick = useCallback(() => {
    if (busy || preview || disabled) return;
    dismissPrependCoach();
    avoidRef.current = [];
    void runPrepend([]);
  }, [busy, preview, disabled, runPrepend, dismissPrependCoach]);

  // ── 전체 변형 (관련/상반 주제·난이도·길이 → 새 지문) ──
  const runVariant = useCallback(
    async (
      mode: WholePassageTransformMode,
      direction: VariantDirection | undefined,
      avoidTexts: string[],
    ) => {
      setBusy("variant");
      try {
        const r = await requestTransform({
          mode,
          passageText: row.content,
          direction,
          avoidTexts: avoidTexts.length > 0 ? avoidTexts : undefined,
        });
        if (!r.text.trim()) throw new Error("변형 결과가 비어 있습니다.");
        variantAvoidRef.current = [...variantAvoidRef.current, r.text].slice(-5);
        setVariantPreview((prev) => ({
          mode,
          direction,
          label: variantModeLabel(mode, direction),
          text: r.text,
          // 사용자가 이미 제목을 손봤으면(다시 생성) 그 제목을 유지한다.
          title:
            prev?.title?.trim() ||
            r.title.trim() ||
            defaultVariantTitle(row.title, mode, direction),
          summary: r.summary,
        }));
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "변형 지문 생성에 실패했습니다.",
        );
      } finally {
        setBusy(null);
      }
    },
    [row.content, row.title],
  );

  const handleVariantPick = useCallback(
    (action: VariantAction) => {
      if (busy || preview || variantPreview || disabled) return;
      if (row.content.trim().length < 20) {
        toast.error("변형하려면 지문이 조금 더 길어야 합니다. (최소 20자)");
        return;
      }
      variantAvoidRef.current = [];
      void runVariant(action.mode, action.direction, []);
    },
    [busy, preview, variantPreview, disabled, row.content, runVariant],
  );

  const handleRegenerateVariant = useCallback(() => {
    if (!variantPreview) return;
    void runVariant(
      variantPreview.mode,
      variantPreview.direction,
      variantAvoidRef.current,
    );
  }, [variantPreview, runVariant]);

  const handleAddVariantClick = useCallback(async () => {
    if (!variantPreview || variantAdding || disabled) return;
    setVariantAdding(true);
    try {
      const ok = await onAddVariant({
        sourcePassageId: row.variantOfId ?? row.passageId,
        title: variantPreview.title.trim(),
        content: variantPreview.text,
        mode: variantPreview.mode,
        direction: variantPreview.direction,
      });
      if (ok) {
        setVariantPreview(null);
        variantAvoidRef.current = [];
      }
    } finally {
      setVariantAdding(false);
    }
  }, [variantPreview, variantAdding, disabled, onAddVariant, row.variantOfId, row.passageId]);

  const handleCancelVariant = useCallback(() => {
    setVariantPreview(null);
    variantAvoidRef.current = [];
  }, []);

  const setVariantTitle = useCallback((title: string) => {
    setVariantPreview((prev) => (prev ? { ...prev, title } : prev));
  }, []);

  // ── 미리보기 액션 ──
  const handleRegenerate = useCallback(() => {
    if (!preview) return;
    avoidRef.current = [...avoidRef.current, preview.text].slice(-5);
    if (preview.kind === "paraphrase") {
      void runParaphrase(
        { start: preview.start, end: preview.end, text: preview.original },
        avoidRef.current,
      );
    } else {
      void runPrepend(avoidRef.current);
    }
  }, [preview, runParaphrase, runPrepend]);

  const handleApplyPreview = useCallback(() => {
    if (!preview || disabled) return;
    endTypingBurst();
    if (preview.kind === "paraphrase") {
      // 불변식: 적용 시점의 본문 구간이 미리보기를 만들 때의 원문과 같아야
      // 한다 — 외부 교체 등으로 어긋났으면 엉뚱한 위치 splice 를 차단한다.
      if (row.content.slice(preview.start, preview.end) !== preview.original) {
        toast.error(
          "본문이 변경되어 변형을 적용할 수 없습니다. 문장을 다시 선택해주세요.",
        );
        setPreview(null);
        setSelection(null);
        return;
      }
      const next =
        row.content.slice(0, preview.start) +
        preview.text +
        row.content.slice(preview.end);
      onApplyAi(next, {
        start: preview.start,
        end: preview.start + preview.text.length,
        kind: "paraphrase",
        original: preview.original,
      });
      dispatchGenerateTourMilestone("workspace-paraphrase-applied");
    } else {
      const next = `${preview.text} ${row.content.trimStart()}`;
      onApplyAi(next, {
        start: 0,
        end: preview.text.length,
        kind: "prepend",
      });
      dispatchGenerateTourMilestone("workspace-prepend-applied");
    }
    setPreview(null);
    setSelection(null);
    avoidRef.current = [];
    toast.success(
      "변형이 적용됐습니다. 적용된 구간은 본문에 색으로 표시돼요 — 되돌리기(↶)로 취소할 수 있습니다.",
    );
  }, [preview, disabled, row.content, onApplyAi, endTypingBurst]);

  const handleCancelPreview = useCallback(() => {
    setPreview(null);
    avoidRef.current = [];
  }, []);

  // ── undo / redo ──
  const handleUndo = useCallback(() => {
    if (locked || row.past.length === 0) return;
    endTypingBurst();
    setSelection(null);
    onUndo();
  }, [locked, row.past.length, endTypingBurst, onUndo]);

  const handleRedo = useCallback(() => {
    if (locked || row.future.length === 0) return;
    endTypingBurst();
    setSelection(null);
    onRedo();
  }, [locked, row.future.length, endTypingBurst, onRedo]);

  // ── 출제 범위 ──
  const handleSetRangeFromSelection = useCallback(() => {
    if (!selection || disabled || busy || preview || variantPreview) return;
    if (selection.end - selection.start < MIN_RANGE_CHARS) {
      toast.error("출제 범위는 조금 더 길게 선택해주세요.");
      return;
    }
    onSetRange({ start: selection.start, end: selection.end });
    dispatchGenerateTourMilestone("workspace-range-set");
    setSelection(null);
    toast.success("출제 범위가 지정됐습니다. 이 구간만으로 문제를 생성합니다.");
  }, [selection, disabled, busy, preview, variantPreview, onSetRange]);

  const rangePreview = useMemo(() => {
    if (!row.range) return null;
    const sliced = row.content.slice(row.range.start, row.range.end).trim();
    return { words: countWords(sliced) };
  }, [row.range, row.content]);

  const collapsedPreview =
    row.content.trim().slice(0, 60) +
    (row.content.trim().length > 60 ? "…" : "");
  const firstSentence = row.content.trim().split(/(?<=[.!?])\s+/)[0] || "";

  return (
    // 행 아무 곳이나 누르면 우측 '유형·생성 설정'이 이 지문을 편집한다.
    // (setActive 는 멱등 — 같은 값이면 React 가 리렌더를 건너뛴다.)
    <div
      onClick={onSetActive}
      style={{
        // 카드 높이를 워크스페이스 본문 높이(--ws-body-h, WorkspaceShell이 노출)에
        // 맞춰 캡한다 — 지문이 길어도 본문(textarea)이 카드 안에서 스크롤되고,
        // 하단 '문제 생성' 버튼은 스크롤 없이 항상 보인다. -130px = 본문 안의
        // 인테이크 탭(44)·워크스페이스 헤더(44)·그리드 패딩(24)·여유 분.
        maxHeight: "calc(var(--ws-body-h, 600px) - 130px)",
      }}
      className={
        "relative flex h-full flex-col overflow-hidden rounded-lg border bg-white shadow-sm transition-[box-shadow,opacity,border-color] " +
        (active
          ? "border-2 border-violet-600 ring-2 ring-violet-300"
          : "border-slate-200 hover:border-violet-200 ") +
        // 스포트라이트 — 다른 지문이 설정 대상일 때 이 행은 흐리게 물러나
        // 선택 지문 ↔ 우측 설정이 한 쌍으로 도드라진다(호버하면 다시 또렷).
        (dimmed && !active ? "opacity-45 hover:opacity-100" : "")
      }
    >
      {/* ── 설정 테더 탭 — 선택된 카드 우측 가장자리에 보라 ▶ 탭을 붙여,
          오른쪽 설정 패널의 좌측 스파인(◀)과 색·방향으로 이어지며 "이 카드의
          설정이 저기"라는 연결을 만든다. 접힌 카드는 헤더 우측 버튼과 겹치므로
          펼친 상태에서만 노출. */}
      {active && !row.collapsed ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute right-0 top-1/2 z-10 flex h-8 w-[18px] -translate-y-1/2 items-center justify-center rounded-l-full bg-violet-600 text-white shadow-sm"
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </span>
      ) : null}
      {/* ── 헤더 (40px 고정 — 모든 컨트롤 h-7, 아이콘 h-4) ── */}
      <div
        className={
          "flex h-10 items-center gap-2 pl-2.5 pr-1.5 " +
          (row.collapsed ? "" : "border-b border-slate-100")
        }
      >
        {/* 제목 영역은 더 이상 접기/펼치기를 토글하지 않는다 — 여닫기는
            오른쪽 끝 셰브론 버튼으로만. (행 클릭은 바깥 div 에서 '이 지문
            설정 대상 선택'으로 처리되므로 여기 클릭해도 선택만 된다.) */}
        <div className="flex h-full min-w-0 flex-1 items-center gap-2 text-left">
          {/* 다중 선택 체크박스 — 헤더의 전체선택·일괄 삭제 대상이 된다.
              카드의 '설정 대상 선택'(active, 굵은 보라 테두리로 표시)과는
              별개 개념이라, 클릭이 카드 선택(onSetActive)으로 전파되지 않게 막는다. */}
          <button
            type="button"
            role="checkbox"
            aria-checked={selected}
            aria-label="이 지문 선택 (일괄 삭제용)"
            onClick={(e) => {
              e.stopPropagation();
              onToggleSelected?.();
            }}
            title="선택 — 헤더 휴지통으로 선택한 지문을 한 번에 제거"
            className={
              "flex h-[18px] w-[18px] shrink-0 cursor-pointer items-center justify-center rounded-[5px] border transition-colors " +
              (selected
                ? "border-violet-600 bg-violet-600 text-white"
                : "border-slate-300 bg-white text-transparent hover:border-violet-400")
            }
          >
            <Check className="h-3 w-3" strokeWidth={3} aria-hidden="true" />
          </button>
          <span className="flex h-[22px] min-w-[22px] shrink-0 items-center justify-center rounded-md bg-violet-600 px-1 text-[11px] font-bold leading-none text-white tabular-nums">
            {index + 1}
          </span>
          <span className="min-w-[72px] shrink truncate text-[12.5px] font-semibold text-slate-700">
            {row.title}
          </span>
          {row.variantOfId ? (
            <span
              className="shrink-0 rounded-sm bg-violet-600 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white"
              title="편집된 본문이 새 지문(변형본)으로 저장됐습니다. 원본 지문은 그대로 보존됩니다."
            >
              변형본
            </span>
          ) : null}
          {dirty ? (
            <span
              className="shrink-0 rounded-sm bg-violet-50 px-1.5 py-0.5 text-[10px] font-bold leading-none text-violet-600 ring-1 ring-inset ring-violet-200"
              title="본문이 수정됐습니다. 생성 시 변형본이 새 지문으로 저장됩니다."
            >
              수정됨
            </span>
          ) : null}
          {/* 상태 배지 — 생성 플랜 / 난이도 / 유형 을 제목 옆(왼쪽)에 모은다.
              (단어 수는 입력창 우하단 푸터로 이동) */}
          {/* 생성 플랜 뱃지 — 개별 지정이 있으면 그 플랜을(또렷하게), 없으면
              전체 공통 플랜을 기본 뱃지(흐리게)로 보여준다. 프리미엄은 보라색. */}
          {(() => {
            const custom = !!row.override?.generationPlan;
            const isPremium =
              (row.override?.generationPlan ?? globalGenerationPlan) ===
              "PREMIUM";
            const PlanIcon = isPremium ? Gem : PearlIcon;
            return (
              <span
                title={
                  custom
                    ? "이 지문에 지정된 생성 플랜"
                    : "전체 공통 생성 플랜 (기본값) — 지문별 설정에서 따로 지정 가능"
                }
                className={
                  "flex h-7 shrink-0 items-center gap-1 rounded-md border px-1.5 text-[10.5px] font-semibold " +
                  (isPremium
                    ? custom
                      ? "border-violet-300 bg-violet-100 text-violet-700"
                      : "border-violet-200 bg-violet-50 text-violet-600"
                    : custom
                      ? "border-slate-200 bg-slate-50 text-slate-600"
                      : "border-slate-200 bg-white text-slate-400")
                }
              >
                <PlanIcon className="h-3 w-3 shrink-0" aria-hidden="true" />
                {isPremium ? "프리미엄" : "일반"}
              </span>
            );
          })()}
          {/* 난이도 뱃지 — 개별 지정이 있으면 그 난이도를(또렷하게), 없으면
              전체 공통 난이도를 기본 뱃지(흐리게)로 항상 보여준다. */}
          {(() => {
            const custom = !!row.override?.difficulty;
            const label = difficultyLabel(
              row.override?.difficulty ?? globalDifficulty,
            );
            if (!label) return null;
            return (
              <span
                title={
                  custom
                    ? "이 지문에 지정된 난이도"
                    : "전체 공통 난이도 (기본값) — 지문별 설정에서 따로 지정 가능"
                }
                className={
                  "flex h-7 shrink-0 items-center rounded-md border px-1.5 text-[10.5px] font-semibold " +
                  (custom
                    ? "border-slate-200 bg-slate-50 text-slate-600"
                    : "border-slate-200 bg-white text-slate-400")
                }
              >
                {label}
              </span>
            );
          })()}
          {row.collapsed ? (
            <span className="min-w-0 flex-1 truncate text-[11px] text-slate-400">
              {collapsedPreview}
            </span>
          ) : (
            <span className="min-w-0 flex-1" aria-hidden="true" />
          )}
        </div>

        <span className="h-4 w-px shrink-0 bg-slate-200" aria-hidden="true" />
        <RowHistoryPopover
          passageIds={[row.passageId, row.variantOfId].filter(
            (v): v is string => !!v,
          )}
          sessionQueue={sessionQueue}
          savedQuestionCount={savedQuestionCount}
          questions={questions}
          onOpenDetail={onOpenQuestionDetail}
        />
        <button
          type="button"
          onClick={onToggleCollapsed}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
          title={row.collapsed ? "펼치기" : "접기"}
        >
          {row.collapsed ? (
            <ChevronDown className="h-4 w-4" aria-hidden="true" />
          ) : (
            <ChevronUp className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
        <button
          type="button"
          onClick={onRemove}
          disabled={disabled}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500 disabled:opacity-40"
          title="워크스페이스에서 제거 (지문은 삭제되지 않음)"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {!row.collapsed ? (
        <div className="flex min-h-0 flex-1 flex-col space-y-2 px-2.5 py-2.5">
          {/* ── AI 도구 바 ── */}
          <div
            className="flex min-h-7 flex-wrap items-center gap-x-2 gap-y-1.5"
            data-generate-tour="workspace-ai-tools"
          >
            <button
              type="button"
              onClick={handleRestoreClick}
              disabled={locked || row.content.trim().length < 20}
              title="문제 형태 지문을 원문으로 AI 복원"
              className="flex h-7 shrink-0 items-center gap-1.5 rounded-md bg-violet-600 px-4 text-[11.5px] font-bold text-white shadow-sm transition-colors hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy === "restore" ? (
                <Loader2
                  className="h-3.5 w-3.5 animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              {busy === "restore" ? "복원 중" : "AI 복원"}
              {busy !== "restore" ? (
                <CreditCostChip
                  amount={CREDIT_COSTS.PASSAGE_RESTORATION}
                  className="rounded-sm bg-white/20 px-1 py-px text-[10px]"
                />
              ) : null}
            </button>
            <VariantMenuButton
              disabled={locked || row.content.trim().length < 20}
              busy={busy === "variant"}
              onPick={handleVariantPick}
            />
            {rangePreview ? (
              // 뱃지 색을 범위 하이라이트(amber-100)와 같은 노란 계열로 맞춰,
              // 'X'로 해제하는 이 버튼이 그 노란 표시를 끄는 것임을 한눈에 보이게.
              <span className="flex h-7 shrink-0 items-center gap-1.5 rounded-md bg-amber-300 pl-2 pr-1 text-[11px] font-bold text-amber-900 ring-1 ring-inset ring-amber-400/60">
                <Scissors className="h-3 w-3" aria-hidden="true" />
                출제 범위 {rangePreview.words}/{words} words
                <button
                  type="button"
                  onClick={() => onSetRange(null)}
                  className="rounded-sm p-0.5 transition-colors hover:bg-amber-500/30"
                  title="범위 해제 (전체 지문으로 출제)"
                >
                  <X className="h-3 w-3" aria-hidden="true" />
                </button>
              </span>
            ) : null}
          </div>

          {/* ── 앞 문단 미리보기 ── */}
          {preview?.kind === "prepend" ? (
            <PrependPreviewPanel
              paragraph={preview.text}
              firstSentence={firstSentence.split(/\s+/).slice(0, 8).join(" ")}
              note={preview.note}
              busy={busy !== null}
              disabled={disabled}
              onApply={handleApplyPreview}
              onRegenerate={handleRegenerate}
              onCancel={handleCancelPreview}
            />
          ) : null}

          {/* ── 전체 변형(새 지문) 미리보기 ── */}
          {variantPreview ? (
            <WholePassageVariantPreviewPanel
              label={variantPreview.label}
              variantText={variantPreview.text}
              sourceWords={words}
              title={variantPreview.title}
              summary={variantPreview.summary}
              busy={busy === "variant" || variantAdding}
              disabled={disabled}
              onTitleChange={setVariantTitle}
              onApply={handleAddVariantClick}
              onRegenerate={handleRegenerateVariant}
              onCancel={handleCancelVariant}
            />
          ) : null}

          {/* ── 본문 에디터 (앞 맥락 삽입 바 + 하이라이트 백드롭) ── */}
          <div
            data-generate-tour="workspace-editor"
            className={
              "flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border transition-colors " +
              (editorLocked
                ? "border-slate-200 bg-slate-50"
                : "border-slate-200 bg-white focus-within:border-violet-300 focus-within:ring-2 focus-within:ring-violet-100")
            }
          >
            {/* 앞 맥락 삽입 지점 — 점선 가운데 '+' 알약이 떠 있는 insertion
                point 패턴. "클릭하면 이 줄 자리에 문단이 끼워 넣어진다"가
                모양만으로 읽히도록 본문 첫 글자 바로 위에 둔다. */}
            <div className="relative flex items-center gap-2 border-b border-dashed border-violet-200/80 bg-violet-50/30 px-2.5 py-1.5">
              <span
                className="h-0 min-w-3 flex-1 border-t border-dashed border-violet-300/80"
                aria-hidden="true"
              />
              {/* 알약 하나에 [추가 버튼 | 문장 수 스테퍼]를 함께 담는다 —
                  button 안에 button 을 중첩할 수 없어 컨테이너는 div. */}
              <div className="flex shrink-0 items-stretch overflow-hidden rounded-full border border-violet-300 bg-white shadow-sm">
                <button
                  type="button"
                  onClick={handlePrependClick}
                  disabled={locked}
                  data-generate-tour="workspace-prepend-button"
                  title={`지문 맥락과 자연스럽게 이어지는 앞 문단(${prependCount}문장)을 AI가 생성해 이 위치에 끼워 넣습니다`}
                  className="flex min-w-0 cursor-pointer items-center gap-1.5 py-0.5 pl-2 pr-2 text-[11.5px] font-bold text-violet-600 transition-colors hover:bg-violet-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busy === "prepend" ? (
                    <Loader2
                      className="h-3.5 w-3.5 shrink-0 animate-spin"
                      aria-hidden="true"
                    />
                  ) : (
                    <Plus className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  )}
                  <span className="truncate">
                    {busy === "prepend"
                      ? "앞 문단을 생성하고 있어요…"
                      : "앞 맥락 문단 추가"}
                  </span>
                  <CreditCostChip
                    amount={CREDIT_COSTS.PASSAGE_TRANSFORM}
                    className="shrink-0 rounded-sm bg-white px-1 py-px text-[10px] text-violet-500 ring-1 ring-inset ring-violet-200"
                  />
                </button>
                <span
                  className="my-1 w-px shrink-0 bg-violet-200"
                  aria-hidden="true"
                />
                <div
                  className="flex shrink-0 items-center gap-0.5 px-1"
                  title="생성할 앞 문단의 문장 수 (1~5)"
                >
                  <button
                    type="button"
                    onClick={() => changePrependCount(-1)}
                    disabled={locked || prependCount <= 1}
                    className="flex h-5 w-5 items-center justify-center rounded-full text-violet-400 transition-colors hover:bg-violet-100/70 hover:text-violet-600 disabled:cursor-not-allowed disabled:opacity-35"
                    aria-label="앞 문단 문장 수 줄이기"
                  >
                    <Minus className="h-3 w-3" aria-hidden="true" />
                  </button>
                  <span className="w-[38px] text-center text-[11px] font-bold tabular-nums text-violet-700">
                    {prependCount}문장
                  </span>
                  <button
                    type="button"
                    onClick={() => changePrependCount(1)}
                    disabled={locked || prependCount >= 5}
                    className="flex h-5 w-5 items-center justify-center rounded-full text-violet-400 transition-colors hover:bg-violet-100/70 hover:text-violet-600 disabled:cursor-not-allowed disabled:opacity-35"
                    aria-label="앞 문단 문장 수 늘리기"
                  >
                    <Plus className="h-3 w-3" aria-hidden="true" />
                  </button>
                </div>
              </div>
              <span
                className="h-0 min-w-3 flex-1 border-t border-dashed border-violet-300/80"
                aria-hidden="true"
              />

              {/* ── 앞 맥락 모션 코치 — ① 커서가 본문에서 올라와 바를 클릭
                  ② 바로 아래에 'AI 앞 문단' 고스트 패널이 펼쳐지며 쉬머
                  라인이 생성되는 결과까지 시연 (3회 후 자동 정지) ── */}
              {prependCoachVisible && !locked ? (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 z-[2]"
                >
                  <div className="ws-prepcoach-wash absolute inset-0 bg-violet-400/20 opacity-0" />
                  <span className="ws-prepcoach-ring absolute left-[96px] top-1/2 h-7 w-7 rounded-full border-2 border-violet-500/70 opacity-0" />
                  <MousePointer2 className="ws-prepcoach-cursor absolute left-[96px] top-[7px] h-4 w-4 text-violet-700 opacity-0 drop-shadow-sm" />
                  {/* 클릭 결과로 삽입되는 고스트 문단 */}
                  <div className="ws-prepcoach-ghost absolute inset-x-2 top-full mt-1.5 origin-top rounded-md border border-violet-200 bg-white opacity-0 shadow-lg shadow-violet-100/70">
                    <div className="flex items-center gap-1.5 px-3 pt-2">
                      <span className="rounded-sm bg-violet-600 px-1 py-px text-[9px] font-bold leading-none text-white">
                        AI
                      </span>
                      <span className="text-[10.5px] font-bold text-violet-600">
                        이어지는 앞 문단이 이 자리에 생성돼요
                      </span>
                    </div>
                    <div className="space-y-[7px] px-3 pb-3 pt-2">
                      <div className="ws-prepcoach-line h-[9px] w-[94%] rounded-sm" />
                      <div className="ws-prepcoach-line h-[9px] w-[88%] rounded-sm" />
                      <div className="ws-prepcoach-line h-[9px] w-[61%] rounded-sm" />
                    </div>
                  </div>
                  <style>{`
                    @keyframes ws-prepcoach-cursor {
                      0% { transform: translate(170px, 62px) scale(1); opacity: 0; }
                      7% { transform: translate(170px, 62px) scale(1); opacity: 1; }
                      24% { transform: translate(0, 0) scale(1); opacity: 1; }
                      28% { transform: translate(0, 0) scale(0.78); opacity: 1; }
                      33% { transform: translate(0, 0) scale(1); opacity: 1; }
                      46% { transform: translate(0, 0) scale(1); opacity: 1; }
                      56%, 100% { transform: translate(0, 0) scale(1); opacity: 0; }
                    }
                    @keyframes ws-prepcoach-ring {
                      0%, 25% { opacity: 0; transform: translate(-50%, -50%) scale(0.3); }
                      30% { opacity: 0.9; transform: translate(-50%, -50%) scale(0.55); }
                      44%, 100% { opacity: 0; transform: translate(-50%, -50%) scale(1.7); }
                    }
                    @keyframes ws-prepcoach-wash {
                      0%, 24% { opacity: 0; }
                      30% { opacity: 1; }
                      48%, 100% { opacity: 0; }
                    }
                    @keyframes ws-prepcoach-ghost {
                      0%, 30% { opacity: 0; transform: scaleY(0.35); }
                      37% { opacity: 1; transform: scaleY(0.55); }
                      48% { opacity: 1; transform: scaleY(1); }
                      86% { opacity: 1; transform: scaleY(1); }
                      96%, 100% { opacity: 0; transform: scaleY(1); }
                    }
                    @keyframes ws-prepcoach-line {
                      0% { background-position: 130% 0; }
                      100% { background-position: -70% 0; }
                    }
                    .ws-prepcoach-cursor { animation: ws-prepcoach-cursor 5.4s ease-in-out 3; }
                    .ws-prepcoach-ring { animation: ws-prepcoach-ring 5.4s ease-in-out 3; }
                    .ws-prepcoach-wash { animation: ws-prepcoach-wash 5.4s ease-in-out 3; }
                    .ws-prepcoach-ghost { animation: ws-prepcoach-ghost 5.4s ease-in-out 3; }
                    .ws-prepcoach-line {
                      background: linear-gradient(90deg, #dbeafe 25%, #93c5fd 50%, #dbeafe 75%);
                      background-size: 200% 100%;
                      animation: ws-prepcoach-line 1.4s linear infinite;
                    }
                  `}</style>
                </div>
              ) : null}
            </div>

            <div className="relative flex min-h-0 flex-1 flex-col">
              {/* 출제 범위 백드롭 — 지정된 구간을 형광펜처럼 칠한다.
                  AI 하이라이트 백드롭과 같은 메트릭의 별도 레이어. */}
              {row.range ? (
                <div
                  ref={rangeBackdropRef}
                  aria-hidden="true"
                  style={EDITOR_TEXT_STYLE}
                  className="pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words py-2 pl-3 pr-16 text-transparent"
                >
                  <span>
                    {row.content.slice(
                      0,
                      Math.min(row.range.start, row.content.length),
                    )}
                  </span>
                  <mark
                    data-hl-kind="range"
                    data-hl-start={Math.min(
                      row.range.start,
                      row.content.length,
                    )}
                    data-hl-end={Math.min(row.range.end, row.content.length)}
                    className="rounded-[2px] bg-amber-100 text-transparent"
                  >
                    {row.content.slice(
                      Math.min(row.range.start, row.content.length),
                      Math.min(row.range.end, row.content.length),
                    )}
                  </mark>
                  <span>
                    {row.content.slice(
                      Math.min(row.range.end, row.content.length),
                    )}
                  </span>
                </div>
              ) : null}
              {/* 하이라이트 백드롭 — textarea 와 동일 메트릭(px-3 py-2,
                  13px/relaxed)으로 뒤에 깔린다. 글자는 투명, 배경만 칠한다. */}
              {row.highlights.length > 0 ? (
                <div
                  ref={backdropRef}
                  aria-hidden="true"
                  style={EDITOR_TEXT_STYLE}
                  className="pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words py-2 pl-3 pr-16 text-transparent"
                >
                  {(() => {
                    // content 기준 누적 오프셋 — 호버 메뉴가 이 구간을 삭제할
                    // 수 있도록 mark 에 start/end 를 실어 보낸다.
                    let acc = 0;
                    return highlightSegments.map((seg, i) => {
                      const start = acc;
                      acc += seg.text.length;
                      const end = acc;
                      return seg.kind ? (
                        <mark
                          key={i}
                          data-hl-kind={seg.kind}
                          data-hl-start={start}
                          data-hl-end={end}
                          data-hl-original={
                            seg.kind === "paraphrase" ? seg.original : undefined
                          }
                          className={
                            "rounded-[2px] text-transparent " +
                            (seg.kind === "prepend"
                              ? "bg-violet-100"
                              : "bg-orange-200/80")
                          }
                        >
                          {seg.text}
                        </mark>
                      ) : (
                        <span key={i}>{seg.text}</span>
                      );
                    });
                  })()}
                </div>
              ) : null}
              <Textarea
                ref={textareaRef}
                value={row.content}
                onChange={(e) => {
                  dismissDragCoach(true);
                  if (row.range) {
                    toast.info("본문이 수정되어 출제 범위가 해제됐습니다.");
                  }
                  // 연속 타이핑은 버스트 1개 = undo 1단계로 묶는다.
                  if (typingTimerRef.current === null) {
                    onPushHistory();
                  } else {
                    window.clearTimeout(typingTimerRef.current);
                  }
                  typingTimerRef.current = window.setTimeout(() => {
                    typingTimerRef.current = null;
                  }, TYPING_BURST_MS);
                  onChangeContent(e.target.value);
                  setSelection(null);
                }}
                onSelect={handleSelect}
                onScroll={() => {
                  syncBackdropScroll();
                  setOriginalTip(null);
                  setHlMenu(null);
                }}
                onMouseMove={handleEditorMouseMove}
                onMouseLeave={() => {
                  setOriginalTip(null);
                  scheduleHlHide();
                }}
                readOnly={editorLocked}
                disabled={disabled}
                spellCheck={false}
                style={EDITOR_TEXT_STYLE}
                className={
                  "relative h-full min-h-[180px] flex-1 resize-none rounded-none border-0 bg-transparent py-2 pl-3 pr-16 shadow-none focus-visible:ring-0 " +
                  (editorLocked ? "text-slate-500" : "")
                }
                placeholder="지문 본문"
              />

              {/* ── undo / redo — 입력창 우상단에 떠 있는 컨트롤. 본문은 pr-16
                  으로 우측 거터를 비워 글자가 줄바꿈돼 버튼에 가려지지 않는다. ── */}
              <div className="absolute right-1.5 top-1.5 z-[4] flex items-center gap-0.5 rounded-md border border-slate-200 bg-white/90 p-0.5 shadow-sm">
                <button
                  type="button"
                  onClick={handleUndo}
                  disabled={locked || row.past.length === 0}
                  title="되돌리기 — 직전 편집·AI 적용을 취소합니다"
                  className="flex h-6 w-6 items-center justify-center rounded text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 disabled:cursor-not-allowed disabled:opacity-35"
                >
                  <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={handleRedo}
                  disabled={locked || row.future.length === 0}
                  title="다시 실행 — 되돌린 편집을 다시 적용합니다"
                  className="flex h-6 w-6 items-center justify-center rounded text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 disabled:cursor-not-allowed disabled:opacity-35"
                >
                  <Redo2 className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>

              {/* ── 변형 문장 원문 툴팁 — 하늘색 하이라이트 위에 커서를
                  올리면 변형 전 문장을 보여준다 ── */}
              {originalTip ? (
                <div
                  ref={originalTipRef}
                  className="pointer-events-none absolute z-[3] w-max max-w-[min(440px,85%)] rounded-md border border-orange-200 bg-white px-2.5 py-1.5 shadow-lg shadow-orange-100/60"
                  style={{ left: originalTip.left, top: originalTip.top }}
                >
                  <div className="mb-0.5 text-[10px] font-bold text-orange-600">
                    변형 전 원문
                  </div>
                  <div className="line-clamp-4 whitespace-pre-wrap text-[11.5px] leading-relaxed text-slate-700">
                    {originalTip.text}
                  </div>
                </div>
              ) : null}

              {/* ── 하이라이트 호버 액션 — 앞 맥락(보라)·출제 범위(노랑)
                  하이라이트 위에 커서를 올리면 삭제/해제 버튼이 뜬다. ── */}
              {hlMenu ? (
                <div
                  ref={hlMenuRef}
                  onMouseEnter={cancelHlHide}
                  onMouseLeave={scheduleHlHide}
                  className={
                    "absolute z-[4] flex items-center gap-1 rounded-lg border bg-white px-1.5 py-1 shadow-lg " +
                    (hlMenu.kind === "range"
                      ? "border-amber-200 shadow-amber-100/60"
                      : "border-violet-200 shadow-violet-100/60")
                  }
                  style={{ left: hlMenu.left, top: hlMenu.top }}
                >
                  <span
                    className={
                      "pl-1 pr-0.5 text-[10.5px] font-bold " +
                      (hlMenu.kind === "range"
                        ? "text-amber-700"
                        : "text-violet-700")
                    }
                  >
                    {hlMenu.kind === "range" ? "출제 범위" : "추가된 앞 맥락"}
                  </span>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      if (hlMenu.kind === "range") {
                        onSetRange(null);
                        setHlMenu(null);
                      } else {
                        handleDeleteHighlightRegion(hlMenu.start, hlMenu.end);
                      }
                    }}
                    className="flex h-6 items-center gap-1 rounded-md px-1.5 text-[11px] font-semibold text-rose-600 transition-colors hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Trash2 className="h-3 w-3" aria-hidden="true" />
                    {hlMenu.kind === "range" ? "범위 해제" : "삭제"}
                  </button>
                </div>
              ) : null}

              {/* ── 드래그 모션 코치 — 고스트 커서가 첫 줄을 쓸며 선택
                  하이라이트가 자라나는 루프. 실제 드래그/편집 시 영구 종료. ── */}
              {dragCoachVisible && !editorLocked && !disabled ? (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-0 top-0 z-[2]"
                >
                  <div className="relative mx-3 mt-2 h-[21px]">
                    <div className="ws-dragcoach-band absolute left-0 top-0 h-full rounded-[3px] bg-violet-500/25 ring-1 ring-inset ring-violet-400/30" />
                    <MousePointer2
                      className="ws-dragcoach-cursor absolute top-[3px] h-4 w-4 text-violet-700 drop-shadow-sm"
                      aria-hidden="true"
                    />
                  </div>
                  <div className="ws-dragcoach-chip pointer-events-auto mx-3 mt-1.5 inline-flex items-center gap-1.5 rounded-md border border-violet-300 bg-white py-1 pl-2.5 pr-1 text-[11.5px] font-bold text-violet-700 shadow-md shadow-violet-100/70">
                    <TextCursorInput
                      className="h-3.5 w-3.5 shrink-0"
                      aria-hidden="true"
                    />
                    이렇게 문장을 드래그해 보세요 — 변형·범위 지정 메뉴가 떠요
                    <button
                      type="button"
                      onClick={() => dismissDragCoach(true)}
                      className="ml-0.5 flex h-5 w-5 items-center justify-center rounded text-violet-300 transition-colors hover:bg-violet-50 hover:text-violet-600"
                      title="알겠어요 — 다시 보지 않기"
                    >
                      <X className="h-3 w-3" aria-hidden="true" />
                    </button>
                  </div>
                  <style>{`
                    @keyframes ws-dragcoach-band {
                      0%, 8% { width: 0; opacity: 0; }
                      12% { width: 0; opacity: 1; }
                      46% { width: 58%; opacity: 1; }
                      86% { width: 58%; opacity: 1; }
                      96%, 100% { width: 58%; opacity: 0; }
                    }
                    @keyframes ws-dragcoach-cursor {
                      0%, 8% { left: 0; opacity: 0; }
                      12% { left: 0; opacity: 1; }
                      46% { left: 58%; opacity: 1; }
                      86% { left: 58%; opacity: 1; }
                      96%, 100% { left: 58%; opacity: 0; }
                    }
                    @keyframes ws-dragcoach-chip {
                      0%, 44% { opacity: 0; transform: translateY(3px); }
                      52% { opacity: 1; transform: translateY(0); }
                      90% { opacity: 1; }
                      98%, 100% { opacity: 0; }
                    }
                    .ws-dragcoach-band { animation: ws-dragcoach-band 4.4s ease-in-out infinite; }
                    .ws-dragcoach-cursor { animation: ws-dragcoach-cursor 4.4s ease-in-out infinite; }
                    .ws-dragcoach-chip { animation: ws-dragcoach-chip 4.4s ease-in-out infinite; }
                  `}</style>
                </div>
              ) : null}

              {/* ── 선택 액션 팝오버 — 드래그한 문장 바로 옆에 뜬다
                  (학습지 필기 툴바와 동일한 앵커·클램프 규칙) ── */}
              {selection &&
              selectionAnchor &&
              !preview &&
              !variantPreview &&
              !busy &&
              !disabled
                ? (() => {
                    const fitsBelow =
                      selectionAnchor.bottomY + SELECTION_POPUP_H + 10 <=
                      selectionAnchor.containerH;
                    const fitsAbove =
                      selectionAnchor.topY - SELECTION_POPUP_H - 10 >= 0;
                    const below = fitsBelow || !fitsAbove;
                    // 선택 구간이 에디터 전체를 덮어 위·아래 모두 공간이 없으면
                    // (긴 지문 전체 선택) 팝오버를 컨테이너 안으로 끌어와 잘림을
                    // 막는다. 이때는 본문 위에 겹치므로 화살표를 생략한다.
                    const clamped = !fitsBelow && !fitsAbove;
                    const rawTop = below
                      ? selectionAnchor.bottomY + 8
                      : selectionAnchor.topY - 8 - SELECTION_POPUP_H;
                    const top = Math.max(
                      4,
                      Math.min(
                        rawTop,
                        selectionAnchor.containerH - SELECTION_POPUP_H - 4,
                      ),
                    );
                    const left = Math.max(
                      4,
                      Math.min(
                        selectionAnchor.x - SELECTION_POPUP_W / 2,
                        selectionAnchor.containerW - SELECTION_POPUP_W - 4,
                      ),
                    );
                    const arrowX = Math.max(
                      14,
                      Math.min(
                        selectionAnchor.x - left,
                        SELECTION_POPUP_W - 14,
                      ),
                    );
                    return (
                      <div className="absolute z-[3]" style={{ left, top }}>
                        {below && !clamped ? (
                          <div style={{ paddingLeft: arrowX - 4 }}>
                            <div className="-mb-1 h-2 w-2 rotate-45 border-l border-t border-violet-300 bg-white" />
                          </div>
                        ) : null}
                        <div className="flex items-center gap-1.5 rounded-lg border border-violet-300 bg-white p-1.5 shadow-lg shadow-violet-200/60 duration-150 animate-in fade-in zoom-in-95">
                          <button
                            type="button"
                            onClick={handleParaphraseClick}
                            data-generate-tour="workspace-paraphrase-button"
                            title="뜻은 그대로, 단어·표현만 바꿔 재작성합니다"
                            className="flex h-7 shrink-0 items-center gap-1.5 rounded-md bg-violet-600 pl-2.5 pr-2 text-[11.5px] font-bold text-white shadow-sm transition-colors hover:bg-violet-700"
                          >
                            <Wand2 className="h-3.5 w-3.5" aria-hidden="true" />
                            AI 문장 변형
                            <CreditCostChip
                              amount={CREDIT_COSTS.PASSAGE_TRANSFORM}
                              className="rounded-sm bg-white/20 px-1 py-px text-[10px]"
                            />
                          </button>
                          <button
                            type="button"
                            onClick={handleSetRangeFromSelection}
                            data-generate-tour="workspace-range-button"
                            title="선택한 구간만으로 문제를 생성합니다 (긴 지문용)"
                            className="flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-[11.5px] font-semibold text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50"
                          >
                            <Scissors
                              className="h-3.5 w-3.5"
                              aria-hidden="true"
                            />
                            이 범위만 출제
                          </button>
                        </div>
                        {!below && !clamped ? (
                          <div style={{ paddingLeft: arrowX - 4 }}>
                            <div className="-mt-1 h-2 w-2 rotate-45 border-b border-r border-violet-300 bg-white" />
                          </div>
                        ) : null}
                      </div>
                    );
                  })()
                : null}
            </div>

            {/* 단어 수 — 입력창 우하단 푸터(본문 아래라 텍스트와 겹치지 않음) */}
            <div className="flex justify-end border-t border-slate-100 px-2.5 py-1 text-[10.5px] tabular-nums text-slate-400">
              {words} words
            </div>
          </div>

          {/* ── 하이라이트 범례 ── */}
          {row.highlights.length > 0 || row.range ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-0.5 text-[10.5px] font-medium text-slate-400">
              {row.range ? (
                <span className="flex items-center gap-1">
                  <span
                    className="h-2.5 w-2.5 rounded-[2px] bg-amber-100 ring-1 ring-inset ring-amber-300"
                    aria-hidden="true"
                  />
                  출제 범위 — 이 구간만으로 문제를 생성해요
                </span>
              ) : null}
              {hasPrependHl ? (
                <span className="flex items-center gap-1">
                  <span
                    className="h-2.5 w-2.5 rounded-[2px] bg-violet-100 ring-1 ring-inset ring-violet-200"
                    aria-hidden="true"
                  />
                  AI가 추가한 앞 맥락
                </span>
              ) : null}
              {hasParaphraseHl ? (
                <span className="flex items-center gap-1">
                  <span
                    className="h-2.5 w-2.5 rounded-[2px] bg-orange-200 ring-1 ring-inset ring-orange-300"
                    aria-hidden="true"
                  />
                  AI 변형 문장 — 마우스를 올리면 원문이 보여요
                </span>
              ) : null}
              <span className="min-w-0 flex-1" aria-hidden="true" />
              {row.highlights.length > 0 ? (
                <button
                  type="button"
                  onClick={onClearHighlights}
                  className="shrink-0 transition-colors hover:text-slate-600"
                  title="색 표시만 지웁니다 (본문은 그대로)"
                >
                  표시 지우기
                </button>
              ) : null}
            </div>
          ) : null}

          {busy === "paraphrase" ? (
            <div className="flex items-center gap-2 rounded-lg border border-violet-200 bg-violet-50/50 px-3 py-2.5 text-[12px] font-semibold text-violet-600">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              선택한 문장을 변형하고 있어요…
            </div>
          ) : null}

          {/* ── 문장 변형 미리보기 ── */}
          {preview?.kind === "paraphrase" ? (
            <ParaphrasePreviewPanel
              original={preview.original}
              rewritten={preview.text}
              note={preview.note}
              busy={busy !== null}
              disabled={disabled}
              onApply={handleApplyPreview}
              onRegenerate={handleRegenerate}
              onCancel={handleCancelPreview}
            />
          ) : null}
        </div>
      ) : null}

      {/* ── 푸터: 이 지문 '문제 생성' (항상 표시 — 접혀 있어도 보임) ──
          클릭하면 이 지문 전용 문제 생성 모달이 열려 유형·난이도를 설정하고
          이 지문 하나로 바로 생성한다. "지문 = 자기 설정"을 명확히 하는 핵심 CTA. */}
      <div className="mt-auto border-t border-slate-100 bg-slate-50/50 p-2">
        <button
          type="button"
          disabled={disabled}
          onClick={onOpenSettings}
          data-generate-tour="row-generate-button"
          title={
            genStats && genStats.questions > 0
              ? "이 지문의 유형·난이도를 설정하고 문제를 생성합니다"
              : "이 지문의 유형을 선택하고 문제를 생성합니다"
          }
          className={
            "flex h-11 w-full items-center gap-2 rounded-lg px-3 text-[13px] font-bold text-white shadow-sm transition-colors hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50 " +
            (genStats && genStats.questions > 0
              ? "bg-violet-600"
              : "justify-center bg-violet-600")
          }
        >
          <Cpu className="h-4 w-4 shrink-0" aria-hidden="true" />
          {genStats && genStats.questions > 0 ? (
            <>
              <span className="shrink-0">문제 생성</span>
              <span className="min-w-0 flex-1" aria-hidden="true" />
              <span className="shrink-0 rounded-md bg-white/20 px-1.5 py-0.5 text-[11px] font-bold tabular-nums">
                {genStats.questions}문제
              </span>
              {genStats.creditCost > 0 ? (
                <CreditCostChip
                  amount={genStats.creditCost}
                  className="shrink-0 rounded-md bg-white/20 px-1.5 py-0.5 text-[10.5px]"
                />
              ) : null}
            </>
          ) : (
            <span>유형 선택하고 문제 생성하기</span>
          )}
        </button>
      </div>

      {/* AI 복원 첫 사용 안내 — intake 붙여넣기와 동일 다이얼로그/저장 키 */}
      <RestoreIntroDialog
        open={restoreIntroOpen}
        onOpenChange={setRestoreIntroOpen}
        onConfirm={runRestore}
        canRestore={!locked && row.content.trim().length >= 20}
      />
    </div>
  );
}
