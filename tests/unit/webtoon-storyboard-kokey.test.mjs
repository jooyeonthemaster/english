import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

// KO_KEY(한국어 + 핵심 영어 표현) 검증 규칙 — 26-09-30 벤치에서 콘티가 "see the world in a
// distorted way하게 한다" 같은 혼종 문장과 지문에 없는 영어 조각을 만든 것을 계기로 추가된
// 두 결정론 규칙의 회귀 테스트(webtoon-storyboard.test.mjs 하니스 패턴 미러).
//   ① 영어 동사·형용사 + '-하게/-한다/…' 혼종 어미 금지
//   ② 캡션 속 영어 덩어리(4자 이상)는 지문에 글자 그대로 있어야 한다(passageContent 제공 시)

const PASSAGE =
  "Emotions dispose one to see the world in a distorted way. A coward's perceptual disposition is affected by his disposition to experience fear. The more affected one is, the less similarity is required for the thing to appear.";

function board(captions) {
  const shots = ["extreme_wide", "medium", "close_up", "insert", "medium_close_up", "full"];
  const sizes = ["wide", "half", "half", "wide", "large", "wide"];
  return {
    version: 1, title: "t", loglineKo: "", keyMessageKo: "", world: "", palette: "", artNotes: "",
    cast: [{ name: "민우", role: "학생", appearance: "16-year-old boy, black hair, grey hoodie" }],
    panels: captions.map((caption, i) => ({
      beat: "development", shot: shots[i], angle: "eye_level", size: sizes[i],
      composition: "민우 in the center.", action: "민우 looks around.", setting: "alley", mood: "dusk",
      caption, sfx: "", keyPhrase: "", sourceExcerpt: "",
      bubbles: i % 2 === 0 ? [{ speaker: "민우", kind: "speech", text: "뭐지?", translation: "" }] : [],
    })),
  };
}

const CLEAN = [
  "감정이 커질수록 세상은 in a distorted way로 보인다.",
  "겁쟁이의 perceptual disposition은 흔들린다.",
  "",
  "작은 similarity만으로도 착각한다.",
  "민우는 모든 것을 fear 속에서 봤다.",
  "",
];
const HYBRID = [...CLEAN];
HYBRID[0] = "감정은 see the world in a distorted way하게 한다.";
const FABRICATED = [...CLEAN];
FABRICATED[1] = "결국 more biased perception이 생긴다.";

// 26-09-30 새 눈 검수: 따옴표로 감싼 영어·인물 이름은 지문 인용 위반이 아니다. 약어+띄어쓰기는 혼종이 아니다.
const QUOTED_OK = [...CLEAN];
QUOTED_OK[1] = "겁쟁이의 'perceptual disposition'은 흔들린다.";
QUOTED_OK[4] = "그때 민우는 fear 속에서 Minwoo라는 이름을 불렀다.";
const ACRONYM_OK = [...CLEAN];
ACRONYM_OK[4] = "밤마다 SNS 하는 시간이 fear를 키운다.";
const HYBRID2 = [...CLEAN];
HYBRID2[0] = "세상은 distorted해진다.";

const castBoard = (captions) => {
  const b = board(captions);
  b.cast.push({ name: "Minwoo", role: "친구", appearance: "16-year-old boy, brown hair, red scarf" });
  return b;
};
const INPUT = {
  PASSAGE, CLEAN: board(CLEAN), HYBRID: board(HYBRID), FABRICATED: board(FABRICATED),
  QUOTED_OK: castBoard(QUOTED_OK), ACRONYM_OK: board(ACRONYM_OK), HYBRID2: board(HYBRID2),
};

const harnessSource = `
import vm from "@/lib/webtoon-storyboard/validate";
const { validateStoryboard } = vm;
const INPUT = ${JSON.stringify(INPUT)};
const v = (sb, withPassage) => validateStoryboard(sb, { language: "KO_KEY", targetPanels: 6, ...(withPassage ? { passageContent: INPUT.PASSAGE } : {}) }).violations;
process.stdout.write(JSON.stringify({
  clean: v(INPUT.CLEAN, true),
  hybrid: v(INPUT.HYBRID, true),
  fabricated: v(INPUT.FABRICATED, true),
  fabricatedNoPassage: v(INPUT.FABRICATED, false),
  hybridAsKo: validateStoryboard(INPUT.HYBRID, { language: "KO", targetPanels: 6, passageContent: INPUT.PASSAGE }).violations,
  quotedOk: v(INPUT.QUOTED_OK, true),
  acronymOk: v(INPUT.ACRONYM_OK, true),
  hybrid2: v(INPUT.HYBRID2, true),
}));
`;

function runHarness() {
  const tmpDir = path.join(repoRoot, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, `.webtoon-kokey-harness-${process.pid}.mts`);
  try {
    writeFileSync(harnessPath, harnessSource, "utf8");
    const raw = execSync(`npx tsx "${harnessPath}"`, {
      cwd: repoRoot,
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
      env: { ...process.env, NODE_OPTIONS: "" },
    });
    return JSON.parse(raw);
  } finally {
    try { rmSync(harnessPath); } catch { /* ignore */ }
  }
}

const R = runHarness();
const has = (list, needle) => list.some((v) => v.includes(needle));

test("KO_KEY: 명사구·부사구로 끼운 지문 원문 영어는 위반 0 (음성 대조군)", () => {
  assert.deepEqual(R.clean, []);
});

test("KO_KEY: 영어 동사구 + '-하게' 혼종 문장을 잡는다", () => {
  assert.ok(has(R.hybrid, "혼종"), JSON.stringify(R.hybrid));
});

test("KO_KEY: 지문에 없는 영어 덩어리를 잡는다(지문 제공 시에만)", () => {
  assert.ok(has(R.fabricated, "more biased perception"), JSON.stringify(R.fabricated));
  assert.ok(!has(R.fabricatedNoPassage, "글자 그대로"), JSON.stringify(R.fabricatedNoPassage));
});

test("KO_KEY 규칙은 다른 언어 모드에 새지 않는다", () => {
  assert.ok(!has(R.hybridAsKo, "혼종"), JSON.stringify(R.hybridAsKo));
});

test("KO_KEY: 따옴표로 감싼 지문 영어·인물 이름은 위반이 아니다(오탐 회귀)", () => {
  assert.deepEqual(R.quotedOk.filter((v) => v.includes("글자 그대로")), [], JSON.stringify(R.quotedOk));
});

test("KO_KEY: 약어+띄어쓰기('SNS 하는')는 혼종이 아니고, 'distorted해진다'는 혼종이다", () => {
  assert.ok(!has(R.acronymOk, "혼종"), JSON.stringify(R.acronymOk));
  assert.ok(has(R.hybrid2, "혼종"), JSON.stringify(R.hybrid2));
});
