"use client";

// ============================================================================
// 「원문 지문 없음」 경고 UI — 빌더와 상세 미리보기가 같이 쓴다(26-09-30 MISSING-PASSAGE-UI).
//  · useMissingSourcePassage(paperItems): 판정 결과(웹 · HWPX/DOCX 두 기준)와 막지 않는 경고 토스트.
//    - warnExport/wrapExport: HWPX·DOCX 내보내기 직전 — 서버와 같은 지문 결정(resolvePrintablePassage)으로 센다.
//    - withPrintWarning: 인쇄 잡이 끝난 뒤(afterprint) — 카드 인쇄 대화상자·?print=1·빠른보기 자동 인쇄는
//      배너를 볼 틈 없이 인쇄 창이 뜨고 afterprint 에 닫히므로, 끝난 직후 토스트로 알린다(MPUI-4).
//      인쇄 빠른 경로(print() 전)에는 아무것도 끼우지 않는다.
//  · <MissingPassageBanner>: 툴바 아래 배너 「N문항이 원문 지문 없이 출력됩니다」 + 문항 번호 바로가기.
//    배너가 문항 칩(빨간 「원문 지문 없음」)의 화면 전용 스타일도 함께 낸다(missing-passage-items).
//    번호 이동은 미리보기 스크롤러만 움직인다(문서·앱 셸은 그대로 — MPUI-2).
// ============================================================================

import { useCallback, useMemo, type RefObject } from "react";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import type { PaperItem, PaperPage } from "../paper-builder/types";
import type { ExamPrintFinish } from "../paper-builder/print/use-exam-print-controller";
import {
  buildMissingPassageChipCss,
  collectMissingPassageItems,
  computeRevealScrollTop,
  computeRevealWindowNudge,
  describeMissingPassageScope,
  findItemPageIndex,
  formatMissingPassageNumbers,
  missingPassageItemSelector,
  type MissingPassageItem,
} from "../paper-builder/components/a4-paper-page-parts/missing-passage-items";

export type MissingPassageExportKind = "HWPX" | "DOCX";

export type MissingPassageState = {
  /** 화면·인쇄·PDF 기준(배너·칩). */
  items: MissingPassageItem[];
  count: number;
  /** HWPX·DOCX 기준(서버 지문 결정). items 의 부분집합. */
  exportItems: MissingPassageItem[];
  /** 내보내기 직전 경고 — 막지 않는다(토스트만). 누락이 없으면 아무것도 하지 않는다. */
  warnExport: (kind: MissingPassageExportKind) => void;
  /** 핸들러를 감싸 경고 뒤 그대로 실행한다(동기 — 다운로드 흐름 불변). */
  wrapExport: (kind: MissingPassageExportKind, run: () => void) => () => void;
  /** 인쇄 잡 종료 콜백을 감싼다 — printed·native 로 끝나면 토스트를 띄운 뒤 원래 콜백을 부른다. */
  withPrintWarning: (next?: (finish: ExamPrintFinish) => void) => (finish: ExamPrintFinish) => void;
};

const EXPORT_TOAST_ID = "missing-source-passage-export";
const PRINT_TOAST_ID = "missing-source-passage-print";

export function useMissingSourcePassage(paperItems: readonly PaperItem[]): MissingPassageState {
  const items = useMemo(() => collectMissingPassageItems(paperItems, "web"), [paperItems]);
  const exportItems = useMemo(() => collectMissingPassageItems(paperItems, "export"), [paperItems]);
  const count = items.length;
  const warnExport = useCallback(
    (kind: MissingPassageExportKind) => {
      if (exportItems.length === 0) return;
      toast.warning(`${kind} 파일에 ${exportItems.length}문항이 원문 지문 없이 들어갑니다`, {
        id: EXPORT_TOAST_ID,
        description: `${formatMissingPassageNumbers(exportItems)} — 연결된 원문 지문이 없어 발문과 선지만 들어갑니다.`,
        duration: 8000,
      });
    },
    [exportItems],
  );
  const wrapExport = useCallback(
    (kind: MissingPassageExportKind, run: () => void) => () => {
      warnExport(kind);
      run();
    },
    [warnExport],
  );
  const withPrintWarning = useCallback(
    (next?: (finish: ExamPrintFinish) => void) => (finish: ExamPrintFinish) => {
      // printed 는 사용자가 인쇄 창에서 취소한 경우도 포함한다(브라우저가 구분해 주지 않는다) — 문구는 「인쇄됩니다」.
      if (items.length > 0 && (finish.outcome === "printed" || finish.outcome === "native")) {
        toast.warning(`이 시험지의 ${items.length}문항은 원문 지문 없이 인쇄됩니다`, {
          id: PRINT_TOAST_ID,
          description: `${formatMissingPassageNumbers(items)} — 연결된 원문 지문이 없어 발문과 선지만 찍힙니다. 시험지 상세 화면의 배너에서 문항 번호를 눌러 확인할 수 있습니다.`,
          duration: 12000,
        });
      }
      next?.(finish);
    },
    [items],
  );
  return useMemo(
    () => ({ items, count, exportItems, warnExport, wrapExport, withPrintWarning }),
    [items, count, exportItems, warnExport, wrapExport, withPrintWarning],
  );
}

const NUMBER_BUTTON_LIMIT = 12;

function prefersReducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

