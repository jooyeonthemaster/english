// 주제/요지(TOPIC_MAIN_IDEA) md 레인 픽스처 — 후단 검사(어댑터 → 후처리 → 셔플 →
// 품질검증 · 설정 집행 · 프롬프트 · 레인 계약).
// 단독 실행 파일이 아니다: scripts/_test-md-topic-main-idea.ts 가 픽스처와 검사
// 카운터를 주입해 호출한다(파일 500줄 규약으로 전단/후단을 갈랐다. 순환 import 를
// 만들지 않으려고 공유물은 import 가 아니라 인자로 받는다).
import { gateMdTopicMainIdea } from "../src/lib/md-qgen/gate-topic-main-idea";
import {
  adaptMdTopicMainIdeaToAiQuestion,
  gistDigitLabel,
} from "../src/lib/md-qgen/adapter-topic-main-idea";
import { TOPIC_MAIN_IDEA_MD_LANE } from "../src/lib/md-qgen/lane-topic-main-idea";
import {
  buildMdTopicMainIdeaPrompt,
  buildTopicMainIdeaMdDirection,
  clampTopicMdAnswerCount,
  clampTopicMdOptionCount,
} from "../src/lib/md-qgen/prompts-topic-main-idea";
import type { MdTopicMainIdeaQuestion } from "../src/lib/md-qgen/parser-topic-main-idea";
import type { MdLaneContext } from "../src/lib/md-qgen/lane-types";
import { postProcessQuestion } from "../src/lib/question-postprocess";
import { shuffleQuestionOptionsForDiversity } from "../src/lib/question-diversity";
import { validateQuestionQuality } from "../src/lib/question-quality";
import { CREDIT_COSTS } from "../src/lib/credit-costs";

export interface GistTestEnv {
  check: (name: string, ok: boolean, detail?: string) => void;
  PASSAGE: string;
  GOOD: string;
  GOOD_TOPIC: string;
  snapOf: (text: string) => MdTopicMainIdeaQuestion;
}

const ADAPT_KO = { gistMode: "MAIN_IDEA", polarity: "POSITIVE", stemLanguage: "ko" } as const;
const KO_OPTS = { optionCount: 5, answerCount: 1, gistMode: "MAIN_IDEA" } as const;

