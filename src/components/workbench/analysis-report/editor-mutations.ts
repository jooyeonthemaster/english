import type {
  AnalysisReport,
  AnalysisSection,
  BlockMeta,
  CustomBlock,
  ReportMeta,
  SectionLayout,
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

/** blockOrder(부분 가능)를 자연 순서 id 목록에 적용해 최종 표시 순서를 만든다. */
export function applyBlockOrder(naturalIds: string[], order?: string[]): string[] {
  if (!order || order.length === 0) return naturalIds;
  const pos = new Map(order.map((id, i) => [id, i]));
  return naturalIds
    .map((id, i) => ({ id, i }))
    .sort((a, b) => {
      const pa = pos.has(a.id) ? (pos.get(a.id) as number) : order.length + a.i;
      const pb = pos.has(b.id) ? (pos.get(b.id) as number) : order.length + b.i;
      return pa - pb;
    })
    .map((x) => x.id);
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
  const idSet = new Set(ids);
  let customBlocks = report.customBlocks ?? [];
  let blockOrder = report.blockOrder;
  const blockMeta = { ...(report.blockMeta ?? {}) };
  for (const id of ids) {
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

// ─── 배열 행 추가용 빈 템플릿 ────────────────────────────────────────────────
export function blankVocabRow() {
  return { headword: "", pronunciation: "", meaning: "", synonyms: "" };
}
export function blankGrammarRow(sentenceNo = 1) {
  return { sentenceNo, excerpt: "", point: "", explanation: "", trap: "" };
}
export function blankExamRow() {
  return { type: "", asks: "", strategy: "" };
}
