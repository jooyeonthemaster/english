// ============================================================================
// REFERENCE(지칭 추론) luna 레인 확장 — 견본: ./title.ts (본체 작성).
// 계약: ../luna-ext-types.ts · 스펙 정본:
// experiments/question-quality-20260715/luna-migration-20260814/SPEC.md
//
// 선택형 계열(지문 무변형)이라 재구성 계약이 없다. 이 유형의 최강 불변식은
// **밑줄 자리의 유일 확정**(gate-reference.ts #1~#3)이다 — markedSentence 한 줄에
// [[대명사]] 마커 하나로 "어느 대명사인가"와 "어디에 있는가"를 동시에 확정한다.
//
// 형식 노브 확인(§패밀리 특칙): REFERENCE 는 형식 노브가 **없다** —
// dispatchers.ts 에 reference* 키 0건, 선지 5개 고정(①~⑤), 선지 언어는 한국어
// 구조 고정(OPTION_LANGUAGE_FREE_TYPE_IDS 미등재), 발문 언어 토글은 어댑터가
// 서버측에서 집행(모델 출력과 무관). 따라서 이 유형의 "ctx 동적 스키마"는
// 상수로 떨어지는 것이 올바른 동작이다(lane-reference.ts mdFormat: optionCount 5).
//
// 파싱 산출물은 MdReferenceQuestion 동형으로 만들어 레인의 스냅(autoSnapReference)·
// 게이트(gateMdReference)·어댑터(adaptMdReferenceToAiQuestion)를 전부 재사용한다.
// ============================================================================

import type { MdLaneContext, MdLaneParsed } from "../lane-types";
import type { LunaLaneExt, LunaJsonSchemaSpec } from "../luna-ext-types";
import type { LunaBridgeFieldSpec } from "../luna-stream-bridge";
import { escapeRegExp, normalizeWs } from "../parser";
import {
  autoSnapReference,
  referenceTargetOf,
  stripReferenceMarks,
  REFERENCE_PRONOUN_LIST,
  type MdReferenceQuestion,
} from "../parser-reference";
import { gateMdReference } from "../gate-reference";
import { REFERENCE_MD_OPTION_LABELS } from "../prompts-reference";
import { buildReferenceDirection } from "../adapter-reference";

const LABELS: readonly string[] = REFERENCE_MD_OPTION_LABELS;

/**
 * 코어스 ④ — 학생 표면(해설·오답해설)으로 새어 나온 내부 마커 제거.
 * `[[they]]` → `they`, `__it__` → `it`. 기계로 확정 가능한 위반이라 반려 대신 교정한다.
 * (게이트의 마크업 검사는 선지에만 걸려 해설 유출을 잡지 못한다 — REFERENCE 감수
 * 실측에서 gemini 팔 5문항이 이 표면으로 인쇄 불가 판정을 받았다.)
 */
const LEAKED_MARK_RE = /\[\[([^\][]{1,80})\]\]|__([^_\n]{1,80})__/g;
function stripLeakedMarks(text: string): { text: string; changed: boolean } {
  const src = String(text ?? "");
  const out = src.replace(LEAKED_MARK_RE, (_m, a: string | undefined, b: string | undefined) =>
    (a ?? b ?? "").trim(),
  );
  return { text: out, changed: out !== src };
}
const OPTION_COUNT = LABELS.length; // 5 고정 — lane-reference.ts mdFormat 과 동기
const WRONG_COUNT = OPTION_COUNT - 1;

/**
 * 교사 지정 준수 게이트 — lane-reference.ts teacherPointIssues 의 동형 재현.
 * (lane 의 함수는 비공개라 import 불가·공유 파일 수정 금지 → 여기 복제한다.)
 * REFERENCE 는 POINT_PICKER_CONFIG 미등재라 ctx.teacherPoints 가 항상 [] 이므로
 * 실사용에서 발화하지 않지만, luna 경로가 gemini 경로보다 관대해지지 않도록
 * 레인 parseAndGate 산출과 이슈 집합까지 동형을 유지한다.
 */
function teacherPointIssues(q: MdReferenceQuestion, ctx: MdLaneContext): string[] {
  if (ctx.teacherPoints.length === 0) return [];
  const sentence = normalizeWs(stripReferenceMarks(q.markedSentence));
  const pronoun = normalizeWs(referenceTargetOf(q.markedSentence).pronoun);
  const issues: string[] = [];
  for (const point of ctx.teacherPoints) {
    const pt = normalizeWs(point.text);
    if (!pt) continue;
    const hit =
      (sentence.length > 0 && sentence.includes(pt)) ||
      (pronoun.length > 0 && (pt.includes(pronoun) || pronoun.includes(pt)));
    if (!hit) {
      issues.push(`교사 지정 표현이 밑줄문장에 없음: '${point.text.slice(0, 60)}'`);
    }
  }
  return issues;
}

