/**
 * Phase B 커스텀 파이프라인 arm 구현.
 *
 * 모든 arm 은 프로덕션과 동일한 모델 경계(generateQuestionObject → atlasChatModel),
 * 동일 후처리(postProcessQuestion)·동일 결정론 게이트(validateQuestionQuality)를 쓴다.
 * 차이는 "생성 파이프라인 모양"뿐이다. 각 단계는 researchStage 로 계측된다:
 *   purpose=candidate → slot 소비(문항 본체를 산출하는 경계)
 *   purpose=design/evaluation → slot 미소비(설계·검증 보조)
 *
 * arm 목록 (어법 G-*, 빈칸 B-*):
 *   G-V1 / B-V1 : 현행 생성 → 독립 blind-solve 검증 → 불일치시 표적수리 1회
 *   G-D1 / B-D1 : Pro 설계 스펙(소형) → Flash 렌더링
 *   G-X1        : 해설 분리 — 본체 생성(해설 제외) → 해설 전용 후속 콜
 *   B-T1        : 오답 8후보 과잉생성 → 판정 콜이 함정축 다양성 기준 4개 선발 → 결정론 조립
 */
import { z } from "zod";

export interface ArmDeps {
  generateQuestionObject: (args: Record<string, unknown>) => Promise<{ object: unknown; usage?: unknown; modelId: string }>;
  postProcessQuestion: (typeId: string, passage: string, ai: Record<string, unknown>) => { success: boolean; data?: Record<string, unknown>; error?: string; warnings?: string[] };
  validateQuestionQuality: (a: Record<string, unknown>) => { severity: string; code: string; message?: string }[];
  buildAiGrammarErrorSchema: (markerCount: number, answerCount?: number) => z.ZodObject<z.ZodRawShape>;
  aiBlankInferenceSchema: z.ZodObject<z.ZodRawShape>;
  runProductionGeneration: (opts: { subType: string; difficulty: string; plan: string }) => Promise<{
    accepted: Record<string, unknown> | null;
    rejectedCandidates: { question?: Record<string, unknown>; blockingCodes?: string[] }[];
  }>;
  premiumModelId: string;
  passage: string;
  difficulty: string;
  log: (msg: string) => void;
}

export interface ArmResult {
  question: Record<string, unknown> | null;
  gateIssues: { severity: string; code: string; message?: string }[];
  accepted: boolean;
  trail: string[];
  extra?: Record<string, unknown>;
}

const wrap1 = <T extends z.ZodType>(q: T) => z.object({ questions: z.array(q).length(1) });

function finalize(deps: ArmDeps, typeId: string, raw: Record<string, unknown>, trail: string[]): ArmResult {
  const post = deps.postProcessQuestion(typeId, deps.passage, raw);
  if (!post.success || !post.data) {
    trail.push(`postprocess-fail:${post.error ?? "?"}`);
    return { question: raw, gateIssues: [{ severity: "error", code: "postprocess-failed", message: post.error }], accepted: false, trail };
  }
  const q = post.data;
  const issues = deps.validateQuestionQuality({ typeId, question: q, passage: deps.passage, requestedDifficulty: deps.difficulty });
  const blocking = issues.filter((i) => i.severity === "error");
  trail.push(`gate:${blocking.length}err/${issues.length - blocking.length}warn`);
  return { question: q, gateIssues: issues, accepted: blocking.length === 0, trail };
}

// ── 독립 솔버(검증) 스키마 ────────────────────────────────────────────────
const grammarSolverSchema = z.object({
  perOption: z.array(z.object({
    label: z.string(),
    isGrammaticalInContext: z.boolean().describe("지문 문맥에서 이 밑줄 표기가 어법상 옳으면 true"),
    governingRule: z.string().describe("판정에 사용한 지배 규칙 한 줄"),
    reason: z.string().describe("판정 근거 한 문장 (장거리 단서 인용 포함)"),
  })).length(5),
  errorLabels: z.array(z.string()).describe("어법상 틀렸다고 판정한 라벨 전부"),
  confidence: z.enum(["high", "medium", "low"]),
});

const blankSolverSchema = z.object({
  bestLabel: z.string().describe("가장 타당한 정답 라벨"),
  defensibleLabels: z.array(z.string()).describe("논리적으로 옹호 가능한 정답 라벨 전부(복수면 결함)"),
  perOption: z.array(z.object({
    label: z.string(),
    fitsGrammatically: z.boolean().describe("빈칸에 넣었을 때 문법적으로 자연스러운가"),
    whyTempting: z.string(),
    decisiveFlaw: z.string().describe("정답이 아니라면 결정적 탈락 근거, 정답이면 빈 문자열"),
  })).length(5),
  evidenceSentences: z.array(z.string()).describe("정답을 확정하는 지문 근거 문장(원문 인용) 1~3개"),
  confidence: z.enum(["high", "medium", "low"]),
});

function renderGrammarForSolver(q: Record<string, unknown>): string {
  return `${q.passageWithMarkers ?? ""}\n\n${q.direction ?? "다음 글의 밑줄 친 부분 중, 어법상 틀린 것은?"}\n${(q.options as { label: string; text: string }[] | undefined)?.map((o) => `${o.label} ${o.text}`).join("\n") ?? ""}`;
}
function renderBlankForSolver(q: Record<string, unknown>): string {
  return `${q.passageWithBlank ?? ""}\n\n${q.direction ?? "다음 빈칸에 들어갈 말로 가장 적절한 것은?"}\n${(q.options as { label: string; text: string }[] | undefined)?.map((o) => `${o.label} ${o.text}`).join("\n") ?? ""}`;
}

// ── V1: 생성 → blind-solve → 표적수리 ────────────────────────────────────
async function runV1(deps: ArmDeps, typeId: "GRAMMAR_ERROR" | "BLANK_INFERENCE"): Promise<ArmResult> {
  const trail: string[] = [];
  const gen = await deps.runProductionGeneration({ subType: typeId, difficulty: deps.difficulty, plan: "STANDARD" });
  let q = gen.accepted ?? gen.rejectedCandidates[0]?.question ?? null;
  trail.push(gen.accepted ? "gen:accepted" : q ? "gen:gate-rejected(candidate-kept)" : "gen:none");
  if (!q) return { question: null, gateIssues: [], accepted: false, trail };

  const isGrammar = typeId === "GRAMMAR_ERROR";
  const solverPrompt = isGrammar
    ? `다음 어법 문항을 독립적으로 판정하라. 각 밑줄 (A)~(E)의 표기가 지문 문맥에서 어법상 옳은지, 지배 규칙(진짜 주어, 선행사, 병렬 시작점, 의미상 주어 등 장거리 단서 포함)을 먼저 확인한 뒤 판정하라. 출제 의도를 추측하지 말고 문법 사실만 판정하라. 대안 해석(축약 관계절, 분사구문, 도치 등)이 성립해 정문이 되는 경우 반드시 isGrammaticalInContext=true 로 판정하라.\n\n${renderGrammarForSolver(q)}`
    : `다음 빈칸 문항을 독립적으로 풀어라. 다섯 선지를 각각 빈칸에 넣어 문법성(seam)과 지문 논리 적합성을 판정하고, 논리적으로 옹호 가능한 라벨을 전부 기록하라. 하나만 남지 않으면 그 사실을 숨기지 마라.\n\n${renderBlankForSolver(q)}`;
  const solver = await deps.generateQuestionObject({
    schema: isGrammar ? grammarSolverSchema : blankSolverSchema,
    prompt: solverPrompt,
    generationPlan: "STANDARD",
    logPrefix: "ARM-V1-SOLVER",
    maxTokens: 4000,
    researchStage: { key: isGrammar ? "grammar.solver" : "question.solver", purpose: "evaluation" },
  });
  const sv = solver.object as Record<string, unknown>;
  const declared = String(q.correctAnswer ?? "");
  let mismatch: string | null = null;
  if (isGrammar) {
    const errs = (sv.errorLabels as string[]) ?? [];
    if (errs.length !== 1 || errs[0] !== declared) mismatch = `solver errorLabels=[${errs.join(",")}] vs declared=${declared}`;
  } else {
    const best = String(sv.bestLabel ?? "");
    const def = (sv.defensibleLabels as string[]) ?? [];
    if (best !== declared || def.length !== 1 || def[0] !== declared) mismatch = `solver best=${best} defensible=[${def.join(",")}] vs declared=${declared}`;
  }
  trail.push(mismatch ? `solve:MISMATCH(${mismatch})` : "solve:agree");

  if (mismatch) {
    const schema = isGrammar ? deps.buildAiGrammarErrorSchema(5, 1) : deps.aiBlankInferenceSchema;
    const repairPrompt = `아래 문항은 독립 검증에서 정답 유일성 결함이 발견되었다.\n\n[검증 결과]\n${mismatch}\n상세: ${JSON.stringify(sv).slice(0, 2500)}\n\n[원지문]\n${deps.passage}\n\n[현재 문항]\n${JSON.stringify(q).slice(0, 6000)}\n\n검증 결과를 반영해 문항을 수리하라. 정답은 이견 없이 하나여야 하고, 나머지는 명백히 성립해야 한다. 검증이 지적한 자리를 그대로 두고 해설만 바꾸는 것은 금지. 필요하면 정답 자리 자체를 바꿔라. 스키마 전체 필드를 완성하라(difficulty="${deps.difficulty}").`;
    const rep = await deps.generateQuestionObject({
      schema: wrap1(schema),
      prompt: repairPrompt,
      generationPlan: "STANDARD",
      logPrefix: "ARM-V1-REPAIR",
      maxTokens: 8192,
      researchStage: { key: "question.candidate-repair", purpose: "candidate" },
    });
    q = ((rep.object as { questions: Record<string, unknown>[] }).questions ?? [])[0] ?? q;
    trail.push("repair:done");
  }
  const res = finalize(deps, typeId, q, trail);
  res.extra = { solverVerdict: sv, mismatch };
  return res;
}

