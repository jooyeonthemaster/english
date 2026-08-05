import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

// ============================================================================
// AI 지문 생성 — 마크다운 레인(스트리밍) 파서·어댑터 계약
//
// 이 레인이 존재하는 이유: 사고/집필을 실시간으로 흘리려면 델타가 사람이 읽는
// 텍스트여야 한다(JSON 델타는 화면에 못 흘린다). 그 대가로 "형식을 지켰는가"의
// 책임이 스키마 검증기에서 **파서**로 넘어왔다. 그래서 아래 표가 필요하다.
//
// 검증 대상
//  1) 정상 출력 → 전 필드
//  2) 부분 수신 중간 상태(설계만 / 본문 도중) → throw 없이 빈 칸
//  3) 라벨 누락(본문: 없음) → 영어 덩어리 구제
//  4) 섹션 순서 뒤바뀜 → 같은 결과
//  5) 빈 필드·'없음' 목록 → 빈 배열
//  6) 중복 라벨 → 첫 벌만 채택(본문이 두 배가 되지 않는다)
//  7) 코드펜스 전체 감싸기 / 문단 접힘 / 제목 에코
//  8) 어댑터 하드 게이트(빈 본문·비영어·분량) → ok:false (호출부가 JSON 레인 폴백)
//  9) 어댑터 메타 폴백 → 절대 실패시키지 않는다(과금 원칙)
// 10) 골격 코드가 쓰레기면 **배정된 골격**으로 되돌린다(카드 뱃지 = 실제 배분)
// ============================================================================

