import {
  NUMBERED_SECTION_LABELS,
  SECTION_LABELS_EN,
  type AnalysisReport,
  type AnalysisSection,
} from "@/lib/passage-report/analysis-report/schema";
import {
  isKoAnalysisSectionKind,
  KO_NUMBERED_SECTION_LABELS,
  KO_SECTION_LABELS_EN,
  type KoAnalysisSectionKind,
} from "@/lib/passage-report/analysis-report/ko-schema";
import type { SectionFlowOptions } from "./types";

/**
 * 섹션 '헤더 슬롯' 단일 진실원 — 순수 TS(JSX 없음).
 * assemble.tsx(렌더)와 목차 UI·editor-mutations 가 같은 목록을 보게 해서
 * '목차에 보이는 섹션'과 '실제로 조판되는 섹션'이 어긋나지 않게 한다.
 *
 * 여기서 말하는 '섹션'은 report.sections[] 와 1:1 이 아니다 —
 *  · passage           → 「원문 · 문장별 해석」(clean) + 「필기 분석 · 어법과 구문」(annotated)
 *  · learning-worksheet → 「지문 논리 구조 분석」(논리표 승격) + 「실전 학습지」
 * 즉 한 섹션 인덱스가 두 목차 항목을 낳는다. 그래서 키는 섹션 인덱스가 아니라
 * 슬롯키 `${kind}${idSuffix}` 다(= report.sectionHeadings 라벨 오버라이드가 쓰는 키와 동일).
 * 인덱스를 키로 못 쓰는 이유: 실전 학습지 생성 라우트가 learning-worksheet 를 배열 끝으로
 * 재삽입해 sectionIndex 가 흔들린다.
 */

/** 헤더 슬롯의 kind — 영어/국어(PRIME_KO) 섹션 종류를 모두 받는다. */
export type SectionSlotKind = AnalysisSection["kind"] | KoAnalysisSectionKind;

export interface SectionSlot {
  /** 슬롯키 `${kind}${idSuffix}` — sectionHeadings / hiddenSections 공용 키. */
  key: string;
  /** 헤더 FlowItem id `s{si}-head{idSuffix}`. */
  headId: string;
  /** 원본 report.sections 인덱스. */
  si: number;
  kind: SectionSlotKind;
  idSuffix: string;
  /** assemble 인라인 라벨(없으면 kind 라벨 맵 폴백). */
  labelKo?: string;
  labelEn?: string;
  breakBefore?: boolean;
  keepWithPrev?: boolean;
  /** sectionFlowItems 에 넘길 옵션(공통 옵션은 assemble 이 덧붙인다). */
  flow: Partial<SectionFlowOptions>;
  /** 헤더를 만들지 않는 슬롯 — 단어 시험지 전용 모드(vocabTestOnly). 목차에도 나오지 않는다. */
  headless?: boolean;
  /** 논리 구조 슬롯 — sectionFlowItems 대신 s{si}-logic-promoted 블록 하나만 붙는다. */
  promotedLogic?: boolean;
  /** 폴백 경로에서 이 슬롯 본문 뒤에 논리표를 덧붙일 섹션 인덱스(없으면 -1). */
  appendPromotedLogicSi: number;
}

type SectionSlotInit = Omit<SectionSlot, "key" | "headId" | "si" | "kind" | "idSuffix" | "appendPromotedLogicSi"> & {
  appendPromotedLogicSi?: number;
};

/**
 * 보고서 → 헤더 슬롯 목록(자연 순서). assemble.tsx 의 렌더 순서와 1:1 이어야 한다.
 * hiddenSections 필터는 여기서 하지 않는다(목차가 꺼진 항목도 보여줘야 하므로).
 */
