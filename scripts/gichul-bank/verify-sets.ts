// 장문 세트 렌더 왕복 게이트(G8 세트판, §12.3-E) — 시험지 빌더의 **실제 함수**로
// question-sets.json + questions.json 세트 멤버 전수를 통과시킨다.
//
//   실행: npx tsx scripts/gichul-bank/verify-sets.ts
//         npx tsx scripts/gichul-bank/verify-sets.ts --fixture          (픽스처 2세트로 GREEN 실측)
//         npx tsx scripts/gichul-bank/verify-sets.ts --fixture --negative (결함 주입 → RED 실측)
//
// 검사(§12.1-2 인쇄 형식):
//   S-R1 그룹은 세트당 1개, 공유 지문 1박스(includePassage) — 멤버 수 = memberIds 수
//   S-R2 setPrompt 「[n~m] 다음 글을 읽고, 물음에 답하시오.」 존재 · 번호는 조판 번호에서 파생
//   S-R3 병합 지문 밑줄 `__…__` = 스팬 수(42/44 는 5) · 라벨 (a)~(e) 5개가 밑줄 **밖** 평문
//   S-R4 43-45 병합 지문은 (A)~(D) 단락 4개가 각각 줄 머리(normalizePassageText 예외)
//   S-R5 멤버 본문에 지문 0 — structuredSegments 에 box:passage 없음 · body 빈 문자열
//   S-R6 멤버 선지 5 · 42/44 는 선지 줄이 실제로 그려진다(letters 예외) · 정답 1..5
//   S-R7 세트 각주는 병합 지문 꼬리에 별도 줄로
import { readFileSync, writeFileSync } from "node:fs";

import { buildGroups, makePaperItem } from "../../src/components/exams/paper-builder/paper-item-utils";
import {
  isGichulLetterOptionItem,
  isGichulSetMemberItem,
  questionStemAndBody,
  structuredSegments,
} from "../../src/components/exams/paper-builder/question-body-layout";
import { shouldRenderOptionListForSubtype } from "../../src/components/exams/paper-builder/option-display";
import type { BuilderQuestion, PaperItem } from "../../src/components/exams/paper-builder/types";
import type { ExamBankItem, ExamBankSet } from "../../src/lib/exam-passages/question-bank-types";

const FIXTURE = process.argv.includes("--fixture");
const NEGATIVE = process.argv.includes("--negative");

type Loaded = { sets: ExamBankSet[]; members: Map<string, ExamBankItem> };

function load(): Loaded {
  if (FIXTURE) {
    const fx = JSON.parse(readFileSync(".tmp-gichul-bank/sets/fixture-sets.json", "utf8")) as {
      sets: ExamBankSet[];
      members: ExamBankItem[];
    };
    return { sets: fx.sets, members: new Map(fx.members.map((m) => [m.id, m])) };
  }
  const sets = JSON.parse(readFileSync("src/data/exam-passages/question-sets.json", "utf8")) as ExamBankSet[];
  const items = JSON.parse(readFileSync("src/data/exam-passages/questions.json", "utf8")) as ExamBankItem[];
  return { sets, members: new Map(items.filter((i) => i.setKey).map((i) => [i.id, i])) };
}

// ── 결함 주입(음성테스트) ─────────────────────────────────────────────────
// 게이트가 실제로 무엇을 잡는지 실측한다: 스팬 1개 제거 / 단락 라벨 제거 / optionList 제거.
function injectDefects(loaded: Loaded): string[] {
  const injected: string[] = [];
  for (const set of loaded.sets) {
    if (set.layout.type === "SENTENCE_ORDER") {
      // 단락 라벨 제거 — (B) 라벨을 지워 4단락이 3단락으로 붕괴
      set.displayedPassage = set.displayedPassage.replace(/(^|\n)\(B\)\s/, "$1");
      set.layout.fullPassage = set.displayedPassage;
      injected.push(`${set.key}: (B) 단락 라벨 제거`);
    }
    for (const id of set.memberIds) {
      const m = loaded.members.get(id);
      if (!m) continue;
      const sd = m.structuredData as Record<string, unknown>;
      const spans = sd._spans;
      if (Array.isArray(spans) && spans.length === 5) {
        sd._spans = spans.slice(0, 4); // 스팬 1개 제거
        injected.push(`${id}: _spans 5→4`);
      }
      const g = sd._gichul as Record<string, unknown> | undefined;
      if (g && g.optionList === "letters") {
        delete g.optionList; // optionList 플래그 제거
        injected.push(`${id}: _gichul.optionList 제거`);
      }
    }
  }
  return injected;
}