// ── D1: Pro 설계 스펙 → Flash 렌더 ────────────────────────────────────────
const grammarSpecSchema = z.object({
  targetSentenceExact: z.string().describe("정답 오류를 심을 문장 — 원문 축자 인용"),
  sourceExpressionExact: z.string().describe("변형 전 원문 표현(1~3단어, 원문 축자)"),
  displayedError: z.string().describe("학생에게 보일 오형 — 원문 어간 유지 최소대립 변형"),
  pointCode: z.string().describe("문법 포인트 코드(예: 관계사, 수일치, 태, 분사, 병렬, 준동사)"),
  governingRule: z.string().describe("이 자리를 지배하는 규칙 한 줄(장거리 단서 명시)"),
  whyUnambiguous: z.string().describe("가장 강한 대안 해석을 시도해도 오형이 정문이 되지 않는 통사 근거"),
  strongestAlternativeParse: z.string().describe("시도해 본 가장 강한 대안 해석"),
  surroundingTextExact: z.string().describe("판정에 필요한 의존 구간 전체 — 원문 축자 40~120자"),
  decoys: z.array(z.object({
    expressionExact: z.string().describe("원문 그대로 둘 밑줄 표현(원문 축자 1~3단어)"),
    pointCode: z.string(),
    whyLooksWrong: z.string().describe("학생이 틀렸다고 착각할 이유"),
    whyActuallyCorrect: z.string().describe("실제로 정문인 통사 근거"),
    surroundingTextExact: z.string().describe("원문 축자 40~80자"),
  })).length(4).describe("서로 다른 문법 포인트의 미끼 4개 — 정답과 같은 pointCode 금지"),
});

async function runGD1(deps: ArmDeps): Promise<ArmResult> {
  const trail: string[] = [];
  const specRes = await deps.generateQuestionObject({
    schema: grammarSpecSchema,
    system: `당신은 한국 고등 영어 어법 문항의 수석 설계자다. 문항 텍스트가 아니라 "오류 설계 스펙"만 만든다.\n\n설계 원칙:\n1. 원문에서 구조가 가장 복잡한 문장(관계절·삽입구·병렬·분사구문 중첩)을 정답 자리로 고른다.\n2. 오형은 원문 어간을 유지한 최소대립 변형 하나. 수여동사 수동태(permit/allow/give류), singular they, 가정법 축약처럼 대안 분석이 성립하는 자리는 절대 금지.\n3. 가장 강한 대안 해석을 실제로 시도해 오형이 어떤 해석으로도 정문이 되지 않음을 확인한다. 확신이 없으면 다른 자리를 고른다.\n4. 미끼 4개는 서로 다른 문법 포인트로(같은 pointCode 2개 이상 금지 — 모노토니는 즉시 반려), 각각 "왜 틀려 보이는가"와 "왜 실제로 정문인가"를 모두 설명할 수 있어야 한다. 설명 못 하는 자리는 미끼가 아니다. 정답 포인트로 분사↔형용사 표면 전환처럼 한 눈에 드러나는 얕은 자리는 금지.\n5. 난이도 ${deps.difficulty}: ${deps.difficulty === "KILLER" ? "정답 판정에 밑줄 밖 장거리 단서(진짜 주어 핵·선행사·병렬 시작점)가 필수여야 하고, 미끼 중 2개 이상은 상위권도 5초 이상 고민해야 한다" : "문장 구조 추적이 필요하되 지배 규칙은 표준적이어야 한다"}.`,
    prompt: `## 지문\n${deps.passage}\n\n위 지문으로 어법 문항 오류 설계 스펙을 만들어라. 모든 *Exact 필드는 지문 축자 인용이어야 한다.`,
    generationPlan: "PREMIUM",
    modelId: deps.premiumModelId,
    logPrefix: "ARM-GD1-SPEC",
    maxTokens: 6000,
    researchStage: { key: "grammar.ladder.answer-only", purpose: "design" },
  });
  const spec = specRes.object as z.infer<typeof grammarSpecSchema>;
  trail.push(`spec:${spec.pointCode}@${spec.sourceExpressionExact}`);
  // 결정론 사전검사: 축자 인용 확인
  const missing = [spec.sourceExpressionExact, ...spec.decoys.map((d) => d.expressionExact)].filter((e) => !deps.passage.includes(e));
  if (missing.length) trail.push(`spec-warn:not-verbatim=[${missing.join("|")}]`);

  const renderRes = await deps.generateQuestionObject({
    schema: wrap1(deps.buildAiGrammarErrorSchema(5, 1)),
    system: `당신은 어법 문항 조립자다. 아래 설계 스펙을 "그대로" 구현한다. 새 오류 지점을 도입하거나 스펙의 자리·오형·미끼를 바꾸는 것은 금지. markedExpressions 는 지문 등장 순서로 (A)~(E) 라벨을 붙이고, isError=true 항목은 정답 자리 하나뿐이며 expression=원문 표현, errorExpression=스펙의 displayedError 를 쓴다. 미끼는 expression=errorExpression=원문 그대로. 해설(200~450자)은 스펙의 governingRule/whyUnambiguous 를 학생용 문장으로 옮기고, wrongOptionExplanations 는 각 미끼의 whyActuallyCorrect 를 한 문장으로 옮긴다. 모든 해설 텍스트는 합니다체로 통일한다(해라체·명사형 종결 혼용 금지). keyPoints 는 정확히 3개: 1번째는 정답 라벨로 시작해 정답 pointCode 주제를, 2·3번째는 실제 미끼 라벨 중 두 개로 시작해 그 라벨의 pointCode 와 같은 주제를 쓴다 — 형식 예: "(D) 능동태 vs 수동태 — 목적어 유무로 판정". 이 문항 밑줄에 없는 문법 주제 금지. difficulty="${deps.difficulty}".`,
    prompt: `## 지문\n${deps.passage}\n\n## 설계 스펙\n${JSON.stringify(spec, null, 1)}\n\n스펙대로 어법 문항 1개를 조립하라.`,
    generationPlan: "STANDARD",
    logPrefix: "ARM-GD1-RENDER",
    maxTokens: 8192,
    researchStage: { key: "question.structured", purpose: "candidate" },
  });
  const q = ((renderRes.object as { questions: Record<string, unknown>[] }).questions ?? [])[0];
  if (!q) return { question: null, gateIssues: [], accepted: false, trail: [...trail, "render:none"] };
  const res = finalize(deps, "GRAMMAR_ERROR", q, trail);
  res.extra = { spec };
  return res;
}

