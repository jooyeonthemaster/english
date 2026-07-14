/**
 * 어법(GRAMMAR_ERROR) "완전히 다른 접근" 전략 플러그인 13종 (작성: Fable, 26-07-14)
 *
 * 각 전략은 { id, describe, callPlan, generate(toolkit, passage) } 플러그인이다.
 * LLM 호출·후처리·검증·비용 계량은 전부 x-harness.ts 가 만든 Toolkit 이 주입한다
 * — src 모듈은 loadEnvConfig 후 동적 import 되어야 하므로, 이 파일은 zod 외
 * 정적 의존이 없다.
 *
 * 스키마 계약: 기존 GRAMMAR_ERROR AI 응답 스키마(buildAiGrammarErrorSchema(5,1))
 * 재사용 — direction·errorDesign·markedExpressions·correctAnswer(s)·options·
 * wrongOptionExplanations·explanation·keyPoints·tags·difficulty.
 * passageWithMarkers 는 하니스가 prod 후처리(processGrammarError)로 재구성한다.
 */
import { z } from "zod";

// ── 공용 타입 (하니스와의 계약) ─────────────────────────────────────────────

export type Difficulty = "INTERMEDIATE" | "ADVANCED" | "KILLER";

export interface PassageItem {
  id: string;
  year: number;
  exam: string;
  type: string;
  words: number;
  text: string;
  difficulty: Difficulty;
}

export interface CallLog {
  purpose: string;
  modelId: string;
  ms: number;
  attempts: number;
  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: number | null;
  costSource: string;
}

export interface FinalizeResult {
  ok: boolean;
  error?: string;
  question?: Record<string, unknown>;
  errors: string[];
  warnings: string[];
  answerRelPos: number | null;
  postProcess: "pipeline" | "fallback-mini" | null;
  positions?: unknown;
}

export interface GrammarCandidate {
  code: string;
  expression: string;
  surroundingText: string;
  note: string;
  trap: string;
  mutationHint: string;
  tier: string;
  relativePosition: number;
  sentenceOrdinal: number;
  earlyPositionDecoyOnly: boolean;
}

export interface Toolkit {
  /** buildAiGrammarErrorSchema(5, 1) — 밑줄 정확히 5개·정답 1개 계약 */
  schema5: z.ZodObject<z.ZodRawShape>;
  /** z.toJSONSchema(schema5) 텍스트 — 프롬프트 인라인 JSON 모드용(S10) */
  schema5JsonText: string;
  fewshot: { examples: string; sourcePassageId: string } | null;
  /** openai-compatible provider 이름 ("atlascloud") — providerOptions 키 */
  providerName: string;
  /** prod STANDARD 모델 id (google/gemini-3.5-flash) */
  standardModelId: string;
  calls: CallLog[];
  diffText(d: Difficulty): string;
  /** prod STANDARD(flash) 경로 — generateQuestionObject 재사용 (strict 스키마) */
  standardObject(args: {
    schema: z.ZodType;
    prompt: string;
    system?: string;
    purpose: string;
    maxTokens?: number;
  }): Promise<Record<string, unknown>>;
  /** prod STANDARD(flash) 텍스트 경로 — generateQuestionText 재사용 */
  standardText(args: { prompt: string; purpose: string; maxTokens?: number }): Promise<string>;
  /** 모델 오버라이드 직접 호출(strict 스키마) — S9/S11 */
  directObject(args: {
    modelId: string;
    schema: z.ZodType;
    prompt: string;
    purpose: string;
    maxTokens?: number;
    providerOptions?: Record<string, unknown>;
    timeoutMs?: number;
  }): Promise<Record<string, unknown>>;
  /** 모델 오버라이드 직접 호출(텍스트) — S10 (strict json_schema 금지 경로) */
  directText(args: {
    modelId: string;
    prompt: string;
    purpose: string;
    maxTokens?: number;
    providerOptions?: Record<string, unknown>;
    timeoutMs?: number;
  }): Promise<string>;
  /** parseJsonLoose + safeParsePromotingNullOptionals(schema5) 관대 파싱 */
  parseToSchema5(text: string): Record<string, unknown> | undefined;
  /** prod 후처리(passageWithMarkers 재구성) + validateQuestionQuality */
  finalize(
    passage: string,
    aiQuestion: Record<string, unknown>,
    difficulty: Difficulty,
  ): FinalizeResult;
  /** selectUsableGrammarCandidates(...).candidates — 구조화 후보 (S5) */
  grammarCandidates(passage: string, difficulty: Difficulty): GrammarCandidate[];
  /** buildQuestionTargetCandidateBlock("GRAMMAR_ERROR", ...) 텍스트 블록 (S5) */
  grammarCandidateBlock(passage: string, difficulty: Difficulty): string;
}

export interface StrategyOutput {
  aiQuestion: Record<string, unknown>;
  meta?: Record<string, unknown>;
}

export interface Strategy {
  id: string;
  describe: string;
  callPlan: string;
  generate(t: Toolkit, p: PassageItem): Promise<StrategyOutput>;
}

// ── 공용 프롬프트 조각 ──────────────────────────────────────────────────────

export const POINT_CODES = [
  "a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m",
] as const;

const POINT_LEGEND =
  "(a)정·준동사 (b)관계사 (c)분사능수동 (d)수일치 (e)능수동태 (f)형부자리 (g)대명사 (h)목적격보어 (i)병렬 (j)가정법 (k)to-v/v-ing (l)전치사vs.접속사 (m)비교구문";

function passageBlock(passage: string): string {
  return ["## 지문 (원문 — 표현을 인용할 때 한 글자도 바꾸지 않습니다)", passage].join("\n");
}

// S3 "제약 최소" 계약 그대로 — 후보블록·체크리스트·규칙 목록 없음.
const MINIMAL_RULES = [
  "- 밑줄 5개: (A)~(E), 지문 등장 순서대로 부여합니다.",
  "- 정답 1개: 어법상 명백한 비문이어야 합니다 — 원문 표현을 틀린 형태로 변형해 심습니다.",
  "- 미끼 4개: 원문 그대로 두되, 학생이 실제로 고민할 자리여야 합니다.",
  "- 해설은 한국어 합니다체로 작성합니다.",
].join("\n");

export function buildMinimalPrompt(p: PassageItem, diffText: string): string {
  return [
    "당신은 대한민국 수능 영어 어법 문항 출제자입니다. 아래 지문으로 수능 어법 문항 1개를 출제합니다.",
    "",
    MINIMAL_RULES,
    `- 난이도: ${p.difficulty} — ${diffText}`,
    "",
    passageBlock(p.text),
  ].join("\n");
}

const DIFF_TEXT_EN: Record<Difficulty, string> = {
  INTERMEDIATE:
    "mid-tier mock-exam level; the answer requires real deliberation, not first-glance scanning",
  ADVANCED:
    "upper-tier level; the answer should require parsing a clause boundary or skipping intervening modifiers",
  KILLER:
    "top-tier killer level for the grade-1 cutoff; long-distance dependency required, with attractive decoys",
};

// ── S2 fewshot-a ────────────────────────────────────────────────────────────

const s2FewshotA: Strategy = {
  id: "s2-fewshot-a",
  describe:
    "검증 A등급 실물 2문항(round-6/round-4, ebsi_go3_20151013-q19)을 모범 예시로 프롬프트에 포함한 few-shot 출제",
  callPlan: "flash x1",
  async generate(t, p) {
    if (!t.fewshot) {
      throw new Error(
        "fewshot examples unavailable (round-4/round-6 results.jsonl 에서 ebsi_go3_20151013-q19 미발견)",
      );
    }
    const prompt = [
      "당신은 대한민국 수능 영어 어법 문항 출제자입니다. 아래 지문으로 수능 어법 문항 1개를 출제합니다.",
      "",
      "다음은 우리 검증을 통과한 A등급 모범 예시 2개입니다. 밑줄 자리의 품질(5개 전부 구조적 판단 자리), 정답 오형의 명백성, 근거의 간결함을 이 수준으로 재현합니다. 예시의 지문·표현을 새 문항에 복사하지 않습니다.",
      "",
      t.fewshot.examples,
      "",
      "이제 아래 새 지문으로 같은 수준의 문항을 출제합니다.",
      MINIMAL_RULES,
      `- 난이도: ${p.difficulty} — ${t.diffText(p.difficulty)}`,
      "",
      passageBlock(p.text),
    ].join("\n");
    const aiQuestion = await t.standardObject({ schema: t.schema5, prompt, purpose: "generate" });
    return {
      aiQuestion,
      meta: {
        fewshotSource: t.fewshot.sourcePassageId,
        // 스크리닝 서브셋에 예시 원지문이 포함됨(코퍼스 idx 1) — 자기 오염 표기.
        fewshotContainsSamePassage: p.id === t.fewshot.sourcePassageId,
      },
    };
  },
};

