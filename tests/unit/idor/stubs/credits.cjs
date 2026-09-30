// 가짜 @/lib/credits — 차감·환불을 기록만 한다.
"use strict";
const env = () => globalThis.__idorEnv;
class InsufficientCreditsError extends Error {}
exports.InsufficientCreditsError = InsufficientCreditsError;
exports.deductCredits = async (academyId, op, actorId, meta) => {
  env().credits.push({ kind: "deduct", academyId, op, meta });
  return { balanceAfter: 100, transactionId: `tx_${env().credits.length}` };
};
exports.refundCredits = async (academyId, op, transactionId, reason) => {
  env().credits.push({ kind: "refund", academyId, op, transactionId, reason });
};
