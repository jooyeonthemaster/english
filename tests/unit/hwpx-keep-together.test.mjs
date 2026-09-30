import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";

// HWPX 선지·머리 묶음 유지(keep-policy.ts) + 2단 lineseg 폭 계약 — docs/EXAM-PAPER-MODEL.md §9 · §10.
// 실제 .hwpx 를 tsx 하니스로 만들고 header.xml / section1.xml(본문 구역)을 풀어 구조 불변식을 본다.
// (배치 자체는 한컴 실측 게이트로 따로 증명한다 — 이 테스트는 XML 계약만 고정한다.)

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

const harnessSource = `
import * as builderMod from "@/app/api/exams/[examId]/export-hwpx/_lib/builder";
import * as packageMod from "@/app/api/exams/[examId]/export-hwpx/_lib/package";
import * as keepMod from "@/app/api/exams/[examId]/export-hwpx/_lib/keep-policy";
import JSZip from "jszip";
const { applyKeepPolicy } = keepMod.default ?? keepMod;
const { buildBuilderHwpxDocument } = builderMod.default ?? builderMod;
const { packageHwpx } = packageMod.default ?? packageMod;

const OPTS5 = (i) => [1, 2, 3, 4, 5].map((n) => ({ label: String(n), text: "Plausible option number " + n + " for question " + i }));
function makeQuestion(i, extra = {}) {
  const id = "q" + i;
  return {
    localId: id,
    questionId: id,
    orderNum: i,
    points: 2,
    groupId: "single:" + id,
    includePassage: true,
    passageTitle: "PASSAGE " + i,
    passageContent: ("This is a sufficiently long English passage sentence number " + i +
      " written to fill the column with enough text so that the flow spreads questions across columns. ").repeat(5),
    questionText: "What is the main idea of the passage in question " + i + "?",
    options: OPTS5(i),
    correctAnswer: "1",
    answerSpaceLines: 0,
    objectiveAnswerSlots: 0,
    objectiveAnswerTexts: [],
    sectionTitle: "",
    teacherNote: "",
    sourceQuestion: {
      id, type: "MULTIPLE_CHOICE", subType: "TOPIC_MAIN_IDEA", questionText: "", options: null,
      correctAnswer: "1", difficulty: "INTERMEDIATE", passage: null,
      explanation: { content: "Because the passage says so.\\nSecond line of the explanation.", keyPoints: null, wrongOptionExplanations: null },
    },
    ...extra,
  };
}
const baseLayout = { paperSize: "A4", columns: 2, density: "comfortable", showAnswerSpace: true, showPassageTitle: true, showQuestionMeta: true };
function settingsFor(items, layout = {}, blocks) {
  return { source: "exam-paper-builder-v1", template: "clean", layout: { ...baseLayout, ...layout }, header: {}, items, ...(blocks ? { blocks } : {}) };
}

// depth-0 <hp:p> 문단(표 안 문단 제외)
function topLevelParagraphs(sec) {
  const spans = []; let depth = 0; let start = -1;
  for (const m of sec.matchAll(/<hp:p |<\\/hp:p>/g)) {
    if (m[0] === "<hp:p ") { if (depth === 0) start = m.index; depth++; }
    else { depth--; if (depth === 0) spans.push(sec.slice(start, m.index + m[0].length)); }
  }
  return spans.map((p) => {
    const open = p.match(/^<hp:p [^>]*>/)[0];
    const text = [...p.matchAll(/<hp:t>(.*?)<\\/hp:t>/gs)].map((x) => x[1]).join("").replace(/<[^>]+>/g, "");
    return {
      pp: Number(open.match(/paraPrIDRef="(\\d+)"/)[1]),
      pageBreak: /pageBreak="1"/.test(open),
      columnBreak: /columnBreak="1"/.test(open),
      tbl: p.includes("<hp:tbl"),
      secPr: p.includes("<hp:secPr"),
      text: text.slice(0, 60),
      horz: [...p.matchAll(/<hp:lineseg [^>]*horzsize="(\\d+)"/g)].slice(-1).map((x) => Number(x[1]))[0] ?? null,
      horzAll: [...new Set([...(p.includes("<hp:tbl") ? [] : p.matchAll(/<hp:lineseg [^>]*horzsize="(\\d+)"/g))].map((x) => Number(x[1])))],
    };
  });
}
function paraPrTable(header) {
  const items = [...header.matchAll(/<hh:paraPr id="(\\d+)".*?<hh:breakSetting [^>]*widowOrphan="(\\d)" keepWithNext="(\\d)" keepLines="(\\d)"/gs)]
    .map((m) => ({ id: Number(m[1]), wo: m[2] === "1", kwn: m[3] === "1", kl: m[4] === "1" }));
  const itemCnt = Number(header.match(/<hh:paraProperties itemCnt="(\\d+)"/)[1]);
  return { items, itemCnt };
}

async function build(name, { items, layout, blocks, includeAnswers = false, env = {} }) {
  const keys = ["HWPX_NATIVE_2COL", "HWPX_KEEP_TOGETHER", "HWPX_LINESEG_WIDTH"];
  for (const k of keys) delete process.env[k];
  Object.assign(process.env, env);
  const doc = buildBuilderHwpxDocument({
    title: "keep " + name, settings: settingsFor(items, layout, blocks), resolvedItems: items,
    includeAnswers, fullExamQuestions: [],
  });
  const zip = await JSZip.loadAsync(await packageHwpx(doc));
  const header = await zip.file("Contents/header.xml").async("string");
  const body = await zip.file("Contents/section1.xml").async("string");
  for (const k of keys) delete process.env[k];
  const { items: pp, itemCnt } = paraPrTable(header);
  const pagePr = body.match(/<hp:pagePr [^>]*width="(\\d+)"[^>]*><hp:margin [^>]*left="(\\d+)" right="(\\d+)"/);
  return {
    name, itemCnt, paraPr: pp, paras: topLevelParagraphs(body), keep: doc.diagnostics?.keep ?? null,
    contentW: Number(pagePr[1]) - Number(pagePr[2]) - Number(pagePr[3]),
    colSz: [...body.matchAll(/<hp:colSz width="(\\d+)"/g)].map((m) => Number(m[1])),
    kwnInHeader: (header.match(/keepWithNext="1"/g) || []).length,
    klInHeader: (header.match(/keepLines="1"/g) || []).length,
    colCount: (body.match(/colCount="(\\d)"/) || [])[1] ?? null,
  };
}

const items8 = Array.from({ length: 8 }, (_, i) => makeQuestion(i + 1));
const long12 = [makeQuestion(1, {
  options: Array.from({ length: 12 }, (_, k) => ({ label: String(k + 1), text: ("Very long option text " + k + " ").repeat(20) })),
})];
const withSection = [makeQuestion(1), makeQuestion(2, { breakBefore: "page" }), makeQuestion(3)];
const sectionBlocks = [
  { blockType: "question", localId: "q1", questionId: "q1" },
  { blockType: "section", localId: "s1", blockTitle: "PART B" },
  { blockType: "question", localId: "q2", questionId: "q2" },
  { blockType: "question", localId: "q3", questionId: "q3" },
];
const out = {
  base: await build("base", { items: items8 }),
  perPage: await build("perPage", { items: items8, layout: { forceTwoPerPage: true } }),
  sectionBreak: await build("sectionBreak", { items: withSection, blocks: sectionBlocks }),
  long12: await build("long12", { items: long12 }),
  keepOff: await build("keepOff", { items: items8, env: { HWPX_KEEP_TOGETHER: "0" } }),
  legacy: await build("legacy", { items: items8, env: { HWPX_NATIVE_2COL: "0" } }),
  oneCol: await build("oneCol", { items: items8, layout: { columns: 1 } }),
  answers: await build("answers", { items: items8, includeAnswers: true }),
  segFull: await build("segFull", { items: items8, env: { HWPX_LINESEG_WIDTH: "full" } }),
  // lineseg 폭 규칙은 용지·밀도마다 단 폭의 4 나머지가 달라(A4 보통 0, A4 compact 2, B4 보통 1, B4 compact 3) 전부 본다
  a4Compact: await build("a4Compact", { items: items8, layout: { density: "compact" } }),
  b4: await build("b4", { items: items8, layout: { paperSize: "B4" } }),
  b4Compact: await build("b4Compact", { items: items8, layout: { paperSize: "B4", density: "compact" } }),
  b4OneCol: await build("b4OneCol", { items: items8, layout: { paperSize: "B4", columns: 1 } }),
  b4OneColCompact: await build("b4OneColCompact", { items: items8, layout: { paperSize: "B4", columns: 1, density: "compact" } }),
  b4SegFull: await build("b4SegFull", { items: items8, layout: { paperSize: "B4" }, env: { HWPX_LINESEG_WIDTH: "full" } }),
};

// applyKeepPolicy 직접 호출 — 고객 시험지·렌더러 경로에서 켜지지 않는 가지(빈 문단 잇기·나눔 가드·kl 떼기)를 고정한다
const PN = (text, keepRole, extra = {}) => ({ kind: "p", runs: [{ kind: "text", text }], ...(keepRole ? { keepRole } : {}), ...extra });
function policy(blocks, columnHeightHpu = 78000) {
  const stats = applyKeepPolicy(blocks, { columnWidthHpu: 25848, columnHeightHpu });
  return { stats, flags: blocks.map((b) => ({ kwn: Boolean(b.style?.keepWithNext), kl: Boolean(b.style?.keepLines) })) };
}
out.policy = {
  bridge2: policy([PN("<보기>", "caption"), PN(""), PN(" "), PN("body text")]),
  bridge3: policy([PN("<보기>", "caption"), PN(""), PN(""), PN(""), PN("body text")]),
  bridgeBreak: policy([PN("<보기>", "caption"), PN("", undefined, { pageBreak: true }), PN("body text")]),
  optionBreak: policy([PN("① a", "option"), PN("② b", "option", { columnBreak: true }), PN("③ c", "option")]),
  hugeOption: policy([PN("1. head", "questionHead"), PN(("Very long option text ").repeat(400), "option")]),
};
process.stdout.write(JSON.stringify(out));
`;

