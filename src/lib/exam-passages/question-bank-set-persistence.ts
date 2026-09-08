import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { getExamBankSet } from "./question-bank-sets";
import type { ExamBankItem } from "./question-bank-types";

/** 신규·기존 반입 모두 세트 소속을 보완해 저장 후에도 공통 지문을 복원한다. */
export async function persistExamBankSets(
  tx: Prisma.TransactionClient,
  academyId: string,
  items: readonly ExamBankItem[],
  questionIds: ReadonlyMap<string, string>,
  passageIds: ReadonlyMap<string, string>,
): Promise<void> {
  for (const key of new Set(items.flatMap((item) => item.setKey ? [item.setKey] : []))) {
    const set = getExamBankSet(key);
    if (!set) continue;
    const members = items.filter((item) => item.setKey === key && questionIds.has(item.id));
    if (members.length !== set.memberIds.length) throw new Error("장문 세트의 모든 문항을 불러오지 못했습니다.");
    const id = `gichulset_${createHash("sha256").update(`${academyId}:${key}`).digest("hex").slice(0, 32)}`;
    const data = {
      structuralMode: set.layout.type,
      canonicalPassage: set.canonicalPassage,
      displayedPassageLayout: JSON.stringify(set.layout),
      layoutFingerprint: set.layout.fingerprintHash,
      itemCount: members.length,
      setLabel: `${set.label}번 · 장문`,
      basePassageId: passageIds.get(set.passageId),
    };
    await tx.questionSet.upsert({ where: { id }, create: { id, academyId, ...data }, update: data });
    for (const member of members) {
      const questionId = questionIds.get(member.id)!;
      const membership = {
        setId: id, orderInSet: set.memberIds.indexOf(member.id),
        isStructural: member.subType === "SENTENCE_ORDER",
        spans: (Array.isArray(member.structuredData._spans) ? member.structuredData._spans : []) as Prisma.InputJsonValue,
      };
      await tx.questionSetItem.upsert({ where: { questionId }, create: { questionId, ...membership }, update: membership });
      await tx.question.update({ where: { id: questionId }, data: { setId: id } });
    }
  }
}