// ── 조판기 왕복 ───────────────────────────────────────────────────────────
function builderQuestion(member: ExamBankItem, set: ExamBankSet): BuilderQuestion {
  return {
    id: member.id,
    type: "MULTIPLE_CHOICE",
    subType: member.subType,
    questionText: member.questionText,
    // 하네스는 실제 렌더 경로(question-bank-render.ts:131)와 **같은 계약**이어야 한다: 세트 각주는
    // 지문 본문(displayedPassage)이 아니라 `_gichul.footnotes` 로 실려 makePaperItem 이 지문 박스
    // 꼬리에 별도 줄로 붙인다(paper-item-utils.tsx:296-304). 이 배선을 빼면 S-R7 이 전 세트에서
    // 거짓 RED 를 낸다(A6 실측 180/434 — 데이터 결함 아님).
    structuredData: {
      ...(member.structuredData as Record<string, unknown>),
      _gichul: {
        ...((member.structuredData as { _gichul?: Record<string, unknown> })._gichul ?? {}),
        footnotes: set.footnotes,
      },
    },
    options: JSON.stringify(member.options),
    correctAnswer: member.correctAnswer,
    points: member.points || 2,
    difficulty: member.points === 3 ? "KILLER" : "MEDIUM",
    tags: null,
    aiGenerated: false,
    approved: true,
    starred: false,
    createdAt: new Date(0),
    // 하네스(question-bank-render.ts)와 동일 계약: setId 공유 + passage.content = 표시 베이스
    setId: set.key,
    passage: {
      id: `p-${set.key}`,
      title: set.passageTitle,
      content: set.displayedPassage,
      grade: null,
      semester: null,
      publisher: null,
      school: null,
    },
    explanation: null,
    collectionItems: [],
    examLinks: [],
    _count: { examLinks: 0 },
  };
}

const LABEL_RE = /\((?:[a-e])\)/g;
const UNDERLINE_RE = /__([^_]+)__/g;
const PARA_HEAD_RE = /(?:^|\n)\(([A-D])\)\s/g;

