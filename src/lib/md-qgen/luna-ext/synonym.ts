// ============================================================================
// 동의어(SYNONYM) luna 레인 확장 — 전 유형 이식 캠페인(vocabRecon 패밀리).
// 계약: ../luna-ext-types.ts · 견본: ./title.ts · 스펙 정본:
// experiments/question-quality-20260715/luna-migration-20260814/SPEC.md
//
// 이 유형은 지문을 한 글자도 변형하지 않는다 — 유일한 지문 결속점이 `target`
// 한 필드다. 그래서 이 패밀리의 축자 seam 검산이 전부 target 에 몰린다:
// 지문 축자 한 글자 대조 + 등장 1회(자리 유일) + 정답 누설(표적·굴절형이 선지에)
// 이 검산 블록의 심장이다. 파싱 산출물은 MdSynonymQuestion 동형으로 만들어
// 레인의 스냅(autoSnapSynonymTarget)·게이트(gateMdSynonym)·어댑터를 전부
// 재사용한다.
// ============================================================================

import type { MdLaneContext, MdLaneParsed } from "../lane-types";
import type { LunaLaneExt, LunaJsonSchemaSpec } from "../luna-ext-types";
import type { LunaBridgeFieldSpec } from "../luna-stream-bridge";
import { normalizeWs } from "../parser";
import {
  clampSynonymMdAnswerCount,
  clampSynonymMdOptionCount,
  SYNONYM_MD_ANSWER_COUNT_DEFAULT,
  SYNONYM_MD_CIRCLED,
  SYNONYM_MD_OPTION_COUNT_DEFAULT,
  SYNONYM_MD_OPTION_MAX_WORDS,
  SYNONYM_MD_TARGET_MAX_WORDS,
} from "../prompts-synonym";
import {
  autoSnapSynonymTarget,
  locateSynonymTarget,
  type MdSynonymOption,
  type MdSynonymQuestion,
} from "../parser-synonym";
import { gateMdSynonym } from "../gate-synonym";
import { SYNONYM_MD_DIRECTION } from "../adapter-synonym";

interface SynonymResolved {
  genericOptionCount?: number;
  genericAnswerCount?: number;
}

/**
 * 코어스 A — 해설 문체 정화(생성기 내부 용어 제거).
 *
 * 26-08-14 SYNONYM 패널 실측: luna 11문항 중 5문항(Q05·Q06·Q07·Q20·Q22)이 해설에
 * '표적 / 표적어 / 표적 단어' 를 그대로 노출했다. 이 말은 프롬프트 내부 용어이지
 * 학생이 보는 해설의 말이 아니다(기출 문체는 '밑줄 친 ~는'). 문자열 치환만으로
 * 확정 교정되는 위반이라 반려 대신 고쳐서 살린다(SPEC §1-8).
 *
 * 조사 보정: '표적'(받침 ㄱ)과 '단어'(받침 없음)는 조사 이형태가 달라 은/이/을/과를
 * 는/가/를/와로 바꿔 준다. 지문 내용어로서의 '표적'(사냥 표적 등)까지 잡을 위험이
 * 있으나, 이 유형 해설은 영어 단어의 뜻을 다루는 자리라 실측 노출 형태만 좁게 친다.
 */
const TARGET_JARGON_RE = /표적\s*단어|표적어|표적([은이을과의도만에])/g;
const PARTICLE_SWAP: Record<string, string> = {
  은: "는",
  이: "가",
  을: "를",
  과: "와",
};

function dejargonize(text: string): string {
  if (!text) return text;
  return text.replace(TARGET_JARGON_RE, (_m, particle: string | undefined) => {
    // '표적 단어'·'표적어'는 받침이 없어 뒤 조사를 그대로 물려받는다.
    if (particle === undefined) return "밑줄 친 단어";
    // '표적'(받침 ㄱ) 단독형만 조사 이형태를 갈아 끼운다.
    return `밑줄 친 단어${PARTICLE_SWAP[particle] ?? particle}`;
  });
}

/**
 * 코어스 B — 오답 해설 기제 표기 서식 통일.
 *
 * 실측: 세트 23문항에서 기제 표기가 5갈래로 갈렸다(전각 대시 16 · 콜론 3 ·
 * 대괄호 1 · 인라인 2 · 누락 1). 해설 지면이 문항마다 다른 서식으로 조판되는
 * 출하 결함이라, 앞머리 기제 라벨이 결정형으로 식별되는 두 형태(콜론형·대괄호형)를
 * 다수형('기제 — 설명')으로 접는다. 인라인형은 문장 재작성이 필요해 검산으로 돌린다.
 */
