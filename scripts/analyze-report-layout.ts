/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * PRIME ANALYSIS 보고서 레이아웃 휴리스틱 분석기 (브라우저 없이).
 *
 * 입력: AnalysisReport(or generation) JSON 파일 경로.
 * 출력: 추정 페이지 수 / 페이지별 채움률 / 여백 과다·오버플로 경고.
 *
 * 주의: 실제 DOM 측정이 아닌 휴리스틱 추정값. "페이지가 텅 비었는지" 같은
 *       구조적 결함을 빠르게 잡는 용도. 절대값보다 상대 비교로 해석할 것.
 *
 * 실행: npx tsx scripts/analyze-report-layout.ts <report.json>
 */
import { readFileSync } from "node:fs";

const PAGE_BODY_MM = 243;
const GAP = 6;
const W = 174; // 본문 폭(mm)

const cpl = (mm: number, fontPt: number) => Math.floor((mm / (fontPt * 0.36)) * 1.0); // 대략 글자수/줄
const lines = (t: string, charsPerLine: number) => Math.max(1, Math.ceil((t || "").length / charsPerLine));
const lh = (pt: number) => pt * 0.47; // pt → mm 줄높이 근사

function estTitle(): number {
  return 38 + 14 + 5; // 타이틀박스 + 메타표 + docnote
}
function estPassage(sentences: any[]): number {
  let h = 8; // box padding
  for (const s of sentences) {
    h += lines(s.en, cpl(W - 8, 10)) * lh(10) + lines(s.ko ?? "", cpl(W - 8, 9)) * lh(9) + 2.5;
  }
  return h + 8; // section head
}
function estStructureMap(sec: any): number {
  const maxBullets = Math.max(...(sec.columns ?? []).map((c: any) => (c.bullets?.length ?? 0)), 3);
  return 8 + 14 + 7 + (sec.branchLabel ? 19 : 0) + (16 + maxBullets * 5) + 7 + 24 + 7 + 18 + 14;
}
function estSummary(sec: any): number {
  let h = 8;
  for (const s of sec.sentences ?? []) h += lines(s, cpl(W - 10, 10)) * lh(10) + 1.8;
  return h + lines(sec.thesisEn ?? "", cpl(W - 10, 11.5)) * lh(11.5) + 14 + 8;
}
function estGrammarRows(rows: any[]): number {
  let h = 7; // thead
  for (const r of rows) {
    const exp = lines(r.explanation ?? "", cpl(W * 0.62, 8.7)) * lh(8.7);
    const trap = r.trap ? lines(r.trap, cpl(W * 0.62, 8)) * lh(8) + 1.5 : 0;
    const point = lines(r.point ?? "", cpl(W * 0.25, 8.7)) * lh(8.7);
    h += Math.max(exp + trap, point) + 4;
  }
  return h;
}
function estExamRows(rows: any[]): number {
  let h = 7;
  for (const r of rows) {
    h += Math.max(lines(r.strategy ?? "", cpl(W * 0.55, 8.7)) * lh(8.7), lines(r.asks ?? "", cpl(W * 0.24, 8.7)) * lh(8.7)) + 4;
  }
  return h;
}
function estVocabRows(rows: any[]): number {
  return 7 + rows.length * 8; // 줄바꿈 고려해 행당 ~8mm
}
function estParseItem(item: any): number {
  return 8 + lines(item.en ?? "", cpl(W - 8, 9.5)) * lh(9.5) + (item.parts?.length ?? 0) * 5 + 6;
}
function estSelfCheckQ(qs: any[]): number {
  let h = 8;
  for (const q of qs) h += lines(q.prompt ?? "", cpl(W - 10, 10)) * lh(10) + (q.choices ? 5 : 0) + 3;
  return h;
}
function estAnswers(ans: any[]): number {
  return 8 + ans.length * 4.5;
}

function chunk<T>(a: T[], n: number): T[][] {
  const o: T[][] = [];
  for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n));
  return o;
}
function evenChunk<T>(a: T[], maxSize: number): T[][] {
  if (a.length <= maxSize) return a.length ? [a] : [];
  const k = Math.ceil(a.length / maxSize);
  return chunk(a, Math.ceil(a.length / k));
}

type LBlock = { label: string; h: number; keep?: boolean };

