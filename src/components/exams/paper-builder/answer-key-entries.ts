// ============================================================================
// answer-key-entries — 정답표 항목(번호·정답 표기)의 JSX 없는 정본 (26-09-30 CORE-MODEL).
// 웹 정답표(answer-key-layout)·HWPX render/answer-key·DOCX build-answer-key 가 같은 PaperItem[] 에서
// 같은 표기를 얻는다 — 정답 원천은 PaperItem(빌더 편집 정답 우선, 없으면 원 문항), 표기는
// formatStoredQuestionCorrectAnswer + 객관식 원문자 통일(①~).
// ============================================================================
import { formatStoredQuestionCorrectAnswer } from "@/lib/question-answer-display";
import { getCircledNumber } from "@/lib/question-postprocess/types";
import type { PaperItem } from "./types";

export type AnswerEntry = { orderNum: number; answer: string };

// 정답표 표기 통일(표시 계층 전용 — 저장값 불변). 저장 형식은 유형별로 숫자("2") / 원문자("②") /
// 괄호문자("(B)") 가 섞여 있어(기출 은행: 무관·삽입은 원문자, 나머지는 숫자; 어법은
// formatStoredQuestionCorrectAnswer 가 (B)→② 로) 한 장 안에 「7. ②」 와 「1. 2」 가 혼용됐다.
// 객관식(선지 있음) 단일 정답이 순수 숫자이고 선지 개수 안이면 ①~ 로 바꾼다.
// 주관식(선지 0)·복수답("2, 4")·(A) 형·선지 범위 밖 숫자는 그대로 둔다.
export function circledObjectiveAnswer(
  item: Pick<PaperItem, "options" | "objectiveAnswerSlots">,
  answer: string,
): string {
  // 서버 소비처·테스트 픽스처가 부분 항목을 넘겨도 죽지 않게(선지 없음 = 주관식으로 본다).
  const optionCount =
    (Array.isArray(item.options) ? item.options.length : 0) +
    Math.max(0, Math.min(10, item.objectiveAnswerSlots || 0));
  if (optionCount === 0) return answer;
  const numeric = answer.match(/^\s*([1-9]\d?)\s*$/);
  if (!numeric) return answer;
  const index = Number(numeric[1]) - 1;
  if (index < 0 || index >= optionCount) return answer;
  return getCircledNumber(index);
}

/** 한 문항의 정답표 표기. 문항 블록이 아니면 null. */
export function answerKeyEntryForItem(item: PaperItem): AnswerEntry | null {
  if (item.blockType !== "question") return null;
  const source = item.sourceQuestion;
  // 빌더에서 편집한 정답(item.correctAnswer)을 우선, 없으면 원본 문항 값으로 폴백
  // (export-docx route 와 동일한 우선순위).
  const answer = formatStoredQuestionCorrectAnswer({
    subType: source.subType,
    typeId: source.type,
    correctAnswer: item.correctAnswer || source.correctAnswer,
    structuredData: source.structuredData,
  });
  return { orderNum: item.orderNum, answer: circledObjectiveAnswer(item, answer) };
}

/** 시험지 전체 정답표 항목(문항 순서 그대로). 웹·HWPX·DOCX 공용. */
export function answerKeyEntries(paperItems: readonly PaperItem[]): AnswerEntry[] {
  const entries: AnswerEntry[] = [];
  for (const item of paperItems) {
    const entry = answerKeyEntryForItem(item);
    if (entry) entries.push(entry);
  }
  return entries;
}
