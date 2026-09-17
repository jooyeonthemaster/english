// ============================================================================
// IMPLIED_MEANING(함축 의미 추론) luna 레인 확장 — 전 유형 이식 캠페인.
// 계약: ../luna-ext-types.ts · 견본: ./title.ts · 스펙 정본:
// experiments/question-quality-20260715/luna-migration-20260814/SPEC.md
//
// 선택형 계열(지문 무변형) — 재구성 계약이 없다. 모델이 내는 것은 밑줄 표적
// (expression) 한 줄과 선지·정답·해설·오답뿐이며, 유일한 지문 결속점이
// expression 이라 스키마도 그 필드를 맨 앞에 둔다(스트리밍 도착 순서 =
// 브릿지 `밑줄:` 섹션이 먼저 흐른다).
//
// 형식 노브: 선지수(4~8)·정답수·선지 언어(en 기본/ko 토글)가 ctx 를 따라가는
// 동적 스키마다. 극성 토글은 이 유형에 없다(shared.ts — IMPLIED_MEANING 은
// 극성 토글 대상 아님, 발문은 어댑터 고정).
//
// 파싱 산출물은 MdImpliedQuestion 동형으로 어댑트해 레인의 스냅
// (autoSnapImpliedTarget)·게이트(gateMdImplied)·어댑터를 전부 재사용한다.
// ============================================================================

import type { MdLaneContext, MdLaneParsed } from "../lane-types";
import type { LunaLaneExt, LunaJsonSchemaSpec } from "../luna-ext-types";
import type { LunaBridgeFieldSpec } from "../luna-stream-bridge";
import {
  clampImpliedMdAnswerCount,
  clampImpliedMdOptionCount,
  IMPLIED_MD_ANSWER_COUNT_DEFAULT,
  IMPLIED_MD_CIRCLED,
  IMPLIED_MD_OPTION_COUNT_DEFAULT,
  IMPLIED_MD_TARGET_MAX_CHARS,
  IMPLIED_MD_TARGET_MAX_WORDS,
} from "../prompts-implied";
import {
  autoSnapImpliedTarget,
  locateImpliedTarget,
  type MdImpliedQuestion,
} from "../parser-implied";
import { gateMdImplied } from "../gate-implied";
import { IMPLIED_MD_DIRECTION } from "../adapter-implied";
import { normalizeWs } from "../parser";
import {
  countImpliedMeaningLexicalUnits,
  countWordsForQuality,
} from "@/lib/question-quality/core";
import { readOptionLanguageSetting } from "@/lib/question-type-generation-settings";

interface ImpliedResolved {
  genericOptionCount?: number;
  genericAnswerCount?: number;
}

function optionCountOf(ctx: MdLaneContext): number {
  return clampImpliedMdOptionCount(
    (ctx.resolved as ImpliedResolved).genericOptionCount ??
      IMPLIED_MD_OPTION_COUNT_DEFAULT,
  );
}

function answerCountOf(ctx: MdLaneContext): number {
  return clampImpliedMdAnswerCount(
    (ctx.resolved as ImpliedResolved).genericAnswerCount ??
      IMPLIED_MD_ANSWER_COUNT_DEFAULT,
    optionCountOf(ctx),
  );
}

/** 레인 optionLanguageOf 와 동일 판정 — 기본 en, 교사 토글 ko. */
function optionLanguageOf(ctx: MdLaneContext): "ko" | "en" {
  return readOptionLanguageSetting(ctx.rawTypeSettings, "IMPLIED_MEANING") === "ko"
    ? "ko"
    : "en";
}

function labelsOf(ctx: MdLaneContext): string[] {
  return IMPLIED_MD_CIRCLED.slice(0, optionCountOf(ctx));
}

/**
 * 교사 지정 준수 — 레인 lane-implied.ts 의 동명 검사와 동일 로직(비수출이라
 * 여기서 동형 재현). 이 유형은 POINT_PICKER_CONFIG 미등재로 teacherPoints 가
 * 실전에서 항상 비지만, 레인 parseAndGate 산출과의 동형성을 위해 방어 유지.
 */