// 스크롤러(root)만 움직여 el 을 창에 보이는 스크롤러 띠 안에 놓는다. 문서 스크롤은 스크롤러가 창 아래로 거의
// 잘린 경우에만 최소한(computeRevealWindowNudge)으로 — 요소 기준 스크롤(scroll-into-view)은 조상(문서)까지 굴렸다.
function scrollRootToElement(root: HTMLElement, el: HTMLElement, align: "center" | "start", behavior: ScrollBehavior) {
  const viewportHeight = window.innerHeight;
  const before = root.getBoundingClientRect();
  const nudge = computeRevealWindowNudge({ rootTop: before.top, rootBottom: before.bottom, viewportHeight });
  if (nudge > 0) window.scrollBy({ top: nudge, behavior: "auto" });
  const rootRect = nudge > 0 ? root.getBoundingClientRect() : before;
  const targetRect = el.getBoundingClientRect();
  const top = computeRevealScrollTop(
    {
      scrollTop: root.scrollTop,
      rootTop: rootRect.top,
      rootBottom: rootRect.bottom,
      viewportHeight,
      targetTop: targetRect.top,
      targetHeight: targetRect.height,
    },
    align,
  );
  root.scrollTo({ top, behavior });
}

// 문항으로 스크롤. 지연 마운트(preview-pages LazyPaperPage)로 아직 안 그려진 쪽이면 먼저 그 쪽 프레임
// (data-exam-page-index — 마운트 전에도 제 높이를 차지한다)으로 가고, 마운트되면 문항에 맞춘다.
function revealItem(root: HTMLElement, pages: readonly PaperPage[], localId: string) {
  const behavior: ScrollBehavior = prefersReducedMotion() ? "auto" : "smooth";
  const selector = missingPassageItemSelector(localId);
  const target = root.querySelector<HTMLElement>(selector);
  if (target) {
    scrollRootToElement(root, target, "center", behavior);
    return;
  }
  const pageIndex = findItemPageIndex(pages, localId);
  if (pageIndex < 0) return;
  const frame = root.querySelector<HTMLElement>(`[data-exam-page-index="${pageIndex}"]`);
  if (!frame) return;
  scrollRootToElement(root, frame, "start", "auto");
  // 프레임이 화면에 들어오면 IntersectionObserver 가 쪽을 그린다 — 그려지는 즉시(최대 약 1초) 문항에 맞춘다.
  let frames = 0;
  const settle = () => {
    const mounted = root.querySelector<HTMLElement>(selector);
    if (mounted) {
      scrollRootToElement(root, mounted, "center", "auto");
      return;
    }
    frames += 1;
    if (frames < 60) window.requestAnimationFrame(settle);
  };
  window.requestAnimationFrame(settle);
}

export function MissingPassageBanner({
  state,
  pages,
  scrollRootRef,
  className,
}: {
  state: MissingPassageState;
  /** 조판 결과 — 문항 번호를 눌렀을 때 아직 안 그려진 쪽을 찾는 데 쓴다. */
  pages?: readonly PaperPage[];
  /** 미리보기 스크롤 루트(#exam-paper-print-root). 없으면 번호는 글자로만 보인다. */
  scrollRootRef?: RefObject<HTMLElement | null>;
  className?: string;
}) {
  const { items, count, exportItems } = state;
  const chipCss = useMemo(() => buildMissingPassageChipCss(items.map((entry) => entry.localId)), [items]);
  const shown = items.slice(0, NUMBER_BUTTON_LIMIT);
  const rest = count - shown.length;
  const canReveal = scrollRootRef !== undefined;

  return (
    <>
      {/* 라이브 영역은 늘 마운트해 둔다(빌더에서 문항을 담고 빼면 개수 변화를 읽어 준다). 비면 높이 0. */}
      <div aria-live="polite" aria-atomic="true" className="no-print print:hidden" data-missing-passage-banner="">
        {count > 0 ? (
          <div
            className={cn(
              "flex items-start gap-2 border-b border-rose-200 bg-rose-50 px-3 py-2 text-rose-950 sm:px-4",
              className,
            )}
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" aria-hidden="true" />
            <div className="min-w-0 flex-1 text-[12px] leading-5">
              <p className="font-bold">
                <span data-missing-passage-count={count}>{count}문항</span>이 원문 지문 없이 출력됩니다
              </p>
              <p className="text-rose-900/90" data-missing-passage-scope={exportItems.length}>
                {describeMissingPassageScope(count, exportItems.length)}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-1">
                <span className="text-[11px] font-semibold text-rose-900/80">해당 문항</span>
                {shown.map((entry) =>
                  canReveal ? (
                    <button
                      key={entry.localId}
                      type="button"
                      onClick={() => {
                        const root = scrollRootRef?.current;
                        if (root) revealItem(root, pages ?? [], entry.localId);
                      }}
                      className="inline-flex h-6 min-w-6 items-center justify-center rounded-md border border-rose-200 bg-white px-1.5 text-[11px] font-bold text-rose-700 transition-colors hover:border-rose-400 hover:bg-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/60 focus-visible:ring-offset-1"
                      aria-label={`${entry.orderNum}번 문항으로 이동`}
                    >
                      {entry.orderNum}번
                    </button>
                  ) : (
                    <span
                      key={entry.localId}
                      className="inline-flex h-6 items-center rounded-md border border-rose-200 bg-white px-1.5 text-[11px] font-bold text-rose-700"
                    >
                      {entry.orderNum}번
                    </span>
                  ),
                )}
                {rest > 0 ? <span className="text-[11px] font-semibold text-rose-900/80">외 {rest}문항</span> : null}
              </div>
            </div>
          </div>
        ) : null}
      </div>
      {chipCss ? <style data-missing-passage-chips="">{chipCss}</style> : null}
    </>
  );
}
