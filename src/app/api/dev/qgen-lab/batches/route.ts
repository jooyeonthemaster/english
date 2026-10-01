// GET /api/dev/qgen-lab/batches — .tmp-qgen-lab-2609/batches/*.json 매니페스트 목록({ batches }).
// GET ?id=x — 해당 BatchManifest(없으면 404). dev 전용(404 → 401).
import fs from "node:fs";
import path from "node:path";

import { NextRequest, NextResponse } from "next/server";

import { getStaffSession } from "@/lib/auth";
import type { BatchManifest } from "@/lib/qgen-lab/types";
import { LAB_WS } from "../_lib/ledger";
import { isSafeBatchId } from "../_lib/results";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BATCH_DIR = path.join(LAB_WS, "batches");

const isStrArr = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === "string");
const posInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 1;

/** 매니페스트 형식 검증 — id 는 파일명(확장자 제외)이 정본. */
function readManifest(stem: string): BatchManifest | null {
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(path.join(BATCH_DIR, `${stem}.json`), "utf8"));
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object") return null;
  const m = raw as Record<string, unknown>;
  if (!isStrArr(m.armIds) || !isStrArr(m.passageIds) || !posInt(m.reps)) return null;
  return {
    id: stem,
    title: typeof m.title === "string" ? m.title : stem,
    armIds: m.armIds,
    passageIds: m.passageIds,
    reps: m.reps,
    concurrency: posInt(m.concurrency) ? m.concurrency : 1,
    order: m.order === "by-arm" ? "by-arm" : "interleave",
  };
}

export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const staff = await getStaffSession();
  if (!staff) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (id !== null) {
    if (!isSafeBatchId(id)) return NextResponse.json({ error: `id 형식 오류: ${id}` }, { status: 400 });
    const manifest = readManifest(id);
    if (!manifest) return NextResponse.json({ error: `배치 없음: ${id}` }, { status: 404 });
    return NextResponse.json(manifest);
  }

  let files: string[] = [];
  try {
    files = fs.readdirSync(BATCH_DIR).filter((f) => f.endsWith(".json"));
  } catch {
    files = [];
  }
  const batches = files
    .map((f) => f.slice(0, -".json".length))
    .filter(isSafeBatchId)
    .map(readManifest)
    .filter((m): m is BatchManifest => m !== null)
    .sort((a, b) => a.id.localeCompare(b.id));
  return NextResponse.json({ batches });
}