const harnessSource = String.raw`
import parserMod from "@/lib/passage-authoring/md/parser";
import adapterMod from "@/lib/passage-authoring/md/adapter";
import schemaMod from "@/lib/passage-authoring/schema";

const { parseAuthoredMd, parseLabelList, normalizeAuthoredPassage } = parserMod as any;
const { adaptAuthoredMdToItem, authoringEnvelopeViolations } = adapterMod as any;
const { authoringRequestSchema } = schemaMod as any;

const BODY = [
  "Urban regulation treats quiet as the residue of controlled noise, a leftover that appears once every measurable source has been pushed below its permitted ceiling.",
  "The instruments involved are honest about what they measure: a decibel meter registers pressure, and an ordinance written around that reading can only ever forbid excess.",
  "What such a rule cannot express is the condition under which attention recovers, which depends less on the loudness of a street than on the predictability of its interruptions.",
  "Planners inherit the same blind spot when they allocate acoustic space, treating silence as the gap between regulated sounds rather than as something a district must be built to produce.",
  "The cost of that inheritance becomes visible in neighbourhoods that satisfy every threshold and still exhaust the people who live in them.",
  "Quiet, on this reading, is not the absence that regulation leaves behind but an infrastructural good, and thresholds are the wrong instrument for supplying it.",
].join(" ");

const PLAN_SECTION = [
  "## 설계",
  "골격: S10",
  "접지: b",
  "논지: Public quiet is administered as an absence rather than as a resource.",
  "근거1: Ordinances measure pressure, not the conditions under which attention recovers.",
  "근거2: Acoustic planning treats silence as leftover space between regulated sounds.",
  "전환: The cost surfaces where every threshold is met and the district still exhausts people.",
  "마무리: Quiet is re-described as an infrastructural good that thresholds cannot supply.",
].join("\n");

const META_SECTION = [
  "## 메타",
  "소재: 도시 소음 규제",
  "요약: 도시가 정적을 자원이 아니라 잔여물로 다루는 방식을 설명하는 글",
  "설명: ① S10 골격으로 썼고 다섯째 문장에서 비용이 드러납니다. ② 논지는 첫 문장이고 둘째·넷째 문장이 떠받칩니다. ③ 빈칸 문항을 내기 좋고 근거는 마지막 문장에 있습니다.",
  "어법: 분사구문, 관계대명사 what",
  "단어: threshold, residue",
].join("\n");

const PASSAGE_SECTION = ["## 지문", "제목: The Administration of Quiet", "본문:", BODY].join("\n");

const FULL = [PLAN_SECTION, "", PASSAGE_SECTION, "", META_SECTION].join("\n");

// 2) 부분 수신 — 설계만 도착
const PARTIAL_PLAN_ONLY = [PLAN_SECTION, "", "## 지문", "제목: The Admin"].join("\n");
// 2b) 부분 수신 — 본문 도중에서 끊김(메타 없음)
const PARTIAL_MID_BODY = [
  PLAN_SECTION,
  "",
  "## 지문",
  "제목: The Administration of Quiet",
  "본문:",
  "Urban regulation treats quiet as the residue of controlled noise, a leftover that appears once every measurable",
].join("\n");

// 3) 라벨 누락 — 본문: 이 없다
const NO_BODY_LABEL = [
  PLAN_SECTION,
  "",
  "## 지문",
  "제목: The Administration of Quiet",
  "",
  BODY,
  "",
  META_SECTION,
].join("\n");

// 4) 순서 뒤바뀜 — 메타 → 지문 → 설계
const SHUFFLED = [META_SECTION, "", PASSAGE_SECTION, "", PLAN_SECTION].join("\n");

// 5) 빈 필드 / '없음'
const EMPTY_META = [
  PLAN_SECTION,
  "",
  PASSAGE_SECTION,
  "",
  "## 메타",
  "소재:",
  "요약:",
  "설명:",
  "어법: 없음",
  "단어: none",
].join("\n");

// 6) 중복 라벨 — 두 번째 본문은 버린다
const DUPLICATE_BODY = [
  PASSAGE_SECTION,
  "",
  "본문:",
  "This second body must be discarded entirely because a duplicate label restarts nothing at all here.",
].join("\n");

// 7a) 코드펜스로 전체를 감쌌다
const FENCED = ["'''markdown".replace(/'/g, String.fromCharCode(96)), FULL, "'''".replace(/'/g, String.fromCharCode(96))].join("\n");
// 7b) 문단 접힘 + 제목 에코
const WRAPPED_BODY = [
  "## 지문",
  "제목: The Administration of Quiet",
  "본문:",
  "The Administration of Quiet",
  "Urban regulation treats quiet as the residue of controlled noise,",
  "a leftover that appears once every measurable source has been pushed",
  "below its permitted ceiling.",
  "",
  "A second block stays a second block.",
].join("\n");

// 8) 하드 게이트 재료
const SHORT_BODY = ["## 지문", "제목: Too Short", "본문:", "Quiet is administered as an absence rather than as a resource, and thresholds cannot supply it."].join("\n");
const KOREAN_BODY = ["## 지문", "제목: Not English", "본문:", "이 지문은 통째로 한국어로 작성되어 있으며 영어 문장이 하나도 들어 있지 않습니다. 자료가 한국어일 때 실제로 관측된 실패 모드입니다."].join("\n");
const GARBAGE_SKELETON = [
  "## 설계",
  "골격: 없음(자유)",
  "접지: option b please",
  "논지: Public quiet is administered as an absence.",
  "근거1: a",
  "근거2: b",
  "전환: c",
  "마무리: d",
  "",
  PASSAGE_SECTION,
].join("\n");

const request = authoringRequestSchema.parse({ instruction: "조용함에 대한 지문" });
const ctx = {
  request,
  materials: [],
  skeleton: "S3",
  perMaterialCharsSent: {},
};

const full = parseAuthoredMd(FULL);
const adaptedFull = adaptAuthoredMdToItem(full, ctx);
const adaptedShort = adaptAuthoredMdToItem(parseAuthoredMd(SHORT_BODY), ctx);
const adaptedKorean = adaptAuthoredMdToItem(parseAuthoredMd(KOREAN_BODY), ctx);
const adaptedEmptyBody = adaptAuthoredMdToItem(parseAuthoredMd("## 설계"), ctx);
const adaptedEmptyMeta = adaptAuthoredMdToItem(parseAuthoredMd(EMPTY_META), ctx);
const adaptedGarbageSkeleton = adaptAuthoredMdToItem(parseAuthoredMd(GARBAGE_SKELETON), ctx);

process.stdout.write(JSON.stringify({
  full,
  partialPlanOnly: parseAuthoredMd(PARTIAL_PLAN_ONLY),
  partialMidBody: parseAuthoredMd(PARTIAL_MID_BODY),
  noBodyLabel: parseAuthoredMd(NO_BODY_LABEL),
  shuffled: parseAuthoredMd(SHUFFLED),
  emptyMeta: parseAuthoredMd(EMPTY_META),
  duplicateBody: parseAuthoredMd(DUPLICATE_BODY),
  fenced: parseAuthoredMd(FENCED),
  wrappedBody: parseAuthoredMd(WRAPPED_BODY),
  empty: parseAuthoredMd(""),
  labelLists: {
    plain: parseLabelList("분사구문, 관계대명사 what"),
    none: parseLabelList("없음"),
    dash: parseLabelList("-"),
    dupes: parseLabelList("threshold, Threshold, residue"),
    multiline: parseLabelList(["분사구문", "도치"].join("\n")),
  },
  normalized: normalizeAuthoredPassage(["**One** line", "wrapped here.", "", "# Second block"].join("\n")),
  adaptedFull,
  adaptedShort,
  adaptedKorean,
  adaptedEmptyBody,
  adaptedEmptyMeta,
  adaptedGarbageSkeleton,
  envelopeShort: authoringEnvelopeViolations(
    { words: 40, sentences: 3, avgSentenceWords: 13, longestSentenceWords: 18, paragraphs: 1, targetDeltaPercent: -75, sentenceLengthCv: 0.3, sentenceSpanWords: 10, shortestSentenceWords: 8, connectiveDensity: 0, nominalRatioPercent: 4 },
    request,
  ),
  targetWords: request.spec.targetWords,
  bodyText: BODY,
}));
`;

