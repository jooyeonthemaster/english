import { circledNo } from "@/lib/passage-report/analysis-report/design-tokens";
import { type ActivityBlock, type AnalysisReport, type AnalysisSection, type ReportMeta } from "@/lib/passage-report/analysis-report/schema";
import { type CoverEdit, CoverSheet } from "../cover-templates";
import { type ActivityAction, ActivityAnswerNode } from "../custom-activity-renders";
import type { CustomEdit, FlowItem, MetaEdit, PassageStudyNotes, SectionEdit, SectionFlowOptions, WrapKind } from "./types";
import { Field } from "./editable-field";
import { FinalOnepageSheet } from "./final-onepage-flow";
import { SectionHead } from "./table";
import { customBlockFlowItems } from "./custom-block";
import type { SectionFlowCache } from "./flow-cache";
import { hiddenSectionKeys, reportSectionSlots } from "./section-slots";
import { sectionFlowItems } from "./section-flow";
import { collectPassageStudyNotes } from "./study-notes";

/** study 노트 memo 슬롯키 — 섹션 슬롯키(`sec:`/`logic:`/`cb:` 접두)와 겹치지 않는다. */
const STUDY_SLOT = "study";

/**
 * 슬롯 렌더 옵션(slot.flow)을 캐시 키 조각으로 편다 — 키 이름과 값을 함께 넣어
 * 옵션이 추가/제거돼도(길이·이름이 달라져) 자동으로 miss 가 되게 한다.
 * 값이 원시가 아니면 참조 비교가 되므로 최악이라도 '영구 miss(= 지금과 동일 비용)'로 안전하게 실패한다.
 */
