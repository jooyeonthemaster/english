import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

// KO 공통 게이트 W1(판정단 시스템 패턴 5종) 회귀 가드:
//   KO-W1-1  evidence·인용 근거 표면 제한 — includesPassage=false 유형은
//            참고용 지문에서 복사된 근거를 차단(KO_WR_METHOD critical 근본).
//   KO-W1-2  원문(자료/지문) 내 마커 글리프 사전 삽입 금지 — 이중 마커
//            (KO_WR_REVISE critical 근본). 자료+마커=error / 그 외 warning.
//   KO-W1-3  고아 마커 warning (KO_LIT_FACT 실증) + 범위 표기(㉠~㉤) 전개 과탐 방지.
//   KO-W1-4  이질어·표기 warning — 그리스·수학 기호(Δ)·고립 라틴 용어, 병기 면제.
//   KO-W1-5  정답 길이 편중 warning (KO_RD_STRUCT 실증 계측치로 검증).
//   + codes.ts 3집합 등록·contract.ts 프롬프트 계약 강화 문구.
// tsx 하니스(JSON 요약) 패턴은 ko-generation-pipeline-fixes.test.mjs 미러.
const harnessSource = `
import commonMod from "@/lib/korean/quality/common";
import codesMod from "@/lib/korean/quality/codes";
import contractMod from "@/lib/korean/prompts/contract";
import registryMod from "@/lib/korean/registry";
const { validateKoCommon, expandKoMarkerRanges, foreignLexemesKo } = commonMod;
const { KO_BLOCKING_CODES, KO_WARNING_CODES } = codesMod;
const { KO_QUESTION_QUALITY_CONTRACT } = contractMod;
const { getKoTypeModule } = registryMod;

const failures: string[] = [];
let passed = 0;
function check(name: string, cond: boolean) {
  if (cond) passed += 1;
  else failures.push(name);
}

const LABELS = ["①", "②", "③", "④", "⑤"];
const PASSAGE = "지문의 근거 문장이다. 은행은 신용 창조 과정을 통해 예금 통화를 만들어 낸다. 다수의 예금자가 한꺼번에 인출을 요구하면 지급 불능에 빠질 수 있다.";

function mkMeta(over: Record<string, unknown> = {}) {
  return {
    typeId: "KO_TEST",
    area: "READING",
    label: "테스트",
    formatCategory: "객관식",
    uiGroup: "국어 독서",
    answerFormat: "MC5",
    includesPassage: true,
    passageKinds: [],
    defaultPoints: 2,
    usesBogi: "optional",
    markerFamilies: ["KOR_CIRCLED"],
    optionEnding: "any",
    needsSolverGate: false,
    description: "",
    setSlot: "",
    studentTask: "",
    bestFor: [],
    outputUi: [],
    ...over,
  } as any;
}

function mkCtx(passage: string = PASSAGE) {
  return {
    passage,
    passageKind: null,
    examMode: "SUNEUNG",
    difficulty: "INTERMEDIATE",
    koText: {} as any,
  } as any;
}

function mkQ(over: Record<string, unknown> = {}) {
  return {
    direction: "윗글에 대한 설명으로 가장 적절한 것은?",
    options: LABELS.map((label, i) => ({ label, text: "선지 " + (i + 1) + " 의 평이한 내용 서술" })),
    correctAnswer: "①",
    evidence: LABELS.map((l) => ({
      optionLabel: l,
      spanText: "지문의 근거 문장이다",
      relation: l === "①" ? "SUPPORTS" : "CONTRADICTS",
    })),
    explanation: "정답 해설이다. 지문 첫 문장이 근거다.",
    ...over,
  } as Record<string, unknown>;
}

function codesOf(issues: { code: string }[]): string[] {
  return issues.map((i) => i.code);
}
function issuesWith(issues: { code: string }[], code: string) {
  return issues.filter((i) => i.code === code);
}

// ── KO-W1-1. 근거 표면 제한 ──────────────────────────────────────────────
{
  // 무회귀: includesPassage=true — 지문 근거는 종전대로 통과
  const base = validateKoCommon(mkQ(), mkMeta(), mkCtx());
  check("W1-1 무회귀: 지문동봉 유형의 지문 근거 통과", !codesOf(base).includes("ko-evidence-not-in-passage"));

  // 무회귀: includesPassage=true 에서 미실재 스팬 메시지는 종전 문구 유지
  const missing = validateKoCommon(
    mkQ({ evidence: [{ optionLabel: "①", spanText: "어디에도 없는 문장", relation: "SUPPORTS" }] }),
    mkMeta(),
    mkCtx(),
  );
  const missingHits = issuesWith(missing, "ko-evidence-not-in-passage");
  check(
    "W1-1 무회귀: 미실재 스팬 종전 메시지(지문/보기/자료) 유지",
    missingHits.some((i) => i.message.includes("지문/보기/자료에 없습니다(verbatim 위반)")),
  );

  // includesPassage=false + 근거가 참고용 지문에만 존재 → error + 표면 안내
  const hidden = validateKoCommon(mkQ(), mkMeta({ includesPassage: false }), mkCtx());
  const hiddenHits = issuesWith(hidden, "ko-evidence-not-in-passage");
  check("W1-1: 지문 미동봉 유형의 지문 복사 근거 차단(error)", hiddenHits.length > 0 && hiddenHits.every((i: any) => i.severity === "error"));
  check("W1-1: 표면 안내 메시지(참고용 지문) 포함", hiddenHits.some((i) => i.message.includes("참고용 지문")));

  // includesPassage=false + 근거가 자체자료에 실재 → 통과
  const rescued = validateKoCommon(
    mkQ({
      evidence: LABELS.map((l) => ({ optionLabel: l, spanText: "초고에 있는 근거 문장이다", relation: "SUPPORTS" })),
      koStimulus: [{ kind: "DRAFT", lines: ["초고에 있는 근거 문장이다. 초고의 나머지 문단이 이어진다."] }],
    }),
    mkMeta({ includesPassage: false }),
    mkCtx(),
  );
  check("W1-1: 자료 실재 근거는 통과", !codesOf(rescued).includes("ko-evidence-not-in-passage"));

  // includesPassage=false + <보기> 실재 근거 → 통과
  const viaBogi = validateKoCommon(
    mkQ({
      evidence: LABELS.map((l) => ({ optionLabel: l, spanText: "보기의 판정 기준 문장", relation: "SUPPORTS" })),
      bogi: { lines: ["보기의 판정 기준 문장. 추가 항목."] },
    }),
    mkMeta({ includesPassage: false }),
    mkCtx(),
  );
  check("W1-1: <보기> 실재 근거는 통과", !codesOf(viaBogi).includes("ko-evidence-not-in-passage"));

  // 선지 인용 게이트도 같은 표면 제한 적용
  const quoteHidden = validateKoCommon(
    mkQ({
      options: [
        { label: "①", text: "'신용 창조 과정'이 제시되어 있다" },
        ...LABELS.slice(1).map((label, i) => ({ label, text: "선지 " + (i + 2) + " 서술" })),
      ],
    }),
    mkMeta({ includesPassage: false }),
    mkCtx(),
  );
  const quoteHits = issuesWith(quoteHidden, "ko-quote-not-verbatim");
  check("W1-1: 지문에만 있는 선지 인용도 차단", quoteHits.length > 0 && quoteHits.some((i) => i.message.includes("참고용 지문")));
  const quoteOk = validateKoCommon(
    mkQ({
      options: [
        { label: "①", text: "'신용 창조 과정'이 제시되어 있다" },
        ...LABELS.slice(1).map((label, i) => ({ label, text: "선지 " + (i + 2) + " 서술" })),
      ],
    }),
    mkMeta({ includesPassage: true }),
    mkCtx(),
  );
  check("W1-1 무회귀: 지문동봉 유형의 지문 인용 통과", !codesOf(quoteOk).includes("ko-quote-not-verbatim"));

  // 실유형 meta 와이어링: KO_WR_METHOD(지문 미동봉)에서 재현
  const wrMethod = getKoTypeModule("KO_WR_METHOD");
  check("W1-1: KO_WR_METHOD meta.includesPassage=false 전제", !!wrMethod && wrMethod.meta.includesPassage === false);
  if (wrMethod) {
    const real = validateKoCommon(
      mkQ({ koStimulus: [{ kind: "DRAFT", lines: ["학생 초고 문단이다. 뱅크 런은 왜 발생할까?"] }] }),
      wrMethod.meta,
      mkCtx(),
    );
    check(
      "W1-1: 실유형(KO_WR_METHOD)에서 지문 복사 근거 차단",
      issuesWith(real, "ko-evidence-not-in-passage").some((i) => i.message.includes("참고용 지문")),
    );
  }
}

// ── KO-W1-2. 원문 내 마커 글리프 사전 삽입 금지 ─────────────────────────
{
  // 자료 원문 글리프 + stimulus 마커 → error (이중 마커 확정)
  const doubled = validateKoCommon(
    mkQ({
      koStimulus: [{ kind: "DRAFT", lines: ["㉠따라서 은행이 파산하면 예금자는 돈을 잃는다.", "다음 문단이 이어진다."] }],
      markers: [{ family: "KOR_CIRCLED", label: "㉠", spanText: "따라서 은행이 파산하면", targetSurface: "stimulus" }],
    }),
    mkMeta({ includesPassage: false, usesStimulus: "optional" }),
    mkCtx(),
  );
  const doubledHits = issuesWith(doubled, "ko-marker-glyph-in-source");
  check("W1-2: 자료 글리프+자료 마커 → error", doubledHits.some((i: any) => i.severity === "error"));
  check("W1-2: error 메시지에 이중 마커 안내", doubledHits.some((i) => i.message.includes("이중 마커")));

  // 자료 원문 글리프만(마커 미선언) → warning (렌더는 안 깨짐 — 보수 설계)
  const bakedOnly = validateKoCommon(
    mkQ({ koStimulus: [{ kind: "DRAFT", lines: ["㉠따라서 은행이 파산하면 예금자는 돈을 잃는다."] }] }),
    mkMeta({ includesPassage: false, usesStimulus: "optional" }),
    mkCtx(),
  );
  const bakedHits = issuesWith(bakedOnly, "ko-marker-glyph-in-source");
  check("W1-2: 자료 글리프 단독 → warning", bakedHits.length > 0 && bakedHits.every((i: any) => i.severity === "warning"));

  // 표면 한정: 발문·선지·<보기>의 ㉠ 지칭은 오차단 금지
  const referencing = validateKoCommon(
    mkQ({
      direction: "㉠에 대한 설명으로 가장 적절한 것은?",
      options: LABELS.map((label, i) => ({ label, text: "㉠ 지칭 선지 " + (i + 1) })),
      bogi: { lines: ["㉠은 첫 문장을 가리킨다."] },
      markers: [{ family: "KOR_CIRCLED", label: "㉠", spanText: "지문의 근거 문장이다" }],
    }),
    mkMeta(),
    mkCtx(),
  );
  check("W1-2: 발문·선지·보기 지칭은 미발화(표면 한정)", !codesOf(referencing).includes("ko-marker-glyph-in-source"));

  // 지문 원문 글리프 + 지문 마커 → warning (교사 입력이라 차단하지 않음)
  const passageGlyph = validateKoCommon(
    mkQ({ markers: [{ family: "KOR_CIRCLED", label: "㉡", spanText: "근거 문장이다" }] }),
    mkMeta(),
    mkCtx("㉠이 이미 박힌 지문이다. 지문의 근거 문장이다."),
  );
  const pgHits = issuesWith(passageGlyph, "ko-marker-glyph-in-source");
  check("W1-2: 지문 글리프+지문 마커 → warning(비차단)", pgHits.length > 0 && pgHits.every((i: any) => i.severity === "warning"));

  // 깨끗한 자료 → 미발화
  const clean = validateKoCommon(
    mkQ({ koStimulus: [{ kind: "DRAFT", lines: ["원문자 없는 순수 초고 문단이다."] }] }),
    mkMeta({ includesPassage: false, usesStimulus: "optional" }),
    mkCtx(),
  );
  check("W1-2: 깨끗한 자료 미발화", !codesOf(clean).includes("ko-marker-glyph-in-source"));
}

// ── KO-W1-3. 고아 마커 ───────────────────────────────────────────────────
{
  // 선언만 되고 어디서도 지칭 안 됨 → warning
  const orphan = validateKoCommon(
    mkQ({ markers: [{ family: "KOR_CIRCLED", label: "㉠", spanText: "지문의 근거 문장이다" }] }),
    mkMeta(),
    mkCtx(),
  );
  const orphanHits = issuesWith(orphan, "ko-marker-orphan");
  check("W1-3: 고아 마커 warning 발화", orphanHits.length === 1 && (orphanHits[0] as any).severity === "warning");
  check("W1-3: 메시지에 라벨 명시", orphanHits.some((i) => i.message.includes("㉠")));

  // 발문 지칭 → 미발화
  const inDirection = validateKoCommon(
    mkQ({
      direction: "㉠에 대한 설명으로 가장 적절한 것은?",
      markers: [{ family: "KOR_CIRCLED", label: "㉠", spanText: "지문의 근거 문장이다" }],
    }),
    mkMeta(),
    mkCtx(),
  );
  check("W1-3: 발문 지칭 시 미발화", !codesOf(inDirection).includes("ko-marker-orphan"));

  // 선지 지칭 → 미발화
  const inOption = validateKoCommon(
    mkQ({
      options: [
        { label: "①", text: "㉠은 원리를 제시한다" },
        ...LABELS.slice(1).map((label, i) => ({ label, text: "선지 " + (i + 2) + " 서술" })),
      ],
      markers: [{ family: "KOR_CIRCLED", label: "㉠", spanText: "지문의 근거 문장이다" }],
    }),
    mkMeta(),
    mkCtx(),
  );
  check("W1-3: 선지 지칭 시 미발화", !codesOf(inOption).includes("ko-marker-orphan"));

  // 범위 표기(㉠~㉢) 전개 — 중간 라벨 ㉡ 을 미지칭으로 오판하지 않음(과탐 방지)
  const ranged = validateKoCommon(
    mkQ({
      direction: "㉠~㉢에 대한 설명으로 가장 적절한 것은?",
      markers: [
        { family: "KOR_CIRCLED", label: "㉠", spanText: "지문의 근거 문장이다" },
        { family: "KOR_CIRCLED", label: "㉡", spanText: "신용 창조 과정" },
        { family: "KOR_CIRCLED", label: "㉢", spanText: "지급 불능" },
      ],
    }),
    mkMeta(),
    mkCtx(),
  );
  check("W1-3: 범위 표기(㉠~㉢) 전개로 전 라벨 지칭 인정", !codesOf(ranged).includes("ko-marker-orphan"));
  check("W1-3: expandKoMarkerRanges 단위 — ㉡ 포함", expandKoMarkerRanges("㉠~㉢").includes("㉡"));
  check("W1-3: expandKoMarkerRanges 혼합 패밀리 미전개", expandKoMarkerRanges("㉠~ⓔ") === "㉠~ⓔ");

  // 선지-마커 1:1(lockedOptionOrder) 유형은 자체 검사 존재 — 중복 발화 방지
  const locked = validateKoCommon(
    mkQ({ markers: [{ family: "KOR_CIRCLED", label: "㉠", spanText: "지문의 근거 문장이다" }] }),
    mkMeta({ lockedOptionOrder: true }),
    mkCtx(),
  );
  check("W1-3: lockedOptionOrder 유형 스킵", !codesOf(locked).includes("ko-marker-orphan"));
}

// ── KO-W1-4. 이질어·표기 게이트 ──────────────────────────────────────────
{
  // 해설의 그리스 기호(Δ) → warning (KO_GR_PHONO 실증)
  const delta = validateKoCommon(
    mkQ({ explanation: "자음군 단순화로 음운 개수는 Δ=-1 로 줄어든다." }),
    mkMeta(),
    mkCtx(),
  );
  const deltaHits = issuesWith(delta, "ko-foreign-lexeme");
  check("W1-4: 해설 Δ → warning", deltaHits.length === 1 && (deltaHits[0] as any).severity === "warning");
  check("W1-4: 위반 토큰(Δ) 표시", deltaHits.some((i) => i.message.includes("Δ")));

  // 오답해설(배열형)의 고립 라틴 용어 → warning (KO_LIT_NARR 'markup' 계열)
  const latin = validateKoCommon(
    mkQ({ wrongOptionExplanations: [{ label: "②", explanation: "감각적인 markup 으로 묘사하고 있다" }] }),
    mkMeta(),
    mkCtx(),
  );
  check("W1-4: 오답해설 고립 라틴 → warning", issuesWith(latin, "ko-foreign-lexeme").some((i) => i.message.includes("markup")));

  // 정당한 병기(괄호 로마자) → 미발화
  const parenthesized = validateKoCommon(
    mkQ({ explanation: "뱅크 런(bank run) 현상은 신뢰 붕괴에서 비롯된다." }),
    mkMeta(),
    mkCtx(),
  );
  check("W1-4: 괄호 병기 면제", !codesOf(parenthesized).includes("ko-foreign-lexeme"));

  // [A] 블록 라벨 → 미발화
  const blockLabel = validateKoCommon(
    mkQ({ explanation: "[A]는 인물 간 대화 블록이다." }),
    mkMeta(),
    mkCtx(),
  );
  check("W1-4: [A] 라벨 면제", !codesOf(blockLabel).includes("ko-foreign-lexeme"));

  // 지문에 실재하는 기호 인용 → 미발화 (소스 면제)
  const quotedFromSource = validateKoCommon(
    mkQ({ explanation: "지문의 Δ 표기는 증감을 뜻한다." }),
    mkMeta(),
    mkCtx(PASSAGE + " 표에서 Δ 는 증감을 나타낸다."),
  );
  check("W1-4: 지문 실재 기호 면제", !codesOf(quotedFromSource).includes("ko-foreign-lexeme"));

  // 음운 변동 화살표(→) 관행 → 미발화
  const arrow = validateKoCommon(
    mkQ({ explanation: "된소리되기로 ㄷ→ㄸ 교체가 일어나며 개수 변화는 없다." }),
    mkMeta(),
    mkCtx(),
  );
  check("W1-4: 화살표(→) 표기 면제", !codesOf(arrow).includes("ko-foreign-lexeme"));

  // foreignLexemesKo 단위 — 소스 면제와 검출 동시 확인
  check("W1-4: foreignLexemesKo 단위 검출", foreignLexemesKo("값은 Δ=0 이고 span 태그다", "").length === 2);
  check("W1-4: foreignLexemesKo 소스 면제", foreignLexemesKo("값은 Δ=0 이다", "지문에 Δ 있음").length === 0);
}

// ── KO-W1-5. 정답 길이 편중 ──────────────────────────────────────────────
{
  const lens = (spec: number[]) => LABELS.map((label, i) => ({ label, text: "가".repeat(spec[i]) }));

  // KO_RD_STRUCT 실증 계측치: ①34/②47/③66/④53/⑤57, 정답 ③ → warning
  const biased = validateKoCommon(
    mkQ({ options: lens([34, 47, 66, 53, 57]), correctAnswer: "③" }),
    mkMeta(),
    mkCtx(),
  );
  const biasHits = issuesWith(biased, "ko-answer-length-bias");
  check("W1-5: KO_RD_STRUCT 계측치 재현 → warning", biasHits.length === 1 && (biasHits[0] as any).severity === "warning");

  // 균형 선지 → 미발화
  const balanced = validateKoCommon(
    mkQ({ options: lens([50, 52, 48, 51, 49]), correctAnswer: "②" }),
    mkMeta(),
    mkCtx(),
  );
  check("W1-5: 균형 선지 미발화", !codesOf(balanced).includes("ko-answer-length-bias"));

  // 정답이 최장이 아니면 미발화
  const notLongest = validateKoCommon(
    mkQ({ options: lens([34, 47, 66, 53, 57]), correctAnswer: "⑤" }),
    mkMeta(),
    mkCtx(),
  );
  check("W1-5: 정답 비최장 미발화", !codesOf(notLongest).includes("ko-answer-length-bias"));

  // 공동 최장(정답=오답 동률)도 미발화 — 유일 최장만 발화
  const tied = validateKoCommon(
    mkQ({ options: lens([66, 47, 66, 53, 57]), correctAnswer: "③" }),
    mkMeta(),
    mkCtx(),
  );
  check("W1-5: 공동 최장 미발화(유일 최장 한정)", !codesOf(tied).includes("ko-answer-length-bias"));
}

// ── codes.ts 3집합 등록 ──────────────────────────────────────────────────
{
  check("codes: ko-marker-glyph-in-source 는 BLOCKING(relaxed 폴백 차단)", (KO_BLOCKING_CODES as readonly string[]).includes("ko-marker-glyph-in-source"));
  for (const code of ["ko-marker-orphan", "ko-foreign-lexeme", "ko-answer-length-bias"]) {
    check("codes: " + code + " 는 WARNING 전용", (KO_WARNING_CODES as readonly string[]).includes(code));
    check("codes: " + code + " 는 BLOCKING 미등록", !(KO_BLOCKING_CODES as readonly string[]).includes(code));
  }
}

// ── contract.ts 프롬프트 계약 강화 ───────────────────────────────────────
{
  const c = KO_QUESTION_QUALITY_CONTRACT;
  check("contract: 자가 재독 관문 신설", c.includes("자가 재독"));
  check("contract: 조사 중복 예시(주제에에)", c.includes("주제에에"));
  check("contract: 미완 어절 예시(한겨열)", c.includes("한겨열"));
  check("contract: IT·수학 용어 금지(마크업)", c.includes("마크업"));
  check("contract: 순서 주장 재확인(재진술)", c.includes("재진술"));
  check("contract: 선지 길이 편중 금지(1.3배)", c.includes("1.3배"));
  check("contract: 자료 근거 표면 지시(참고용 지문 복사 금지)", c.includes("참고용 지문"));
  check("contract: 자료 원문자 직접 삽입 금지(이중 마커)", c.includes("이중 마커"));
}

process.stdout.write(JSON.stringify({ passed, failed: failures.length, failures }));
`;

function runHarness() {
  const tmpDir = path.join(repoRoot, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".ko-quality-gates-w1-harness.mts");
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
      // ignore
    }
  }
}

const summary = runHarness();

test("ko quality gates W1: all cases pass", () => {
  assert.equal(
    summary.failed,
    0,
    `ko-quality-gates-w1 failures: ${JSON.stringify(summary.failures)}`,
  );
  assert.ok(summary.passed >= 40, `expected ≥40 checks, got ${summary.passed}`);
});