function checkSet(set: ExamBankSet, members: Map<string, ExamBankItem>): string[] {
  const why: string[] = [];
  const picked = set.memberIds.map((id) => members.get(id)).filter((m): m is ExamBankItem => Boolean(m));
  if (picked.length !== set.memberIds.length) {
    why.push(`S-R1 멤버 결손 ${picked.length}/${set.memberIds.length}`);
    if (picked.length === 0) return why;
  }
  const items: PaperItem[] = picked.map((m, i) => makePaperItem(builderQuestion(m, set), i + 1, []));
  const groups = buildGroups(items);
  if (groups.length !== 1) why.push(`S-R1 그룹 ${groups.length}개(기대 1)`);
  const group = groups[0];
  if (!group.includePassage || !group.passageContent.trim()) why.push("S-R1 공유 지문 1박스 없음");
  if (group.items.length !== picked.length) why.push(`S-R1 그룹 멤버 ${group.items.length}/${picked.length}`);
  if (!items.every(isGichulSetMemberItem)) why.push("S-R1 _gichul.set 미검출(세트 분기 꺼짐)");

  // S-R2 setPrompt
  if (!/^\[\d+(?:~\d+)?\] 다음 글을 읽고, 물음에 답하시오\.$/.test(group.setPrompt)) {
    why.push(`S-R2 setPrompt=${JSON.stringify(group.setPrompt)}`);
  }

  // S-R3 밑줄·라벨
  const spanTotal = picked.reduce((n, m) => {
    const spans = (m.structuredData as { _spans?: unknown })._spans;
    return n + (Array.isArray(spans) ? spans.length : 0);
  }, 0);
  const underlines = group.passageContent.match(UNDERLINE_RE) || [];
  if (underlines.length !== spanTotal) why.push(`S-R3 밑줄 ${underlines.length}/${spanTotal}`);
  if (spanTotal > 0) {
    if (spanTotal !== 5) why.push(`S-R3 스팬 총수 ${spanTotal}(기대 5)`);
    const labels = group.passageContent.match(LABEL_RE) || [];
    if (labels.length !== 5) why.push(`S-R3 (a)~(e) 라벨 ${labels.length}/5`);
    // 라벨이 밑줄 **안**에 들어가면 인쇄본과 다르다(라벨 평문 · 단어만 밑줄)
    if (underlines.some((u) => /^__\([a-e]\)/.test(u))) why.push("S-R3 라벨이 밑줄 안에 있음");
  }

  // S-R4 순서 세트의 단락 머리 — 기대값은 **그 세트의 layout.blocks 라벨**이다. 현대형 43-45 는 (A)~(D)
  // 4단락이지만 구형(2005~2013 의 46-48·49-50 등)은 (A)~(C) 3단락인 회차가 있다 — "ABCD" 를 못 박으면
  // 멀쩡한 구형 세트가 RED 로 뜬다(26-09-08 실측 ebsi_go3_20070418-q46-47-48: blocks 3개인데 게이트가 4개 기대).
  if (set.layout.type === "SENTENCE_ORDER") {
    const heads = [...group.passageContent.matchAll(PARA_HEAD_RE)].map((m) => m[1]);
    const expected = (set.layout.blocks ?? []).map((b) => b.label.replace(/[()]/g, ""));
    if (expected.length < 3) why.push(`S-R4 블록 ${expected.length}개(최소 3)`);
    else if (heads.join("") !== expected.join("")) {
      why.push(`S-R4 단락 머리 ${JSON.stringify(heads)}(기대 ${expected.join(",")})`);
    }
  }

  // S-R5/S-R6 멤버
  for (const item of group.items) {
    const id = item.questionId;
    const { body } = questionStemAndBody(item);
    const segs = structuredSegments(item);
    if (segs.some((s) => s.kind === "box" && s.boxStyle === "passage")) why.push(`S-R5 ${id} 멤버 안 지문 박스`);
    if (segs.some((s) => s.kind === "para")) why.push(`S-R5 ${id} 멤버 안 단락`);
    if (body.trim()) why.push(`S-R5 ${id} 멤버 본문 비어있지 않음`);
    if (!item.includePassage) why.push(`S-R5 ${id} 공통 지문 기본 표시 꺼짐`);
    if (item.options.length !== 5) why.push(`S-R6 ${id} 선지 ${item.options.length}/5`);
    if (!/^[1-5]$/.test(item.correctAnswer)) why.push(`S-R6 ${id} 정답 ${JSON.stringify(item.correctAnswer)}`);
    const optionListDrawn =
      shouldRenderOptionListForSubtype(item.sourceQuestion.subType) || isGichulLetterOptionItem(item);
    if (!optionListDrawn) why.push(`S-R6 ${id} 선지 줄이 렌더되지 않음(letters 예외 미적용)`);
    if (isGichulLetterOptionItem(item) && !item.options.every((o) => /^\([a-e]\)$/.test(o.text))) {
      why.push(`S-R6 ${id} letters 선지 자구 이상`);
    }
  }

  // S-R7 각주
  if (set.footnotes.length > 0) {
    const tail = group.passageContent.split("\n").pop() || "";
    if (!/^[*＊]\s*\S/.test(tail)) why.push("S-R7 각주가 별도 줄이 아님");
  }
  return why;
}

const loaded = load();
const injected = NEGATIVE ? injectDefects(loaded) : [];
const fails: { key: string; why: string }[] = [];
for (const set of loaded.sets) {
  const why = checkSet(set, loaded.members);
  if (why.length) fails.push({ key: set.key, why: why.join(" | ") });
}

const out = {
  mode: FIXTURE ? "fixture" : "data",
  negative: NEGATIVE,
  injected,
  sets: loaded.sets.length,
  members: loaded.members.size,
  fails,
};
writeFileSync(
  FIXTURE ? ".tmp-gichul-bank/sets/verify-sets-fixture.json" : ".tmp-gichul-bank/sets/verify-sets.json",
  JSON.stringify(out, null, 1),
);

console.log(
  `G8-SETS ${out.mode}${NEGATIVE ? " (--negative 결함 주입)" : ""}: 세트 ${out.sets} · 멤버 ${out.members} · fail ${fails.length}`,
);
if (loaded.sets.length === 0) {
  // 공허한 통과 방지 — 세트 0개면 무엇도 검사하지 않은 것이다(assemble-sets 미실행 상태).
  console.log(
    "  ⚠ 세트 0개 — 검사한 것이 없다(question-sets.json 미조립). `--fixture` 로 게이트 자체를 실측하라.",
  );
}
for (const i of injected) console.log(`  주입: ${i}`);
for (const f of fails.slice(0, 20)) console.log(`  - ${f.key}\n      ${f.why}`);

if (NEGATIVE) {
  // 음성테스트는 **RED 가 정상** — 결함을 주입했는데 통과하면 게이트가 공허하다.
  const ok = fails.length === loaded.sets.length && loaded.sets.length > 0;
  console.log(ok ? "G8-SETS negative: RED 확인(게이트 유효)" : "G8-SETS negative: FAIL — 결함 주입이 잡히지 않음");
  process.exit(ok ? 0 : 1);
}
process.exit(fails.length === 0 ? 0 : 1);
