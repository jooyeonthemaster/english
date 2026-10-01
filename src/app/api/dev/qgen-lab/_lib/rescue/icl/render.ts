// 구제 ICL 메시지 조립(RESCUE-SPEC §5.1 render) — 시연을 앞선 대화(user 지문 → assistant v2 출력)로 싣는다.
//   system = V2_CORE[0] + "\n\n" + ICL_NOTE (+ "\n\n" + CARDS_BLOCK, icl+cx) — 실행마다 같은 캐시 프리픽스
//   시연마다 user "## 지문\n<시연 지문>" · assistant "<시연 v2 출력 전문>"
//   마지막 user "## 지문\n<대상 지문>" (+ "\n\n" + MIRROR_LINE, icl+cx)
// V2_CORE 는 draft.ts v2PromptCore()(프로덕션 buildGrammarKillerV2Prompt 를 지문 앞에서 자른 것 — 형상이 바뀌면 throw).
import type { LabChatMessage } from "../../stream-once";
import { v2PromptCore } from "../draft";
import type { IclDemo } from "./bank";

/** §5.1 ICL_NOTE(축자). */
export const ICL_NOTE =
  "## 앞선 대화의 출제 사례에 대하여\n앞선 대화의 출제 사례는 평가원 실물과 검수를 통과한 문항을 위 출력 형식 그대로 옮긴 것이다. 사례에서 가져갈 것은 자리를 고르는 원리뿐이다 — 판정 단서가 밑줄에서 멀리 있는 정답, 학생이 실제로 다른 형태를 떠올리는 미끼, 앞·중·뒤 분산, 설계메모에서 얕은 후보를 기각하는 판단. 사례의 지문·표현·정답 범주를 베끼지 마라. 이번 정답 범주는 이번 지문의 구조가 정한다: 사례에 없던 구조가 이번 지문에서 가장 깊으면 그것을 써라. 출력은 위 「출력 형식」과 설계메모 규칙을 그대로 따른다.";

/** 지문 턴 머리(프로덕션 v2 프롬프트의 "\n\n## 지문\n" 과 같은 머리). */
export const PASSAGE_HEAD = "## 지문\n";

/** 조립 크기 추정(§5.1: 글자 수 / 3.2). */
export const CHARS_PER_TOKEN = 3.2;

export function estimateTokens(x: string | readonly LabChatMessage[]): number {
  const chars = typeof x === "string" ? x.length : x.reduce((s, m) => s + m.content.length, 0);
  return Math.ceil(chars / CHARS_PER_TOKEN);
}

export function iclSystemMessage(cardsBlock?: string | null): string {
  const base = `${v2PromptCore()}\n\n${ICL_NOTE}`;
  return cardsBlock ? `${base}\n\n${cardsBlock}` : base;
}

export function iclTargetTurn(targetText: string, mirrorLine?: string | null): string {
  const turn = `${PASSAGE_HEAD}${targetText}`;
  return mirrorLine ? `${turn}\n\n${mirrorLine}` : turn;
}

/** 시연 1건이 더하는 글자 수(user 머리+지문 + assistant 출력). */
export function demoChars(d: Pick<IclDemo, "passageText" | "output">): number {
  return PASSAGE_HEAD.length + d.passageText.length + d.output.length;
}

export function buildIclMessages(a: {
  targetText: string;
  demos: readonly Pick<IclDemo, "passageText" | "output">[];
  cardsBlock?: string | null;
  mirrorLine?: string | null;
}): LabChatMessage[] {
  const messages: LabChatMessage[] = [{ role: "system", content: iclSystemMessage(a.cardsBlock) }];
  for (const d of a.demos) {
    messages.push({ role: "user", content: `${PASSAGE_HEAD}${d.passageText}` });
    messages.push({ role: "assistant", content: d.output });
  }
  messages.push({ role: "user", content: iclTargetTurn(a.targetText, a.mirrorLine) });
  return messages;
}