/** 평가 표면용: 어댑터 산출 라벨("1"~"5")을 학생 표면 원문자로 되돌린다. */
function circledOf(label: string): string {
  const digit = Number(label.trim().replace(/[^0-9]/g, ""));
  if (digit >= 1 && digit <= OPTION_COUNT) return LABELS[digit - 1];
  return LABELS.includes(label.trim()) ? label.trim() : label;
}

/**
 * 후처리(processReference → findWordInPassage, strictContext=true)와 같은 규칙으로
 * 밑줄을 긋는다: surroundingText 창을 indexOf 로 찾고 창 안의 첫 단어경계 일치를
 * `__pronoun__` 처리. 평가 전용이라 실패 시 원문 그대로 반환(판정 오염 방지를 위해
 * 밑줄 없는 표면은 픽스처 검증에서 걸린다).
 */
function underlinePassage(passage: string, pronoun: string, surrounding: string): string {
  const target = pronoun.trim();
  if (!target) return passage;
  const body = `(?<![A-Za-z0-9_])${escapeRegExp(target)}(?![A-Za-z0-9_])`;
  let at = -1;
  const ctxIdx = surrounding ? passage.indexOf(surrounding) : -1;
  if (ctxIdx >= 0) {
    const slice = passage.slice(ctxIdx, ctxIdx + surrounding.length);
    for (const flags of ["", "i"]) {
      let m: RegExpExecArray | null = null;
      try {
        m = new RegExp(body, flags).exec(slice);
      } catch {
        return passage;
      }
      if (m) {
        at = ctxIdx + m.index;
        break;
      }
    }
  }
  if (at < 0) {
    try {
      const m = new RegExp(body).exec(passage);
      if (m) at = m.index;
    } catch {
      return passage;
    }
  }
  if (at < 0) return passage;
  return (
    passage.slice(0, at) +
    `__${passage.slice(at, at + target.length)}__` +
    passage.slice(at + target.length)
  );
}

