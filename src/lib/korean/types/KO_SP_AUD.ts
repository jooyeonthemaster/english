// ============================================================================
// KO_SP_AUD — 화법: 청중(청자) 반응 분석 (발표 세트 3슬롯)
// ============================================================================
// 카탈로그 §2.3 KO_SP_AUD 사양의 전면 구현.
//
// 실측 근거(카탈로그 §2.3 — 화작 발표 세트 35~37 관행):
//   발문: "발표 내용을 바탕으로 할 때, <보기>에 나타난 학생들의 반응에 대한
//   이해로 가장 적절한 것은?" — 긍정발문 관행.
//   메커니즘: <보기> 학생 1~3 반응 → 메타 유형 판별(궁금증 형성/배경지식
//   활성화/신뢰성 점검/유용성 평가/추가 탐색 계획).
//   선지: ①~③ 개별 + ④~⑤ "학생 1과 학생 2는 모두 ~" 조합형 관행.
//   오답 원리: 반응 주체 교차 / 메타유형 오귀속 / 조합형 '모두'의 한쪽만 성립.
//
// stimulus 계약(A4 토대): 발표문은 지문이 아니라 koStimulus(SPEECH_SCRIPT)
// 1블록으로 신규 집필한다 — includesPassage=false, 사용자 지문은 소재 참고만.
// 학생 반응은 bogi(필수)의 "학생 n: …" 화자 행으로 담는다.
// ============================================================================

import { z } from "zod";
import { koBogiSchema, koMc5Envelope, koStimulusBlockSchema } from "../registry/envelope-schema";
import { buildDefaultKoRenderModel, type KoRenderModel } from "../core/render-model";
import type {
  KoQualityIssue,
  KoRenderContext,
  KoResolvedTypeSettings,
  KoTypeMeta,
  KoTypeModule,
  KoValidationContext,
} from "../registry/type-module";

// ---------------------------------------------------------------------------
// 반응 메타유형 풀 (카탈로그 §2.3 — 닫힌 집합)
// ---------------------------------------------------------------------------

const REACTION_METATYPE_KEYS = [
  "CURIOSITY",
  "BACKGROUND_KNOWLEDGE",
  "CREDIBILITY_CHECK",
  "USEFULNESS_EVAL",
  "FURTHER_INQUIRY",
] as const;
type ReactionMetatype = (typeof REACTION_METATYPE_KEYS)[number];

/** 메타유형별 판정 어휘 — 선지·반응 문면 대조용 결정론 사전 (외부 개념 검출). */
const REACTION_METATYPE_POOL: Record<ReactionMetatype, { label: string; keywords: string[] }> = {
  CURIOSITY: {
    label: "궁금증 형성",
    keywords: ["궁금", "의문", "알고 싶", "질문이 생"],
  },
  BACKGROUND_KNOWLEDGE: {
    label: "배경지식 활성화",
    keywords: ["배경지식", "알고 있던", "알고 있는", "배운", "들은 적", "떠올리", "떠올렸", "경험과 관련", "경험을 관련"],
  },
  CREDIBILITY_CHECK: {
    label: "신뢰성 점검",
    keywords: ["신뢰", "출처", "근거가", "점검", "정확한지", "정확한 정보인지", "사실인지", "믿을 만"],
  },
  USEFULNESS_EVAL: {
    label: "유용성 평가",
    keywords: ["유용", "도움이 되", "도움이 될", "활용할", "활용하", "실생활", "쓸모", "가치가 있"],
  },
  FURTHER_INQUIRY: {
    label: "추가 탐색 계획",
    keywords: ["찾아보", "찾아봐야", "더 알아보", "검색", "조사해", "탐색", "탐구해"],
  },
};

/** 텍스트가 지시하는 메타유형 집합을 결정론 검출한다 (라벨·키워드 문면 대조). */
function detectMetatypes(text: string): Set<ReactionMetatype> {
  const hits = new Set<ReactionMetatype>();
  for (const key of REACTION_METATYPE_KEYS) {
    const { label, keywords } = REACTION_METATYPE_POOL[key];
    if (text.includes(label) || keywords.some((k) => text.includes(k))) hits.add(key);
  }
  return hits;
}

