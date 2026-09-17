import type { ExamBankItem, ExamBankQNum } from "./question-bank-types";

/** 목록의 장문 범위를 그대로 필터 키로 사용한다. 구형 시험의 다른 세트 번호도 지원. */
export function examBankNumberKey(item: Pick<ExamBankItem, "qNum" | "setKey" | "setQNums">): ExamBankQNum {
  const nums = item.setQNums;
  return item.setKey && nums && nums.length > 1
    ? `${nums[0]}~${nums[nums.length - 1]}`
    : item.qNum;
}

export function parseExamBankQNums(value: string | null): ExamBankQNum[] | undefined {
  const keys: ExamBankQNum[] = [];
  for (const part of value?.split(",") ?? []) {
    const match = part.trim().match(/^([1-9]\d*)(?:~([1-9]\d*))?$/);
    if (!match) continue;
    const start = Number(match[1]);
    const end = match[2] ? Number(match[2]) : undefined;
    if (!Number.isSafeInteger(start) || (end !== undefined && (!Number.isSafeInteger(end) || end <= start))) continue;
    keys.push(end === undefined ? start : `${start}~${end}`);
  }
  return keys.length ? [...new Set(keys)] : undefined;
}
