// 구제 cx 대조 선호 카드(RESCUE-SPEC §5.2) — LAB/rescue/icl/cards.json(build-cards.mjs 결정론 산출) 로더 + 거울 점검줄 판독.
// CARDS_HEADER · MIRROR_LINE 은 스펙 축자다. cards.json 의 블록이 이 문구로 시작하지 않으면 throw(문구 드리프트 차단).
import fs from "node:fs";
import path from "node:path";
import { ICL_DIR } from "./bank";

/** §5.2 CARDS_BLOCK 머리말(축자). */
export const CARDS_HEADER =
  '## 채택·기각 사례 (같은 심사 기준으로 판정된 실제 출제안의 밑줄 문맥 — 지문·표현을 복사하지 마라)\n각 쌍은 같은 문법 범주다. ✗는 심사에서 "죽은 미끼"(학생이 보자마자 옳다고 확정해 검토조차 하지 않는 자리) 또는 "인지형·무효 정답"으로, ✓는 살아 있는 미끼·판단형 정답으로 판정됐다. 차이는 한 가지 — 다른 형태가 그 자리에서 성립해 보이게 만드는 요소가 있느냐다.';

/** §5.2 MIRROR_LINE(축자). */
export const MIRROR_LINE =
  '## 미끼 점검 (설계메모에 한 줄 추가)\n설계메모 마지막 줄에 "미끼점검:"으로 시작하는 한 줄을 써라 — 미끼로 고른 네 표현마다 「표현 → 학생이 고치고 싶어질 형태 → 그 형태가 그 자리에서 성립해 보이는가(예/아니오)」를 세미콜론으로 이어 적는다. 아니오가 하나라도 있으면 그 미끼를 위 사례의 ✓ 쪽 자리로 교체한 뒤 최종본만 적어라. 이 줄에 "정답:" "고침:" "(A)" 같은 표식은 쓰지 마라.';

export interface IclCards {
  version: number;
  builtAt: string;
  /** CARDS_HEADER + 카드 본문(프롬프트에 그대로 들어가는 블록). */
  cardsBlock: string;
  mirrorLine: string;
}

let cache: { mtimeMs: number; size: number; cards: IclCards } | null = null;

export function loadIclCards(): IclCards {
  const file = path.join(ICL_DIR, "cards.json");
  const st = fs.statSync(file);
  if (cache && cache.mtimeMs === st.mtimeMs && cache.size === st.size) return cache.cards;
  const raw = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
  const cardsBlock = typeof raw.cardsBlock === "string" ? raw.cardsBlock : "";
  const mirrorLine = typeof raw.mirrorLine === "string" ? raw.mirrorLine : "";
  if (!cardsBlock.startsWith(`${CARDS_HEADER}\n`)) throw new Error(`[cx] cards.json 머리말이 스펙 축자와 다르다: ${file}`);
  if (mirrorLine !== MIRROR_LINE) throw new Error(`[cx] cards.json 거울 점검줄이 스펙 축자와 다르다: ${file}`);
  const cards: IclCards = {
    version: typeof raw.version === "number" ? raw.version : 0,
    builtAt: typeof raw.builtAt === "string" ? raw.builtAt : "",
    cardsBlock,
    mirrorLine,
  };
  cache = { mtimeMs: st.mtimeMs, size: st.size, cards };
  return cards;
}

/** 설계메모(「밑줄지문:」 앞)의 "미끼점검:" 줄에서 "아니오" 수(§5.2 계측, 비차단). 줄이 없으면 null. */
export function decoySelfCheckCount(text: string): number | null {
  const i = text.indexOf("밑줄지문:");
  const memo = i >= 0 ? text.slice(0, i) : text;
  const line = memo.split(/\r?\n/).find((l) => /^\s*[-*]?\s*미끼\s*점검\s*[:：]/.test(l));
  if (!line) return null;
  return (line.match(/아니오/g) ?? []).length;
}
