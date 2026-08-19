// ============================================================================
// 조건부 영작(CONDITIONAL_WRITING) luna 레인 확장 — 전 유형 이식 캠페인.
// 계약: ../luna-ext-types.ts · 견본: ./title.ts · 스펙 정본:
// experiments/question-quality-20260715/luna-migration-20260814/SPEC.md
//
// 이 유형의 특이점(선택형 견본과 다른 축):
//  - 서술형(writing 패밀리)이다. 선지가 없고 modelAnswer 가 정답의 유일 진실원.
//  - 채점은 MANUAL_ONLY(FREE_WRITING) — acceptedAnswers(허용 답안 집합) 계약이
//    아예 없는 유형이라 스키마에도 그 필드를 두지 않는다(어댑터가
//    correctAnswer = modelAnswer 를 복제한다). scoringCriteria 가 채점의 전부다.
//  - 지문을 재출력하지 않으므로 재구성 계약이 없고, 대신 "모범답안 ≠ 지문 축자
//    복사"가 최강 불변식이다(지문이 문항 안에 인라인 렌더된다).
// 파싱 산출물은 MdConditionalWritingQuestion 동형 — 레인의 스냅·게이트·어댑터를
// 전부 재사용한다.
// ============================================================================

import type { MdLaneParsed } from "../lane-types";
import type { LunaLaneExt, LunaJsonSchemaSpec } from "../luna-ext-types";
import type { LunaBridgeFieldSpec } from "../luna-stream-bridge";
import {
  CONDITIONAL_WRITING_SUB_TYPE,
  CW_MD_ANSWER_WORDS_MAX,
  CW_MD_ANSWER_WORDS_MIN,
  CW_MD_CONDITION_MAX,
  CW_MD_CONDITION_MIN,
  CW_MD_CRITERIA_MAX,
  CW_MD_CRITERIA_MIN,
} from "../prompts-conditional-writing";
import {
  autoSnapConditionalWriting,
  type MdConditionalWritingQuestion,
} from "../parser-conditional-writing";
import { gateMdConditionalWriting } from "../gate-conditional-writing";
import { CONDITIONAL_WRITING_MD_DIRECTION } from "../adapter-conditional-writing";

/**
 * 코어스: JSON 경로에서도 모델이 배열 항목 안에 불릿·번호 장식을 넣는 드리프트
 * (md 레인 실측과 동형)가 온다. 조건·채점기준은 학생 화면에 그대로 인쇄되므로
 * 기계 확정 가능한 장식만 벗긴다 — 의미가 걸린 값(숫자·인용 토큰)은 손대지 않는다.
 */
const CW_ITEM_BULLET_RE = /^(?:[-*•‣▪–—]\s+|\d{1,2}[.)]\s+|[①②③④⑤⑥⑦⑧⑨⑩]\s*)/;

/**
 * 코어스 2: 해설의 마크다운 잔재. 게이트의 CW_MARKDOWN_RESIDUE_RE 는 조건·채점기준만
 * 훑고 **해설은 보지 않으며**(gate-conditional-writing.ts #12), 레인 스냅도 해설은
 * 공백만 다듬는다(parser-conditional-writing autoSnapConditionalWriting). 그 결과
 * 해설에 남은 백틱이 무사통과해 정답·해설지에 문자 그대로 인쇄된다(r1 벤치 실측 1건:
 * "금지어인 `'as'`와 `'works'` 대신"). 반려가 아니라 **고쳐서 살린다** — 백틱·별표·
 * 파이프는 기계로 확정 가능한 장식이고 지우면 문장이 그대로 남는다.
 */
// ⚠ /g 정규식의 test() 는 lastIndex 를 물고 다녀 호출마다 답이 달라진다 — 판정용과
// 치환용을 분리해 둔다(같은 패턴을 두 번 적는 이유).
const CW_EXPLANATION_MD_TEST_RE = /[`|]|\*\*/;
const CW_EXPLANATION_MD_STRIP_RE = /[`|]|\*\*/g;