// ── S3 minimal ──────────────────────────────────────────────────────────────

const s3Minimal: Strategy = {
  id: "s3-minimal",
  describe: "제약 최소 — 핵심 요구 4줄 + 스키마만 (후보블록·체크리스트·규칙 목록 전부 없음)",
  callPlan: "flash x1",
  async generate(t, p) {
    const aiQuestion = await t.standardObject({
      schema: t.schema5,
      prompt: buildMinimalPrompt(p, t.diffText(p.difficulty)),
      purpose: "generate",
    });
    return { aiQuestion };
  },
};

// ── S4 two-stage ────────────────────────────────────────────────────────────

const twoStageDesignSchema = z.object({
  answerSentence: z.string().describe("정답 오류를 심을 문장 — 지문 원문 그대로 1문장 인용합니다."),
  answerExpression: z
    .string()
    .describe("정답 자리의 원문 표현 (최소 문법 단위 1~3단어, 원문 그대로)"),
  errorForm: z
    .string()
    .describe("지문에 심을 오형 — answerExpression 의 어간을 유지하고 굴절·기능어만 틀리게 변형합니다."),
  answerPointCode: z.enum(POINT_CODES).describe(`정답 어법 포인트 코드. ${POINT_LEGEND}`),
  answerRationale: z
    .string()
    .describe("이 자리가 시험다운 정답 자리인 이유 1~2문장 (한국어 합니다체)"),
  decoys: z
    .array(
      z.object({
        expression: z.string().describe("미끼 자리의 원문 표현 (원문 그대로)"),
        pointCode: z.enum(POINT_CODES).describe(`이 미끼 자리의 어법 포인트 코드. ${POINT_LEGEND}`),
        why: z
          .string()
          .describe("학생이 이 자리에서 실제로 고민하게 되는 이유 1문장 (한국어 합니다체)"),
      }),
    )
    .length(4)
    .describe("미끼 4자리 — 정답과 서로 다른 문장을 우선하고, 장식 필러를 금지합니다."),
});

const s4TwoStage: Strategy = {
  id: "s4-two-stage",
  describe:
    "콜1 설계만(정답 자리 문장·오형·pointCode·미끼 4자리 — 소형 스키마) → 콜2 그 설계를 그대로 구현한 완성 문항",
  callPlan: "flash x2 (직렬: 설계→구현)",
  async generate(t, p) {
    const designPrompt = [
      "당신은 대한민국 수능 영어 어법 문항 설계자입니다. 아래 지문으로 어법 문항의 설계만 확정합니다. 문항 작성은 다음 단계에서 진행하므로, 여기서는 자리 선정과 오형 설계에만 집중합니다.",
      "",
      "- 정답 1자리: 오류를 심을 문장(원문 인용), 원문 표현, 오형, pointCode 를 확정합니다. 오형은 어법상 명백한 비문이어야 하고, 고치면 정확히 원문이 됩니다.",
      "- 미끼 4자리: 각각 원문 표현·pointCode·학생이 고민하게 되는 이유를 확정합니다. 정답과 서로 다른 문장을 우선하고, 장식 필러(단순 전치사·강조 does·지시사 that 단독 등)는 금지합니다.",
      `- pointCode 범례: ${POINT_LEGEND}`,
      `- 난이도: ${p.difficulty} — ${t.diffText(p.difficulty)}`,
      "",
      passageBlock(p.text),
    ].join("\n");
    const design = await t.standardObject({
      schema: twoStageDesignSchema,
      prompt: designPrompt,
      purpose: "design",
      maxTokens: 4_000,
    });

    const implPrompt = [
      "당신은 대한민국 수능 영어 어법 문항 출제자입니다. 아래 [확정 설계]를 그대로 구현한 수능 어법 문항 1개를 출력합니다.",
      "",
      "- 정답 자리·오형·pointCode·미끼 4자리를 설계에서 변경하지 않습니다. 설계의 인용이 지문 원문과 어긋나면 지문 원문을 따릅니다.",
      MINIMAL_RULES,
      `- 난이도: ${p.difficulty} — ${t.diffText(p.difficulty)}`,
      "",
      "## 확정 설계",
      JSON.stringify(design, null, 2),
      "",
      passageBlock(p.text),
    ].join("\n");
    const aiQuestion = await t.standardObject({
      schema: t.schema5,
      prompt: implPrompt,
      purpose: "implement",
    });
    return { aiQuestion, meta: { design } };
  },
};

// ── S5 code-designated ──────────────────────────────────────────────────────

const S_TIER_CODES = new Set(["a", "b", "c", "d", "e", "f", "i"]);

const s5CodeDesignated: Strategy = {
  id: "s5-code-designated",
  describe:
    "코드가 정답 자리를 결정론 지정 — 후보 탐지기(상대위치 0.2~0.85·S급 코드 a,b,c,d,e,f,i·mutation 힌트) 1순위 후보를 정답으로 고정, 미끼·해설만 모델 재량",
  callPlan: "flash x1 (+로컬 후보 탐지)",
  async generate(t, p) {
    const all = t.grammarCandidates(p.text, p.difficulty);
    let fallbackLevel = 0;
    let pick = all.find(
      (c) =>
        S_TIER_CODES.has(c.code) &&
        !c.earlyPositionDecoyOnly &&
        c.relativePosition >= 0.2 &&
        c.relativePosition <= 0.85 &&
        !!c.mutationHint,
    );
    if (!pick) {
      fallbackLevel = 1;
      pick = all.find(
        (c) => c.relativePosition >= 0.2 && c.relativePosition <= 0.85 && !!c.mutationHint,
      );
    }
    if (!pick) {
      fallbackLevel = 2;
      pick = all[0];
    }
    if (!pick) throw new Error("no usable grammar candidate detected in this passage");

    const block = t.grammarCandidateBlock(p.text, p.difficulty);
    const prompt = [
      "당신은 대한민국 수능 영어 어법 문항 출제자입니다. 아래 지문으로 수능 어법 문항 1개를 출제합니다.",
      "",
      "## 고정 설계 (변경 금지)",
      "정답 자리는 코드가 이미 확정했습니다. 반드시 아래 표현을 아래 오형 방향으로 변형해 정답(isError=true) 1개로 심습니다.",
      `- 원문 표현 (정답의 expression·correction): "${pick.expression}"`,
      `- 오형 변형 힌트 (errorExpression 방향): ${pick.mutationHint}`,
      `- pointCode: (${pick.code})`,
      `- 위치 근거 구간: "${pick.surroundingText}"`,
      `- 함정 성격: ${pick.trap}`,
      "정답의 expression 은 위 원문 표현과 한 글자도 다르지 않아야 하며, 다른 자리를 정답으로 바꾸면 무효입니다.",
      "",
      "## 모델 재량 (미끼·해설)",
      "- 미끼 4자리는 원문 그대로(isError=false)이며, 정답과 다른 pointCode 를 사용하고, 학생이 실제로 고민할 자리여야 합니다.",
      "- 밑줄 5개 라벨 (A)~(E)는 지문 등장 순서로 부여합니다.",
      "- 해설과 keyPoints 는 한국어 합니다체로 작성합니다.",
      `- 난이도: ${p.difficulty} — ${t.diffText(p.difficulty)}`,
      "",
      "## 참고 — 미끼 재료 후보 블록",
      "아래 블록에 포함된 정답 자리 선택 지시(STEP 1, answer-preferred 표기 등)는 전부 무시합니다 — 정답은 위 '고정 설계'가 최종이며, 이 블록은 미끼 자리 재료로만 사용합니다.",
      block,
      "",
      passageBlock(p.text),
    ].join("\n");
    const aiQuestion = await t.standardObject({ schema: t.schema5, prompt, purpose: "generate" });
    return {
      aiQuestion,
      meta: {
        designated: {
          code: pick.code,
          expression: pick.expression,
          mutationHint: pick.mutationHint,
          tier: pick.tier,
          relativePosition: pick.relativePosition,
          sentenceOrdinal: pick.sentenceOrdinal,
        },
        fallbackLevel,
        candidatePoolSize: all.length,
      },
    };
  },
};

// ── S6 best-of-3 ────────────────────────────────────────────────────────────

