import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

// 웹툰 v2 결정론 모듈(webtoon-storyboard/{rules,validate,compile}, webtoon-models,
// webtoon-errors) 단위 테스트. TS + `@/...` 앨리어스 → tsx 하니스로 실행해 JSON 을
// 받는다(webtoon-prompt-subject.test.mjs 패턴 미러). 픽스처는 이 파일에 평문 JSON
// 으로 두고 하니스에 그대로 주입한다 — 단언은 전부 이 파일에서 한다.

import {
  CAST, SKELETON, KO_CAPTIONS, KO_LINES, EN_LINES, EN_CAPTIONS, LETTERING, cleanBoard, mut, koT, vis,
} from "./webtoon-storyboard-fixtures.mjs";

// ── 검증 케이스: [콘티, opts] ────────────────────────────────────────────────
const [K, KE, E] = ["KO", "KO_EN", "EN"].map((language) => ({ language, targetPanels: 6 }));
const setCap = (i, text) => (sb) => { sb.panels[i].caption = text; };
const setBubble = (i, field, value) => (sb) => { sb.panels[i].bubbles[0][field] = value; };
// 셋째 칸: null = 위반 0(음성 대조군) · 정규식 = 그 위반 "정확히 1건" · "fatal" = 구조 결함(별도 테스트)
const VALIDATE = {
  // 음성 대조군 — 모든 언어 모드에서 0건이어야 검증기가 "항상 빨강"이 아님이 증명된다.
  clean_ko: [cleanBoard("KO"), K, null],
  clean_ko_key: [cleanBoard("KO"), { language: "KO_KEY", targetPanels: 6 }, null],
  clean_ko_en: [cleanBoard("KO_EN"), KE, null],
  clean_en: [cleanBoard("EN"), E, null],
  clean_en_ko_gloss: [mut("KO_EN", (sb) => sb.panels.forEach((p) => p.bubbles.forEach((b) => { b.translation = ""; }))), { language: "EN_KO_GLOSS", targetPanels: 6 }, null],
  ecu_counts_as_close: [mut("KO", (sb) => { sb.panels[2].shot = "extreme_close_up"; }), K, null],
  two_large_ok: [mut("KO", (sb) => { sb.panels[0].size = "large"; }), K, null],
  bubbles_exactly_half: [mut("KO", (sb) => { sb.panels[5].bubbles = []; }), K, null],
  four_panels_no_insert: [mut("KO", (sb) => { sb.panels = [0, 1, 2, 4].map((i) => sb.panels[i]); }), { language: "KO", targetPanels: 4 }, null],
  cap_half_22: [mut("KO", setCap(1, koT(22))), K, null],
  cap_wide_25: [mut("KO", setCap(0, koT(25))), K, null], // 같은 25자가 반 컷(cap_half_25)에선 위반
  cap_wide_34: [mut("KO", setCap(0, koT(34))), K, null],
  cap_large_34: [mut("KO", setCap(4, koT(34))), K, null],
  bubble_16: [mut("KO", setBubble(1, "text", koT(16))), K, null],
  en_words_8: [mut("KO_EN", setBubble(1, "text", "We can all share our old books now")), KE, null],
  // 결함 주입 — 각각 정확히 1건만 잡혀야 한다.
  same_shot: [mut("KO", (sb) => { sb.panels[5].shot = "medium_close_up"; }), K, /^5컷과 6컷의 shot 이 둘 다 medium_close_up 이다/],
  no_close_up: [mut("KO", (sb) => { sb.panels[2].shot = "medium_close_up"; }), K, /close_up 또는 extreme_close_up 컷이 없다/],
  no_insert: [mut("KO", (sb) => { sb.panels[3].shot = "wide"; }), K, /insert 컷이 없다/],
  no_large: [mut("KO", (sb) => { sb.panels[4].size = "wide"; }), K, /size "large" 가 1개 필요하다/],
  three_large: [mut("KO", (sb) => { for (const i of [0, 3, 4]) sb.panels[i].size = "large"; }), K, /size "large" 가 3개다\(최대 2개\)/],
  last_half: [mut("KO", (sb) => { sb.panels[5].size = "half"; }), K, /^마지막 컷은 "wide" 또는 "large" 여야 한다/],
  few_bubbles: [mut("KO", (sb) => { sb.panels[4].bubbles = []; sb.panels[5].bubbles = []; }), K, /말풍선 있는 컷이 2\/6컷이다/],
  wrong_count: [cleanBoard("KO"), { language: "KO", targetPanels: 7 }, /^컷 수가 6개다\. 정확히 7컷이어야 한다/],
  empty_composition: [mut("KO", (sb) => { sb.panels[0].composition = ""; }), K, /^1컷 composition\/action 이 비어 있다/],
  cap_half_23: [mut("KO", setCap(1, koT(23))), K, /^2컷 캡션이 23자다\(상한 22자\)/],
  cap_half_25: [mut("KO", setCap(1, koT(25))), K, /^2컷 캡션이 25자다\(상한 22자\)/],
  cap_wide_35: [mut("KO", setCap(0, koT(35))), K, /^1컷 캡션이 35자다\(상한 34자\)/],
  bubble_17: [mut("KO", setBubble(1, "text", koT(17))), K, /^2컷 말풍선이 17자다\(상한 16자\)/],
  en_words_9: [mut("KO_EN", setBubble(1, "text", "We can all share our old books with kids")), KE, /^2컷 영어 말풍선이 9단어다\(상한 8단어\)/],
  en_caption_hangul: [mut("EN", setCap(0, "Monday morning at the 도서관.")), E, /^1컷 캡션은 영어여야 하는데 한국어가 섞였다/],
  en_bubble_hangul: [mut("EN", setBubble(1, "text", "What is 이거?")), E, /^2컷 말풍선은 영어여야 하는데 한국어가 섞였다/],
  ko_en_bubble_hangul: [mut("KO_EN", setBubble(1, "text", "이거 뭐야?")), KE, /^2컷 말풍선은 영어여야 하는데 한국어가 섞였다/],
  empty_translation: [mut("KO_EN", setBubble(1, "translation", "")), KE, /^2컷 말풍선 번역\(translation\)이 비어 있다/],
  long_translation: [mut("KO_EN", setBubble(1, "translation", koT(17))), KE, /^2컷 말풍선 번역이 17자다\(상한 16자\)/],
  page_over: [mut("KO", (sb) => sb.panels.forEach((p) => {
    p.caption = koT(p.size === "half" ? 22 : 34); // 컷별 상한 꽉 채움(개별 위반 0) → 합계 372
    p.bubbles = [0, 1].map(() => ({ speaker: "민지", kind: "speech", text: koT(16), translation: "" }));
  })), K, /^페이지 전체 글자가 372자다\(상한 300자\)/],
  fatal_three_panels: [mut("KO", (sb) => { sb.panels = sb.panels.slice(0, 3); }), K, "fatal"],
  fatal_no_cast: [mut("KO", (sb) => { sb.cast = []; }), K, "fatal"],
};

