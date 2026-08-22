import type {
  AnalysisReport,
  AnalysisSection,
  BlockMeta,
  CustomBlock,
  ReportMeta,
  SectionLayout,
  VocabTestLayout,
  VocabTestMode,
  VocabularyTier,
} from "@/lib/passage-report/analysis-report/schema";
// 배럴(index)이 아니라 파일을 직접 임포트 — section-slots 는 순수 TS 라
// 뮤테이션 계층이 assemble 의 React 트리를 끌어오지 않는다.
import { reportSectionSlots } from "./report-sections/section-slots";

/**
 * 분석 보고서 편집을 위한 순수 불변 업데이트 헬퍼.
 * 모든 함수는 새 AnalysisReport 를 반환 (입력 불변).
 */

/** layout 배열을 sections 와 같은 길이로 정규화 (없으면 빈 객체로 채움). */
export function normalizedLayout(report: AnalysisReport): SectionLayout[] {
  const len = report.sections.length;
  const base = report.layout ?? [];
  return Array.from({ length: len }, (_, i) => base[i] ?? {});
}

/** 특정 섹션 콘텐츠 교체. */
export function setSection(
  report: AnalysisReport,
  index: number,
  next: AnalysisSection,
): AnalysisReport {
  const sections = report.sections.map((s, i) => (i === index ? next : s));
  return { ...report, sections };
}

/** 메타(타이틀/분류 등) 교체. */
export function setMeta(report: AnalysisReport, next: ReportMeta): AnalysisReport {
  return { ...report, meta: next };
}

/**
 * 섹션 삭제 후 블록 id 보정. 실제 id 문법은 s{si}-head / s{si}-snt0 / s{si}-row0 / s{si}-it0 …
 * (구버전의 -p{n} 가정은 틀림). 접두 s{숫자}- 전체를 매칭해 접미는 보존하고 섹션 인덱스만 시프트.
 * title/meta/c-(커스텀) 등은 그대로 통과.
 */
function shiftBlockIdAfterDelete(id: string, deletedIndex: number): string | null {
  const m = /^s(\d+)-(.+)$/.exec(id);
  if (!m) return id; // title / meta / c-… 통과
  const si = Number(m[1]);
  if (si === deletedIndex) return null; // 삭제된 섹션의 블록 → 제거
  if (si > deletedIndex) return `s${si - 1}-${m[2]}`;
  return id;
}

/** 섹션 삭제 (layout + blockMeta + blockOrder 의 id 까지 보정). */
export function deleteSection(report: AnalysisReport, index: number): AnalysisReport {
  const layout = normalizedLayout(report);

  const blockMeta: Record<string, BlockMeta> = {};
  for (const [id, meta] of Object.entries(report.blockMeta ?? {})) {
    const nid = shiftBlockIdAfterDelete(id, index);
    if (nid) blockMeta[nid] = meta;
  }
  const blockOrder = report.blockOrder
    ?.map((id) => shiftBlockIdAfterDelete(id, index))
    .filter((x): x is string => !!x);

  // 목차 OFF 키(슬롯키 = `${kind}${idSuffix}`)도 함께 정리 — 같은 kind 섹션이 나중에 다시
  // 생기면(실전 학습지 재생성) 유령 숨김이 되살아나는 것을 막는다.
  const deletedKind = report.sections[index]?.kind;
  const pruned = deletedKind
    ? (report.hiddenSections ?? []).filter((k) => k !== deletedKind && !k.startsWith(`${deletedKind}-`))
    : report.hiddenSections ?? [];

  return {
    ...report,
    sections: report.sections.filter((_, i) => i !== index),
    layout: layout.filter((_, i) => i !== index),
    blockMeta,
    blockOrder,
    hiddenSections: pruned.length ? pruned : undefined,
  };
}

// ─── 목차(섹션 슬롯) 켜기/끄기 ───────────────────────────────────────────────
/**
 * 섹션 슬롯 on/off — 비파괴(데이터 보존). 키는 섹션 인덱스가 아니라 슬롯키
 * `${kind}${idSuffix}`("passage" / "passage-anno" / "learning-worksheet-logic" …)로,
 * sectionHeadings 라벨 오버라이드와 같은 식별자다(section-slots.ts 참고).
 * 빈 배열은 undefined 로 정규화해 저장본을 오염시키지 않는다.
 */