/** 조합형 선지 판정 — "학생 1과 학생 2는 모두 ~" (변형 "~와 달리" 허용). */
const COMBO_OPTION_RE =
  /['‘]?학생\s*\d+['’]?\s*[과와]\s*['‘]?학생\s*\d+['’]?\s*(?:[은는이가]\s*)?(?:모두|달리)/;

/** <보기> 행의 화자 라벨("학생 1: …")에서 학생 번호를 추출한다. */
const BOGI_SPEAKER_RE = /^\s*['‘]?학생\s*(\d+)['’]?\s*[::]/;

// ---------------------------------------------------------------------------
// 스키마
// ---------------------------------------------------------------------------

const schema = koMc5Envelope({
  bogi: koBogiSchema.describe(
    "<보기> — 발표를 들은 학생들의 반응 (이 유형의 필수 요소). lines 는 '학생 1: …' 화자 형식으로 학생당 정확히 1행(학생 2~3명), 각 행 1~3문장의 반응 발화",
  ),
  koStimulus: z
    .array(koStimulusBlockSchema)
    .min(1)
    .max(1)
    .describe(
      '발표문 1블록 (kind="SPEECH_SCRIPT") — 이 유형의 필수 자료. 제공 지문의 복사가 아니라 신규 집필한 학생 발표문(인사·도입→본문→마무리, 500~800자)',
    ),
  reactionMap: z
    .array(
      z.object({
        student: z
          .string()
          .describe("'학생 1' 형식 — <보기> 행의 화자 라벨과 정확히 일치해야 함"),
        metatype: z
          .enum(REACTION_METATYPE_KEYS)
          .describe(
            "이 학생 반응의 메타유형: CURIOSITY=궁금증 형성, BACKGROUND_KNOWLEDGE=배경지식 활성화, CREDIBILITY_CHECK=신뢰성 점검, USEFULNESS_EVAL=유용성 평가, FURTHER_INQUIRY=추가 탐색 계획",
          ),
      }),
    )
    .min(2)
    .describe(
      "학생별 반응 메타유형 선언 — 한 학생이 메타유형 2개를 조합하면 항목 2개로 선언. 검증 게이트가 <보기> 행·선지와 대조한다",
    ),
  distractorPrinciples: z
    .array(z.enum(["SUBJECT_CROSS", "METATYPE_MISATTRIBUTION", "COMBO_HALF_TRUE", "NOT_IN_REACTION"]))
    .min(1)
    .max(4)
    .describe(
      "오답 4개에 사용한 왜곡 원리: SUBJECT_CROSS=반응 주체 교차(학생 n의 반응을 학생 m에 귀속), METATYPE_MISATTRIBUTION=메타유형 오귀속, COMBO_HALF_TRUE=조합형 '모두'의 한쪽만 성립, NOT_IN_REACTION=<보기> 어느 행에도 없는 반응의 사실화",
    ),
});

// ---------------------------------------------------------------------------
// 생성 프롬프트
// ---------------------------------------------------------------------------