function runHarness() {
  const tmpDir = path.join(repoRoot, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".hwpx-keep-harness.mts");
  try {
    writeFileSync(harnessPath, harnessSource, "utf8");
    const raw = execFileSync("npx", ["tsx", "--tsconfig", "./tsconfig.json", harnessPath], {
      cwd: repoRoot,
      encoding: "utf8",
      env: { ...process.env, NODE_OPTIONS: "" },
      shell: true,
      maxBuffer: 64 * 1024 * 1024,
    });
    return JSON.parse(raw);
  } finally {
    try {
      rmSync(harnessPath);
    } catch {
      // ignore
    }
  }
}

const R = runHarness();
const flagsOf = (r, p) => r.paraPr.find((x) => x.id === p.pp);
const isOpt = (p) => /^[①-⑫]/.test(p.text);
const isHead = (p) => /^\d{1,3}\.\s/.test(p.text);
// A4 comfortable: contentWidth 54202, gap 2506 → 단 폭 25848(4의 배수) → lineseg 폭 25847
const CONTENT_W = 54202;
const COL_W = Math.floor((CONTENT_W - 2506) / 2);

function optionRuns(r) {
  const runs = [];
  let cur = [];
  for (const p of r.paras) {
    if (isOpt(p)) cur.push(p);
    else if (cur.length) {
      runs.push(cur);
      cur = [];
    }
  }
  if (cur.length) runs.push(cur);
  return runs;
}

