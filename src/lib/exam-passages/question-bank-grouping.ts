import type { ExamBankItem, ExamBankRow, ExamBankSet } from "./question-bank-types";
import type { BuilderQuestionSetRender } from "@/components/exams/paper-builder/types";
import type { Anchor } from "@/lib/question-sets/types";

/** 장문 멤버와 목록의 한 묶음은 같은 선택 키를 쓴다. */
export function examBankSelectionKey(id: string): string {
  return id.replace(/#\d+$/, "");
}

export function examBankRowMemberIds(row: ExamBankRow): string[] {
  return row.memberIds?.length ? row.memberIds : [row.id];
}

/** 페이지를 자르기 전에 묶는다. 어느 소문항이 필터에 맞아도 장문 전체를 돌려준다. */
export function groupExamBankRows(
  items: readonly ExamBankItem[],
  sets: ReadonlyMap<string, ExamBankSet>,
  toRow: (item: ExamBankItem) => ExamBankRow,
): ExamBankRow[] {
  const seen = new Set<string>();
  const rows: ExamBankRow[] = [];
  for (const item of items) {
    const set = item.setKey ? sets.get(item.setKey) : undefined;
    const id = set?.key ?? item.id;
    if (seen.has(id)) continue;
    seen.add(id);
    rows.push(set ? {
      ...toRow(item), id, qNum: set.qNums[0], typeGroup: "장문",
      passageTitle: set.passageTitle, setKey: set.key, setLabel: set.label,
      setQNums: set.qNums, memberIds: set.memberIds, points: 0,
    } : toRow(item));
  }
  return rows;
}

export function bankSetToBuilderRender(
  set: ExamBankSet,
  members: readonly ExamBankItem[],
  questionId: (bankId: string) => string,
): BuilderQuestionSetRender {
  return {
    id: `bankset:${set.key}`,
    setLabel: `${set.label}번 · 장문`,
    canonicalPassage: set.canonicalPassage,
    layout: set.layout,
    members: members.map((member) => ({
      questionId: questionId(member.id),
      orderInSet: set.memberIds.indexOf(member.id),
      isStructural: member.subType === "SENTENCE_ORDER",
      typeId: member.subType,
      spans: Array.isArray(member.structuredData._spans) ? member.structuredData._spans as Anchor[] : [],
    })),
  };
}
