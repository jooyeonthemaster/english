/**
 * 기출 지문 단건 조회 — 단어 코퍼스 추출 에이전트용.
 *
 * passages.json 은 5.3MB 라 에이전트가 통째로 읽으면 컨텍스트가 터진다.
 * 배정받은 지문 하나만 문장 분리까지 끝난 상태로 받아 간다.
 *
 *   npx tsx scripts/vocab-passage.ts ebsi_go3_20260324-q31
 *   npx tsx scripts/vocab-passage.ts --list --grade=고1 --limit=20   # id 목록만
 */
import fs from "node:fs";
import { splitPassageIntoSentences } from "@/lib/vocab-corpus/sentences";
import PASSAGES from "@/data/exam-passages/passages.json";

type Rec = {
  id: string; examId: string; year: number; exam: string; board: string;
  grade?: string; typeGroup: string; type: string; qNumbers: number[];
  wordCount: number; text: string; reconstructionKind: string;
};
const ALL = PASSAGES as unknown as Rec[];

const args = process.argv.slice(2);
const flag = (n: string) => args.find((a) => a.startsWith(`--${n}=`))?.split("=")[1];

// 재개용 — 아직 산출물이 없는 지문 ID 만 뽑는다. 멱등 재발사의 근거.
if (args.includes("--pending")) {
  const dir = flag("out") ?? "experiments/vocab-corpus-20260728/raw";
  const limit = Number(flag("limit") ?? "0");
  const stratify = args.includes("--stratify");
  const done = new Set(
    fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5)) : [],
  );
  let pending = ALL.filter((p) => !done.has(p.id));
  if (stratify) {
    // 학년 × 연도대 × 유형 을 고르게 섞어 표본이 한쪽에 쏠리지 않게 한다.
    const key = (p: Rec) => `${p.grade ?? "?"}|${Math.floor(p.year / 5)}|${p.typeGroup}`;
    const buckets = new Map<string, Rec[]>();
    for (const p of pending) {
      const k = key(p);
      if (!buckets.has(k)) buckets.set(k, []);
      (buckets.get(k) as Rec[]).push(p);
    }
    // 라운드 안의 순서도 섞어야 한다. 사전순이면 고1 버킷이 전부 먼저 나와서
    // 앞에서 limit 만큼 자르는 순간 표본이 고1 로 몰린다(실측: limit=24 → 고1 24건).
    // 학년 내 순번을 1차 키로 삼아 고1→고2→고3→고1… 으로 교대시킨다.
    const rank = new Map<string, number>();
    const seenPerGrade = new Map<string, number>();
    for (const k of [...buckets.keys()].sort()) {
      const g = k.split("|")[0];
      const n = seenPerGrade.get(g) ?? 0;
      rank.set(k, n);
      seenPerGrade.set(g, n + 1);
    }
    const keys = [...buckets.keys()].sort((a, b) => {
      const d = (rank.get(a) as number) - (rank.get(b) as number);
      return d !== 0 ? d : a.localeCompare(b);
    });
    const out: Rec[] = [];
    let round = 0;
    while (out.length < pending.length) {
      let added = 0;
      for (const k of keys) {
        const b = buckets.get(k) as Rec[];
        if (round < b.length) { out.push(b[round]); added++; }
      }
      if (added === 0) break;
      round++;
    }
    pending = out;
  }
  const rows = limit > 0 ? pending.slice(0, limit) : pending;
  console.log(JSON.stringify(rows.map((p) => p.id)));
  console.error(`전체 ${ALL.length} · 완료 ${done.size} · 남음 ${pending.length} · 출력 ${rows.length}`);
  process.exit(0);
}

if (args.includes("--list")) {
  const grade = flag("grade");
  const year = flag("year");
  const typeGroup = flag("typeGroup");
  const limit = Number(flag("limit") ?? "50");
  const rows = ALL.filter(
    (p) =>
      (!grade || p.grade === grade) &&
      (!year || String(p.year) === year) &&
      (!typeGroup || p.typeGroup === typeGroup),
  ).slice(0, limit);
  for (const r of rows) console.log(r.id);
  console.error(`(${rows.length}건)`);
  process.exit(0);
}

const id = args[0];
if (!id) { console.error("usage: vocab-passage.ts <passageId> | --list [--grade=] [--year=] [--typeGroup=] [--limit=]"); process.exit(2); }

const p = ALL.find((x) => x.id === id);
if (!p) { console.error(`지문 없음: ${id}`); process.exit(1); }

console.log(
  JSON.stringify(
    {
      passageId: p.id,
      meta: {
        grade: p.grade, year: p.year, exam: p.exam, board: p.board,
        typeGroup: p.typeGroup, type: p.type, qNumbers: p.qNumbers,
        wordCount: p.wordCount, reconstructionKind: p.reconstructionKind,
      },
      text: p.text,
      // 표준 분리 결과 — 이 배열의 en 을 그대로 쓰면 §2 불변식 1이 자동으로 지켜진다.
      sentences: splitPassageIntoSentences(p.text).map((en, i) => ({ i, en })),
    },
    null,
    2,
  ),
);