test("T1 선지 묶음: 앞 n−1개는 keepWithNext+keepLines, 마지막은 keepLines만", () => {
  const runs = optionRuns(R.base);
  assert.equal(runs.length, 8, "문항 8개 → 선지 묶음 8개");
  for (const run of runs) {
    assert.equal(run.length, 5);
    run.forEach((p, i) => {
      const f = flagsOf(R.base, p);
      assert.equal(f.kl, true, `선지 ${p.text} keepLines`);
      assert.equal(f.kwn, i < run.length - 1, `선지 ${p.text} keepWithNext=${i < run.length - 1}`);
    });
  }
});

test("T2 문항 머리(N. …)는 keepWithNext+keepLines", () => {
  const heads = R.base.paras.filter(isHead);
  assert.equal(heads.length, 8);
  for (const h of heads) {
    const f = flagsOf(R.base, h);
    assert.ok(f.kwn && f.kl, `머리 ${h.text}`);
  }
});

test("T3 긴 지문 문단은 묶지 않는다(kwn·kl·widowOrphan 모두 0)", () => {
  const passages = R.base.paras.filter((p) => p.text.startsWith("This is a sufficiently long"));
  assert.equal(passages.length, 8);
  for (const p of passages) {
    const f = flagsOf(R.base, p);
    assert.ok(!f.kwn && !f.kl && !f.wo, "지문 문단 플래그 0");
  }
});

