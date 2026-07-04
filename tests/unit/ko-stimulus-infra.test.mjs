import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

// ============================================================================
// A4-토대 — 자체자료(koStimulus) 인프라 (화법·작문·매체·국어사 유형의 공통 기반)
// ============================================================================
// (1) 소스 가드: 카드 렌더러(ko-question-renderer)가 model.stimulus 를 렌더하는지.
// (2) 동작: 봉투 왕복(zod) · 렌더모델 조립(마커 targetSurface 분리) ·
//     serializeKoQuestion 【자료】 직렬화 · 시험지 세그먼트(행 보존) ·
//     학생응시 텍스트(누수 0) · 공통 게이트(필수/누수/마커 해소/옛한글).
// (3) 무회귀: koStimulus 없는 기존 봉투가 전부 종전과 동일 동작.
// ============================================================================

// ── (1) 소스 가드 ──────────────────────────────────────────────────────────

test("ko-question-renderer renders model.stimulus via KoStimulusBox", () => {
  const src = readFileSync(
    path.join(repoRoot, "src", "components", "workbench", "korean", "ko-question-renderer.tsx"),
    "utf8",
  );
  assert.ok(src.includes("function KoStimulusBox"), "KoStimulusBox 컴포넌트 누락");
  assert.ok(src.includes("model.stimulus?.map"), "model.stimulus 렌더 경로 누락");
  assert.ok(src.includes("KoRenderStimulusBlock"), "stimulus 타입 import 누락");
});

// ── (2) 동작 하니스 (tsx — @/ 앨리어스 TS 모듈, ko-student-exam-text 패턴 미러) ──