const blankSpecSchema = z.object({
  blankSpanExact: z.string().describe("빈칸으로 뚫을 원문 표현 — 축자 인용, 완전한 구성성분"),
  discourseRole: z.string().describe("빈칸 문장의 담화 역할(주제문/결론/인과 귀결 등)"),
  answerMeaningAxis: z.string().describe("정답이 보존해야 할 명제·관계·범위·극성 한 문장"),
  evidenceAnchorsExact: z.array(z.string()).min(1).max(3).describe("정답을 확정하는 원문 근거 문장 축자 인용 — KILLER는 서로 다른 2문장 이상"),
  goldOptionText: z.string().describe("정답 선지 텍스트 (난이도에 맞는 추상 패러프레이즈; 원문 복사 금지 - KILLER/INTERMEDIATE)"),
  slotContract: z.string().describe("빈칸 좌우 경계와 모든 선지가 맞춰야 할 문법 형식(품사/절 형식/수일치)"),
  distractors: z.array(z.object({
    text: z.string().describe("오답 텍스트 — 정답과 같은 품사·절 형식·극성·비슷한 길이"),
    borrowedConcept: z.string().describe("본문에서 빌린 개념"),
    distortionAxis: z.enum(["scope_shift", "causal_reversal", "half_truth", "actor_swap", "condition_loss", "polarity_flip", "off_topic_plausible"]).describe("단 하나의 주된 왜곡 축 — 4개가 서로 달라야 함"),
    decisiveExclusionExact: z.string().describe("이 오답을 결정적으로 배제하는 원문 근거 축자 인용"),
  })).length(4),
});

async function runBD1(deps: ArmDeps): Promise<ArmResult> {
  const trail: string[] = [];
  const specRes = await deps.generateQuestionObject({
    schema: blankSpecSchema,
    system: `당신은 한국 수능급 빈칸 추론 문항의 수석 설계자다. 문항 텍스트가 아니라 "빈칸 설계 스펙"만 만든다.\n\n설계 원칙:\n1. 빈칸은 글의 핵심 논지가 수렴하는 자리(주제문·결론·인과의 귀결)에 둔다. 비용·시간 같은 지엽 세부 금지. blankSpanExact 는 2~8단어의 완전한 구성성분 — 문장 전체·긴 절 통째 금지.
1-1. 오답은 정답과 길이·문체가 비슷해야 하고, 절대어(always/never/only 류)를 정답·오답 간 비대칭으로 쓰지 마라. 표면 신호(길이·극성·절대어)만으로 정답이 드러나면 즉시 반려된다.\n2. 정답은 원문 근거의 의미를 정확히 보존하되 ${deps.difficulty === "KILLER" ? "압축된 추상 재진술로, 서로 다른 근거 문장 2개 이상을 연결해야만 도출되게 한다" : "두 문장을 인과/대조로 연결해야 도출되게 한다"}.\n3. 오답 4개는 본문 개념을 빌리되 서로 다른 단 하나의 왜곡 축을 갖는다. 극성 반전만으로 즉시 소거되는 오답은 ${deps.difficulty === "KILLER" ? "금지하며, polarity_flip 축 자체를 쓰지 말고, 오답 중 최소 2개는 정답과 같은 극성이어야 한다(극성만 보고 정답을 찍을 수 없어야 함)" : "1개까지만 허용"}.\n4. 모든 선지는 slotContract(빈칸 좌우와의 문법 결합)를 만족해야 한다. 각 선지를 실제로 빈칸 앞뒤에 붙여 읽어 seam 을 확인하라.\n5. 각 오답의 decisiveExclusion 은 서로 다른 근거여야 한다. 같은 근거로 두 오답이 탈락하면 재설계.`,
    prompt: `## 지문\n${deps.passage}\n\n위 지문으로 빈칸 설계 스펙을 만들어라. *Exact 필드는 지문 축자 인용.`,
    generationPlan: "PREMIUM",
    modelId: deps.premiumModelId,
    logPrefix: "ARM-BD1-SPEC",
    maxTokens: 6000,
    researchStage: { key: "grammar.ladder.answer-only", purpose: "design" },
  });
  const spec = specRes.object as z.infer<typeof blankSpecSchema>;
  trail.push(`spec:span="${spec.blankSpanExact.slice(0, 40)}"`);
  if (!deps.passage.includes(spec.blankSpanExact)) trail.push("spec-warn:span-not-verbatim");

  const renderRes = await deps.generateQuestionObject({
    schema: wrap1(deps.aiBlankInferenceSchema),
    system: `당신은 빈칸 문항 조립자다. 설계 스펙을 그대로 구현한다. originalExpression=스펙의 blankSpanExact(축자). options 는 goldOptionText 1개 + distractors 4개를 자연스러운 순서로 배치하고 correctAnswer 는 gold 의 라벨. 각 wrongOptionExplanation 은 해당 distractor 의 borrowedConcept/distortionAxis/decisiveExclusion 을 학생용 한 문장으로 옮긴다. 해설(200~450자)은 evidenceAnchors 를 인용해 정답 필연성을 증명하고 가장 매력적인 오답 1개의 함정을 짚는다. blankAnswerMode="PARAPHRASE". difficulty="${deps.difficulty}".`,
    prompt: `## 지문\n${deps.passage}\n\n## 설계 스펙\n${JSON.stringify(spec, null, 1)}\n\n스펙대로 빈칸 문항 1개를 조립하라.`,
    generationPlan: "STANDARD",
    logPrefix: "ARM-BD1-RENDER",
    maxTokens: 8192,
    researchStage: { key: "question.structured", purpose: "candidate" },
  });
  const q = ((renderRes.object as { questions: Record<string, unknown>[] }).questions ?? [])[0];
  if (!q) return { question: null, gateIssues: [], accepted: false, trail: [...trail, "render:none"] };
  const res = finalize(deps, "BLANK_INFERENCE", q, trail);
  res.extra = { spec };
  return res;
}

// ── G-X1: 해설 분리 ───────────────────────────────────────────────────────
async function runGX1(deps: ArmDeps): Promise<ArmResult> {
  const trail: string[] = [];
  const bodySchema = deps.buildAiGrammarErrorSchema(5, 1).omit({ explanation: true, wrongOptionExplanations: true, keyPoints: true, tags: true });
  const bodyRes = await deps.generateQuestionObject({
    schema: wrap1(bodySchema),
    system: `당신은 한국 고등 영어 어법 문항 출제자다. 이 단계에서는 해설을 쓰지 않는다 — 문항 본체(밑줄 설계)만 완성한다.\n\n원칙:\n1. 정답 자리는 원문 어간 유지 최소대립 변형 하나. 수여동사 수동태·singular they·가정법 축약 등 대안 분석 가능 자리는 금지.\n2. errorDesign 에 SITE|SOURCE|RULE|MUTATION|COUNTERPARSE 순서의 짧은 인증 메모를 쓴다. COUNTERPARSE 에는 가장 강한 대안 해석과 그것이 실패하는 이유를 쓴다.\n3. 미끼 4개는 서로 다른 문법 포인트, 원문 그대로(expression=errorExpression), 각각 실제 구조 판단이 필요해야 한다.\n4. 밑줄은 1~3단어, surroundingText 에 장거리 의존 구간 전체(40~120자, 원문 축자).\n5. 난이도 ${deps.difficulty}. difficulty="${deps.difficulty}".`,
    prompt: `## 지문\n${deps.passage}\n\n어법 문항 본체 1개를 만들어라(해설 없이).`,
    generationPlan: "STANDARD",
    logPrefix: "ARM-GX1-BODY",
    maxTokens: 6000,
    researchStage: { key: "question.structured", purpose: "candidate" },
  });
  const body = ((bodyRes.object as { questions: Record<string, unknown>[] }).questions ?? [])[0];
  if (!body) return { question: null, gateIssues: [], accepted: false, trail: [...trail, "body:none"] };
  trail.push("body:done");

  const explSchema = z.object({
    explanation: z.string().describe("정답 해설 200~450자, 4단 구조(골격 해부→비문 이유→교정→함정 1문장)"),
    wrongOptionExplanations: z.array(z.object({ label: z.string(), explanation: z.string() })).length(4),
    keyPoints: z.array(z.string()).length(3),
    tags: z.array(z.string()).min(3).max(5),
  });
  const explRes = await deps.generateQuestionObject({
    schema: explSchema,
    system: `당신은 어법 해설 전문가다. 이미 확정된 문항의 해설만 쓴다. 문항을 바꾸지 마라.\n\n원칙:\n1. 해설을 쓰기 전에 각 밑줄의 실제 통사 구조를 스스로 분석하라. errorDesign 메모와 실제 문장이 다르면 실제 문장을 따른다.\n2. 문법 용어를 정확히 쓴다: 명사절 that 을 관계대명사로 부르는 류의 오분석 금지. 선행사를 명시할 때는 실제 선행사 핵을 지목한다.\n3. 해설은 200~450자: 골격 해부 → 왜 비문인가 → 교정형 → 함정 1문장. 출제 서사·내부 필드 언급 금지. 전체를 합니다체로 통일한다(해라체 혼용 금지).\n4. wrongOptionExplanations 는 정답을 제외한 4개 라벨 각각에 대해 "왜 옳은가"를 합니다체 한 문장으로.\n5. keyPoints 는 정확히 3개, 형식 "(라벨) 문법주제 — 판정 근거". 1번째=정답 라벨(정답 pointCode 주제), 2·3번째=실제 미끼 라벨 중 학생이 가장 헷갈릴 두 개(그 라벨의 pointCode 와 같은 주제). 이 문항 밑줄에 없는 문법 주제 절대 금지.`,
    prompt: `## 원지문\n${deps.passage}\n\n## 확정 문항\n${JSON.stringify(body, null, 1)}\n\n이 문항의 해설 필드를 작성하라.`,
    generationPlan: "STANDARD",
    logPrefix: "ARM-GX1-EXPL",
    maxTokens: 4000,
    researchStage: { key: "question.candidate-repair", purpose: "design" },
  });
  const expl = explRes.object as Record<string, unknown>;
  const merged = { ...body, ...expl };
  trail.push("expl:done");
  return finalize(deps, "GRAMMAR_ERROR", merged, trail);
}