function buildBlockHeights(report: any): LBlock[] {
  const out: LBlock[] = [{ label: "title", h: estTitle() }];
  for (const sec of report.sections ?? []) {
    switch (sec.kind) {
      case "passage":
        evenChunk(sec.sentences ?? [], 6).forEach((g, i) => out.push({ label: `passage#${i + 1}`, h: estPassage(g) }));
        break;
      case "structure-map":
        out.push({ label: "structure-map", h: estStructureMap(sec) });
        break;
      case "summary":
        out.push({ label: "summary", h: estSummary(sec) });
        break;
      case "grammar":
        chunk(sec.rows ?? [], 4).forEach((g, i) => out.push({ label: `grammar#${i + 1}`, h: estGrammarRows(g) }));
        break;
      case "exam-focus":
        chunk(sec.rows ?? [], 4).forEach((g, i) => out.push({ label: `exam#${i + 1}`, h: estExamRows(g) }));
        break;
      case "vocabulary":
        chunk(sec.rows ?? [], 18).forEach((g, i) => out.push({ label: `vocab#${i + 1}`, h: estVocabRows(g) }));
        break;
      case "parsing":
        (sec.items ?? []).forEach((it: any, i: number) => out.push({ label: `parse#${i + 1}`, h: estParseItem(it) }));
        break;
      case "self-check": {
        const qChunks = chunk(sec.questions ?? [], 4);
        qChunks.forEach((g, i) => out.push({ label: `quiz#${i + 1}`, h: estSelfCheckQ(g) }));
        out.push({ label: "answers", h: estAnswers(sec.answers ?? []), keep: qChunks.length > 0 });
        break;
      }
    }
  }
  return out;
}

function pack(blocks: LBlock[]) {
  const pages: LBlock[][] = [];
  let cur: LBlock[] = [];
  let curH = 0;
  const flush = () => { if (cur.length) { pages.push(cur); cur = []; curH = 0; } };
  for (const b of blocks) {
    const add = (cur.length ? GAP : 0) + b.h;
    if (cur.length && curH + add > PAGE_BODY_MM) {
      if (b.keep && cur.length) {
        const prev = cur.pop() as LBlock;
        flush();
        cur = [prev];
        curH = prev.h;
      } else {
        flush();
      }
    }
    cur.push(b);
    curH += cur.length === 1 ? b.h : GAP + b.h;
  }
  flush();
  return pages;
}

function main() {
  const path = process.argv[2];
  if (!path) {
    console.error("usage: tsx scripts/analyze-report-layout.ts <report.json>");
    process.exit(1);
  }
  const report = JSON.parse(readFileSync(path, "utf8"));
  const blocks = buildBlockHeights(report);
  const overflow = blocks.filter((b) => b.h > PAGE_BODY_MM);
  const pages = pack(blocks);

  const pageInfo = pages.map((p, i) => {
    const used = p.reduce((s, b) => s + b.h, 0) + GAP * (p.length - 1);
    const fill = Math.round((used / PAGE_BODY_MM) * 100);
    return { page: i + 1, fillPct: fill, blocks: p.map((b) => b.label), usedMm: Math.round(used) };
  });
  const underfull = pageInfo.filter((p) => p.fillPct < 55 && p.page !== pages.length); // 마지막 페이지 제외
  const lastFill = pageInfo[pageInfo.length - 1]?.fillPct ?? 0;

  const summary = {
    pages: pages.length,
    pageFill: pageInfo.map((p) => `p${p.page}:${p.fillPct}%`).join("  "),
    warnings: [
      ...overflow.map((b) => `OVERFLOW: 블록 '${b.label}' 추정높이 ${Math.round(b.h)}mm > 페이지 ${PAGE_BODY_MM}mm (단일 블록이 한 페이지 초과 — 더 잘게 쪼개야 함)`),
      ...underfull.map((p) => `WHITESPACE: ${p.page}페이지 채움률 ${p.fillPct}% (여백 과다)`),
      ...(lastFill < 25 ? [`WHITESPACE: 마지막(${pages.length}) 페이지 채움률 ${lastFill}% (거의 빈 페이지)`] : []),
    ],
    detail: pageInfo,
  };
  console.log(JSON.stringify(summary, null, 2));
}

main();