function runHarness() {
  const tmpDir = path.join(repoRoot, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".passage-authoring-md-parser-harness.mts");
  try {
    writeFileSync(harnessPath, harnessSource, "utf8");
    const raw = execSync(`npx tsx "${harnessPath}"`, {
      cwd: repoRoot,
      encoding: "utf8",
      env: { ...process.env, NODE_OPTIONS: "" },
    });
    return JSON.parse(raw);
  } finally {
    try {
      rmSync(harnessPath);
    } catch {
      /* 임시 파일 정리 실패는 테스트 결과와 무관하다 */
    }
  }
}

const result = runHarness();

test("정상 출력 — 설계·지문·메타 전 필드를 읽는다", () => {
  const { full, bodyText } = result;
  assert.equal(full.plan.skeleton, "S10");
  assert.equal(full.plan.grounding, "b");
  assert.match(full.plan.thesis, /Public quiet is administered/);
  assert.match(full.plan.warrantA, /Ordinances measure pressure/);
  assert.match(full.plan.warrantB, /Acoustic planning/);
  assert.match(full.plan.turn, /threshold is met/);
  assert.match(full.plan.closingMove, /infrastructural good/);
  assert.equal(full.title, "The Administration of Quiet");
  assert.equal(full.passage, bodyText);
  assert.equal(full.topicLabel, "도시 소음 규제");
  assert.match(full.koreanSummary, /잔여물로 다루는/);
  assert.match(full.rationale, /S10 골격/);
  assert.deepEqual(full.usedGrammarPoints, ["분사구문", "관계대명사 what"]);
  assert.deepEqual(full.usedWords, ["threshold", "residue"]);
});

test("부분 수신 — 설계만 도착해도 throw 없이 빈 본문", () => {
  const { partialPlanOnly } = result;
  assert.equal(partialPlanOnly.plan.skeleton, "S10");
  assert.equal(partialPlanOnly.title, "The Admin");
  assert.equal(partialPlanOnly.passage, "");
  assert.deepEqual(partialPlanOnly.usedWords, []);
});

test("부분 수신 — 본문 도중에서 끊겨도 받은 만큼 읽는다", () => {
  const { partialMidBody } = result;
  assert.match(partialMidBody.passage, /^Urban regulation treats quiet/);
  assert.equal(partialMidBody.koreanSummary, "");
  assert.equal(partialMidBody.rationale, "");
});

test("라벨 누락 — 본문: 이 없으면 영어 덩어리로 구제한다", () => {
  const { noBodyLabel, bodyText } = result;
  assert.equal(noBodyLabel.passage, bodyText);
  assert.equal(noBodyLabel.title, "The Administration of Quiet");
  assert.equal(noBodyLabel.topicLabel, "도시 소음 규제");
});

test("순서 뒤바뀜 — 섹션 머리는 장식이라 결과가 같다", () => {
  const { shuffled, full } = result;
  assert.equal(shuffled.passage, full.passage);
  assert.equal(shuffled.plan.skeleton, full.plan.skeleton);
  assert.equal(shuffled.koreanSummary, full.koreanSummary);
  assert.deepEqual(shuffled.usedGrammarPoints, full.usedGrammarPoints);
});

test("빈 필드·'없음' 목록 — 빈 문자열/빈 배열이 되고 본문은 살아 있다", () => {
  const { emptyMeta, bodyText } = result;
  assert.equal(emptyMeta.passage, bodyText);
  assert.equal(emptyMeta.topicLabel, "");
  assert.equal(emptyMeta.koreanSummary, "");
  assert.equal(emptyMeta.rationale, "");
  assert.deepEqual(emptyMeta.usedGrammarPoints, []);
  assert.deepEqual(emptyMeta.usedWords, []);
});

test("중복 라벨 — 첫 벌만 채택해 본문이 두 배가 되지 않는다", () => {
  const { duplicateBody, bodyText } = result;
  assert.equal(duplicateBody.passage, bodyText);
  assert.ok(!duplicateBody.passage.includes("must be discarded"));
});