export function runGistPipelineChecks({ check, PASSAGE, GOOD, GOOD_TOPIC, snapOf }: GistTestEnv) {
  const laneCtx = (overrides: Partial<MdLaneContext> = {}): MdLaneContext => ({
    passage: PASSAGE,
    difficulty: "KILLER",
    rawDifficulty: "KILLER",
    resolved: { genericOptionCount: 5, genericAnswerCount: 1 },
    rawTypeSettings: {},
    teacherPoints: [],
    variantIndex: 0,
    variantCount: 1,
    ...overrides,
  });

  // ── 5. 어댑터 → postProcessQuestion → 셔플 → 품질 검증 왕복 ──────────────────
  {
    const q = snapOf(GOOD);
    const adapt = adaptMdTopicMainIdeaToAiQuestion(q, PASSAGE, "KILLER", ADAPT_KO);
    check("어댑터: 성공", adapt.ok === true, adapt.error);
    const ai = (adapt.aiQuestion ?? {}) as Record<string, unknown>;
    check(
      "어댑터: 발문은 설정에서 결정형 합성",
      ai.direction === "다음 글의 요지로 가장 적절한 것은?",
      String(ai.direction),
    );
    const opts = ai.options as Array<Record<string, unknown>>;
    check(
      "어댑터: 선지 라벨 숫자 축 1~5 · 텍스트 보존",
      opts.length === 5 &&
        opts.map((o) => o.label).join("") === "12345" &&
        String(opts[2].text).startsWith("추천 알고리즘은 이용자가 이미 승인한"),
    );
    check("어댑터: correctAnswer '3'", ai.correctAnswer === "3", String(ai.correctAnswer));
    check("어댑터: 단일 정답은 correctAnswers 키 없음", !("correctAnswers" in ai));
    const woe = ai.wrongOptionExplanations as Array<Record<string, unknown>>;
    check(
      "어댑터: 오답해설 라벨이 비정답 선지와 1:1",
      woe.length === 4 && woe.map((w) => w.label).join("") === "1245",
      woe.map((w) => w.label).join(","),
    );
    check("어댑터: keyPoints 빈 배열", Array.isArray(ai.keyPoints) && (ai.keyPoints as []).length === 0);
    check(
      "어댑터: 이물 필드 없음(빈칸·마킹지문 계열)",
      !("blanks" in ai) &&
        !("passageWithBlank" in ai) &&
        !("originalExpression" in ai) &&
        !("blankAnswerMode" in ai) &&
        !("passageWithMarkers" in ai),
    );
    check("어댑터: 근거문장은 저장하지 않는다(게이트 전용)", !("evidence" in ai));
    check(
      "어댑터: 라벨 변환은 6~8지선다까지 정확(정본 digitOptionLabel 은 ①~⑤ 전용)",
      gistDigitLabel("⑥") === "6" && gistDigitLabel("⑧") === "8" && gistDigitLabel("①") === "1",
    );

    const pp = postProcessQuestion("TOPIC_MAIN_IDEA", PASSAGE, ai as never);
    check("후처리: 성공", pp.success === true, pp.error);
    const data = (pp.data ?? {}) as Record<string, unknown>;
    const record = data.wrongOptionExplanations as Record<string, string>;
    check(
      "후처리: 오답해설 배열 → Record 정규화",
      !Array.isArray(record) && Object.keys(record).sort().join(",") === "1,2,4,5",
      JSON.stringify(Object.keys(record)),
    );
    check(
      "후처리: 한국어 선지 정렬 접두는 후처리 몫(어댑터는 붙이지 않는다)",
      record["1"].startsWith("'추천 알고리즘은 사람이"),
      record["1"].slice(0, 30),
    );
    check(
      "후처리: 선지·정답 무변경(PASSTHROUGH)",
      (data.options as Array<Record<string, unknown>>).length === 5 && data.correctAnswer === "3",
    );

    // 셔플 상호작용 — TOPIC_MAIN_IDEA 는 SHUFFLE_OPTION_TYPES 멤버다(정찰 R7 계통).
    const correctText = String(opts[2].text);
    let shuffleOk = true;
    let moved = false;
    let detail = "";
    for (let i = 0; i < 30; i += 1) {
      const shuffled = shuffleQuestionOptionsForDiversity(
        { ...(data as Record<string, unknown>), _typeId: "TOPIC_MAIN_IDEA" },
        "TOPIC_MAIN_IDEA",
      );
      const sOpts = shuffled.options as Array<Record<string, unknown>>;
      const answerLabel = String(shuffled.correctAnswer);
      const answerOption = sOpts.find((o) => String(o.label) === answerLabel);
      const sRecord = shuffled.wrongOptionExplanations as Record<string, string>;
      if (String(answerOption?.text) !== correctText) {
        shuffleOk = false;
        detail = `정답 라벨 ${answerLabel} 의 선지가 정답 텍스트가 아님`;
        break;
      }
      if (Object.keys(sRecord).includes(answerLabel)) {
        shuffleOk = false;
        detail = "정답 라벨에 오답해설이 붙음";
        break;
      }
      const mismatched = Object.entries(sRecord).find(([label, explanation]) => {
        const text = String(sOpts.find((o) => String(o.label) === label)?.text ?? "");
        return !explanation.includes(text.slice(0, 12));
      });
      if (mismatched) {
        shuffleOk = false;
        detail = `오답해설 ${mismatched[0]} 이(가) 다른 선지에 붙음`;
        break;
      }
      if (sOpts[2].text !== correctText) moved = true;
    }
    check("셔플: 정답·오답해설 동행 유지(30회)", shuffleOk, detail);
    check("셔플: 실제로 정답 위치가 이동한다(다양성 작동)", moved);

    // 품질 검증 — md 레인은 차단하지 않지만 error 가 나오면 형상이 어긋난 것이다.
    const issues = validateQuestionQuality({
      typeId: "TOPIC_MAIN_IDEA",
      question: { ...(data as Record<string, unknown>), _typeId: "TOPIC_MAIN_IDEA", difficulty: "KILLER" },
      passage: PASSAGE,
      requestedDifficulty: "KILLER",
      ...TOPIC_MAIN_IDEA_MD_LANE.qualityArgs(laneCtx()),
    });
    const errors = issues.filter((i) => i.severity === "error");
    check("품질 검증(요지 모드): error 0", errors.length === 0, errors.map((e) => `${e.code}:${e.message}`).join(" / "));
  }
  {
    // 주제 모드(영어 선지)도 같은 왕복을 통과해야 한다 — 보기 언어 검증기가 en 을 기대한다.
    const ctx = laneCtx({ rawTypeSettings: { optionLanguage: "en" } });
    const adapt = TOPIC_MAIN_IDEA_MD_LANE.adapt(
      TOPIC_MAIN_IDEA_MD_LANE.parseAndGate(GOOD_TOPIC, ctx),
      ctx,
    );
    const pp = postProcessQuestion("TOPIC_MAIN_IDEA", PASSAGE, adapt.aiQuestion as never);
    const issues = validateQuestionQuality({
      typeId: "TOPIC_MAIN_IDEA",
      question: { ...(pp.data as Record<string, unknown>), _typeId: "TOPIC_MAIN_IDEA" },
      passage: PASSAGE,
      requestedDifficulty: "KILLER",
      ...TOPIC_MAIN_IDEA_MD_LANE.qualityArgs(ctx),
    });
    const errors = issues.filter((i) => i.severity === "error");
    check(
      "품질 검증(주제 모드): error 0",
      pp.success === true && errors.length === 0,
      errors.map((e) => `${e.code}:${e.message}`).join(" / "),
    );
  }

  // ── 6. 설정 집행 — 복수 정답 · 부정 극성 · 선지 수 · 발문 언어 ───────────────
  {
    const multi = GOOD.replace("정답: ③", "정답: ②, ③").replace(
      "② 범위확대 — 소재는 같지만 작동 방식을 공개해야 한다는 처방은 지문이 하지 않은 주장입니다.\n",
      "",
    );
    const q = snapOf(multi);
    const issues = gateMdTopicMainIdea(q, PASSAGE, { optionCount: 5, answerCount: 2, gistMode: "MAIN_IDEA" });
    check("복수 정답: 파싱 2개", q.answers.join(",") === "②,③", q.answers.join(","));
    check("복수 정답: 게이트 클린(오답해설 3개)", issues.length === 0, issues.join(" / "));
    const ai = (adaptMdTopicMainIdeaToAiQuestion(q, PASSAGE, "INTERMEDIATE", ADAPT_KO).aiQuestion ??
      {}) as Record<string, unknown>;
    check(
      "복수 정답: correctAnswer '2, 3' + correctAnswers 배열(채점 MULTI 승격 조건)",
      ai.correctAnswer === "2, 3" &&
        Array.isArray(ai.correctAnswers) &&
        (ai.correctAnswers as string[]).join(",") === "2,3",
      String(ai.correctAnswer),
    );
    check(
      "복수 정답: 발문이 '모두 고르시오' 형식",
      ai.direction === "다음 글의 요지로 적절한 것을 모두 고르시오.",
      String(ai.direction),
    );
    check(
      "복수 정답: 정답 개수가 어긋나면 반려",
      gateMdTopicMainIdea(q, PASSAGE, { optionCount: 5, answerCount: 3, gistMode: "MAIN_IDEA" }).some((i) =>
        i.startsWith("정답 2개 (3개 필요"),
      ),
    );
  }
  {
    const ai = (adaptMdTopicMainIdeaToAiQuestion(snapOf(GOOD), PASSAGE, "KILLER", {
      ...ADAPT_KO,
      polarity: "NEGATIVE",
    }).aiQuestion ?? {}) as Record<string, unknown>;
    check(
      "부정 극성: 발문이 '적절하지 않은 것'",
      ai.direction === "다음 글의 요지로 가장 적절하지 않은 것은?",
      String(ai.direction),
    );
    const issues = validateQuestionQuality({
      typeId: "TOPIC_MAIN_IDEA",
      question: { ...ai, _typeId: "TOPIC_MAIN_IDEA" },
      passage: PASSAGE,
      requestedDifficulty: "KILLER",
      answerPolarity: "NEGATIVE",
      genericOptionCount: 5,
      genericAnswerCount: 1,
    });
    check(
      "부정 극성: 극성 검증기 통과(gist-polarity 코드 없음)",
      !issues.some((i) => i.code.startsWith("gist-polarity")),
      issues.map((i) => i.code).join(","),
    );
  }
  check(
    "발문 합성: 주제·요지 × 극성 × 단복수 × 언어",
    buildTopicMainIdeaMdDirection({ gistMode: "TOPIC", polarity: "POSITIVE", answerCount: 1, language: "ko" }) ===
      "다음 글의 주제로 가장 적절한 것은?" &&
      buildTopicMainIdeaMdDirection({ gistMode: "MAIN_IDEA", polarity: "NEGATIVE", answerCount: 2, language: "ko" }) ===
        "다음 글의 요지로 적절하지 않은 것을 모두 고르시오." &&
      buildTopicMainIdeaMdDirection({ gistMode: "TOPIC", polarity: "POSITIVE", answerCount: 1, language: "en" }) ===
        "Which of the following is the most appropriate topic of the passage?" &&
      /\bNOT\b/.test(
        buildTopicMainIdeaMdDirection({
          gistMode: "MAIN_IDEA",
          polarity: "NEGATIVE",
          answerCount: 1,
          language: "en",
        }),
      ),
  );
  {
    // 8지선다 — 정본 digitOptionLabel(①~⑤ 전용) 을 썼다면 여기서 축이 깨진다.
    const extra = ["⑥", "⑦", "⑧"];
    const eight = GOOD.replace(
      "정답: ③",
      `${extra.map((l, i) => `${l} 추가 미끼 ${i + 1}: 지문이 다루지 않은 방향으로 확장한 진술입니다.`).join("\n")}\n정답: ③`,
    ).replace(
      "⑤ 방향반대 — 핵심어는 정답과 같지만 취향의 폭이 넓어졌다고 방향을 뒤집었습니다.",
      `⑤ 방향반대 — 핵심어는 정답과 같지만 취향의 폭이 넓어졌다고 방향을 뒤집었습니다.\n${extra
        .map((l) => `${l} 범위확대 — 지문이 하지 않은 주장으로 확장했습니다.`)
        .join("\n")}`,
    );
    const q = snapOf(eight);
    const issues = gateMdTopicMainIdea(q, PASSAGE, { optionCount: 8, answerCount: 1, gistMode: "MAIN_IDEA" });
    check("8지선다: 파싱·게이트 클린", q.options.length === 8 && issues.length === 0, issues.join(" / "));
    const ai = (adaptMdTopicMainIdeaToAiQuestion(q, PASSAGE, "KILLER", ADAPT_KO).aiQuestion ?? {}) as Record<
      string,
      unknown
    >;
    const labels = (ai.options as Array<Record<string, unknown>>).map((o) => o.label).join("");
    check("8지선다: 선지 라벨 1~8 · 정답 '3'", labels === "12345678" && ai.correctAnswer === "3", labels);
    check(
      "8지선다: 5개 설정으로 검사하면 반려",
      gateMdTopicMainIdea(q, PASSAGE, KO_OPTS).some((i) => i.startsWith("선지 8개 (5개 필요)")),
    );
  }
  check(
    "클램프: 선지 수 4~8 · 정답 수 1~N-1",
    clampTopicMdOptionCount(3) === 4 &&
      clampTopicMdOptionCount(99) === 8 &&
      clampTopicMdOptionCount("x") === 5 &&
      clampTopicMdAnswerCount(9, 5) === 4 &&
      clampTopicMdAnswerCount(0, 5) === 1,
  );

  // ── 7. 프롬프트 — 난이도 3분기 · 설정 반영 · 형식 계약 ───────────────────────
  for (const d of ["BASIC", "INTERMEDIATE", "KILLER"] as const) {
    const p = buildMdTopicMainIdeaPrompt(PASSAGE, "full", d, { optionCount: 5, answerCount: 1 });
    check(
      `프롬프트 ${d}: 난이도 분기 + 선지 스캐폴드 + 지문 포함`,
      p.includes("## 정답 설계") && p.includes("⑤ <선지>") && p.includes("## 지문") && p.includes(PASSAGE.slice(0, 40)),
    );
  }
  check(
    "프롬프트: BASIC 만 few-shot 생략(정본 어법 빌더 선례)",
    !buildMdTopicMainIdeaPrompt(PASSAGE, "full", "BASIC").includes("모범 설계 해부") &&
      buildMdTopicMainIdeaPrompt(PASSAGE, "full", "KILLER").includes("모범 설계 해부"),
  );
  check(
    "프롬프트: 발문을 서버가 확정하고 모델에게 받지 않는다",
    buildMdTopicMainIdeaPrompt(PASSAGE, "full", "KILLER").includes("다음 글의 요지로 가장 적절한 것은?") &&
      !buildMdTopicMainIdeaPrompt(PASSAGE, "full", "KILLER").includes("발문: <"),
  );
  check(
    "프롬프트: 선지 줄에 정답 표시 칸을 요구하지 않는다(단순화 계약)",
    !buildMdTopicMainIdeaPrompt(PASSAGE, "full", "KILLER").includes("O 또는 X"),
  );
  check(
    "프롬프트: 근거문장 축자 요구",
    buildMdTopicMainIdeaPrompt(PASSAGE, "full", "KILLER").includes("근거문장: <"),
  );
  check(
    "프롬프트: 주제 모드는 영어 명사구, 요지 모드는 한국어 진술문 지시",
    buildMdTopicMainIdeaPrompt(PASSAGE, "full", "KILLER", { gistMode: "TOPIC" }).includes("영어 **명사구**") &&
      buildMdTopicMainIdeaPrompt(PASSAGE, "full", "KILLER", { gistMode: "MAIN_IDEA" }).includes(
        "한국어 **완결 진술문**",
      ),
  );
  check(
    "프롬프트: 부정 극성이면 오답 기제 절을 극성 반전 절이 대체",
    buildMdTopicMainIdeaPrompt(PASSAGE, "full", "KILLER", { polarity: "NEGATIVE" }).includes("정답 극성 반전") &&
      !buildMdTopicMainIdeaPrompt(PASSAGE, "full", "KILLER", { polarity: "NEGATIVE" }).includes(
        "기제를 하나씩 배분하라",
      ),
  );
  check(
    "프롬프트: 복수 정답 설정이 블록으로 집행됨",
    buildMdTopicMainIdeaPrompt(PASSAGE, "full", "KILLER", { optionCount: 6, answerCount: 2 }).includes(
      "## 정답 2개 (교사 설정, 필수)",
    ),
  );
  check(
    "프롬프트: 선지 수 설정이 라벨 스캐폴드에 반영",
    buildMdTopicMainIdeaPrompt(PASSAGE, "full", "KILLER", { optionCount: 8 }).includes("⑧ <선지>") &&
      !buildMdTopicMainIdeaPrompt(PASSAGE, "full", "KILLER", { optionCount: 4 }).includes("⑤ <선지>"),
  );
  check(
    "프롬프트: 정답 예시 라벨을 ①로 앵커링하지 않는다",
    buildMdTopicMainIdeaPrompt(PASSAGE, "full", "KILLER").includes("(예: ②)"),
  );
  check(
    "프롬프트: answer-only 모드는 오답 블록을 요구하지 않는다",
    !buildMdTopicMainIdeaPrompt(PASSAGE, "answer-only", "KILLER").includes("\n오답:\n"),
  );
  check(
    "프롬프트: 번호 지칭 금지 지시 포함(셔플 보호)",
    buildMdTopicMainIdeaPrompt(PASSAGE, "full", "KILLER").includes("번호로 지칭하지 마라"),
  );

  // ── 8. 레인 계약 — 과금·적격성·설정 집행·다양성 ─────────────────────────────
  check("레인: subType TOPIC_MAIN_IDEA", TOPIC_MAIN_IDEA_MD_LANE.subType === "TOPIC_MAIN_IDEA");
  check(
    "레인: 과금 QUESTION_GEN_SINGLE(2크레딧) — fast getOperationType 과 동기",
    TOPIC_MAIN_IDEA_MD_LANE.operationType === "QUESTION_GEN_SINGLE" && CREDIT_COSTS.QUESTION_GEN_SINGLE === 2,
    String(TOPIC_MAIN_IDEA_MD_LANE.operationType),
  );
  check("레인: retryEligible", TOPIC_MAIN_IDEA_MD_LANE.retryEligible === true);
  check(
    "레인: 적격성 4~8 · 정답 1~N-1 · 범위 밖 거부",
    TOPIC_MAIN_IDEA_MD_LANE.isEligible({ genericOptionCount: 5, genericAnswerCount: 1 }) &&
      TOPIC_MAIN_IDEA_MD_LANE.isEligible({ genericOptionCount: 8, genericAnswerCount: 7 }) &&
      TOPIC_MAIN_IDEA_MD_LANE.isEligible({}) &&
      !TOPIC_MAIN_IDEA_MD_LANE.isEligible({ genericOptionCount: 9, genericAnswerCount: 1 }) &&
      !TOPIC_MAIN_IDEA_MD_LANE.isEligible({ genericOptionCount: 3, genericAnswerCount: 1 }) &&
      !TOPIC_MAIN_IDEA_MD_LANE.isEligible({ genericOptionCount: 5, genericAnswerCount: 5 }) &&
      !TOPIC_MAIN_IDEA_MD_LANE.isEligible({ genericOptionCount: 5, genericAnswerCount: 0 }),
  );
  {
    const parsedLane = TOPIC_MAIN_IDEA_MD_LANE.parseAndGate(GOOD, laneCtx());
    check(
      "레인: parseAndGate 클린 + corrections 빈 배열",
      parsedLane.gateIssues.length === 0 && parsedLane.corrections.length === 0,
      parsedLane.gateIssues.join(" / "),
    );
    const adapt = TOPIC_MAIN_IDEA_MD_LANE.adapt(parsedLane, laneCtx());
    check(
      "레인: adapt 성공 · 발문 한국어 요지형",
      adapt.ok === true &&
        (adapt.aiQuestion as Record<string, unknown>).direction === "다음 글의 요지로 가장 적절한 것은?",
      adapt.error,
    );
  }
  {
    // 보기 언어 en = 주제 모드 — 한국어 선지 픽스처는 반려되고 영어 픽스처는 통과해야 한다.
    const ctx = laneCtx({ rawTypeSettings: { optionLanguage: "en" } });
    check(
      "레인: 보기 언어 en 이면 주제 모드로 전환(한국어 선지 반려)",
      TOPIC_MAIN_IDEA_MD_LANE.parseAndGate(GOOD, ctx).gateIssues.some((i) => i.includes("영어 주제 표현이 아님")),
    );
    const okLane = TOPIC_MAIN_IDEA_MD_LANE.parseAndGate(GOOD_TOPIC, ctx);
    check(
      "레인: 주제 모드 영어 픽스처 클린 + 발문 주제형",
      okLane.gateIssues.length === 0 &&
        (TOPIC_MAIN_IDEA_MD_LANE.adapt(okLane, ctx).aiQuestion as Record<string, unknown>).direction ===
          "다음 글의 주제로 가장 적절한 것은?",
      okLane.gateIssues.join(" / "),
    );
    check("레인: 프롬프트도 같은 모드로 분기", TOPIC_MAIN_IDEA_MD_LANE.buildBasePrompt(ctx).includes("'주제 파악'"));
  }
  {
    const ctx = laneCtx({ rawTypeSettings: { stemLanguage: "en" } });
    const adapt = TOPIC_MAIN_IDEA_MD_LANE.adapt(TOPIC_MAIN_IDEA_MD_LANE.parseAndGate(GOOD, ctx), ctx);
    check(
      "레인: 발문 언어 en 집행",
      (adapt.aiQuestion as Record<string, unknown>).direction ===
        "Which of the following is the most appropriate main idea of the passage?",
      String((adapt.aiQuestion as Record<string, unknown>).direction),
    );
    check(
      "레인: 발문 영어일 때 해설 언어 고정 블록 주입",
      TOPIC_MAIN_IDEA_MD_LANE.buildExtras(ctx).some((x) => x.includes("질문 언어")),
    );
    check("레인: 기본 설정에서는 extras 없음", TOPIC_MAIN_IDEA_MD_LANE.buildExtras(laneCtx()).length === 0);
  }
  {
    const ctx = laneCtx({
      resolved: { genericOptionCount: 6, genericAnswerCount: 2, answerPolarity: "NEGATIVE" },
    });
    const args = TOPIC_MAIN_IDEA_MD_LANE.qualityArgs(ctx);
    check(
      "레인: qualityArgs 가 실값 전달(개수·극성·언어)",
      args.genericOptionCount === 6 &&
        args.genericAnswerCount === 2 &&
        args.answerPolarity === "NEGATIVE" &&
        args.stemLanguage === "ko" &&
        args.optionLanguage === "ko",
      JSON.stringify(args),
    );
    check(
      "레인: POSITIVE 는 answerPolarity 키 미주입(기존 동작 보존)",
      !("answerPolarity" in TOPIC_MAIN_IDEA_MD_LANE.qualityArgs(laneCtx())),
    );
    const format = TOPIC_MAIN_IDEA_MD_LANE.mdFormat(ctx);
    check(
      "레인: mdFormat 포렌식 메타",
      format.optionCount === 6 &&
        format.answerCount === 2 &&
        format.gistMode === "MAIN_IDEA" &&
        format.polarity === "NEGATIVE",
      JSON.stringify(format),
    );
    check(
      "레인: 설정이 프롬프트까지 실제로 내려간다(6지선다·정답 2개·부정 극성)",
      TOPIC_MAIN_IDEA_MD_LANE.buildBasePrompt(ctx).includes("⑥ <선지>") &&
        TOPIC_MAIN_IDEA_MD_LANE.buildBasePrompt(ctx).includes("## 정답 2개 (교사 설정, 필수)") &&
        TOPIC_MAIN_IDEA_MD_LANE.buildBasePrompt(ctx).includes("적절하지 않은 것을 모두 고르시오"),
    );
  }
  {
    const targets = TOPIC_MAIN_IDEA_MD_LANE.diversityTargets({
      options: [
        { label: "1", text: "미끼 하나" },
        { label: "2", text: "정답 요지" },
        { label: "3", text: "미끼 둘" },
      ],
      correctAnswer: "2",
    });
    check(
      "레인: diversityTargets 는 미끼만(정답 요지는 회피 대상이 아니다)",
      targets.length === 2 && targets.every((t) => t.startsWith("이미 쓴 미끼: ")) && !targets.some((t) => t.includes("정답 요지")),
      targets.join(" | "),
    );
    check(
      "레인: 복수 정답도 회피 목록에서 제외",
      TOPIC_MAIN_IDEA_MD_LANE.diversityTargets({
        options: [
          { label: "1", text: "미끼" },
          { label: "2", text: "정답 하나" },
          { label: "3", text: "정답 둘" },
        ],
        correctAnswer: "2, 3",
      }).length === 1,
    );
    check(
      "레인: 표적 문자열은 라우트 90자 절단 안에 들어온다",
      TOPIC_MAIN_IDEA_MD_LANE.diversityTargets({
        options: [{ label: "1", text: "가".repeat(200) }],
        correctAnswer: "2",
      })[0].length <= 90,
    );
    check("레인: structuredData 형상이 아니면 빈 배열", TOPIC_MAIN_IDEA_MD_LANE.diversityTargets({}).length === 0);
  }
}