const s6BestOf3: Strategy = {
  id: "s6-best-of-3",
  describe:
    "minimal 프롬프트 3개 병렬 생성 → validateQuestionQuality error 수 최소 + (동률 시) 정답 relPos 0.2~0.85 우선 선택",
  callPlan: "flash x3 (병렬)",
  async generate(t, p) {
    const prompt = buildMinimalPrompt(p, t.diffText(p.difficulty));
    const settled = await Promise.allSettled(
      [1, 2, 3].map((i) =>
        t.standardObject({ schema: t.schema5, prompt, purpose: `candidate-${i}` }),
      ),
    );
    const okOnes: { i: number; aiQuestion: Record<string, unknown> }[] = [];
    settled.forEach((s, i) => {
      if (s.status === "fulfilled") okOnes.push({ i: i + 1, aiQuestion: s.value });
    });
    if (okOnes.length === 0) {
      const first = settled[0] as PromiseRejectedResult;
      throw new Error(
        `all 3 candidates failed: ${first.reason instanceof Error ? first.reason.message : String(first.reason)}`,
      );
    }
    const scored = okOnes.map((c) => ({ ...c, fin: t.finalize(p.text, c.aiQuestion, p.difficulty) }));
    const errRank = (x: (typeof scored)[number]) => (x.fin.ok ? x.fin.errors.length : 999);
    const bandRank = (x: (typeof scored)[number]) =>
      x.fin.answerRelPos !== null && x.fin.answerRelPos >= 0.2 && x.fin.answerRelPos <= 0.85
        ? 0
        : 1;
    const sorted = [...scored].sort(
      (a, b) => errRank(a) - errRank(b) || bandRank(a) - bandRank(b) || a.i - b.i,
    );
    const chosen = sorted[0];
    return {
      aiQuestion: chosen.aiQuestion,
      meta: {
        bestOf3: scored.map((x) => ({
          index: x.i,
          ok: x.fin.ok,
          errorCount: x.fin.ok ? x.fin.errors.length : null,
          errors: x.fin.errors,
          answerRelPos: x.fin.answerRelPos,
          chosen: x.i === chosen.i,
        })),
        generatedCandidates: okOnes.length,
        chosenIndex: chosen.i,
        chosenReason: `errors=${errRank(chosen)}, answerRelPos=${chosen.fin.answerRelPos ?? "?"} (${bandRank(chosen) === 0 ? "0.2~0.85 밴드 내" : "밴드 밖"})`,
      },
    };
  },
};

// ── S7 self-critique ────────────────────────────────────────────────────────

const s7SelfCritique: Strategy = {
  id: "s7-self-critique",
  describe: "생성 → 같은 모델의 학생 시점 블라인드 풀이+결함 3개 지적 → 지적 반영 수정 1회",
  callPlan: "flash x3 (직렬: 생성→비평→수정)",
  async generate(t, p) {
    const draft = await t.standardObject({
      schema: t.schema5,
      prompt: buildMinimalPrompt(p, t.diffText(p.difficulty)),
      purpose: "draft",
    });
    const draftFin = t.finalize(p.text, draft, p.difficulty);
    const shown = (draftFin.ok && draftFin.question ? draftFin.question : draft) as Record<
      string,
      unknown
    >;
    const me = Array.isArray(shown.markedExpressions)
      ? (shown.markedExpressions as Record<string, unknown>[])
      : [];
    const layout = me
      .map((m) => `${m.label}:${m.isError === true ? "정답" : "미끼"}=(${m.pointCode ?? "?"})`)
      .join("  ");

    const critiquePrompt = [
      "다음은 방금 출제된 수능 어법 문항입니다. 두 단계로 검수 의견을 작성합니다. 전부 한국어 합니다체로 씁니다.",
      "",
      "## 1단계 — 블라인드 풀이 (아래 '출제 정보'를 보기 전에 수행)",
      "학생 시점으로 지문의 (A)~(E) 밑줄을 하나씩 어법 판정하고(라벨당 근거 1문장), 어법상 틀린 것 하나를 고릅니다.",
      "",
      "## 2단계 — 결함 지적",
      "출제 정보와 1단계 풀이를 대조해, 이 문항의 결함을 정확히 3개 지적합니다. 각 결함은 '결함 n: (자리) — (문제) — (수정 방향)' 형식으로 씁니다. 필러 미끼, 한눈에 보이는 정답, 정답 포인트 중복, 해설-지문 불일치, 밑줄 몰림을 우선 의심합니다.",
      "",
      "## 문항 (학생에게 보이는 형태)",
      `발문: ${String(shown.direction ?? "다음 글의 밑줄 친 부분 중, 어법상 틀린 것은?")}`,
      "지문(밑줄):",
      String(shown.passageWithMarkers ?? "(밑줄 재구성 실패 — 아래 밑줄 설계를 참조합니다)"),
      "",
      "## 출제 정보 (2단계에서만 사용)",
      `정답: ${String(shown.correctAnswer ?? "?")}`,
      `밑줄 설계: ${layout}`,
      `해설: ${String(shown.explanation ?? "")}`,
    ].join("\n");
    const critique = await t.standardText({
      prompt: critiquePrompt,
      purpose: "critique",
      maxTokens: 3_000,
    });

    const draftJson: Record<string, unknown> = { ...draft };
    delete draftJson.errorDesign;
    const revisePrompt = [
      "아래 [초안 문항]을 [검수 의견]을 반영해 수정한 최종 수능 어법 문항 1개를 출력합니다.",
      "",
      "- 지적된 결함 3개를 모두 해소합니다. 정당한 정답 자리는 유지해도 되고, 결함의 원인이면 자리를 교체합니다.",
      MINIMAL_RULES,
      `- 난이도: ${p.difficulty} — ${t.diffText(p.difficulty)}`,
      "",
      "## 초안 문항",
      JSON.stringify(draftJson, null, 2),
      "",
      "## 검수 의견",
      critique,
      "",
      passageBlock(p.text),
    ].join("\n");
    const aiQuestion = await t.standardObject({
      schema: t.schema5,
      prompt: revisePrompt,
      purpose: "revise",
    });
    return {
      aiQuestion,
      meta: {
        critique: critique.slice(0, 2_500),
        draftAnswer: shown.correctAnswer ?? null,
        draftErrors: draftFin.errors,
      },
    };
  },
};

// ── S8 decoy-split ──────────────────────────────────────────────────────────

const answerOnlySchema = z.object({
  direction: z.string().describe("발문 (한국어)"),
  answerDesign: z
    .string()
    .describe(
      "내부 설계 메모: 정답 문장 인용, 오류 변형(원형→오형), 그 자리에서 비문인 통사적 이유, 반증 검사(다른 해석으로 읽어도 비문인지) 결과를 한국어 3~5문장으로 적습니다.",
    ),
  answer: z.object({
    expression: z.string().describe("정답 자리의 원문 표현 (최소 문법 단위 1~3단어, 원문 그대로)"),
    errorExpression: z
      .string()
      .describe("지문에 심을 오류 형태 — expression 의 어간을 유지하고 형태만 틀리게 변형합니다."),
    correction: z.string().describe("올바른 표현 — 원문 그대로 (expression 과 동일)"),
    surroundingText: z
      .string()
      .describe("판단 근거가 되는 원문 구간 40~120자를 그대로 인용합니다."),
    pointCode: z.enum(POINT_CODES).describe(`어법 출제 포인트 코드. ${POINT_LEGEND}`),
  }),
  explanation: z
    .string()
    .describe("정답 해설 (한국어 합니다체, 150~300자): 왜 비문인지, 무엇으로 고치는지 서술합니다."),
});

const s8DecoySplit: Strategy = {
  id: "s8-decoy-split",
  describe:
    "콜1 정답 1개만 심은 문항(미끼 없이 정답 밑줄+해설) → 콜2 정답을 가리지 않으면서 저울질이 성립하는 미끼 4자리 추가",
  callPlan: "flash x2 (직렬: 정답→미끼)",
  async generate(t, p) {
    const stage1Prompt = [
      "당신은 대한민국 수능 영어 어법 문항 출제자입니다. 아래 지문으로 어법 문항의 '정답 1개'만 먼저 확정합니다. 미끼는 이 단계에서 만들지 않습니다.",
      "",
      "- 정답 자리는 어법상 명백한 비문이 되도록 원문 표현의 형태만 틀리게 변형해 심습니다. 고치면 정확히 원문이 됩니다.",
      "- 해설은 한국어 합니다체로 작성합니다.",
      `- pointCode 범례: ${POINT_LEGEND}`,
      `- 난이도: ${p.difficulty} — ${t.diffText(p.difficulty)}`,
      "",
      passageBlock(p.text),
    ].join("\n");
    const stage1 = await t.standardObject({
      schema: answerOnlySchema,
      prompt: stage1Prompt,
      purpose: "answer-only",
      maxTokens: 4_000,
    });

    const stage2Prompt = [
      "1차 설계에서 아래와 같이 정답 1개만 심은 어법 문항이 확정되었습니다. 이제 미끼 4자리를 추가해 밑줄 5개 완성 문항을 출력합니다.",
      "",
      "## 확정 정답 (변경 금지)",
      JSON.stringify(
        { direction: stage1.direction, answer: stage1.answer, explanation: stage1.explanation },
        null,
        2,
      ),
      "",
      "## 요구사항",
      "- 정답 마커는 위 확정값의 expression·errorExpression·correction·pointCode·surroundingText 를 그대로 사용합니다. 라벨은 지문 등장 순서에 따라 부여합니다.",
      "- 미끼 4자리는 원문 그대로(isError=false)이며, 이 정답을 가리지 않으면서 저울질이 성립해야 합니다 — 정답과 다른 문장·다른 pointCode 를 우선하고, 각 미끼는 학생이 실제로 고민할 자리여야 합니다.",
      "- 미끼가 정답보다 더 틀려 보이면 안 됩니다 (정답 유일성 유지).",
      "- 해설·keyPoints 는 한국어 합니다체로 작성하고, 1차 해설을 기반으로 오답 위치 해설 4개를 추가합니다.",
      `- 난이도: ${p.difficulty} — ${t.diffText(p.difficulty)}`,
      "",
      passageBlock(p.text),
    ].join("\n");
    const aiQuestion = await t.standardObject({
      schema: t.schema5,
      prompt: stage2Prompt,
      purpose: "add-decoys",
    });
    return { aiQuestion, meta: { answerStage: stage1 } };
  },
};