export function toggleHiddenSection(report: AnalysisReport, key: string): AnalysisReport {
  const cur = report.hiddenSections ?? [];
  const next = cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key];
  return { ...report, hiddenSections: next.length ? next : undefined };
}

/** 섹션 슬롯을 명시적으로 켜기/끄기 (이미 그 상태면 원본 그대로 반환 — 히스토리 오염 방지). */
export function setSectionHidden(report: AnalysisReport, key: string, hidden: boolean): AnalysisReport {
  const cur = report.hiddenSections ?? [];
  if (cur.includes(key) === hidden) return report;
  return toggleHiddenSection(report, key);
}

/** 섹션을 from → to 위치로 이동 (layout 동반 이동). */
export function moveSection(report: AnalysisReport, from: number, to: number): AnalysisReport {
  const len = report.sections.length;
  if (from === to || from < 0 || to < 0 || from >= len || to >= len) return report;
  const sections = report.sections.slice();
  const layout = normalizedLayout(report);
  const [s] = sections.splice(from, 1);
  const [l] = layout.splice(from, 1);
  sections.splice(to, 0, s);
  layout.splice(to, 0, l);
  return { ...report, sections, layout };
}

/** 드래그 드롭 — source 섹션을 target 섹션의 before/after 위치로 이동. */
export function moveSectionToTarget(
  report: AnalysisReport,
  fromIndex: number,
  toIndex: number,
  placement: "before" | "after",
): AnalysisReport {
  if (fromIndex < 0 || toIndex < 0) return report;
  let dest = placement === "after" ? toIndex + 1 : toIndex;
  // splice 제거 후 인덱스 보정
  if (fromIndex < dest) dest -= 1;
  return moveSection(report, fromIndex, dest);
}

/** 섹션 레이아웃 플래그 패치. */
export function setLayout(
  report: AnalysisReport,
  index: number,
  patch: Partial<SectionLayout>,
): AnalysisReport {
  const layout = normalizedLayout(report);
  layout[index] = { ...layout[index], ...patch };
  return { ...report, layout };
}

// ─── 블록 단위 (서식 + 페이지 + 순서) ───────────────────────────────────────
/** 블록 메타(서식/페이지) 패치. */
export function setBlockMeta(report: AnalysisReport, id: string, patch: Partial<BlockMeta>): AnalysisReport {
  const blockMeta = { ...(report.blockMeta ?? {}) };
  blockMeta[id] = { ...(blockMeta[id] ?? {}), ...patch };
  return { ...report, blockMeta };
}

/** 표(grammar/exam/vocab) 열 너비(퍼센트 맵) 저장 — 세로 구분선 드래그 결과 커밋. */
export function setTableColWidths(
  report: AnalysisReport,
  group: string,
  widths: Record<string, number>,
): AnalysisReport {
  const tableColWidths = { ...(report.tableColWidths ?? {}) };
  tableColWidths[group] = { ...widths };
  return { ...report, tableColWidths };
}

/** blockOrder(부분 가능)를 자연 순서 id 목록에 적용해 최종 표시 순서를 만든다. */
export function applyBlockOrder(naturalIds: string[], order?: string[]): string[] {
  if (!order || order.length === 0) return naturalIds;
  // 저장된 순서 중 실제 존재하는 id 만 (순서 유지)
  const naturalSet = new Set(naturalIds);
  const result = order.filter((id) => naturalSet.has(id));
  const placed = new Set(result);
  // 저장된 순서에 없던 '새 id'(표지/영어 원문 페이지 등)는 맨 뒤로 보내지 말고,
  // 자연 순서상 '바로 앞 이웃' 뒤에 끼워 넣어 원래 위치(예: 맨 앞)를 유지한다.
  for (let i = 0; i < naturalIds.length; i++) {
    const id = naturalIds[i];
    if (placed.has(id)) continue;
    let anchor: string | null = null;
    for (let j = i - 1; j >= 0; j--) {
      if (placed.has(naturalIds[j])) {
        anchor = naturalIds[j];
        break;
      }
    }
    const insertAt = anchor ? result.indexOf(anchor) + 1 : 0;
    result.splice(insertAt, 0, id);
    placed.add(id);
  }
  return result;
}