// ── B-T1: 오답 토너먼트 ───────────────────────────────────────────────────
async function runBT1(deps: ArmDeps): Promise<ArmResult> {
  const trail: string[] = [];
  const genSchema = z.object({
    direction: z.string(),
    originalExpression: z.string().describe("빈칸으로 뚫을 원문 표현(축자, 완전한 구성성분)"),
    surroundingText: z.string().describe("주변 원문 40~60자"),
    goldOptionText: z.string().describe("정답 텍스트(난이도에 맞는 패러프레이즈)"),
    explanationDraft: z.string().describe("정답 근거 해설 초안 200~400자(근거 문장 인용 포함)"),
    evidenceAnchorsExact: z.array(z.string()).min(1).max(3),
    distractorCandidates: z.array(z.object({
      text: z.string(),
      intentAxis: z.enum(["scope_shift", "causal_reversal", "half_truth", "actor_swap", "condition_loss", "polarity_flip", "off_topic_plausible"]),
      anchor: z.string().describe("본문에서 빌린 개념"),
      decisiveFlaw: z.string().describe("결정적 탈락 근거"),
    })).length(8).describe("오답 후보 8개 — 서로 다른 함정축을 최대한 다양하게"),
  });
  const genRes = await deps.generateQuestionObject({
    schema: genSchema,
    system: `당신은 빈칸 문항 출제자다. 빈칸 설계와 정답, 그리고 오답 후보 8개를 과잉 생성한다. 빈칸 span(originalExpression)은 2~8단어의 간결한 구성성분이어야 한다 — 문장 전체나 긴 절을 통째로 뚫는 것 금지. 오답 후보는 서로 다른 함정축(왜곡 축)을 넓게 커버해야 하며, 각각 본문 개념을 빌리고 결정적 탈락 근거가 달라야 한다. 모든 후보는 정답과 같은 품사·절 형식·문체·비슷한 길이. 난이도 ${deps.difficulty}: ${deps.difficulty === "KILLER" ? "정답은 서로 다른 근거 2문장 이상의 종합이어야 하고, polarity_flip 축은 쓰지 말며, 후보 중 최소 4개는 정답과 같은 극성이어야 한다" : "두 문장 연결로 도출되게 하라"}.`,
    prompt: `## 지문\n${deps.passage}\n\n빈칸 설계 + 오답 후보 8개를 만들어라.`,
    generationPlan: "STANDARD",
    logPrefix: "ARM-BT1-GEN",
    maxTokens: 8000,
    researchStage: { key: "question.structured", purpose: "candidate" },
  });
  const g = genRes.object as z.infer<typeof genSchema>;
  trail.push(`gen:8cand span="${g.originalExpression.slice(0, 30)}"`);

  const judgeSchema = z.object({
    selectedIndices: z.array(z.number().int().min(0).max(7)).length(4).describe("선발한 4개 후보의 0-based 인덱스"),
    rationale: z.string().describe("선발 기준: 함정축 다양성·경쟁력·seam 자연성"),
    rejectedNotes: z.array(z.string()).describe("탈락 후보별 사유 한 줄"),
  });
  const judgeRes = await deps.generateQuestionObject({
    schema: judgeSchema,
    prompt: `다음 빈칸 문항의 오답 후보 8개 중 최고의 4개를 선발하라.\n\n선발 기준(우선순위):\n1. 네 오답의 함정축(intentAxis)이 서로 달라야 한다.\n2. 각 오답을 실제로 빈칸에 넣어 읽었을 때 문법 seam 이 자연스러워야 한다(부자연스러우면 탈락).\n3. 상위권 학생이 5~15초 고민할 경쟁력 — 본문 개념과의 겹침이 크고 왜곡이 단 하나여야 한다.\n4. 정답과 동시에 참이 될 수 있는 후보는 즉시 탈락.\n\n## 지문\n${deps.passage}\n\n## 빈칸\n"${g.originalExpression}" 자리를 빈칸으로 대체. 정답: "${g.goldOptionText}"\n\n## 오답 후보 (0-based)\n${g.distractorCandidates.map((d, i) => `${i}. [${d.intentAxis}] ${d.text} (anchor: ${d.anchor} / flaw: ${d.decisiveFlaw})`).join("\n")}`,
    generationPlan: "STANDARD",
    logPrefix: "ARM-BT1-JUDGE",
    maxTokens: 3000,
    researchStage: { key: "question.solver", purpose: "evaluation" },
  });
  const judge = judgeRes.object as z.infer<typeof judgeSchema>;
  const picked = [...new Set(judge.selectedIndices)].slice(0, 4).map((i) => g.distractorCandidates[i]).filter(Boolean);
  if (picked.length < 4) return { question: null, gateIssues: [{ severity: "error", code: "bt1-judge-invalid-selection" }], accepted: false, trail: [...trail, "judge:invalid"] };
  trail.push(`judge:[${judge.selectedIndices.join(",")}]`);

  // 결정론 조립: 시드 셔플로 정답 위치 고정 편향 방지
  const seed = [...g.originalExpression].reduce((s, ch) => (s * 31 + ch.charCodeAt(0)) % 997, 7);
  const texts = [g.goldOptionText, ...picked.map((d) => d.text)];
  const order = [0, 1, 2, 3, 4];
  for (let i = order.length - 1; i > 0; i--) {
    const j = (seed * (i + 3)) % (i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  const labels = ["①", "②", "③", "④", "⑤"];
  const options = order.map((srcIdx, pos) => ({ label: labels[pos], text: texts[srcIdx] }));
  const goldPos = order.indexOf(0);
  const correctAnswer = labels[goldPos];
  const wrongOptionExplanations = options
    .filter((_, pos) => pos !== goldPos)
    .map((o) => {
      const d = picked.find((p) => p.text === o.text)!;
      return { label: o.label, explanation: `${d.anchor}을(를) 빌렸지만 ${d.decisiveFlaw}` };
    });
  const q: Record<string, unknown> = {
    direction: g.direction || "다음 빈칸에 들어갈 말로 가장 적절한 것은?",
    originalExpression: g.originalExpression,
    surroundingText: g.surroundingText,
    blankAnswerMode: "PARAPHRASE",
    options,
    correctAnswer,
    correctAnswers: [correctAnswer],
    wrongOptionExplanations,
    explanation: g.explanationDraft,
    keyPoints: [`빈칸의 담화 역할과 근거 종합`, `오답의 함정축 판별`, `정답 패러프레이즈의 의미 보존`],
    tags: ["빈칸추론", "논지 파악", "오답 설계"],
    difficulty: deps.difficulty,
  };
  const res = finalize(deps, "BLANK_INFERENCE", q, trail);
  res.extra = { tournament: { candidates: g.distractorCandidates, judge } };
  return res;
}

// ── X2: 해설 사실검증 게이트(E-gate) + 표적 해설 재생성 ───────────────────
// Phase A 실측(O153): 수락 문항 fatal 의 지배 축은 V4(해설 사실성). 이 arm 은
// 현행 생성물을 그대로 두고 해설의 "사실 주장"만 검증·수리한다.
const eGateSchema = z.object({
  claims: z.array(z.object({
    quote: z.string().describe("해설에서 인용한 검증 대상 주장(원문 그대로)"),
    kind: z.enum(["GRAMMAR_ANALYSIS", "TRAP_CAUSALITY", "TERMINOLOGY", "PASSAGE_ATTRIBUTION", "KOREAN_WELLFORMEDNESS"]),
    verdict: z.enum(["OK", "WRONG", "UNSUPPORTED"]),
    evidence: z.string().describe("실제 문장/지문 근거 — WRONG/UNSUPPORTED 면 무엇이 실제인지"),
  })).min(1),
  koreanTextIssues: z.array(z.string()).describe("비단어·손상된 용어 풀이·어투 혼용 등 한국어 표면 결함"),
  overallVerdict: z.enum(["PASS", "FAIL"]),
});

async function runX2(
  deps: ArmDeps,
  typeId: "GRAMMAR_ERROR" | "BLANK_INFERENCE",
  opts: { verifierModelId?: string; reverify?: boolean; failClosedOnV4?: boolean } = {},
): Promise<ArmResult> {
  const trail: string[] = [];
  const gen = await deps.runProductionGeneration({ subType: typeId, difficulty: deps.difficulty, plan: "STANDARD" });
  const q0 = gen.accepted ?? gen.rejectedCandidates[0]?.question ?? null;
  trail.push(gen.accepted ? "gen:accepted" : q0 ? "gen:gate-rejected(candidate-kept)" : "gen:none");
  if (!q0) return { question: null, gateIssues: [], accepted: false, trail };
  let q = q0;

  const isGrammar = typeId === "GRAMMAR_ERROR";
  const rendered = isGrammar ? renderGrammarForSolver(q) : renderBlankForSolver(q);
  const explBundle = {
    explanation: q.explanation,
    wrongOptionExplanations: q.wrongOptionExplanations,
    keyPoints: q.keyPoints,
  };
  const runEgate = async (question: Record<string, unknown>, round: number) => {
    const bundle = {
      explanation: question.explanation,
      wrongOptionExplanations: question.wrongOptionExplanations,
      keyPoints: question.keyPoints,
    };
    const egate = await deps.generateQuestionObject({
      schema: eGateSchema,
      prompt: `너는 해설 사실검증관이다. 아래 문항의 해설이 "실제 영어 문장·지문"과 일치하는지 주장 단위로 검증하라.\n\n검증 절차:\n1. 해설·오답해설·keyPoints 에서 검증 가능한 주장을 전부 추출한다: 문법 구조 분석(품사·절 유형·선행사·수일치 근거 등), 함정의 인과 설명(학생이 왜 끌리는가), 문법 용어 사용, 지문 인용·문장 귀속, 한국어 표면 정상성(비단어·손상 용어).\n2. 각 주장을 실제 문장을 직접 파싱해 판정한다. 해설의 단정을 믿지 마라. 예: '접속사 while'이라 했는데 실제로는 관사 뒤 명사 while 인 경우 WRONG. 함정 인과가 실제 통사와 반대면 WRONG(예: 단수 명사 견인이 복수형 오답을 매력적으로 만든다는 설명). 지문에 없는 한정이 첨가되면 UNSUPPORTED. 오답 해설이 그 선지의 실제 내용과 다른 것을 설명하면 WRONG.\n3. '수술어', '도로 보호' 같은 비단어·손상 풀이·어투 혼용은 koreanTextIssues 에 기록한다.\n4. WRONG 또는 UNSUPPORTED 가 하나라도 있거나 koreanTextIssues 가 있으면 overallVerdict=FAIL. 애매하면 FAIL(보수적).\n\n## 원지문\n${deps.passage}\n\n## 문항 (학생 노출 형태)\n${rendered}\n\n## 선언 정답\n${question.correctAnswer}\n\n## 검증 대상 해설 필드\n${JSON.stringify(bundle, null, 1)}`,
      generationPlan: opts.verifierModelId ? "PREMIUM" : "STANDARD",
      ...(opts.verifierModelId ? { modelId: opts.verifierModelId } : {}),
      logPrefix: `ARM-X-EGATE-R${round}`,
      maxTokens: 6000,
      researchStage: { key: "question.solver", purpose: "evaluation" },
    });
    return egate.object as z.infer<typeof eGateSchema>;
  };

  let verdict = await runEgate(q, 1);
  let bad = verdict.claims.filter((c) => c.verdict !== "OK");
  trail.push(`egate1:${verdict.overallVerdict}(${bad.length}bad,${verdict.koreanTextIssues.length}ko)`);

  if (verdict.overallVerdict === "FAIL") {
    const explSchema = z.object({
      explanation: z.string(),
      wrongOptionExplanations: z.array(z.object({ label: z.string(), explanation: z.string() })),
      keyPoints: z.array(z.string()).length(3),
    });
    const fix = await deps.generateQuestionObject({
      schema: explSchema,
      prompt: `너는 해설 교정 전문가다. 아래 문항의 문제 본체는 확정이다 — 해설 필드만 다시 쓴다.\n\n독립 검증에서 발견된 해설 결함:\n${JSON.stringify({ claims: bad, koreanTextIssues: verdict.koreanTextIssues }, null, 1)}\n\n교정 원칙:\n1. 각 결함을 실제 문장 구조에 맞게 바로잡는다. 검증 evidence 를 따르되, 스스로 문장을 다시 파싱해 확인한다. 결함으로 지적되지 않은 주장도 다시 파싱해 틀렸으면 함께 고친다.\n2. 해설 200~450자, 합니다체 통일, 4단 구조(근거/구조 → 판정 → 교정·정답 확정 → 함정 1문장). 장황 금지.\n3. wrongOptionExplanations 는 정답 제외 각 라벨에 대해 실제 그 선지 내용에 대응하는 합니다체 한 문장.\n4. keyPoints 3개는 "(라벨) 주제 — 근거" 형식, 이 문항에 실제로 존재하는 포인트만.\n\n## 원지문\n${deps.passage}\n\n## 문항\n${rendered}\n\n## 선언 정답\n${q.correctAnswer}\n\n## 현재 해설(결함 있음)\n${JSON.stringify(explBundle, null, 1)}`,
      generationPlan: "STANDARD",
      logPrefix: "ARM-X-FIX",
      maxTokens: 4000,
      researchStage: { key: "question.candidate-repair", purpose: "design" },
    });
    q = { ...q, ...(fix.object as Record<string, unknown>) };
    trail.push("expl-fix:done");
    if (opts.reverify) {
      verdict = await runEgate(q, 2);
      bad = verdict.claims.filter((c) => c.verdict !== "OK");
      trail.push(`egate2:${verdict.overallVerdict}(${bad.length}bad,${verdict.koreanTextIssues.length}ko)`);
    }
  }

  const res = finalize(deps, typeId, q, trail);
  if (opts.failClosedOnV4 && verdict.overallVerdict === "FAIL") {
    // 재검증까지 실패한 해설은 출하 금지 — fail-closed
    res.accepted = false;
    res.gateIssues = [...res.gateIssues, { severity: "error", code: "x3-explanation-verify-failed" }];
    res.trail.push("fail-closed:V4");
  }
  res.extra = { egate: verdict };
  return res;
}

// ── 합성 파이프라인 (Phase C 후보) ─────────────────────────────────────────
// 각 V축을 서로 다른 스테이지가 방어한다:
//   설계 스펙(D1) → V4·craft / blind-solve(V1) → V2 / pro E-gate(X3) → V4 백스톱 / 결정론 게이트 → V1·V3·V5

async function verifyWithSolver(
  deps: ArmDeps,
  typeId: "GRAMMAR_ERROR" | "BLANK_INFERENCE",
  q: Record<string, unknown>,
  trail: string[],
): Promise<{ q: Record<string, unknown>; mismatch: string | null }> {
  const isGrammar = typeId === "GRAMMAR_ERROR";
  const solver = await deps.generateQuestionObject({
    schema: isGrammar ? grammarSolverSchema : blankSolverSchema,
    prompt: isGrammar
      ? `다음 어법 문항을 독립적으로 판정하라. 각 밑줄의 표기가 지문 문맥에서 어법상 옳은지 지배 규칙(장거리 단서 포함)을 확인해 판정하라. 대안 해석이 성립해 정문이 되면 반드시 옳다고 판정하라.\n\n${renderGrammarForSolver(q)}`
      : `다음 빈칸 문항을 독립적으로 풀어라. 다섯 선지를 각각 빈칸에 넣어 문법 seam 과 지문 논리 적합성을 판정하고, 옹호 가능한 라벨을 전부 기록하라.\n\n${renderBlankForSolver(q)}`,
    generationPlan: "STANDARD",
    logPrefix: "ARM-CX-SOLVER",
    maxTokens: 4000,
    researchStage: { key: isGrammar ? "grammar.solver" : "question.solver", purpose: "evaluation" },
  });
  const sv = solver.object as Record<string, unknown>;
  const declared = String(q.correctAnswer ?? "");
  let mismatch: string | null = null;
  if (isGrammar) {
    const errs = (sv.errorLabels as string[]) ?? [];
    if (errs.length !== 1 || errs[0] !== declared) mismatch = `errorLabels=[${errs.join(",")}] vs declared=${declared}`;
  } else {
    const best = String(sv.bestLabel ?? "");
    const def = (sv.defensibleLabels as string[]) ?? [];
    if (best !== declared || def.length !== 1 || def[0] !== declared) mismatch = `best=${best} defensible=[${def.join(",")}] vs declared=${declared}`;
  }
  trail.push(mismatch ? `solve:MISMATCH(${mismatch.slice(0, 80)})` : "solve:agree");
  if (!mismatch) return { q, mismatch: null };
  const schema = isGrammar ? deps.buildAiGrammarErrorSchema(5, 1) : deps.aiBlankInferenceSchema;
  const rep = await deps.generateQuestionObject({
    schema: wrap1(schema),
    prompt: `아래 문항은 독립 검증에서 정답 유일성 결함이 발견되었다.\n\n[검증 결과]\n${mismatch}\n상세: ${JSON.stringify(sv).slice(0, 2500)}\n\n[원지문]\n${deps.passage}\n\n[현재 문항]\n${JSON.stringify(q).slice(0, 6000)}\n\n검증 결과를 반영해 문항을 수리하라. 정답은 이견 없이 하나여야 하고 나머지는 명백히 성립해야 한다. 필요하면 정답 자리 자체를 바꿔라. 스키마 전체 필드를 완성하라(difficulty="${deps.difficulty}").`,
    generationPlan: "STANDARD",
    logPrefix: "ARM-CX-REPAIR",
    maxTokens: 8192,
    researchStage: { key: "question.candidate-repair", purpose: "candidate" },
  });
  const fixed = ((rep.object as { questions: Record<string, unknown>[] }).questions ?? [])[0] ?? q;
  trail.push("solve-repair:done");
  return { q: fixed, mismatch };
}

async function runEgateOn(
  deps: ArmDeps,
  typeId: "GRAMMAR_ERROR" | "BLANK_INFERENCE",
  q: Record<string, unknown>,
  trail: string[],
): Promise<{ q: Record<string, unknown>; pass: boolean; verdict: z.infer<typeof eGateSchema> }> {
  const isGrammar = typeId === "GRAMMAR_ERROR";
  const rendered = isGrammar ? renderGrammarForSolver(q) : renderBlankForSolver(q);
  const call = async (question: Record<string, unknown>, round: number) => {
    const bundle = { explanation: question.explanation, wrongOptionExplanations: question.wrongOptionExplanations, keyPoints: question.keyPoints };
    const r = await deps.generateQuestionObject({
      schema: eGateSchema,
      prompt: `너는 해설 사실검증관이다. 아래 문항의 해설이 실제 영어 문장·지문과 일치하는지 주장 단위로 검증하라. 각 주장을 실제 문장을 직접 파싱해 판정하고(해설의 단정을 믿지 마라), 함정 인과의 방향, 문법 용어의 정확성, 지문 인용·문장 귀속, 오답 해설과 실제 선지 내용의 대응, 한국어 비단어·손상 용어를 모두 본다. WRONG/UNSUPPORTED 가 하나라도 있거나 koreanTextIssues 가 있으면 FAIL. 애매하면 FAIL.\n\n## 원지문\n${deps.passage}\n\n## 문항\n${rendered}\n\n## 선언 정답\n${question.correctAnswer}\n\n## 검증 대상 해설\n${JSON.stringify(bundle, null, 1)}`,
      generationPlan: "PREMIUM",
      modelId: deps.premiumModelId,
      logPrefix: `ARM-CX-EGATE-R${round}`,
      maxTokens: 6000,
      researchStage: { key: "question.solver", purpose: "evaluation" },
    });
    return r.object as z.infer<typeof eGateSchema>;
  };
  let verdict = await call(q, 1);
  trail.push(`egate1:${verdict.overallVerdict}`);
  let cur = q;
  if (verdict.overallVerdict === "FAIL") {
    const bad = verdict.claims.filter((c) => c.verdict !== "OK");
    const explSchema = z.object({
      explanation: z.string(),
      wrongOptionExplanations: z.array(z.object({ label: z.string(), explanation: z.string() })),
      keyPoints: z.array(z.string()).length(3),
    });
    const fix = await deps.generateQuestionObject({
      schema: explSchema,
      prompt: `해설 교정: 문제 본체는 확정, 해설 필드만 다시 쓴다. 발견된 결함:\n${JSON.stringify({ claims: bad, koreanTextIssues: verdict.koreanTextIssues }, null, 1)}\n\n원칙: 실제 문장 구조를 직접 파싱해 바로잡고, 해설 200~450자 합니다체 4단 구조, wrongOptionExplanations 는 각 오답의 실제 내용 대응 한 문장, keyPoints 3개는 "(라벨) 주제 — 근거" 형식으로 실존 포인트만.\n\n## 원지문\n${deps.passage}\n\n## 문항\n${rendered}\n\n## 선언 정답\n${cur.correctAnswer}\n\n## 현재 해설\n${JSON.stringify({ explanation: cur.explanation, wrongOptionExplanations: cur.wrongOptionExplanations, keyPoints: cur.keyPoints }, null, 1)}`,
      generationPlan: "STANDARD",
      logPrefix: "ARM-CX-EFIX",
      maxTokens: 4000,
      researchStage: { key: "question.candidate-repair", purpose: "design" },
    });
    cur = { ...cur, ...(fix.object as Record<string, unknown>) };
    verdict = await call(cur, 2);
    trail.push(`egate2:${verdict.overallVerdict}`);
  }
  return { q: cur, pass: verdict.overallVerdict === "PASS", verdict };
}

async function runComposite(deps: ArmDeps, typeId: "GRAMMAR_ERROR" | "BLANK_INFERENCE", base: "D1" | "LADDER"): Promise<ArmResult> {
  const trail: string[] = [];
  let q: Record<string, unknown> | null = null;
  let extra: Record<string, unknown> = {};
  if (base === "D1") {
    const d1 = typeId === "GRAMMAR_ERROR" ? await runGD1(deps) : await runBD1(deps);
    trail.push(...d1.trail.map((t) => `d1|${t}`));
    q = d1.question;
    extra = { spec: (d1.extra as { spec?: unknown } | undefined)?.spec };
  } else {
    const gen = await deps.runProductionGeneration({ subType: typeId, difficulty: deps.difficulty, plan: "PREMIUM" });
    q = gen.accepted ?? gen.rejectedCandidates[0]?.question ?? null;
    trail.push(gen.accepted ? "ladder:accepted" : q ? "ladder:gate-rejected(kept)" : "ladder:none");
  }
  if (!q) return { question: null, gateIssues: [], accepted: false, trail };

  const solved = await verifyWithSolver(deps, typeId, q, trail);
  q = solved.q;
  const egated = await runEgateOn(deps, typeId, q, trail);
  q = egated.q;

  const res = finalize(deps, typeId, q, trail);
  if (!egated.pass) {
    res.accepted = false;
    res.gateIssues = [...res.gateIssues, { severity: "error", code: "cx-explanation-verify-failed" }];
    res.trail.push("fail-closed:V4");
  }
  res.extra = { ...extra, egate: egated.verdict, solverMismatch: solved.mismatch };
  return res;
}

// ── E-phase: 공예 심판(craft referee) + 표적 오답 업그레이드 ─────────────────
// Phase C 확증: 승자 조합(pro 생성 + E-gate)의 잔여 병목은 공예(C3 경쟁력·C5 난이도
// 정합·오답 축 다양성). 심판(pro)이 RUBRIC C2~C5 기준으로 결함 오답을 지목하면
// 표적 업그레이드 1회(full-question candidate 소비)를 실행한다. 사전등록 Phase E 의
// CX 기반은 Phase C 에서 기각되어 검증된 A0+egate 기반으로 대체(수정 기록 O161).
const craftRefereeSchema = z.object({
  optionAudit: z.array(z.object({
    label: z.string(),
    intent: z.string().describe("이 선지가 겨냥한 오개념/함정축 — 설명 불가면 '필러'"),
    temptingBecause: z.string(),
    decisiveFlaw: z.string(),
    axisFamily: z.enum(["POLARITY", "SCOPE", "CAUSALITY", "AGENT", "CONDITION", "LEXICAL_ANCHOR", "GRAMMAR_POINT", "FILLER"]),
    competitiveness: z.enum(["STRONG", "MODERATE", "INSTANT_ELIMINATION"]),
  })).length(5),
  axisDiversityProblem: z.string().describe("같은 축 계열 오답이 2개 이상이면 그 계열과 라벨, 없으면 빈 문자열"),
  surfaceLeak: z.string().describe("길이·극성·절대어·구조 등 표면 신호만으로 정답이 드러나는 누출, 없으면 빈 문자열"),
  difficultyFit: z.enum(["UNDERSHOOT", "FIT", "OVERSHOOT"]).describe("요청 난이도 대비 실제 요구 사고 깊이"),
  weakestLabels: z.array(z.string()).max(2).describe("교체가 필요한 가장 약한 오답 라벨 최대 2개(문제 없으면 빈 배열)"),
  verdict: z.enum(["PASS", "UPGRADE"]).describe("PASS=공예 충분, UPGRADE=오답 교체 필요"),
});

async function runCraftReferee(deps: ArmDeps, typeId: "GRAMMAR_ERROR" | "BLANK_INFERENCE", base: "A0"): Promise<ArmResult> {
  void base;
  const trail: string[] = [];
  const gen = await deps.runProductionGeneration({ subType: typeId, difficulty: deps.difficulty, plan: "PREMIUM" });
  let q = gen.accepted ?? gen.rejectedCandidates[0]?.question ?? null;
  trail.push(gen.accepted ? "gen:accepted" : q ? "gen:gate-rejected(kept)" : "gen:none");
  if (!q) return { question: null, gateIssues: [], accepted: false, trail };

  // E-gate 먼저 (검증된 V4 방어)
  const egated = await runEgateOn(deps, typeId, q, trail);
  q = egated.q;

  const isGrammar = typeId === "GRAMMAR_ERROR";
  const rendered = isGrammar ? renderGrammarForSolver(q) : renderBlankForSolver(q);
  const referee = await deps.generateQuestionObject({
    schema: craftRefereeSchema,
    prompt: `너는 수능급 문항 공예 심판이다. 아래 문항의 "오답 설계 품질"만 심사한다(유효성은 이미 검증됨).\n\n심사 기준:\n1. 각 선지의 intent(겨냥 오개념)·tempting·decisiveFlaw 를 실제로 작성해 보라. 작성이 안 되는 선지는 필러다.\n2. 오답들의 함정축이 서로 다른가? 같은 축 계열(예: 극성반전 3개)이면 axisDiversityProblem 에 기록.\n3. 표면 신호 누출: 정답만 길거나, 정답만 유일 구조이거나, 절대어 비대칭이면 surfaceLeak 에 기록.\n4. 요청 난이도 ${deps.difficulty} 대비: ${deps.difficulty === "KILLER" ? "상위권이 두 단계 이상 사고(근거 확인→논리 종합→미세 판별)를 거쳐야 하는가? 오답 중 최소 2개가 5~15초 고민을 유발하는가?" : "적정 추론 요구인가?"}\n5. INSTANT_ELIMINATION 오답이 2개 이상이거나, 축 다양성 문제·표면 누출이 있거나, KILLER 인데 STRONG 오답이 2개 미만이면 verdict=UPGRADE 로 하고 weakestLabels 에 교체 대상 오답을 지목하라.\n\n## 원지문\n${deps.passage}\n\n## 문항\n${rendered}\n\n## 정답\n${q.correctAnswer}`,
    generationPlan: "PREMIUM",
    modelId: deps.premiumModelId,
    logPrefix: "ARM-E1-REFEREE",
    maxTokens: 5000,
    researchStage: { key: "question.solver", purpose: "evaluation" },
  });
  const verdict = referee.object as z.infer<typeof craftRefereeSchema>;
  trail.push(`referee:${verdict.verdict}(weak=[${verdict.weakestLabels.join(",")}])`);

  if (verdict.verdict === "UPGRADE" && verdict.weakestLabels.length > 0) {
    const schema = isGrammar ? deps.buildAiGrammarErrorSchema(5, 1) : deps.aiBlankInferenceSchema;
    const upgrade = await deps.generateQuestionObject({
      schema: wrap1(schema),
      prompt: `아래 문항의 공예 심판 결과다. 지목된 약한 오답(${verdict.weakestLabels.join(", ")})만 업그레이드하라 — 정답·정답 자리·나머지 선지·지문 변형은 절대 바꾸지 마라.\n\n[심판 결과]\n${JSON.stringify(verdict, null, 1)}\n\n업그레이드 원칙:\n1. 교체 오답은 본문 개념을 빌리되 기존 오답들과 다른 함정축을 쓴다(축 다양성 회복).\n2. 정답과 같은 극성·품사·문체·비슷한 길이 — 표면 신호 누출 금지.\n3. ${deps.difficulty === "KILLER" ? "상위권이 5~15초 고민할 STRONG 경쟁력 — 왜곡은 단 하나(반쪽 진실·범위 이동·행위자 교체·조건 소거 중 택1)." : "적정 경쟁력."}\n4. 해당 오답의 wrongOptionExplanation 도 새 선지 내용에 맞게 갱신. 해설·keyPoints 는 정답 근거가 변하지 않았으므로 유지하되 교체 오답 언급이 있으면 갱신.\n5. 스키마 전체 필드 완성(difficulty="${deps.difficulty}").\n\n## 원지문\n${deps.passage}\n\n## 현재 문항 전체\n${JSON.stringify(q).slice(0, 7000)}`,
      generationPlan: "PREMIUM",
      modelId: deps.premiumModelId,
      logPrefix: "ARM-E1-UPGRADE",
      maxTokens: 8192,
      researchStage: { key: "question.candidate-repair", purpose: "candidate" },
    });
    const up = ((upgrade.object as { questions: Record<string, unknown>[] }).questions ?? [])[0];
    if (up) {
      q = up;
      trail.push("upgrade:done");
    }
  }
  const res = finalize(deps, typeId, q, trail);
  if (!egated.pass) {
    res.accepted = false;
    res.gateIssues = [...res.gateIssues, { severity: "error", code: "cx-explanation-verify-failed" }];
  }
  res.extra = { referee: verdict };
  return res;
}

// ── G-ONE (O182, 사용자 가설 "빈칸처럼 어법도 한 콜"): 콤팩트 프롬프트 단일 콜로
// 완성 어법 문항 생성 → flash 솔버 게이트 → pro 해설검증(수리 1회, fail-closed).
// 사다리(정답설계→미끼→수리, ~153원/4-5콜) 대비 원가·품질 짝비교용.
async function runGONE(deps: ArmDeps): Promise<ArmResult> {
  const trail: string[] = [];
  const oneShotPrompt = `당신은 대한민국 수능 영어 어법 문항 출제자입니다. 아래 지문으로 어법 판단 문항 1개를 한 번에 완성하세요.

## 지문
${deps.passage}

## 설계 규칙 (필수)
- 원문은 전부 정문이라고 전제합니다. 정답 1곳만 원문 어간을 유지한 최소 형태 변형으로 비문을 만들고, 나머지 4곳은 원문 그대로 둡니다.
- 정답 자리는 구조적으로 다층적인 문장(관계절·삽입구·분사구문·병렬·긴 수식어 중 2개 이상)을 고르고, 가장 강한 대안 해석으로도 정문이 되지 않는지 스스로 확인하세요. 밑줄은 판단 토큰 1~3단어만.
- 미끼 4곳은 서로 다른 문법 포인트(수일치/태/준동사/관계사/병렬/대명사 등)를 각각 담당하며, 각자 실제 구조 판단이 필요해야 합니다. 밑줄 사이 간격은 8단어 이상, 한 문장에 몰지 마세요.
- 과훈련 정형(that↔what 단독, ±ly 맞교환, 인접 수일치)은 정답으로 금지.
- 난이도: ${deps.difficulty}.
- 해설(explanation)은 한국어 200~450자, 4단 구조(문장 골격 → 판정+통사 근거 → 교정형 → 함정 한 줄). 표준 문법 용어만 사용하고, 확신 없는 범주명은 만들지 말고 구조를 서술하세요. wrongOptionExplanations 는 정답 제외 각 라벨당 한 문장.
- markedExpressions 의 expression/correction 은 원문 축자, errorExpression 만 의도적 오형. surroundingText 는 판단에 필요한 의존 구간 전체를 원문 그대로.`;

  const gen = await deps.generateQuestionObject({
    schema: wrap1(deps.buildAiGrammarErrorSchema(5, 1)),
    prompt: oneShotPrompt,
    generationPlan: "PREMIUM",
    logPrefix: "ARM-GONE",
    maxTokens: 20000,
    researchStage: { key: "question.structured", purpose: "candidate" },
  });
  const raw = (gen.object as { questions: Record<string, unknown>[] }).questions[0];
  trail.push("gen:one-call");
  const fin = finalize(deps, "GRAMMAR_ERROR", raw as Record<string, unknown>, trail);
  if (!fin.accepted || !fin.question) return fin;
  const q = fin.question;

  // flash 솔버 게이트 (프로덕션 grammar.solver 동형)
  const solver = await deps.generateQuestionObject({
    schema: grammarSolverSchema,
    prompt: `다음 어법 문항을 독립적으로 판정하라. 각 밑줄의 표기가 지문 문맥에서 어법상 옳은지 지배 규칙을 확인해 판정하고, 대안 해석이 성립해 정문이 되는 경우 반드시 isGrammaticalInContext=true 로 판정하라.\n\n${renderGrammarForSolver(q)}`,
    generationPlan: "STANDARD",
    logPrefix: "ARM-GONE-SOLVER",
    maxTokens: 4000,
    researchStage: { key: "grammar.solver", purpose: "evaluation" },
  });
  const solved = solver.object as z.infer<typeof grammarSolverSchema>;
  const declaredAnswer = String(q.correctAnswer ?? "").replace(/[()]/g, "");
  const solverErrors = solved.errorLabels.map((l) => l.replace(/[()]/g, ""));
  if (!(solverErrors.length === 1 && solverErrors[0] === declaredAnswer)) {
    trail.push(`solver-mismatch:[${solverErrors.join(",")}]≠${declaredAnswer}`);
    return { ...fin, accepted: false, gateIssues: [...fin.gateIssues, { severity: "error", code: "gone-solver-mismatch" }], trail };
  }
  trail.push("solver:ok");

  // pro 해설검증 → (FAIL) 수리 1회 → 재검증, fail-closed (프로덕션 E-gate 동형)
  const verifierModelId =
    process.env.EXPLANATION_VERIFY_MODEL_ID?.trim() || "google/gemini-3.1-pro-preview";
  const verifySchema = z.object({
    claims: z.array(z.object({ quote: z.string(), verdict: z.enum(["OK", "WRONG", "UNSUPPORTED"]), evidence: z.string() })),
    overallVerdict: z.enum(["PASS", "FAIL"]),
  });
  const verifyOnce = async (question: Record<string, unknown>, round: number) => {
    const r = await deps.generateQuestionObject({
      schema: verifySchema,
      prompt: `너는 해설 사실검증관이다. 아래 어법 문항의 해설이 실제 문장 구조와 일치하는지 주장 단위로 검증하라. 문법 용어 정확성, 구조 분석, 함정 인과, 한국어 비단어·손상 표현을 모두 본다. WRONG/UNSUPPORTED 가 하나라도 있으면 FAIL(보수적).\n\n## 지문\n${deps.passage}\n\n## 문항\n${renderGrammarForSolver(question)}\n\n## 정답\n${String(question.correctAnswer ?? "")}\n\n## 검증 대상 해설\n${JSON.stringify({ explanation: question.explanation, wrongOptionExplanations: question.wrongOptionExplanations, keyPoints: question.keyPoints }, null, 1)}`,
      generationPlan: "PREMIUM",
      modelId: verifierModelId,
      logPrefix: `ARM-GONE-VERIFY-R${round}`,
      maxTokens: 6000,
      researchStage: { key: "question.solver", purpose: "evaluation" },
    });
    return r.object as z.infer<typeof verifySchema>;
  };
  let v = await verifyOnce(q, 1);
  let finalQ = q;
  if (v.overallVerdict !== "PASS") {
    trail.push(`verify:FAIL(${v.claims.filter((c) => c.verdict !== "OK").length})`);
    const rep = await deps.generateQuestionObject({
      schema: z.object({ explanation: z.string(), wrongOptionExplanations: z.record(z.string(), z.string()), keyPoints: z.array(z.string()).length(3) }),
      prompt: `아래 어법 문항의 본체는 확정이다 — 해설 필드만 결함을 바로잡아 다시 써라. 발견된 결함:\n${JSON.stringify(v.claims.filter((c) => c.verdict !== "OK"), null, 1)}\n\n## 지문\n${deps.passage}\n\n## 문항\n${renderGrammarForSolver(q)}\n\n## 현재 해설\n${JSON.stringify({ explanation: q.explanation, wrongOptionExplanations: q.wrongOptionExplanations, keyPoints: q.keyPoints }, null, 1)}\n\n해설 200~450자 4단 구조, 합니다체, 표준 용어만.`,
      generationPlan: "PREMIUM",
      logPrefix: "ARM-GONE-FIX",
      maxTokens: 6000,
      researchStage: { key: "question.candidate-repair", purpose: "design" },
    });
    finalQ = { ...q, ...(rep.object as Record<string, unknown>), _explanationRepaired: true };
    v = await verifyOnce(finalQ, 2);
    if (v.overallVerdict !== "PASS") {
      trail.push("reverify:FAIL(fail-closed)");
      return { ...fin, question: finalQ, accepted: false, gateIssues: [...fin.gateIssues, { severity: "error", code: "gone-explanation-verify-failed" }], trail };
    }
    trail.push("reverify:PASS");
  } else {
    trail.push("verify:PASS");
  }
  return { ...fin, question: finalQ, accepted: true, trail };
}

export async function runCustomArm(armId: string, deps: ArmDeps): Promise<ArmResult> {
  switch (armId) {
    case "G-ONE": return runGONE(deps);
    case "G-V1": return runV1(deps, "GRAMMAR_ERROR");
    case "B-V1": return runV1(deps, "BLANK_INFERENCE");
    case "G-D1": return runGD1(deps);
    case "B-D1": return runBD1(deps);
    case "G-X1": return runGX1(deps);
    case "B-T1": return runBT1(deps);
    case "G-X2": return runX2(deps, "GRAMMAR_ERROR");
    case "B-X2": return runX2(deps, "BLANK_INFERENCE");
    case "G-X3": return runX2(deps, "GRAMMAR_ERROR", { verifierModelId: deps.premiumModelId, reverify: true, failClosedOnV4: true });
    case "B-X3": return runX2(deps, "BLANK_INFERENCE", { verifierModelId: deps.premiumModelId, reverify: true, failClosedOnV4: true });
    case "G-CX": return runComposite(deps, "GRAMMAR_ERROR", "D1");
    case "B-CX": return runComposite(deps, "BLANK_INFERENCE", "D1");
    case "G-LX": return runComposite(deps, "GRAMMAR_ERROR", "LADDER");
    case "G-E1": return runCraftReferee(deps, "GRAMMAR_ERROR", "A0");
    case "B-E1": return runCraftReferee(deps, "BLANK_INFERENCE", "A0");
    default: throw new Error(`unknown custom arm: ${armId}`);
  }
}
