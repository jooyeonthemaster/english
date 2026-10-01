// qgen-lab 지문 세트 로더 — .tmp-qgen-lab-2609/passage-set.json(build-passage-set.mjs 산출).
// 서버 전용(fs). 클라는 /api/dev/qgen-lab/meta 로 받는다(대용량 JSON 번들 금지).
// custom 지문: id = custom-<sha1 앞 8자리>(본문 양끝 공백 제거 후 해시) — 같은 본문은 같은 id.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import type { LabPassage } from "@/lib/qgen-lab/types";
import { LAB_WS } from "./ledger";

const PASSAGE_SET = path.join(LAB_WS, "passage-set.json");

let cache: { mtimeMs: number; size: number; list: LabPassage[] } | null = null;

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function toGold(raw: unknown): LabPassage["gold"] {
  if (!raw || typeof raw !== "object") return null;
  const g = raw as Record<string, unknown>;
  if (typeof g.ansNo !== "number") return null;
  return {
    numbered: typeof g.numbered === "string" ? g.numbered : "",
    ansNo: g.ansNo,
    ansFrag: typeof g.ansFrag === "string" ? g.ansFrag : "",
    fix: typeof g.fix === "string" ? g.fix : "",
    frags: Array.isArray(g.frags) ? g.frags.filter((f): f is string => typeof f === "string") : [],
    ...(typeof g.tier === "string" ? { tier: g.tier } : {}),
  };
}

function toPassage(raw: unknown): LabPassage | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string" || typeof r.text !== "string" || !r.text.trim()) return null;
  const source: LabPassage["source"] =
    r.source === "gichul" || r.source === "prod" ? r.source : "custom";
  return {
    id: r.id,
    label: typeof r.label === "string" ? r.label : r.id,
    source,
    // 원문 그대로(정규화 금지 — 게이트 재구성 비교가 이 문자열을 기준으로 돈다).
    text: r.text,
    words: typeof r.words === "number" ? r.words : countWords(r.text),
    gold: toGold(r.gold),
  };
}

/** 지문 세트 전체(파일 없으면 []). mtime·size 가 같으면 캐시. */
export function listLabPassages(): LabPassage[] {
  let st: fs.Stats;
  try {
    st = fs.statSync(PASSAGE_SET);
  } catch {
    cache = null;
    return [];
  }
  if (cache && cache.mtimeMs === st.mtimeMs && cache.size === st.size) return cache.list;
  let list: LabPassage[] = [];
  try {
    const raw: unknown = JSON.parse(fs.readFileSync(PASSAGE_SET, "utf8"));
    const arr = Array.isArray(raw) ? raw : [];
    list = arr.map(toPassage).filter((p): p is LabPassage => p !== null);
  } catch (err) {
    console.error("[qgen-lab] passage-set.json 읽기 실패", err);
    list = [];
  }
  cache = { mtimeMs: st.mtimeMs, size: st.size, list };
  return list;
}

export function customPassageId(text: string): string {
  const hash = crypto.createHash("sha1").update(text.trim(), "utf8").digest("hex");
  return `custom-${hash.slice(0, 8)}`;
}

export function isCustomPassageId(id: string): boolean {
  return id === "custom" || id.startsWith("custom-");
}

/** id 로 지문 조회. custom("custom" 또는 "custom-<hash>")은 customText 로 즉석 생성 — id 는 본문 해시로 정규화. */
export function getLabPassage(id: string, customText?: string): LabPassage | null {
  if (isCustomPassageId(id)) {
    const text = customText?.trim();
    if (!text) return null;
    const cid = customPassageId(text);
    return {
      id: cid,
      label: `직접 입력 ${cid.slice("custom-".length)}`,
      source: "custom",
      text,
      words: countWords(text),
      gold: null,
    };
  }
  return listLabPassages().find((p) => p.id === id) ?? null;
}
