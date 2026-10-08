import "server-only";

// 무료 신청 페이지용 기출 DB 시험지 목록 — 지문 본문 없이 메타(시험지·문항번호·유형)만.
// 원본은 기출 지문 코퍼스(src/data/exam-passages/passages.json, corpus.ts 와 같은 정적 JSON).
// 공개 API 로 나가므로 본문·정답은 절대 싣지 않는다(검색·스크래핑 가치 없음).

import passagesJson from "@/data/exam-passages/passages.json";
import type { ExamPassage } from "@/lib/exam-passages/types";
import { formatPaperTitle } from "@/lib/exam-passages/format";
import type { FfCatalogPaper, FfGichulPick } from "./constants";

let cached: FfCatalogPaper[] | null = null;
let byExam: Map<string, FfCatalogPaper> | null = null;

export function getFfCatalog(): FfCatalogPaper[] {
  if (cached) return cached;
  const all = (passagesJson as unknown as ExamPassage[]).filter((p) => typeof p.text === "string" && p.text.trim().length > 0);
  const order: string[] = [];
  const groups = new Map<string, ExamPassage[]>();
  for (const p of all) {
    let arr = groups.get(p.examId);
    if (!arr) {
      arr = [];
      groups.set(p.examId, arr);
      order.push(p.examId);
    }
    arr.push(p);
  }
  let dropped = 0;
  cached = order.map((id) => {
    const ps = (groups.get(id) as ExamPassage[]).slice().sort((a, b) => (a.qNumbers[0] ?? 0) - (b.qNumbers[0] ?? 0));
    const h = ps[0];
    // 한 회차 안에 같은 번호 지문이 둘인 데이터(코퍼스 2회차)가 있다 — 화면에서 하나를 누르면 둘이 같이 눌리고
    // 창·칩·막대의 지문 수가 서로 어긋났다(3차 R3-22). 신청 단위는 번호라 첫 것만 남긴다(데이터 자체 정리는 별도 결정)
    const seen = new Set<string>();
    const p: [number[], string][] = [];
    for (const x of ps) {
      const k = x.qNumbers.join(",");
      if (seen.has(k)) {
        dropped += 1;
        continue;
      }
      seen.add(k);
      p.push([x.qNumbers, x.typeGroup]);
    }
    return { e: id, t: formatPaperTitle(h), y: h.year, x: h.exam, g: h.grade ?? "고3", p };
  });
  if (dropped) console.warn(`[free-forecast] 기출 목록: 같은 회차·같은 번호 지문 ${dropped}개를 하나로 합쳤습니다`);
  byExam = new Map(cached.map((c) => [c.e, c]));
  return cached;
}

/** 신청서의 기출 선택을 목록과 대조해 정리한다 — 없는 시험지·문항번호는 버린다. */
export function sanitizeFfPicks(picks: unknown, maxPapers: number): FfGichulPick[] {
  if (!Array.isArray(picks)) return [];
  getFfCatalog();
  const out: FfGichulPick[] = [];
  for (const raw of picks.slice(0, maxPapers)) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as { examId?: unknown; q?: unknown };
    const paper = typeof r.examId === "string" ? byExam?.get(r.examId) : undefined;
    if (!paper || !Array.isArray(r.q)) continue;
    const valid = new Set(paper.p.map(([q]) => q.join(",")));
    const q = (r.q as unknown[])
      .filter((x): x is number[] => Array.isArray(x) && x.every((n) => Number.isInteger(n)))
      .filter((x) => valid.has(x.join(",")));
    if (q.length) out.push({ examId: paper.e, title: paper.t, q });
  }
  return out;
}
