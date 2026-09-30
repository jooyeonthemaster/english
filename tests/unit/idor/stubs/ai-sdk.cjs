// 가짜 ai SDK — 테스트는 AI 호출 전에 끝나야 한다(부르면 실패로 드러난다).
// 예외: 하네스가 globalThis.__idorEnv.onStreamText 를 걸어 두면 streamText 인자를 그 함수로 넘긴다
// (AI 문맥에 무엇이 실렸는지 보는 검사 전용 — 네트워크 무접촉).
"use strict";
const fail = async () => { throw new Error("AI must not be called in IDOR tests"); };
exports.generateText = fail;
exports.generateObject = fail;
exports.streamText = (args) => {
  const hook = globalThis.__idorEnv?.onStreamText;
  if (typeof hook === "function") return hook(args);
  throw new Error("AI must not be called in IDOR tests");
};