test("T4 paraPr id 0 은 플래그 전부 0, 표·secPr 문단은 0 참조(정답 배지만 kwn 전용), id 연속·itemCnt 일치", () => {
  for (const r of [R.base, R.answers, R.oneCol]) {
    assert.deepEqual(r.paraPr[0], { id: 0, wo: false, kwn: false, kl: false }, `${r.name} id0`);
    r.paraPr.forEach((x, i) => assert.equal(x.id, i, `${r.name} id 연속`));
    assert.equal(r.itemCnt, r.paraPr.length, `${r.name} itemCnt`);
    for (const p of r.paras.filter((q) => q.tbl)) {
      // 정답 배지(표)를 감싸는 문단만 keep-policy 가 kwn 을 준다(T10). 그 밖의 표는 여전히 paraPr 0.
      if (r === R.answers && /정답/.test(p.text)) continue;
      assert.equal(p.pp, 0, `${r.name} 표 감싸는 문단 paraPr 0`);
    }
  }
  // 네이티브 2단은 secPr/colPr 만 품는 빈 첫 문단을 둔다 → paraPr 0. (1단 흐름은 첫 내용 문단이
  // secPr 를 품으므로 그 문단 역할의 플래그를 가질 수 있다 — 첫 쪽 첫 문단이라 무해.)
  for (const r of [R.base, R.answers]) {
    assert.equal(r.paras[0].secPr, true);
    assert.equal(r.paras[0].pp, 0, `${r.name} secPr 빈 문단 paraPr 0`);
  }
});

test("T5 강제 쪽/단 나눔 바로 앞 문단에는 keepWithNext 가 없다", () => {
  for (const r of [R.perPage, R.sectionBreak]) {
    const breaks = r.paras.filter((p) => p.pageBreak || p.columnBreak).length;
    assert.ok(breaks > 0, `${r.name}: 강제 나눔이 있어야 검사가 의미 있다`);
    r.paras.forEach((p, i) => {
      const next = r.paras[i + 1];
      if (next && (next.pageBreak || next.columnBreak)) {
        assert.equal(flagsOf(r, p).kwn, false, `${r.name}: 나눔 앞 문단 "${p.text}" kwn=0`);
      }
    });
  }
  // 섹션 제목(caption)이 쪽 나눔 문항 바로 앞 → 가드가 kwn 을 떼고 통계에 남긴다
  assert.ok(R.sectionBreak.keep.breakConflicts >= 1, "breakConflicts ≥ 1");
  const title = R.sectionBreak.paras.find((p) => p.text === "PART B");
  assert.ok(title, "섹션 제목 문단");
  assert.equal(flagsOf(R.sectionBreak, title).kl, true, "섹션 제목 keepLines 는 유지");
});

test("T6 한 단보다 긴 선지 묶음(400자×12)은 쪼갠다(cappedChains ≥ 1)", () => {
  assert.ok(R.long12.keep.cappedChains >= 1, JSON.stringify(R.long12.keep));
  const run = optionRuns(R.long12)[0];
  assert.equal(run.length, 12);
  const cutInside = run.slice(0, -1).some((p) => !flagsOf(R.long12, p).kwn);
  assert.ok(cutInside, "선지 사슬 중간에 끊김이 있어야 한다");
});

test("T7 HWPX_KEEP_TOGETHER=0 이면 header.xml 에 keep 플래그가 하나도 없다", () => {
  assert.equal(R.keepOff.keep.enabled, false);
  assert.equal(R.keepOff.kwnInHeader, 0);
  assert.equal(R.keepOff.klInHeader, 0);
});

test("T8 구형 2단 표 경로(HWPX_NATIVE_2COL=0)는 플래그 0 — 정책을 부르지 않는다", () => {
  assert.equal(R.legacy.keep, null);
  assert.equal(R.legacy.kwnInHeader, 0);
  assert.equal(R.legacy.klInHeader, 0);
});

