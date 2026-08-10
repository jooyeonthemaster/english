import type { CSSProperties } from "react";
import { getReportTheme, REPORT_LAYOUT } from "@/lib/passage-report/analysis-report/design-tokens";
import type { AnalysisReport, BlockMeta } from "@/lib/passage-report/analysis-report/schema";
import { applyBlockOrder } from "../editor-mutations";
import { BOX_LIST_WRAPS, type FlowItem, reportFlowItems, TABLE_WRAPS, type WrapKind } from "../report-sections";
import { ACTIVITY_PAD_MM, ARROW_MM, BOX_PAD_MM, LI_GAP_MM, PAGE_BODY_MM, RUN_GAP_MM } from "./constants";
import type { ItemDescriptor, ReportEdit } from "./types";
/**
 * 학습 활동 정답 페이지 아이템(파생 블록)인지. 이들은 활동 블록에서 매 렌더 재생성되는
 * appendix 라, blockOrder/순서 정렬·삽입 앵커 대상에서 제외하고 항상 문서 맨 끝에 붙인다.
 */
export function isActivityAnswerId(id: string): boolean {
  return id === "activity-answers-head" || (id.startsWith("c-") && id.endsWith("-ans"));
}

export function orderIdOf(it: FlowItem): string {
  return it.orderId ?? it.editId ?? it.id;
}

export function editIdOf(it: FlowItem): string {
  return it.editId ?? it.id;
}

/**
 * FlowItem[] → 편집기 패널용 디스크립터. 이미 계산해 둔 flow 가 있으면 이걸 써서
 * `reportFlowItems` 재호출(= 문서 전체 JSX 1벌 재생성)을 피한다.
 *
 * 판정 규칙은 기존 `enumerateItems` 와 완전히 동일하다 —
 * ① 활동 정답 페이지(파생 블록) 제외 ② orderId 중복 접기(첫 조각의 메타 채택).
 */
export function describeItems(items: FlowItem[]): ItemDescriptor[] {
  const seen = new Set<string>();
  const descriptors: ItemDescriptor[] = [];
  for (const it of items) {
    if (isActivityAnswerId(it.id)) continue;
    const id = orderIdOf(it);
    if (seen.has(id)) continue;
    seen.add(id);
    descriptors.push({
      id,
      sectionIndex: it.sectionIndex,
      kind: it.kind,
      wrap: it.wrap,
      no: it.no,
      isSectionStart: it.wrap === "secheader",
    });
  }
  return descriptors;
}

/**
 * report → 디스크립터. `setReport` 업데이터 내부처럼 "지금 막 만든 최신 r" 기준으로
 * 계산해야 하는 호출부가 쓴다(렌더 시점의 flow 로는 대체 불가) — 시그니처·동작 유지.
 */
export function enumerateItems(report: AnalysisReport): ItemDescriptor[] {
  return describeItems(reportFlowItems(report));
}

export function visibleFlowItems(report: AnalysisReport, natural: FlowItem[]): FlowItem[] {
  // 정답 페이지(파생)는 분리해 두고 본문만 blockOrder 로 정렬한다.
  const answers = natural.filter((it) => isActivityAnswerId(it.id));
  const body = natural.filter((it) => !isActivityAnswerId(it.id));
  const groupIds: string[] = [];
  const byGroup = new Map<string, FlowItem[]>();
  for (const it of body) {
    const id = orderIdOf(it);
    if (!byGroup.has(id)) {
      byGroup.set(id, []);
      groupIds.push(id);
    }
    byGroup.get(id)!.push(it);
  }
  const orderedIds = applyBlockOrder(groupIds, report.blockOrder);
  const out: FlowItem[] = [];
  for (const id of orderedIds) {
    if (report.blockMeta?.[id]?.hidden) continue;
    const group = byGroup.get(id);
    if (!group) continue;
    for (const it of group) {
      if (report.blockMeta?.[it.id]?.hidden) continue;
      out.push(it);
    }
  }
  // 정답 페이지는 blockOrder 와 무관하게 항상 맨 끝.
  for (const it of answers) {
    if (report.blockMeta?.[it.id]?.hidden) continue;
    out.push(it);
  }
  return out;
}

export const isStandalone = (w: WrapKind) =>
  !TABLE_WRAPS.has(w) &&
  !BOX_LIST_WRAPS.has(w) &&
  w !== "map" &&
  w !== "vocab-grid" &&
  w !== "reading" &&
  w !== "activity" &&
  w !== "ws-list";

