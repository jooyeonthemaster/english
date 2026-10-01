// GET /api/dev/qgen-lab/meta — 팔·지문 세트·비용 누적/캡·env 킬스위치 상태. dev 전용(404 → 401).
// 지문 gold 는 정답 번호만 내린다(평가원 실물 표기·정답 조각은 화면에 노출하지 않음).
import { NextResponse } from "next/server";

import { getStaffSession } from "@/lib/auth";
import { ALL_ARMS } from "@/lib/qgen-lab/arms";
import { labCapUsd, labSpentUsd } from "../_lib/ledger";
import { listLabPassages } from "../_lib/passages";
import { PLANNERS } from "../_lib/planners/index";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 원본 함수들이 호출 시점에 읽는 env(값이 "off" 면 꺼짐, 그 외 켬 — OVERDRILL 은 off|core|all).
const SWITCH_KEYS = [
  "QGEN_GRAMMAR_KILLER_V2",
  "QGEN_GRAMMAR_KILLER_DECOY_GATE",
  "QGEN_GRAMMAR_KILLER_OVERDRILL_GATE",
  "QGEN_GRAMMAR_KILLER_DECOY_DEPTH_GATE",
  "QGEN_GRAMMAR_KILLER_ANSWER_SITE_GATE",
] as const;

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const staff = await getStaffSession();
  if (!staff) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const switches: Record<string, string | null> = {};
  for (const k of SWITCH_KEYS) switches[k] = process.env[k] ?? null;

  return NextResponse.json({
    arms: ALL_ARMS,
    passages: listLabPassages().map((p) => ({
      ...p,
      gold: p.gold ? { ansNo: p.gold.ansNo } : null,
    })),
    spentUsd: labSpentUsd(),
    capUsd: labCapUsd(),
    switches,
    planners: Object.keys(PLANNERS),
  });
}
