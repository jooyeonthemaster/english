// 구제 ICL 시연 은행 로더(RESCUE-SPEC §5.1) — LAB/rescue/icl/bank.json(teacher) · bank-self.json(self).
// 빌더는 LAB/rescue/icl/build-bank.mjs(평가원 실물 25건 렌더 + main-2609 제미나이 합격작 축자) — 런타임은 읽기만 한다.
// 등재 항목은 전부 프로덕션 md v2 파싱·게이트 이슈 0 + 미끼 T1 0 으로 빌드 때 검증됐다(eligible=false 항목은 검색 제외).
// 서버 전용(fs). mtime·size 가 같으면 캐시.
import fs from "node:fs";
import path from "node:path";
import { LAB_WS } from "../../ledger";
import type { IclFamily, IclTag } from "./tagger";

export const ICL_DIR = path.join(LAB_WS, "rescue", "icl");

export type IclBankKind = "teacher" | "self";

export interface IclDemo {
  /** gold:<passageId> | gem:<armId>:<passageId>:r<rep> */
  id: string;
  source: "gold" | "gemini" | "self";
  passageId: string;
  /** 시연 지문 원문(user 턴 "## 지문\n<passageText>"). */
  passageText: string;
  /** 시연 v2 출력 전문(assistant 턴 — 설계메모 + 밑줄지문 … 오답). */
  output: string;
  family: IclFamily;
  /** 정답 포인트코드(a~k). */
  code: string | null;
  /** 시연 지문의 태거 구조 군(tagger.ts, 빌드 때 계산). */
  tags: IclTag[];
  depth: "J" | "M" | "R" | null;
  /** 정답 판정 단서 거리(단어) — agreement 시연 쿼터(≥7)에 쓴다. */
  cueDist: number | null;
  answer: { shown: string; fix: string };
  /** false 면 검색 제외(얕은 정답·프롬프트 해부 사례와 중복·미끼 T1 등 — 사유는 excludeReason). */
  eligible: boolean;
  excludeReason: string | null;
}

export interface IclBank {
  version: number;
  kind: IclBankKind;
  builtAt: string;
  entries: IclDemo[];
}

const FILES: Record<IclBankKind, string> = { teacher: "bank.json", self: "bank-self.json" };
const cache = new Map<string, { mtimeMs: number; size: number; bank: IclBank }>();

export function iclBankKind(v: unknown): IclBankKind {
  if (v === undefined || v === null || v === "teacher") return "teacher";
  if (v === "self") return "self";
  throw new Error(`[icl] 알 수 없는 은행: ${String(v)}`);
}

function isDemo(x: unknown): x is IclDemo {
  if (!x || typeof x !== "object") return false;
  const d = x as Record<string, unknown>;
  return (
    typeof d.id === "string" &&
    typeof d.passageId === "string" &&
    typeof d.passageText === "string" &&
    d.passageText.length > 0 &&
    typeof d.output === "string" &&
    d.output.includes("밑줄지문:") &&
    typeof d.family === "string" &&
    Array.isArray(d.tags) &&
    typeof d.eligible === "boolean" &&
    !!d.answer &&
    typeof (d.answer as Record<string, unknown>).fix === "string"
  );
}

/** 은행 파일 로드(없거나 형식이 틀리면 throw — 조용히 시연 없이 생성하지 않는다). */
export function loadIclBank(kind: IclBankKind = "teacher"): IclBank {
  const file = path.join(ICL_DIR, FILES[kind]);
  const st = fs.statSync(file);
  const hit = cache.get(file);
  if (hit && hit.mtimeMs === st.mtimeMs && hit.size === st.size) return hit.bank;
  const raw = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
  const entries = Array.isArray(raw.entries) ? raw.entries : [];
  const bad = entries.findIndex((e) => !isDemo(e));
  if (entries.length === 0 || bad >= 0) throw new Error(`[icl] 은행 형식 오류: ${file} (항목 ${bad})`);
  const bank: IclBank = {
    version: typeof raw.version === "number" ? raw.version : 0,
    kind,
    builtAt: typeof raw.builtAt === "string" ? raw.builtAt : "",
    entries: entries as IclDemo[],
  };
  cache.set(file, { mtimeMs: st.mtimeMs, size: st.size, bank });
  return bank;
}
