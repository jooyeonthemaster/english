// ============================================================================
// exam-print-model — 관리자 「시험지 보기·인쇄」(/admin/exam-print)의 인쇄 모델 (26-09-30 LEGACY-CLEANUP, COH-2 b).
//
// 「무엇을 찍을지」는 학원 화면(웹 상세·인쇄·HWPX·DOCX)과 같은 공용 정본이 정한다:
//   buildPaperItemsFromExam(시험 문항, 저장 settings)   — 순서·편집 발문/선지/정답·includePassage 우선순위·
//                                                         지문 원천(스냅숏 → DB → structuredData._sourcePassage)
//   buildGroups(paperItems)                             — 그룹 지문 박스(세트 안내문·기출 세트 토글·묶음 1회 출력)
//   toPaperExportItem(item).printInlinePassage          — 문항 안 지문(구조화 유형만, 세트 멤버는 "")
//   answerKeyEntryForItem(item)                         — 정답 표기(편집 정답 우선 · 객관식 ①~ 통일)
// 예전 화면은 DB 지문을 무조건(연속 중복만 빼고) 찍어 조건 영작·문장 전환처럼 정답이 원문에 있는 유형의 정답을
// 노출했고, settings(순서·편집 발문·지문 끄기)와 떼어 낸 원문 보관본을 무시했다.
//
// 이 화면은 조판(쪽·단 나눔·구조화 본문 박스·KO 보기 박스·표지)을 흉내 내지 않는 단순 흐름 문서다 — 정밀 조판은
// 학원 화면의 인쇄·HWPX·DOCX 가 맡는다. JSX·window 의존 없음(서버 페이지에서 만든다).
// ============================================================================
import { answerKeyEntryForItem } from "@/components/exams/paper-builder/answer-key-entries";
import { buildGroups } from "@/components/exams/paper-builder/paper-item-groups";
import { toPaperExportItem } from "@/components/exams/paper-builder/paper-export-items";
import { resolvePaperLayout } from "@/components/exams/paper-builder/paper-layout-defaults";
import {
  buildPaperItemsFromExam,
  type SavedPaperExamQuestion,
  type SavedPaperSettings,
} from "@/components/exams/paper-builder/saved-paper-items";

export interface PrintQuestion {
  id: string;
  /** 시험지 문항 번호(공용 PaperItem.orderNum — 웹·HWPX·DOCX 와 같다). */
  number: number;
  questionText: string;
  /** 문항 안 지문(구조화 유형만). 없으면 "". */
  inlinePassage: string;
  options: Array<{ label: string; text: string }>;
  /** 정답 표기(정답표와 같은 규칙). */
  answer: string;
}

export type PrintGroup =
  | {
      kind: "questions";
      key: string;
      /** 그룹 지문 박스 — 웹이 그리지 않는 그룹이면 null. title 은 지문 제목 표시가 꺼져 있으면 "". */
      passage: { title: string; content: string; setPrompt: string } | null;
      questions: PrintQuestion[];
    }
  | { kind: "text"; key: string; text: string };

/** 커스텀 블록 중 글이 있는 것(텍스트·섹션)만 평문으로 싣는다. 구분선·여백·이미지는 이 화면에서 뺀다. */
function customBlockText(item: { blockType: string; blockTitle: string; blockText: string; sectionTitle: string }): string {
  if (item.blockType === "section") return (item.blockTitle || item.sectionTitle || item.blockText || "").trim();
  if (item.blockType === "text") return [item.blockTitle, item.blockText].filter((t) => t && t.trim()).join("\n").trim();
  return "";
}

export function buildAdminPrintModel(
  examQuestions: readonly SavedPaperExamQuestion[],
  settings: SavedPaperSettings | null,
): { groups: PrintGroup[]; questionCount: number } {
  const paperItems = buildPaperItemsFromExam(examQuestions, settings);
  // 지문 제목은 웹처럼 「지문 제목 표시」가 켜진 시험지에서만(resolvePaperLayout — 기본 끔).
  const { showPassageTitle } = resolvePaperLayout(settings);
  const groups: PrintGroup[] = [];
  let questionCount = 0;
  for (const group of buildGroups(paperItems)) {
    const first = group.items[0];
    if (!first) continue;
    if (first.blockType !== "question") {
      for (const block of group.items) {
        const text = customBlockText(block);
        if (text) groups.push({ kind: "text", key: `${block.localId}#${groups.length}`, text });
      }
      continue;
    }
    const questions: PrintQuestion[] = [];
    for (const item of group.items) {
      const exported = toPaperExportItem(item);
      if (!exported) continue;
      questions.push({
        id: exported.questionId,
        number: exported.orderNum,
        questionText: exported.questionText,
        inlinePassage: exported.printInlinePassage,
        options: exported.options.map((o) => ({ label: o.label, text: o.text })),
        answer: answerKeyEntryForItem(item)?.answer ?? "",
      });
    }
    if (questions.length === 0) continue;
    questionCount += questions.length;
    const content = group.passageContent.trim();
    groups.push({
      kind: "questions",
      // 비문항 블록으로 쪼개진 묶음은 같은 그룹 id 가 두 번 나올 수 있다 — 순번을 붙여 키를 유일하게.
      key: `${group.id}#${groups.length}`,
      passage:
        group.includePassage && content
          ? { title: showPassageTitle ? group.passageTitle : "", content: group.passageContent, setPrompt: group.setPrompt }
          : null,
      questions,
    });
  }
  return { groups, questionCount };
}