const DECOY_MECHANISMS = [
  "다의어 오축",
  "연어 위반",
  "강도 이동",
  "태도 극성",
  "논지 역할 배반",
  "논지 배반",
  "의미장 이웃",
];

function normalizeDecoyPrefix(text: string): string {
  if (!text) return text;
  const trimmed = text.trim();
  for (const mech of DECOY_MECHANISMS) {
    // '[기제] 설명' · '기제: 설명' · '기제 : 설명' → '기제 — 설명'
    const bracket = new RegExp(`^\\[\\s*${mech}\\s*\\]\\s*[:：-]?\\s*`);
    if (bracket.test(trimmed)) return trimmed.replace(bracket, `${mech} — `);
    const colon = new RegExp(`^${mech}\\s*[:：]\\s*`);
    if (colon.test(trimmed)) return trimmed.replace(colon, `${mech} — `);
  }
  return trimmed;
}

function optionCountOf(ctx: MdLaneContext): number {
  return clampSynonymMdOptionCount(
    (ctx.resolved as SynonymResolved).genericOptionCount ??
      SYNONYM_MD_OPTION_COUNT_DEFAULT,
  );
}

function answerCountOf(ctx: MdLaneContext): number {
  return clampSynonymMdAnswerCount(
    (ctx.resolved as SynonymResolved).genericAnswerCount ??
      SYNONYM_MD_ANSWER_COUNT_DEFAULT,
    optionCountOf(ctx),
  );
}

function labelsOf(ctx: MdLaneContext): string[] {
  return SYNONYM_MD_CIRCLED.slice(0, optionCountOf(ctx));
}

/**
 * 교사 지정 준수 — lane-synonym.ts 의 동명 함수와 동일 로직(레인 것은 비공개라
 * 여기 복제). 이 유형은 POINT_PICKER_CONFIG 미등재라 실전에서는 항상 비어 오지만,
 * 픽커가 열리는 날 "지정 단어 = 대상 단어" 가 유일한 결정형 준수 조건이 된다.
 */
function teacherPointIssues(q: MdSynonymQuestion, ctx: MdLaneContext): string[] {
  if (ctx.teacherPoints.length === 0) return [];
  const target = normalizeWs(q.target).toLowerCase();
  const issues: string[] = [];
  for (const p of ctx.teacherPoints) {
    const pt = normalizeWs(p.text).toLowerCase();
    if (!pt) continue;
    if (!target || (!target.includes(pt) && !pt.includes(target))) {
      issues.push(`교사 지정 표현이 대상 단어가 아님: '${p.text.slice(0, 60)}'`);
    }
  }
  return issues;
}