function stripExplanationMarkdown(
  explanation: string,
  corrections: string[],
): string {
  if (!CW_EXPLANATION_MD_TEST_RE.test(explanation)) return explanation;
  const stripped = explanation
    .replace(CW_EXPLANATION_MD_STRIP_RE, "")
    .replace(/\s+/g, " ")
    .trim();
  if (stripped && stripped !== explanation) {
    corrections.push(
      `해설 마크다운 잔재 제거(백틱·별표·파이프): '${explanation.slice(0, 40)}'`,
    );
    return stripped;
  }
  return explanation;
}

function coerceItems(
  values: unknown,
  label: string,
  corrections: string[],
): string[] {
  if (!Array.isArray(values)) return [];
  const out: string[] = [];
  values.forEach((value, index) => {
    if (typeof value !== "string") {
      corrections.push(`${label} ${index + 1}번이 문자열이 아니라 제거`);
      return;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      corrections.push(`${label} ${index + 1}번 빈 항목 제거`);
      return;
    }
    const stripped = trimmed.replace(CW_ITEM_BULLET_RE, "").trim();
    if (!stripped) {
      corrections.push(`${label} ${index + 1}번이 장식뿐이라 제거`);
      return;
    }
    if (stripped !== trimmed) {
      corrections.push(
        `${label} ${index + 1}번 불릿·번호 장식 제거: '${trimmed.slice(0, 30)}'`,
      );
    }
    out.push(stripped);
  });
  return out;
}

