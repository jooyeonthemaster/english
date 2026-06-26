import { circledNo } from "@/lib/passage-report/analysis-report/design-tokens";
import { type ActivityBlock, type AnalysisReport, type AnalysisSection, type ReportMeta } from "@/lib/passage-report/analysis-report/schema";
import { type CoverEdit, CoverSheet } from "../cover-templates";
import { type ActivityAction, ActivityAnswerNode } from "../custom-activity-renders";
import type { CustomEdit, FlowItem, MetaEdit, SectionEdit, SectionFlowOptions, WrapKind } from "./types";
import { Field } from "./editable-field";
import { SectionHead } from "./table";
import { WorksheetLogicMapBlock } from "./worksheet";
import { customBlockFlowItems } from "./custom-block";
import { sectionFlowItems } from "./section-flow";

function titleItems(report: AnalysisReport, med?: MetaEdit): FlowItem[] {
  const m = report.meta;
  const editable = !!med;
  const patch = (p: Partial<ReportMeta>) => med?.commit({ ...m, ...p });
  return [
    {
      id: "title",
      sectionIndex: -1,
      kind: "title",
      no: 0,
      wrap: "title",
      node: (
        <header className="par-title">
          <Field as="div" className="par-eyebrow" editable={editable} value={m.eyebrow ?? ""} onCommit={(v) => patch({ eyebrow: v })} />
          <Field as="h1" className="par-title-ko" editable={editable} value={m.titleKo} onCommit={(v) => patch({ titleKo: v })} />
          <Field as="div" className="par-title-en" editable={editable} value={m.titleEn} onCommit={(v) => patch({ titleEn: v })} />
        </header>
      ),
    },
  ];
}

/** 표지 다음 '영어 원문만' 단독 페이지 — 번호매긴 영어 문장만(해석·필기 없음). report.englishOnlyPage 가 켜졌을 때. */
function englishOnlyPageItems(report: AnalysisReport): FlowItem[] {
  if (!report.englishOnlyPage) return [];
  const passage = report.sections.find((s) => s.kind === "passage");
  if (!passage || passage.kind !== "passage" || !passage.sentences.length) return [];
  return passage.sentences.map((snt, i) => ({
    id: `english-only-${i}`,
    sectionIndex: -1,
    kind: "passage" as const,
    no: 0,
    wrap: "reading" as WrapKind,
    node: (
      <p className="par-eng-only">
        <span className="par-eng-only-no">{circledNo(snt.n)}</span>
        <span className="par-eng-only-en">{snt.en}</span>
      </p>
    ),
  }));
}

/** 표지(활성화 시) — 강제 전면 페이지 flow item. */
function coverItems(report: AnalysisReport, ced?: CoverEdit): FlowItem[] {
  if (!report.cover?.enabled) return [];
  return [
    {
      id: "cover",
      sectionIndex: -1,
      kind: "cover",
      no: 0,
      wrap: "cover",
      node: <CoverSheet report={report} ced={ced} />,
    },
  ];
}

/** 보고서 → 전체 flow item[] (자연 순서). self-check 제외. 커스텀 블록은 뒤에 붙고 blockOrder 로 배치. */
/** 학습 활동 정답 — 문서 말미 별도 페이지로 모은다 (activityAnswerKeyPage !== false 일 때). */
function activityAnswerItems(report: AnalysisReport): FlowItem[] {
  if (report.activityAnswerKeyPage === false) return [];
  const acts = (report.customBlocks ?? []).filter((b): b is ActivityBlock => b.kind === "activity");
  if (acts.length === 0) return [];
  const items: FlowItem[] = [
    {
      id: "activity-answers-head",
      sectionIndex: -1,
      kind: "custom",
      no: 0,
      wrap: "note",
      breakBefore: true,
      node: (
        <div style={{ fontWeight: 800, fontSize: "1.05em", color: "#0f172a", marginBottom: "0.4em" }}>
          학습 활동 정답
        </div>
      ),
    },
  ];
  acts.forEach((b, i) => {
    items.push({
      id: `${b.id}-ans`,
      sectionIndex: -1,
      kind: "custom",
      no: 0,
      wrap: "note",
      node: <ActivityAnswerNode block={b} index={i + 1} />,
    });
  });
  return items;
}

