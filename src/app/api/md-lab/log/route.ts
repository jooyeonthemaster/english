import fs from "node:fs";
import path from "node:path";

import { NextRequest, NextResponse } from "next/server";

import { getStaffSession } from "@/lib/auth";

// md-lab 생성 기록 서버 로그 — 브라우저 localStorage 는 외부(분석 도구)에서
// 접근이 불가능하므로, 실험 분석용으로 모든 완료 기록을 JSONL 로도 남긴다.
// dev 전용 실험 도구 성격이라 파일 append 로 충분(동시성·회전 불필요 수준).

const LOG_PATH = path.join(
  process.cwd(),
  "experiments",
  "question-quality-20260715",
  "craft-ab-20260721",
  "md-lab-runs.jsonl",
);

export async function POST(req: NextRequest) {
  const staff = await getStaffSession();
  if (!staff) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  try {
    fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
    fs.appendFileSync(
      LOG_PATH,
      JSON.stringify({ loggedAt: new Date().toISOString(), ...body }) + "\n",
    );
  } catch {
    // 로그 실패는 생성 UX 에 영향 주지 않는다.
  }
  return NextResponse.json({ ok: true });
}