test("T9 1단 흐름(layout.columns=1)도 keep 플래그를 받는다", () => {
  assert.equal(R.oneCol.colCount, "1");
  assert.ok(R.oneCol.keep.flagged > 0);
  assert.ok(R.oneCol.kwnInHeader > 0);
  for (const run of optionRuns(R.oneCol)) assert.equal(flagsOf(R.oneCol, run[0]).kwn, true);
});

test("T10 정답포함: 「해설」 라벨은 kwn, 정답 배지(표) 감싸는 문단은 kwn 전용 paraPr, 앞 선지도 배지와 묶음", () => {
  const labels = R.answers.paras.filter((p) => p.text === "해설");
  assert.equal(labels.length, 8);
  for (const l of labels) assert.equal(flagsOf(R.answers, l).kwn, true);
  // 배지가 단/쪽 끝에 홀로 남지 않게(리뷰 실측 고아 2→6 회귀): 선지 ⑤ → 배지 → 빈 줄 → 「해설」 이 한 사슬.
  const paras = R.answers.paras;
  const badgeIdx = paras.flatMap((p, i) => (p.tbl && /정답/.test(p.text) ? [i] : []));
  assert.ok(badgeIdx.length >= 8, `배지 ${badgeIdx.length}`);
  for (const i of badgeIdx) {
    const b = paras[i];
    assert.notEqual(b.pp, 0, "배지 감싸는 문단은 기본 모양(paraPr 0)이 아니다");
    assert.deepEqual({ ...flagsOf(R.answers, b), id: 0 }, { id: 0, wo: false, kwn: true, kl: false }, "배지 감싸는 문단 = kwn 만");
    // 선지 묶음 뒤 빈 간격 문단(renderOptions 꼬리)을 건너 마지막 선지까지 거슬러 간다 — 그 사이도 전부 kwn.
    let j = i - 1;
    while (j > 0 && !paras[j].text.trim()) {
      assert.equal(flagsOf(R.answers, paras[j]).kwn, true, "마지막 선지와 배지 사이 빈 줄도 사슬을 잇는다");
      j--;
    }
    assert.match(paras[j].text, /^[①-⑤]/, `배지 앞 내용은 마지막 선지: ${JSON.stringify(paras[j].text)}`);
    assert.equal(flagsOf(R.answers, paras[j]).kwn, true, "마지막 선지 → 배지 kwn");
    const next = paras.slice(i + 1).find((p) => p.text.trim());
    assert.equal(next?.text, "해설", "배지 다음 내용은 해설 라벨");
    for (const gap of paras.slice(i + 1, paras.indexOf(next))) {
      assert.equal(flagsOf(R.answers, gap).kwn, true, "배지와 해설 라벨 사이 빈 줄도 사슬을 잇는다");
    }
  }
  // 정답 미포함(R.base)은 배지가 없으므로 마지막 선지는 여전히 kwn 없음(T1).
});

// 한컴 2024 는 줄 폭을 4 HPU 로 내린 값(floor(W/4)·4)과 horzsize 가 정확히 같을 때만 우리 줄바꿈 캐시를
// 믿는다(section-xml.ts linesegWidthFor 주석의 실측). → 본문 lineseg 폭은 4의 배수가 아니어야 한다.
function bodyWidthsOf(r) {
  const [first, ...rest] = r.paras;
  assert.equal(first.secPr, true, `${r.name}: 첫 문단이 secPr`);
  // 첫 문단은 꼬리말 subList(전체폭, 한 줄 쪽번호 — 범위 밖)를 품으므로 문단 자신의 마지막 lineseg 만 본다
  return { first: [first.horz], body: [...new Set(rest.filter((p) => !p.tbl).flatMap((p) => p.horzAll))] };
}