// ── S9 model-pro ────────────────────────────────────────────────────────────

const PRO_MODEL = "google/gemini-3.1-pro-preview";

const s9ModelPro: Strategy = {
  id: "s9-model-pro",
  describe:
    "minimal 과 동일 프롬프트, 모델만 google/gemini-3.1-pro-preview — atlas openai-compatible 클라이언트 직접 호출(strict 스키마 동일 강제)",
  callPlan: "gemini-3.5-pro x1",
  async generate(t, p) {
    const prompt = buildMinimalPrompt(p, t.diffText(p.difficulty));
    try {
      const aiQuestion = await t.directObject({
        modelId: PRO_MODEL,
        schema: t.schema5,
        prompt,
        purpose: "generate",
      });
      return { aiQuestion, meta: { modelId: PRO_MODEL } };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // 세션 RCA: OR gemini 는 reasoning-disable 형상을 400 으로 거부할 수 있다
      // (env OPENROUTER_GEMINI_REASONING_EFFORT 부재 시 잠복 함정) — effort 지정 폴백 1회.
      if (/reasoning|400/i.test(msg)) {
        const aiQuestion = await t.directObject({
          modelId: PRO_MODEL,
          schema: t.schema5,
          prompt,
          purpose: "generate-reasoning-fallback",
          providerOptions: { [t.providerName]: { reasoning_effort: "low" } },
        });
        return {
          aiQuestion,
          meta: { modelId: PRO_MODEL, reasoningFallback: true, firstError: msg.slice(0, 200) },
        };
      }
      throw e;
    }
  },
};

// ── S10 model-claude ────────────────────────────────────────────────────────

const CLAUDE_MODEL = "anthropic/claude-sonnet-5";

const s10ModelClaude: Strategy = {
  id: "s10-model-claude",
  describe:
    "minimal 과 동일 프롬프트, anthropic/claude-sonnet-5 — strict json_schema 금지(프롬프트 JSON 지시+관대 파싱, 세션 RCA 결론)·reasoning off·PREMIUM 경로 미경유",
  callPlan: "claude-sonnet-5 x1 (파싱 실패 시 최대 2회)",
  async generate(t, p) {
    const prompt = [
      buildMinimalPrompt(p, t.diffText(p.difficulty)),
      "",
      "## 출력 형식",
      "마크다운·코드펜스·주석 없이 순수 JSON 객체 하나만 출력합니다.",
      "다음 JSON Schema 를 정확히 준수합니다:",
      t.schema5JsonText,
    ].join("\n");
    let lastSnippet = "";
    for (let attempt = 1; attempt <= 2; attempt++) {
      const text = await t.directText({
        modelId: CLAUDE_MODEL,
        prompt,
        purpose: attempt === 1 ? "generate" : "generate-retry",
        maxTokens: 16_000,
        providerOptions: { [t.providerName]: { reasoning: { enabled: false } } },
      });
      const parsed = t.parseToSchema5(text);
      if (parsed) {
        return {
          aiQuestion: parsed,
          meta: { modelId: CLAUDE_MODEL, strictJsonSchema: false, parseAttempts: attempt },
        };
      }
      lastSnippet = text.slice(0, 300);
    }
    throw new Error(`claude prompt-JSON parse/schema failed twice; head=${lastSnippet}`);
  },
};

// ── S11 reasoning-high ──────────────────────────────────────────────────────

const s11ReasoningHigh: Strategy = {
  id: "s11-reasoning-high",
  describe:
    "flash 그대로 + OpenRouter reasoning effort high (flash 는 disable 형상만 400, effort 지정은 허용)",
  callPlan: "flash(reasoning high) x1",
  async generate(t, p) {
    const aiQuestion = await t.directObject({
      modelId: t.standardModelId,
      schema: t.schema5,
      prompt: buildMinimalPrompt(p, t.diffText(p.difficulty)),
      purpose: "generate",
      maxTokens: 20_000,
      // transformRequestBody(atlas-ai)가 gemini 에서 reasoning_effort=high 를
      // reasoning:{enabled:true, effort:"high", exclude:true} 로 변환한다.
      providerOptions: { [t.providerName]: { reasoning_effort: "high" } },
      timeoutMs: 240_000,
    });
    return { aiQuestion, meta: { reasoningEffort: "high" } };
  },
};

// ── S12 english-inst ────────────────────────────────────────────────────────

const s12EnglishInst: Strategy = {
  id: "s12-english-inst",
  describe: "S3와 동일 내용의 지시를 전부 영어로 (해설 등 한국어 필드만 한국어 합니다체 요구)",
  callPlan: "flash x1",
  async generate(t, p) {
    const prompt = [
      "You are an item writer for the English section of the Korean CSAT (수능). Create exactly ONE grammar-error question from the passage below.",
      "",
      "- Underline exactly five spans, labeled (A) through (E) in their order of appearance in the passage.",
      "- Exactly one underline is the answer: an unambiguous grammatical error, planted by rewriting the original expression in an incorrect form.",
      "- The other four underlines are decoys: keep the original text unchanged, and each must be a grammar site a student would genuinely deliberate over.",
      "- Write `explanation`, `keyPoints`, and every Korean-facing field in Korean, using the formal 합니다체 register.",
      `- Difficulty: ${p.difficulty} — ${DIFF_TEXT_EN[p.difficulty]}`,
      "",
      "## Passage (quote expressions verbatim — do not alter a single character when citing)",
      p.text,
    ].join("\n");
    const aiQuestion = await t.standardObject({ schema: t.schema5, prompt, purpose: "generate" });
    return { aiQuestion };
  },
};

// ── S13 examiner-persona ────────────────────────────────────────────────────

// 연구노트 5절(평가 등급) 요지 — 리뷰어 공통 기준을 자가채점 기준으로 삽입.
const GRADE_CRITERIA = [
  "- A: 그대로 출제 가능 — 선생님이 밑줄만 봐도 5개 전부 출제 의도가 읽힙니다.",
  "- B: 경미 수정(미끼 1개 교체 또는 해설 한 줄 보강)으로 출제 가능합니다.",
  "- C: 정답은 성립하나 포인트 선정·배치가 아마추어 수준입니다.",
  "- F: 불량 — 비문이 아닌 정답, 오류 미심김, 환각 해설, 정답 포인트 중복으로 답 2개 가능, 마커 위치 오류.",
].join("\n");

const s13ExaminerPersona: Strategy = {
  id: "s13-examiner-persona",
  describe:
    "평가원 출제위원 페르소나 — 출제 → 연구노트 5절 기준 A~F 자가채점 → A 아니면 내부 수정 후 최종본만 출력",
  callPlan: "flash x1",
  async generate(t, p) {
    const prompt = [
      "당신은 한국교육과정평가원 어법 문항 출제위원입니다. 아래 지문으로 실제 수능 시험지에 인쇄될 수준의 어법 문항 1개를 출제합니다.",
      "",
      "## 출제 규칙",
      MINIMAL_RULES,
      `- 난이도: ${p.difficulty} — ${t.diffText(p.difficulty)}`,
      "",
      "## 자가채점 기준 (평가원 내부 검토 기준)",
      GRADE_CRITERIA,
      "",
      "## 절차",
      "1) 문항을 출제합니다.",
      "2) 위 기준으로 스스로 A~F 를 채점합니다.",
      "3) A 가 아니면 결함을 고치고 다시 채점합니다 — A 가 될 때까지 내부에서 반복합니다.",
      "4) A 가 된 최종본 1개만 JSON 으로 출력합니다. errorDesign 필드 끝에 '자가채점: A — (사유 1문장)' 을 기록합니다.",
      "",
      passageBlock(p.text),
    ].join("\n");
    const aiQuestion = await t.standardObject({ schema: t.schema5, prompt, purpose: "generate" });
    const design = typeof aiQuestion.errorDesign === "string" ? aiQuestion.errorDesign : "";
    const selfGrade = /자가채점\s*[::]?\s*([A-F])/.exec(design)?.[1] ?? null;
    return { aiQuestion, meta: { selfGrade } };
  },
};

