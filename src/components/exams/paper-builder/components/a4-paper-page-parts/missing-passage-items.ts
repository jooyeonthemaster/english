// ============================================================================
// 「원문 지문 없음」 경고(빌더·상세 배너, 문항 칩, 내보내기·인쇄 토스트)용 순수 모듈 — JSX·window 없음.
// (26-09-30 MISSING-PASSAGE-UI, 계약 docs/EXAM-PAPER-MODEL.md §6)
//
// 판정 정본은 CORE 의 saved-paper-items.isPaperItemSourcePassageMissing 하나다(감사·백필과 같은 규칙 — 26-09-30
// MODEL-FINISH 통일). 찍을 지문이 없는데 지문이 있었다면 찍었을 문항만 참이다(강제 유형 · 저장값 true · 저장값 없음의
// 기본값). 끌 수 있는 유형·정답 노출형의 저장값 false 는 선생님 선택이라 경고하지 않는다. 이 모듈은 기준별 「지문」만 고른다.
//  · 웹(화면·인쇄·PDF): buildGroups 처럼 item.passageContent → sourceQuestion.passage.content 로 폴백한 지문.
//    빌더에서 지문 박스 글을 모두 지운 문항은 웹이 원문으로 폴백해 찍으므로 경고하지 않는다.
//  · HWPX·DOCX(서버): resolvePrintablePassage(스냅숏 → DB → structuredData._sourcePassage 보관본)로 고른 지문.
//    저장본(buildPaperItemsFromExam)과 새로 담은 문항(makePaperItem)은 이미 이 지문을 담으므로 웹과 같다. 다른 경우는
//    보관본 반영 전에 만들어진 빌더 초안 항목뿐이다. 서버 판정 ⊆ 웹 판정.
// ============================================================================
import { resolvePrintablePassage } from "../../passage-policy";
import { isPaperItemSourcePassageMissing, isPaperItemSourcePassageMissingFor } from "../../saved-paper-items";
import type { PaperItem, PaperPage } from "../../types";

export const MISSING_PASSAGE_CHIP_LABEL = "원문 지문 없음";

export type MissingPassageItem = {
  localId: string;
  /** 시험지에 찍히는 문항 번호(문항 블록만 1부터). */
  orderNum: number;
  subType: string | null;
};

/** 판정 기준 — web = 화면·인쇄·PDF, export = HWPX·DOCX(서버 resolvePrintablePassage). */
export type MissingPassageBasis = "web" | "export";

/** 이 문항이 웹(화면·인쇄·PDF)에서 원문 지문 없이 찍히는가(CORE 단일 판정 그대로). 비문항 블록은 false. */
export function isPaperItemPrintedWithoutSourcePassage(item: PaperItem): boolean {
  return isPaperItemSourcePassageMissing(item);
}

/** 이 문항이 HWPX·DOCX 에서 원문 지문 없이 들어가는가(같은 판정 · 서버와 같은 지문 결정 — EXAM-PAPER-MODEL §3). 비문항 블록은 false. */
export function isPaperItemExportedWithoutSourcePassage(item: PaperItem): boolean {
  if (item.blockType !== "question") return false;
  const printable = resolvePrintablePassage({
    savedPassageContent: item.passageContent,
    question: item.sourceQuestion,
  });
  return isPaperItemSourcePassageMissingFor(item, printable.content);
}

/** 시험지 순서대로 「원문 지문 없음」 문항 목록. */
export function collectMissingPassageItems(
  items: readonly PaperItem[],
  basis: MissingPassageBasis = "web",
): MissingPassageItem[] {
  const judge = basis === "export" ? isPaperItemExportedWithoutSourcePassage : isPaperItemPrintedWithoutSourcePassage;
  const out: MissingPassageItem[] = [];
  for (const item of items) {
    if (!judge(item)) continue;
    out.push({
      localId: item.localId,
      orderNum: item.orderNum,
      subType: item.sourceQuestion.subType ?? null,
    });
  }
  return out;
}

/** "27·31·35번" — max 를 넘으면 "1·2·3번 외 4문항". */
export function formatMissingPassageNumbers(list: readonly MissingPassageItem[], max = 12): string {
  if (list.length === 0) return "";
  const shown = list.slice(0, Math.max(1, max)).map((entry) => String(entry.orderNum));
  const rest = list.length - shown.length;
  return `${shown.join("·")}번${rest > 0 ? ` 외 ${rest}문항` : ""}`;
}

/**
 * 배너 둘째 줄 — 어디에 지문 없이 나가는지 사실대로. 서버 판정 ⊆ 웹 판정이라 개수가 같으면 목록도 같다.
 * 다르면(빌더에 새로 담은 보관본 문항) HWPX·DOCX 에는 원문이 들어간다고 밝힌다.
 */
export function describeMissingPassageScope(webCount: number, exportCount: number): string {
  const base = "원문 지문이 삭제됐거나 연결되지 않아 지문 없이 발문과 선지만 찍힙니다";
  if (exportCount === webCount) return `${base}(인쇄·PDF·HWPX·DOCX 모두 같음).`;
  const recovered = webCount - exportCount;
  return `${base}(화면·인쇄·PDF). HWPX·DOCX 에는 그중 ${recovered}문항의 원문 지문이 들어갑니다(저장한 뒤 다시 열면 화면에도 나옵니다).`;
}

/** 조판 결과에서 문항이 처음 놓인 본문 쪽 번호(0부터, 표지 제외). 없으면 -1. */
export function findItemPageIndex(pages: readonly PaperPage[], localId: string): number {
  for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
    for (const column of pages[pageIndex]) {
      for (const fragment of column) {
        if (fragment.parts.some((part) => part.source.localId === localId)) return pageIndex;
      }
    }
  }
  return -1;
}