export function reportSectionSlots(report: AnalysisReport): SectionSlot[] {
  const vocabTestOnly = !!report.vocabTestOnly;
  const slots: SectionSlot[] = [];
  const add = (si: number, kind: SectionSlotKind, idSuffix: string, init: SectionSlotInit) => {
    slots.push({
      key: `${kind}${idSuffix}`,
      headId: `s${si}-head${idSuffix}`,
      si,
      kind,
      idSuffix,
      appendPromotedLogicSi: -1,
      ...init,
    });
  };

  const findIdx = (k: AnalysisSection["kind"]) => report.sections.findIndex((s) => s.kind === k);
  const passageIdx = findIdx("passage");

  // ── 새 보고서 구성 (passage 존재 시): 원문+해석 → 요약 → 논리 → 필기 캔버스 → 어휘 → 학습지 ──
  if (!vocabTestOnly && passageIdx >= 0) {
    const summaryIdx = findIdx("summary");
    const vocabIdx = findIdx("vocabulary");
    const lwIdx = report.sections.findIndex((s) => s.kind === "learning-worksheet");
    const lwSection = lwIdx >= 0 && report.sections[lwIdx].kind === "learning-worksheet" ? report.sections[lwIdx] : undefined;
    const lwHasLogic = !!lwSection && lwSection.logicRows.length > 0;
    // 06 실전 학습지(워크북/추론) 콘텐츠 유무 — 기본 분석은 logicRows 만 든 learning-worksheet 를
    // 만들므로, 실제 워크북/추론이 생성됐을 때만 '실전 학습지' 슬롯을 만든다.
    const lwHasWorkbook = !!lwSection && (
      !!lwSection.workbookSet ||
      !!lwSection.inferenceSet ||
      !!lwSection.cloze ||
      !!lwSection.practice ||
      !!lwSection.drills
    );

    // 1) 원문 + 문장별 해석 (필기 없음) — 영어 원문 페이지가 켜졌으면 새 페이지에서 시작
    add(passageIdx, "passage", "", {
      labelKo: "원문 · 문장별 해석",
      labelEn: "Original Passage & Translation",
      breakBefore: !!report.englishOnlyPage,
      flow: { passageRenderMode: "clean" },
    });

    // 2) 한눈에 보는 지문 구조 (도식) — 섹션 삭제됨(사용자 요청): 슬롯 없음

    // 3) 핵심 요약
    if (summaryIdx >= 0) add(summaryIdx, "summary", "", { breakBefore: false, flow: {} });

    // 4) 지문 논리 구조 분석 (Logic Map) — 메인 분석의 learning-worksheet.logicRows 표.
    //    핵심 요약과 같은 페이지에 이어 붙인다(섹션마다 새 페이지 강제 분할 면제).
    if (lwHasLogic) {
      add(lwIdx, "learning-worksheet", "-logic", {
        labelKo: "지문 논리 구조 분석",
        labelEn: "Logic Map",
        breakBefore: false,
        keepWithPrev: true,
        flow: {},
        promotedLogic: true,
      });
    }

    // 5) 필기 분석 캔버스 (어법·구문·출제 인라인) — 새 페이지에서 시작
    add(passageIdx, "passage", "-anno", {
      labelKo: "필기 분석 · 어법과 구문",
      labelEn: "Annotated Reading",
      breakBefore: true,
      flow: { passageRenderMode: "annotated" },
    });

    // 6) 핵심 어휘 (단어 시험 원천)
    if (vocabIdx >= 0) add(vocabIdx, "vocabulary", "", { breakBefore: false, flow: {} });

    // 7) 실전 학습지 (06) — 워크북/추론이 생성됐을 때만. (논리표는 4번에서 별도 표시 → 여기선 제외)
    if (lwIdx >= 0 && lwHasWorkbook) {
      add(lwIdx, "learning-worksheet", "", { breakBefore: false, flow: { skipWorksheetLogic: true } });
    }

    return slots;
  }

  // ── 폴백: passage 없음(PRIME_KO 포함) 또는 vocabTestOnly — 기존 자연 순서 ──
  const inlineStudyNotes = !vocabTestOnly && report.sections.some((section) => section.kind === "passage");
  const summaryIndex = report.sections.findIndex((section) => section.kind === "summary");
  const promotedLogicIndex = summaryIndex >= 0
    ? report.sections.findIndex((section) => section.kind === "learning-worksheet" && section.logicRows.length > 0)
    : -1;
  report.sections.forEach((section, si) => {
    if (section.kind === "self-check") return;
    // 한눈에 보는 지문 구조(도식) 섹션 삭제됨(사용자 요청) — 폴백 경로에서도 제외
    if (section.kind === "structure-map") return;
    if (vocabTestOnly && section.kind !== "vocabulary") return;
    if (inlineStudyNotes && (section.kind === "grammar" || section.kind === "exam-focus" || section.kind === "parsing")) return;
    add(si, section.kind, "", {
      // 단어 시험지 전용 모드는 헤더 없이 시험지 본문만 낸다(기존 동작 보존).
      headless: vocabTestOnly,
      flow: { vocabTestOnly, skipWorksheetLogic: si === promotedLogicIndex },
      appendPromotedLogicSi: !vocabTestOnly && si === summaryIndex && promotedLogicIndex >= 0 ? promotedLogicIndex : -1,
    });
  });
  return slots;
}