// ── S14 site-enum ───────────────────────────────────────────────────────────

const s14SiteEnum: Strategy = {
  id: "s14-site-enum",
  describe:
    "정답 자리 공개 오디션 — 후보 5곳 나열·비교를 응답 스키마의 reasoning 필드로 강제, 최고 1곳 확정 후 문항 완성",
  callPlan: "flash x1",
  async generate(t, p) {
    // reasoning 필드를 스키마 최상단에 두어 "오디션 → 출제" 생성 순서를 강제한다.
    const schema = z.object({
      reasoning: z
        .string()
        .describe(
          "정답 자리 오디션(한국어): 이 지문에서 가장 시험다운 오류 후보 5곳을 'n) 원문 표현 — pointCode — 오형(원형→틀린형) — 시험다움 평가' 형식으로 나열·비교하고, 마지막 줄에 '최종 선택: n) …' 으로 최고 1곳을 확정합니다. 이 필드를 완성한 뒤에만 문항을 작성합니다.",
        ),
      ...t.schema5.shape,
    });
    const prompt = [
      "당신은 대한민국 수능 영어 어법 문항 출제자입니다. 아래 지문으로 수능 어법 문항 1개를 출제합니다.",
      "",
      "## 절차",
      "1) reasoning 필드: 먼저 이 지문에서 가장 시험다운 오류 후보 5곳을 나열하고 서로 비교 평가합니다 (장거리 판단인가, 학생이 실제로 갈리는가). 마지막 줄에 '최종 선택: …' 으로 최고 1곳을 정답으로 확정합니다.",
      "2) 확정한 자리를 정답으로 심어 문항을 완성합니다. 남은 후보 중 좋은 자리는 미끼로 활용해도 됩니다.",
      `참고 — pointCode 범례: ${POINT_LEGEND}`,
      "",
      "## 출제 규칙",
      MINIMAL_RULES,
      `- 난이도: ${p.difficulty} — ${t.diffText(p.difficulty)}`,
      "",
      passageBlock(p.text),
    ].join("\n");
    const out = await t.standardObject({ schema, prompt, purpose: "generate", maxTokens: 16_000 });
    const { reasoning, ...aiQuestion } = out as Record<string, unknown> & { reasoning?: unknown };
    return {
      aiQuestion,
      meta: { reasoning: typeof reasoning === "string" ? reasoning.slice(0, 2_500) : null },
    };
  },
};

// ── S15~S20 중국계 최신 모델 스왑 (26-07-14 유저 지시 — s9 gemini-pro 대체) ──
// minimal 프롬프트 고정, 모델만 교체. reasoning 형상 400 거부 시 effort 폴백은
// s9 패턴 재사용. strict 스키마는 openai-compatible 공통 경로 그대로.

function makeCnModelStrategy(idSuffix: string, modelId: string, note: string): Strategy {
  return {
    id: `s15-cn-${idSuffix}`,
    describe: `minimal 동일 프롬프트, 모델만 ${modelId} — ${note}`,
    callPlan: `${modelId} x1`,
    async generate(t, p) {
      const prompt = buildMinimalPrompt(p, t.diffText(p.difficulty));
      try {
        const aiQuestion = await t.directObject({
          modelId,
          schema: t.schema5,
          prompt,
          purpose: "generate",
        });
        return { aiQuestion, meta: { modelId } };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (/reasoning|400|schema|json/i.test(msg)) {
          // 스키마/reasoning 형상 거부 모델 폴백: 플레인 JSON 지시 + 관대 파싱 (s10 패턴)
          const text = await t.directText({
            modelId,
            prompt: `${prompt}\n\n다음 JSON 스키마 형태로만 응답하십시오(설명·마크다운 금지):\n${t.schema5JsonText}`,
            purpose: "generate-plain-fallback",
          });
          const aiQuestion = t.parseToSchema5(text);
          // s10 패턴과 동일한 파싱 실패 처리 — undefined 를 StrategyOutput 에
          // 넣지 않는다(타입 오류 수리, 폴백 파싱 실패 시 원 오류 전파).
          if (!aiQuestion) throw e;
          return { aiQuestion, meta: { modelId, plainFallback: true, firstError: msg.slice(0, 200) } };
        }
        throw e;
      }
    },
  };
}

const CN_MODEL_STRATEGIES: Strategy[] = [
  makeCnModelStrategy("glm52", "z-ai/glm-5.2", "Z.AI GLM 5.2 (유저 지명)"),
  makeCnModelStrategy("dsv4f", "deepseek/deepseek-v4-flash", "DeepSeek 최신 경량 ($0.09/$0.18 — gemini 대비 1/16 가격)"),
  makeCnModelStrategy("dsv4p", "deepseek/deepseek-v4-pro", "DeepSeek V4 Pro"),
  makeCnModelStrategy("kimi26", "moonshotai/kimi-k2.5", "Moonshot Kimi K2.5 (K2.6 스키마 파싱 실패로 강등)"),
  makeCnModelStrategy("mmx3", "minimax/minimax-m3", "MiniMax M3"),
  makeCnModelStrategy("qw3max", "qwen/qwen3-max", "Qwen3 Max"),
];

// ── W3 조합 전략 2종 (Wave3, 26-07-14) ──────────────────────────────────────
// 기존 재료 조합: s9(pro 직접호출+reasoning 폴백) × s2(few-shot 예시블록) ×
// s8(미끼분리 2단) + 결정론 게이트 사다리(하드블록 재생성 / 표적수리 1콜).

/** 전체 재생성을 트리거하는 하드블록 코드 (t.finalize 의 errors 기준) */
const W3_HARD_BLOCK_CODES = new Set([
  "grammar-error-not-mutated",
  "grammar-answer-nonword-forced",
  "grammar-obvious-noun-what-relative",
  "grammar-killer-answer-point-repeated",
]);

const W3_MAX_REGENS = 2;

interface W3Positions {
  markers: {
    label: string;
    isError: boolean;
    relPos: number | null;
    sentenceIndex: number;
    found: boolean;
  }[];
  notFoundCount: number;
}

interface W3LadderEvent {
  action: "regenerate" | "repair" | "repair-failed" | "accept" | "give-up";
  attempt?: number;
  trigger?: string[];
  /** 이 조치로 사라진 코드 (해소 코드) */
  resolved?: string[];
  /** 조치 후에도 남은 코드 */
  remaining?: string[];
  error?: string;
}

function w3HardBlocks(fin: FinalizeResult): string[] {
  // 후처리 자체가 실패하면 마커를 심지 못한 것 — marker notFound 계열로 취급.
  if (!fin.ok) return [`finalize-failed:${(fin.error ?? "unknown").slice(0, 80)}`];
  const out = fin.errors.filter(
    (c) => W3_HARD_BLOCK_CODES.has(c) || c.includes("render-marker-count"),
  );
  const pos = fin.positions as W3Positions | null | undefined;
  if (pos && pos.notFoundCount > 0) out.push(`marker-not-found(${pos.notFoundCount})`);
  return [...new Set(out)];
}

/** 하드블록이 아닌 error + 배치위반(첫문장 정답·relPos<0.2·동일문장 밑줄 2+) */
function w3SoftDefects(fin: FinalizeResult): string[] {
  if (!fin.ok) return [];
  const out = fin.errors.filter(
    (c) => !W3_HARD_BLOCK_CODES.has(c) && !c.includes("render-marker-count"),
  );
  const pos = fin.positions as W3Positions | null | undefined;
  const answer = pos?.markers.find((m) => m.isError);
  if (answer && answer.found && answer.sentenceIndex === 0)
    out.push("placement-answer-first-sentence");
  if (fin.answerRelPos !== null && fin.answerRelPos < 0.2)
    out.push("placement-answer-relpos-lt-0.2");
  if (pos) {
    const bySentence = new Map<number, number>();
    for (const m of pos.markers) {
      if (m.sentenceIndex >= 0)
        bySentence.set(m.sentenceIndex, (bySentence.get(m.sentenceIndex) ?? 0) + 1);
    }
    if ([...bySentence.values()].some((n) => n >= 2))
      out.push("placement-same-sentence-multi-underline");
  }
  return [...new Set(out)];
}