function teacherPointIssues(q: MdImpliedQuestion, ctx: MdLaneContext): string[] {
  if (ctx.teacherPoints.length === 0) return [];
  const target = normalizeWs(q.expression);
  const issues: string[] = [];
  for (const p of ctx.teacherPoints) {
    const pt = normalizeWs(p.text);
    if (!pt) continue;
    if (!target || (!target.includes(pt) && !pt.includes(target))) {
      issues.push(`교사 지정 표현이 밑줄에 없음: '${p.text.slice(0, 60)}'`);
    }
  }
  return issues;
}

// ── 패널 실측(26-08-14 r1) 대응 헬퍼 ────────────────────────────────────────
// r1 감수에서 이 유형의 luna 팔이 F 3건(정답 유일성 붕괴 1·정답 축자 직역 1·
// 밑줄 시점 지시 불성립 1)과 형식 축 이탈(선지 12/12 전부 대문자 완결문 —
// 기출 함축의미 선지는 소문자 구·절)로 gemini 팔에 졌다. 아래는 그중 기계로
// 확정 가능한 것만 코어스·게이트로 내린 것이다(판정 불가한 것은 검산 문장).

const ELLIPSIS = (s: string, n = 60): string =>
  s.length > n ? `${s.slice(0, n)}…` : s;

/** 밑줄 꼬리 문장부호 — 기출은 종결부호를 밑줄 밖에 둔다(r1 Q01 `…an SOS.`). */
const TARGET_TAIL_PUNCT_RE = /[.,;:!?…]+$/;
/** 선지 꼬리 종결부호 — 기출 함축의미 선지는 마침표를 찍지 않는다. */
const OPTION_TAIL_PUNCT_RE = /[.!?]+$/;

/** 축자 직역 표지 — 정답 자리에 오면 "밑줄의 겉뜻"을 정답으로 앉힌 것이다. */
const LITERAL_MARKER_EN_RE = /\b(physical|physically|literal|literally|actual|actually)\b/i;
const LITERAL_MARKER_KO_RE = /(물리적|문자 그대로|글자 그대로|실제 그늘|말 그대로)/;

const IMPLIED_TOKEN_STOPWORDS = new Set([
  "the", "and", "for", "with", "that", "this", "these", "those", "from", "into",
  "our", "your", "their", "its", "his", "her", "you", "they", "them",
  "are", "was", "were", "been", "being", "has", "have", "had", "does", "did",
  "can", "could", "will", "would", "shall", "should", "may", "might", "must",
  "not", "but", "than", "then", "when", "while", "which", "who", "whom", "what",
  "all", "any", "some", "many", "more", "most", "one", "two", "over", "under",
  "out", "about", "without", "within", "upon", "via", "such", "very", "just",
  "only", "also", "own", "other", "others",
]);

