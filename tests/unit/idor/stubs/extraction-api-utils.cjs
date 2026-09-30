/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS 테스트 스텁(require 경로 가로채기용) */
"use strict";
const { NextResponse } = require("next/server");
const env = () => globalThis.__idorEnv;
exports.requireStaff = async () => {
  const s = env().staff;
  if (!s) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  return { id: s.id, academyId: s.academyId, role: s.role ?? "DIRECTOR" };
};
exports.errorResponse = (code, message, status, details) =>
  NextResponse.json({ error: { code, message, details } }, { status });
