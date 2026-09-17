// ============================================================================
// 지문별 유형 수용량 — "이 지문이 이 유형으로 문항을 몇 개까지 지지하는가"를 결정론으로 센다.
//
// 발견 경위(일지 Q045): 파일럿에서 REFERENCE 가 8문항 요청에 3개만 냈고, 그 사유가 정확했다 —
//   "지문 전체를 REFERENCE_PRONOUN_LIST 22종으로 훑은 결과 대명사 출현은 4곳. 그중 that@584 는
//    관계대명사라 게이트가 반려. 적격 표적 = 3개가 물리적 상한이며, 4~8번은 이미 쓴 출현을 다시
//    겨냥할 수밖에 없어 ANSWER_DUPLICATE 가 추가로 터진다 — 억지 충원은 차단을 늘린다."
//
// 즉 이건 저작 실패가 아니라 **계획 결함**이다. 티어가 8을 요구했지만 지문이 3만 지지한다.
// 이 계산을 계획 단계로 옮기면 처음부터 3으로 발주해 전량 폐기를 막는다.
//
// 실행: node_modules/.bin/tsx qbank/harness/capacity.ts [--write] [--passage <id>]

import fs from "node:fs";
import path from "node:path";
import { REFERENCE_PRONOUN_LIST } from "../../src/lib/md-qgen/parser-reference";

const ROOT = process.cwd();
const SRC = path.join(ROOT, "src/data/exam-passages/passages.json");
const OUT = path.join(ROOT, "qbank/spec/capacity.json");

type Passage = { id: string; text: string; wordCount: number; typeGroup: string; year: number };
const rows: Passage[] = JSON.parse(fs.readFileSync(SRC, "utf8"));

const ABBREV = /\b(Mr|Mrs|Ms|Dr|Prof|St|vs|etc|e\.g|i\.e|Fig|No|cf)\.$/i;
export function splitSentences(text: string): string[] {
  const parts = String(text).split(/(?<=[.!?])\s+/);
  const out: string[] = [];
  let carry = "";
  for (const part of parts) {
    const s = (carry + part).trim();
    if (!s) continue;
    if (ABBREV.test(s)) {
      carry = s + " ";
      continue;
    }
    carry = "";
    out.push(s);
  }
  if (carry.trim()) out.push(carry.trim());
  return out;
}

// gate-reference.ts:71 THAT_PRONOUN_HEADS — that 이 대명사로 읽히는 후행어. 그 외는 관계사/접속사로 반려.
// 코드에서 직접 못 꺼내므로(비export) 보수적으로 판단: that 뒤에 동사류가 오면 관계사일 가능성이 높다.
// 과소 계산(=수용량을 낮게 잡음)은 안전한 방향이다 — 발주를 줄일 뿐 품질을 해치지 않는다.
const THAT_LIKELY_RELATIVE = /^(require|requires|required|is|are|was|were|has|have|had|can|could|will|would|may|might|do|does|did|make|makes|made|enable|enables|create|creates|allow|allows|let|lets|give|gives|take|takes|help|helps|seem|seems|appear|appears|benefit|benefits|satisfy|satisfies)\b/i;

const PRONOUNS = new Set(REFERENCE_PRONOUN_LIST.map((p) => p.toLowerCase()));

