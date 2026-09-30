// 가짜 @/lib/auth — 스태프 세션은 globalThis.__idorEnv.staff.
"use strict";
const env = () => globalThis.__idorEnv;
exports.getStaffSession = async () => env().staff ?? null;
exports.requireStaffAuth = async () => {
  if (!env().staff) throw new Error("Unauthorized");
  return env().staff;
};
exports.auth = async () => (env().staff ? { user: env().staff } : null);