const W3_DEFECT_GLOSS: Record<string, string> = {
  "grammar-decoy-filler-span":
    "필러 미끼 — 장식 자리(단순 전치사·강조 does 등)입니다. 학생이 실제 고민할 구조 자리로 교체합니다.",
  "grammar-explanation-lint": "해설 린트 위반 — 해설 문구를 규정 형식에 맞게 수정합니다.",
  "grammar-category-mislabel": "pointCode 오태깅 — 실제 문법 포인트에 맞는 코드로 바로잡습니다.",
  "grammar-keypoint-choice-mismatch": "keyPoints 와 밑줄 설계가 불일치합니다 — keyPoints 를 바로잡습니다.",
  "grammar-answer-point-not-core": "정답 포인트가 핵심 어법 포인트가 아닙니다.",
  "grammar-nonstandard-terminology": "비표준 문법 용어 사용 — 표준 용어로 수정합니다.",
  "placement-answer-first-sentence":
    "정답 밑줄이 첫 문장에 있습니다 — 정답 자리를 더 뒤 문장으로 옮깁니다.",
  "placement-answer-relpos-lt-0.2":
    "정답 밑줄이 지문 앞 20% 구간에 있습니다 — 더 뒤의 자리로 옮깁니다.",
  "placement-same-sentence-multi-underline":
    "같은 문장에 밑줄이 2개 이상 몰렸습니다 — 밑줄을 서로 다른 문장으로 분산합니다.",
};

function w3DefectLines(codes: string[]): string {
  return codes.map((c) => `- ${c}: ${W3_DEFECT_GLOSS[c] ?? "결정론 검사 반려 코드입니다."}`).join("\n");
}

/**
 * s9 패턴 재사용: 직접호출 + reasoning-disable 형상 400 거부 시 effort 폴백 1회.
 * 스모크 1차에서 확인된 산발 파싱 실패("No object generated: could not parse")는
 * 동일 형상 재시도 1회로 흡수한다.
 *
 * 모델은 단일 전역이 아니라 "역할별" 맵 — w3ProObject 가 args.purpose 프리픽스로
 * 역할을 판별해 선택한다 (26-07-14 w4 조합 실험용 파라미터화):
 *   answer = 정답 생성 콜 ("answer-only", 하드게이트 "generate", 판별 불가 전부)
 *   decoy  = 미끼 생성 콜 ("add-decoys")
 *   repair = 표적수리 콜 ("repair")
 * 기본값은 전 역할 PRO_MODEL — 기존 w3-triple-ladder 동작과 바이트 동일.
 */
type W3Role = "answer" | "decoy" | "repair";
type W3RoleModels = Record<W3Role, string>;

const W3_DEFAULT_ROLES: W3RoleModels = {
  answer: PRO_MODEL,
  decoy: PRO_MODEL,
  repair: PRO_MODEL,
};

let W3_ROLES: W3RoleModels = { ...W3_DEFAULT_ROLES };

function w3RoleOf(purpose: string): W3Role {
  if (purpose.startsWith("add-decoys")) return "decoy";
  if (purpose.startsWith("repair")) return "repair";
  return "answer"; // "answer-only"·"generate"·판별 불가 purpose 전부
}

/** 역할 맵을 바꿔 사다리를 실행하고 finally 에서 원복하는 래퍼 공용부. */
let w3OverrideDepth = 0;

async function w3WithRoles(
  roles: W3RoleModels,
  run: () => Promise<StrategyOutput>,
): Promise<StrategyOutput> {
  // 하니스는 전략을 순차 실행하므로 동시 generate(CONC=3)는 항상 같은 롤맵을
  // 공유한다 — 먼저 끝난 워커가 진행 중인 워커의 롤맵을 되돌리지 않도록
  // 깊이 카운터로 마지막 종료 시에만 기본값으로 원복한다.
  w3OverrideDepth++;
  W3_ROLES = roles;
  try {
    return await run();
  } finally {
    if (--w3OverrideDepth === 0) W3_ROLES = { ...W3_DEFAULT_ROLES };
  }
}

async function w3ProObject(
  t: Toolkit,
  args: { schema: z.ZodType; prompt: string; purpose: string; maxTokens?: number },
): Promise<{ object: Record<string, unknown>; reasoningFallback: boolean }> {
  const modelId = W3_ROLES[w3RoleOf(args.purpose)];
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const object = await t.directObject({
        modelId,
        ...args,
        purpose: attempt === 1 ? args.purpose : `${args.purpose}-parse-retry`,
      });
      return { object, reasoningFallback: false };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const parseFail = /no object generated|could not parse/i.test(msg);
      if (parseFail && attempt === 1) continue;
      if (!parseFail && /reasoning|400/i.test(msg)) {
        const object = await t.directObject({
          modelId,
          ...args,
          purpose: `${args.purpose}-reasoning-fallback`,
          providerOptions: { [t.providerName]: { reasoning_effort: "low" } },
        });
        return { object, reasoningFallback: true };
      }
      throw e;
    }
  }
  throw new Error(`w3ProObject unreachable (${args.purpose})`);
}

/** s2 패턴 재사용: 검증 A등급 실물 2문항 few-shot 블록 (없으면 s2 와 동일하게 실패) */
function w3FewshotBlock(t: Toolkit): string {
  if (!t.fewshot) {
    throw new Error(
      "fewshot examples unavailable (round-4/round-6 results.jsonl 에서 ebsi_go3_20151013-q19 미발견)",
    );
  }
  return [
    "다음은 우리 검증을 통과한 A등급 모범 예시 2개입니다. 밑줄 자리의 품질(5개 전부 구조적 판단 자리), 정답 오형의 명백성, 근거의 간결함을 이 수준으로 재현합니다. 예시의 지문·표현을 새 문항에 복사하지 않습니다.",
    "",
    t.fewshot.examples,
  ].join("\n");
}

function w3RejectLine(rejectNote: string | null): string[] {
  return rejectNote
    ? [`- 직전 시도 반려: ${rejectNote} — 같은 결함이 재발하지 않도록 출제합니다.`]
    : [];
}

/** s8 패턴 재사용: pro 2콜 미끼분리 (콜1 정답만 → 콜2 미끼 4개) + few-shot 블록 */
async function w3GenerateSplit(
  t: Toolkit,
  p: PassageItem,
  rejectNote: string | null,
): Promise<{ aiQuestion: Record<string, unknown>; answerStage: Record<string, unknown>; reasoningFallback: boolean }> {
  const stage1Prompt = [
    "당신은 대한민국 수능 영어 어법 문항 출제자입니다. 아래 지문으로 어법 문항의 '정답 1개'만 먼저 확정합니다. 미끼는 이 단계에서 만들지 않습니다.",
    "",
    w3FewshotBlock(t),
    "",
    "- 정답 자리는 어법상 명백한 비문이 되도록 원문 표현의 형태만 틀리게 변형해 심습니다. 고치면 정확히 원문이 됩니다.",
    "- 해설은 한국어 합니다체로 작성합니다.",
    `- pointCode 범례: ${POINT_LEGEND}`,
    `- 난이도: ${p.difficulty} — ${t.diffText(p.difficulty)}`,
    ...w3RejectLine(rejectNote),
    "",
    passageBlock(p.text),
  ].join("\n");
  const s1 = await w3ProObject(t, {
    schema: answerOnlySchema,
    prompt: stage1Prompt,
    purpose: "answer-only",
  });

  const stage2Prompt = [
    "1차 설계에서 아래와 같이 정답 1개만 심은 어법 문항이 확정되었습니다. 이제 미끼 4자리를 추가해 밑줄 5개 완성 문항을 출력합니다.",
    "",
    w3FewshotBlock(t),
    "",
    "## 확정 정답 (변경 금지)",
    JSON.stringify(
      { direction: s1.object.direction, answer: s1.object.answer, explanation: s1.object.explanation },
      null,
      2,
    ),
    "",
    "## 요구사항",
    "- 정답 마커는 위 확정값의 expression·errorExpression·correction·pointCode·surroundingText 를 그대로 사용합니다. 라벨은 지문 등장 순서에 따라 부여합니다.",
    "- 미끼 4자리는 원문 그대로(isError=false)이며, 이 정답을 가리지 않으면서 저울질이 성립해야 합니다 — 정답과 다른 문장·다른 pointCode 를 우선하고, 각 미끼는 학생이 실제로 고민할 자리여야 합니다.",
    "- 미끼가 정답보다 더 틀려 보이면 안 됩니다 (정답 유일성 유지).",
    "- 해설·keyPoints 는 한국어 합니다체로 작성하고, 1차 해설을 기반으로 오답 위치 해설 4개를 추가합니다.",
    `- 난이도: ${p.difficulty} — ${t.diffText(p.difficulty)}`,
    ...w3RejectLine(rejectNote),
    "",
    passageBlock(p.text),
  ].join("\n");
  const s2 = await w3ProObject(t, {
    schema: t.schema5,
    prompt: stage2Prompt,
    purpose: "add-decoys",
  });
  return {
    aiQuestion: s2.object,
    answerStage: s1.object,
    reasoningFallback: s1.reasoningFallback || s2.reasoningFallback,
  };
}