// ── 정규화 입력(snake_case 와이어) ──────────────────────────────────────────
const WIRE = {
  title: "  도서관의 기적 🎉 ", logline_ko: "기부된 책\n상자 이야기", key_message_ko: "나눔은 이어진다",
  world: "Library", palette: "Warm", art_notes: "Cute, big letters",
  cast: [ // 이름/외형 빈 행·비객체는 버리고, 유효 4명 중 앞 3명만 남아야 한다
    { name: "민지", role: "주인공", appearance: "girl with a yellow hairpin" }, { name: "", role: "x", appearance: "nameless" },
    { name: "유령", role: "x", appearance: "" }, { name: "준호", role: "친구", appearance: "boy with glasses" },
    { name: "하나", role: "x", appearance: "a" }, { name: "두리", role: "x", appearance: "b" }, "not-an-object",
  ],
  panels: [
    {
      beat: "climax!!", shot: "dolly_zoom", angle: "sideways", size: "giant", sfx: "쾅!",
      composition: "  Two   kids\tat a desk ", action: "Waving ✋", setting: "", mood: "", caption: "좋은 아침 ☀️ 여러분",
      key_phrase: "share books", source_excerpt: "Books are shared.",
      bubbles: [ // 빈 말풍선 제거가 2개 컷보다 먼저 → [첫 번째, 두 번째]
        { speaker: "민지", kind: "yell", text: "첫 번째 😀" }, { speaker: "준호", kind: "shout", text: "   " },
        { speaker: "준호", kind: "whisper", text: "두 번째", translation: "second" }, { speaker: "민지", kind: "speech", text: "세 번째" }, 42,
      ],
    },
    { beat: "hook", shot: "insert", angle: "pov", size: "large", composition: "c", action: "a", keyPhrase: "camelCase ok", sourceExcerpt: "legacy key" },
    "junk panel",
  ],
};
const halfBoard = (sizes) => ({ cast: [CAST[0]], panels: sizes.map((size) => ({ size, shot: "medium", composition: "c", action: "a" })) });
const NORMALIZE = {
  wire: WIRE,
  overflow: { cast: [], panels: Array.from({ length: 11 }, (_, i) => ({ caption: `c${i}` })) },
  oddHalves: halfBoard(["wide", "half", "half", "half", "large", "wide"]),
  emojiResidue: { cast: [], title: "선생님 👩‍🏫 등장", panels: [{ caption: "1️⃣ 번 문제 ⭐ 알람 ⏰" }] },
};
const NORMALIZE_NULL = [null, "storyboard", [], {}, { panels: [] }, { panels: ["x", 1, null] }];