/** REFERENCE 적격 표적 = 대명사로 읽히는 출현 수 */
export function referenceCapacity(text: string): { count: number; hits: string[] } {
  const hits: string[] = [];
  const re = /\b([A-Za-z']+)\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const w = m[1].toLowerCase();
    if (!PRONOUNS.has(w)) continue;
    if (w === "that" || w === "this" || w === "these" || w === "those") {
      const after = text.slice(m.index + m[1].length).trim();
      if (w === "that" && THAT_LIKELY_RELATIVE.test(after)) continue; // 관계대명사 → 반려 대상
    }
    hits.push(`${w}@${m.index}`);
  }
  return { count: hits.length, hits };
}

/**
 * 유형별 수용량. 값이 `null` 이면 구조적 상한이 없다(티어값을 그대로 쓴다).
 * 근거가 명확한 유형만 넣는다 — 추측으로 상한을 걸면 멀쩡한 유닛을 버린다.
 */
export function capacityFor(subType: string, p: Passage): { cap: number | null; why: string } {
  const sentences = splitSentences(p.text);
  const n = sentences.length;

  switch (subType) {
    case "REFERENCE": {
      // ⚠ 이 값은 **상한**이지 실현 가능 수가 아니다.
      // REFERENCE 의 정답은 **선행사**이므로, 서로 다른 대명사 두 개가 같은 선행사를 가리키면
      // 정답이 겹쳐 ANSWER_DUPLICATE 로 차단된다(파일럿 실측: 적격 3곳 중 2곳의 선행사가 동일).
      // 선행사 동일 여부는 결정론으로 판정할 수 없으므로(문맥 해석이 필요) 여기서는 출현 수만 세고,
      // 실제 축소는 저작 에이전트가 `shortfallReason` 으로 선언한다(craft/00-AUTHORING §0).
      const r = referenceCapacity(p.text);
      return { cap: r.count, why: `대명사 적격 출현 ${r.count}곳 — 선행사 중복 시 실현값은 더 낮다 (${r.hits.slice(0, 6).join(", ")}${r.hits.length > 6 ? " …" : ""})` };
    }
    case "SENTENCE_INSERT":
      // 문장 1개를 빼내고 남은 흐름에 위치 마커가 붙는데, 정답이 지문 양끝이면 실격이다.
      // 적격 정답 자리 = 문장수 − 3 (types/SENTENCE_INSERT.md 및 파일럿 실측)
      return { cap: Math.max(0, n - 3), why: `문장 ${n}개 → 적격 정답 자리 ${Math.max(0, n - 3)}개(양끝 금지)` };
    // IRRELEVANT 는 상한 없음 — 처음엔 `문장수−2` 로 잡았으나 **파일럿이 반증했다**:
    // 8문항 요청에 8개를 만들어 게이트를 통과했다(내 계산은 6). 이유는 정체성의 성격이 다르기 때문이다.
    //   REFERENCE·SENTENCE_INSERT → 정체성이 **지문에 이미 존재하는 것**(대명사 출현·빼낼 문장)이라 유한
    //   IRRELEVANT              → 정체성이 **새로 쓰는 무관 문장**이라 자리 수에 묶이지 않는다
    // 근거 없는 상한은 멀쩡한 유닛을 버린다. 제거한다.
    default:
      return { cap: null, why: "구조적 상한 없음" };
  }
}

// ── 실행 ──────────────────────────────────────────────────────────────────
if (process.argv[1] && process.argv[1].endsWith("capacity.ts")) {
  const only = process.argv.includes("--passage") ? process.argv[process.argv.indexOf("--passage") + 1] : null;
  const TYPES = ["REFERENCE", "SENTENCE_INSERT"];
  const table: Record<string, Record<string, number>> = {};
  const dist: Record<string, Record<string, number>> = {};

  for (const p of rows) {
    if (only && p.id !== only) continue;
    for (const t of TYPES) {
      const { cap } = capacityFor(t, p);
      if (cap === null) continue;
      table[p.id] = table[p.id] || {};
      table[p.id][t] = cap;
      dist[t] = dist[t] || {};
      const bucket = cap >= 8 ? "8+" : String(cap);
      dist[t][bucket] = (dist[t][bucket] || 0) + 1;
    }
  }

  if (only) {
    const p = rows.find((r) => r.id === only)!;
    console.log(`지문 ${only} · 문장 ${splitSentences(p.text).length}개 · ${p.wordCount}단어`);
    for (const t of TYPES) {
      const { cap, why } = capacityFor(t, p);
      console.log(`  ${t.padEnd(18)} 수용량 ${cap} — ${why}`);
    }
  } else {
    console.log("═══ 지문별 유형 수용량 분포 (전 4,537지문) ═══");
    for (const t of TYPES) {
      const d = dist[t] || {};
      const keys = Object.keys(d).sort((a, b) => (a === "8+" ? 1 : b === "8+" ? -1 : Number(a) - Number(b)));
      console.log(`\n${t}`);
      for (const k of keys) console.log(`  수용량 ${k.padStart(2)} : ${String(d[k]).padStart(5)} 지문`);
    }
    if (process.argv.includes("--write")) {
      fs.mkdirSync(path.dirname(OUT), { recursive: true });
      fs.writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), types: TYPES, byPassage: table }, null, 0), "utf8");
      console.log(`\n→ ${OUT} (${(fs.statSync(OUT).size / 1e6).toFixed(1)} MB)`);
    }
  }
}