/** 스크롤러·대상의 화면 좌표(getBoundingClientRect)와 창 높이. */
export type RevealGeometry = {
  scrollTop: number;
  rootTop: number;
  rootBottom: number;
  viewportHeight: number;
  targetTop: number;
  targetHeight: number;
};

const REVEAL_MARGIN = 12;
/** 스크롤러가 창에 이만큼도 안 보이면 문서를 최소한만 내린다(배너가 창 아래 끝에 걸린 경우). */
export const REVEAL_MIN_VISIBLE_BAND = 240;

function visibleBand(g: Pick<RevealGeometry, "rootTop" | "rootBottom" | "viewportHeight">) {
  const top = Math.max(g.rootTop, 0);
  const bottom = Math.min(g.rootBottom, g.viewportHeight);
  return { top, height: Math.max(0, bottom - top) };
}

/**
 * 문서(창)를 얼마나 내려야 스크롤러가 창에 REVEAL_MIN_VISIBLE_BAND(스크롤러가 더 짧으면 그 높이) 이상 보이는가
 * (px, 0 = 움직이지 않음). 스크롤러가 창 아래로 잘린 경우만 양수다 — 위로 잘린 경우 내리면 더 가려진다.
 * 목표가 스크롤러 높이 이하라 스크롤러 아래 끝을 넘겨 내리는 일은 없다.
 */
export function computeRevealWindowNudge(g: Pick<RevealGeometry, "rootTop" | "rootBottom" | "viewportHeight">): number {
  if (g.rootBottom <= g.viewportHeight) return 0;
  const want = Math.min(REVEAL_MIN_VISIBLE_BAND, Math.max(0, g.rootBottom - g.rootTop));
  return Math.max(0, Math.round(want - visibleBand(g).height));
}

/**
 * 스크롤러만 움직여 대상을 「스크롤러 중 창에 보이는 띠」의 가운데(center, 띠보다 크면 위쪽) 또는 위쪽(start)에
 * 놓을 scrollTop. scrollIntoView 는 조상 스크롤(문서 포함)까지 굴려 빌더 앱 셸·상세 머리를 밀어 올렸다(MPUI-2).
 */
export function computeRevealScrollTop(g: RevealGeometry, align: "center" | "start"): number {
  const band = visibleBand(g);
  const inset =
    align === "center" ? Math.max(REVEAL_MARGIN, (band.height - g.targetHeight) / 2) : REVEAL_MARGIN;
  return Math.max(0, Math.round(g.scrollTop + (g.targetTop - band.top) - inset));
}

// CSS 문자열 값 이스케이프. 영숫자·_·-·:·@·. 밖의 글자는 전부 \HEX 로 바꾼다. 그래서 따옴표·역슬래시·
// 개행·「</style>」이 규칙이나 <style> 요소를 깨지 못한다. localId 는 저장된 settings 에서 오는 값이다.
function cssStringEscape(value: string): string {
  let out = "";
  for (const ch of value) {
    out += /[A-Za-z0-9_\-:@.]/.test(ch) ? ch : `\\${ch.codePointAt(0)!.toString(16)} `;
  }
  return out;
}

/** 칩이 붙는 요소 선택자 — 미리보기 루트 안 A4 쪽의 문항 조각만(쪽 썸네일·스튜디오 조판면 제외). */
export function missingPassageItemSelector(localId: string): string {
  return `#exam-paper-print-root .exam-a4-page [data-paper-item-id="${cssStringEscape(localId)}"]`;
}

/**
 * 「원문 지문 없음」 빨간 칩 — 문항 조각 오른쪽 위 모서리 바로 위(문항 사이 여백)에 붙는 화면 전용 ::after 표지.
 * 발문 첫 줄 끝을 가리지 않게 문항 윗변 위로 올린다(칩 높이의 20%만 문항 안쪽 여백에 걸친다).
 * 칸·쪽 경계에서 나뉜 문항은 조각마다 칩이 붙는다(조각마다 data-paper-item-id 가 같다).
 * @media screen 안에만 있어서 인쇄·PDF(page.pdf 포함)에는 절대 나오지 않는다. absolute 라서 조판 높이·
 * 넘침 가드 측정에도 영향이 없다. a4-paper-page 의 문항 조각 div 는 data-paper-item-id 와
 * position:relative 를 갖는다. 그래서 칩은 읽기 전용(상세)·편집(빌더)·잠긴 문항·모바일 어디서나 같은 모양이다.
 */
export function buildMissingPassageChipCss(localIds: readonly string[]): string {
  if (localIds.length === 0) return "";
  const selectors = localIds.map((id) => `${missingPassageItemSelector(id)}::after`).join(",\n");
  return `@media screen {
${selectors} {
  content: "${MISSING_PASSAGE_CHIP_LABEL}";
  position: absolute;
  bottom: 100%;
  right: 0;
  z-index: 15;
  transform: translateY(20%);
  padding: 1px 7px;
  border-radius: 9999px;
  background: #be123c;
  color: #fff;
  box-shadow: 0 0 0 2px #fff, 0 1px 3px rgba(15, 23, 42, 0.25);
  font-size: 10px;
  font-weight: 700;
  font-style: normal;
  line-height: 14px;
  letter-spacing: 0;
  text-align: center;
  text-indent: 0;
  text-decoration: none;
  white-space: nowrap;
  pointer-events: none;
}
}`;
}