const prompt = `### 유형: 화법 — 청중(청자) 반응 분석 (발표 세트 3슬롯)

**발문 템플릿** (정확히 이 형태 중 하나 — 긍정발문 고정, [3점] 표기는 시스템 처리이니 넣지 말 것):
- 표준: "발표 내용을 바탕으로 할 때, <보기>에 나타난 학생들의 반응에 대한 이해로 가장 적절한 것은?"
- 변형: "위 발표를 바탕으로 <보기>의 학생 반응을 이해한 내용으로 가장 적절한 것은?"
이 유형의 발문은 반드시 긍정발문이다. 부정발문 금지.

**발표문(koStimulus) 설계 — kind="SPEECH_SCRIPT" 1블록 신규 집필**:
1. 제공된 지문은 발표 주제·소재 선정의 **참고 자료일 뿐**이다 — 지문 문장을 복사하지 말고
   학생 발표문을 처음부터 새로 집필하라. 지문 갈래가 발표에 맞지 않으면 소재·개념만 빌려 와도 된다.
2. 정형 발표 구조를 지켜라: 인사·화제 도입(청중과의 접점 형성) → 본문 2~3개 화제(구체 정보·자료 제시)
   → 당부·마무리. 전체 500~800자, lines 는 문단 하나를 원소 하나로.
3. 괄호 지시문 — "(자료를 가리키며)", "(청중의 반응을 살피며)" — 을 1~2회 넣어 발표 담화의
   관행 표기를 재현하라.
4. **반응의 표적을 심어라**: <보기>의 각 반응이 발표문의 특정 정보를 지시할 수 있도록,
   출처 언급(신뢰성 점검의 표적), 실생활 활용 정보(유용성 평가의 표적), 간략히만 다루고 지나간
   내용(궁금증·추가 탐색의 표적), 널리 알려진 상식과 잇닿는 정보(배경지식 활성화의 표적)를
   본문 화제 안에 분산 배치하라.

**<보기> 학생 반응 설계 (bogi 필수 — 이 유형의 심장)**:
1. label="보기", lines = 발표를 들은 학생들의 반응. "학생 1: …" 화자 형식으로 학생당 정확히 1행,
   학생 번호는 1부터 연번. 각 행은 1~3문장.
2. 각 학생의 반응은 아래 **반응 메타유형 풀(닫힌 집합)** 에서 1~2개를 조합해 구성하고,
   reactionMap 에 학생별 메타유형을 빠짐없이 선언하라:
   - CURIOSITY(궁금증 형성): 발표에서 간략히 지나간 내용에 대한 의문 — "…은 왜 그런지 궁금해."
   - BACKGROUND_KNOWLEDGE(배경지식 활성화): 이미 알던 지식·경험과의 연결 — "수업에서 배운 …이 떠올랐어."
   - CREDIBILITY_CHECK(신뢰성 점검): 정보의 출처·근거 확실성 점검 — "출처를 밝히지 않아서 정확한 정보인지 확인이 필요해."
   - USEFULNESS_EVAL(유용성 평가): 발표 정보의 도움·가치 평가 — "…할 때 유용하게 쓸 수 있겠어."
   - FURTHER_INQUIRY(추가 탐색 계획): 더 알아보겠다는 구체 계획 — "…을 검색해서 찾아봐야겠어."
3. 각 반응은 발표문의 특정 내용(화제·수치·용어)을 문면에서 지시해야 한다 — 발표와 무관한
   일반 감상 금지. 학생 간 메타유형 조합은 서로 다르게 하라(전원 동일 조합 금지).
4. 반응 행들에는 서로 다른 메타유형이면서 표면 어휘가 일부 겹치는 진술을 섞어,
   선지의 메타유형 판정이 어휘 매칭이 아니라 반응의 기능 파악으로만 가능하게 하라.

**선지 구성 (5지선다 — 전부 '~고 있다' 종결)**:
1. ①~③ 개별형: "학생 1은 발표에서 제시한 정보의 출처를 언급하지 않은 점을 지적하며 내용의
   신뢰성을 점검하고 있다." 형식 — [학생 1명 지시] + [반응 행위의 재진술] + [메타유형 판정].
2. ④~⑤ 조합형 관행: "학생 1과 학생 2는 모두 ~하고 있다." — **조합형을 최소 1개, 표준은 2개(④·⑤)**
   포함하라. 두 학생 모두에게 성립하는지가 판정 포인트다.
3. 발문이 긍정형이므로 **정답 1개만** <보기>-발표문 대조로 완전 성립하고, 나머지 4개는 왜곡 선지다.
4. 선지의 메타유형 서술은 위 풀의 개념 어휘로 하라 — 풀 밖 개념(요약 능력, 비판적 반박, 공감 표현 등)을
   판정어로 쓰지 마라.

**오답(왜곡) 4원리 — distractorPrinciples 에 사용분을 선언**:
- SUBJECT_CROSS(반응 주체 교차): 학생 2의 반응 내용을 학생 1에 귀속 — 행위 서술 자체는 <보기>에
  실재하나 주체가 틀리다. 개별형 오답의 기본기.
- METATYPE_MISATTRIBUTION(메타유형 오귀속): 반응 행위의 재진술은 정확하되 판정 라벨을 인접
  메타유형으로 바꿔치기 — 예: 출처 점검 반응을 '유용성 평가'로, 배경지식 연결을 '궁금증 형성'으로.
- COMBO_HALF_TRUE(조합 절반 참): "학생 1과 학생 2는 모두 ~"에서 한 학생에게만 성립 —
  조합형 오답의 표준. '모두'의 전칭이 깨지는 지점을 정확히 한 명으로.
- NOT_IN_REACTION(반응에 없는 내용): <보기> 어느 행에도 없는 반응 행위를 그럴듯하게 사실화 —
  발표문에는 있으나 학생이 언급하지 않은 정보로 구성하면 매력도가 오른다.
왜곡은 선지당 **정확히 한 지점**이어야 한다. 주체와 메타유형을 동시에 비틀면 난도가 무너진다.

**근거앵커(evidence) 작성**:
- 모든 선지: spanText 는 <보기>의 해당 학생 반응 행(또는 판정에 필요한 발표문 구절)에서 verbatim 복사.
- 정답 선지: relation=SUPPORTS.
- SUBJECT_CROSS·METATYPE_MISATTRIBUTION·COMBO_HALF_TRUE 오답: relation=DISTORTS + 왜곡 판정의
  기준이 되는 반응 행. NOT_IN_REACTION 오답: relation=NOT_MENTIONED + 가장 가까운 반응 행.

**금지**:
- 부정발문. 조합형 선지 0개. '~고 있다' 이외의 선지 종결.
- 지문 문장을 복사한 발표문(발표문은 신규 집필), <보기> 반응 행의 문장을 그대로 복사한 선지(재진술 필수).
- <보기>에 없는 학생 번호를 지시하는 선지, 메타유형 풀 밖 개념의 판정어.
- 두 선지가 같은 이유로 틀리는 구성, 왜곡 지점이 두 군데 이상인 오답.
- 발표문 없이 <보기>만으로(또는 <보기> 없이 발표문만으로) 정오가 갈리는 선지 —
  이 유형의 판정은 발표문-반응 대조가 본질이다.`;

