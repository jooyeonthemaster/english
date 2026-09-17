import "server-only";

// 기출 문항 은행 → 시험지 조판 렌더 검증용 가상 시험(ExamDetail) 조립.
// DB 를 거치지 않고 은행 항목을 반입 액션(src/actions/studio/exam-questions.ts)과 **같은 모양**의
// Question 행으로 만들어 ExamDetailPaperPreview 에 먹인다 — 렌더 전수 검증(/director/dev/gichul-render) 전용.
// 반입 액션의 컬럼 매핑이 바뀌면 여기도 같이 바꿔야 한다(structuredData._gichul·태그·배점·난이도).

import type { ExamDetail, ExamQuestion } from "@/components/exams/exam-detail-client-parts/types";
import { getExamPassagesByIds } from "./corpus";
import { examShortLabel, formatExamTitle } from "./format";
import { getAllExamBankItems, getExamBankItemsByIds } from "./question-bank";
import { getAllExamBankSets, getExamBankSetsByKeys } from "./question-bank-sets";
import type { ExamBankItem, ExamBankSet } from "./question-bank-types";

export type GichulRenderSelection = {
  /** 정본 정렬 기준 시작 위치(0-base) */
  offset: number;
  /** 최대 항목 수(하네스 배치 크기) */
  limit: number;
  /** 유형 그룹 필터(선택) */
  typeGroup?: string | null;
  /** 명시 id 목록(있으면 offset/limit 무시) */
  ids?: readonly string[] | null;
};

/** 장문 세트 선택(§12.4 R) — `?sets=1&offset&limit` 또는 `?setKeys=a,b`. */
export type GichulRenderSetSelection = {
  offset: number;
  /** 최대 **세트** 수(단위 = 세트 1개, 멤버 2~3문항) */
  limit: number;
  setKeys?: readonly string[] | null;
};

/**
 * 세트 배치 선택 — 세트와 그 멤버 항목(questions.json)을 함께 돌려준다.
 * 멤버는 세트 memberIds 순서(qNum 오름차순)를 그대로 지킨다 — 조판기가 그룹 안에서
 * 이 순서대로 번호를 매기고 setPrompt 를 파생하기 때문이다(§12.1-2).
 */
export function selectExamBankSetsForRender(sel: GichulRenderSetSelection): {
  sets: ExamBankSet[];
  items: ExamBankItem[];
  total: number;
} {
  const all = getAllExamBankSets();
  const picked =
    sel.setKeys && sel.setKeys.length > 0
      ? getExamBankSetsByKeys(sel.setKeys)
      : (() => {
          const offset = Math.max(0, Math.floor(sel.offset || 0));
          const limit = Math.min(60, Math.max(1, Math.floor(sel.limit || 10)));
          return all.slice(offset, offset + limit);
        })();
  const items = picked.flatMap((set) => getExamBankItemsByIds(set.memberIds));
  return { sets: [...picked], items, total: all.length };
}

export function selectExamBankItemsForRender(sel: GichulRenderSelection): { items: ExamBankItem[]; total: number } {
  if (sel.ids && sel.ids.length > 0) {
    const items = getExamBankItemsByIds(sel.ids);
    return { items, total: items.length };
  }
  const all = getAllExamBankItems().filter((q) => !sel.typeGroup || q.typeGroup === sel.typeGroup);
  const offset = Math.max(0, Math.floor(sel.offset || 0));
  const limit = Math.min(200, Math.max(1, Math.floor(sel.limit || 30)));
  return { items: all.slice(offset, offset + limit), total: all.length };
}

function difficultyOf(item: ExamBankItem): string {
  return item.points === 3 ? "KILLER" : "MEDIUM";
}

function readGichul(structuredData: Record<string, unknown>): Record<string, unknown> {
  const raw = structuredData?._gichul;
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
}

function buildTags(item: ExamBankItem): string[] {
  return ["기출", String(item.year), examShortLabel(item.exam), item.typeGroup, `gichul:${item.id}`, `kice-exam:${item.examId}`];
}