const harnessSource = `
// tsx runs these .ts modules as CommonJS (no "type":"module"), so Node's ESM
// interop only exposes the default export — destructure the named exports off it.
import envelopeSchema from "@/lib/korean/registry/envelope-schema";
import renderModel from "@/lib/korean/core/render-model";
import adapter from "@/components/exams/paper-builder/korean/ko-paper-adapter";
import common from "@/lib/korean/quality/common";
import studentExamText from "@/lib/korean/student-exam-text";
import koText from "@/lib/korean/core/ko-text";

const { koQuestionEnvelope, koMc5Envelope } = envelopeSchema;
const { buildDefaultKoRenderModel, serializeKoQuestion, readKoStimulusBlocks, KO_STIMULUS_KINDS } = renderModel;
const { koPaperSegmentsFromModel } = adapter;
const { validateKoCommon, validateKoStimulusCommon } = common;
const { buildKoStudentExamText } = studentExamText;

const failures: string[] = [];
let passed = 0;
function check(name: string, cond: boolean) {
  if (cond) passed += 1;
  else failures.push(name);
}

// ── 공용 픽스처 ──
const speechLines = [
  "안녕하세요. 학교 텃밭 가꾸기를 소개할 발표자입니다.",
  "(자료를 가리키며) 이 사진은 작년 텃밭의 모습입니다.",
  "학생 1: 텃밭은 누가 관리하나요?",
  "끝까지 들어 주셔서 감사합니다.",
];
const stimulusEnvelope = {
  direction: "위 발표자의 말하기 방식으로 가장 적절한 것은?",
  koStimulus: [
    {
      kind: "SPEECH_SCRIPT",
      label: "(가)",
      title: "학생의 발표",
      lines: speechLines,
      footnotes: [{ term: "텃밭", gloss: "집 가까이에 있는 작은 밭" }],
    },
  ],
  markers: [
    { family: "KOR_CIRCLED", label: "㉠", spanText: "이 사진은 작년 텃밭의 모습입니다.", targetSurface: "stimulus" },
  ],
  options: [
    { label: "①", text: "청중의 반응을 살피며 발표하고 있다." },
    { label: "②", text: "o2 하고 있다." },
    { label: "③", text: "o3 하고 있다." },
    { label: "④", text: "o4 하고 있다." },
    { label: "⑤", text: "o5 하고 있다." },
  ],
  correctAnswer: "①",
  explanation: "발표자는 자료를 가리키며 청중과 상호작용한다.",
  wrongOptionExplanations: [
    { label: "②", explanation: "근거 없음." },
    { label: "③", explanation: "근거 없음." },
    { label: "④", explanation: "근거 없음." },
    { label: "⑤", explanation: "근거 없음." },
  ],
  evidence: [
    { optionLabel: "①", spanText: "(자료를 가리키며)", relation: "SUPPORTS" },
    { optionLabel: "②", spanText: "학생 1: 텃밭은 누가 관리하나요?", relation: "CONTRADICTS" },
    { optionLabel: "③", spanText: "학교 텃밭 가꾸기", relation: "NOT_MENTIONED" },
    { optionLabel: "④", spanText: "작년 텃밭의 모습", relation: "CONTRADICTS" },
    { optionLabel: "⑤", spanText: "끝까지 들어 주셔서", relation: "CONTRADICTS" },
  ],
  keyPoints: ["k1", "k2", "k3"],
  tags: ["화법"],
  difficulty: "BASIC",
};

// ═══ 1. 봉투 왕복 (zod) ═══
{
  const parsed = koQuestionEnvelope({}).safeParse(stimulusEnvelope);
  check("봉투: koStimulus+targetSurface 파싱 성공", parsed.success);
  if (parsed.success) {
    check("봉투: stimulus kind 왕복", parsed.data.koStimulus?.[0]?.kind === "SPEECH_SCRIPT");
    check("봉투: stimulus lines 행 보존", parsed.data.koStimulus?.[0]?.lines?.length === 4);
    check("봉투: marker targetSurface 왕복", parsed.data.markers?.[0]?.targetSurface === "stimulus");
  } else {
    failures.push("봉투 파싱 실패로 왕복 3건 스킵");
  }
  // MC5 봉투도 동일 수용
  check("봉투: koMc5Envelope 도 koStimulus 수용", koMc5Envelope({}).safeParse(stimulusEnvelope).success);
  // 규격 밖 kind 거부
  const badKind = { ...stimulusEnvelope, koStimulus: [{ kind: "NOT_A_KIND", lines: ["x"] }] };
  check("봉투: 규격 밖 kind 거부", !koQuestionEnvelope({}).safeParse(badKind).success);
  // 빈 lines 거부
  const emptyLines = { ...stimulusEnvelope, koStimulus: [{ kind: "DRAFT", lines: [] }] };
  check("봉투: 빈 lines 거부", !koQuestionEnvelope({}).safeParse(emptyLines).success);
  // 무회귀: koStimulus/targetSurface 없는 기존 봉투
  const legacy = {
    ...stimulusEnvelope,
    koStimulus: undefined,
    markers: [{ family: "KOR_CIRCLED", label: "㉠", spanText: "구절" }],
  };
  const legacyParsed = koQuestionEnvelope({}).safeParse(legacy);
  check("봉투(무회귀): 기존 봉투 optional 통과", legacyParsed.success);
  check("봉투: KO_STIMULUS_KINDS 7종", Array.isArray(KO_STIMULUS_KINDS) && KO_STIMULUS_KINDS.length === 7);
}

// ═══ 2. 렌더모델 조립 (마커 targetSurface 분리) ═══
const passage = "국가는 인간의 존엄성을 보장할 의무를 진다. 이 원리는 기본권 해석의 출발점이다.";
{
  const q = {
    ...stimulusEnvelope,
    markers: [
      { family: "KOR_CIRCLED", label: "㉠", spanText: "이 사진은 작년 텃밭의 모습입니다.", targetSurface: "stimulus" },
      { family: "LATIN_CIRCLED", label: "ⓐ", spanText: "존엄성" },
    ],
  };
  const model = buildDefaultKoRenderModel({
    question: q,
    passage,
    includesPassage: true,
    answerFormat: "MC5",
    defaultPoints: 2,
  });
  const stimText = (model.stimulus ?? []).map((b: any) => b.lines.join("\\n")).join("\\n");
  const passText = (model.passage?.parts ?? []).map((p: any) => p.text).join("\\n");
  check("렌더모델: stimulus 마커 병합(㉠__…__)", stimText.includes("㉠__이 사진은 작년 텃밭의 모습입니다.__"));
  check("렌더모델: passage 마커 병합(ⓐ__…__)", passText.includes("ⓐ__존엄성__"));
  check("렌더모델: stimulus 마커가 지문에 미적용", !passText.includes("㉠"));
  check("렌더모델: passage 마커가 자료에 미적용", !stimText.includes("ⓐ"));
  check("렌더모델: 행 수 보존(4행)", (model.stimulus?.[0]?.lines ?? []).length === 4);
  check("렌더모델: label/title 보존",
    model.stimulus?.[0]?.label === "(가)" && model.stimulus?.[0]?.title === "학생의 발표");
  check("렌더모델: footnotes 보존", model.stimulus?.[0]?.footnotes?.[0]?.term === "텃밭");

  // suppressPassage(세트 공유지문)여도 자료는 유지
  const suppressed = buildDefaultKoRenderModel({
    question: q,
    passage,
    suppressPassage: true,
    includesPassage: true,
    answerFormat: "MC5",
    defaultPoints: 2,
  });
  check("렌더모델: suppressPassage 에도 stimulus 유지", (suppressed.stimulus ?? []).length === 1);
  check("렌더모델: suppressPassage 시 지문 억제", !suppressed.passage);

  // 복수 블록 — 마커는 해소되는 첫 블록에만 적용
  const multi = buildDefaultKoRenderModel({
    question: {
      ...stimulusEnvelope,
      koStimulus: [
        { kind: "DIALOGUE", label: "(가)", lines: ["학생 1: 공통 문구가 있다."] },
        { kind: "DRAFT", label: "(나)", lines: ["공통 문구가 있다. 초고의 다른 문장."] },
      ],
      markers: [{ family: "KOR_CIRCLED", label: "㉠", spanText: "공통 문구", targetSurface: "stimulus" }],
    },
    passage,
    includesPassage: true,
    answerFormat: "MC5",
    defaultPoints: 2,
  });
  const first = multi.stimulus?.[0]?.lines.join("") ?? "";
  const second = multi.stimulus?.[1]?.lines.join("") ?? "";
  check("렌더모델: 복수 블록 첫 해소 블록에만 마킹", first.includes("㉠__공통 문구__") && !second.includes("㉠"));

  // 무회귀: koStimulus 없는 봉투 → model.stimulus undefined
  const plain = buildDefaultKoRenderModel({
    question: { direction: "윗글에 대한 설명으로 가장 적절한 것은?" },
    passage,
    includesPassage: true,
    answerFormat: "MC5",
    defaultPoints: 2,
  });
  check("렌더모델(무회귀): stimulus 부재 시 undefined", plain.stimulus === undefined);
}

// ═══ 3. serializeKoQuestion — 【자료】 직렬 블록 ═══
{
  const model = buildDefaultKoRenderModel({
    question: {
      ...stimulusEnvelope,
      bogi: { label: "보기", lines: ["ㄱ. 보기 항목"] },
      essay: { conditions: ["한 문장으로 쓸 것"] },
    },
    passage,
    includesPassage: true,
    answerFormat: "MC5",
    defaultPoints: 2,
  });
  const text = serializeKoQuestion(model);
  check("직렬화: 【자료】 마커 행", text.includes("【자료】"));
  check("직렬화: 라벨+표제 행", text.includes("(가) 학생의 발표"));
  check("직렬화: 자료 본문 행", text.includes("학생 1: 텃밭은 누가 관리하나요?"));
  check("직렬화: 각주 행", text.includes("*텃밭: 집 가까이에 있는 작은 밭"));
  check("직렬화: 밑줄 마크업 평문화(마커 라벨 유지)",
    text.includes("㉠이 사진은") && !text.includes("__"));
  check("직렬화: 【보기】 뒤·【조건】 앞",
    text.indexOf("【보기】") < text.indexOf("【자료】") && text.indexOf("【자료】") < text.indexOf("【조건】"));
  check("직렬화: 선지 미포함", !text.includes("①"));
}

// ═══ 4. 시험지 세그먼트 (ko-paper-adapter) ═══
{
  const model = buildDefaultKoRenderModel({
    question: { ...stimulusEnvelope, bogi: { label: "보기", lines: ["ㄱ. 항목"] } },
    passage,
    includesPassage: true,
    answerFormat: "MC5",
    defaultPoints: 2,
  });
  const segs = koPaperSegmentsFromModel(model);
  check("시험지: 세그먼트 3개(지문+자료+보기)", segs.length === 3);
  const stimSeg = segs[1];
  check("시험지: 자료 박스 = passage 스타일(신규 스타일 0)",
    stimSeg?.kind === "box" && (stimSeg as any).boxStyle === "passage");
  const stimSegText = (stimSeg as any)?.text ?? "";
  check("시험지: 첫 행 = 라벨+표제", stimSegText.split("\\n")[0] === "(가) 학생의 발표");
  check("시험지: 행 단위 보존(개행) + 마커 병합", stimSegText.includes("\\n(자료를 가리키며) ㉠__이 사진은"));
  check("시험지: 각주 말미 행", stimSegText.endsWith("*텃밭: 집 가까이에 있는 작은 밭"));
  check("시험지: 보기 박스 = given 스타일", (segs[2] as any)?.boxStyle === "given");

  // 무회귀: stimulus 없는 모델은 종전 세그먼트 그대로
  const plainModel = buildDefaultKoRenderModel({
    question: { direction: "윗글에 대한 설명으로 가장 적절한 것은?", bogi: { label: "보기", lines: ["ㄱ. 항목"] } },
    passage,
    includesPassage: true,
    answerFormat: "MC5",
    defaultPoints: 2,
  });
  const plainSegs = koPaperSegmentsFromModel(plainModel);
  check("시험지(무회귀): 지문+보기 2세그먼트", plainSegs.length === 2);
}

// ═══ 5. 학생 응시 텍스트 (KO_RD_FACT 봉투 경유 — 등록 유형 관통) ═══
{
  const text = buildKoStudentExamText({
    subType: "KO_RD_FACT",
    questionText: "fallback",
    structuredData: {
      direction: "윗글의 내용과 일치하지 않는 것은?",
      koStimulus: [{ kind: "DIALOGUE", label: "[자료]", lines: ["학생 1: 질문이 있습니다.", "학생 2: 답변입니다."] }],
      options: [
        { label: "①", text: "SECRET-선지" }, { label: "②", text: "s2" }, { label: "③", text: "s3" },
        { label: "④", text: "s4" }, { label: "⑤", text: "s5" },
      ],
      correctAnswer: "③",
      explanation: "SECRET-해설",
    },
    passage: { content: passage },
  });
  check("학생응시: 【자료】 포함", text.includes("【자료】") && text.includes("학생 2: 답변입니다."));
  check("학생응시: 지문도 포함", text.includes("보장할 의무를 진다"));
  check("학생응시: 선지·해설 미포함", !text.includes("SECRET"));
}

// ═══ 6. 공통 게이트 (quality/common) ═══
const baseMeta = {
  typeId: "KO_SP_TEST",
  area: "NAESIN",
  label: "테스트 화법",
  formatCategory: "객관식",
  uiGroup: "국어 독서",
  answerFormat: "MC5",
  includesPassage: false,
  passageKinds: [],
  defaultPoints: 2,
  usesBogi: "none",
  markerFamilies: ["KOR_CIRCLED"],
  optionEnding: "any",
  needsSolverGate: false,
  description: "",
  setSlot: "",
  studentTask: "",
  bestFor: [],
  outputUi: [],
} as any;
const ctx = { passage: "", passageKind: null, examMode: "SUNEUNG", difficulty: "INTERMEDIATE", koText } as any;
const codesOf = (issues: any[]) => issues.map((i) => i.code);

{
  // (a) 필수 유형 자료 결손
  const meta = { ...baseMeta, usesStimulus: "required" };
  const missing = validateKoCommon({ ...stimulusEnvelope, koStimulus: undefined }, meta, ctx);
  check("게이트: required 결손 → ko-stimulus-missing", codesOf(missing).includes("ko-stimulus-missing"));

  // 자료 존재 + evidence/마커 전부 stimulus 해소 → 무결(지문 빈 문자열에도)
  const ok = validateKoCommon(stimulusEnvelope, meta, ctx);
  check("게이트: stimulus 근거앵커 인정(ko-evidence-not-in-passage 0)",
    !codesOf(ok).includes("ko-evidence-not-in-passage"));
  check("게이트: stimulus 마커 해소(ko-marker-unresolved 0)",
    !codesOf(ok).includes("ko-marker-unresolved"));
  check("게이트: stimulus-missing 미발화", !codesOf(ok).includes("ko-stimulus-missing"));

  // targetSurface 누락(지문 마킹 취급) → 지문에서 미해소
  const wrongSurface = validateKoCommon(
    {
      ...stimulusEnvelope,
      markers: [{ family: "KOR_CIRCLED", label: "㉠", spanText: "이 사진은 작년 텃밭의 모습입니다." }],
    },
    meta,
    ctx,
  );
  check("게이트: targetSurface 누락 마커는 지문 기준 미해소", codesOf(wrongSurface).includes("ko-marker-unresolved"));

  // stimulus 마커인데 자료 부재 → 미해소
  const orphanMarker = validateKoCommon(
    { ...stimulusEnvelope, koStimulus: undefined },
    { ...baseMeta, usesStimulus: "optional" },
    ctx,
  );
  check("게이트: 자료 부재 stimulus 마커 미해소", codesOf(orphanMarker).includes("ko-marker-unresolved"));

  // (b) 서답형 정답 stimulus 누수 → ko-answer-leak
  const essayMeta = { ...baseMeta, answerFormat: "SHORT", formatCategory: "서술형", usesStimulus: "required" };
  const leak = validateKoCommon(
    {
      direction: "자료를 바탕으로 발표의 핵심 소재를 쓰시오.",
      koStimulus: [{ kind: "SPEECH_SCRIPT", lines: ["오늘은 학교 텃밭 가꾸기를 소개합니다."] }],
      correctAnswer: "학교 텃밭 가꾸기",
    },
    essayMeta,
    ctx,
  );
  check("게이트: 서답형 정답 stimulus verbatim → ko-answer-leak", codesOf(leak).includes("ko-answer-leak"));
  const noLeak = validateKoCommon(
    {
      direction: "자료를 바탕으로 발표의 핵심 소재를 쓰시오.",
      koStimulus: [{ kind: "SPEECH_SCRIPT", lines: ["오늘은 채소 기르기를 소개합니다."] }],
      correctAnswer: "학교 텃밭 가꾸기",
    },
    essayMeta,
    ctx,
  );
  check("게이트: 비노출 정답은 무발화", !codesOf(noLeak).includes("ko-answer-leak"));

  // kind 일탈 경고
  const kindIssues = validateKoStimulusCommon(
    { koStimulus: [{ kind: "DIALOGUE", lines: ["학생 1: …"] }] },
    { ...baseMeta, usesStimulus: "required", stimulusKinds: ["DRAFT", "PLAN_NOTE"] },
  );
  check("게이트: 선언 밖 kind → ko-stimulus-kind 경고",
    kindIssues.some((i: any) => i.code === "ko-stimulus-kind" && i.severity === "warning"));

  // (c) 옛한글 글리프 → warning ko-render-fallback
  const archaic = validateKoStimulusCommon(
    { koStimulus: [{ kind: "ARCHAIC_TEXT", lines: ["나랏말ᄊᆞ미 듕귁에 달아", "[현대어 풀이] 나라의 말이 중국과 달라"] }] },
    { ...baseMeta, usesStimulus: "required" },
  );
  check("게이트: 옛한글 글리프 → ko-render-fallback 경고",
    archaic.some((i: any) => i.code === "ko-render-fallback" && i.severity === "warning"));
  const modern = validateKoStimulusCommon(
    { koStimulus: [{ kind: "ARCHAIC_TEXT", lines: ["나라의 말이 중국과 달라 (현대어 전사)"] }] },
    { ...baseMeta, usesStimulus: "required" },
  );
  check("게이트: 현대어 전사는 무발화", !modern.some((i: any) => i.code === "ko-render-fallback"));

  // 무회귀: 기존 유형(usesStimulus 생략)·stimulus 없는 문항 — stimulus 계열 코드 0
  const legacyIssues = validateKoCommon(
    {
      direction: "윗글에 대한 이해로 가장 적절한 것은?",
      options: stimulusEnvelope.options,
      correctAnswer: "①",
      evidence: [
        { optionLabel: "①", spanText: "존엄성을 보장할 의무", relation: "SUPPORTS" },
        { optionLabel: "②", spanText: "기본권 해석의 출발점", relation: "CONTRADICTS" },
        { optionLabel: "③", spanText: "국가는 인간의 존엄성", relation: "CONTRADICTS" },
        { optionLabel: "④", spanText: "의무를 진다", relation: "CONTRADICTS" },
        { optionLabel: "⑤", spanText: "이 원리는", relation: "CONTRADICTS" },
      ],
    },
    baseMeta,
    { ...ctx, passage },
  );
  const legacyCodes = codesOf(legacyIssues);
  check("게이트(무회귀): stimulus 계열 코드 미발화",
    !legacyCodes.some((c: string) => c.startsWith("ko-stimulus")) && !legacyCodes.includes("ko-render-fallback"));

  // readKoStimulusBlocks 방어적 리더
  check("리더: 비배열/규격밖 kind 무시",
    readKoStimulusBlocks("junk").length === 0 &&
    readKoStimulusBlocks([{ kind: "BAD", lines: ["x"] }, { kind: "DRAFT", lines: ["초고 문장."] }]).length === 1);
}

process.stdout.write(JSON.stringify({ passed, failed: failures.length, failures }));
`;

function runHarness() {
  const tmpDir = path.join(repoRoot, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".ko-stimulus-infra-harness.mts");
  try {
    writeFileSync(harnessPath, harnessSource, "utf8");
    // Run through a shell so Windows resolves `npx` (only exists as npx.cmd);
    // execSync takes a single quoted command string (no DEP0190 args warning).
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
      // ignore
    }
  }
}

test("ko stimulus infra: envelope/render/serialize/paper/student/quality + no-regression", () => {
  const summary = runHarness();
  assert.equal(
    summary.failed,
    0,
    `ko-stimulus-infra failures: ${JSON.stringify(summary.failures)}`,
  );
  assert.ok(summary.passed >= 40, `expected ≥40 checks, got ${summary.passed}`);
});
