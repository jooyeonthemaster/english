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
 *  · learning-worksheet → 「실전 학습지」(유료 워크북/추론)
 *    (「지문 논리 구조 분석」 승격 슬롯은 26-08-21 유저 결정으로 폐지 — 생성도 중단)
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
  /** keepWithPrev 그룹 원자성 면제 — 헤더+첫 조각만 들어가면 앞 페이지에 붙이고 나머지는
   *  다음 장으로 흘린다(문장 단위로 쪼갤 수 있는 흐름 섹션 전용). FlowItem 으로 전달된다. */
  splitWithPrev?: boolean;
  /** sectionFlowItems 에 넘길 옵션(공통 옵션은 assemble 이 덧붙인다). */
  flow: Partial<SectionFlowOptions>;
  /** 헤더를 만들지 않는 슬롯 — 단어 시험지 전용 모드(vocabTestOnly). 목차에도 나오지 않는다. */
  headless?: boolean;
  /** 원페이지 파이널 슬롯 — sectionFlowItems 대신 assemble 이 전면 페이지(wrap:"cover") 1개를 붙인다. */
  finalOnepage?: boolean;
}

type SectionSlotInit = Omit<SectionSlot, "key" | "headId" | "si" | "kind" | "idSuffix">;

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
      ...init,
    });
  };

  const findIdx = (k: AnalysisSection["kind"]) => report.sections.findIndex((s) => s.kind === k);
  const passageIdx = findIdx("passage");

  // ── 원페이지 파이널 문서: 전면 시트 슬롯 1개가 문서의 전부 ──────────────────
  // 자체 헤더를 내장한 cover 페이지라 섹션 헤더 없음(headless). 목차·다른 슬롯 없음.
  const finalIdx = findIdx("final-onepage");
  if (!vocabTestOnly && finalIdx >= 0) {
    add(finalIdx, "final-onepage", "", { headless: true, finalOnepage: true, flow: {} });
    return slots;
  }

  // ── 새 보고서 구성 (passage 존재 시): 원문+해석 → 요약 → 논리 → 필기 캔버스 → 어휘 → 학습지 ──
  if (!vocabTestOnly && passageIdx >= 0) {
    const summaryIdx = findIdx("summary");
    const vocabIdx = findIdx("vocabulary");
    const lwIdx = report.sections.findIndex((s) => s.kind === "learning-worksheet");
    const lwSection = lwIdx >= 0 && report.sections[lwIdx].kind === "learning-worksheet" ? report.sections[lwIdx] : undefined;
    // 06 실전 학습지(워크북/추론) 콘텐츠 유무 — 기본 분석은 logicRows 만 든 learning-worksheet 를
    // 만들므로, 실제 워크북/추론이 생성됐을 때만 '실전 학습지' 슬롯을 만든다.
    const lwHasWorkbook = !!lwSection && (
      !!lwSection.workbookSet ||
      !!lwSection.inferenceSet ||
      !!lwSection.cloze ||
      !!lwSection.practice ||
      !!lwSection.drills
    );

    // ── 순서 v6 (2026-08-21 유저 확정): 제목 바로 아래 요약(영문 주제문만) → 원문·해석
    //    연속 흐름(1페이지 목표). 필기 분석부터 새 페이지, 어휘·학습지도 분리.
    //    v5 에 있던 「지문 논리 구조 분석」(03)은 폐지됐다 — 렌더 슬롯도 생성도 없다.

    // 1) 핵심 요약 — 제목 바로 아래(첫 섹션 헤더는 제목과 같은 페이지 규칙으로 자동 병합).
    if (summaryIdx >= 0) add(summaryIdx, "summary", "", { breakBefore: false, flow: {} });

    // 2) 원문 + 문장별 해석 (필기 없음) — 요약에 이어 같은 페이지에서 계속.
    //    (영어 원문 페이지가 켜진 경우의 페이지 닫힘은 assemble 의 첫 가시 헤더 breakBefore 가 담당)
    //    splitWithPrev(v6, 26-08-21 유저 확정): **항상 1페이지에 붙어 시작**한다. 문장 단위로
    //    쪼개지는 섹션이라 그룹 원자성(전체가 들어가야 붙임)을 요구하지 않는다 — 요구하면
    //    지문이 조금만 길어도 통째로 2페이지로 밀려 1페이지가 요약 한 줄만 남고 비었다.
    add(passageIdx, "passage", "", {
      labelKo: "원문 · 문장별 해석",
      labelEn: "Original Passage & Translation",
      breakBefore: false,
      keepWithPrev: true,
      splitWithPrev: true,
      flow: { passageRenderMode: "clean" },
    });

    // 4) 필기 분석 캔버스 (어법·구문·출제 인라인) — v5(26-08-11 유저 확정): 새 페이지로 분리.
    //    한글 요약 미표기로 1페이지에 01~03이 들어가게 되면서, 필기 분석은 아래 페이지로 내림
    //    (keepWithPrev 제거 → 섹션 헤더 강제 분할 규칙이 새 페이지를 연다).
    add(passageIdx, "passage", "-anno", {
      labelKo: "필기 분석 · 어법과 구문",
      labelEn: "Annotated Reading",
      breakBefore: false,
      flow: { passageRenderMode: "annotated" },
    });

    // 6) 핵심 어휘 (단어 시험 원천)
    if (vocabIdx >= 0) add(vocabIdx, "vocabulary", "", { breakBefore: false, flow: {} });

    // 7) 실전 학습지 — 워크북/추론이 생성됐을 때만(유료 옵트인).
    if (lwIdx >= 0 && lwHasWorkbook) {
      add(lwIdx, "learning-worksheet", "", { breakBefore: false, flow: {} });
    }

    return slots;
  }

  // ── 폴백: passage 없음(PRIME_KO 포함) 또는 vocabTestOnly — 기존 자연 순서 ──
  const inlineStudyNotes = !vocabTestOnly && report.sections.some((section) => section.kind === "passage");
  report.sections.forEach((section, si) => {
    if (section.kind === "self-check") return;
    // 한눈에 보는 지문 구조(도식) 섹션 삭제됨(사용자 요청) — 폴백 경로에서도 제외
    if (section.kind === "structure-map") return;
    if (vocabTestOnly && section.kind !== "vocabulary") return;
    if (inlineStudyNotes && (section.kind === "grammar" || section.kind === "exam-focus" || section.kind === "parsing")) return;
    add(si, section.kind, "", {
      // 단어 시험지 전용 모드는 헤더 없이 시험지 본문만 낸다(기존 동작 보존).
      headless: vocabTestOnly,
      flow: { vocabTestOnly },
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