export const REFERENCE_LUNA_EXT: LunaLaneExt = {
  subType: "REFERENCE",

  buildJsonSchema(): LunaJsonSchemaSpec {
    // 필드 순서 = 스트리밍 도착 순서: 본문성 필드(markedSentence)를 앞에.
    return {
      name: "reference_item",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["markedSentence", "options", "answer", "explanation", "wrong"],
        properties: {
          markedSentence: {
            type: "string",
            description:
              "표적 대명사가 든 지문 문장 하나를 한 글자도 바꾸지 않고(구두점·대소문자·축약형까지 축자로) 옮겨 적되, 표적 대명사 한 곳만 [[them]] 처럼 이중 대괄호로 감싼다. 마커는 정확히 1개, 마커 안은 대명사 한 단어. 라벨·번호·다른 문장을 붙이지 마라. 표적 자격: 선행사가 지문 안 명사구로 확정되는 대명사만 — 축약형 내부(it's·they're·that's)를 쪼개는 자리와, 지문에 그 집단을 가리키는 명사구가 없는 총칭 we/us/our(필자·독자를 포함하는 '사람 일반')는 표적으로 삼지 마라",
          },
          options: {
            type: "array",
            minItems: OPTION_COUNT,
            maxItems: OPTION_COUNT,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["label", "text"],
              properties: {
                label: { type: "string", enum: [...LABELS] },
                text: {
                  type: "string",
                  description:
                    "지칭 대상 후보 — 지문에 실재하는 명사구를 한국어로 옮긴 것. 라벨·번호·서식·괄호 판정 없이 명사구 텍스트만. 다섯 선지는 같은 층위·비슷한 규모로 맞춘다(권장 8~20자, 가장 긴 선지가 가장 짧은 선지의 2배를 넘기지 않게). 표적이 사람 대명사면 다섯 선지 전부 사람 명사구로, 사물·개념 대명사면 전부 사물·개념 명사구로 통일해 형태만으로 정답이 표나지 않게 한다. 정답 선지에 밑줄 문장의 서술어를 옮겨 담지 마라(지문을 읽지 않고 정답이 확정된다)",
                },
              },
            },
          },
          answer: {
            type: "string",
            enum: [...LABELS],
            description: "정답 라벨 하나 — 정답의 유일 진실원",
          },
          explanation: {
            type: "string",
            description:
              "해설 딱 2문장(한국어, 합쇼체) — 첫 문장은 정답 선지의 문구를 작은따옴표로 그대로 인용해 지칭 대상을 단정하고, 둘째 문장은 근거 지문 문장으로 확정한다. 학생이 그대로 읽는 표면이므로 내부 마커 [[ ]] 와 서식 문자(__·**)를 절대 쓰지 마라(지문을 인용할 때도 마커를 지운 원문 그대로 적는다)",
          },
          wrong: {
            type: "array",
            minItems: WRONG_COUNT,
            maxItems: WRONG_COUNT,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["label", "text"],
              properties: {
                label: { type: "string", enum: [...LABELS] },
                text: {
                  type: "string",
                  // 26-08-18 O225 해설 다이어트
                  description:
                    "이 오답이 왜 탈락인지 판정 근거 딱 1문장(한국어, 합쇼체) — 매력 이유·기제 이름·심리 서사 금지, 정답 라벨은 제외. 학생 표면이므로 내부 마커 [[ ]]·서식 문자 금지, 위치·역할 서술은 지문을 재확인한 사실만 적는다",
                },
              },
            },
          },
        },
      },
    };
  },

  buildSelfcheck(): string {
    return [
      // 26-08-18 O223 사다리 수술(어법 실측 이식)
      "## 규칙 충돌 시 우선순위 (필수)",
      "- 확정성(밑줄 자리 유일 확정·선행사 실재·정답 유일)은 **제약**이다: 아래 A·B 검산에 걸리는 표적·선지는 어떤 경우에도 쓰지 마라. 기출 형식(대명사 한 단어 밑줄·한국어 명사구 선지 5개·길이/층위 평행)도 양보 불가다.",
      "- 그 제약 안에서는 **요청된 난이도에 맞는 표적과 선지**가 목표다. '시비가 없다'는 이유로 요청 난이도보다 얕고 안전한 표적(바로 앞 명사구가 선행사여서 읽자마자 풀리는 자리)으로 후퇴하는 것은 실패다 — 확정적이면서 난이도에 맞는 표적은 거의 모든 지문에 있다.",
      "- 전부를 동시에 만족할 수 없으면 **오답 기제 다양성부터 양보하라**.",
      "- 표적 자리가 아래 검산을 통과하지 못하면 그 자리를 고집하지 말고 **다른 문장의 다른 대명사**로 표적을 옮겨라 — 그것이 허용된 탈출구다.",
      // 26-08-18 O225 원가 진단: 종전 "3자리 검토 후 가장 맞는 자리" 문구는 후보 전부를
      // A 검산 7항목에 통과시킨 뒤 비교하라는 뜻으로 읽혀 후보 상한이 사고를 못 줄였다
      // (r1 9,465→r2 9,219 평균 불변, 꼬리만 소멸). "첫 통과 자리에서 멈춤"으로 명확화.
      "- **사고 예산**: 표적 후보는 최대 2자리만 검토하고, A 검산을 통과하는 **첫 자리에서 멈춰 즉시 JSON 작성**으로 넘어가라(후보끼리 비교·순위 매기기 금지). 완벽한 자리를 찾느라 검토를 늘리면 응답이 잘려 전량 폐기된다.",
      "",
      "## A. 표적 고르기 (밑줄 자리 확정)",
      "1. markedSentence 는 표적 대명사가 든 **지문 문장 하나**를 지문에서 그대로 복사한 것이어야 한다 — 구두점·대소문자·축약형·따옴표까지 한 글자도 바꾸지 마라. 요약·의역·구두점 교체가 있으면 지문 축자 대조에서 반려된다. 500자 이내, 여러 문장·단락을 이어 붙이면 반려된다.",
      `2. 마커 [[ ]] 는 정확히 1개이고, 마커 안은 허용 목록의 대명사 **한 단어**다(구·절 밑줄 금지 — 기출 관행은 단어 단위 밑줄이다): ${REFERENCE_PRONOUN_LIST.join(" · ")}.`,
      "3. 그 문장은 지문에 **딱 한 번** 나와야 한다 — 두 번 이상 나오는 문장은 밑줄 자리가 확정되지 않아 반려된다.",
      "4. 표적이 지문 시작 20자 안에 있으면 반려된다(선행사가 지문 밖일 수 있음) — 지문 첫머리 대명사를 표적으로 잡지 마라. 표적 바로 앞 주변(약 45자)에 같은 대명사가 또 있어도 밑줄 자리를 유일하게 지목할 수 없어 반려된다.",
      "5. 허사 it 금지: it is/was ... that, it takes ... to 처럼 가리키는 대상이 없는 it 은 표적 부적격으로 반려된다. that 은 지시대명사 용법(That is ... 류)만 허용 — 접속사·관계사·한정사로 읽히는 자리는 반려된다.",
      "6. **축약형 내부 금지**: it's·they're·that's·he's 처럼 대명사가 축약형의 앞머리인 자리를 표적으로 잡지 마라. 밑줄이 한 낱말을 쪼개 기출에 없는 표면(__it__'s)이 되어 폐기된다 — 같은 대명사의 비축약 자리로 옮겨라.",
      "7. **선행사 실재 검산**: 표적을 고르기 전에 \"이 대명사가 가리키는 것은 지문의 어느 명사구인가\"에 지문 문구를 그대로 대며 답하라. 답하지 못하면 그 자리를 버려라. 특히 총칭 we/us/our(필자와 독자를 포함하는 '사람 일반')와 총칭 one 은 지문 어디에도 그 집단을 가리키는 명사구가 없어 정답 선지를 만들 수 없다 — 지문 안 명사구를 명시적으로 되받는 자리만 표적으로 삼아라.",
      "",
      "## B. 선지 짜기 (정답 유일 + 형태 노출 차단)",
      "8. 선지는 정확히 5개, 라벨은 ①②③④⑤ 순서 그대로다. 각 선지는 **한국어 명사구**만 쓴다 — 한글이 없는 선지는 반려된다. 기출 관행: 다섯 선지 전부 지문에 실재하는 서로 다른 명사구를 옮긴 것이어야 한다.",
      "9. **자질 평행(즉사 오답 상한 2개)**: 표적이 사람 대명사(he·she·they·we·one·his·her·their)면 다섯 선지를 **전부 사람 명사구**로, 사물·개념 대명사(it·its·this·these·those)면 **전부 사물·개념 명사구**로 통일하라. 사람 선지 하나에 추상 개념 넷을 섞으면 지문을 한 줄도 읽지 않고 정답이 나온다. 수·유생성 불일치만으로 지문 없이 소거되는 선지는 4개 중 최대 2개까지다.",
      "10. **규모 평행**: 가장 긴 선지가 가장 짧은 선지의 **2배를 넘기면 안 된다**(권장 8~20자). 낱말 하나짜리 선지('감정'·'아이들')와 긴 수식구 선지를 한 세트에 섞지 마라 — 다섯 줄이 같은 높이로 조판되어야 한다. 정답 선지만 유독 길면(오답 평균의 2.5배 이상) 길이로 정답이 표나 반려된다.",
      "11. **근거 노출 금지**: 정답 선지는 후보 명사구만 쓴다 — 밑줄 문장의 서술어를 번역해 담지 마라(예: 밑줄 문장이 'as they watched their lock hold evaporate' 인데 정답 선지를 '독점권 소멸을 지켜본 산업계'로 쓰면 지문 없이 정답이 확정된다). 선지 끝 괄호로 지칭 판정을 달아도 반려된다.",
      "12. 선지 텍스트에 서식·표 문자(**·__·HTML 태그·|)와 라벨·번호를 넣으면 반려된다. 선지 하나는 80자 이내, 선지끼리 중복 금지 — 같은 대상을 수식어만 바꿔 두 선지로 내면(예: '땀샘 활동의 증가'와 '땀샘의 활동') 정답이 둘이 되어 폐기된다.",
      "13. answer 는 ①~⑤ 하나이고 반드시 선지 라벨 집합 안에 있어야 한다. 출력 직전 오답 4개 각각에 \"이 후보가 정답이 될 수 없는 근거 문장\"을 지문에서 대라 — 못 대는 선지가 있으면 정답이 유일하지 않다는 뜻이니 그 선지를 갈아라.",
      "",
      "## C. 해설·오답 해설",
      "14. 해설은 비워 두면 반려된다. 첫 문장에 **정답 선지의 문구를 작은따옴표로 한 글자도 다르지 않게 인용**해 지칭 대상을 단정하라. 해설이 정답이 아닌 선지의 문구를 지칭 대상으로 긍정 단정하면 해설-정답 불일치로 반려된다.",
      "15. wrong 은 정답을 제외한 **4개 전부**여야 한다 — 라벨 중복 금지, 선지에 없는 라벨 금지, 정답 라벨이 끼면 반려된다.",
      "16. **마커 유출 금지**: 해설·오답 해설은 학생이 그대로 읽는 인쇄면이다. [[ ]]·__ 를 절대 쓰지 마라 — 지문을 인용할 때도 마커를 지운 원문 그대로 옮겨 적고, 표적은 \"밑줄 친 대명사\"로 지칭하라.",
      "17. 해설·오답 해설은 한국어 합쇼체(-습니다)로 통일하고, 지문에 없는 내용·확인하지 않은 구조 서술을 지어내지 마라. '바로 앞의 명사구'·'최근접'·'주체'처럼 위치·역할을 말할 때는 지문에서 실제 위치를 다시 확인한 뒤에만 적어라 — 틀린 위치 서술은 해설 허위로 폐기된다.",
      // 26-08-18 O225 해설 다이어트
      "18. 해설 분량: 정답 1~2문장·오답 딱 1문장, 유혹·심리 서사 금지 — 짧을수록 좋다.",
    ].join("\n");
  },

  parseAndGate(text, ctx): MdLaneParsed {
    try {
      const raw = JSON.parse(text) as {
        markedSentence: string;
        options: Array<{ label: string; text: string }>;
        answer: string;
        explanation: string;
        wrong: Array<{ label: string; text: string }>;
      };
      // 코어스 ④: 해설·오답해설의 내부 마커 유출을 제거(밑줄문장 마커는 계약이라 보존).
      const markFixes: string[] = [];
      const explanationFixed = stripLeakedMarks(String(raw.explanation ?? ""));
      if (explanationFixed.changed) markFixes.push("해설의 내부 마커([[ ]]·__) 제거");
      const wrongFixed = (Array.isArray(raw.wrong) ? raw.wrong : []).map((w) => {
        const fixed = stripLeakedMarks(String(w?.text ?? ""));
        if (fixed.changed) markFixes.push(`오답해설(${w?.label ?? "?"})의 내부 마커 제거`);
        return { label: w?.label, text: fixed.text } as { label: string; text: string };
      });
      let q: MdReferenceQuestion = {
        kind: "reference",
        // 코어스 ①(md 파서 동형): 개행·연속 공백을 한 칸으로 접는다 — 한 줄 계약.
        markedSentence: String(raw.markedSentence ?? "")
          .replace(/\s+/g, " ")
          .trim(),
        options: raw.options,
        answer: raw.answer,
        explanation: explanationFixed.text,
        // 코어스 ②: 오답 해설 라벨 오름차순 정렬(표시 결정론 — title/어법·빈칸 동일).
        wrong: wrongFixed.sort((a, b) => a.label.localeCompare(b.label)),
      };
      // 코어스 ③(레인 재사용): 밑줄문장을 지문 축자로 스냅(따옴표·대시·대소문자 드리프트).
      const snapped = autoSnapReference(q, ctx.passage);
      q = snapped.question;
      return {
        question: q,
        gateIssues: [
          ...gateMdReference(q, ctx.passage),
          ...teacherPointIssues(q, ctx),
        ],
        corrections: [...snapped.corrections, ...markFixes],
      };
    } catch (e) {
      return {
        question: null,
        gateIssues: [`luna JSON 파싱 실패: ${e instanceof Error ? e.message : String(e)}`],
        corrections: [],
      };
    }
  },

  bridgeSpecs: [
    { path: "markedSentence", prefix: "밑줄문장: ", suffix: "\n" },
    { path: "options[].label", prefix: "\n" },
    { path: "options[].text", prefix: " " },
    { path: "answer", prefix: "\n\n정답: " },
    { path: "explanation", prefix: "\n해설: ", suffix: "\n" },
    { path: "wrong[].label", prefix: "\n" },
    { path: "wrong[].text", prefix: " " },
  ] satisfies LunaBridgeFieldSpec[],

  renderEvalSurface(aiQuestion, passage): string {
    const pronoun =
      typeof aiQuestion.underlinedPronoun === "string" ? aiQuestion.underlinedPronoun : "";
    const direction =
      typeof aiQuestion.direction === "string" && aiQuestion.direction.trim()
        ? aiQuestion.direction
        : buildReferenceDirection(pronoun);
    const surrounding =
      typeof aiQuestion.surroundingText === "string" ? aiQuestion.surroundingText : "";
    const underlined = underlinePassage(passage, pronoun, surrounding);
    const options = Array.isArray(aiQuestion.options)
      ? (aiQuestion.options as Array<Record<string, unknown>>)
          .map((o) => `${circledOf(String(o.label ?? ""))} ${String(o.text ?? "")}`)
          .join("\n")
      : "";
    return `${direction}\n\n${underlined}\n\n${options}`;
  },
};