test("코드펜스로 전체를 감싸도 그대로 읽는다", () => {
  const { fenced, full } = result;
  assert.equal(fenced.passage, full.passage);
  assert.equal(fenced.plan.skeleton, "S10");
});

test("문단 접힘·제목 에코 — 한 문단은 한 줄로 펴고 빈 줄만 문단 경계로 남긴다", () => {
  const { wrappedBody } = result;
  assert.ok(!wrappedBody.passage.startsWith("The Administration of Quiet"));
  assert.match(wrappedBody.passage, /^Urban regulation treats quiet as the residue of controlled noise, a leftover/);
  assert.equal(wrappedBody.passage.split("\n\n").length, 2);
  assert.ok(!wrappedBody.passage.split("\n\n")[0].includes("\n"));
});

test("빈 입력 — 전 칸이 비고 아무것도 던지지 않는다", () => {
  const { empty } = result;
  assert.equal(empty.passage, "");
  assert.equal(empty.title, "");
  assert.equal(empty.plan.skeleton, "");
  assert.deepEqual(empty.usedWords, []);
});

test("목록 파싱 — 구분자·중복·'없음' 처리", () => {
  const { labelLists } = result;
  assert.deepEqual(labelLists.plain, ["분사구문", "관계대명사 what"]);
  assert.deepEqual(labelLists.none, []);
  assert.deepEqual(labelLists.dash, []);
  assert.deepEqual(labelLists.dupes, ["threshold", "residue"]);
  assert.deepEqual(labelLists.multiline, ["분사구문", "도치"]);
});

test("본문 정규화 — 마크다운 잔재를 벗기고 문단 경계만 남긴다", () => {
  assert.equal(result.normalized, "One line wrapped here.\n\nSecond block");
});

test("어댑터 — 정상 출력은 지표·커버리지를 서버가 채워 결과 아이템이 된다", () => {
  const { adaptedFull, targetWords } = result;
  assert.equal(adaptedFull.ok, true);
  assert.deepEqual(adaptedFull.issues, []);
  const item = adaptedFull.item;
  assert.equal(item.title, "The Administration of Quiet");
  assert.ok(item.metrics.words > Math.floor(targetWords * 0.6));
  assert.ok(item.metrics.sentences >= 5);
  assert.equal(item.metrics.paragraphs, 1);
  // 커버리지는 자료가 없으면 표제어 배열이 비고 비율은 null 이다(모른다).
  assert.deepEqual(item.coverage.words, []);
  assert.equal(item.coverage.wordCoveragePercent, null);
  assert.deepEqual(item.coverage.grammarPoints, ["분사구문", "관계대명사 what"]);
  assert.deepEqual(item.usedMaterialIds, []);
  assert.equal(item.plan.skeleton, "S10");
  assert.equal(item.plan.grounding, "b");
});

test("어댑터 하드 게이트 — 분량 미달·비영어·빈 본문은 ok:false (JSON 레인 폴백 신호)", () => {
  const { adaptedShort, adaptedKorean, adaptedEmptyBody } = result;
  assert.equal(adaptedShort.ok, false);
  assert.match(adaptedShort.issues[0], /분량이 범위를 벗어/);
  assert.equal(adaptedShort.item, undefined);

  assert.equal(adaptedKorean.ok, false);
  assert.match(adaptedKorean.issues[0], /영어가 아닙니다/);

  assert.equal(adaptedEmptyBody.ok, false);
  assert.match(adaptedEmptyBody.issues[0], /비어 있습니다/);
});

test("어댑터 — 메타가 비어도 절대 실패시키지 않고 결정론 폴백으로 채운다", () => {
  const { adaptedEmptyMeta } = result;
  assert.equal(adaptedEmptyMeta.ok, true);
  assert.ok(adaptedEmptyMeta.item.koreanSummary.length > 0);
  assert.ok(adaptedEmptyMeta.item.rationale.length > 0);
  assert.match(adaptedEmptyMeta.item.rationale, /자동으로 채운 문구/);
  assert.deepEqual(adaptedEmptyMeta.item.coverage.grammarPoints, []);
});

test("어댑터 — 골격 코드가 카탈로그 밖이면 배정된 골격으로 되돌린다", () => {
  const { adaptedGarbageSkeleton } = result;
  assert.equal(adaptedGarbageSkeleton.ok, true);
  assert.equal(adaptedGarbageSkeleton.item.plan.skeleton, "S3");
  assert.equal(adaptedGarbageSkeleton.item.plan.grounding, "b");
});

test("봉투 위반 — 분량 미달이 프롬프트에 실을 영어 문장으로 나온다", () => {
  const { envelopeShort } = result;
  assert.ok(envelopeShort.length > 0);
  assert.ok(envelopeShort.some((line) => /under the required/.test(line)));
});