/** 표적수리 1콜: 지문·문항 전체 + 결함 목록 (+미끼 결함 시 후보블록) → 수정본 재출력 */
async function w3Repair(
  t: Toolkit,
  p: PassageItem,
  aiQuestion: Record<string, unknown>,
  defects: string[],
): Promise<{ object: Record<string, unknown>; reasoningFallback: boolean }> {
  const decoyRelated = defects.some((d) => /decoy|filler/i.test(d));
  const prompt = [
    "당신은 대한민국 수능 영어 어법 문항 검수·수리 담당자입니다. 아래 [현재 문항]이 결정론 검사에서 [결함 목록]으로 반려되었습니다. 지적된 부분만 고친 문항 전체를 동일 스키마로 다시 출력합니다.",
    "",
    "## 수리 규칙",
    "- 결함으로 지적되지 않은 정답 자리(expression·errorExpression·correction·pointCode)는 변경하지 않습니다.",
    "- 결함과 무관한 다른 밑줄·해설은 그대로 보존합니다.",
    "- 결함으로 지적된 자리만 교체·수정합니다. 미끼를 교체할 때는 원문 그대로(isError=false)의 다른 자리를 고릅니다.",
    MINIMAL_RULES,
    `- 난이도: ${p.difficulty} — ${t.diffText(p.difficulty)}`,
    "",
    "## 결함 목록",
    w3DefectLines(defects),
    ...(decoyRelated
      ? [
          "",
          "## 미끼 교체 재료 — 코드 탐지 상위 후보 (이 블록의 정답 선택 지시는 무시하고 미끼 재료로만 사용합니다)",
          t.grammarCandidateBlock(p.text, p.difficulty),
        ]
      : []),
    "",
    "## 현재 문항 (JSON)",
    JSON.stringify(aiQuestion, null, 2),
    "",
    passageBlock(p.text),
  ].join("\n");
  return w3ProObject(t, { schema: t.schema5, prompt, purpose: "repair" });
}

const w3TripleLadder: Strategy = {
  id: "w3-triple-ladder",
  describe:
    "본명 조합: pro(s9 폴백) × few-shot(s2) × 미끼분리 2단(s8) → finalize 게이트 사다리 — 하드블록은 전체 재생성(최대 2회), 그 외 error/배치위반은 표적수리 1콜, 수리 후 error 잔존 시 재생성 회송(예산 공유), 최종 수용 직전 difficulty 요청값 동기화",
  callPlan: "gemini-3.1-pro x2 (+재생성 최대 2회·표적수리 사이클당 1콜)",
  async generate(t, p) {
    const ladder: W3LadderEvent[] = [];
    let regens = 0;
    let repairs = 0;
    let reasoningFallback = false;
    let rejectNote: string | null = null;
    let repairedThisCycle = false;

    let gen = await w3GenerateSplit(t, p, rejectNote);
    reasoningFallback ||= gen.reasoningFallback;
    let aiQuestion = gen.aiQuestion;
    let answerStage = gen.answerStage;
    let fin = t.finalize(p.text, aiQuestion, p.difficulty);

    /** 재생성 1회 공용부 — 하드블록 재생성과 (패치1) 잔존 error 회송이 같은 예산을 쓴다. */
    const regenerate = async (trigger: string[], residual: boolean) => {
      regens++;
      repairedThisCycle = false;
      rejectNote = trigger.join(", ");
      gen = await w3GenerateSplit(t, p, rejectNote);
      reasoningFallback ||= gen.reasoningFallback;
      aiQuestion = gen.aiQuestion;
      answerStage = gen.answerStage;
      fin = t.finalize(p.text, aiQuestion, p.difficulty);
      const after = [...w3HardBlocks(fin), ...w3SoftDefects(fin)];
      ladder.push({
        action: "regenerate",
        attempt: regens,
        // 회송 재생성은 로그에서 구분 가능하도록 트리거 코드에 residual: 접두를 단다.
        trigger: residual ? trigger.map((c) => `residual:${c}`) : trigger,
        resolved: trigger.filter((c) => !after.includes(c)),
        remaining: after,
      });
    };

    for (;;) {
      const hard = w3HardBlocks(fin);
      if (hard.length > 0) {
        if (regens >= W3_MAX_REGENS) {
          ladder.push({ action: "give-up", trigger: hard, remaining: [...hard, ...w3SoftDefects(fin)] });
          break;
        }
        await regenerate(hard, false);
        continue;
      }
      const soft = w3SoftDefects(fin);
      if (soft.length > 0 && !repairedThisCycle) {
        repairedThisCycle = true;
        repairs++;
        try {
          const rep = await w3Repair(t, p, aiQuestion, soft);
          reasoningFallback ||= rep.reasoningFallback;
          aiQuestion = rep.object;
          fin = t.finalize(p.text, aiQuestion, p.difficulty);
          const after = [...w3HardBlocks(fin), ...w3SoftDefects(fin)];
          ladder.push({
            action: "repair",
            trigger: soft,
            resolved: soft.filter((c) => !after.includes(c)),
            remaining: after,
          });
        } catch (e) {
          // 표적수리는 기회 조치 — 실패해도 수리 전 문항(하드블록 없음)을 버리지 않는다.
          ladder.push({
            action: "repair-failed",
            trigger: soft,
            remaining: soft,
            error: (e instanceof Error ? e.message : String(e)).slice(0, 200),
          });
        }
        continue; // 수리 후 하드블록이 남으면 위 재생성 분기로 진입한다.
      }
      // 패치 1 롤백 (26-07-15 결승 실측): 잔존 error 재생성 회송은 품질 델타 0에
      // 원가만 +45~130% — 게다가 회송이 W3_MAX_REGENS 예산을 선점해 진짜 하드블록
      // 재생성 여력을 잠식(3f-pr F 2건의 원인). "수리 1콜 후 수용" 정책으로 회귀.
      ladder.push({ action: "accept", remaining: [...new Set([...fin.errors, ...soft])] });
      break;
    }

    // 패치 2 (26-07-14 파레토): 전 조합 B 강등 최다 사유 = 요청 난이도와 모델 출력
    // question.difficulty 불일치 — 최종 수용 직전에 요청 difficulty 로 결정론
    // 덮어쓰기(모델 출력 무시). 게이트는 requestedDifficulty 파라미터만 읽고
    // 후처리는 difficulty 를 그대로 통과시키므로 검증 결과는 불변이다.
    const modelDifficulty =
      typeof aiQuestion.difficulty === "string" ? aiQuestion.difficulty : null;
    const difficultySynced = aiQuestion.difficulty !== p.difficulty;
    aiQuestion = { ...aiQuestion, difficulty: p.difficulty };

    return {
      aiQuestion,
      meta: {
        modelId: W3_ROLES.answer,
        w3Roles: { ...W3_ROLES },
        reasoningFallback,
        ladder,
        regenerations: regens,
        repairs,
        answerStage,
        modelDifficulty,
        difficultySynced,
        finalOk: fin.ok,
        finalErrors: fin.errors,
        finalWarnings: fin.warnings,
        finalSoftDefects: w3SoftDefects(fin),
        finalAnswerRelPos: fin.answerRelPos,
      },
    };
  },
};

const w3FlashLadder: Strategy = {
  id: "w3-flash-ladder",
  describe: "w3-triple-ladder 동일 구성, 생성·수리 모델만 flash — 사다리의 모델 독립성/저가 검증",
  callPlan: "flash x3 (사다리)",
  generate(t, p) {
    return w3WithRoles(
      { answer: t.standardModelId, decoy: t.standardModelId, repair: t.standardModelId },
      () => w3TripleLadder.generate(t, p),
    );
  },
};