export function isAutoFitItem(it: FlowItem): boolean {
  return /^s\d+-annotated-snt\d+/.test(it.id);
}

export function blockStyleOf(meta: BlockMeta | undefined): CSSProperties | undefined {
  if (!meta) return undefined;
  const st: Record<string, unknown> = {};
  if (meta.fontScale && meta.fontScale !== 1) st["--par-fs"] = meta.fontScale;
  if (meta.bold) st.fontWeight = 700;
  if (meta.italic) st.fontStyle = "italic";
  if (meta.align) st.textAlign = meta.align;
  // 모든 블록이 수동 리사이즈 높이를 반영한다(필기 캔버스 문장 포함).
  if (meta.minHeight) st.minHeight = `${meta.minHeight}mm`;
  return Object.keys(st).length ? (st as CSSProperties) : undefined;
}

// ─── 테마 → CSS 변수 (par-root 에 주입) ────────────────────────────────────────
export function buildReportRootStyle(report: AnalysisReport): CSSProperties {
  const theme = getReportTheme(report.themeId);
  return {
    "--ink": theme.ink, "--ink-soft": theme.inkSoft, "--gold": theme.gold, "--gold-soft": theme.goldSoft,
    "--ink-fill": theme.inkFill, "--ink-fill-soft": theme.inkFillSoft,
    "--ink-on-fill": theme.inkOnFill, "--ink-on-fill-muted": theme.inkOnFillMuted,
    "--text": theme.text, "--text-muted": theme.textMuted, "--tint": theme.tint, "--tint-border": theme.tintBorder,
    "--table-head-bg": theme.tableHeadBg, "--table-head-text": theme.tableHeadText,
    "--table-stripe": theme.tableStripe, "--page": theme.page, "--rule": theme.rule, "--font-en": REPORT_LAYOUT.fontEnSerif,
  } as CSSProperties;
}

export function cssEsc(s: string): string {
  return s.replace(/"/g, '\\"');
}

/** 동일한 페이지 분할이면 새 배열을 만들지 않아 불필요한 재렌더/깜빡임 방지. */
export function samePages(a: string[][] | null, b: string[][]): boolean {
  if (!a || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].length !== b[i].length) return false;
    for (let j = 0; j < a[i].length; j++) if (a[i][j] !== b[i][j]) return false;
  }
  return true;
}

// ─── 줄/블록 chrome ──────────────────────────────────────────────────────────
export function chromeProps(it: FlowItem, edit?: ReportEdit, measure?: boolean) {
  if (!edit || measure) return {} as Record<string, unknown>;
  const editId = editIdOf(it);
  const active = edit.activeId === editId;
  const over = edit.drag.dragOverId === editId && edit.drag.draggingId !== editId;
  return {
    "data-paper-item-id": editId,
    "data-paper-part-key": it.id,
    className: `par-eline${active ? " is-active" : ""}${edit.drag.draggingId === editId ? " is-dragging" : ""}${
      over ? (edit.drag.placement === "after" ? " par-dragover-after" : " par-dragover-before") : ""
    }`,
    onMouseDown: () => {
      if (edit.activeId !== editId) edit.setActiveId(editId);
    },
  } as Record<string, unknown>;
}

// ─── flow 패킹 ────────────────────────────────────────────────────────────────
/**
 * 측정된 블록 높이(own, mm)를 페이지 예산(pageBodyMm)에 맞춰 페이지로 채운다.
 *
 * @param chrome 표 머리글 높이. thead 는 공용 폴백, theadByGroup 은 표 종류별
 *   (grammar/exam/vocab) 실측값 — 열을 숨기거나 좁히면 종류마다 2줄이 되는 시점이 달라
 *   하나로 뭉뚱그리면 페이지당 4.76mm 씩 과소 계상된다.
 * @param pageBodyMm 페이지 본문 가용 높이(mm). 러닝헤더 로고 유무로 4.6mm 가 달라지므로
 *   호출부(pages.tsx)가 프로브 시트로 실측해 넘긴다. 생략 시 보수적 폴백 상수.
 */