const FIX_HALVES = [
  [["half"], ["wide"]],
  [["half", "half"], ["half", "half"]],
  [["half", "half", "half"], ["half", "half", "wide"]],
  [["wide", "half", "large", "half", "half"], ["wide", "wide", "large", "half", "half"]],
  [["half", "half", "half", "half"], ["half", "half", "half", "half"]],
  [["half", "half", "half", "half", "half"], ["half", "half", "half", "half", "wide"]],
  [["half", "wide", "half", "half", "half", "wide"], ["wide", "wide", "half", "half", "wide", "wide"]],
];

// ── 컴파일 입력 ─────────────────────────────────────────────────────────────
const eight = mut("KO", (sb) => { sb.panels.push(...structuredClone(sb.panels.slice(0, 2))); });
const quirks = mut("KO", (sb) => {
  sb.artNotes = "Big, clean letters";
  sb.panels[0].caption = '민지가 "왜?"라고 물었다';
  Object.assign(sb.panels[3], { caption: "", sfx: "", bubbles: [] });
  sb.panels[5].bubbles[0].speaker = "Narrator";
});
const COMPILE = {
  ko: { storyboard: cleanBoard("KO"), style: "KOREAN_WEBTOON", language: "KO" },
  koAgain: { storyboard: cleanBoard("KO"), style: "KOREAN_WEBTOON", language: "KO" },
  bogusStyle: { storyboard: cleanBoard("KO"), style: "NOT_A_STYLE", language: "KO" },
  koEn: { storyboard: cleanBoard("KO_EN"), style: "KOREAN_WEBTOON", language: "KO_EN" },
  koEnAsEn: { storyboard: cleanBoard("KO_EN"), style: "KOREAN_WEBTOON", language: "EN" },
  en: { storyboard: cleanBoard("EN"), style: "GHIBLI", language: "EN" },
  eight: { storyboard: eight, style: "KOREAN_WEBTOON", language: "KO" },
  quirks: { storyboard: quirks, style: "KOREAN_WEBTOON", language: "KO" },
};

// ── 실패 메시지 원문(실제 openrouter-image.ts 가 던지는 형식) ─────────────────
const ERRORS = {
  safety: "OpenRouter image generation failed (400): Your request was rejected by the safety system.",
  moderation: "OpenRouter returned no image data: {\"error\":\"content_policy_violation: flagged by moderation\"}",
  timeout: "OpenRouter image generation timed out after 280s",
  aborted: "This operation was aborted",
  credits402: "OpenRouter image generation failed (402): Insufficient credits. Add more using https://openrouter.ai/settings/credits",
  rate429: "OpenRouter image generation failed (429): Rate limit exceeded",
  stale: "stale GENERATING row reaped",
  interrupted: "작업이 중단되었습니다",
  other: "OpenRouter image request failed: fetch failed",
  empty: "",
};

const INPUT = { VALIDATE: Object.fromEntries(Object.entries(VALIDATE).map(([k, [sb, opts]]) => [k, [sb, opts]])), NORMALIZE, NORMALIZE_NULL, FIX_HALVES: FIX_HALVES.map(([i]) => i), COMPILE, ERRORS };