// ---------------------------------------------------------------------------
// 설정
// ---------------------------------------------------------------------------

function buildSettingsPrompt(settings: KoResolvedTypeSettings): string {
  const lines: string[] = [];
  if (settings.studentCount === "2") {
    lines.push(
      "- <보기> 반응은 학생 1·학생 2 두 명으로 구성하라. 조합형 선지는 '학생 1과 학생 2는 모두 ~' 한 짝으로.",
    );
  } else {
    lines.push(
      "- <보기> 반응은 학생 1~학생 3 세 명으로 구성하라. 조합형 선지의 짝(학생 1·2 / 학생 2·3 / 학생 1·3)을 서로 다르게 하라.",
    );
  }
  if (settings.examMode === "NAESIN") {
    lines.push(
      "- 내신 모드: 발표문은 교과서·수업 발표 담화의 정형(인사-예고-본문-요약-당부)을 또렷하게 지키고, 선지에 메타유형 개념어('신뢰성 점검', '배경지식 활성화' 등)를 명시적으로 결합해 개념 확인 성격을 더하라. 서술형 병행 대비로 반응 행마다 표적 정보가 발표문 몇 번째 화제인지 분명하게.",
    );
  } else {
    lines.push(
      "- 수능 모드: 발표문·반응 전부 이 문항을 위해 신규 집필하고(기성 담화 복사 금지), 배경지식 없이 <보기>와 발표문의 대조만으로 판정이 완결되게 하라. 발표 세트 3슬롯(37번) 관행 — 개별형 3 + 조합형 2 구성.",
    );
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// 검증 (결정론)
// ---------------------------------------------------------------------------

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function readBogiLines(question: Record<string, unknown>): string[] {
  if (!question.bogi || typeof question.bogi !== "object") return [];
  const lines = (question.bogi as Record<string, unknown>).lines;
  return Array.isArray(lines) ? lines.filter((l): l is string => typeof l === "string") : [];
}

function validate(question: Record<string, unknown>, ctx: KoValidationContext): KoQualityIssue[] {
  const issues: KoQualityIssue[] = [];
  const add = (severity: "error" | "warning", code: string, message: string) =>
    issues.push({ severity, code, message });

  const direction = str(question.direction);
  const options = Array.isArray(question.options)
    ? (question.options as Record<string, unknown>[])
    : [];

  // ── ① 발문: 긍정발문 고정 + 발표·<보기>·반응 지시 ──────────────────────
  if (direction) {
    if (ctx.koText.isNegativeStemKo(direction)) {
      add(
        "error",
        "ko-direction-grammar",
        "청중 반응 분석은 긍정발문('~반응에 대한 이해로 가장 적절한 것은?') 관행 유형입니다 — 부정발문 금지",
      );
    }
    if (!/발표/.test(direction) || !/보기/.test(direction) || !/반응/.test(direction)) {
      add(
        "error",
        "ko-direction-grammar",
        `발문이 발표·<보기>·학생 반응을 지시하지 않습니다: "${direction.slice(0, 40)}"`,
      );
    }
  }

  // ── ② <보기> 형식: '학생 n:' 화자 행 2개 이상 ──────────────────────────
  const bogiLines = readBogiLines(question);
  const studentSet = new Set<string>();
  for (const line of bogiLines) {
    const m = line.match(BOGI_SPEAKER_RE);
    if (m) studentSet.add(m[1]);
  }
  if (bogiLines.length > 0 && studentSet.size < 2) {
    add(
      "error",
      "ko-bogi-missing",
      `<보기>의 '학생 n:' 화자 반응 행이 ${studentSet.size}명분 — 학생 2명 이상의 반응 행('학생 1: …' 형식)이 필요합니다`,
    );
  }

  // ── ③ 선지-학생 대응: 지시 학생 실존 + ④ 조합형 선지 ≥1 ────────────────
  let comboCount = 0;
  for (const o of options) {
    const label = str(o.label);
    const text = str(o.text);
    if (!text) continue;
    const refs = [...text.matchAll(/학생\s*(\d+)/g)].map((m) => m[1]);
    if (refs.length === 0) {
      add(
        "error",
        "ko-marker-option-mismatch",
        `${label} 선지가 학생 반응('학생 n')을 지시하지 않습니다 — 반응 분석 선지 형식 위반`,
      );
      continue;
    }
    if (studentSet.size > 0) {
      const missing = [...new Set(refs)].filter((r) => !studentSet.has(r));
      if (missing.length > 0) {
        add(
          "error",
          "ko-marker-option-mismatch",
          `${label} 선지가 <보기>에 없는 학생(학생 ${missing.join(", 학생 ")})을 지시합니다 — 반응 주체 실존 위반`,
        );
      }
    }
    if (COMBO_OPTION_RE.test(text)) comboCount += 1;
  }
  if (options.length === 5 && comboCount === 0) {
    add(
      "error",
      "ko-option-count",
      "조합형 선지('학생 n과 학생 m은 모두 ~')가 하나도 없습니다 — 이 유형의 선지 구성 관행(④·⑤ 조합형 ≥1) 위반",
    );
  }

  // ── ⑤ reactionMap ↔ <보기> 화자 정합 ───────────────────────────────────
  const reactionMap = Array.isArray(question.reactionMap)
    ? (question.reactionMap as Record<string, unknown>[])
    : [];
  for (const r of reactionMap) {
    const student = str(r.student);
    const num = student.match(/\d+/)?.[0] ?? "";
    if (num && studentSet.size > 0 && !studentSet.has(num)) {
      add(
        "error",
        "ko-bogi-missing",
        `reactionMap 의 '${student}' 가 <보기> 화자 행에 없습니다 — 메타유형 선언과 반응 행이 어긋납니다`,
      );
    }
  }

  // ── ⑥ 극성-근거 정합 (긍정발문 고정: 정답=SUPPORTS, 오답=왜곡 계열) ─────
  const correctAnswer = str(question.correctAnswer);
  const evidence = Array.isArray(question.evidence)
    ? (question.evidence as Record<string, unknown>[])
    : [];
  const relationOf = new Map<string, Set<string>>();
  for (const e of evidence) {
    const label = str(e.optionLabel);
    const relation = str(e.relation);
    if (!label || !relation) continue;
    const set = relationOf.get(label) ?? new Set<string>();
    set.add(relation);
    relationOf.set(label, set);
  }
  const distortRelations = new Set(["DISTORTS", "CONTRADICTS", "NOT_MENTIONED"]);
  for (const [label, relations] of relationOf) {
    const isCorrect = label === correctAnswer;
    if (isCorrect && !relations.has("SUPPORTS")) {
      add(
        "error",
        "ko-evidence-missing",
        `${label} 는 정답 선지인데 SUPPORTS 근거가 없습니다 — 긍정발문 정답은 <보기>-발표문 정합 근거를 앵커해야 합니다`,
      );
    }
    if (!isCorrect && ![...relations].some((r) => distortRelations.has(r))) {
      add(
        "error",
        "ko-evidence-missing",
        `${label} 는 오답(왜곡) 선지인데 근거 relation 이 왜곡 계열(DISTORTS/CONTRADICTS/NOT_MENTIONED)이 아닙니다 — 극성 모순`,
      );
    }
  }

  // ── ⑦ 메타유형 풀 대조 (외부 개념 warning) ──────────────────────────────
  for (const o of options) {
    const label = str(o.label);
    const text = str(o.text);
    if (!text) continue;
    if (detectMetatypes(text).size === 0) {
      add(
        "warning",
        "ko-option-ending",
        `${label} 선지에 반응 메타유형 풀(궁금증 형성/배경지식 활성화/신뢰성 점검/유용성 평가/추가 탐색 계획)의 판정 어휘가 없습니다 — 풀 밖 개념 의심`,
      );
      break; // 같은 지적 반복 방지 — 첫 위반만
    }
  }

  // ── ⑧ 정답 선지의 메타유형 판정 ↔ reactionMap 선언 정합 (warning) ───────
  if (reactionMap.length > 0) {
    const declaredOf = new Map<string, Set<string>>();
    for (const r of reactionMap) {
      const num = str(r.student).match(/\d+/)?.[0] ?? "";
      const metatype = str(r.metatype);
      if (!num || !metatype) continue;
      const set = declaredOf.get(num) ?? new Set<string>();
      set.add(metatype);
      declaredOf.set(num, set);
    }
    const correct = options.find((o) => str(o.label) === correctAnswer);
    const correctText = correct ? str(correct.text) : "";
    if (correctText) {
      const refs = [...new Set([...correctText.matchAll(/학생\s*(\d+)/g)].map((m) => m[1]))];
      const declared = new Set<string>();
      for (const num of refs) for (const mt of declaredOf.get(num) ?? []) declared.add(mt);
      const detected = detectMetatypes(correctText);
      if (refs.length > 0 && declared.size > 0 && detected.size > 0) {
        const intersects = [...detected].some((mt) => declared.has(mt));
        if (!intersects) {
          add(
            "warning",
            "ko-option-ending",
            `정답 선지(${correctAnswer})의 메타유형 판정 어휘가 reactionMap 선언(${[...declared].join("/")})과 겹치지 않습니다 — 정답의 메타유형 오귀속 의심`,
          );
        }
      }
    }
  }

  return issues;
}

// ---------------------------------------------------------------------------
// 모듈
// ---------------------------------------------------------------------------

export const KO_SP_AUD: KoTypeModule = {
  meta: {
    typeId: "KO_SP_AUD",
    // ⚠ 계약 갭(조립 단계 해소 대상): 화법·작문·매체 클러스터의 area("SPEECH")와
    //   uiGroup("국어 화법·작문·매체")은 아직 type-module.ts 유니온에 미등록이다
    //   (계약 파일은 비소유 — 소유 클러스터가 유니온을 확장해야 함). 값은 팬아웃
    //   사양대로 고정하고, 유니온 등록 후 아래 두 캐스트를 제거할 것.
    area: "SPEECH" as unknown as KoTypeMeta["area"],
    label: "청중 반응 분석",
    formatCategory: "객관식",
    uiGroup: "국어 화법·작문·매체" as unknown as KoTypeMeta["uiGroup"],
    answerFormat: "MC5",
    // 발표문은 자체자료(koStimulus)로 신규 집필 — 사용자 지문은 소재 참고만.
    includesPassage: false,
    passageKinds: [], // 빈 배열 = 갈래 무관(어느 지문에서든 소재만 차용)
    defaultPoints: 2,
    usesBogi: "required",
    usesStimulus: "required",
    stimulusKinds: ["SPEECH_SCRIPT"],
    markerFamilies: [],
    optionEnding: "strategy",
    needsSolverGate: false,
    // 개별형(①~③)+조합형(④·⑤) 위치 관행 보존 — 결정론 셔플이 조합형을 앞
    // 번호로 옮기면 실전 조판 관행이 깨진다. 정답 위치는 생성 지시로 분산.
    lockedOptionOrder: true,
    description:
      "신규 집필 발표문(자체자료)과 <보기>의 학생 반응을 대조해, 반응 주체와 메타유형(궁금증·배경지식·신뢰성·유용성·추가 탐색) 판정이 모두 정확한 선지를 고르는 화법 발표 세트 유형",
    setSlot: "발표 세트(35~37) 3슬롯(37번) 고정 — 말하기 방식·계획/자료 활용 문항 뒤 마무리",
    studentTask:
      "발표를 들은 학생들의 <보기> 반응을 메타유형 풀로 판별해, 반응 주체와 판정이 모두 정확한 선지 하나를 고릅니다.",
    bestFor: [
      "정보 전달형 발표 소재(과학·문화·생활 정보)로 화법 세트를 마무리할 때",
      "청자 반응의 기능(점검·평가·탐색) 개념 훈련",
      "2028 공통 화법 대비 발표 담화 문항",
    ],
    outputUi: ["발표문 자료 박스", "〈보기〉 학생 반응", "5지선다(개별 3+조합 2)", "선지별 반응-메타유형 해설"],
  },
  schema,
  prompt,
  settings: {
    knobs: [
      {
        key: "studentCount",
        label: "반응 학생 수",
        kind: "select",
        options: [
          { value: "2", label: "2명(학생 1·2)" },
          { value: "3", label: "3명(학생 1~3)" },
        ],
        defaultValue: "3",
        description: "<보기> 반응 행 수 — 조합형 선지('학생 n과 학생 m은 모두')의 짝 구성 폭을 결정합니다",
      },
    ],
    buildPrompt: buildSettingsPrompt,
  },
  validate,
  toRenderModel(question, ctx: KoRenderContext): KoRenderModel {
    return buildDefaultKoRenderModel({
      question,
      passage: ctx.passage,
      suppressPassage: ctx.suppressPassage,
      includesPassage: false,
      answerFormat: "MC5",
      defaultPoints: 2,
    });
  },
  difficultyGuide: {
    BASIC:
      "학생당 메타유형 1개를 명료하게 — 반응 행에 판정 어휘('궁금해', '찾아봐야겠어')가 직설로 드러나게 하라. 오답은 SUBJECT_CROSS(주체 교차) 위주로, 두 반응 행의 표면 대조만으로 즉시 판정되게. 조합형은 공통점이 명백한 짝으로.",
    INTERMEDIATE:
      "학생 1명은 메타유형 2개 조합 반응으로(reactionMap 2항목 선언). 오답은 METATYPE_MISATTRIBUTION 위주 — 반응 행위의 재진술은 정확하되 판정 라벨만 인접 메타유형(신뢰성 점검↔유용성 평가, 배경지식↔궁금증)으로 바꿔치기하라. 조합형 1개는 COMBO_HALF_TRUE 로.",
    KILLER:
      "COMBO_HALF_TRUE 를 정교화하라: 조합형 '모두'에서 한 학생은 완전 성립, 다른 학생은 유사한 표면 어휘가 반응에 있으나 기능(메타유형)이 다르게 — 어휘 매칭이 아니라 반응의 기능 파악을 강제한다. 반응 행들에 서로 겹치는 소재 어휘를 중첩 배치하고, 정답도 조합형에 두어 전 선지 전수 검증을 유도하라. 왜곡은 여전히 선지당 정확히 한 지점.",
  },
};