/** 드롭: source 를 target 의 before/after 로 옮긴 전체 순서 배열. */
export function reorderIds(
  orderedIds: string[],
  sourceId: string,
  targetId: string,
  placement: "before" | "after",
): string[] {
  if (sourceId === targetId) return orderedIds;
  const ids = orderedIds.filter((id) => id !== sourceId);
  const ti = ids.indexOf(targetId);
  if (ti < 0) return orderedIds;
  ids.splice(placement === "after" ? ti + 1 : ti, 0, sourceId);
  return ids;
}

/** 블록을 한 칸 위/아래로 이동한 전체 순서 배열. */
export function moveIdBy(orderedIds: string[], id: string, dir: -1 | 1): string[] {
  const i = orderedIds.indexOf(id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= orderedIds.length) return orderedIds;
  const next = orderedIds.slice();
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

// ─── 커스텀 블록 (여백 / 자유 텍스트) ────────────────────────────────────────
export function newCustomBlockId(): string {
  const rnd =
    globalThis.crypto && "randomUUID" in globalThis.crypto
      ? globalThis.crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `c-${rnd}`;
}

/** 커스텀 블록 메타 일부 패치. */
export function setCustomBlock(report: AnalysisReport, id: string, patch: Partial<CustomBlock>): AnalysisReport {
  const customBlocks = (report.customBlocks ?? []).map((b) =>
    b.id === id ? ({ ...b, ...patch } as CustomBlock) : b,
  );
  return { ...report, customBlocks };
}

/** 커스텀 블록 삭제 (blockOrder/blockMeta 정리). */
export function deleteCustomBlock(report: AnalysisReport, id: string): AnalysisReport {
  const customBlocks = (report.customBlocks ?? []).filter((b) => b.id !== id);
  const blockOrder = report.blockOrder?.filter((x) => x !== id);
  const blockMeta = { ...(report.blockMeta ?? {}) };
  delete blockMeta[id];
  return { ...report, customBlocks, blockOrder, blockMeta };
}

function logicalBlockId(id: string): string {
  return id.startsWith("c-") ? id.split("::", 1)[0] : id;
}

/**
 * 블록 id 하나를 삭제 — 노션식 미세 삭제.
 * 문장/표행/요약문/구문항목은 해당 배열에서 제거, 커스텀은 제거, 섹션헤더는 목차에서 OFF,
 * 구조도 노드/노트 등 구조적 블록은 숨김 처리.
 */
export function deleteItem(report: AnalysisReport, id: string): AnalysisReport {
  if (id === "cover") return report.cover ? { ...report, cover: { ...report.cover, enabled: false } } : report;
  if (id.startsWith("c-")) return deleteCustomBlock(report, id);

  // 섹션 헤더 블록 삭제 = '목차에서 그 섹션 끄기'(비파괴·되돌리기 가능).
  // 예전에는 s{si}-head 만 섹션 전체 삭제로 잡히고 신형 헤더(s{si}-head-anno / -logic)는
  // 아래 '헤더만 숨김'으로 떨어져 제목 없는 본문이 통째로 남았다 — 그 결함까지 함께 봉합한다.
  // 파괴적 '섹션 전체 삭제'는 편집 패널의 빨간 버튼(확인 후 deleteSection) 경로에 그대로 남는다.
  const slot = reportSectionSlots(report).find((s) => !s.headless && s.headId === id);
  if (slot) return setSectionHidden(report, slot.key, true);

  const m = /^s(\d+)-(.+)$/.exec(id);
  if (!m) return setBlockMeta(report, id, { hidden: true }); // title / meta → 숨김
  const si = Number(m[1]);
  const suffix = m[2];
  const sec = report.sections[si];
  if (!sec) return report;

  if (sec.kind === "passage") {
    const mm = /^snt(\d+)$/.exec(suffix);
    if (mm) return setSection(report, si, { ...sec, sentences: sec.sentences.filter((_, k) => k !== Number(mm[1])) });
  }
  if (sec.kind === "summary") {
    const mm = /^sum(\d+)$/.exec(suffix);
    if (mm) return setSection(report, si, { ...sec, sentences: sec.sentences.filter((_, k) => k !== Number(mm[1])) });
  }
  if (sec.kind === "grammar" || sec.kind === "exam-focus" || sec.kind === "vocabulary") {
    const mm = /^row(\d+)$/.exec(suffix);
    if (mm) return setSection(report, si, { ...sec, rows: sec.rows.filter((_, k) => k !== Number(mm[1])) } as AnalysisSection);
  }
  if (sec.kind === "parsing") {
    const mm = /^it(\d+)$/.exec(suffix);
    if (mm) return setSection(report, si, { ...sec, items: sec.items.filter((_, k) => k !== Number(mm[1])) });
  }
  // 구조도 노드 / note 등 → 숨김
  return setBlockMeta(report, id, { hidden: true });
}

/** 여러 블록 id 를 한 번에 정리(페이지 단위 삭제). 커스텀은 제거, 그 외는 숨김. */
export function hideOrDeleteIds(report: AnalysisReport, ids: string[]): AnalysisReport {
  const logicalIds = Array.from(new Set(ids.map(logicalBlockId)));
  const idSet = new Set(logicalIds);
  let customBlocks = report.customBlocks ?? [];
  let blockOrder = report.blockOrder;
  const blockMeta = { ...(report.blockMeta ?? {}) };
  for (const id of logicalIds) {
    if (id.startsWith("c-")) continue;
    blockMeta[id] = { ...(blockMeta[id] ?? {}), hidden: true };
  }
  if (customBlocks.some((b) => idSet.has(b.id))) {
    customBlocks = customBlocks.filter((b) => !idSet.has(b.id));
    blockOrder = blockOrder?.filter((x) => !idSet.has(x));
  }
  return { ...report, customBlocks, blockOrder, blockMeta };
}

/** 표 열 표시/숨김 토글 (vocabulary/grammar/exam-focus). */
export function toggleTableCol(report: AnalysisReport, sectionIndex: number, colKey: string): AnalysisReport {
  const sec = report.sections[sectionIndex];
  if (!sec || (sec.kind !== "vocabulary" && sec.kind !== "grammar" && sec.kind !== "exam-focus")) return report;
  const hidden = new Set(sec.hiddenCols ?? []);
  if (hidden.has(colKey)) hidden.delete(colKey);
  else hidden.add(colKey);
  return setSection(report, sectionIndex, { ...sec, hiddenCols: [...hidden] } as AnalysisSection);
}

export function setVocabularyTestMode(
  report: AnalysisReport,
  sectionIndex: number,
  mode: VocabTestMode,
): AnalysisReport {
  const sec = report.sections[sectionIndex];
  if (!sec || sec.kind !== "vocabulary") return report;
  const next = setSection(report, sectionIndex, { ...sec, vocabTestMode: mode });
  return mode === "study" ? { ...next, vocabTestOnly: false } : next;
}

export function setVocabularyTestOnly(
  report: AnalysisReport,
  sectionIndex: number,
  enabled: boolean,
  mode: Exclude<VocabTestMode, "study"> = "hide-meaning",
): AnalysisReport {
  const sec = report.sections[sectionIndex];
  if (!sec || sec.kind !== "vocabulary") return report;
  const next = enabled ? setSection(report, sectionIndex, { ...sec, vocabTestMode: mode }) : report;
  return { ...next, vocabTestOnly: enabled };
}

export function setVocabularyTestLayout(
  report: AnalysisReport,
  sectionIndex: number,
  layout: VocabTestLayout,
): AnalysisReport {
  const sec = report.sections[sectionIndex];
  if (!sec || sec.kind !== "vocabulary") return report;
  return setSection(report, sectionIndex, { ...sec, vocabTestLayout: layout });
}

/** 단어장(학습용 핵심 어휘) 레이아웃 — 1열 표("table") / 2열 카드("two-column"). */
export function setVocabularyStudyLayout(
  report: AnalysisReport,
  sectionIndex: number,
  layout: VocabTestLayout,
): AnalysisReport {
  const sec = report.sections[sectionIndex];
  if (!sec || sec.kind !== "vocabulary") return report;
  return setSection(report, sectionIndex, { ...sec, vocabStudyLayout: layout });
}

/** 난이도 단계(tier) 필터 설정 — 단어장 표시 + 시험지 출제 대상을 함께 거른다. 전체 선택은 undefined 로 정규화. */
export function setVocabularyTierFilter(
  report: AnalysisReport,
  sectionIndex: number,
  tiers: VocabularyTier[],
): AnalysisReport {
  const sec = report.sections[sectionIndex];
  if (!sec || sec.kind !== "vocabulary") return report;
  const all: VocabularyTier[] = ["core", "test", "challenge"];
  const normalized = all.filter((t) => tiers.includes(t));
  const filter = normalized.length === 0 || normalized.length === all.length ? undefined : normalized;
  return setSection(report, sectionIndex, { ...sec, vocabTierFilter: filter });
}

// ─── 파이널 원페이지 — 단어 시험지 승격 주입 (E23) ──────────────────────────
/**
 * 소스(같은 지문의 기본 리포트)의 vocabulary 섹션을 파이널 문서에 승격 주입한다.
 * 계약:
 *  · 파이널 문서의 슬롯 경로(section-slots.ts — final-onepage 조기 반환)는 주입 섹션에
 *    슬롯을 만들지 않는다. 지면 출력은 assemble 의 「숨긴 단어장 + 켜진 시험지」 특례
 *    emit(hidden.has("vocabulary"))이 유일한 경로라서, hiddenSections "vocabulary" 등록
 *    (슬롯키 = `${kind}${idSuffix}`, hiddenSectionKeys 실물과 동일 형식)이 필수다 —
 *    시험지 페이지만 나오고 학습용 단어장 표는 나오지 않는다(의도된 동작).
 *  · 소스 불변 — rows 와 배열 필드까지 딥카피해 이후 편집이 소스 리포트를 오염시키지 않는다.
 *  · 이미 vocabulary 섹션이 있거나 소스에 어휘가 없으면 원본 그대로 반환(멱등·히스토리 무오염).
 */
export function injectVocabTestSection(
  report: AnalysisReport,
  source: AnalysisReport | null | undefined,
): AnalysisReport {
  if (report.sections.some((s) => s.kind === "vocabulary")) return report;
  const src = source?.sections.find((s) => s.kind === "vocabulary");
  if (src?.kind !== "vocabulary" || src.rows.length === 0) return report;
  const injected: AnalysisSection = {
    ...src,
    rows: src.rows.map((row) => ({ ...row })),
    hiddenCols: src.hiddenCols ? [...src.hiddenCols] : undefined,
    vocabTestExcludedKeys: src.vocabTestExcludedKeys ? [...src.vocabTestExcludedKeys] : undefined,
    vocabTierFilter: src.vocabTierFilter ? [...src.vocabTierFilter] : undefined,
    vocabTestMode: "hide-meaning",
  };
  const withSection = { ...report, sections: [...report.sections, injected] };
  return setSectionHidden(withSection, "vocabulary", true);
}

/**
 * 파이널 문서의 주입 vocabulary 섹션 제거(단어 시험지 끄기) — 파이널의 vocabulary 는
 * 정의상 전부 주입본이다. deleteSection 이 layout/blockMeta/blockOrder id 시프트와
 * hiddenSections("vocabulary"·"vocabulary-…") 키 정리까지 담당하므로 그대로 위임한다.
 * vocabulary 가 없으면 원본 그대로 반환(멱등).
 */
export function removeInjectedVocabSection(report: AnalysisReport): AnalysisReport {
  let next = report;
  for (;;) {
    const idx = next.sections.findIndex((s) => s.kind === "vocabulary");
    if (idx < 0) return next;
    next = deleteSection(next, idx);
  }
}

// ─── 배열 행 추가용 빈 템플릿 ────────────────────────────────────────────────
export function blankVocabRow() {
  return { headword: "", pronunciation: "", meaning: "", tier: "test" as const, difficulty: 3, synonyms: "" };
}
export function blankGrammarRow(sentenceNo = 1) {
  return { sentenceNo, excerpt: "", point: "", explanation: "", trap: "" };
}
export function blankExamRow() {
  return { type: "", asks: "", strategy: "" };
}