export function reportFlowItems(
  report: AnalysisReport,
  edit?: { med?: MetaEdit; sectionEdit?: (i: number) => SectionEdit; setCustom?: CustomEdit; insertTextAfter?: (anchorId: string) => void; ced?: CoverEdit; onActivity?: (id: string, action: ActivityAction) => void },
): FlowItem[] {
  const vocabTestOnly = !!report.vocabTestOnly;
  const items: FlowItem[] = vocabTestOnly
    ? []
    : [...coverItems(report, edit?.ced), ...titleItems(report, edit?.med), ...englishOnlyPageItems(report)];

  const findIdx = (k: AnalysisSection["kind"]) => report.sections.findIndex((s) => s.kind === k);
  const passageIdx = findIdx("passage");

  // ── 새 보고서 구성 (passage 존재 시): 원문+해석 → 도식 → 요약 → 논리 → 필기 캔버스 → 어휘 → 학습지 ──
  if (!vocabTestOnly && passageIdx >= 0) {
    const summaryIdx = findIdx("summary");
    const vocabIdx = findIdx("vocabulary");
    const lwIdx = report.sections.findIndex((s) => s.kind === "learning-worksheet");
    const lwSection = lwIdx >= 0 && report.sections[lwIdx].kind === "learning-worksheet" ? report.sections[lwIdx] : undefined;
    const lwHasLogic = !!lwSection && lwSection.logicRows.length > 0;
    // 06 실전 학습지(워크북/추론) 콘텐츠 유무 — 기본 분석은 logicRows 만 든 learning-worksheet 를
    // 만들므로, 실제 워크북/추론이 생성됐을 때만 '실전 학습지' 섹션(#7)을 렌더한다.
    const lwHasWorkbook = !!lwSection && (
      !!lwSection.workbookSet ||
      !!lwSection.inferenceSet ||
      !!lwSection.cloze ||
      !!lwSection.practice ||
      !!lwSection.drills
    );

    let no = 0;
    const head = (
      si: number,
      kind: AnalysisSection["kind"],
      idSuffix: string,
      labelKo: string | undefined,
      labelEn: string | undefined,
      breakBefore: boolean,
      keepWithPrev?: boolean,
    ) => {
      items.push({
        id: `s${si}-head${idSuffix}`,
        sectionIndex: si,
        kind,
        no,
        wrap: "secheader",
        node: <SectionHead no={no} kind={kind} labelKo={labelKo} labelEn={labelEn} />,
        breakBefore,
        keepWithPrev,
      });
    };
    const emit = (si: number, opts: Partial<SectionFlowOptions>) => {
      const sed = edit?.sectionEdit ? edit.sectionEdit(si) : undefined;
      items.push(
        ...sectionFlowItems(report.sections[si], si, no, sed, {
          allSections: report.sections,
          sectionEdit: edit?.sectionEdit,
          passageLayout: report.passageLayout,
          ...opts,
        }),
      );
    };

    // 1) 원문 + 문장별 해석 (필기 없음) — 영어 원문 페이지가 켜졌으면 새 페이지에서 시작
    no += 1;
    head(passageIdx, "passage", "", "원문 · 문장별 해석", "Original Passage & Translation", !!report.englishOnlyPage);
    emit(passageIdx, { passageRenderMode: "clean" });

    // 2) 한눈에 보는 지문 구조 (도식) — 섹션 삭제됨(사용자 요청): 렌더링하지 않음

    // 3) 핵심 요약
    if (summaryIdx >= 0) {
      no += 1;
      head(summaryIdx, "summary", "", undefined, undefined, false);
      emit(summaryIdx, {});
    }

    // 4) 지문 논리 구조 분석 (Logic Map) — 메인 분석(call #1)의 learning-worksheet.logicRows 표.
    //    structure-map(도식)은 더 이상 생성·렌더하지 않는다.
    if (lwHasLogic && lwSection) {
      no += 1;
      // 핵심 요약(#2)과 같은 페이지에 이어 붙인다 (섹션마다 새 페이지 강제 분할 면제).
      head(lwIdx, "learning-worksheet", "-logic", "지문 논리 구조 분석", "Logic Map", false, true);
      const lwEdit = edit?.sectionEdit?.(lwIdx);
      items.push({
        id: `s${lwIdx}-logic-promoted`,
        sectionIndex: lwIdx,
        kind: "learning-worksheet",
        no,
        wrap: "note",
        node: <WorksheetLogicMapBlock section={lwSection} editable={!!lwEdit} onPatch={(patch) => lwEdit?.commit({ ...lwSection, ...patch })} />,
      });
    }

    // 5) 필기 분석 캔버스 (어법·구문·출제 인라인) — 새 페이지에서 시작
    no += 1;
    head(passageIdx, "passage", "-anno", "필기 분석 · 어법과 구문", "Annotated Reading", true);
    emit(passageIdx, { passageRenderMode: "annotated" });

    // 6) 핵심 어휘 (단어 시험 원천)
    if (vocabIdx >= 0) {
      no += 1;
      head(vocabIdx, "vocabulary", "", undefined, undefined, false);
      emit(vocabIdx, {});
    }

    // 7) 실전 학습지 (06) — 워크북/추론이 생성됐을 때만. (논리표는 4번에서 별도 표시 → 여기선 제외)
    if (lwIdx >= 0 && lwHasWorkbook) {
      no += 1;
      head(lwIdx, "learning-worksheet", "", undefined, undefined, false);
      emit(lwIdx, { skipWorksheetLogic: true });
    }

    for (const cb of report.customBlocks ?? []) items.push(...customBlockFlowItems(cb, edit?.setCustom, edit?.insertTextAfter, edit?.onActivity, report.blockMeta));
    items.push(...activityAnswerItems(report));
    return items;
  }

  // ── 폴백: passage 없음 또는 vocabTestOnly — 기존 자연 순서 ──
  const inlineStudyNotes = !vocabTestOnly && report.sections.some((section) => section.kind === "passage");
  const summaryIndex = report.sections.findIndex((section) => section.kind === "summary");
  const promotedLogicIndex = summaryIndex >= 0
    ? report.sections.findIndex((section) => section.kind === "learning-worksheet" && section.logicRows.length > 0)
    : -1;
  let no = 0;
  report.sections.forEach((section, si) => {
    if (section.kind === "self-check") return;
    // 한눈에 보는 지문 구조(도식) 섹션 삭제됨(사용자 요청) — 폴백 경로에서도 제외
    if (section.kind === "structure-map") return;
    if (vocabTestOnly && section.kind !== "vocabulary") return;
    if (inlineStudyNotes && (section.kind === "grammar" || section.kind === "exam-focus" || section.kind === "parsing")) return;
    no += 1;
    // 섹션 헤더도 독립 블록(드래그/이동 가능)
    if (!vocabTestOnly) {
      items.push({
        id: `s${si}-head`,
        sectionIndex: si,
        kind: section.kind,
        no,
        wrap: "secheader",
        node: <SectionHead no={no} kind={section.kind} />,
      });
    }
    const sed = edit?.sectionEdit ? edit.sectionEdit(si) : undefined;
    items.push(...sectionFlowItems(section, si, no, sed, {
      vocabTestOnly,
      allSections: report.sections,
      sectionEdit: edit?.sectionEdit,
      skipWorksheetLogic: si === promotedLogicIndex,
      passageLayout: report.passageLayout,
    }));
    if (!vocabTestOnly && si === summaryIndex && promotedLogicIndex >= 0) {
      const worksheet = report.sections[promotedLogicIndex];
      if (worksheet?.kind === "learning-worksheet") {
        const worksheetEdit = edit?.sectionEdit?.(promotedLogicIndex);
        items.push({
          id: `s${promotedLogicIndex}-logic-promoted`,
          sectionIndex: promotedLogicIndex,
          kind: "learning-worksheet",
          no,
          wrap: "note",
          node: (
            <WorksheetLogicMapBlock
              section={worksheet}
              editable={!!worksheetEdit}
              onPatch={(patch) => worksheetEdit?.commit({ ...worksheet, ...patch })}
            />
          ),
        });
      }
    }
  });
  if (!vocabTestOnly) {
    for (const cb of report.customBlocks ?? []) {
      items.push(...customBlockFlowItems(cb, edit?.setCustom, edit?.insertTextAfter, edit?.onActivity, report.blockMeta));
    }
    items.push(...activityAnswerItems(report));
  }
  return items;
}
