import type { CSSProperties } from "react";
import { getReportTheme, REPORT_LAYOUT } from "@/lib/passage-report/analysis-report/design-tokens";
import type { AnalysisReport, BlockMeta } from "@/lib/passage-report/analysis-report/schema";
import { applyBlockOrder } from "../editor-mutations";
import { BOX_LIST_WRAPS, type FlowItem, reportFlowItems, TABLE_WRAPS, type WrapKind } from "../report-sections";
import { ACTIVITY_PAD_MM, ARROW_MM, BOX_PAD_MM, CONT_HEAD_MM, LI_GAP_MM, PAGE_BODY_MM, READING_RUN_GAP_MM, RUN_GAP_MM } from "./constants";
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
  // 섹션 헤더 고아 방지(compact-spec §1) — 구 정책(섹션마다 무조건 새 페이지, 페이지 하단
  // 30~60% 공백의 원인)을 폐지하고, 남은 공간에 '헤더 + 최소 리드'가 못 들어갈 때만 끊는다.
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
    // 섹션 헤더는 기본적으로 새 페이지에서 시작(spec §1 v2). 단 keepWithPrev 슬롯
    // (02 핵심 요약·03 논리 구조 — 01 과 한 페이지 병합 의도)만 면제되어 앞 내용에 이어 붙는다.
    const forceBreak =
      ((!!meta?.breakBefore && !autoFit && !act && (!wsl || groupStart)) ||
        !!it.breakBefore ||
        isCover ||
        prevWrap === "cover" ||
        (isSecHeader && sawSecHeader && !it.keepWithPrev && !meta?.keepWithPrev)) &&
      page.length > 0;
    // 수동 리사이즈 높이는 모든 블록에서 페이지 분할에 반영(필기 캔버스 포함).
    // breakBefore 만 auto-fit(자동 독해 조각)에서 stale 값 무시(위 forceBreak 참고).
    // ws-list 조각은 옛 통짜 블록에 저장된 minHeight 가 조각마다 반복 적용되면
    // 페이지가 폭발하므로 무시한다(그룹 리사이즈는 resizable:false 로 폐지).
    const metaMinHeight = wsl ? 0 : meta?.minHeight ?? 0;
    const hh = isCover ? pageBodyMm : Math.max(own[k], metaMinHeight);

    // keepWithPrev 그룹 원자성(유저 확정 규칙, 2026-08-11) — 02 요약~03 논리 구조는 한 몸이다:
    // 앞 내용(01)과 같은 페이지에 **그룹 전체**가 들어가면 전부 싣고, 안 들어가면 그룹 통째로
    // 다음 페이지로 보낸다(03만 뚝 떨어지는 부분 낙하 금지 — 01이 페이지를 독차지).
    // 그룹 높이는 본 패킹과 '동일한 inc 규칙'으로 사전 시뮬레이션한다 — 같은 산식이므로
    // 여기서 통과하면 실제 패킹에서도 반드시 같은 페이지에 앉는다(추정 어긋남 없음).
    // 사용자가 속성 패널에서 명시한 meta.keepWithPrev 는 그대로 면제(항상 앞에 붙임).
    //
    // **예외: it.splitWithPrev 흐름 섹션**(v6, 26-08-21 유저 확정 — 02 「원문 · 문장별 해석」).
    // 이 섹션은 문장 조각들이 페이지 경계에서 나뉘어도 되는 흐름이라 원자성을 요구하지 않는다.
    // 요구하면 지문이 조금만 길어도(그룹 높이 > 01 아래 잔여) 통째로 다음 장으로 밀려
    // **1페이지가 요약 한 줄만 남고 60% 백지**가 된다(사용자 스크린샷). 그래서 초대형 그룹과
    // 같은 '최소 보증'만 건다 — 헤더+첫 문장이 들어가면 붙이고 나머지는 다음 장으로 흘린다.
    // 03(논리표)은 단일 통짜 아이템이라 최소 보증 = 그룹 전체 수용이므로 동작이 불변이다.
    let orphanBreak = false;
    if (!forceBreak && isSecHeader && sawSecHeader && !meta?.keepWithPrev && page.length > 0) {
      let groupH = RUN_GAP_MM + hh; // 헤더 자신(항상 새 런)
      let firstInc = 0; // 헤더 뒤 첫 아이템 inc — 초대형 그룹 폴백용
      let pWrap: WrapKind = it.wrap;
      let pSection = it.sectionIndex;
      let pOrder = orderIdOf(it);
      for (let j = k + 1; j < items.length; j++) {
        const nx = items[j];
        if (nx.wrap === "cover") break;
        const nxMeta = blockMeta?.[editIdOf(nx)] ?? blockMeta?.[nx.id];
        // 강제분할 아이템·비병합 섹션 헤더(04~)에서 그룹이 끝난다. keepWithPrev 헤더(03)는 그룹에 포함.
        if (nx.breakBefore || nxMeta?.breakBefore) break;
        if (nx.wrap === "secheader" && !nx.keepWithPrev) break;
        const nTbl = TABLE_WRAPS.has(nx.wrap);
        const nBox = BOX_LIST_WRAPS.has(nx.wrap);
        const nMp = nx.wrap === "map";
        const nAct = nx.wrap === "activity";
        const nWsl = nx.wrap === "ws-list";
        const nStart = orderIdOf(nx) !== pOrder;
        const nMinH = nWsl ? 0 : nxMeta?.minHeight ?? 0;
        const nH = Math.max(own[j], nMinH);
        const newRun = isStandalone(nx.wrap) || nx.sectionIndex !== pSection || nx.wrap !== pWrap || (nWsl && nStart);
        const nInc = newRun
          ? (pWrap === "reading" ? READING_RUN_GAP_MM : RUN_GAP_MM) +
            (nTbl ? theadOf(nx.wrap) : 0) +
            (nBox ? BOX_PAD_MM : 0) +
            (nAct || nWsl ? ACTIVITY_PAD_MM : 0) +
            nH
          : (nBox ? LI_GAP_MM : nMp ? ARROW_MM : 0) + nH;
        groupH += nInc;
        if (firstInc === 0) firstInc = nInc;
        // 흐름 섹션은 첫 조각 inc 만 있으면 판정이 끝난다(나머지 스캔 불필요).
        if (it.splitWithPrev && firstInc > 0) break;
        pWrap = nx.wrap;
        pSection = nx.sectionIndex;
        pOrder = orderIdOf(nx);
      }
      if (!it.splitWithPrev && groupH <= pageBodyMm) {
        orphanBreak = h + groupH > pageBodyMm;
      } else {
        // (a) 흐름 섹션(splitWithPrev) 또는 (b) 빈 페이지 하나로도 못 담는 초대형 그룹 —
        // 둘 다 최소 보증(헤더 + 첫 아이템이 함께 실림)만 요구한다(헤더 단독 고아만 방지).
        orphanBreak = firstInc > 0 && h + RUN_GAP_MM + hh + firstInc > pageBodyMm;
      }
    }

    const atTopInc = () => (tbl ? theadOf(it.wrap) : 0) + (box ? BOX_PAD_MM : 0) + (act || wsl ? ACTIVITY_PAD_MM : 0) + hh;

    // ── [E27] 논리 블록 원자성 — 「문항이 페이지에서 잘리면 통째로 다음 장」 ──────────
    //
    // packFlow 의 루프 단위는 **조각(FlowItem) 1개**이고 논리 블록(orderId 그룹) 개념이
    // 예산 판정에 없다. 그래서 그룹의 j(>0)번째 조각은 newRun=false 로 떨어져 inc 가 순수
    // own[j] 가 되고, 그 조각 하나가 잔여 예산을 넘기는 순간 **앞 조각들만 현재 페이지에
    // 남는다** = 발문은 이 페이지, 지문 박스·선지는 다음 페이지(사용자 스크린샷의 9번 문항).
    //
    // 위 orphanBreak 는 같은 문제를 이미 풀고 있지만 `isSecHeader` 게이트에 갇혀 있어
    // wrap="ws-list" 인 문항 조각에는 **한 번도 실행되지 않는다**(:242).
    //
    // 여기서는 `it.atomic` 을 부여받은 그룹에 한해 같은 시뮬레이션을 돌린다. 산식은
    // orphanBreak 루프(:263-270)와 **완전히 같은 규칙의 복제**여야 한다 — 다른 규칙을 쓰면
    // 「들어간다고 판정했는데 실제로는 넘쳐 러닝푸터를 뚫는」 계통이 된다.
    let atomicBreak = false;
    if (!forceBreak && !orphanBreak && it.atomic && groupStart && page.length > 0) {
      const myOrder = orderIdOf(it);
      // 첫 조각의 inc = 본 패킹의 newRun 경로(atomic 그룹은 groupStart 라 항상 newRun 이다).
      const gap0 = prevWrap === "reading" ? READING_RUN_GAP_MM : RUN_GAP_MM;
      let groupH =
        gap0 + (tbl ? theadOf(it.wrap) : 0) + (box ? BOX_PAD_MM : 0) + (act || wsl ? ACTIVITY_PAD_MM : 0) + hh;
      // keepWithNextGroup = 다음 atomic 그룹 **1개까지만** 함께 계산한다. 상한이 없으면
      // 문항 조각에는 breakBefore/secheader/cover 종료 조건이 하나도 없어(질문 조각의 필드
      // 구성) 시뮬레이션이 묶음 끝까지 전진하고 결국 전량 이월이 된다.
      let hops = it.keepWithNextGroup ? 1 : 0;
      // **자기 그룹만의 높이** 스냅샷 — 쌍(공유지문+첫 멤버)이 한 페이지를 넘길 때
      // 「쌍은 포기하되 자기 원자성은 지킨다」로 강등하기 위한 값이다(아래 판정 2단계).
      // 이게 없으면 쌍이 안 들어가는 순간 atomicBreak 이 통째로 false 가 되어
      // **공유지문 자신이 조각 단위로 쪼개진다** — R2 가 없애려던 절단을 플래그가
      // 스스로 만드는 역전이다(적대검수 실측: 3문단 공유지문 248.2mm 단독은 들어가는데
      // 첫 멤버 50.2mm 를 더한 298.4mm 가 262mm 를 넘겨 원자성이 사라졌다).
      let selfH = 0;
      let pOrder = myOrder;
      let pWrap: WrapKind = it.wrap;
      let pSection = it.sectionIndex;
      for (let j = k + 1; j < items.length; j++) {
        const nx = items[j];
        const nOrder = orderIdOf(nx);
        if (nOrder !== pOrder) {
          // 그룹 경계 — 함께 끌고 갈 권한이 남아 있고 다음 그룹도 원자 그룹일 때만 전진.
          if (hops <= 0 || !nx.atomic) break;
          hops -= 1;
          // 경계를 **처음 넘는 순간**의 누적치가 곧 「자기 그룹만의 높이」다.
          if (selfH === 0) selfH = groupH;
        }
        if (nx.breakBefore) break; // 강제 분할이 걸린 아이템은 애초에 같은 페이지가 아니다.
        const nxMeta = blockMeta?.[editIdOf(nx)] ?? blockMeta?.[nx.id];
        const nTbl = TABLE_WRAPS.has(nx.wrap);
        const nBox = BOX_LIST_WRAPS.has(nx.wrap);
        const nMp = nx.wrap === "map";
        const nAct = nx.wrap === "activity";
        const nWsl = nx.wrap === "ws-list";
        const nStart = nOrder !== pOrder;
        const nMinH = nWsl ? 0 : nxMeta?.minHeight ?? 0;
        const nH = Math.max(own[j], nMinH);
        const newRunN =
          isStandalone(nx.wrap) || nx.sectionIndex !== pSection || nx.wrap !== pWrap || (nWsl && nStart);
        groupH += newRunN
          ? (pWrap === "reading" ? READING_RUN_GAP_MM : RUN_GAP_MM) +
            (nTbl ? theadOf(nx.wrap) : 0) +
            (nBox ? BOX_PAD_MM : 0) +
            (nAct || nWsl ? ACTIVITY_PAD_MM : 0) +
            nH
          : (nBox ? LI_GAP_MM : nMp ? ARROW_MM : 0) + nH;
        pWrap = nx.wrap;
        pSection = nx.sectionIndex;
        pOrder = nOrder;
      }
      // 빈 페이지에도 안 들어가는 초대형 그룹은 **원자성을 포기**한다 — 이월해 봐야 다음
      // 페이지에서도 넘치므로, 이월은 앞 페이지만 백지로 만들고 아무것도 고치지 못한다
      // (orphanBreak 의 `groupH <= pageBodyMm` 2분기와 같은 강등 규칙).
      // hops 를 한 번도 안 쓴 그룹은 groupH 자체가 자기 높이다.
      if (selfH === 0) selfH = groupH;
      if (groupH <= pageBodyMm) {
        atomicBreak = h + groupH > pageBodyMm;
      } else if (selfH <= pageBodyMm) {
        // 쌍은 한 페이지에 못 담는다 → **쌍 결합만 포기**하고 자기 그룹의 원자성은 지킨다.
        // (여기서 포기하지 않으면 공유지문 자신이 쪼개진다 — 위 selfH 주석의 실측 사례.)
        atomicBreak = h + selfH > pageBodyMm;
      }
      // selfH 마저 빈 페이지를 넘는 초대형 그룹이면 둘 다 false → 기존 흐름 분할로 강등한다
      // (이월해 봐야 다음 페이지에서도 넘치므로 앞 페이지만 백지가 된다 —
      //  orphanBreak 의 `groupH <= pageBodyMm` 2분기와 같은 강등 규칙).
    }

    let inc: number;
    if (page.length === 0) {
      inc = atTopInc();
    } else {
      const newSection = it.sectionIndex !== prevSection;
      // ws-list 는 그룹(orderId)이 바뀌면 새 박스(런) — 연속 그룹이 한 박스로 합산되는 것 방지.
      const newRun = standalone || newSection || it.wrap !== prevWrap || (wsl && groupStart);
      if (newRun) {
        // 런 간 간격은 '직전 런 블록'의 margin-bottom — 독해 런(2.6mm)은 공용 3.2mm 로
        // 계상하면 경계마다 0.6mm 과대되어 큰 캔버스 블록이 근소 차로 통째 이월된다.
        const gap = prevWrap === "reading" ? READING_RUN_GAP_MM : RUN_GAP_MM;
        inc = gap + (tbl ? theadOf(it.wrap) : 0) + (box ? BOX_PAD_MM : 0) + (act || wsl ? ACTIVITY_PAD_MM : 0) + hh;
      } else {
        inc = (box ? LI_GAP_MM : mp ? ARROW_MM : 0) + hh;
      }
    }

    if (forceBreak || orphanBreak || atomicBreak || (page.length > 0 && h + inc > pageBodyMm)) {
      // 카드 그리드(단어장) 런이 높이 초과로 다음 페이지로 이어지면, 이어지는 페이지 상단의
      // 연속 머리(.par-cont-head-cont — pages.tsx 가 렌더) 높이를 예산에 가산한다.
      // [E27] atomicBreak 도 「넘쳐서 이어지는 것」이 아니라 **의도적 이월**이라 연속 머리가
      // 아니다 — 조건에서 함께 배제한다(문항은 vocab-grid 가 아니라 실질 무영향이지만,
      // 세 강제 분할 중 하나만 빠져 있으면 다음 사람이 그 비대칭을 추적하게 된다).
      const contHead =
        !forceBreak &&
        !orphanBreak &&
        !atomicBreak &&
        it.wrap === "vocab-grid" &&
        prevWrap === "vocab-grid" &&
        it.sectionIndex === prevSection;
      pages.push(page);
      page = [];
      h = contHead ? CONT_HEAD_MM : 0;
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