/** 내용어 토큰 집합(3자 이상·불용어 제외) — 밑줄↔선지 어휘 재사용 판정용. */
function contentTokensOf(s: string): Set<string> {
  const out = new Set<string>();
  for (const t of s.toLowerCase().match(/[a-z][a-z'’-]{2,}/g) ?? []) {
    if (!IMPLIED_TOKEN_STOPWORDS.has(t)) out.add(t);
  }
  return out;
}

/**
 * 코어스 ④ — 밑줄 꼬리 문장부호 제거.
 * 밑줄에 종결 마침표·느낌표가 딸려 들어가면 발문에 표현을 인용할 때 조판이
 * 깨진다(r1 Q01 `that's actually an SOS.` · Q08 `a big, tasty world out there!`).
 * 자른 표현이 지문에 여전히 축자로 있을 때만 발동한다.
 */
function coerceTargetTailPunct(
  expr: string,
  passage: string,
): { expr: string; correction?: string } {
  const trimmed = expr.replace(TARGET_TAIL_PUNCT_RE, "").trim();
  if (!trimmed || trimmed === expr) return { expr };
  if (!locateImpliedTarget(passage, trimmed)) return { expr };
  return {
    expr: trimmed,
    correction: `밑줄 꼬리 문장부호 제거(기출은 종결부호를 밑줄 밖에 둔다): '${ELLIPSIS(expr)}' → '${ELLIPSIS(trimmed)}'`,
  };
}

/**
 * 코어스 ⑤ — 명사구 표적의 관사 복원.
 * 기출은 `a brick wall of resistance`처럼 관사부터 통째로 긋는데 r1 세트는
 * 같은 표적을 관사 포함/미포함으로 엇갈리게 그었다(Q05↔Q24, Q12↔Q03).
 * 바로 앞 관사를 흡수해도 6단어 상한·자리 유일이 유지될 때만 발동한다.
 */
function coerceLeadingArticle(
  expr: string,
  passage: string,
): { expr: string; correction?: string } {
  if (/^(a|an|the)\s/i.test(expr)) return { expr };
  const hit = locateImpliedTarget(passage, expr);
  if (!hit || hit.count !== 1 || hit.index === 0) return { expr };
  const before = passage.slice(0, hit.index);
  const m = before.match(/(?:^|[^A-Za-z])((?:a|an|the|A|An|The)\s+)$/);
  if (!m) return { expr };
  const extended = passage.slice(hit.index - m[1].length, hit.index + hit.length);
  // 게이트의 크기 판정 3축(단어·어휘단위·글자)을 그대로 재현해, 코어스가 도리어
  // "밑줄이 너무 김" 반려를 만드는 일이 없게 한다.
  if (
    countWordsForQuality(extended) > IMPLIED_MD_TARGET_MAX_WORDS ||
    countImpliedMeaningLexicalUnits(extended) > IMPLIED_MD_TARGET_MAX_WORDS ||
    extended.length > IMPLIED_MD_TARGET_MAX_CHARS
  ) {
    return { expr };
  }
  const exHit = locateImpliedTarget(passage, extended);
  if (!exHit || exHit.count !== 1) return { expr };
  return {
    expr: extended,
    correction: `밑줄에 관사 복원(기출은 명사구를 관사부터 통째로 긋는다): '${ELLIPSIS(expr)}' → '${ELLIPSIS(extended)}'`,
  };
}

/** 지문에서 문두가 아닌 자리에 대문자로 나오면 고유명사로 보고 손대지 않는다. */
function looksProperNoun(token: string, passage: string): boolean {
  if (token === "I") return true;
  if (token.length > 1 && token === token.toUpperCase()) return true;
  const esc = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`[a-z0-9,;:]\\s+${esc}\\b`).test(passage);
}

/**
 * 코어스 ⑥ — 영어 선지를 기출 표면(소문자 구·절, 마침표 없음)으로 내린다.
 * r1 에서 luna 팔 12/12 가 전부 대문자 완결문+마침표였고 gemini 팔 12/12 가
 * 기출형 소문자 구였다 — 한 시험지에 섞이면 같은 유형이 두 얼굴로 보인다.
 * 고유명사·약어·1인칭 I 는 건드리지 않는다.
 */
function coerceEnglishOptionText(text: string, passage: string): string {
  const out = text.trim().replace(OPTION_TAIL_PUNCT_RE, "").trim();
  const first = out.match(/^[A-Za-z][A-Za-z'’-]*/)?.[0];
  if (!first || !/^[A-Z]/.test(first) || looksProperNoun(first, passage)) return out;
  return out.slice(0, 1).toLowerCase() + out.slice(1);
}

/**
 * 추가 게이트 — 정답이 밑줄의 축자 직역인 문항 반려.
 * r1 Q23 은 정답으로 지정된 선지가 밑줄 어휘(shade)를 그대로 쓰면서
 * `physical shade`로 겉뜻을 지목했는데, 같은 문항의 해설이 "실제 그늘을
 * 빼앗는다는 뜻이 아니라"라고 그 독해를 부정했다 — 정답과 해설이 정면 충돌하는
 * 출하 불가 문항이다. 축자 표지어 + 밑줄 어휘 재사용이 동시에 걸릴 때만 울려
 * 오반려를 막는다(공유 게이트는 손대지 않고 이 파일에서만 덧댄다).
 */
function literalAnswerIssues(
  q: MdImpliedQuestion,
  optionLanguage: "ko" | "en",
): string[] {
  if (q.answers.length === 0) return [];
  const answerSet = new Set(q.answers);
  const exprTokens = contentTokensOf(q.expression);
  const v: string[] = [];
  for (const opt of q.options) {
    if (!opt.text || !answerSet.has(opt.label)) continue;
    if (optionLanguage === "en") {
      const marker = opt.text.match(LITERAL_MARKER_EN_RE);
      if (!marker) continue;
      const shared = [...contentTokensOf(opt.text)].filter((t) => exprTokens.has(t));
      if (shared.length === 0) continue;
      v.push(
        `정답 ${opt.label}가 밑줄의 축자 직역 — 밑줄 어휘 '${shared[0]}'를 그대로 쓰면서 '${marker[0]}'로 겉뜻을 지목한다. 축자 직역은 오답 기제이고 정답은 지문 근거를 종합한 함축의 재진술이어야 한다: '${ELLIPSIS(opt.text)}'`,
      );
    } else if (LITERAL_MARKER_KO_RE.test(opt.text)) {
      v.push(
        `정답 ${opt.label}가 밑줄의 축자 직역 — 겉뜻(문자 그대로의 뜻)을 정답으로 앉혔다. 정답은 함축의 재진술이어야 한다: '${ELLIPSIS(opt.text)}'`,
      );
    }
  }
  return v;
}

export const IMPLIED_MEANING_LUNA_EXT: LunaLaneExt = {
  subType: "IMPLIED_MEANING",

  buildJsonSchema(ctx): LunaJsonSchemaSpec {
    const labels = labelsOf(ctx);
    const optionCount = labels.length;
    const answerCount = answerCountOf(ctx);
    const lang = optionLanguageOf(ctx);
    return {
      name: "implied_meaning_item",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["expression", "options", "answers", "explanation", "wrong"],
        properties: {
          // 유일한 지문 결속점 — 맨 앞(브릿지 `밑줄:` 섹션이 먼저 흐른다).
          expression: {
            type: "string",
            description:
              `지문에서 밑줄 칠 표현 — 지문 축자 그대로(한 글자도 바꾸지 마라), ` +
              `${IMPLIED_MD_TARGET_MAX_WORDS}단어 이내, 지문에 1회만 등장하는 표현. ` +
              "따옴표·별표로 감싸지 마라. 반드시 비유·관용·환유처럼 겉뜻과 속뜻이 " +
              "갈리는 표현을 골라라(사전 뜻대로 읽으면 끝나는 투명한 명사구 금지). " +
              "문장 종결부호(. ! ?)는 밑줄에 넣지 말고, 명사구면 앞 관사부터 포함하라.",
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
                    lang === "ko"
                      ? "함축 의미 선지(한국어 완결 진술문) — 라벨·번호 없이 텍스트만"
                      : "함축 의미 선지(영어 구·절, 3단어 이상) — 라벨·번호 없이 텍스트만. " +
                        "기출 표면: 소문자로 시작하는 구·절이며 마침표를 찍지 않는다. " +
                        "밑줄 자리에 그대로 넣어 읽히도록 밑줄과 같은 문법 범주로 써라" +
                        "(밑줄이 명사구면 명사구, 동사구면 동사구). 대문자 완결문과 " +
                        "'It refers to ~' 같은 메타 서술 프레임은 쓰지 마라.",
                },
              },
            },
          },
          answers: {
            type: "array",
            minItems: answerCount,
            maxItems: answerCount,
            items: { type: "string", enum: labels },
            description: "정답 라벨(들) — 선지 라벨 그대로",
          },
          explanation: {
            type: "string",
            description:
              "정답 해설(한국어, 합쇼체) — 어느 근거 문장들을 이어 표면 의미에서 " +
              "함축으로 넘어가는지 2문장. 해설이 부정한 독해(예: '실제 ~라는 뜻이 " +
              "아니라')를 정답 선지가 담고 있으면 자기모순이니 그 전에 정답을 바꿔라.",
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
                  // 26-08-18 O225 해설 다이어트
                  description:
                    "이 오답이 왜 탈락인지 판정 근거 딱 1문장(한국어, 합쇼체) — 매력 이유·기제 이름·심리 서사 금지. " +
                    "탈락 근거는 지문의 어느 문장이 그 선지를 거짓으로 만드는지로 써라. " +
                    "선지가 하지도 않은 전칭·보장 주장(모든·항상·보장한다)을 덧씌워 " +
                    "반박하는 허수아비 논증은 금지다.",
                },
              },
            },
          },
        },
      },
    };
  },

  buildSelfcheck(ctx): string {
    const labels = labelsOf(ctx);
    const optionCount = labels.length;
    const answerCount = answerCountOf(ctx);
    const wrongCount = optionCount - answerCount;
    const lang = optionLanguageOf(ctx);
    const killer = ctx.difficulty === "KILLER";
    return [
      // 26-08-18 O223 사다리 수술(어법 실측 이식): 확정성=제약으로 강등, 난이도 정합=목표로 승격.
      "## 규칙 충돌 시 우선순위 (필수 — 지시가 서로 부딪히면 이 사다리를 따르라)",
      "- 판정 확정성(밑줄이 지문 축자·1회 등장·정답 유일, 오답 전원 확정 탈락)은 **제약**이다 — 어떤 경우에도 양보하지 마라. 기출 형식(6단어 이내 압축 밑줄·선지 언어/길이 평행·오답 해설 전원)도 양보 불가다.",
      "- 그 제약 안에서는 **요청된 난이도에 맞는 표적·선지**가 목표다. '시비가 없다'는 이유로 요청 난이도보다 얕고 안전한 선택(뜻이 빤히 드러나는 표적·한눈에 지워지는 오답)으로 후퇴하는 것은 실패다 — 확정적이면서 난이도에 맞는 표적은 거의 모든 지문에 있다.",
      "- 막히면 3순위 공예 다양성(비유 표적 우선·오답 기제 다양성)부터 양보하라 — 기제 다양성과 비유 우선을 버리고, 표적을 지문에 1회만 등장하는 더 짧고 안전한 후보로 바꿔도 된다.",
      "",
      "## 출력 전 자가 검산 (필수 — 하나라도 어기면 기계 검사에서 자동 반려된다)",
      "- expression(밑줄)은 지문에 실재하는 표현을 **한 글자도 바꾸지 않고** 복사했는가 — 굴절형·대소문자·구두점까지 원문 그대로. 지문에서 찾아 한 글자씩 대조하라.",
      "- expression 이 지문에 **정확히 1회** 등장하는가 — 두 번 이상 나오는 표현은 밑줄 자리가 확정되지 않아 반려된다. 등장 횟수를 직접 세어라.",
      `- expression 은 ${IMPLIED_MD_TARGET_MAX_WORDS}단어 이내·${IMPLIED_MD_TARGET_MAX_CHARS}자 이내인가 — 단어 수를 세어라. 넘으면 반려된다. 의미 단위가 길면 핵심 명사구·동사구·대조구·비유구만 잘라 써라.`,
      "- 단일 단어·대명사·기능어 표현이 아닌가 — 내용어 2개 이상이어야 한다(단일 어휘는 어휘 문항이 되어 반려).",
      "- expression 이 전치사·접속사(of·to·in·that·while 류)로 끝나 잘려 있지 않은가 — 완결된 압축 구여야 한다.",
      "- 물음표로 끝나는 수사적 질문(또는 그런 자문자답 문장 속 표현)에 밑줄을 긋지 않았는가 — 자문자답 구조면 답변 쪽 압축 표현으로 옮겨라.",
      "- 밑줄과 **같은 문장**이 바로 뒤에서 뜻을 그대로 풀어 주지 않는가(that is / in other words / this means 류) — 표면-이면 간극이 0이 되어 반려된다.",
      "- expression 이 **비유·관용·환유** 표현인가 — 영영사전 뜻 그대로 읽어도 문장이 그대로 이해되는 투명한 표현(the scope of your imagination, a subjective state of mind 류)은 함축 유형의 전제를 못 채운다. 그런 표적을 고르면 선지가 밑줄 해독이 아니라 글 전체 주제문 나열이 되고, 그 순간 정답과 오답이 같은 명제로 붙어 버린다.",
      "- expression 끝에 문장 종결부호(. ! ?)를 붙이지 않았는가 — 기출은 종결부호를 밑줄 밖에 둔다. 명사구 표적이면 앞 관사(a/an/the)부터 포함했는가.",
      "- expression 이 부정어를 품거나(never·not·no) 바로 앞이 부정 프레임(must not·cannot·never)인가 — 그렇다면 선지를 밑줄 자리에 넣어 읽었을 때 극성이 뒤집힌다. 표적을 부정어 바깥으로 옮기거나, 선지를 그 극성까지 담은 진술로 써라.",
      ...(killer
        ? [
            "- (KILLER) **바로 다음 문장**이 밑줄의 답을 거의 그대로 풀어 주는 자리가 아닌가 — 그런 자리는 밑줄을 옮겨라.",
            "- (KILLER) 예시·실험·수치 세부 문장 속 지엽 표현이 아닌가 — 중심 논지(주제문·결론문)의 압축·비유 표현이어야 한다.",
          ]
        : []),
      `- 선지는 정확히 ${optionCount}개이고 label 이 ${labels.join("")} 순서 그대로인가. 빈 선지 텍스트가 없는가. 두 선지가 사실상 같은 내용이면 반려된다.`,
      lang === "ko"
        ? "- 선지 텍스트는 전부 **한국어 완결 진술문**인가(교사 설정) — 한국어가 아니거나 6자 미만으로 짧으면 반려된다. 영어는 지문 인용만 허용."
        : "- 선지 텍스트는 전부 **영어**인가 — 한글이 한 글자라도 섞이면 반려된다. 각 선지는 3단어 이상의 구·절이어야 한다(한두 단어 라벨 금지).",
      `- answers 는 정확히 ${answerCount}개이고 전부 선지 label 집합 안에 있는가.` +
        (answerCount >= 2
          ? ` 정답 ${answerCount}개는 서로 같은 말의 재탕이 아니라 서로 다른 측면을 짚어야 한다.`
          : ""),
      "- ⭐ **정답 유일성 개별 검산** — 오답 하나하나에 대해 '지문의 이 문장이 이 선지를 거짓으로 만든다'를 문장으로 적어 보라. 지문 어디에서도 거짓이 되지 않고 그저 '정답보다 덜 완전할 뿐'인 선지가 하나라도 있으면 그건 복수정답이다. 그 선지를 지문이 반박하는 명제로 갈아엎어라. 특히 정답과 같은 인과 축(A가 B를 낳는다)을 공유하면서 표현만 바꾼 선지는 반드시 제거하라 — 'varied experience → unexpected solutions' 와 'broad experience → problems solvable' 은 같은 명제다.",
      "- ⭐ **밑줄 자리 대입 검산** — 정답 선지를 밑줄 자리에 그대로 넣어 그 문장을 다시 읽어 보라. (a) 문법이 성립하는가, (b) 극성이 유지되는가, (c) 선지 속 지시 표현(these reactions·this process·그 반응들 류)이 **밑줄 시점까지 이미 나온 것**을 가리키는가. 밑줄보다 뒤에 나오는 문장을 가리키면 학생은 그 선지를 읽을 수 없다 — 다시 써라.",
      "- ⭐ **정답은 밑줄의 뜻이지 글의 요지가 아니다** — 정답이 밑줄 뒤 다른 문장들의 요약이 되어 있지 않은가. 밑줄 문장이 실제로 말하는 바를 그대로 담은 다른 선지가 있으면 채점이 갈린다(그 선지가 진짜 정답이다).",
      "- ⭐ **정답에 축자 직역을 앉히지 마라** — 정답 선지가 밑줄의 표면 어휘를 그대로 쓰면서 physical·literal·actual·물리적·문자 그대로 류로 겉뜻을 지목하면 기계 검사가 자동 반려한다. 축자 직역은 오답 기제 자리다.",
      "- 정답 선지만 유독 길거나, 혼자만 쉼표·'A, not B' 대조 구조를 갖거나, 혼자만 두 술어를 담고 있지 않은가 — 내용을 읽지 않고도 종합 선지로 지목된다. 길이·구조를 오답과 맞춰라.",
      "- 오답 기제를 선지 번호에 고정 대응시키지 않았는가(표면직역을 늘 첫 번째 선지에 두는 배열 금지). 정답 라벨도 특정 번호에 몰아 두지 말고 이 문항의 내용에 맞춰 다른 자리에 두어라.",
      `- wrong 은 정답을 제외한 ${wrongCount}개 전부에 하나씩 있는가 — 개수가 어긋나거나 정답 라벨이 wrong 에 끼면 반려된다.`,
      ...(killer
        ? [
            "- (KILLER) 오답 선지에 절대표현(always·never·only·completely·entirely·solely·exclusively / 항상·절대·오직·완전히·반드시 류)을 쓰지 않았는가 — 지문이 그 정도를 명시하지 않으면 읽지 않고도 지워지는 미끼로 반려된다.",
          ]
        : []),
      // 26-08-18 O225 해설 다이어트
      "- explanation 을 채웠는가 — 한국어 합쇼체(-습니다), 어느 근거 문장들을 이어 표면 의미에서 함축으로 넘어가는지 2문장. 지문에 없는 내용·확인 안 된 구조 서술을 지어내지 마라. wrong 해설도 합쇼체로, 왜 탈락인지 판정 근거 1문장씩(매력 이유·기제 이름 서술 금지).",
      "- 해설 분량: 정답 1~2문장·오답 딱 1문장, 유혹·심리 서사 금지 — 짧을수록 좋다.",
      "",
      "## 기출 형식 관행 (수능 함축 의미 — 위반하면 실전에서 들킨다)",
      "- 밑줄은 문장 전체가 아니라 **짧은 비유·압축 구 단위**다 — 구 단위 밑줄이 기출 관행이다.",
      "- 정답은 밑줄의 직역이 아니라 지문 근거를 종합한 함축의 재진술이다 — 밑줄의 표면 어휘를 선지에 그대로 재사용하지 마라.",
      lang === "ko"
        ? "- 선지는 밑줄의 뜻을 직접 진술한다 — '이것은 ~을 시사한다' 같은 메타 서술 프레임을 쓰지 마라."
        : "- 선지 표면은 **소문자로 시작하는 구·절이고 마침표가 없다** — 대문자로 시작하는 완결문(Plants use scents to signal stress.)은 이 유형의 기출 표면이 아니다. 밑줄이 명사구면 선지도 명사구(a mental dead end resulting from…), 동사구면 선지도 동사구(state observed external cues without…)로 맞춰 밑줄 자리에 대입되게 하라. 'It refers to ~ / It suggests ~' 같은 메타 문장 프레임도 금지다.",
      "- 모든 선지는 같은 문법 형식·같은 추상도·비슷한 길이(±3단어)로 평행하게 — 정답만 유독 길거나 종합적이면 정답이 형태로 표난다. 주어 축도 통일하라(두 선지만 같은 주어를 공유하면 학생이 후보를 그 둘로 압축한다).",
      "- 오답 해설의 탈락 근거는 그 선지가 **실제로 하는 주장**만 반박한다 — 선지에 없는 '모든·항상·보장한다'를 덧씌워 무너뜨리는 허수아비 논증은 금지다. 그렇게 써야만 탈락하는 선지라면 애초에 그 선지가 복수정답이라는 뜻이다.",
      wrongCount >= 2
        ? "- 오답 기제는 서로 다르게(표면직역·방향반대 반드시 포함) — 같은 기제 2개 금지."
        : "- 오답이 하나뿐이면 표면직역 기제를 쓴다 — 변별력이 가장 높다.",
      "- 해설에서 선지를 평숫자(\"2번\")로 지칭하지 마라 — 선지는 출제 후 재배열된다. 내용 인용이나 원문자만 써라.",
      "- ⭐ 리트머스: 밑줄의 표면 직역과 정답의 함축을 각각 한 문장으로 적어 보라. 두 문장이 사실상 같으면 그 밑줄은 탈락 — 표적을 다시 골라라.",
    ].join("\n");
  },

  parseAndGate(text, ctx): MdLaneParsed {
    try {
      const raw = JSON.parse(text) as {
        expression: string;
        options: Array<{ label: string; text: string }>;
        answers: string[];
        explanation: string;
        wrong: Array<{ label: string; text: string }>;
      };
      // 코어스 ①: 정답 라벨 중복 제거(md 파서의 Set 수집과 동형 — 중복이 있으면
      // 개수 게이트가 "정답 N개" 로 지목한다).
      const answers = [...new Set(raw.answers)];
      const lang = optionLanguageOf(ctx);
      const extraCorrections: string[] = [];

      // 코어스 ④·⑤: 밑줄 꼬리 종결부호 제거 → 명사구 관사 복원(둘 다 지문에
      // 축자로 살아 있을 때만 발동한다. 스냅 전에 돌려 스냅이 최종 확정한다).
      let expression =
        typeof raw.expression === "string" ? raw.expression.trim() : "";
      if (expression) {
        const tail = coerceTargetTailPunct(expression, ctx.passage);
        if (tail.correction) {
          expression = tail.expr;
          extraCorrections.push(tail.correction);
        }
        const art = coerceLeadingArticle(expression, ctx.passage);
        if (art.correction) {
          expression = art.expr;
          extraCorrections.push(art.correction);
        }
      }

      // 코어스 ⑥: 영어 선지를 기출 표면(소문자 구·절, 마침표 없음)으로 내린다.
      const options = raw.options.map((o) => {
        const text = typeof o.text === "string" ? o.text.trim() : o.text;
        if (lang !== "en" || typeof text !== "string") return { label: o.label, text };
        const coerced = coerceEnglishOptionText(text, ctx.passage);
        if (coerced !== text) {
          extraCorrections.push(
            `${o.label} 선지를 기출 표면(소문자 구·마침표 없음)으로 보정: '${ELLIPSIS(text)}' → '${ELLIPSIS(coerced)}'`,
          );
        }
        return { label: o.label, text: coerced };
      });

      let q: MdImpliedQuestion = {
        kind: "implied",
        expression,
        options,
        answers,
        answer: answers[0] ?? "",
        explanation:
          typeof raw.explanation === "string" ? raw.explanation.trim() : "",
        // 코어스 ②: 오답 해설 라벨 오름차순 정렬(표시 결정론 — 어법·빈칸·제목 동일).
        wrong: [...raw.wrong]
          .map((w) => ({
            label: w.label,
            text: typeof w.text === "string" ? w.text.trim() : w.text,
          }))
          .sort((a, b) => a.label.localeCompare(b.label)),
      };
      // 코어스 ③: 밑줄 표현 지문 축자 스냅(레인 스냅 재사용 — 대소문자·구두점·
      // 구간 드리프트 흡수, 유일 위치일 때만 교정).
      const snapped = autoSnapImpliedTarget(q, ctx.passage);
      q = snapped.question;
      return {
        question: q,
        gateIssues: [
          ...gateMdImplied(q, ctx.passage, {
            optionCount: optionCountOf(ctx),
            answerCount: answerCountOf(ctx),
            optionLanguage: lang,
            difficulty: ctx.difficulty,
          }),
          ...literalAnswerIssues(q, lang),
          ...teacherPointIssues(q, ctx),
        ],
        corrections: [...extraCorrections, ...snapped.corrections],
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
    { path: "expression", prefix: "밑줄: ", suffix: "\n" },
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
        : IMPLIED_MD_DIRECTION;
    // 학생 표면은 밑줄이 표시된 지문이다 — 후처리 passageWithUnderline 의
    // `__표현__` 관례로 평가 전용 렌더를 한다(레인 스냅과 같은 탐색기 재사용).
    const expr =
      typeof aiQuestion.underlinedExpression === "string"
        ? aiQuestion.underlinedExpression
        : "";
    const hit = expr ? locateImpliedTarget(passage, expr) : null;
    const surface = hit
      ? `${passage.slice(0, hit.index)}__${passage.slice(hit.index, hit.index + hit.length)}__${passage.slice(hit.index + hit.length)}`
      : passage;
    const options = Array.isArray(aiQuestion.options)
      ? (aiQuestion.options as Array<Record<string, unknown>>)
          .map(
            (o, i) =>
              `${IMPLIED_MD_CIRCLED[i] ?? String(o.label ?? "")} ${String(o.text ?? "")}`,
          )
          .join("\n")
      : "";
    return `${direction}\n\n${surface}\n\n${options}`;
  },
};