// 하니스는 String.raw — 정규식 백슬래시를 그대로 둔다. `${...}` 치환(INPUT JSON)은
// 원문 그대로 삽입되므로 JSON 이스케이프가 보존된다. 하니스 안에는 백틱을 쓰지 않는다.
const harnessSource = String.raw`
// tsx 는 이 .ts 모듈들을 CommonJS 로 돌린다 → 기본 export 에서 이름을 꺼낸다.
import rulesMod from "@/lib/webtoon-storyboard/rules";
import validateMod from "@/lib/webtoon-storyboard/validate";
import compileMod from "@/lib/webtoon-storyboard/compile";
import stylesMod from "@/lib/webtoon-storyboard/styles";
import modelsMod from "@/lib/webtoon-models";
import errorsMod from "@/lib/webtoon-errors";
const { targetPanelCount, normalizeStoryboardLanguage, visibleLength, latinWordCount, countWords, captionBudget, TEXT_BUDGETS } = rulesMod;
const { normalizeStoryboard, fixUnpairedHalves, validateStoryboard, violationScore } = validateMod;
const { compileWebtoonImagePrompt, layoutRows } = compileMod;
const { styleBibleFor } = stylesMod;
const { planForModelId, resolveWebtoonImagePlan, WEBTOON_IMAGE_PLAN_LIST, DEFAULT_WEBTOON_IMAGE_PLAN } = modelsMod;
const { friendlyWebtoonError } = errorsMod;

const INPUT = ${JSON.stringify(INPUT)};
const map = (obj, fn) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, fn(v)]));
const enWords = (n) => Array.from({ length: n }, () => "word").join(" ");
const koChars = (n) => Array.from({ length: n }, (_, i) => (i % 10 === 9 ? "가 " : "가")).join("");
const planId = (id) => planForModelId(id)?.id ?? null;

const ko = INPUT.COMPILE.ko;
const koBefore = JSON.stringify(ko);
const koRepeat = [compileWebtoonImagePrompt(ko), compileWebtoonImagePrompt(ko)];
const odd = normalizeStoryboard(INPUT.NORMALIZE.oddHalves);

const out = {
  rules: {
    enTarget: [0, 1, 109, 110, 199, 200, 299, 300, 1000].map((n) => [n, targetPanelCount(enWords(n), false)]),
    koTarget: [0, 240, 241, 438, 439, 658, 659].map((n) => [n, targetPanelCount(koChars(n), true)]),
    subjectSwitch: [targetPanelCount("가".repeat(700), false), targetPanelCount("가".repeat(700), true)],
    lang: [["EN", true], ["KO_KEY", true], ["KO_KEY", false], ["KO_EN", false], ["EN", false], ["EN_KO_GLOSS", false], ["KO", false], ["en", false], ["BOGUS", false], [null, false], ["", false]]
      .map(([l, k]) => [l, k, normalizeStoryboardLanguage(l, k)]),
    langUndefined: normalizeStoryboardLanguage(undefined, false),
    visible: ["가 나\t다\n", "Hello, world!", "", "   ", "a  b  c"].map(visibleLength),
    latin: ["Don't stop — it's well-known!", "민지 said hi", "123 456", "", "rock’n’roll"].map(latinWordCount),
    words: ["  a  b\nc  ", "", "   ", "one"].map(countWords),
    budgets: TEXT_BUDGETS,
    captionKo: ["half", "wide", "large"].map((s) => captionBudget("KO", s)),
  },
  validate: map(INPUT.VALIDATE, ([sb, opts]) => validateStoryboard(sb, opts)),
  score: [violationScore({ violations: [], fatal: [] }), violationScore({ violations: ["a", "b"], fatal: ["x"] })],
  normalize: map(INPUT.NORMALIZE, (raw) => normalizeStoryboard(raw)),
  normalizeNull: INPUT.NORMALIZE_NULL.map((raw) => normalizeStoryboard(raw)),
  fixHalves: INPUT.FIX_HALVES.map((sizes) => {
    const panels = sizes.map((size) => ({ size }));
    const ret = fixUnpairedHalves(panels);
    return { sizes: panels.map((p) => p.size), returnedUndefined: ret === undefined };
  }),
  layout: [["half", "half", "half"], ["wide", "large"], ["half", "wide", "half"]].map((sizes) => layoutRows(sizes.map((size) => ({ size })))),
  compile: map(INPUT.COMPILE, (c) => compileWebtoonImagePrompt(c)),
  koRepeat,
  koMutated: JSON.stringify(ko) !== koBefore,
  promoted: { sizes: odd.panels.map((p) => p.size), prompt: compileWebtoonImagePrompt({ storyboard: odd, style: "KOREAN_WEBTOON", language: "KO" }) },
  styles: { korean: styleBibleFor("KOREAN_WEBTOON"), ghibli: styleBibleFor("GHIBLI") },
  models: {
    lookup: ["openai/gpt-image-2.5-flare", "openai/gpt-image-2.5-sunburst", "google/nano-banana-2/text-to-image-developer", "openai/gpt-image-2/text-to-image", "openai/gpt-image-2.5", "unknown/model", "", null].map((id) => [id, planId(id)]),
    lookupUndefined: planId(undefined),
    legacyEach: WEBTOON_IMAGE_PLAN_LIST.flatMap((p) => p.legacyModelIds.map((id) => [id, p.id, planId(id)])),
    resolve: [undefined, null, "", "bogus", "premium", 42, "STANDARD", "PREMIUM"].map((v) => resolveWebtoonImagePlan(v).id),
    defaultId: DEFAULT_WEBTOON_IMAGE_PLAN,
    plans: WEBTOON_IMAGE_PLAN_LIST.map((p) => ({ id: p.id, modelId: p.modelId, legacyModelIds: p.legacyModelIds, credits: p.credits, operationType: p.operationType, params: p.params, engineLabel: p.engineLabel, etaLabel: p.etaLabel })),
  },
  errors: map(INPUT.ERRORS, (raw) => friendlyWebtoonError(raw)),
};
process.stdout.write(JSON.stringify(out));
`;

function runHarness() {
  const tmpDir = path.join(repoRoot, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, `.webtoon-storyboard-harness-${process.pid}.mts`);
  try {
    writeFileSync(harnessPath, harnessSource, "utf8");
    // Windows 는 npx 가 npx.cmd 뿐이라 셸 경유 단일 문자열로 실행한다.
    const raw = execSync(`npx tsx "${harnessPath}"`, {
      cwd: repoRoot,
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
      env: { ...process.env, NODE_OPTIONS: "" },
    });
    return JSON.parse(raw);
  } finally {
    try { rmSync(harnessPath); } catch { /* ignore */ }
  }
}

