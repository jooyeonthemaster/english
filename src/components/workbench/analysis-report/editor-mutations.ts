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

  return {
    ...report,
    sections: report.sections.filter((_, i) => i !== index),
    layout: layout.filter((_, i) => i !== index),
    blockMeta,
    blockOrder,
  };
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
 * 문장/표행/요약문/구문항목은 해당 배열에서 제거, 커스텀은 제거, 섹션헤더는 섹션 전체 삭제,
 * 구조도 노드/노트 등 구조적 블록은 숨김 처리.
 */
export function deleteItem(report: AnalysisReport, id: string): AnalysisReport {
  if (id === "cover") return report.cover ? { ...report, cover: { ...report.cover, enabled: false } } : report;
  if (id.startsWith("c-")) return deleteCustomBlock(report, id);
  const m = /^s(\d+)-(.+)$/.exec(id);
  if (!m) return setBlockMeta(report, id, { hidden: true }); // title / meta → 숨김
  const si = Number(m[1]);
  const suffix = m[2];
  const sec = report.sections[si];
  if (!sec) return report;

  if (suffix === "head") return deleteSection(report, si);

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