export const SYNONYM_LUNA_EXT: LunaLaneExt = {
  subType: "SYNONYM",

  buildJsonSchema(ctx): LunaJsonSchemaSpec {
    const labels = labelsOf(ctx);
    const optionCount = labels.length;
    const answerCount = answerCountOf(ctx);
    return {
      name: "synonym_item",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["target", "options", "answers", "explanation", "wrong"],
        properties: {
          target: {
            type: "string",
            description:
              `지문에서 밑줄 칠 단어 — 지문에서 복사-붙여넣기한 축자(굴절형·대소문자 원문 그대로), ${SYNONYM_MD_TARGET_MAX_WORDS}단어 이내, 지문 전체에 정확히 1회만 등장하는 내용어. **문맥을 봐야 어느 뜻인지 결정되는 단어**를 골라라(문맥 없이 뜻이 하나로 정해지는 일상어는 표준 동의어가 여럿이라 복수정답이 된다). 따옴표·별표로 감싸지 마라.`,
          },
          options: {
            type: "array",
            minItems: optionCount,
            maxItems: optionCount,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["label", "text"],
              properties: {
                label: { type: "string", enum: labels },
                text: {
                  type: "string",
                  description:
                    `영어 단어 또는 ${SYNONYM_MD_OPTION_MAX_WORDS}단어 이내의 짧은 구 — 라벨·번호·한글 뜻풀이·괄호 부연 없이 후보 표현만`,
                },
              },
            },
          },
          answers: {
            type: "array",
            minItems: answerCount,
            maxItems: answerCount,
            items: { type: "string", enum: labels },
            description: "정답 라벨(들) — 선지 라벨 원문자만, 중복 금지",
          },
          explanation: {
            type: "string",
            description:
              "정답 해설(한국어, 합쇼체) — 딱 2문장. ①밑줄 단어가 이 문맥에서 갖는 의미(밑줄 단어의 영어 철자를 그대로 쓴다) ②정답 단어(영어 철자 그대로)가 그 의미를 보존하는 이유를, **그 판단을 뒷받침하는 지문 속 어구를 인용하며** 쓴다. '정답은'·'①은' 같은 지칭만 쓰거나 '표적/표적어' 같은 내부 용어를 쓰지 마라",
          },
          wrong: {
            type: "array",
            minItems: optionCount - answerCount,
            maxItems: optionCount - answerCount,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["label", "text"],
              properties: {
                label: { type: "string", enum: labels },
                text: {
                  type: "string",
                  description:
                    "'<기제 이름> — <설명>' 골격의 1문장(한국어, 합쇼체). 기제 이름(다의어 오축·연어 위반·강도 이동·태도 극성·논지 역할 배반·의미장 이웃)을 맨 앞에 떼어 전각 대시로 잇고, 그 선지의 영어 단어를 직접 쓰며, **지문에 실제로 적혀 있는 어구**를 근거로 어느 한 문맥 요구조건에서 어긋나는지 밝힌다(사전적 어감 차이만으로 배제하지 마라 — 그런 후보는 복수정답이다)",
                },
              },
            },
          },
        },
      },
    };
  },

  buildSelfcheck(ctx): string {
    const optionCount = optionCountOf(ctx);
    const answerCount = answerCountOf(ctx);
    const wrongCount = optionCount - answerCount;
    const labels = labelsOf(ctx);
    return [
      // 26-08-18 O223 사다리 수술(어법 실측 이식)
      "## 규칙 충돌 시 우선순위 (필수 — 지시가 서로 부딪히면 이 사다리를 따르라)",
      `- 확정성(대입 검사에서 정답 정확히 ${answerCount}개·시비 없는 표적)은 **제약**이다: 유일성 검산에 걸리는 표적·선지는 어떤 경우에도 쓰지 마라. 기출 형식(표적 지문 축자·단어 단위 밑줄·굴절 일치·선지 표면 계약)도 양보 불가다.`,
      "- 그 제약 안에서는 **요청된 난이도에 맞는 표적·오답 후보**가 목표다. '시비가 없다'는 이유로 요청 난이도보다 얕고 안전한 선택(문맥 없이도 뜻이 잡히는 표적·즉시 지워지는 오답)으로 후퇴하는 것은 실패다 — 확정적이면서 난이도에 맞는 표적은 거의 모든 지문에 있다.",
      "- 전부를 동시에 만족할 수 없으면 **오답 기제 다양성부터 양보하라**(같은 기제 2개까지 허용). 그래도 막히면 표적 단어 자체를 다른 단어로 교체하라 — 판정 확정성과 축자 계약은 양보 불가.",
      "",
      "## 표적(target) 검산 — 축자·자리 유일 (필수 — 하나라도 어기면 기계 검사에서 자동 반려된다)",
      "- target 은 지문에서 복사-붙여넣기한 축자여야 한다. 출력 직전 지문에서 그 단어를 다시 찾아 **한 글자씩 대조**하라 — 굴절형·대소문자까지 원문 그대로(원형으로 되돌리지 마라). 지문에 없으면 자동 반려된다.",
      "- 지문 전체에서 target 의 등장 횟수를 실제로 세어라 — **정확히 1회**여야 한다. 2회 이상이면 밑줄 자리가 모호해 자동 반려된다. 여러 번 나오는 단어면 다른 표적으로 교체하라.",
      `- 표적은 ${SYNONYM_MD_TARGET_MAX_WORDS}단어 이내다. 기출 관행은 **단어 1개 밑줄**이고, 구동사·숙어처럼 한 덩어리로만 뜻이 살 때만 2~3단어를 허용한다. 구·절로 넓히면 자동 반려된다.`,
      "- 관사·전치사·대명사·be동사·조동사 등 기능어는 자동 반려된다. 문장 중간에서 대문자로 시작하는 단어(고유명사)도 자동 반려된다 — 일반 내용어(동사·명사·형용사·부사)를 골라라.",
      "",
      "## 선지 검산 (필수)",
      `- 선지는 정확히 ${optionCount}개, 라벨은 ${labels.join("")} 순서 그대로다.`,
      `- 선지 텍스트는 영어 단어 또는 ${SYNONYM_MD_OPTION_MAX_WORDS}단어 이내의 짧은 구만 쓴다. 한글 뜻풀이·괄호 부연·구분자 병기('postpone - delay'·'word / word'·쉼표 나열)·마크다운 장식(**·_·\`)·문장부호(.!?)가 하나라도 있으면 자동 반려된다.`,
      "- 표적 자신 또는 표적의 굴절형이 선지에 있으면 정답 누설로 자동 반려된다. 같은 어간의 굴절형 두 개(increase·increases 류)도 자동 반려된다 — 서로 독립된 후보만 세워라.",
      `- 선지 ${optionCount}개 전부 품사·굴절 형태를 표적과 일치시켜라(-s·-ing·-ly 축을 후보마다 하나씩 대조). 어긋난 후보는 자동 반려된다.`,
      "- 사실상 같은 뜻의 선지 중복은 자동 반려된다.",
      "- 선지 후보(정답·오답 모두)가 지문 본문에 이미 등장하는 단어면 정답 시비가 난다 — 그 후보를 다른 단어로 바꾸거나 다른 표적으로 교체하라.",
      "",
      "## 정답·해설 검산 (필수)",
      `- answers 는 정확히 ${answerCount}개이고 전부 선지 라벨 집합 안이어야 한다. 같은 라벨을 중복해 넣으면 하나로 접혀 개수 미달로 자동 반려된다.`,
      `- wrong 은 정답을 뺀 모든 선지에 1개씩, 정확히 ${wrongCount}개다. 정답 라벨을 wrong 에 넣으면 걷어내져 개수 미달로 자동 반려된다 — 정답 이야기는 explanation 에만 쓴다.`,
      "- 해설·오답 해설에서 선지를 '2번'·'선지 3'·'(3)' 같은 평숫자로 지칭하면 자동 반려된다(선지 순서는 출제 후 재배열된다). 그 단어를 직접 쓰거나 ①~ 원문자만 써라.",
      "- 해설은 비워선 안 된다. 해설·오답 해설의 문체는 한국어 합쇼체(-습니다)로 통일하라 — 반말('~한다')과 섞지 마라.",
      "- 해설에서 지문 구조·문맥을 서술할 때는 실제 지문을 다시 읽고 **사실만** 써라 — 지문에 없는 내용을 상투 문구로 지어내면 반려된다.",
      "- 해설에는 **밑줄 단어와 정답 단어를 영어 철자 그대로** 적어라('정답은…'·'①은…'으로만 지칭하면 해설지만 받은 학생에게 아무 정보도 남지 않는다). 오답 해설도 그 선지의 영어 단어를 직접 쓴다.",
      "- 해설 문체에 '표적/표적어/표적 단어' 같은 출제 내부 용어를 쓰지 마라 — 학생이 읽는 말은 '밑줄 친 <단어>는' 이다.",
      `- 오답 해설 ${wrongCount}개는 모두 같은 골격으로 써라: '<기제 이름> — <설명>'. 기제 이름(다의어 오축·연어 위반·강도 이동·태도 극성·논지 역할 배반·의미장 이웃)을 맨 앞에 떼어 놓고 전각 대시로 잇는다. 콜론형·대괄호형·문장 속 삽입형으로 흔들리면 해설 지면이 문항마다 다른 서식으로 조판된다.`,
      // 26-08-18 O225 해설 다이어트
      "- 해설 분량: 정답 해설 1~2문장·오답 해설은 기제 라벨 뒤 판정 근거 딱 1문장. '왜 매력적인지·학생이 왜 고르는지·무엇과 헷갈리는지' 같은 유혹·심리 서사 금지 — 짧을수록 좋다.",
      "",
      "## ⭐ 정답 유일성 검산 — 이 유형이 실제로 죽는 자리다 (필수)",
      `- 대입 검사: 선지 ${optionCount}개를 원문장의 밑줄 자리에 하나씩 넣어 **앞뒤 문장까지 함께** 읽어라. 의미·어조·연어·논지 구조를 동시에 지키는 것이 정확히 ${answerCount}개인지 세어라 — ${answerCount + 1}개째가 통과하면 그 선지를 다시 써라.`,
      "- **정답과 같은 뜻줄기의 오답은 절대 세우지 마라.** 오답이 밑줄 단어의 사전 동의어인 것은 좋다 — 단 그것은 반드시 **정답이 잡은 뜻과 다른 뜻**의 동의어여야 한다. 영영사전에서 정답 단어를 찾았을 때 그 오답이 뜻풀이나 유의어 줄에 나온다면(attend 자리의 join↔participate in, distorted 자리의 warped↔twisted, big↔large) 두 개가 같은 정답 슬롯을 나눠 가진 것이다. 즉시 다른 단어로 교체하라.",
      "- **배제 근거는 지문에서 인용할 수 있어야 한다.** 오답 하나하나에 대해 '이 후보를 떨어뜨리는 지문 속 어구가 무엇인가'를 물어라. 목적어·주어·앞뒤 문장의 대조어·패러프레이즈 어구 중 **실제로 지문에 적혀 있는 표현**을 댈 수 있어야 한다. 댈 것이 없고 '뉘앙스가 더 강하다·함축이 부정적이다·조금 더 적극적이다' 같은 사전적 어감 차이만 남는다면 그것은 배제 근거가 아니라 **복수정답 신고 사유**다 — 그 선지를 교체하라.",
      "- **정답에도 지문 앵커가 있어야 한다.** 정답을 지지하는 지문 어구(재진술·대조·목적어)를 하나 골라 explanation 에 실제로 인용하라. 인용할 앵커가 지문에 없다면 그 자리는 문맥이 뜻을 좁혀 주지 못하는 자리다 — **표적을 다른 단어로 교체하라**.",
      "- 표적 적격 재확인: 밑줄 단어가 문맥 없이도 뜻이 하나로 정해지는 평범한 일상어(attend·place·big·start 류)면 표준 동의어가 여럿이라 유일성이 서지 않는다. **문맥을 봐야 어느 뜻인지 결정되는 단어**(다의어·의미가 전이된 단어)를 골라라.",
      "",
      "## 기출 형식·품질 관행 (필수)",
      "- 선지 난이도·길이는 평행해야 한다 — 유독 길거나 유독 어려운 후보 하나가 정답을 흘리면 안 된다.",
      `- 정답 라벨을 ${labels[0]} 에 두지 마라. 후보를 떠올린 순서대로 늘어놓으면 정답이 첫 자리에 고정되는 편향이 실측된다 — 정답이 ${labels.slice(1).join("")} 중 하나에 오도록 배열하고, 오답 기제도 정답 바로 다음 라벨에 고정 배치하지 마라.`,
    ].join("\n");
  },

  parseAndGate(text, ctx): MdLaneParsed {
    try {
      const raw = JSON.parse(text) as {
        target: string;
        options: MdSynonymOption[];
        answers: string[];
        explanation: string;
        wrong: MdSynonymOption[];
      };
      // 파서 동형 코어스 1: 정답 라벨 중복 접기(parseMdSynonym 의 Set 축과 동일).
      const answers = [
        ...new Set(
          (Array.isArray(raw.answers) ? raw.answers : []).filter(
            (a): a is string => typeof a === "string",
          ),
        ),
      ];
      const answerSet = new Set(answers);
      const wrongAll = Array.isArray(raw.wrong) ? raw.wrong : [];
      // 파서 동형 코어스 2: 오답 칸의 정답 라벨 줄 걷어내기 + 근거 보존 —
      // 게이트가 "왜 한 개가 비었는지"를 지목할 수 있어야 한다(철칙 3·5).
      const answerLabelsInWrong = wrongAll
        .filter((w) => answerSet.has(w.label))
        .map((w) => w.label);
      let q: MdSynonymQuestion = {
        kind: "synonym",
        target: typeof raw.target === "string" ? raw.target.trim() : "",
        options: Array.isArray(raw.options) ? raw.options : [],
        answers,
        answer: answers[0] ?? "",
        explanation:
          typeof raw.explanation === "string" ? raw.explanation.trim() : "",
        // 코어스 3: 오답 해설 라벨 오름차순 정렬(표시 결정론 — 어법·빈칸·TITLE 동일).
        wrong: wrongAll
          .filter((w) => !answerSet.has(w.label))
          .sort((a, b) => a.label.localeCompare(b.label)),
        answerLabelsInWrong,
      };
      // 0원 스냅: 표적을 지문 축자 슬라이스로 보정(대소문자·구두점·한정어 드리프트).
      const snapped = autoSnapSynonymTarget(q, ctx.passage);
      q = snapped.question;
      const corrections = [...snapped.corrections];

      // 코어스 4·5: 해설 지면 정화 — 내부 용어 제거 + 기제 표기 서식 통일.
      // 둘 다 문자열만으로 확정되는 위반이라 반려하지 않고 고쳐서 살린다(SPEC §1-8).
      const explanationFixed = dejargonize(q.explanation);
      if (explanationFixed !== q.explanation) {
        corrections.push("해설의 생성기 내부 용어('표적…')를 '밑줄 친 단어'로 교정");
        q = { ...q, explanation: explanationFixed };
      }
      let jargonWrong = 0;
      let prefixWrong = 0;
      const wrongFixed = q.wrong.map((w) => {
        const dejargoned = dejargonize(w.text);
        if (dejargoned !== w.text) jargonWrong += 1;
        const normalized = normalizeDecoyPrefix(dejargoned);
        if (normalized !== dejargoned.trim()) prefixWrong += 1;
        return normalized === w.text ? w : { ...w, text: normalized };
      });
      if (jargonWrong > 0) {
        corrections.push(
          `오답해설 ${jargonWrong}개의 내부 용어('표적…')를 '밑줄 친 단어'로 교정`,
        );
      }
      if (prefixWrong > 0) {
        corrections.push(
          `오답해설 ${prefixWrong}개의 기제 표기를 '기제 — 설명' 다수형으로 통일`,
        );
      }
      if (jargonWrong > 0 || prefixWrong > 0) q = { ...q, wrong: wrongFixed };

      return {
        question: q,
        gateIssues: [
          ...gateMdSynonym(q, ctx.passage, {
            optionCount: optionCountOf(ctx),
            answerCount: answerCountOf(ctx),
          }),
          ...teacherPointIssues(q, ctx),
        ],
        corrections,
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

  bridgeSpecs: [
    { path: "target", prefix: "대상: ", suffix: "\n" },
    { path: "options[].label", prefix: "\n" },
    { path: "options[].text", prefix: " " },
    { path: "answers[]", prefix: "\n정답: " },
    { path: "explanation", prefix: "\n해설: ", suffix: "\n" },
    { path: "wrong[].label", prefix: "\n" },
    { path: "wrong[].text", prefix: " " },
  ] satisfies LunaBridgeFieldSpec[],

  renderEvalSurface(aiQuestion, passage): string {
    const direction =
      typeof aiQuestion.direction === "string" && aiQuestion.direction.trim()
        ? aiQuestion.direction
        : SYNONYM_MD_DIRECTION;
    const target =
      typeof aiQuestion.targetWord === "string" ? aiQuestion.targetWord.trim() : "";
    // 학생 표면의 밑줄 — 후처리 passageWithUnderline(`__단어__`)과 같은 표기.
    let surface = passage;
    if (target) {
      const hit = locateSynonymTarget(passage, target);
      if (hit) {
        surface =
          passage.slice(0, hit.index) +
          `__${passage.slice(hit.index, hit.index + hit.length)}__` +
          passage.slice(hit.index + hit.length);
      } else {
        surface = `${passage}\n\n[밑줄 단어: ${target}]`;
      }
    }
    const options = Array.isArray(aiQuestion.options)
      ? (aiQuestion.options as Array<Record<string, unknown>>)
          .map((o, i) => {
            // 어댑터의 숫자 라벨("1"~"N")을 학생 표면 원문자로 변환한다.
            const n = Number(o.label);
            const circled =
              Number.isInteger(n) && n >= 1 && n <= SYNONYM_MD_CIRCLED.length
                ? SYNONYM_MD_CIRCLED[n - 1]
                : (SYNONYM_MD_CIRCLED[i] ?? String(o.label ?? ""));
            return `${circled} ${String(o.text ?? "")}`;
          })
          .join("\n")
      : "";
    return `${direction}\n\n${surface}\n\n${options}`;
  },
};