const R = runHarness();
const count = (hay, needle) => hay.split(needle).length - 1;
const q = (t) => `"${t}"`;

test("fixtures: 글자 수 헬퍼가 주장대로 센다(픽스처 자체 검증)", () => {
  for (const n of [16, 17, 22, 23, 25, 34, 35]) assert.equal(vis(koT(n)), n);
});

test("rules: targetPanelCount 영어 단어 수 경계 5/6/7/8", () => {
  assert.deepEqual(R.rules.enTarget, [[0, 5], [1, 5], [109, 5], [110, 6], [199, 6], [200, 7], [299, 7], [300, 8], [1000, 8]]);
});

test("rules: targetPanelCount 국어 경로(공백 제외 글자/2.2 반올림) + 과목 플래그가 경로를 바꾼다", () => {
  assert.deepEqual(R.rules.koTarget, [[0, 5], [240, 5], [241, 6], [438, 6], [439, 7], [658, 7], [659, 8]]);
  // 공백 없는 한글 700자: 영어 경로=1단어→5, 국어 경로=round(700/2.2)=318→8
  assert.deepEqual(R.rules.subjectSwitch, [5, 8]);
});

test("rules: normalizeStoryboardLanguage — 국어는 무조건 KO, 미지 값은 KO, 5모드 통과", () => {
  for (const [l, k, got] of R.rules.lang) {
    const want = k ? "KO" : ["KO_KEY", "KO_EN", "EN", "EN_KO_GLOSS"].includes(l) ? l : "KO";
    assert.equal(got, want, `(${l}, ${k})`); // ("KO_KEY", false) → KO_KEY 포함
  }
  assert.equal(R.rules.langUndefined, "KO");
});

test("rules: visibleLength / latinWordCount / countWords", () => {
  assert.deepEqual(R.rules.visible, [3, 12, 0, 0, 3]);
  // Don't · stop · it's · well-known = 4 / said · hi = 2 / 숫자 0 / 빈 0 / 굽은 따옴표 결합 1
  assert.deepEqual(R.rules.latin, [4, 2, 0, 0, 1]);
  assert.deepEqual(R.rules.words, [3, 0, 0, 1]);
});

test("rules: 반 컷 캡션 상한 < 전폭 상한(전 모드), 번역 상한은 KO_EN 전용", () => {
  for (const [lang, b] of Object.entries(R.rules.budgets)) {
    assert.ok(b.captionHalf < b.captionFull, `${lang}: half ${b.captionHalf} < full ${b.captionFull}`);
    assert.equal(b.translation > 0, lang === "KO_EN", `${lang}: translation budget`);
  }
  assert.deepEqual(Object.keys(R.rules.budgets).sort(), ["EN", "EN_KO_GLOSS", "KO", "KO_EN", "KO_KEY"]);
  assert.deepEqual(R.rules.captionKo, [22, 34, 34]);
});

test("validate: 음성 대조군 — 깨끗한 콘티는 5모드 전부 위반 0 / fatal 0", () => {
  const clean = Object.keys(VALIDATE).filter((k) => VALIDATE[k][2] === null);
  assert.equal(clean.length, 15);
  assert.deepEqual(new Set(clean.map((k) => VALIDATE[k][1].language)), new Set(["KO", "KO_KEY", "KO_EN", "EN", "EN_KO_GLOSS"]));
  for (const name of clean) assert.deepEqual(R.validate[name], { violations: [], fatal: [] }, name);
  assert.deepEqual(R.score, [0, 102]);
});

test("validate: 주입한 결함을 각각 정확히 1건으로 잡는다", () => {
  const defects = Object.entries(VALIDATE).filter(([, c]) => c[2] instanceof RegExp);
  assert.equal(defects.length, 20);
  for (const [name, [, , re]] of defects) {
    const { violations, fatal } = R.validate[name];
    assert.deepEqual(fatal, [], `${name}: fatal`);
    assert.equal(violations.length, 1, `${name}: ${JSON.stringify(violations)}`);
    assert.match(violations[0], re, name);
  }
});

test("validate: 구조 결함은 fatal 채널로 — 4컷 미만, cast 비어 있음", () => {
  assert.deepEqual(R.validate.fatal_three_panels.fatal, ["컷이 3개뿐이다(최소 4)."]);
  assert.deepEqual(R.validate.fatal_no_cast, { violations: [], fatal: ["cast 가 비어 있다."] });
  assert.deepEqual(R.validate.four_panels_no_insert.fatal, []); // 4컷은 경계 통과
});