export function packFlow(
  items: FlowItem[],
  own: number[],
  blockMeta: Record<string, BlockMeta> | undefined,
  chrome: { thead: number; theadByGroup?: Record<string, number> },
  pageBodyMm: number = PAGE_BODY_MM,
): number[][] {
  // 표 종류별 thead 실측값 우선(없으면 공용 참조표 값).
  const theadOf = (w: WrapKind) => {
    const g = w === "grammar" ? "grammar" : w === "exam" ? "exam" : "vocab";
    return chrome.theadByGroup?.[g] ?? chrome.thead;
  };
  const pages: number[][] = [];
  let page: number[] = [];
  let h = 0;
  let prevSection = -99;
  let prevWrap: WrapKind | null = null;
  let prevOrderId = "";
  // 섹션 헤더(01·02·03… 번호+제목)는 무조건 새 페이지에서 시작. 단 첫 섹션 헤더는
  // 문서 제목과 같은 페이지에 두기 위해(빈 제목 페이지 방지) 강제 분할에서 제외한다.
  let sawSecHeader = false;

  items.forEach((it, k) => {
    const meta = blockMeta?.[editIdOf(it)] ?? blockMeta?.[it.id];
    const tbl = TABLE_WRAPS.has(it.wrap);
    const box = BOX_LIST_WRAPS.has(it.wrap);
    const mp = it.wrap === "map";
    const act = it.wrap === "activity";
    const wsl = it.wrap === "ws-list";
    // ws-list 조각의 그룹 시작점 — 같은 orderId(옛 통짜 블록 id) 조각들이 한 박스다.
    const groupStart = orderIdOf(it) !== prevOrderId;
    const isCover = it.wrap === "cover";
    const isSecHeader = it.wrap === "secheader";
    const standalone = isStandalone(it.wrap);
    const autoFit = isAutoFitItem(it);
    // 표지는 자기 페이지 독점: 표지 앞/뒤 모두 페이지 분할
    // 자동 독해 조각은 저장된 breakBefore/minHeight 때문에 다음 장으로 밀리지 않게 한다.
    // 학습 활동(activity)은 블록 메타가 모든 분할 항목(회차/문항)에 동일하게 걸려 회차마다 끊기므로,
    // 메타 기반 분할은 비활동 블록에만 적용한다. 활동의 '새 페이지'는 첫 항목의 it.breakBefore 가 담당.
    // ws-list 조각은 그룹 메타(editId=옛 블록 id)의 breakBefore 를 그룹 첫 조각에만 적용한다.
    const forceBreak =
      ((!!meta?.breakBefore && !autoFit && !act && (!wsl || groupStart)) || !!it.breakBefore || isCover || prevWrap === "cover" || (isSecHeader && sawSecHeader && !it.keepWithPrev)) &&
      page.length > 0;
    // 수동 리사이즈 높이는 모든 블록에서 페이지 분할에 반영(필기 캔버스 포함).
    // breakBefore 만 auto-fit(자동 독해 조각)에서 stale 값 무시(위 forceBreak 참고).
    // ws-list 조각은 옛 통짜 블록에 저장된 minHeight 가 조각마다 반복 적용되면
    // 페이지가 폭발하므로 무시한다(그룹 리사이즈는 resizable:false 로 폐지).
    const metaMinHeight = wsl ? 0 : meta?.minHeight ?? 0;
    const hh = isCover ? pageBodyMm : Math.max(own[k], metaMinHeight);

    const atTopInc = () => (tbl ? theadOf(it.wrap) : 0) + (box ? BOX_PAD_MM : 0) + (act || wsl ? ACTIVITY_PAD_MM : 0) + hh;

    let inc: number;
    if (page.length === 0) {
      inc = atTopInc();
    } else {
      const newSection = it.sectionIndex !== prevSection;
      // ws-list 는 그룹(orderId)이 바뀌면 새 박스(런) — 연속 그룹이 한 박스로 합산되는 것 방지.
      const newRun = standalone || newSection || it.wrap !== prevWrap || (wsl && groupStart);
      if (newRun) {
        inc = RUN_GAP_MM + (tbl ? theadOf(it.wrap) : 0) + (box ? BOX_PAD_MM : 0) + (act || wsl ? ACTIVITY_PAD_MM : 0) + hh;
      } else {
        inc = (box ? LI_GAP_MM : mp ? ARROW_MM : 0) + hh;
      }
    }

    if (forceBreak || (page.length > 0 && h + inc > pageBodyMm)) {
      pages.push(page);
      page = [];
      h = 0;
      prevWrap = null;
      prevSection = -99;
      inc = atTopInc();
    }

    page.push(k);
    h += inc;
    prevSection = it.sectionIndex;
    prevWrap = it.wrap;
    prevOrderId = orderIdOf(it);
    if (isSecHeader) sawSecHeader = true;
  });
  if (page.length) pages.push(page);
  return pages;
}