function flowOptionKeyParts(opts: Partial<SectionFlowOptions>): unknown[] {
  const out: unknown[] = [];
  for (const key of (Object.keys(opts) as (keyof SectionFlowOptions)[]).sort()) out.push(key, opts[key]);
  return out;
}

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
          {/* 아이브로우("PRIME PASSAGE ANALYSIS · 심층 지문 분석") 제거 — 유저 확정(2026-08-11).
              meta.eyebrow 데이터는 보존(표지 템플릿은 계속 사용), 본문 타이틀 블록에서만 미표기. */}
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
  // 숨긴 활동 블록은 정답도 함께 빠진다 — 활동을 꺼도 '학습 활동 정답'만 유령으로 남던 결함 봉합.
  const acts = (report.customBlocks ?? []).filter(
    (b): b is ActivityBlock => b.kind === "activity" && !report.blockMeta?.[b.id]?.hidden,
  );
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
  edit?: { med?: MetaEdit; sectionEdit?: (i: number) => SectionEdit; setCustom?: CustomEdit; insertTextAfter?: (anchorId: string) => void; ced?: CoverEdit; onActivity?: (id: string, action: ActivityAction) => void; onSectionHeading?: (key: string, patch: { ko?: string; en?: string }) => void },
  /**
   * 섹션 단위 flow 캐시(선택). 주면 손대지 않은 섹션의 FlowItem[] 를 **참조까지 그대로** 재사용해
   * React 가 그 서브트리를 bailout 하게 한다. **넘기지 않으면 캐시 이전과 100% 동일 동작**이므로
   * 읽기전용 소비자(AnalysisReportDocument · dev 하네스 · 랜딩 데모 · 미리보기 모달)와
   * setReport 업데이터 안의 진단 호출들은 무수정으로 안전하다.
   */
  cache?: SectionFlowCache,
): FlowItem[] {
  // 섹션 헤더(par-sec-head) ko/en 인라인 편집 — 슬롯키(kind+suffix)로 오버라이드 저장. (번호는 자동·고정)
  const headOverride = (key: string, fallbackKo?: string, fallbackEn?: string) => {
    const ov = report.sectionHeadings?.[key];
    const editableHead = !!edit?.onSectionHeading;
    return {
      labelKo: ov?.ko ?? fallbackKo,
      labelEn: ov?.en ?? fallbackEn,
      editable: editableHead,
      onCommitKo: editableHead ? (v: string) => edit!.onSectionHeading!(key, { ko: v }) : undefined,
      onCommitEn: editableHead ? (v: string) => edit!.onSectionHeading!(key, { en: v }) : undefined,
    };
  };
  const vocabTestOnly = !!report.vocabTestOnly;
  // 원페이지 파이널 문서 — 자체 헤더를 내장한 전면 시트 1장이 문서의 전부라
  // 표준 타이틀 블록·영어원문 페이지는 만들지 않는다(표지는 사용자가 켜면 그대로 동작).
  const finalOnly = report.sections.some((s) => s.kind === "final-onepage");
  const items: FlowItem[] = vocabTestOnly
    ? []
    : [
        ...coverItems(report, edit?.ced),
        ...(finalOnly ? [] : titleItems(report, edit?.med)),
        ...(finalOnly ? [] : englishOnlyPageItems(report)),
      ];

  const findIdx = (k: AnalysisSection["kind"]) => report.sections.findIndex((s) => s.kind === k);

  /** 이번 패스에서 실제로 쓴 캐시 슬롯키 — 끝에서 sweep 에 넘겨 죽은 슬롯을 정리한다. */
  const usedSlots: string[] = [];

  // ── 지문 study 노트: 1회 계산해 clean/annotated 두 패스가 공유 ───────────────
  // 예전에는 같은 지문을 두 번 emit 하면서 collectPassageStudyNotes 를 두 번 돌렸고
  // 그중 clean 패스분은 통째로 버려졌다. 이제 clean 은 아예 study 를 요구하지 않고(passage-flow),
  // annotated/legacy 만 아래 주입분을 쓴다.
  // ⚠️ 계산은 **지연**시킨다 — 지문 슬롯이 목차에서 꺼져 있으면 한 번도 계산하지 않는다.
  const studySi = findIdx("passage");
  const studySection = studySi >= 0 ? report.sections[studySi] : undefined;
  let studyValue: PassageStudyNotes | undefined;
  let studyReady = false;
  const getStudy = (): PassageStudyNotes | undefined => {
    if (studyReady) return studyValue;
    studyReady = true;
    if (!studySection || studySection.kind !== "passage") return undefined;
    const sentences = studySection.sentences;
    const build = (): PassageStudyNotes => collectPassageStudyNotes(report.sections, sentences);
    if (!cache) {
      studyValue = build();
      return studyValue;
    }
    // 키: 지문 섹션 + (study 가 실제로 읽는) 노트 섹션들의 인덱스·참조.
    // 인덱스까지 넣는 이유 — 노트 ref 에 sectionIndex 가 박히므로 섹션 순서가 바뀌면 결과가 달라진다.
    // 요약/도식 등 study 가 읽지 않는 섹션의 수정으로는 무효화되지 않는다.
    const key: unknown[] = [studySection];
    report.sections.forEach((sec, i) => {
      if (sec.kind === "grammar" || sec.kind === "exam-focus" || sec.kind === "vocabulary" || sec.kind === "parsing" || sec.kind === "learning-worksheet") {
        key.push(i, sec);
      }
    });
    usedSlots.push(STUDY_SLOT);
    studyValue = cache.memo(STUDY_SLOT, key, build);
    return studyValue;
  };

  // ── 섹션 헤더 슬롯 순회 ────────────────────────────────────────────────────
  // 슬롯 목록(순서·라벨·breakBefore·논리표 승격)의 단일 진실원은 section-slots.ts 다.
  // 목차 UI 가 같은 목록을 읽으므로 '보이는 목차'와 '조판되는 문서'가 어긋날 수 없다.
  // 꺼진 슬롯(report.hiddenSections)은 헤더와 본문이 통째로 빠지고 번호도 소비하지 않아
  // 남은 섹션이 01·02·03 으로 자동 재배열된다(하류 필터로는 번호에 구멍이 남는다).
  const hidden = hiddenSectionKeys(report);
  let no = 0;
  const emit = (si: number, opts: Partial<SectionFlowOptions>, slotKey: string) => {
    const section = report.sections[si];
    // study 를 실제로 읽는 경로인가 — clean 패스는 절대 읽지 않는다(passage-flow 조기반환).
    const usesStudy = section?.kind === "passage" && opts.passageRenderMode !== "clean";
    const sectionStudy = usesStudy && si === studySi ? getStudy() : undefined;
    const build = (): FlowItem[] => {
      const sed = edit?.sectionEdit ? edit.sectionEdit(si) : undefined;
      return sectionFlowItems(section, si, no, sed, {
        allSections: report.sections,
        sectionEdit: edit?.sectionEdit,
        passageLayout: report.passageLayout,
        study: sectionStudy,
        ...opts,
      });
    };
    if (!cache) {
      items.push(...build());
      return;
    }
    usedSlots.push(slotKey);
    items.push(
      ...cache.get(
        slotKey,
        [
          // 섹션 본체 · 위치 · 표시 번호(번호가 바뀌면 SectionHead 밖의 FlowItem.no 도 바뀐다)
          section,
          si,
          no,
          // 편집 콜백 번들(참조가 바뀌면 노드 안의 onCommit 들도 다시 만들어야 한다)
          edit?.sectionEdit,
          // report 전역 중 이 경로로 실제 내려가는 값
          report.passageLayout,
          sectionStudy,
          // 주입 study 가 없는 지문 섹션(문서에 지문이 둘 이상)은 flow 가 allSections 로 직접 계산한다.
          usesStudy && !sectionStudy ? report.sections : null,
          // 슬롯 렌더 옵션 전체(passageRenderMode / vocabTestOnly / skipWorksheetLogic …)
          ...flowOptionKeyParts(opts),
        ],
        build,
      ),
    );
  };
  /** 원페이지 파이널 — 전면 시트(wrap:"cover") 1개만 붙인다(headless 슬롯). */
  const pushFinalOnepage = (si: number) => {
    const section = report.sections[si];
    if (section?.kind !== "final-onepage") return;
    const build = (): FlowItem[] => {
      const sed = edit?.sectionEdit?.(si);
      return [
        {
          id: `s${si}-final-onepage`,
          sectionIndex: si,
          kind: "final-onepage",
          no,
          wrap: "cover",
          node: (
            <FinalOnepageSheet
              section={section}
              meta={report.meta}
              brand={report.brand}
              editable={!!sed}
              onPatch={(patch) => sed?.commit({ ...section, ...patch })}
              onMetaPatch={edit?.med ? (p) => edit.med!.commit({ ...report.meta, ...p }) : undefined}
            />
          ),
        },
      ];
    };
    if (!cache) {
      items.push(...build());
      return;
    }
    const slotKey = `final:${si}`;
    usedSlots.push(slotKey);
    items.push(
      ...cache.get(slotKey, [section, si, report.meta, report.brand, edit?.sectionEdit, edit?.med], build),
    );
  };

  // '영어 원문만' 단독 페이지는 그 뒤 첫 섹션 헤더의 breakBefore 로 페이지가 닫힌다.
  // 그 breakBefore 를 지문 슬롯이 들고 있는데(section-slots), 목차에서 지문을 꺼 버리면
  // 함께 사라져 영어 원문 페이지에 다음 섹션이 그대로 이어 붙는다. 그래서 '지문'이 아니라
  // **처음 보이는 섹션 헤더**가 분할을 책임지게 한다(packFlow 는 첫 헤더에 강제 분할을 면제한다).
  const needsEnglishOnlyBreak = !!report.englishOnlyPage && items.some((it) => it.id.startsWith("english-only-"));
  let firstVisibleHead = true;
  for (const slot of reportSectionSlots(report)) {
    if (hidden.has(slot.key)) continue;
    no += 1;
    // 섹션 헤더도 독립 블록(드래그/이동 가능). 단어 시험지 전용 모드는 헤더 없이 본문만.
    if (!slot.headless) {
      items.push({
        id: slot.headId,
        sectionIndex: slot.si,
        kind: slot.kind,
        no,
        wrap: "secheader",
        node: <SectionHead no={no} kind={slot.kind} {...headOverride(slot.key, slot.labelKo, slot.labelEn)} />,
        breakBefore: slot.breakBefore || (firstVisibleHead && needsEnglishOnlyBreak),
        keepWithPrev: slot.keepWithPrev,
        splitWithPrev: slot.splitWithPrev,
      });
      firstVisibleHead = false;
    }
    // 원페이지 파이널 — 섹션 flow 대신 전면 시트 블록 하나만 붙는다.
    if (slot.finalOnepage) {
      pushFinalOnepage(slot.si);
      continue;
    }
    // 슬롯키 = `sec:{섹션인덱스}:{슬롯키}` — 같은 섹션을 clean/annotated 두 번 emit 하므로
    // 인덱스만으로는 충돌한다(slot.key 가 "passage" / "passage-anno" 로 갈라준다).
    emit(slot.si, slot.flow, `sec:${slot.si}:${slot.key}`);
  }

  // 단어 시험지는 vocabulary 섹션 flow 안에서 만들어진다. 목차에서 '핵심 어휘'(단어장)를 꺼도
  // 켜 둔 단어 시험지는 남긴다 — 서로 다른 스위치이기 때문(vocabTestOnly 게이트 재사용:
  // 학습표는 죽이고 시험지만 헤더 없이 낸다). mode==="study" 면 게이트가 시험지를 강제로
  // 켜버리므로 반드시 아래 가드를 유지할 것.
  if (!vocabTestOnly) {
    const vocabIdx = findIdx("vocabulary");
    if (vocabIdx >= 0 && hidden.has("vocabulary")) {
      const vs = report.sections[vocabIdx];
      if (vs.kind === "vocabulary" && (vs.vocabTestMode ?? "study") !== "study") {
        emit(vocabIdx, { vocabTestOnly: true }, `sec:${vocabIdx}:vocabulary@test-only`);
      }
    }
  }

  if (!vocabTestOnly) {
    for (const cb of report.customBlocks ?? []) {
      const build = (): FlowItem[] => customBlockFlowItems(cb, edit?.setCustom, edit?.insertTextAfter, edit?.onActivity, report.blockMeta);
      if (!cache) {
        items.push(...build());
        continue;
      }
      const slotKey = `cb:${cb.id}`;
      usedSlots.push(slotKey);
      // customBlockFlowItems 가 지금 blockMeta 에서 읽는 값은 `[cb.id].breakBefore` 하나뿐이지만
      // (활동 블록 첫 항목의 강제 페이지 분할), 앞으로 자기 블록 메타를 더 읽어도 안전하도록
      // **그 블록의 메타 객체 전체**를 키에 넣는다. setBlockMeta 는 손대지 않은 블록의 메타
      // 참조를 보존하므로(editor-mutations.ts) 다른 블록의 서식 변경으로는 무효화되지 않는다.
      items.push(
        ...cache.get(
          slotKey,
          [cb, edit?.setCustom, edit?.insertTextAfter, edit?.onActivity, report.blockMeta?.[cb.id]],
          build,
        ),
      );
    }
    items.push(...activityAnswerItems(report));
  }
  // 이번 패스에 안 쓰인 슬롯 제거 — 섹션 삭제·목차 끄기·undo/redo 반복 시 죽은 슬롯이
  // 수십~수백 개의 React 엘리먼트를 붙잡은 채 쌓이는 것을 막는다. (return 지점은 여기 하나뿐)
  cache?.sweep(usedSlots);
  return items;
}