test("normalize: snake_case 와이어 → 타입 콘티(enum 기본값, 이모지 제거, 말풍선 정리, 키 매핑)", () => {
  const { version, title, loglineKo, keyMessageKo, artNotes, cast, panels } = R.normalize.wire;
  assert.deepEqual({ version, title, loglineKo, keyMessageKo, artNotes }, {
    version: 1, title: "도서관의 기적", loglineKo: "기부된 책 상자 이야기", keyMessageKo: "나눔은 이어진다", artNotes: "Cute, big letters",
  });
  assert.deepEqual(cast.map((c) => c.name), ["민지", "준호", "하나"]);
  assert.equal(panels.length, 2); // 객체 아닌 컷 제거
  assert.deepEqual(panels[0], {
    beat: "development", shot: "medium", angle: "eye_level", size: "wide", // 미지 enum → 기본값
    composition: "Two kids at a desk", action: "Waving", setting: "", mood: "", caption: "좋은 아침 여러분",
    bubbles: [{ speaker: "민지", kind: "speech", text: "첫 번째", translation: "" }, { speaker: "준호", kind: "whisper", text: "두 번째", translation: "second" }],
    sfx: "쾅!", keyPhrase: "share books", sourceExcerpt: "Books are shared.",
  });
  const p1 = panels[1];
  assert.deepEqual([p1.beat, p1.shot, p1.angle, p1.size], ["hook", "insert", "pov", "large"]);
  assert.deepEqual([p1.keyPhrase, p1.sourceExcerpt, p1.caption, p1.bubbles], ["camelCase ok", "legacy key", "", []]);
});

test("normalize: 8컷 상한, 쓸 수 없는 구조는 null, 홀수 반 컷은 정규화 단계에서 승격", () => {
  assert.deepEqual(R.normalize.overflow.panels.map((p) => p.caption), ["c0", "c1", "c2", "c3", "c4", "c5", "c6", "c7"]);
  assert.deepEqual(R.normalizeNull, [null, null, null, null, null, null]);
  assert.deepEqual(R.normalize.oddHalves.panels.map((p) => p.size), ["wide", "half", "half", "wide", "large", "wide"]);
});

test("fixUnpairedHalves: 홀수 연속 → 마지막만 wide, 짝수 연속은 그대로(제자리 변경)", () => {
  FIX_HALVES.forEach(([input, want], i) => {
    assert.deepEqual(R.fixHalves[i].sizes, want, JSON.stringify(input));
    assert.equal(R.fixHalves[i].returnedUndefined, true);
  });
});

test("compile: layoutRows — 인접 half 만 한 행, 외톨이 half 는 전폭 행, 가중치", () => {
  assert.deepEqual(R.layout, [
    [{ panels: [0, 1], weight: 1 }, { panels: [2], weight: 1 }],
    [{ panels: [0], weight: 0.8 }, { panels: [1], weight: 1.45 }],
    [{ panels: [0], weight: 1 }, { panels: [1], weight: 0.8 }, { panels: [2], weight: 1 }],
  ]);
});

test("compile: 결정론 — 같은 입력은 바이트 동일, 입력 불변, 미지 화풍은 KOREAN_WEBTOON", () => {
  const { ko, koAgain, bogusStyle } = R.compile;
  for (const other of [koAgain, R.koRepeat[0], R.koRepeat[1], bogusStyle]) assert.equal(other, ko);
  assert.equal(R.koMutated, false);
  assert.ok(ko.includes(`ART STYLE: ${R.styles.korean}\n`));
  assert.ok(R.compile.en.includes(`ART STYLE: ${R.styles.ghibli}\n`));
});

/**
 * 프롬프트의 "Lettering:" 줄마다 인용된 글자를 복원한다. 긴 문자열은 컴파일러가 짧은 줄로
 * 미리 끊어 `N lines — "a" / "b"` 로 싣는다(26-09-30 폰 가독성 수리) — 줄들을 공백으로
 * 이으면 원문과 같아야 한다.
 */