const w3ProFewshotHardgate: Strategy = {
  id: "w3-pro-fewshot-hardgate",
  describe:
    "경량 대조: pro(s9 폴백) × few-shot(s2) 원콜(미끼분리 없음) + 하드블록 재생성만(표적수리 없음) — 사다리 효과 분리 측정용",
  callPlan: "gemini-3.1-pro x1 (+하드블록 재생성 최대 2회)",
  async generate(t, p) {
    const genOnce = async (rejectNote: string | null) => {
      const prompt = [
        "당신은 대한민국 수능 영어 어법 문항 출제자입니다. 아래 지문으로 수능 어법 문항 1개를 출제합니다.",
        "",
        w3FewshotBlock(t),
        "",
        "이제 아래 새 지문으로 같은 수준의 문항을 출제합니다.",
        MINIMAL_RULES,
        `- 난이도: ${p.difficulty} — ${t.diffText(p.difficulty)}`,
        ...w3RejectLine(rejectNote),
        "",
        passageBlock(p.text),
      ].join("\n");
      return w3ProObject(t, { schema: t.schema5, prompt, purpose: "generate" });
    };

    const ladder: W3LadderEvent[] = [];
    let regens = 0;
    let reasoningFallback = false;

    let res = await genOnce(null);
    reasoningFallback ||= res.reasoningFallback;
    let fin = t.finalize(p.text, res.object, p.difficulty);

    for (;;) {
      const hard = w3HardBlocks(fin);
      if (hard.length === 0) {
        ladder.push({
          action: "accept",
          remaining: [...new Set([...fin.errors, ...w3SoftDefects(fin)])],
        });
        break;
      }
      if (regens >= W3_MAX_REGENS) {
        ladder.push({ action: "give-up", trigger: hard, remaining: [...hard, ...w3SoftDefects(fin)] });
        break;
      }
      regens++;
      res = await genOnce(hard.join(", "));
      reasoningFallback ||= res.reasoningFallback;
      fin = t.finalize(p.text, res.object, p.difficulty);
      const after = [...w3HardBlocks(fin), ...w3SoftDefects(fin)];
      ladder.push({
        action: "regenerate",
        attempt: regens,
        trigger: hard,
        resolved: hard.filter((c) => !after.includes(c)),
        remaining: after,
      });
    }

    return {
      aiQuestion: res.object,
      meta: {
        modelId: W3_ROLES.answer,
        w3Roles: { ...W3_ROLES },
        reasoningFallback,
        ladder,
        regenerations: regens,
        repairs: 0,
        finalOk: fin.ok,
        finalErrors: fin.errors,
        finalWarnings: fin.warnings,
        finalSoftDefects: w3SoftDefects(fin),
        finalAnswerRelPos: fin.answerRelPos,
      },
    };
  },
};

// ── W4 역할별 모델 조합 8종 (Wave4, 26-07-14) ───────────────────────────────
// w3-triple-ladder 사다리(few-shot × 미끼분리 2단 × 게이트 사다리) 고정,
// 역할(answer=정답 생성 / decoy=미끼 생성 / repair=표적수리)별 모델만 교체해
// "어느 콜에 비싼 모델이 필요한가"를 분리 측정한다.

const FLASH_MODEL = "google/gemini-3.5-flash";
const FLASH_LITE_MODEL = "google/gemini-3.1-flash-lite";
const FLASH3_PREVIEW_MODEL = "google/gemini-3-flash-preview";
const PRO25_MODEL = "google/gemini-2.5-pro";

function makeW4(id: string, answer: string, decoy: string, repair: string): Strategy {
  const short = (m: string) => m.replace(/^google\//, "");
  return {
    id,
    describe: `w3-triple-ladder 역할별 모델 조합 — answer=${short(answer)} / decoy=${short(decoy)} / repair=${short(repair)}`,
    callPlan: `${short(answer)}(정답)+${short(decoy)}(미끼) x1 (+재생성 최대 2회·표적수리=${short(repair)})`,
    generate: (t, p) =>
      w3WithRoles({ answer, decoy, repair }, () => w3TripleLadder.generate(t, p)),
  };
}

const W4_COMBO_STRATEGIES: Strategy[] = [
  makeW4("w4-p-f-p", PRO_MODEL, FLASH_MODEL, PRO_MODEL),
  makeW4("w4-p-l-p", PRO_MODEL, FLASH_LITE_MODEL, PRO_MODEL),
  makeW4("w4-p-f-f", PRO_MODEL, FLASH_MODEL, FLASH_MODEL),
  makeW4("w4-f-p-p", FLASH_MODEL, PRO_MODEL, PRO_MODEL),
  makeW4("w4-3f-all", FLASH3_PREVIEW_MODEL, FLASH3_PREVIEW_MODEL, FLASH3_PREVIEW_MODEL),
  makeW4("w4-3f-pr", FLASH3_PREVIEW_MODEL, FLASH3_PREVIEW_MODEL, PRO_MODEL),
  makeW4("w4-25p-all", PRO25_MODEL, PRO25_MODEL, PRO25_MODEL),
  makeW4("w4-l-l-pr", FLASH_LITE_MODEL, FLASH_LITE_MODEL, PRO_MODEL),
];

// ── W5 flash-guard (Wave5, 26-07-14) ────────────────────────────────────────
// 일반(STANDARD) 라인 후보 — 프리미엄 결승 스펙(few-shot × 게이트)의 저가 미러.
// 생성은 flash 단일 콜(미끼분리 없음 — 저가 우선), 게이트는 하드블록(w3HardBlocks)
// 또는 결정론 error(fin.errors) 존재 시 전체 재생성 ≤2회(반려 사유 주입, w3 패턴).
// ⚠️ 표적수리 콜 금지 — flash 수리는 해설 환각 실증으로 금지. 예산 소진 시
// 잔존 수용(ladder 에 give-up 기록). difficulty 동기화(패치2) 동일 적용.

const w5FlashGuard: Strategy = {
  id: "w5-flash-guard",
  describe:
    "STANDARD 라인 후보: flash 단일 콜(few-shot(s2)×미니멀 규칙, 미끼분리 없음) + finalize 게이트 — 하드블록/결정론 error 시 전체 재생성 ≤2회(표적수리 콜 금지), 예산 소진 시 잔존 수용, 최종 수용 직전 difficulty 동기화",
  callPlan: "flash x1 (+전체 재생성 최대 2회, 수리 콜 없음)",
  async generate(t, p) {
    const genOnce = async (rejectNote: string | null) => {
      const prompt = [
        "당신은 대한민국 수능 영어 어법 문항 출제자입니다. 아래 지문으로 수능 어법 문항 1개를 출제합니다.",
        "",
        w3FewshotBlock(t),
        "",
        "이제 아래 새 지문으로 같은 수준의 문항을 출제합니다.",
        MINIMAL_RULES,
        `- 난이도: ${p.difficulty} — ${t.diffText(p.difficulty)}`,
        ...w3RejectLine(rejectNote),
        "",
        passageBlock(p.text),
      ].join("\n");
      return t.standardObject({
        schema: t.schema5,
        prompt,
        purpose: rejectNote ? "regenerate" : "generate",
      });
    };

    // 재생성 트리거 = 하드블록 ∪ 결정론 error 전부 (w3 사다리보다 문턱이 낮다 —
    // 수리 콜이 없으므로 error 는 재생성으로만 해소 가능하다).
    const triggersOf = (f: FinalizeResult) => [...new Set([...w3HardBlocks(f), ...f.errors])];

    const ladder: W3LadderEvent[] = [];
    let regens = 0;

    let aiQuestion = await genOnce(null);
    let fin = t.finalize(p.text, aiQuestion, p.difficulty);

    for (;;) {
      const triggers = triggersOf(fin);
      if (triggers.length === 0) {
        ladder.push({ action: "accept", remaining: w3SoftDefects(fin) });
        break;
      }
      if (regens >= W3_MAX_REGENS) {
        // 예산 소진 — 잔존 수용 (버리지 않는다).
        ladder.push({
          action: "give-up",
          trigger: triggers,
          remaining: [...new Set([...triggers, ...w3SoftDefects(fin)])],
        });
        break;
      }
      regens++;
      aiQuestion = await genOnce(triggers.join(", "));
      fin = t.finalize(p.text, aiQuestion, p.difficulty);
      const after = [...new Set([...triggersOf(fin), ...w3SoftDefects(fin)])];
      ladder.push({
        action: "regenerate",
        attempt: regens,
        trigger: triggers,
        resolved: triggers.filter((c) => !after.includes(c)),
        remaining: after,
      });
    }

    // 패치 2 동일 적용: 최종 수용 직전 difficulty 요청값 결정론 동기화(모델 출력 무시).
    const modelDifficulty =
      typeof aiQuestion.difficulty === "string" ? aiQuestion.difficulty : null;
    const difficultySynced = aiQuestion.difficulty !== p.difficulty;
    aiQuestion = { ...aiQuestion, difficulty: p.difficulty };

    return {
      aiQuestion,
      meta: {
        modelId: t.standardModelId,
        ladder,
        regenerations: regens,
        repairs: 0,
        modelDifficulty,
        difficultySynced,
        finalOk: fin.ok,
        finalErrors: fin.errors,
        finalWarnings: fin.warnings,
        finalSoftDefects: w3SoftDefects(fin),
        finalAnswerRelPos: fin.answerRelPos,
      },
    };
  },
};

// ── 등록 ────────────────────────────────────────────────────────────────────

export const STRATEGIES: Strategy[] = [
  s2FewshotA,
  s3Minimal,
  s4TwoStage,
  s5CodeDesignated,
  s6BestOf3,
  s7SelfCritique,
  s8DecoySplit,
  s9ModelPro,
  s10ModelClaude,
  s11ReasoningHigh,
  s12EnglishInst,
  s13ExaminerPersona,
  s14SiteEnum,
  ...CN_MODEL_STRATEGIES,
  w3TripleLadder,
  w3FlashLadder,
  w3ProFewshotHardgate,
  ...W4_COMBO_STRATEGIES,
  w5FlashGuard,
];