export const CONDITIONAL_WRITING_LUNA_EXT: LunaLaneExt = {
  // 26-08-14 판정 잔여 리스크: 통과했으나 사고 중앙값 10.6k·최대 12.6k 로 14k
  // 예산 여유가 3k 미만이라 긴 지문에서 빈 본문(예산 소진)이 재발할 수 있다.
  // 절단 계통 3종(순서·네모·삽입)과 같은 뿌리라 예방적으로 상향한다.
  maxTokens: 20_000,
  subType: CONDITIONAL_WRITING_SUB_TYPE,

  buildJsonSchema(ctx): LunaJsonSchemaSpec {
    const minConditions = CW_MD_CONDITION_MIN[ctx.difficulty];
    return {
      name: "conditional_writing_item",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        required: [
          "korean",
          "conditions",
          "modelAnswer",
          "scoringCriteria",
          "explanation",
        ],
        properties: {
          korean: {
            type: "string",
            description:
              "표적 문장의 한국어 번역 한 문장 — 영어를 한 글자도 쓰지 마라(괄호 병기·인용 포함). 원문의 절·수식어 범위와 1:1이고, 모범답안의 절과도 1:1이어야 한다(우리말에 없는 절이 모범답안에 있으면 학생이 도달할 수 없는 문항이 된다)",
          },
          conditions: {
            type: "array",
            minItems: minConditions,
            maxItems: CW_MD_CONDITION_MAX,
            items: {
              type: "string",
              description:
                "작성 조건 — 한국어 한 줄 지시문만(불릿·번호·마크다운 금지). 학생 답안에 문자 그대로 들어가야(또는 들어가지 말아야) 하는 표현만 작은따옴표로 감싼다. 구문·문법 용어에는 따옴표 금지. 구문 명칭은 정본 표기로 고정하라: It-that 강조구문 / 가정법 도치 / not only A but also B 상관접속사 구문 / 분사구문 / 독립 분사구문 / 비교구문 / 수동태 / 부정어 도치. 한 줄에는 한 축만 담아라(구문 요구와 단어 수를 한 줄에 합치지 마라)",
            },
            description: `작성 조건 ${minConditions}~${CW_MD_CONDITION_MAX}개(${minConditions}~3개 권장) — 기계 검증 가능한 조건(작은따옴표 필수/금지 표현 또는 정확 단어 수) 최소 1개 포함. 네 축(①시작어·필수 표현 ②금지 표현 ③구문 요구 ④정확 단어 수) 중 서로 **다른** 축만 고른다 — 같은 요구를 두 줄로 나눠 적어 개수를 채우지 마라`,
          },
          modelAnswer: {
            type: "string",
            description:
              "조건을 전부 동시에 만족하는 영어 완성 문장 정확히 한 줄 — 줄바꿈·따옴표 감싸기·한글 금지. 우리말(korean)의 명제만 옮겨라: 단어 수를 채우려고 우리말에 없는 절·명제를 세미콜론이나 접속사로 덧붙이지 마라(모자라면 답안이 아니라 조건의 숫자를 실제로 센 값으로 고친다)",
          },
          scoringCriteria: {
            type: "array",
            minItems: CW_MD_CRITERIA_MIN,
            maxItems: CW_MD_CRITERIA_MAX,
            items: {
              type: "string",
              description: "채점 항목(한국어) — 무엇을 확인해 몇 점인지",
            },
          },
          explanation: {
            type: "string",
            description:
              "해설 딱 2문장(한국어, 합쇼체) — 각 조건이 모범답안 어디서 충족되는지 + 원문 대비 어떤 구문 전환을 썼는지. 주어는 모범답안이다('모범답안은 ~했습니다'). '~해야 합니다'·'~능력을 평가합니다' 같은 출제 의도·당위 서술은 해설이 아니다. 백틱·별표·파이프 금지",
          },
        },
      },
    };
  },

  buildSelfcheck(ctx): string {
    const minConditions = CW_MD_CONDITION_MIN[ctx.difficulty];
    return [
      // ── 작성 순서: 이 유형의 최대 실패는 반려가 아니라 **출력 예산 소진**이다.
      // r1 벤치 실측: 12건 중 2건이 본문 0바이트(사고 토큰이 예산 14k 를 통째로
      // 먹었다 — 성공한 10건 중에서도 4건이 12.7k~13.5k 를 사고에 썼다). 원인은
      // "정확 N단어"를 먼저 정해 놓고 그 길이에 맞는 문장을 반복 탐색하는 루프다.
      // 순서를 뒤집어(답안 먼저 → 세어서 숫자 기입) 탐색 자체를 없앤다.
      "## 작성 순서 (이 순서로 한 번에 — 앞 단계로 되돌아가 다시 탐색하지 마라)",
      "1) 표적 문장 1개 선정 → 2) 우리말 1문장(원문의 절·수식어를 하나도 잘라내지 않는다) → 3) 결합할 구문 축 2개 결정 → 4) 모범답안 완성 → 5) **완성된 답안의 단어를 딱 한 번 세어** 그 수를 조건에 적는다 → 6) 조건 확정 → 7) 채점기준·해설.",
      "- 단어 수를 먼저 정해 놓고 답안을 그 길이에 맞춰 여러 번 고쳐 쓰지 마라. **답안이 먼저고 숫자가 나중이다** — 세는 일은 한 번이면 족하다.",
      `- 4)에서 두세 번 고쳐도 조건이 동시에 안 되면 구문 축 하나를 버리고 조건을 ${minConditions}개로 줄여 **즉시 진행**하라. 완벽한 조합을 계속 찾다가 출력 예산을 다 쓰면 문항이 통째로 사라진다(빈 출력 = 최악의 실패).`,
      "",
      // 26-08-18 O223 사다리 수술(어법 실측 이식)
      "## 규칙 충돌 시 우선순위 (필수)",
      "- 확정성(모범답안이 모든 조건을 실제로 동시 만족 + 기계 검증 가능한 조건 존재)은 **제약**이다: 이를 어기는 조건 조합은 어떤 경우에도 내지 마라. 기출 형식(작은따옴표 규약·한국어 지시문·해설 2문장)도 양보 불가다.",
      "- 그 제약 안에서는 **요청된 난이도에 맞는 구문 결합·조건 축**이 목표다. '시비가 없다'는 이유로 처음부터 요청 난이도보다 얕고 안전한 구문 축·조건으로 후퇴하는 것은 실패다(위 작성 순서의 '구문 축 버리기'는 두세 번 실제로 시도한 뒤의 예산 탈출구지, 시작점이 아니다).",
      "- 막히면 이렇게 양보하라: 구문 결합 수를 난이도 최소치까지 줄이고, 금지 어휘 조건은 다른 핵심어로 바꾸고, 정확 단어 수 조건은 모범답안을 실제로 센 값으로 고쳐라. 판정 확정성은 절대 양보하지 마라.",
      "",
      "## 출력 전 자가 검산 (필수 — 하나라도 어기면 기계 검사에서 자동 반려된다)",
      "- korean(우리말)은 한국어 한 문장이다. 영어를 한 글자도 쓰지 마라 — 괄호 병기·인용 포함. 조건의 인용 표현이 우리말에 그대로 적혀 있으면 반려된다(영작할 것을 미리 인쇄하면 문항이 사라진다).",
      `- 조건은 ${minConditions}~${CW_MD_CONDITION_MAX}개다(${minConditions}~3개를 권장한다). 각 항목은 한국어 한 줄 지시문(120자 이내)이고, 서로 중복되면 안 되며, 표 파이프(|)·백틱·별표(**) 같은 마크다운 잔재가 남으면 반려된다. 항목 문자열 안에 불릿·번호를 다시 쓰지 마라.`,
      "- 조건 축은 넷이다: ①시작어·필수 표현 ②금지 표현 ③구문 요구 ④정확 단어 수. 한 줄에 한 축만 담고, **서로 다른 축**만 골라라. 같은 요구를 두 줄로 나눠 개수를 채우면 조건 칸이 죽는다 — \"'It is'로 시작할 것\"은 이미 It-that 강조구문을 강제하므로 그 구문 조건을 따로 적지 말고, \"'Should'로 시작할 것\"·\"'Were'로 시작할 것\"도 이미 if 를 배제하므로 \"'if'를 쓰지 말 것\"을 덧붙이지 마라(금지어는 지문 원문의 다른 핵심어를 봉쇄하라).",
      "- 시작어 지정은 3단어 이내로 하라. 쉼표를 낀 문장 도입부를 통째로 주면(예: 네 단어짜리 도입구) 학생이 영작할 몫이 그만큼 사라진다 — 정확 단어 수의 20%를 넘기지 마라.",
      "- 구문 명칭은 정본 표기로 고정하라: It-that 강조구문 / 가정법 도치 / not only A but also B 상관접속사 구문 / 분사구문 / 독립 분사구문 / 비교구문 / 수동태 / 부정어 도치. 같은 구문을 문항마다 다른 이름으로 부르면 학생이 다른 구문으로 오독한다.",
      "- 조건은 형식만 지정한다. \"비교급으로 즉시 효과와 지연 효과를 대조할 것\"처럼 우리말에 이미 적힌 내용을 조건 줄에서 다시 풀어 쓰면 조건 박스가 번역 힌트가 된다 — 무엇을 쓸지가 아니라 어떤 형식으로 쓸지만 적어라.",
      "- 조건에는 조건만 적어라 — 모범답안·예시 문장·검산 메모를 덧붙이면 정답 노출로 반려된다(조건은 학생 화면에 그대로 인쇄된다). 따옴표 밖에서 모범답안과 내용어 3개 이상이 연속으로 겹쳐도 자동 반려다.",
      "- 작은따옴표는 기계 명령이다: 학생 답안에 문자 그대로 들어가야(또는 들어가지 말아야) 하는 표현만 감싸라. 구문·문법 용어(passive voice·not only A but also B·가정법 류)를 감싸면 그 문자열을 답안에서 찾다 실패해 정상 문항도 자동 반려된다 — 구문 요구는 따옴표 없이 한국어로 풀어 써라(예: 수동태로 쓸 것, 가정법 도치로 쓸 것).",
      "- 기계 검증 가능한 조건이 최소 1개 있어야 한다: 작은따옴표로 감싼 필수/금지 영어 표현 또는 정확 단어 수. \"N단어 이내\"·\"약 N단어\"·\"N~M단어\" 같은 범위·근사 표현은 기계 검증이 안 되니 정확 개수로만 써라.",
      "- 정확 단어 수 조건이 있으면 모범답안의 단어를 실제로 하나씩 세어 그 수와 같은지 확인하라(well-being 은 1단어, it's 도 1단어, makers' 도 1단어). 불일치는 자동 반려다 — 어긋나면 **조건의 숫자를 실제 개수로 고쳐라**(답안을 다시 쓰며 숫자를 맞추려 들지 마라).",
      "- 모범답안의 모든 절이 우리말에 대응 성분을 갖는지 대조하라. 단어 수나 구문 조건을 채우려고 우리말에 없는 절·명제를 세미콜론·접속사로 덧붙이면, 우리말만 보고 푸는 학생에게는 도달 경로가 없는 문항이 된다(실측 결함: 우리말을 다 옮긴 뒤 강조구문 한 절을 새로 지어 붙여 24단어를 맞춘 답안). 반대로 우리말의 절을 잘라내 수를 맞추는 것도 금지다.",
      "- 필수 인용 토큰은 모범답안에 문자 그대로 있어야 하고, 금지 인용 토큰은 모범답안에 없어야 한다(활용형까지 훑어라).",
      "- \"'X'으로 시작할 것\"이면 모범답안이 정말 X 로 시작해야 하고, \"'X'으로 끝낼 것\"이면 정말 X 로 끝나야 한다. 자리 지정의 부정형(\"'X'으로 시작하지 말 것\")은 형식 자체가 반려된다 — 금지는 \"'X'을 사용하지 말 것\"으로만 써라.",
      "- 두 조건이 서로를 배제하지 않는지 — 모범답안 하나로 전부 동시에 만족되는지 실제로 검산하라. 못 쓰겠으면 그 조건 조합은 폐기하고 다시 설계하라.",
      `- 모범답안은 영어 완성 문장 정확히 한 줄이다 — 줄바꿈 금지·한글 혼입 금지, ${CW_MD_ANSWER_WORDS_MIN}~${CW_MD_ANSWER_WORDS_MAX}단어.`,
      "- 모범답안이 지문 문장의 축자 복사면 반려다(구두점·대소문자만 바꾼 것 포함, 내용어 6개 이상 연속 일치 포함) — 지문이 문항 안에 함께 보이므로 베껴쓰기 과제가 된다. 시제·태·구문 전환을 최소 1개 넣어 다시 써라.",
      `- 채점기준은 ${CW_MD_CRITERIA_MIN}~${CW_MD_CRITERIA_MAX}개, 각각 한국어로 "무엇을 확인해 몇 점인지"를 적어라(이 유형은 기계 채점이 불가능해 채점기준이 채점의 전부다). 마크다운 잔재 금지.`,
      "- 해설은 한국어 딱 2문장(30~400자), 합쇼체(-습니다)로 통일하라. 해설 뒤에 지문을 다시 붙이지 마라. 주어는 모범답안이다(\"모범답안은 ~했습니다\") — \"~해야 합니다\"·\"~능력을 평가합니다\" 같은 출제 의도·당위 서술은 정답지 해설이 아니다.",
      "- 해설이 따옴표로 인용하는 영어 표현은 모범답안·조건·지문에 실제로 있는 것만 써라 — 없는 표현을 인용하면 환각 인용으로 자동 반려된다.",
      "- 해설에서 구조·문법 용어(부정사의 용법, 관계사의 격, 품사, 태, 수식 관계)를 말할 때는 모범답안을 실제로 다시 읽고 확인한 사실만 적어라. 상투 문구를 복사하면 틀린다 — 실측 결함 2건: 목적을 나타내는 부정사구를 \"목적어 역할\"이라 적었고(pay 는 그 자리에서 목적어를 취하지 않는다), 주격 what 절을 \"목적격 관계대명사\"라 적었다. 확신이 없으면 용법·격 이름을 쓰지 말고 그 부분을 인용만 하라.",
      "- 해설·채점기준에도 백틱(`)·별표·파이프를 쓰지 마라. 해설의 마크다운 잔재는 기계 검사가 잡지 못한 채 정답·해설지에 문자 그대로 인쇄된다.",
      "- 기출 형식: 우리말 1줄 + 조건 불릿 + 모범답안 1줄 + 채점기준 불릿 + 해설 순서다. JSON 필드 값 안에 라벨(\"우리말:\"·\"조건:\")을 다시 쓰지 마라.",
    ].join("\n");
  },

  parseAndGate(text, ctx): MdLaneParsed {
    try {
      const raw = JSON.parse(text) as {
        korean?: unknown;
        conditions?: unknown;
        modelAnswer?: unknown;
        scoringCriteria?: unknown;
        explanation?: unknown;
      };
      const coerceNotes: string[] = [];
      const q: MdConditionalWritingQuestion = {
        kind: "conditional-writing",
        korean: typeof raw.korean === "string" ? raw.korean : "",
        conditions: coerceItems(raw.conditions, "조건", coerceNotes),
        modelAnswer: typeof raw.modelAnswer === "string" ? raw.modelAnswer : "",
        scoringCriteria: coerceItems(raw.scoringCriteria, "채점기준", coerceNotes),
        explanation: typeof raw.explanation === "string" ? raw.explanation : "",
      };
      // 레인 스냅·게이트 재사용 — 산출물은 레인 parseAndGate 와 동형이라
      // 레인 adapt 가 그대로 소비한다.
      const snapped = autoSnapConditionalWriting(q);
      // 스냅이 해설은 공백만 다듬으므로(그 파일 주석 참조) 해설 마크다운 잔재는
      // 여기서 지운다 — 게이트가 보지 않는 축이라 반려가 아니라 교정이 정답이다.
      const snapNotes = [...snapped.corrections];
      const question: MdConditionalWritingQuestion = {
        ...snapped.question,
        explanation: stripExplanationMarkdown(
          snapped.question.explanation,
          snapNotes,
        ),
      };
      return {
        question,
        gateIssues: gateMdConditionalWriting(question, ctx.passage, {
          difficulty: ctx.difficulty,
        }),
        corrections: [...coerceNotes, ...snapNotes],
      };
    } catch (e) {
      return {
        question: null,
        gateIssues: [
          `luna JSON 파싱 실패: ${e instanceof Error ? e.message : String(e)}`,
        ],
        corrections: [],
      };
    }
  },

  // md 표면 동형 렌더 — 섹션 라벨은 직전 필드의 suffix 로 1회만 방류한다.
  // (scoringCriteria 는 스키마 minItems 2 라 헤더가 고아가 되는 경우가 없다.)
  bridgeSpecs: [
    { path: "korean", prefix: "우리말: ", suffix: "\n\n조건:" },
    { path: "conditions[]", prefix: "\n- " },
    { path: "modelAnswer", prefix: "\n\n모범답안: ", suffix: "\n\n채점기준:" },
    { path: "scoringCriteria[]", prefix: "\n- " },
    { path: "explanation", prefix: "\n\n해설: ", suffix: "\n" },
  ] satisfies LunaBridgeFieldSpec[],

  renderEvalSurface(aiQuestion, passage): string {
    const direction =
      typeof aiQuestion.direction === "string" && aiQuestion.direction.trim()
        ? aiQuestion.direction
        : CONDITIONAL_WRITING_MD_DIRECTION;
    const korean =
      typeof aiQuestion.referenceSentence === "string"
        ? aiQuestion.referenceSentence
        : "";
    const conditions = Array.isArray(aiQuestion.conditions)
      ? (aiQuestion.conditions as unknown[])
          .map((c) => `- ${String(c)}`)
          .join("\n")
      : "";
    return `${direction}\n\n${passage}\n\n[우리말] ${korean}\n\n<조건>\n${conditions}\n\n답안: ____________________________________`;
  },
};