test("T11 lineseg 2단: 단 폭 안 + 한컴 양자화 폭(4의 배수)과 겹치지 않음 — A4/B4 × 보통/compact", () => {
  for (const r of [R.base, R.a4Compact, R.b4, R.b4Compact]) {
    assert.equal(r.colSz.length, 2, `${r.name}: 2단`);
    const W = r.colSz[0];
    assert.equal(r.colSz[1], W, `${r.name}: 두 단 폭이 같다`);
    const { first, body } = bodyWidthsOf(r);
    assert.equal(body.length, 1, `${r.name}: 본문 lineseg 폭이 하나 ${JSON.stringify(body)}`);
    const h = body[0];
    assert.ok(h < W && W - h <= 2, `${r.name}: 단 폭 ${W} 안(W−1 또는 W−2)인데 ${h}`);
    assert.notEqual(h % 4, 0, `${r.name}: ${h} 는 4의 배수 → 한컴이 캐시를 믿는다`);
    assert.deepEqual(first, [r.contentW % 4 === 0 ? r.contentW - 1 : r.contentW], `${r.name}: secPr 문단 = 전체폭(4의 배수면 −1)`);
  }
  // 한컴 실측으로 확인한 값 고정: A4 보통 25848→25847, B4 보통 32509→32507(32508 은 floor4(32509) 라 신뢰됨)
  assert.equal(COL_W, 25848);
  assert.deepEqual(bodyWidthsOf(R.base).body, [COL_W - 1]);
  assert.deepEqual(bodyWidthsOf(R.b4).body, [32507]);
});

test("T11b lineseg 1단·비상 스위치: 1단은 전체폭(4의 배수면 −1), full 은 어디서나 예전 전체폭", () => {
  assert.deepEqual(bodyWidthsOf(R.oneCol).body, [CONTENT_W], "A4 1단 = 전체폭 54202(예전과 동일)");
  for (const r of [R.b4OneCol, R.b4OneColCompact]) {
    assert.equal(r.contentW % 4, 0, `${r.name}: B4 전체폭 ${r.contentW} 는 4의 배수(회귀 계기)`);
    const { first, body } = bodyWidthsOf(r);
    assert.deepEqual(body, [r.contentW - 1], `${r.name}: 본문 = 전체폭 − 1`);
    assert.deepEqual(first, [r.contentW - 1], `${r.name}: 첫 내용 문단(secPr) = 전체폭 − 1`);
  }
  for (const r of [R.segFull, R.b4SegFull]) {
    const { first, body } = bodyWidthsOf(r);
    assert.deepEqual(body, [r.contentW], `${r.name}: HWPX_LINESEG_WIDTH=full = 예전 전체폭`);
    assert.deepEqual(first, [r.contentW], `${r.name}: full 첫 문단도 예전 전체폭`);
  }
});

// ── applyKeepPolicy 직접 호출(고객 시험지에서 한 번도 켜지지 않은 가지 고정) ──────────────────────
const F = (kwn, kl) => ({ kwn, kl });

test("T12 빈 간격 문단 잇기: 라벨 뒤 빈 문단은 최대 2개까지 사슬을 잇는다", () => {
  const b2 = R.policy.bridge2;
  assert.deepEqual(b2.flags, [F(true, true), F(true, false), F(true, false), F(false, false)]);
  assert.equal(b2.stats.chains, 1);
  const b3 = R.policy.bridge3;
  assert.deepEqual(b3.flags, [F(true, true), F(true, false), F(true, false), F(false, false), F(false, false)], "세 번째 빈 문단은 잇지 않는다");
});

test("T12b 강제 나눔 가드: 다음 블록이 쪽/단 나눔이면 kwn 을 뗀다(빈 문단 잇기도 거기서 멈춘다)", () => {
  const bb = R.policy.bridgeBreak;
  assert.deepEqual(bb.flags, [F(false, true), F(false, false), F(false, false)]);
  assert.equal(bb.stats.breakConflicts, 1);
  const ob = R.policy.optionBreak;
  assert.deepEqual(ob.flags, [F(false, true), F(true, true), F(false, true)], "단 나눔 선지 앞 선지만 kwn 을 잃는다");
  assert.equal(ob.stats.breakConflicts, 1);
});

test("T12c 한 단보다 긴 keepLines 문단은 kl 을 떼고, 그 앞 머리는 kwn 을 지킨다(첫 몇 줄만 셈)", () => {
  const h = R.policy.hugeOption;
  assert.equal(h.stats.droppedKeepLines, 1);
  assert.equal(h.stats.cappedChains, 0);
  assert.deepEqual(h.flags, [F(true, true), F(false, false)]);
});