/** 은행 항목 묶음 → ExamDetail(설정 null = 스튜디오 기본 2단·comfortable). 지문은 코퍼스(절단 복원본 우선). */
export function buildGichulRenderExam(
  items: readonly ExamBankItem[],
  title = "기출 렌더 검증",
  opts: { stripFootnotes?: boolean; sets?: readonly ExamBankSet[] } = {},
): ExamDetail {
  const passages = new Map(getExamPassagesByIds(items.map((i) => i.passageId)).map((p) => [p.id, p]));
  // 장문 세트 멤버(§12.5): ExamDetail 경로는 setRender 가 없고 `passage.content + _spans` 로만
  // 병합한다 → 멤버 지문에 **표시 베이스(displayedPassage)** 를 실어야 그룹 머리 1박스가
  // 밑줄·단락까지 복원된다. 코퍼스 정본(canonical)을 실으면 라벨·셔플이 사라져 스팬이 안 붙는다.
  const setByKey = new Map((opts.sets ?? []).map((s) => [s.key, s]));
  const questions: ExamQuestion[] = items.map((item, index) => {
    const set = item.setKey ? setByKey.get(item.setKey) ?? null : null;
    const rec = passages.get(item.passageId);
    const content =
      set?.displayedPassage ||
      (item.passageContentOverride && item.passageContentOverride.trim()) ||
      rec?.text ||
      "";
    const passageTitle = set ? set.passageTitle : rec ? formatExamTitle(rec) : item.passageTitle;
    const tags = buildTags(item);
    return {
      id: `eq-${item.id}`,
      orderNum: index + 1,
      points: item.points,
      question: {
        id: item.id,
        type: "MULTIPLE_CHOICE",
        subType: item.subType,
        questionText: item.questionText,
        structuredData: {
          ...item.structuredData,
          _typeId: item.subType,
          _generationPlan: "STANDARD",
          tags,
          difficulty: difficultyOf(item),
          _gichul: {
            // 세트 멤버의 `set`·`optionList`(§12.2)는 항목 structuredData 에 이미 실려 있다 —
            // 통째로 덮어쓰면 렌더러의 세트 분기(멤버 본문 발문+선지만 · 42/44 선지 한 줄)가
            // 조용히 꺼진다. 먼저 펼친 뒤 하네스 메타를 덧쓴다.
            ...readGichul(item.structuredData),
            bankId: item.id,
            examId: item.examId,
            year: item.year,
            exam: item.exam,
            board: item.board,
            grade: item.grade,
            qNum: item.qNum,
            points: item.points,
            // 출처형·요약문은 각주가 questionText 밖(지문 박스 아래)에 인쇄돼야 한다 — 렌더러가 여기서 읽는다
            footnotes: opts.stripFootnotes ? [] : set ? set.footnotes : item.footnotes,
          },
        },
        options: JSON.stringify(item.options),
        correctAnswer: item.correctAnswer,
        points: item.points,
        difficulty: difficultyOf(item),
        tags: JSON.stringify(tags),
        aiGenerated: false,
        approved: true,
        starred: false,
        createdAt: new Date(0).toISOString(),
        // 세트 멤버는 setId 를 공유해야 조판기가 `set:<setId>` 한 그룹으로 묶고 공유 지문 1박스를 그린다.
        setId: item.setKey ?? null,
        inSet: false,
        passage: {
          id: `p-${item.passageId}`,
          title: passageTitle,
          content,
          grade: null,
          semester: null,
          publisher: null,
          school: null,
        },
        explanation: null,
        collectionItems: [],
        _count: { examLinks: 0 },
      },
    };
  });
  return {
    id: "gichul-render",
    title,
    type: "PRACTICE",
    status: "DRAFT",
    subject: "ENGLISH",
    examDate: null,
    duration: null,
    totalPoints: questions.reduce((n, q) => n + q.points, 0),
    grade: null,
    semester: null,
    examType: null,
    shuffleQuestions: false,
    shuffleOptions: false,
    showResults: false,
    settings: null,
    class: null,
    school: null,
    questions,
    submissions: [],
  };
}
