"use client";

import { createPortal } from "react-dom";
import {
  ChevronLeft,
  ChevronRight,
  Settings,
} from "lucide-react";
import {
  type MouseEvent as ReactMouseEvent,
  type SetStateAction,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";

import {
  PREVIEW_ZOOM_MAX,
  PREVIEW_ZOOM_MIN,
  PREVIEW_ZOOM_STEP,
} from "@/components/exams/exam-paper-builder-client-parts/preview-zoom-controls";
import { usePaperItemDrag } from "@/components/exams/paper-builder/components/a4-paper-page-parts/use-paper-item-drag";
import { cn } from "@/lib/utils";
import {
  type ActivityBlock,
  type ActivityKind,
  type AnalysisReport,
  type AnalysisSection,
  type BlockMeta,
  type CustomBlock,
  type ReportCover,
  type ReportMeta,
  type VocabTestLayout,
  type VocabTestMode,
  type VocabularyTier,
} from "@/lib/passage-report/analysis-report/schema";
import { worksheetAnswersAreHidden } from "@/lib/passage-report/analysis-report/worksheet-surface";
import { notifyCreditsChanged } from "@/lib/credits-client";

import {
  enumerateItems,
  type ItemDescriptor,
  type DropPlacement,
  type ReportEdit,
} from "./report-pages";
import { reportFlowItems, type FlowItem } from "./report-sections";
import {
  applyBlockOrder,
  blankExamRow,
  blankGrammarRow,
  blankVocabRow,
  deleteCustomBlock,
  deleteItem,
  deleteSection,
  hideOrDeleteIds,
  moveIdBy,
  newCustomBlockId,
  reorderIds,
  setBlockMeta,
  setTableColWidths,
  setCustomBlock,
  setMeta,
  setSection,
  setVocabularyTestLayout,
  setVocabularyTestMode,
  setVocabularyTierFilter,
  setVocabularyTestOnly,
  toggleTableCol,
} from "./editor-mutations";
import { ANALYSIS_REPORT_EDIT_CSS } from "./report-edit-styles";
import { ActivityToggleSwitch } from "./activity-palette-modal";
import { type WebtoonPick } from "./webtoon-picker-modal";
import type { ActivityAction } from "./custom-activity-renders";
import {
  appliedActivityParams,
  appliedActivitySentences,
  applyManualBlankToBlock,
  insertIntoWordBank,
  makeActivityBlock,
  rerolledActivityBlock,
} from "@/lib/passage-report/analysis-report/study-activities";
import { reportHistoryReducer } from "./editor-history";
import { downscaleImage } from "./image-utils";
import { usePanelWidths } from "./use-panel-widths";
import { EditorTopBar } from "./editor-top-bar";
import { PageThumbnailRail } from "./page-thumbnail-rail";
import { EditorCanvas } from "./editor-canvas";
import { ActivityPaletteRail } from "./activity-palette-rail";
import {
  addSavedReportSettings,
  COVER_DEFAULTS,
  deleteSavedReportSettings,
  getDefaultReportSettings,
  hasAppliedDefaultFor,
  markAppliedDefaultFor,
  persistAppliedReportSettings,
  SPACER_MIN_MM,
  type SavedReportSettings,
} from "./editor-storage";
import { FloatingFormatToolbar } from "./floating-format-toolbar";
import { PropertiesPanel } from "./properties-panel";
import { SettingsTemplatePopover } from "./cover-logo-panels";

const REPORT_A4_WIDTH_PX = Math.round((210 * 96) / 25.4);
const REPORT_A4_HEIGHT_PX = Math.round((297 * 96) / 25.4);
const REPORT_PAGE_GAP_PX = Math.round((9 * 96) / 25.4);
const LOGO_FILE_MAX_BYTES = 1.5 * 1024 * 1024;

interface Props {
  passageId: string;
  initialReport: AnalysisReport;
  onDraftChange?: (report: AnalysisReport, state: { dirty: boolean }) => void;
  onSaved?: (report: AnalysisReport) => void;
  onExit?: () => void;
}

export function AnalysisReportEditor({
  passageId,
  initialReport,
  onDraftChange,
  onSaved,
  onExit,
}: Props) {
  const [history, dispatchReport] = useReducer(reportHistoryReducer, {
    present: initialReport,
    past: [],
    future: [],
  });
  const report = history.present;
  const setReport = useCallback(
    (updater: SetStateAction<AnalysisReport>, options?: { record?: boolean }) => {
      dispatchReport({ type: "set", updater, record: options?.record });
    },
    [],
  );
  const [baseline, setBaseline] = useState<AnalysisReport>(initialReport);
  const [activeId, setActiveId] = useState<string | null>(null);
  // 토글/삽입/삭제 후 미리보기를 해당 블록으로 스크롤하기 위한 참조들.
  // (정의 순서상 뒤에 오는 scrollToBlock/orderedIds 를 앞쪽 핸들러에서 쓰기 위해 ref 경유)
  const scrollToBlockRef = useRef<(id: string) => void>(() => {});
  const orderedIdsRef = useRef<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 06 실전 학습지(워크북+수능추론) 옵트인 생성 진행 상태.
  const [worksheetBusy, setWorksheetBusy] = useState(false);

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [placement, setPlacement] = useState<DropPlacement>("before");

  const dirty = report !== baseline;
  const canUndo = history.past.length > 0;
  const canRedo = history.future.length > 0;

  useEffect(() => {
    onDraftChange?.(report, { dirty });
  }, [dirty, onDraftChange, report]);

  // 콘텐츠 편집 콜백 (안정적)
  const med = useMemo(() => ({ commit: (next: ReportMeta) => setReport((r) => setMeta(r, next)) }), [setReport]);
  const sectionEdit = useCallback(
    (index: number) => ({ commit: (next: AnalysisSection) => setReport((r) => setSection(r, index, next)) }),
    [setReport],
  );

  const onReorder = useCallback((sourceId: string, targetId: string, place: DropPlacement) => {
    setReport((r) => {
      const ids = applyBlockOrder(enumerateItems(r).map((b) => b.id), r.blockOrder);
      return { ...r, blockOrder: reorderIds(ids, sourceId, targetId, place) };
    });
  }, [setReport]);

  const onBlockMeta = useCallback((id: string, patch: Partial<BlockMeta>) => {
    setReport((r) => setBlockMeta(r, id, patch));
  }, [setReport]);

  // 워드프로세서식: 텍스트 블록 끝에서 Enter → 바로 아래에 빈 텍스트 블록 생성.
  // 생성된 블록은 렌더 후 effect 가 본문에 포커스를 넣어 곧바로 이어 쓸 수 있다.
  const pendingFocusRef = useRef<string | null>(null);
  // anchorId 기준 앞/뒤에 빈 텍스트 블록 삽입. anchorId === null 이면 맨 앞에.
  const insertBlockAt = useCallback(
    (
      kind: "text" | "spacer",
      anchorId: string | null,
      place: "before" | "after",
    ) => {
      const id = newCustomBlockId();
      setReport((r) => {
        const cb: CustomBlock =
          kind === "spacer"
            ? { kind: "spacer", id, heightMm: 16 }
            : { kind: "text", id, text: "" };
        const withBlock = { ...r, customBlocks: [...(r.customBlocks ?? []), cb] };
        const naturalIds = enumerateItems(withBlock).map((d) => d.id);
        const fullOrder = applyBlockOrder(naturalIds, withBlock.blockOrder);
        const anchor = anchorId ?? fullOrder.find((x) => x !== id) ?? null;
        const blockOrder = anchor
          ? reorderIds(fullOrder, id, anchor, anchorId ? place : "before")
          : fullOrder;
        return { ...withBlock, blockOrder };
      });
      setActiveId(id);
      if (kind === "text") pendingFocusRef.current = id;
      scrollToBlockRef.current(id);
    },
    [setReport],
  );
  const insertTextAfter = useCallback(
    (anchorId: string) => insertBlockAt("text", anchorId, "after"),
    [insertBlockAt],
  );

  // ─── 학습 활동(결정론·AI 아님) ───
  // 마지막으로 다룬 학습 활동 블록 — 다른 블록을 선택해도 그 설정 섹션이 사라지지 않고(접힌 채) 유지된다.
  const [lastActivityId, setLastActivityId] = useState<string | null>(null);
  // 팔레트에서 활동을 (재)활성화할 때마다 +1 — 설정 섹션이 접혀 있어도 다시 펼치게 하는 신호.
  const [activityActivateNonce, setActivityActivateNonce] = useState(0);

  // 팔레트에서 활동 선택 → 워크시트 맨 끝에 활동 블록 삽입 (전체 지문·기본 파라미터).
  const insertActivity = useCallback(
    (activityKind: ActivityKind) => {
      const id = newCustomBlockId();
      setReport((r) => {
        const block = makeActivityBlock(r, { activityKind, id });
        const withBlock = { ...r, customBlocks: [...(r.customBlocks ?? []), block] };
        const naturalIds = enumerateItems(withBlock).map((d) => d.id);
        const fullOrder = applyBlockOrder(naturalIds, withBlock.blockOrder);
        const anchor = fullOrder.filter((x) => x !== id).pop() ?? null;
        const blockOrder = anchor ? reorderIds(fullOrder, id, anchor, "after") : fullOrder;
        // 새 페이지 분할은 렌더러 기본값(firstBreak ?? true)이 담당하므로 메타를 따로 심지 않는다
        // (메타에 breakBefore 를 넣으면 분할된 회차/문항마다 끊김).
        return { ...withBlock, blockOrder };
      });
      setActiveId(id);
      scrollToBlockRef.current(id);
      setActivityActivateNonce((n) => n + 1);
      // 설정 섹션이 보이도록 편집 패널을 연다(접혀 있던 경우).
      setPropertiesPanelCollapsed(false);
    },
    [setReport],
  );

  // ─── 지문 웹툰(이미지) 삽입 ───
  const [webtoonPickerOpen, setWebtoonPickerOpen] = useState(false);
  const insertImageBlock = useCallback(
    (pick: WebtoonPick) => {
      const id = newCustomBlockId();
      setReport((r) => {
        const block: CustomBlock = {
          kind: "image",
          id,
          imageUrl: pick.imageUrl,
          webtoonId: pick.webtoonId,
          widthPct: 70,
          align: "center",
          ...(pick.ratio ? { ratio: pick.ratio } : {}),
        };
        const withBlock = {
          ...r,
          customBlocks: [...(r.customBlocks ?? []), block],
        };
        const naturalIds = enumerateItems(withBlock).map((d) => d.id);
        const fullOrder = applyBlockOrder(naturalIds, withBlock.blockOrder);
        const anchor = fullOrder.filter((x) => x !== id).pop() ?? null;
        const blockOrder = anchor
          ? reorderIds(fullOrder, id, anchor, "after")
          : fullOrder;
        return { ...withBlock, blockOrder };
      });
      setActiveId(id);
      scrollToBlockRef.current(id);
      setPropertiesPanelCollapsed(false);
      setWebtoonPickerOpen(false);
    },
    [setReport],
  );

  // 팔레트 토글용 — 문서에 추가된 활동 블록 수(유형별). 카드의 ON 스위치/개수 배지 근거.
  const activityCountByKind = useMemo(() => {
    const counts: Partial<Record<ActivityKind, number>> = {};
    for (const b of report.customBlocks ?? []) {
      if (b.kind !== "activity") continue;
      counts[b.activityKind] = (counts[b.activityKind] ?? 0) + 1;
    }
    return counts;
  }, [report.customBlocks]);

  // 팔레트 ON 스위치 끄기 — 그 유형의 활동 블록을 문서에서 전부 제거(undo 가능).
  const removeActivityKind = useCallback(
    (activityKind: ActivityKind) => {
      const ids = (report.customBlocks ?? [])
        .filter((b) => b.kind === "activity" && b.activityKind === activityKind)
        .map((b) => b.id);
      if (ids.length === 0) return;
      setReport((r) => ids.reduce((acc, id) => deleteCustomBlock(acc, id), r));
      // 지워진 블록이 선택돼 있었으면 해제 (lastActivityId 정리는 전용 effect 가 담당).
      setActiveId((current) => {
        if (!current) return current;
        const logical = current.startsWith("c-") ? current.split("::", 1)[0] : current;
        return ids.includes(logical) ? null : current;
      });
    },
    [report.customBlocks, setReport],
  );

  // 추가된 유형의 팔레트 카드 클릭 — 또 추가하지 않고 기존 첫 블록을 선택·스크롤해 설정을 연다.
  // 블록 위 컨트롤: 다시 섞기(seed+1 재생성)·밀도·정답 토글·삭제. AI 호출 없음.
  const onActivity = useCallback(
    (id: string, action: ActivityAction) => {
      setReport((r) => {
        if (action.type === "answerKeyPage") return { ...r, activityAnswerKeyPage: action.on };
        const list = r.customBlocks ?? [];
        const b = list.find((x) => x.id === id);
        if (!b || b.kind !== "activity") return r;
        if (action.type === "remove") return deleteCustomBlock(r, id);
        let next: ActivityBlock;
        if (action.type === "reroll") next = rerolledActivityBlock(r, b);
        else if (action.type === "param") next = appliedActivityParams(r, b, action.patch);
        else if (action.type === "sentences") next = appliedActivitySentences(r, b, action.sentenceNos);
        else if (action.type === "answers") next = { ...b, answersHidden: action.hidden };
        else if (action.type === "blankItem") {
          // 블록 전체 연속 재번호(nested 는 회차별 리셋) — 인라인=정답지 번호 일치 보장.
          const renum = applyManualBlankToBlock(
            b.payload.items,
            action.index,
            action.start,
            action.end,
            b.activityKind === "nested-cloze",
          );
          if (!renum) return r; // 빈칸 불가(영어 아님 / 기존 빈칸과 겹침)
          const items = b.payload.items.map((it, i) => ({ ...it, prompt: renum.items[i].prompt, answerKey: renum.items[i].answerKey }));
          // 드래그로 만든 새 빈칸의 단어를 단어 은행에도 추가(은행을 쓰는 유형에 한해). 끝이 아니라 흩어 넣어 누출 방지.
          const wordBank = Array.isArray(b.payload.wordBank) ? insertIntoWordBank(b.payload.wordBank, renum.added) : b.payload.wordBank;
          next = { ...b, payload: { ...b.payload, items, wordBank } };
        } else return r;
        return { ...r, customBlocks: list.map((x) => (x.id === id ? next : x)) };
      });
    },
    [setReport],
  );

  // 빈 영역 클릭 시 "여백/텍스트" 중 무엇을 넣을지 고르는 작은 메뉴.
  const [insertMenu, setInsertMenu] = useState<
    { x: number; y: number; anchorId: string | null } | null
  >(null);

  // 새로 삽입된 텍스트 블록이 렌더되면 본문 필드에 캐럿을 놓는다.
  useEffect(() => {
    const id = pendingFocusRef.current;
    if (!id) return;
    const raf = requestAnimationFrame(() => {
      const body = document.querySelector<HTMLElement>(
        `[data-paper-item-id="${CSS.escape(id)}"] .par-customtext-b`,
      );
      if (!body) return;
      pendingFocusRef.current = null;
      body.focus({ preventScroll: true });
      const range = document.createRange();
      range.selectNodeContents(body);
      range.collapse(true);
      const sel = window.getSelection();
      if (sel) {
        sel.removeAllRanges();
        sel.addRange(range);
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [report.customBlocks, report.blockOrder]);

  // 삽입 메뉴: Esc 또는 스크롤 시 닫기.
  useEffect(() => {
    if (!insertMenu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setInsertMenu(null);
    };
    const onScroll = () => setInsertMenu(null);
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [insertMenu]);

  const onColWidths = useCallback((group: string, widths: Record<string, number>) => {
    setReport((r) => setTableColWidths(r, group, widths));
  }, [setReport]);

  const setCustom = useCallback((id: string, patch: Partial<CustomBlock>) => {
    setReport((r) => setCustomBlock(r, id, patch));
  }, [setReport]);

  const onResize = useCallback((id: string, mm: number) => {
    setReport((r) => {
      const cb = r.customBlocks?.find((b) => b.id === id);
      if (cb?.kind === "spacer") {
        // 여백 블록은 heightMm 로 직접 반영 + 잔여 minHeight 제거(이중 높이 방지)
        const r2 = setCustomBlock(r, id, { heightMm: Math.min(237, Math.max(SPACER_MIN_MM, mm)) });
        return setBlockMeta(r2, id, { minHeight: undefined });
      }
      return setBlockMeta(r, id, { minHeight: mm > 0 ? Math.min(237, mm) : undefined });
    });
  }, [setReport]);

  // ── 표지(Cover) ──
  const [coverError, setCoverError] = useState<string | null>(null);
  const ced = useMemo(() => ({ commit: (next: ReportCover) => setReport((r) => ({ ...r, cover: next })) }), [setReport]);
  const setCoverPatch = useCallback((patch: Partial<ReportCover>) => {
    setReport((r) => ({ ...r, cover: { ...COVER_DEFAULTS, ...(r.cover ?? {}), ...patch } }));
  }, [setReport]);

  // 학습자료 설정 템플릿 — 현재 설정을 이름 붙여 저장 / 골라서 적용 / 삭제 / 현재 보고서 초기화
  const onSaveReportSettings = useCallback(
    (name: string) =>
      addSavedReportSettings(
        {
          brand: report.brand,
          themeId: report.themeId,
          englishOnlyPage: !!report.englishOnlyPage,
          cover: report.cover,
        },
        name,
      ),
    [report.brand, report.themeId, report.englishOnlyPage, report.cover],
  );
  const onApplyReportSettings = useCallback(
    (entry: SavedReportSettings) => {
      setReport((r) => ({
        ...r,
        brand: entry.brand ?? r.brand,
        themeId: entry.themeId ?? r.themeId,
        englishOnlyPage: entry.englishOnlyPage ?? r.englishOnlyPage,
        cover: entry.cover ? { ...COVER_DEFAULTS, ...entry.cover } : r.cover,
      }));
      return persistAppliedReportSettings(entry);
    },
    [setReport],
  );
  const onDeleteReportSettings = useCallback((id: string) => deleteSavedReportSettings(id), []);
  const onResetReportSettings = useCallback(() => {
    setReport((r) => ({ ...r, themeId: "black-white", englishOnlyPage: false, cover: { ...COVER_DEFAULTS } }));
  }, [setReport]);

  // 기본 템플릿 자동 적용 — 이 지문의 보고서를 '처음' 열 때 딱 한 번. 이후(편집한 뒤)에는
  // 다시 덮어쓰지 않도록 passageId 를 기록해 둔다. 기본 템플릿이 없으면 적용은 건너뛰되
  // '열어 봤다'는 기록은 남겨, 이미 본 보고서가 나중 기본 지정에 끌려가지 않게 한다.
  useEffect(() => {
    if (hasAppliedDefaultFor(passageId)) return;
    const def = getDefaultReportSettings();
    markAppliedDefaultFor(passageId);
    if (def) onApplyReportSettings(def);
  }, [passageId, onApplyReportSettings]);
  const onLogoFile = useCallback(
    async (file?: File | null) => {
      if (!file) return;
      setCoverError(null);
      if (!file.type.startsWith("image/")) {
        setCoverError("이미지 파일만 로고로 넣을 수 있습니다.");
        return;
      }
      if (file.size > LOGO_FILE_MAX_BYTES) {
        setCoverError("로고 이미지는 1.5MB 이하로 올려주세요.");
        return;
      }
      try {
        const url = await downscaleImage(file);
        if (url.length > 900_000) {
          setCoverError("로고 용량이 큽니다. 더 작거나 단순한 이미지를 사용하세요.");
          return;
        }
        setCoverPatch({ logoDataUrl: url, showLogo: true, logoX: undefined, logoY: undefined });
      } catch {
        setCoverError("로고를 불러오지 못했습니다. PNG/JPG 파일을 사용하세요.");
      }
    },
    [setCoverPatch],
  );

  const [pageList, setPageList] = useState<string[][]>([]);
  const [activePageIndex, setActivePageIndex] = useState(0);
  const [pagesPanelCollapsed, setPagesPanelCollapsed] = useState(false);
  const [propertiesPanelCollapsed, setPropertiesPanelCollapsed] = useState(false);
  // 학습 활동 팔레트는 창 가장 왼쪽(페이지 패널보다 왼쪽)에 붙는 독립 칼럼. 기본 펼침.
  const [activityPanelCollapsed, setActivityPanelCollapsed] = useState(false);
  // '단어 시험지' 카드를 누른 적 있으면 우측 패널에 단어 시험지 설정 섹션이 떠 있는다(활동 설정과 동일).
  const [vocabTestFocused, setVocabTestFocused] = useState(false);
  // 카드를 누를 때마다 +1 — 설정 섹션이 접혀 있어도 다시 펼치고 그 위치로 스크롤하는 신호.
  const [vocabTestActivateNonce, setVocabTestActivateNonce] = useState(0);
  const [materialSettingsOpen, setMaterialSettingsOpen] = useState(false);
  // 블록을 선택하면 학습자료 설정에서 편집 패널로 자동 전환(그 블록 도구를 바로 보여주기 위해)
  useEffect(() => {
    if (activeId) setMaterialSettingsOpen(false);
  }, [activeId]);
  const { railWidth, panelWidth, activityWidth, widthDragging, startWidthDrag } = usePanelWidths();
  const previewScrollerRef = useRef<HTMLDivElement>(null);
  // 좌측 페이지 썸네일 목록 스크롤러 — 본문 스크롤을 따라 활성 페이지를 보이게 한다.
  const pagesPanelScrollerRef = useRef<HTMLDivElement>(null);
  const [fitZoom, setFitZoom] = useState(1);
  const [manualZoom, setManualZoom] = useState<number | null>(null);
  const [zoomControlsPos, setZoomControlsPos] = useState({ top: 12, right: 12 });
  const zoom = manualZoom ?? fitZoom;
  const previewPageCount = Math.max(pageList.length, 1);
  const previewContentHeight = previewPageCount * (REPORT_A4_HEIGHT_PX + REPORT_PAGE_GAP_PX);

  useEffect(() => {
    const scroller = previewScrollerRef.current;
    if (!scroller) return;

    let lastFitWidth = 0;
    const updateFitZoom = () => {
      const styles = window.getComputedStyle(scroller);
      const paddingX = parseFloat(styles.paddingLeft) + parseFloat(styles.paddingRight);
      const availableWidth = Math.max(320, scroller.clientWidth - paddingX);
      if (lastFitWidth > 0 && Math.abs(availableWidth - lastFitWidth) < 24) return;
      lastFitWidth = availableWidth;
      const nextFit = Math.min(1, Math.max(PREVIEW_ZOOM_MIN, availableWidth / REPORT_A4_WIDTH_PX));
      setFitZoom(Math.round(nextFit * 100) / 100);
    };

    updateFitZoom();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(updateFitZoom);
    observer.observe(scroller);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const scroller = previewScrollerRef.current;
    if (!scroller) return;

    const updateActivePage = () => {
      const scrollerRect = scroller.getBoundingClientRect();
      const pageNodes = Array.from(scroller.querySelectorAll<HTMLElement>("[data-page-index]"));
      let nextIndex = 0;
      let bestDistance = Number.POSITIVE_INFINITY;
      pageNodes.forEach((node) => {
        const rawIndex = Number(node.dataset.pageIndex);
        const top = node.getBoundingClientRect().top - scrollerRect.top;
        const distance = Math.abs(top - 24);
        if (Number.isFinite(rawIndex) && distance < bestDistance) {
          nextIndex = rawIndex;
          bestDistance = distance;
        }
      });
      setActivePageIndex(nextIndex);
    };

    updateActivePage();
    const frame = window.requestAnimationFrame(updateActivePage);
    scroller.addEventListener("scroll", updateActivePage, { passive: true });
    return () => {
      window.cancelAnimationFrame(frame);
      scroller.removeEventListener("scroll", updateActivePage);
    };
  }, [pageList.length, zoom]);

  // 본문 미리보기를 스크롤하면(activePageIndex 변경) 좌측 썸네일 목록도 따라와
  // 현재 보고 있는 페이지 썸네일이 항상 보이게 한다. 이미 보이면 움직이지 않는다.
  useEffect(() => {
    const scroller = pagesPanelScrollerRef.current;
    if (!scroller) return;
    const el = scroller.querySelector<HTMLElement>(
      `[data-thumb-index="${activePageIndex}"]`,
    );
    if (!el) return;
    const sRect = scroller.getBoundingClientRect();
    const eRect = el.getBoundingClientRect();
    if (eRect.top >= sRect.top && eRect.bottom <= sRect.bottom) return;
    const target =
      scroller.scrollTop +
      (eRect.top - sRect.top) -
      (scroller.clientHeight - eRect.height) / 2;
    scroller.scrollTo({ top: Math.max(0, target), behavior: "smooth" });
  }, [activePageIndex]);

  const scrollToPage = useCallback((index: number) => {
    const scroller = previewScrollerRef.current;
    const node = scroller?.querySelector<HTMLElement>(`[data-page-index="${index}"]`);
    if (!scroller || !node) return;
    const scrollerRect = scroller.getBoundingClientRect();
    const targetRect = node.getBoundingClientRect();
    scroller.scrollTo({
      top: scroller.scrollTop + targetRect.top - scrollerRect.top - 20,
      behavior: "smooth",
    });
    setActivePageIndex(index);
  }, []);

  // 단어 시험지/학습지 편집 후 영향을 받은 블록으로 스크롤·선택을 옮긴다.
  const scrollToBlock = useCallback((id: string) => {
    window.setTimeout(() => {
      const scroller = previewScrollerRef.current;
      const el =
        scroller?.querySelector<HTMLElement>(`[data-paper-item-id="${id}"]`) ??
        scroller?.querySelector<HTMLElement>(`.par-root-edit .par-sheet [data-mid="${id}"]`);
      if (scroller && el) {
        const scrollerRect = scroller.getBoundingClientRect();
        const elRect = el.getBoundingClientRect();
        scroller.scrollTo({
          top: Math.max(0, scroller.scrollTop + elRect.top - scrollerRect.top - 18),
          behavior: "smooth",
        });
      }
      const pageEl = el?.closest<HTMLElement>("[data-page-index]");
      const pageIndex = Number(pageEl?.dataset.pageIndex);
      if (Number.isFinite(pageIndex)) setActivePageIndex(pageIndex);
      setActiveId(id);
    }, 160);
  }, []);
  scrollToBlockRef.current = scrollToBlock;

  // id 를 정적으로 알 수 없는 블록(예: 정답·해설 키 — 내용에 따라 키가 달라짐)을
  // CSS 선택자로 찾아 스크롤. 첫 매칭 요소로 이동하고 활성 블록도 그 블록으로.
  const scrollToSelector = useCallback((selector: string) => {
    window.setTimeout(() => {
      const scroller = previewScrollerRef.current;
      const el = scroller?.querySelector<HTMLElement>(selector);
      if (!scroller || !el) return;
      const scrollerRect = scroller.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      scroller.scrollTo({
        top: Math.max(0, scroller.scrollTop + elRect.top - scrollerRect.top - 18),
        behavior: "smooth",
      });
      const pageEl = el.closest<HTMLElement>("[data-page-index]");
      const pageIndex = Number(pageEl?.dataset.pageIndex);
      if (Number.isFinite(pageIndex)) setActivePageIndex(pageIndex);
      const id = el.getAttribute("data-paper-item-id");
      if (id) setActiveId(id);
    }, 160);
  }, []);

  // 어떤 기능 블록(접두사로 식별)의 '바로 윗 블록' id. 기능을 끄기 전 현재 순서에서
  // 계산해, 끈 뒤 사라진 자리 바로 위로 스크롤하는 데 쓴다.
  const blockAbovePrefix = useCallback((prefix: string): string | null => {
    const order = orderedIdsRef.current;
    const idx = order.findIndex((bid) => bid.startsWith(prefix));
    return idx > 0 ? order[idx - 1] : null;
  }, []);

  // 기능을 끌 때 '튕김' 방지: 먼저 위(targetId, 아직 존재하는 블록)로 부드럽게 스크롤한
  // 뒤, 스크롤이 끝나고 나서 콘텐츠를 제거(apply)한다. 제거는 화면 아래쪽에서 일어나므로
  // 스크롤 위치가 순간 보정되며 튕기는 일이 없다.
  const scrollUpThenApply = useCallback(
    (targetId: string | null, apply: () => void) => {
      const scroller = previewScrollerRef.current;
      const el = targetId
        ? scroller?.querySelector<HTMLElement>(`[data-paper-item-id="${targetId}"]`)
        : null;
      if (!scroller || !el) {
        apply();
        return;
      }
      if (targetId) setActiveId(targetId);
      const sRect = scroller.getBoundingClientRect();
      const eRect = el.getBoundingClientRect();
      const top = Math.max(0, scroller.scrollTop + eRect.top - sRect.top - 18);
      const pageEl = el.closest<HTMLElement>("[data-page-index]");
      const pageIndex = Number(pageEl?.dataset.pageIndex);
      if (Number.isFinite(pageIndex)) setActivePageIndex(pageIndex);
      if (Math.abs(top - scroller.scrollTop) < 4) {
        apply(); // 이미 그 위치 → 곧장 제거
        return;
      }
      scroller.scrollTo({ top, behavior: "smooth" });
      window.setTimeout(apply, 450); // 부드러운 스크롤이 끝난 뒤 제거
    },
    [],
  );

  const zoomPreviewIn = useCallback(() => {
    setManualZoom((current) =>
      Math.min(PREVIEW_ZOOM_MAX, Math.round(((current ?? zoom) + PREVIEW_ZOOM_STEP) * 100) / 100),
    );
  }, [zoom]);

  const zoomPreviewOut = useCallback(() => {
    setManualZoom((current) =>
      Math.max(PREVIEW_ZOOM_MIN, Math.round(((current ?? zoom) - PREVIEW_ZOOM_STEP) * 100) / 100),
    );
  }, [zoom]);

  const resetPreviewZoom = useCallback(() => setManualZoom(null), []);

  const fitPreviewToScreen = useCallback(() => {
    const scroller = previewScrollerRef.current;
    if (!scroller) return;
    const styles = window.getComputedStyle(scroller);
    const paddingX = parseFloat(styles.paddingLeft) + parseFloat(styles.paddingRight);
    const paddingY = parseFloat(styles.paddingTop) + parseFloat(styles.paddingBottom);
    const availableWidth = Math.max(1, scroller.clientWidth - paddingX);
    const availableHeight = Math.max(1, scroller.clientHeight - paddingY);
    const next = Math.min(availableWidth / REPORT_A4_WIDTH_PX, availableHeight / REPORT_A4_HEIGHT_PX);
    const clamped = Math.min(PREVIEW_ZOOM_MAX, Math.max(PREVIEW_ZOOM_MIN, next));
    setManualZoom(Math.round(clamped * 100) / 100);
  }, []);

  const handlePreviewZoomControlsDragStart = useCallback(
    (event: ReactMouseEvent<HTMLSpanElement>) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();

      const startMouseX = event.clientX;
      const startMouseY = event.clientY;
      const startTop = zoomControlsPos.top;
      const startRight = zoomControlsPos.right;
      const prevCursor = document.body.style.cursor;
      const prevUserSelect = document.body.style.userSelect;
      document.body.style.cursor = "grabbing";
      document.body.style.userSelect = "none";

      const handleMove = (moveEvent: MouseEvent) => {
        setZoomControlsPos({
          top: Math.max(0, startTop + (moveEvent.clientY - startMouseY)),
          right: Math.max(0, startRight - (moveEvent.clientX - startMouseX)),
        });
      };
      const handleUp = () => {
        document.removeEventListener("mousemove", handleMove);
        document.removeEventListener("mouseup", handleUp);
        document.body.style.cursor = prevCursor;
        document.body.style.userSelect = prevUserSelect;
      };

      document.addEventListener("mousemove", handleMove);
      document.addEventListener("mouseup", handleUp);
    },
    [zoomControlsPos],
  );

  const deleteActive = useCallback((id: string) => {
    const order = orderedIdsRef.current;
    const idx = order.indexOf(id);
    const prev = idx > 0 ? order[idx - 1] : null;
    setReport((r) => deleteItem(r, id));
    setActiveId(null);
    if (prev) scrollToBlock(prev);
    else scrollToPage(0);
  }, [setReport, scrollToBlock, scrollToPage]);
  const deletePage = useCallback((ids: string[]) => {
    if (!ids.length) return;
    // 학습 활동 정답 페이지(파생 블록: activity-answers-head / c-…-ans)는 개별 삭제 대상이 아니라
    // 문서 레벨 '정답 별도 페이지' 옵션을 끄는 것으로 처리한다(활동 블록은 유지·설정에서 재활성).
    const isAnswerPage = ids.every((id) => id === "activity-answers-head" || /-ans$/.test(id));
    if (isAnswerPage) {
      if (!window.confirm("학습 활동 정답 페이지를 숨길까요? (활동은 유지되고, 활동 설정에서 다시 켤 수 있어요)")) return;
      setReport((r) => ({ ...r, activityAnswerKeyPage: false }));
      return;
    }
    const logicalIds = Array.from(new Set(ids.map((id) => (id.startsWith("c-") ? id.split("::", 1)[0] : id))));
    if (!window.confirm(`이 페이지의 블록 ${logicalIds.length}개를 삭제할까요?`)) return;
    setReport((r) => hideOrDeleteIds(r, logicalIds));
  }, [setReport]);
  const onToggleCol = useCallback((si: number, key: string) => {
    setReport((r) => toggleTableCol(r, si, key));
  }, [setReport]);

  // ── 단어 시험지 / 학습지 출력 ──
  const onVocabTestMode = useCallback((si: number, mode: VocabTestMode) => {
    const apply = () => setReport((r) => setVocabularyTestMode(r, si, mode));
    if (mode === "study") {
      // 끄기 → 단어시험이 사라지므로 그 위로 부드럽게 올라간 뒤 제거.
      scrollUpThenApply(blockAbovePrefix(`s${si}-vocab-test`) ?? `s${si}-head`, apply);
    } else {
      apply();
      scrollToBlock(`s${si}-vocab-test-head`);
    }
  }, [blockAbovePrefix, scrollToBlock, scrollUpThenApply, setReport]);
  const onVocabTestLayout = useCallback((si: number, layout: VocabTestLayout) => {
    setReport((r) => setVocabularyTestLayout(r, si, layout));
    scrollToBlock(`s${si}-vocab-test-head`);
  }, [scrollToBlock, setReport]);
  const onVocabTierFilter = useCallback((si: number, tiers: VocabularyTier[]) => {
    setReport((r) => setVocabularyTierFilter(r, si, tiers));
  }, [setReport]);
  const onVocabTestOnly = useCallback(
    (si: number, enabled: boolean, mode: Exclude<VocabTestMode, "study"> = "hide-meaning") => {
      const apply = () => setReport((r) => setVocabularyTestOnly(r, si, enabled, mode));
      if (enabled) {
        apply();
        scrollToBlock(`s${si}-vocab-test-head`);
      } else {
        // 끄기 → 단어시험이 사라지므로 그 위로 부드럽게 올라간 뒤 제거.
        scrollUpThenApply(blockAbovePrefix(`s${si}-vocab-test`) ?? `s${si}-head`, apply);
      }
    },
    [blockAbovePrefix, scrollToBlock, scrollUpThenApply, setReport],
  );
  const onRestoreVocabTestRows = useCallback((si: number) => {
    setReport((r) => {
      const sec = r.sections[si];
      if (!sec || sec.kind !== "vocabulary") return r;
      return setSection(r, si, { ...sec, vocabTestExcludedKeys: undefined });
    });
    scrollToBlock(`s${si}-vocab-test-head`);
  }, [scrollToBlock, setReport]);
  const onToggleWorksheetAnswers = useCallback((si: number) => {
    const sec = report.sections[si];
    // 현재 숨김 상태면 이번 토글로 '포함'이 된다 → 새로 나타나는 정답·해설로 스크롤.
    const willInclude =
      sec?.kind === "learning-worksheet" ? worksheetAnswersAreHidden(sec) : false;
    const apply = () =>
      setReport((r) => {
        const s2 = r.sections[si];
        if (!s2 || s2.kind !== "learning-worksheet") return r;
        return setSection(r, si, { ...s2, hiddenAnswers: !worksheetAnswersAreHidden(s2) });
      });
    if (willInclude) {
      apply();
      // 정답·해설 키 블록은 내용에 따라 id 가 달라 선택자로 첫 블록을 찾는다.
      scrollToSelector(`[data-paper-item-id^="s${si}-ws-answer"]`);
    } else {
      // 포함 해제 → 정답·해설이 사라지므로 그 위로 부드럽게 올라간 뒤 제거.
      scrollUpThenApply(blockAbovePrefix(`s${si}-ws-answer`) ?? `s${si}-ws-title`, apply);
    }
  }, [report, blockAbovePrefix, scrollToSelector, scrollUpThenApply, setReport]);

  // Delete 키로 선택 블록 삭제. 텍스트 편집 중이라도 필드가 '비어 있으면' 블록을
  // 지운다(방금 삽입한 빈 텍스트/여백 블록을 클릭 후 바로 삭제할 수 있도록).
  // 내용이 있는 필드를 편집 중일 때만 글자 삭제로 두고 블록은 보존한다.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Delete" || !activeId) return;
      const ae = document.activeElement as HTMLElement | null;
      if (ae && (ae.isContentEditable || ae.tagName === "INPUT" || ae.tagName === "TEXTAREA")) {
        const text =
          ae.tagName === "INPUT" || ae.tagName === "TEXTAREA"
            ? (ae as HTMLInputElement | HTMLTextAreaElement).value
            : ae.textContent ?? "";
        if (text.trim().length > 0) return; // 실제 텍스트 편집 중 → 블록 보존
      }
      e.preventDefault();
      deleteActive(activeId);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeId, deleteActive]);

  // Cmd/Ctrl+Enter: 편집 중인 블록 앞에서 페이지 넘김(breakBefore 토글).
  // 텍스트의 Enter(줄바꿈)와 짝을 이루는 '페이지 단위 줄바꿈' 느낌의 동작.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || !(e.metaKey || e.ctrlKey)) return;
      const ae = document.activeElement as HTMLElement | null;
      const field = ae?.closest?.(".par-edit-field") as HTMLElement | null;
      if (!field) return;
      const id = field
        .closest<HTMLElement>("[data-paper-item-id]")
        ?.getAttribute("data-paper-item-id");
      if (!id) return;
      e.preventDefault();
      // 활동 블록은 기본값이 새 페이지(true)이므로 실효값 기준으로 토글.
      const isAct = report.customBlocks?.find((b) => b.id === id)?.kind === "activity";
      const current = report.blockMeta?.[id]?.breakBefore ?? isAct;
      onBlockMeta(id, { breakBefore: !current });
      scrollToBlock(id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [report.blockMeta, report.customBlocks, onBlockMeta, scrollToBlock]);

  // 워드프로세서처럼: 블록의 왼쪽 여백/빈 영역을 클릭하면, 클릭한 줄에 해당하는
  // 편집 필드에 캐럿을 놓는다(필드 바깥이라 기본적으로는 커서가 안 잡히는 문제 보완).
  // 이렇게 들어간 커서에서 Enter(줄바꿈)·Cmd/Ctrl+Enter(페이지 넘김)를 바로 칠 수 있다.
  useEffect(() => {
    const caretRangeAt = (x: number, y: number): Range | null => {
      const doc = document as Document & {
        caretRangeFromPoint?: (x: number, y: number) => Range | null;
        caretPositionFromPoint?: (
          x: number,
          y: number,
        ) => { offsetNode: Node; offset: number } | null;
      };
      if (doc.caretRangeFromPoint) return doc.caretRangeFromPoint(x, y);
      const pos = doc.caretPositionFromPoint?.(x, y);
      if (!pos) return null;
      const r = document.createRange();
      r.setStart(pos.offsetNode, pos.offset);
      r.collapse(true);
      return r;
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const target = e.target as HTMLElement | null;
      if (!target) return;
      // 삽입 메뉴 자체 클릭은 버튼 onClick 에 맡긴다.
      if (target.closest("[data-insert-menu]")) return;
      // 그 외 어디를 누르든 열려있는 삽입 메뉴는 닫는다(빈 영역이면 아래서 다시 연다).
      setInsertMenu(null);
      if (!target.closest(".par-root-edit")) return;
      // 텍스트/인터랙티브 요소를 직접 클릭한 경우는 브라우저 기본 동작에 맡긴다.
      if (target.closest(".par-edit-field")) return;
      if (
        target.closest(
          "button, a, input, textarea, select, [role='button'], .par-edit-chrome, .par-egrip2",
        )
      )
        return;
      const block = target.closest<HTMLElement>(".par-eline[data-paper-item-id]");
      if (!block) {
        // 빈 영역(블록 사이/페이지 여백) 클릭 → 그 위치에 빈 텍스트 블록 생성.
        // 시트 본문(.par-sheet-body) 안일 때만 동작(회색 배경·패널 클릭은 무시).
        if (!target.closest(".par-sheet-body")) return;
        const blocks = Array.from(
          document.querySelectorAll<HTMLElement>(
            ".par-root-edit .par-eline[data-paper-item-id]",
          ),
        );
        let anchorId: string | null = null;
        let bestBottom = -Infinity;
        for (const b of blocks) {
          const br = b.getBoundingClientRect();
          if (br.bottom <= e.clientY && br.bottom > bestBottom) {
            bestBottom = br.bottom;
            anchorId = b.getAttribute("data-paper-item-id");
          }
        }
        e.preventDefault();
        // 즉시 삽입하지 않고, 클릭 위치에 "여백/텍스트" 선택 메뉴를 띄운다.
        setInsertMenu({ x: e.clientX, y: e.clientY, anchorId });
        return;
      }
      const fields = Array.from(
        block.querySelectorAll<HTMLElement>(".par-edit-field"),
      );
      if (fields.length === 0) return;

      const { clientX: x, clientY: y } = e;
      // 클릭한 줄(세로 위치)을 포함하는 필드 → 없으면 Y 기준 가장 가까운 필드.
      let field =
        fields.find((f) => {
          const r = f.getBoundingClientRect();
          return y >= r.top && y <= r.bottom;
        }) ?? null;
      if (!field) {
        let bestDist = Infinity;
        for (const f of fields) {
          const r = f.getBoundingClientRect();
          const d = Math.abs((r.top + r.bottom) / 2 - y);
          if (d < bestDist) {
            bestDist = d;
            field = f;
          }
        }
      }
      if (!field) return;
      const fld = field;
      const r = fld.getBoundingClientRect();
      const atStart = x <= r.left + r.width / 2; // 왼쪽 여백 → 줄 시작, 오른쪽 → 줄 끝
      e.preventDefault();
      // rAF 로 네이티브 포커스/선택 처리 이후에 캐럿을 확정한다.
      requestAnimationFrame(() => {
        fld.focus();
        const px = atStart ? r.left + 1 : r.right - 1;
        const py = Math.min(Math.max(y, r.top + 1), r.bottom - 1);
        let range = caretRangeAt(px, py);
        if (!range || !fld.contains(range.startContainer)) {
          range = document.createRange();
          range.selectNodeContents(fld);
          range.collapse(atStart);
        }
        const sel = window.getSelection();
        if (sel) {
          sel.removeAllRanges();
          sel.addRange(range);
        }
      });
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);
  const { startDrag } = usePaperItemDrag({
    setActiveItemId: setActiveId,
    setDraggingItemId: setDraggingId,
    setDragOverItemId: setDragOverId,
    setDragOverPartKey: () => {},
    setDragPlacement: setPlacement,
    onMoveItemToDropTarget: onReorder,
  });

  const edit: ReportEdit = useMemo(
    () => ({
      med,
      sectionEdit,
      activeId,
      setActiveId,
      onReorder,
      onBlockMeta,
      setCustom,
      insertTextAfter,
      onActivity,
      ced,
      onResize,
      onColWidths,
      onDeletePage: deletePage,
      drag: { startDrag, draggingId, dragOverId, placement },
    }),
    [med, sectionEdit, activeId, onReorder, onBlockMeta, setCustom, insertTextAfter, onActivity, ced, onResize, onColWidths, deletePage, startDrag, draggingId, dragOverId, placement],
  );

  const descriptors = useMemo(() => enumerateItems(report), [report]);
  // ─── 페이지 썸네일용 데이터 ───
  // 실제 블록 노드를 한 번만 계산해 모든 썸네일이 공유. 타이핑 중 썸네일
  // 재렌더가 입력을 끊지 않도록 deferred 값으로 낮은 우선순위로 갱신한다.
  const deferredReport = useDeferredValue(report);
  const thumbItemsById = useMemo(() => {
    const map = new Map<string, FlowItem>();
    for (const it of reportFlowItems(deferredReport)) map.set(it.id, it);
    return map;
  }, [deferredReport]);
  // 표지를 제외한 본문 페이지 번호/총수 (중앙 캔버스의 푸터 번호와 일치).
  const thumbPageInfo = useMemo(() => {
    const coverFlags = pageList.map(
      (ids) => ids.length === 1 && thumbItemsById.get(ids[0])?.wrap === "cover",
    );
    const bodyTotal = coverFlags.filter((c) => !c).length;
    let bodyNo = 0;
    const bodyNumbers = coverFlags.map((isCover) => (isCover ? 0 : ++bodyNo));
    return { coverFlags, bodyTotal, bodyNumbers };
  }, [pageList, thumbItemsById]);
  const orderedIds = useMemo(
    () => applyBlockOrder(descriptors.map((d) => d.id), report.blockOrder),
    [descriptors, report.blockOrder],
  );
  orderedIdsRef.current = orderedIds;
  const blockAbove = useCallback(
    (id: string) => {
      const i = orderedIds.indexOf(id);
      return i > 0 ? orderedIds[i - 1] : null;
    },
    [orderedIds],
  );
  const logicalActiveId = activeId?.startsWith("c-") ? activeId.split("::", 1)[0] : activeId;
  const active: ItemDescriptor | null = useMemo(
    () => descriptors.find((d) => d.id === logicalActiveId) ?? null,
    [descriptors, logicalActiveId],
  );
  const activeMeta: BlockMeta = (logicalActiveId && report.blockMeta?.[logicalActiveId]) || {};
  const activePos = logicalActiveId ? orderedIds.indexOf(logicalActiveId) : -1;

  // 활성 학습 활동 추적 — 활동 블록을 선택하면 그 id 를 기억하고, 삭제되면 비운다.
  // 다른 블록을 선택해도 마지막 활동의 설정 섹션은 패널에 남아(접힘) 다시 펼쳐 쓸 수 있다.
  useEffect(() => {
    if (logicalActiveId && report.customBlocks?.some((b) => b.id === logicalActiveId && b.kind === "activity")) {
      setLastActivityId(logicalActiveId);
    }
  }, [logicalActiveId, report.customBlocks]);
  useEffect(() => {
    if (lastActivityId && !report.customBlocks?.some((b) => b.id === lastActivityId)) setLastActivityId(null);
  }, [lastActivityId, report.customBlocks]);
  const lastActivityBlock =
    (lastActivityId && (report.customBlocks?.find((b) => b.id === lastActivityId && b.kind === "activity") as ActivityBlock | undefined)) || null;
  const activityActive = !!lastActivityBlock && logicalActiveId === lastActivityBlock.id;

  const save = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/workbench/passage-reports/prime/${passageId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ report }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? "저장에 실패했습니다.");
      const saved = (j.report as AnalysisReport) ?? report;
      dispatchReport({ type: "replace", report: saved, clearHistory: true });
      setBaseline(saved);
      onSaved?.(saved);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }, [passageId, report, onSaved]);

  const revert = useCallback(() => {
    if (dirty && !window.confirm("저장하지 않은 편집을 모두 되돌릴까요?")) return;
    dispatchReport({ type: "replace", report: baseline, clearHistory: true });
    setActiveId(null);
  }, [dirty, baseline]);

  // 06 실전 학습지 옵트인 생성 — 서버에 저장된 보고서 위에 워크시트 섹션을 만들어 병합한다.
  // 미저장 편집이 있으면 서버 보고서 기준으로 생성되므로 먼저 저장할지 확인한다.
  const generateWorksheet = useCallback(async () => {
    if (dirty) {
      if (!window.confirm("저장하지 않은 편집은 실전 학습지에 반영되지 않아요. 먼저 저장 후 생성할까요?")) return;
      await save();
    }
    setWorksheetBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/workbench/passage-reports/prime/${passageId}/worksheet`, { method: "POST" });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? "실전 학습지 생성에 실패했습니다.");
      const saved = (j.report as AnalysisReport) ?? report;
      dispatchReport({ type: "replace", report: saved, clearHistory: true });
      setBaseline(saved);
      onSaved?.(saved);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setWorksheetBusy(false);
      // 차감/실패환급 모두 잔액이 바뀌므로 사이드바 뱃지 즉시 갱신.
      notifyCreditsChanged();
    }
  }, [dirty, save, passageId, report, onSaved]);

  const undo = useCallback(() => {
    dispatchReport({ type: "undo" });
    setActiveId(null);
  }, []);

  const redo = useCallback(() => {
    dispatchReport({ type: "redo" });
    setActiveId(null);
  }, []);

  const fontScale = activeMeta.fontScale ?? 1;
  const setMetaPatch = (patch: Partial<BlockMeta>) => logicalActiveId && onBlockMeta(logicalActiveId, patch);
  const moveActive = (dir: -1 | 1) =>
    logicalActiveId && setReport((r) => ({ ...r, blockOrder: moveIdBy(orderedIds, logicalActiveId, dir) }));
  const addRow = (sectionIndex: number) =>
    setReport((r) => {
      const sec = r.sections[sectionIndex];
      if (!sec) return r;
      if (sec.kind === "passage") {
        const nextN = (sec.sentences.reduce((m, x) => Math.max(m, x.n), 0) || 0) + 1;
        return setSection(r, sectionIndex, { ...sec, sentences: [...sec.sentences, { n: nextN, en: "", ko: "" }] });
      }
      if (sec.kind === "vocabulary") return setSection(r, sectionIndex, { ...sec, rows: [...sec.rows, blankVocabRow()] });
      if (sec.kind === "grammar") return setSection(r, sectionIndex, { ...sec, rows: [...sec.rows, blankGrammarRow()] });
      if (sec.kind === "exam-focus") return setSection(r, sectionIndex, { ...sec, rows: [...sec.rows, blankExamRow()] });
      if (sec.kind === "summary") return setSection(r, sectionIndex, { ...sec, sentences: [...sec.sentences, ""] });
      return r;
    });

  // 상단 바 — 정답·해설지 포함 / 단어 시험지만 토글
  const toolbarWorksheetIndex = useMemo(
    () => report.sections.findIndex((section) => section.kind === "learning-worksheet"),
    [report.sections],
  );
  const toolbarWorksheetSection = toolbarWorksheetIndex >= 0 ? report.sections[toolbarWorksheetIndex] : null;
  // 기본 분석은 logicRows 만 든 learning-worksheet 를 만든다. 실제 06 워크북/추론 콘텐츠가
  // 있을 때만 '정답지 토글'을 보이고, 없을 때만 '실전 학습지 생성' 버튼을 보인다.
  const toolbarWorksheetHasContent =
    toolbarWorksheetSection?.kind === "learning-worksheet" &&
    (!!toolbarWorksheetSection.workbookSet ||
      !!toolbarWorksheetSection.inferenceSet ||
      !!toolbarWorksheetSection.cloze ||
      !!toolbarWorksheetSection.practice ||
      !!toolbarWorksheetSection.drills);
  const toolbarAnswerKeyIncluded =
    toolbarWorksheetSection?.kind === "learning-worksheet" ? !worksheetAnswersAreHidden(toolbarWorksheetSection) : false;

  // 첫 단어장 섹션 대상
  const toolbarVocabularyIndex = useMemo(
    () => report.sections.findIndex((section) => section.kind === "vocabulary"),
    [report.sections],
  );
  const toolbarVocabularySection = toolbarVocabularyIndex >= 0 ? report.sections[toolbarVocabularyIndex] : null;
  const toolbarVocabMode: VocabTestMode =
    toolbarVocabularySection?.kind === "vocabulary" ? toolbarVocabularySection.vocabTestMode ?? "study" : "study";
  const toolbarVocabTestEnabled = !!report.vocabTestOnly || toolbarVocabMode !== "study";
  const VOCAB_TEST_MODE_LABEL: Record<VocabTestMode, string> = {
    study: "꺼짐",
    "hide-meaning": "뜻 쓰기",
    "hide-headword": "단어 쓰기",
    synonym: "동의어 쓰기",
    antonym: "반의어 쓰기",
  };
  // 단어 시험지를 학습 활동 카드처럼 켜는 핸들러 — 켜고 우측 패널에 '단어 시험지 설정' 섹션을 펼친다.
  // (문서를 스크롤/점프시키지 않으려고 onVocabTestMode 대신 setReport 로 직접 모드만 켠다.)
  const activateVocabTest = () => {
    if (!toolbarVocabTestEnabled) setReport((r) => setVocabularyTestMode(r, toolbarVocabularyIndex, "hide-meaning"));
    setVocabTestFocused(true);
    setVocabTestActivateNonce((n) => n + 1);
    setMaterialSettingsOpen(false);
    setPropertiesPanelCollapsed(false);
  };
  // 카드의 ON 스위치 — 단어 시험지 끄기. "study" 모드는 vocabTestOnly 까지 함께 해제하며,
  // onVocabTestMode 가 사라지는 시험지 위로 부드럽게 스크롤한 뒤 제거한다.
  const deactivateVocabTest = () => {
    if (toolbarVocabTestEnabled) onVocabTestMode(toolbarVocabularyIndex, "study");
  };
  const canToggleToolbarVocabTestOnly =
    toolbarVocabularySection?.kind === "vocabulary" && toolbarVocabularySection.rows.length > 0;

  return (
    <div className="are-shell flex h-full min-h-0 flex-col overflow-hidden bg-[#F4F6F9]">
      <style dangerouslySetInnerHTML={{ __html: ANALYSIS_REPORT_EDIT_CSS }} />

      <EditorTopBar
        pageCount={pageList.length}
        themeId={report.themeId}
        error={error}
        dirty={dirty}
        saving={saving}
        canUndo={canUndo}
        canRedo={canRedo}
        worksheetBusy={worksheetBusy}
        worksheetHasContent={toolbarWorksheetHasContent}
        answerKeyIncluded={toolbarAnswerKeyIncluded}
        onToggleAnswers={() => onToggleWorksheetAnswers(toolbarWorksheetIndex)}
        onUndo={undo}
        onRedo={redo}
        onRevert={revert}
        onSave={save}
        onGenerateWorksheet={generateWorksheet}
        onExit={onExit}
      />

      <div className="flex min-h-0 flex-1 overflow-hidden bg-white">
        {/* 좌측 끝 — 학습 활동 팔레트 (편집 패널과 같은 세로 탭 여닫힘 매커니즘 + 부드러운 폭 애니메이션) */}
        <ActivityPaletteRail
          collapsed={activityPanelCollapsed}
          onToggleCollapsed={() => setActivityPanelCollapsed((v) => !v)}
          activityWidth={activityWidth}
          widthDragging={widthDragging}
          onStartActivityDrag={(event) => startWidthDrag(event, "activity")}
          webtoonPickerOpen={webtoonPickerOpen}
          passageId={passageId}
          onOpenWebtoonPicker={() => setWebtoonPickerOpen(true)}
          onCloseWebtoonPicker={() => setWebtoonPickerOpen(false)}
          onPickWebtoon={insertImageBlock}
          report={report}
          onPickActivity={insertActivity}
          activityCounts={activityCountByKind}
          onToggleOffKind={removeActivityKind}
          vocabTestSlot={
                  canToggleToolbarVocabTestOnly ? (
                    // 헤더의 스위치가 실제 <button> 이라 카드 자체는 div[role=button] 으로(중첩 버튼 금지).
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => (toolbarVocabTestEnabled ? deactivateVocabTest() : activateVocabTest())}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          if (toolbarVocabTestEnabled) deactivateVocabTest();
                          else activateVocabTest();
                        }
                      }}
                      title={toolbarVocabTestEnabled ? "단어 시험지 끄기" : "단어 시험지 켜기"}
                      className={`group flex w-full cursor-pointer flex-col gap-1.5 rounded-xl border p-3 text-left transition-colors ${
                        toolbarVocabTestEnabled
                          ? "border-blue-200 bg-blue-50/30 hover:border-blue-300 hover:bg-blue-50/60"
                          : "border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50/40"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[12.5px] font-bold text-slate-800">단어 시험지</span>
                        <ActivityToggleSwitch
                          on={toolbarVocabTestEnabled}
                          title={toolbarVocabTestEnabled ? "단어 시험지 끄기" : "단어 시험지 켜기"}
                          onClick={(event) => {
                            event.stopPropagation();
                            if (toolbarVocabTestEnabled) deactivateVocabTest();
                            else activateVocabTest();
                          }}
                        />
                      </div>
                      <p className="text-[11px] leading-snug text-slate-500">뜻·단어·동의어·반의어 시험 + 난이도 단계 선택 — 지문 단어로 시험지 페이지 생성</p>
                      <div className="mt-0.5 rounded-md border border-slate-100 bg-slate-50/80 px-2 py-1.5">
                        <span className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">현재</span>
                        <p className="mt-0.5 text-[11px] font-semibold text-slate-700">
                          {toolbarVocabTestEnabled ? `${VOCAB_TEST_MODE_LABEL[toolbarVocabMode]}${report.vocabTestOnly ? " · 시험지만" : ""}` : "꺼짐 — 누르면 켜져요"}
                        </p>
                      </div>
                    </div>
                  ) : null
          }
        />

        {/* 좌측 — 페이지 인디케이터 */}
        <PageThumbnailRail
          collapsed={pagesPanelCollapsed}
          onExpand={() => setPagesPanelCollapsed(false)}
          onCollapse={() => setPagesPanelCollapsed(true)}
          railWidth={railWidth}
          pageList={pageList}
          scrollerRef={pagesPanelScrollerRef}
          activePageIndex={activePageIndex}
          onSelectPage={scrollToPage}
          report={deferredReport}
          itemsById={thumbItemsById}
          pageInfo={thumbPageInfo}
          onDeletePage={deletePage}
          onStartRailDrag={(event) => startWidthDrag(event, "rail")}
        />

        {/* 중앙 — A4 캔버스 (자연 크기, 드래그 autoscroll 용 id) */}
        <EditorCanvas
          pageList={pageList}
          zoom={zoom}
          zoomControlsPos={zoomControlsPos}
          onZoomIn={zoomPreviewIn}
          onZoomOut={zoomPreviewOut}
          onReset={resetPreviewZoom}
          onFit={fitPreviewToScreen}
          onZoomControlsDragStart={handlePreviewZoomControlsDragStart}
          scrollerRef={previewScrollerRef}
          onDeselect={() => setActiveId(null)}
          a4Width={REPORT_A4_WIDTH_PX}
          contentHeight={previewContentHeight}
          report={report}
          edit={edit}
          onPagesChange={setPageList}
        />

        {/* 인라인 텍스트 편집용 떠다니는 서식 툴바 */}
        <FloatingFormatToolbar
          blockMeta={report.blockMeta}
          onBlockMeta={onBlockMeta}
          onClozeBlank={(blockId, itemIndex, start, end) => onActivity(blockId, { type: "blankItem", index: itemIndex, start, end })}
        />

        {/* 학습 활동 팔레트는 우측 편집 패널 '활동' 탭으로 이동 (모달 제거) */}

        {/* 빈 영역 클릭 시 뜨는 블록 삽입 메뉴(여백/텍스트) */}
        {insertMenu
          ? createPortal(
              <div
                data-insert-menu
                role="menu"
                style={{
                  position: "fixed",
                  left: insertMenu.x,
                  top: insertMenu.y - 10,
                  transform: "translate(-50%, -100%)",
                }}
                className="no-print z-[80] flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1 text-[12px] shadow-xl"
              >
                <span className="px-1.5 text-[11px] font-semibold text-slate-400">
                  여기에 추가
                </span>
                <button
                  type="button"
                  onClick={() => {
                    insertBlockAt("text", insertMenu.anchorId, "after");
                    setInsertMenu(null);
                  }}
                  className="rounded px-2 py-1 font-medium text-slate-600 hover:bg-blue-50 hover:text-blue-700"
                >
                  텍스트
                </button>
                <button
                  type="button"
                  onClick={() => {
                    insertBlockAt("spacer", insertMenu.anchorId, "after");
                    setInsertMenu(null);
                  }}
                  className="rounded px-2 py-1 font-medium text-slate-600 hover:bg-blue-50 hover:text-blue-700"
                >
                  여백
                </button>
                <span
                  aria-hidden="true"
                  className="absolute left-1/2 -bottom-1 size-2 -translate-x-1/2 rotate-45 border-b border-r border-slate-200 bg-white"
                />
              </div>,
              document.body,
            )
          : null}

        {/* 우측 — 속성(편집) 패널 (세로 탭 여닫힘 + 부드러운 폭 애니메이션) */}
        {/* 편집 패널 폭 조절 핸들 — 펼쳤을 때만(핸들이 왼쪽 모서리) */}
        {!propertiesPanelCollapsed ? (
          <div
            onPointerDown={(event) => startWidthDrag(event, "panel")}
            title="편집 패널 폭 조절"
            aria-hidden
            className="no-print hidden w-1.5 shrink-0 cursor-col-resize touch-none bg-slate-100 transition-colors hover:bg-blue-200 active:bg-blue-300 lg:block"
          />
        ) : null}
        {/* 편집 패널 세로 탭 — 항상 보임. 누르면 여닫힘. */}
        <button
          type="button"
          onClick={() => setPropertiesPanelCollapsed((v) => !v)}
          title={propertiesPanelCollapsed ? "편집 패널 열기" : "편집 패널 닫기"}
          aria-label={propertiesPanelCollapsed ? "편집 패널 열기" : "편집 패널 닫기"}
          aria-expanded={!propertiesPanelCollapsed}
          className="no-print hidden h-full min-h-0 w-5 shrink-0 select-none flex-col items-center justify-center gap-1 border-l border-slate-200 bg-white/80 py-2 text-[11px] font-semibold text-sky-400 transition-colors hover:bg-sky-50 hover:text-sky-600 lg:flex"
        >
          {propertiesPanelCollapsed ? (
            <ChevronLeft className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
          <span style={{ writingMode: "vertical-rl" }}>편집 패널</span>
        </button>
        {/* 애니메이션 컨테이너 — 폭을 0↔패널폭으로 부드럽게 전환 */}
        <div
          aria-hidden={propertiesPanelCollapsed}
          className="no-print flex h-full min-h-0 shrink-0 overflow-hidden"
          style={{
            width: propertiesPanelCollapsed ? 0 : panelWidth,
            transition: widthDragging ? "none" : "width 300ms cubic-bezier(0.4, 0, 0.2, 1)",
          }}
        >
            <aside style={{ width: panelWidth }} className="flex h-full min-h-0 shrink-0 flex-col overflow-hidden border-l border-slate-200 bg-slate-50/80">
              <div className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-white px-3.5">
                <div className="min-w-0">
                  <p className="truncate text-[12px] font-black text-slate-800">
                    {materialSettingsOpen ? "학습자료 설정" : "편집 패널"}
                  </p>
                  <p className="truncate text-[10.5px] font-semibold text-slate-400">
                    {materialSettingsOpen ? "표지·로고·디자인·템플릿" : active ? "선택 블록 조정" : "문서 설정"}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {materialSettingsOpen ? (
                    <SettingsTemplatePopover
                      onSave={onSaveReportSettings}
                      onApply={onApplyReportSettings}
                      onDelete={onDeleteReportSettings}
                      onReset={onResetReportSettings}
                    />
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setMaterialSettingsOpen((v) => !v)}
                    title={materialSettingsOpen ? "편집 패널로 돌아가기" : "학습자료 설정"}
                    aria-label={materialSettingsOpen ? "편집 패널로 돌아가기" : "학습자료 설정"}
                    className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-md border transition-colors",
                      materialSettingsOpen
                        ? "border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-800",
                    )}
                  >
                    <Settings className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-2.5 [scrollbar-gutter:stable]">
                <PropertiesPanel
                  report={report}
                  active={active}
                  activeMeta={activeMeta}
                  activeCustom={(logicalActiveId && report.customBlocks?.find((b) => b.id === logicalActiveId)) || null}
                  activityBlock={lastActivityBlock}
                  activityActive={activityActive}
                  activityActivateNonce={activityActivateNonce}
                  onActivateActivity={() => {
                    if (lastActivityId) {
                      setActiveId(lastActivityId);
                      scrollToBlock(lastActivityId);
                      setActivityActivateNonce((n) => n + 1);
                    }
                  }}
                  activePos={activePos}
                  total={orderedIds.length}
                  fontScale={fontScale}
                  coverError={coverError}
                  onCoverPatch={setCoverPatch}
                  onLogoFile={onLogoFile}
                  onTheme={(t) => setReport((r) => ({ ...r, themeId: t }))}
                  onToggleEnglishPage={() => {
                    const turningOn = !report.englishOnlyPage;
                    setReport((r) => ({ ...r, englishOnlyPage: !r.englishOnlyPage }));
                    if (turningOn) scrollToBlock("english-only-0");
                    else scrollToPage(0);
                  }}
                  onBrand={(v) => setReport((r) => ({ ...r, brand: v }))}
                  settingsOpen={materialSettingsOpen}
                  onMetaPatch={setMetaPatch}
                  onMove={moveActive}
                  onAddRow={addRow}
                  onSetCustom={setCustom}
                  onActivity={onActivity}
                  onDeleteItem={deleteActive}
                  onToggleCol={onToggleCol}
                  onToggleWorksheetAnswers={onToggleWorksheetAnswers}
                  onVocabTestMode={onVocabTestMode}
                  onVocabTestLayout={onVocabTestLayout}
                  onVocabTestOnly={onVocabTestOnly}
                  onRestoreVocabTestRows={onRestoreVocabTestRows}
                  onVocabTierFilter={onVocabTierFilter}
                  vocabTestFocused={vocabTestFocused}
                  vocabTestActivateNonce={vocabTestActivateNonce}
                  vocabSectionIndex={toolbarVocabularyIndex}
                  onScrollToBlock={scrollToBlock}
                  onDeleteCustom={(id) => deleteActive(id)}
                  onDeleteSection={(si) => {
                    if (window.confirm("이 섹션 전체를 삭제할까요?")) {
                      const prev = blockAbove(`s${si}-head`);
                      setReport((r) => deleteSection(r, si));
                      setActiveId(null);
                      if (prev) scrollToBlock(prev);
                      else scrollToPage(0);
                    }
                  }}
                />
              </div>
            </aside>
        </div>
      </div>
    </div>
  );
}