/**
 * 실제로 적용되는 '꺼진 슬롯키' 집합.
 * 단어 시험지 전용 모드에서는 목차 자체가 없으므로 hiddenSections 를 무시한다
 * (그 모드로 전환했다고 시험지가 통째로 사라지면 안 된다).
 */
export function hiddenSectionKeys(report: AnalysisReport): ReadonlySet<string> {
  if (report.vocabTestOnly) return new Set<string>();
  return new Set(report.hiddenSections ?? []);
}

/** 슬롯키 하나가 꺼져 있는지. */
export function isSectionHidden(report: AnalysisReport, key: string): boolean {
  return (report.hiddenSections ?? []).includes(key);
}

/** 목차 한 줄 — UI 표시용 파생값(JSX 없음, 매 렌더 호출해도 저렴). */
export interface OutlineEntry {
  key: string;
  /** 클릭 시 점프 대상 블록 id. */
  headId: string;
  kind: SectionSlotKind;
  titleKo: string;
  titleEn: string;
  /** 표시 번호(꺼진 슬롯은 null). SectionHead 가 매기는 순번과 동일 규칙. */
  no: number | null;
  hidden: boolean;
}

/** 슬롯 제목 3단 폴백 — (1) sectionHeadings 오버라이드 (2) 슬롯 인라인 라벨 (3) kind 라벨 맵. */
function slotTitles(report: AnalysisReport, slot: SectionSlot): { ko: string; en: string } {
  const ov = report.sectionHeadings?.[slot.key];
  const kind = slot.kind;
  // PRIME_KO 폴백 — 영어 kind 는 기존 맵 그대로(무회귀), KO kind 만 KO 라벨 맵 사용(SectionHead 와 동일).
  const fallbackKo = isKoAnalysisSectionKind(kind) ? KO_NUMBERED_SECTION_LABELS[kind] : NUMBERED_SECTION_LABELS[kind];
  const fallbackEn = isKoAnalysisSectionKind(kind) ? KO_SECTION_LABELS_EN[kind] : SECTION_LABELS_EN[kind];
  return {
    ko: ov?.ko ?? slot.labelKo ?? fallbackKo,
    en: ov?.en ?? slot.labelEn ?? fallbackEn,
  };
}

/**
 * 목차(섹션 켜기/끄기 패널)용 목록. 꺼진 슬롯은 번호를 소비하지 않으므로
 * 켜진 섹션이 01·02·03 으로 자동 재배열된다(= assemble 의 번호 규칙과 동일).
 */
export function reportOutline(report: AnalysisReport): OutlineEntry[] {
  const off = new Set(report.hiddenSections ?? []);
  const entries: OutlineEntry[] = [];
  let no = 0;
  for (const slot of reportSectionSlots(report)) {
    if (slot.headless) continue; // 단어 시험지 전용 모드 — 목차 없음
    const hidden = off.has(slot.key);
    if (!hidden) no += 1;
    const { ko, en } = slotTitles(report, slot);
    entries.push({
      key: slot.key,
      headId: slot.headId,
      kind: slot.kind,
      titleKo: ko,
      titleEn: en,
      no: hidden ? null : no,
      hidden,
    });
  }
  return entries;
}