const lettered = (prompt, prefix = "") =>
  [...prompt.matchAll(/^ {2}Lettering: .*$/gm)]
    .filter((m) => m[0].startsWith(`  Lettering: ${prefix}`))
    .map((m) => [...m[0].matchAll(/"([^"]*)"/g)].map((x) => x[1]).join(" "));

test("compile: 캡션·말풍선·효과음 글자는 곧은 큰따옴표 안에 정확히 1번씩(줄 나눔은 이으면 원문)", () => {
  for (const [name, lang] of [["ko", "KO"], ["koEn", "KO_EN"], ["en", "EN"]]) {
    const prompt = R.compile[name];
    const sb = cleanBoard(lang);
    const texts = sb.panels.flatMap((p) => [p.caption, p.sfx, ...p.bubbles.map((b) => b.text)]).filter(Boolean);
    assert.equal(texts.length, 9, `${name}: fixture text count`);
    const rendered = lettered(prompt);
    for (const t of texts) assert.equal(rendered.filter((r) => r === t).length, 1, `${name}: ${t}`);
  }
  const ko = R.compile.ko;
  assert.ok(ko.includes(`Lettering: white rounded speech bubble with a tail pointing to 민지: ${q(KO_LINES[1])}`));
  // 긴 말풍선은 줄마다 따로 인용된다.
  assert.ok(ko.includes("Lettering: spiky burst bubble with a tail pointing to 민지: 2 lines — "));
  assert.ok(ko.includes(`Lettering: Hand-lettered sound effect integrated into the art: ${q("툭")}`));
  assert.ok(ko.includes("- All lettering is Korean (Hangul)."));
  assert.ok(ko.includes("never draw the slash"));
});

test("compile: KO_EN 만 번역 자막 줄을 말풍선 바로 아래에 붙인다", () => {
  const { koEn, koEnAsEn, ko, en } = R.compile;
  const SUB = "Directly under that bubble, a cream subtitle strip with the Korean translation: ";
  assert.equal(count(koEn, SUB), 4);
  const subs = lettered(koEn, "Directly under that bubble");
  for (const i of [1, 2, 4, 5]) assert.equal(subs.filter((t) => t === KO_LINES[i]).length, 1, KO_LINES[i]);
  // 번역 자막 줄은 해당 말풍선 줄 바로 다음 줄이다(영어 말풍선은 길면 여러 줄로 인용된다).
  const koEnLines = koEn.split("\n");
  const bubbleLine = koEnLines.findIndex(
    (l) => l.includes("pointing to 민지:") && lettered(l)[0] === EN_LINES[1],
  );
  assert.ok(bubbleLine >= 0);
  assert.equal(koEnLines[bubbleLine + 1], `  Lettering: ${SUB}${q(KO_LINES[1])}`);
  assert.ok(koEn.includes("- Speech bubbles are English with a Korean subtitle strip under each; captions are Korean."));
  for (const p of [koEnAsEn, ko, en]) assert.equal(count(p, "subtitle strip"), 0);
  assert.ok(koEnAsEn.includes("- All lettering is English."));
});

test("compile: 컷 수 문장·PANEL 블록·레이아웃 행(half 쌍 = 한 행 좌|우)", () => {
  const ko = R.compile.ko;
  assert.ok(ko.startsWith("Create ONE vertical 9:16 full-color Korean webtoon page that tells a complete short story in exactly 6 panels, read top to bottom (left to right within a row)."));
  assert.deepEqual([...ko.matchAll(/\b(\d+) panels\b/g)].map((m) => m[1]), ["6", "6"]);
  assert.equal((ko.match(/^PANEL \d+ — /gm) ?? []).length, 6); // PANEL 7 없음 포함
  assert.ok(ko.includes("PANEL 1 — EXTREME WIDE SHOT (tiny figures in a vast environment), bird's-eye view from directly above.\n"));
  assert.ok(ko.includes("PANEL 4 — INSERT SHOT (a key object or detail, hands allowed, no full faces), high-angle camera looking down.\n"));
  assert.equal((ko.match(/^- Row \d+ /gm) ?? []).length, 5);
  // 행 높이는 상대 서술(퍼센트는 18장 전부 무시됐다 — 26-09-30 벤치).
  assert.ok(ko.includes("- Row 2 (standard height): Panel 2 (left half) | Panel 3 (right half)"));
  assert.ok(ko.includes("- Row 4 (the TALLEST row on the page — about 1.5× a standard row): Panel 5 (full width)")); // large
  assert.ok(ko.includes("- Row 1 (a short band — clearly shorter than a standard row): Panel 1 (full width)")); // wide
  assert.ok(!/% of the page height/.test(ko));
  assert.equal(count(ko, "(left half)"), 1);
  assert.ok(ko.includes("PAGE LAYOUT — 6 panels"));
  assert.ok(ko.includes(`- 민지: ${CAST[0].appearance}\n- 준호: ${CAST[1].appearance}`));
  assert.ok(ko.includes("COLOR SCRIPT: Warm creams") && ko.includes("WORLD: A modern Korean"));
  assert.ok(!ko.includes("ART NOTES:"));
  const e8 = R.compile.eight;
  assert.deepEqual([...e8.matchAll(/\b(\d+) panels\b/g)].map((m) => m[1]), ["8", "8"]);
  assert.equal((e8.match(/^PANEL \d+ — /gm) ?? []).length, 8);
});

test("compile: 홀수 반 컷은 컴파일 전에 이미 승격돼 외톨이 반 칸이 없다", () => {
  const { sizes, prompt } = R.promoted;
  assert.deepEqual(sizes, ["wide", "half", "half", "wide", "large", "wide"]);
  assert.ok(prompt.includes("Panel 2 (left half) | Panel 3 (right half)"));
  assert.ok(prompt.includes("Panel 4 (full width)"));
  assert.deepEqual([count(prompt, "(left half)"), count(prompt, "(right half)")], [1, 1]);
});

test("compile: 안쪽 따옴표는 굽은 따옴표, 내레이터 꼬리, 무글자 컷, ART NOTES", () => {
  const p = R.compile.quirks;
  // 안쪽 따옴표는 여는 “ · 닫는 ” 쌍으로 바뀐다(”왜?” 처럼 닫는 따옴표만 찍히지 않게).
  assert.ok(p.includes(q("민지가 “왜?”라고 물었다")));
  assert.ok(!p.includes('"왜?"'));
  assert.ok(p.includes(`with a tail pointing to the speaker: ${q(KO_LINES[5])}`));
  assert.equal(count(p, "Lettering: No text in this panel."), 1);
  const block4 = p.slice(p.indexOf("PANEL 4 — "), p.indexOf("PANEL 5 — "));
  assert.ok(block4.includes("Lettering: No text in this panel."));
  assert.ok(p.includes("ART NOTES: Big, clean letters\n"));
});

test("models: 현재·레거시 모델 id → 등급, 미지 → null, 기본은 STANDARD", () => {
  assert.deepEqual(R.models.lookup, [
    ["openai/gpt-image-2.5-flare", "STANDARD"], ["openai/gpt-image-2.5-sunburst", "PREMIUM"],
    // AtlasCloud 시절 커밋(c3720bfb)의 실제 id — 같은 등급으로 풀려야 한다.
    ["google/nano-banana-2/text-to-image-developer", "STANDARD"], ["openai/gpt-image-2/text-to-image", "PREMIUM"],
    ["openai/gpt-image-2.5", null], ["unknown/model", null], ["", null], [null, null],
  ]);
  assert.equal(R.models.lookupUndefined, null);
  assert.ok(R.models.legacyEach.length >= 2);
  for (const [id, owner, got] of R.models.legacyEach) assert.equal(got, owner, id);
  assert.deepEqual(R.models.resolve, ["STANDARD", "STANDARD", "STANDARD", "STANDARD", "STANDARD", "STANDARD", "STANDARD", "PREMIUM"]);
  assert.equal(R.models.defaultId, "STANDARD");
});

test("models: 등급 정의 불변식 — id 충돌 없음, 9:16, 크레딧 5/10, 라벨 존재", () => {
  const all = R.models.plans.flatMap((p) => [p.modelId, ...p.legacyModelIds]);
  assert.equal(new Set(all).size, all.length, "model id collision across plans");
  const byId = Object.fromEntries(R.models.plans.map((p) => [p.id, p]));
  assert.deepEqual([byId.STANDARD.credits, byId.PREMIUM.credits], [5, 10]); // 가격 변경은 감독 결정 사항
  assert.deepEqual([byId.STANDARD.operationType, byId.PREMIUM.operationType], ["WEBTOON_IMAGE", "WEBTOON_IMAGE_PREMIUM"]);
  for (const p of R.models.plans) {
    assert.equal(p.params.aspectRatio, "9:16");
    assert.ok(p.engineLabel.trim() && p.etaLabel.trim(), p.id);
  }
});

test("errors: friendlyWebtoonError — 안전/시간초과/혼잡/중단/기타가 서로 다른 문구", () => {
  const e = R.errors;
  const expect = { safety: /안전 정책/, timeout: /너무 오래 걸려/, credits402: /혼잡/, stale: /중간에 멈춰/, other: /^웹툰 생성에 실패했어요/ };
  for (const [k, re] of Object.entries(expect)) assert.match(e[k], re, k);
  const sameAs = { moderation: "safety", aborted: "timeout", rate429: "credits402", interrupted: "stale", empty: "other" };
  for (const [k, v] of Object.entries(sameAs)) assert.equal(e[k], e[v], `${k} → ${v}`);
  assert.equal(new Set(Object.keys(expect).map((k) => e[k])).size, 5);
  for (const [k, msg] of Object.entries(e)) assert.ok(msg.includes("크레딧은 환불됐어요"), k);
});

// ── 회귀 방지: 이모지 제거가 ZWJ(U+200D)·키캡(U+20E3) 잔재와 ⭐(U+2B50)·⏰(U+23F0)까지 지운다
// (26-09-29 단위 테스트가 찾아낸 결함 — s() 가 \p{Extended_Pictographic}+결합 문자를 제거하도록 수리).
test("validate.s(): 이모지·ZWJ·키캡 잔재를 남기지 않는다", () => {
  assert.deepEqual([R.normalize.emojiResidue.title, R.normalize.emojiResidue.panels[0].caption], ["선생님 등장", "1 번 문제 알람"]);
});
