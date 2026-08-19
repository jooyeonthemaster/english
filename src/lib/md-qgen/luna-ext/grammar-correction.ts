// ============================================================================
// 문법 오류 수정(GRAMMAR_CORRECTION) luna 레인 확장 — 전 유형 이식 캠페인(26-08-14).
// 계약: ../luna-ext-types.ts · 스펙 정본:
// experiments/question-quality-20260715/luna-migration-20260814/SPEC.md
// 견본: ./title.ts (선택형) — 이 파일은 **치환·재구성 계열(서술형)** 의 이식이다.
//
// 이 유형의 최강 방어선은 재구성 불변식 하나다:
//   markedPassage 의 각 마커 안 텍스트에서 틀린 표현(errorPart)을 올바른 표현
//   (correctedPart)으로 되돌려 마커 자리에 되꽂으면 원 지문과 축자 일치한다.
// json_schema 는 파서 산출물(MdGrammarCorrectionQuestion)과 동형으로 설계해
// 레인의 스냅(autoSnapCorrectionSegments)·게이트(gateMdGrammarCorrection)·
// 어댑터(adaptMdGrammarCorrectionToAiQuestion)를 무수정 재사용한다.
//
// 어법(GRAMMAR_ERROR)과 달리 이 유형은 서술형이라 선지·정답 라벨·오답 해설이
// 없고, **모든 밑줄이 오류**다(후처리가 전 구간 isError=true 를 요구). 동적
// 노브는 grammarCorrectionErrorCount(1~5) 하나 — 마커 수·fixes 배열 길이·라벨
// enum 을 ctx 에서 계산한다.
// ============================================================================

import type { MdLaneContext, MdLaneParsed } from "../lane-types";
import type { LunaLaneExt, LunaJsonSchemaSpec } from "../luna-ext-types";
import type { LunaBridgeFieldSpec } from "../luna-stream-bridge";
import { normalizeWs } from "../parser";
import {
  GRAMMAR_CORRECTION_MD_ERROR_COUNT_MIN,
  GRAMMAR_CORRECTION_MD_LABELS,
  clampGrammarCorrectionMdErrorCount,
} from "../prompts-grammar-correction";
import {
  INLINE_CORRECTION_MARK_RE,
  collectCorrectionMarks,
  deriveCorrectionSourceText,
  type MdGrammarCorrectionQuestion,
} from "../parser-grammar-correction";
import { autoSnapCorrectionSegments } from "../snap-grammar-correction";
import { gateMdGrammarCorrection } from "../gate-grammar-correction";
import { grammarCorrectionMdDirection } from "../adapter-grammar-correction";

interface CorrectionResolved {
  grammarCorrectionErrorCount?: number;
}

function errorCountOf(ctx: MdLaneContext): number {
  return clampGrammarCorrectionMdErrorCount(
    (ctx.resolved as CorrectionResolved).grammarCorrectionErrorCount ??
      GRAMMAR_CORRECTION_MD_ERROR_COUNT_MIN,
  );
}

/** 라벨 축 — 파서 correctionMarkLabel·후처리 grammarCorrectionLabel 과 동일 "(A)" 대문자. */
function parenLabelsOf(errorCount: number): string[] {
  return GRAMMAR_CORRECTION_MD_LABELS.slice(0, errorCount).map((l) => `(${l})`);
}

/** 고침 항목 라벨을 저장 축 "(A)" 로 정규화한다("A"·"[a]"·"a:" 드리프트 흡수). */
const LABEL_LETTERS = "ABCDEFGHIJ";
function normalizeFixLabel(raw: unknown): string {
  const key = String(raw ?? "")
    .trim()
    .replace(/[()[\].:]/g, "")
    .toUpperCase();
  return key.length === 1 && LABEL_LETTERS.includes(key) ? `(${key})` : "";
}

interface RawFix {
  label: string;
  errorPart: string;
  correctedPart: string;
  acceptedAnswers: string[];
}

/**
 * 결정형 코어스 — 마커 라벨 등장순 재번호(SPEC §1-8 "고쳐서 살린다").
 * 마커가 지문 등장 순서대로 (A)(B)… 가 아니면(luna 기지 결함 계통: 라벨
 * 비등장순) 등장 i번째 마커를 LETTERS[i] 로 다시 붙이고 fixes 라벨을 동기
 * 치환한다. 위치 기반 재조립이라 (A)↔(B) 맞교환에서도 자기충돌이 없다.
 * 라벨이 중복이면 사상이 유일하지 않으므로 손대지 않는다 — 게이트가 지목한다.
 */
function renumberMarkersByAppearance(
  markedPassage: string,
  fixes: RawFix[],
): { markedPassage: string; fixes: RawFix[]; corrections: string[] } {
  const marks = [...markedPassage.matchAll(INLINE_CORRECTION_MARK_RE)];
  if (marks.length === 0 || marks.length > LABEL_LETTERS.length) {
    return { markedPassage, fixes, corrections: [] };
  }
  const oldLabels = marks.map((m) => `(${m[1].trim().toUpperCase()})`);
  if (new Set(oldLabels).size !== oldLabels.length) {
    return { markedPassage, fixes, corrections: [] };
  }
  const newLabels = oldLabels.map((_, i) => `(${LABEL_LETTERS[i]})`);
  if (oldLabels.every((l, i) => l === newLabels[i])) {
    return { markedPassage, fixes, corrections: [] };
  }
  let out = "";
  let cursor = 0;
  marks.forEach((m, i) => {
    out += markedPassage.slice(cursor, m.index) + `[[${LABEL_LETTERS[i]}:${m[2]}]]`;
    cursor = (m.index ?? 0) + m[0].length;
  });
  out += markedPassage.slice(cursor);
  const relabel = new Map(oldLabels.map((l, i) => [l, newLabels[i]]));
  return {
    markedPassage: out,
    fixes: fixes.map((f) => ({ ...f, label: relabel.get(f.label) ?? f.label })),
    corrections: [
      `밑줄 라벨 등장순 재번호: ${oldLabels.join("")} → ${newLabels.join("")}`,
    ],
  };
}

/**
 * 교사 지정 준수 게이트 — lane-grammar-correction.ts teacherPointIssues 의 판정
 * 등가 복제(그 함수가 레인 파일 private 이고 공유 파일은 수정 금지라 옮겨 적는다).
 * 대조는 정본과 동일: normalizeWs+소문자 정규화 후 양방향 단순 포함, 표면은
 * 복원본(sourceText)과 변형본(displayedText) 둘 다 인정.
 */
function teacherPointIssues(
  q: MdGrammarCorrectionQuestion,
  ctx: MdLaneContext,
): string[] {
  if (ctx.teacherPoints.length === 0) return [];
  const surfaces = q.segments
    .flatMap((segment) => [
      deriveCorrectionSourceText(segment) ?? "",
      segment.displayedText,
    ])
    .map((text) => normalizeWs(text).toLowerCase())
    .filter((text) => text.length > 0);
  if (surfaces.length === 0) return [];
  const issues: string[] = [];
  for (const point of ctx.teacherPoints) {
    const needle = normalizeWs(point.text).toLowerCase();
    if (!needle) continue;
    const hit = surfaces.some(
      (surface) => surface.includes(needle) || needle.includes(surface),
    );
    if (!hit) {
      issues.push(`교사 지정 표현이 밑줄 구간에 없음: '${point.text.slice(0, 60)}'`);
    }
  }
  return issues;
}

export const GRAMMAR_CORRECTION_LUNA_EXT: LunaLaneExt = {
  subType: "GRAMMAR_CORRECTION",
  // O223 A축(26-08-18): 지문 전문(markedPassage)을 재출력하는 유형 — 14k 는 긴
  // 지문에서 사고 잠식 절단(finish=length) 위험. 조건영작 20k 전례.
  maxTokens: 20_000,

  buildJsonSchema(ctx): LunaJsonSchemaSpec {
    const errorCount = errorCountOf(ctx);
    const labels = parenLabelsOf(errorCount);
    const letters = GRAMMAR_CORRECTION_MD_LABELS.slice(0, errorCount);
    const markerRun = letters.map((l) => `[[${l}:구간]]`).join(" ");
    // 필드 순서 = 스트리밍 도착 순서 — md 표면(밑줄지문 → 고침 → 해설)과 동형.
    return {
      name: "grammar_correction_item",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["markedPassage", "fixes", "explanation"],
        properties: {
          markedPassage: {
            type: "string",
            description: `지문 전체를 한 글자도 바꾸지 말고 그대로 옮기되, 밑줄 ${errorCount}곳만 ${markerRun} 인라인 마커로 감싼 것. 마커 안에는 원문의 그 문장(또는 절)을 통째로 넣되, 각 마커마다 그 안의 표현 딱 한 곳씩만 어법상 틀린 형태로 바꿔 적는다. 바꾼 그 ${errorCount}곳을 뺀 나머지 텍스트는 마커 안팎 모두 원문과 완전히 동일해야 하고, 라벨은 지문 등장 순서대로 A→${letters[letters.length - 1]} 다.`,
          },
          fixes: {
            type: "array",
            minItems: errorCount,
            maxItems: errorCount,
            description: `밑줄 하나당 고침 항목 하나 — 정확히 ${errorCount}개, 라벨은 마커와 동일.`,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["label", "errorPart", "correctedPart", "acceptedAnswers"],
              properties: {
                label: { type: "string", enum: labels },
                errorPart: {
                  type: "string",
                  description:
                    "마커 안에 실제로 적은 틀린 표현 — 마커 안 텍스트에 그대로(축자) 정확히 1회 등장하는 판단 최소 단위(보통 1~3단어)",
                },
                correctedPart: {
                  type: "string",
                  description:
                    "원문에 있던 올바른 표현(= 학생이 써야 하는 답) — 틀린 표현을 이것으로 되돌리면 원문이 복원된다",
                },
                acceptedAnswers: {
                  type: "array",
                  items: { type: "string" },
                  description:
                    "올바른 표현과 문법·의미가 완전히 동등해 학생이 그렇게 써도 정답인 다른 교정형(예: in which / where). 확신 없는 변형은 넣지 마라. 동등한 답이 올바른 표현 하나뿐이면 빈 배열.",
                },
              },
            },
          },
          explanation: {
            type: "string",
            // 26-08-18 O225 해설 다이어트
            description:
              errorCount === 1
                ? "해설(한국어, 합쇼체) — 1~2문장, 표시된 형태가 어떤 규칙을 왜 어기는지와 고친 형태만(판정 근거). 학생 심리·출제 의도 서사 금지"
                : `해설(한국어, 합쇼체) — 밑줄 ${errorCount}곳을 (A)부터 순서대로 각 1~2문장씩, 표시된 형태가 어떤 규칙을 왜 어기는지와 고친 형태만(판정 근거). 학생 심리·출제 의도 서사 금지`,
          },
        },
      },
    };
  },

  buildSelfcheck(ctx): string {
    const errorCount = errorCountOf(ctx);
    const labels = parenLabelsOf(errorCount);
    const teacherBlock =
      ctx.teacherPoints.length > 0
        ? [
            "",
            "## 교사 지정 표현 검산 (필수)",
            "- 교사가 지정한 표현 하나하나가 밑줄 구간(마커 안) 어딘가에 축자로 들어 있어야 한다 — 하나라도 밑줄 밖에 남으면 반려된다.",
          ]
        : [];
    return [
      // 26-08-18 O223 사다리 수술(어법 실측 이식)
      "## 규칙 충돌 시 우선순위 (필수 — 지시가 서로 부딪히면 이 사다리를 따르라)",
      "- 확정성(고쳐 쓸 답 유일·시비 없는 변형·재구성 축자 일치)은 **제약**이다: 정답 시비 검산에 걸리는 자리는 어떤 경우에도 쓰지 마라. 기출 형식(문장·절 단위의 넓은 밑줄·등장순 라벨·고침 최소 단위)도 양보 불가다.",
      "- 그 제약 안에서는 **요청된 난이도에 맞는 표적 문장·변형**이 목표다. '시비가 없다'는 이유로 요청 난이도보다 얕고 안전한 표적(구조 하중 없는 짧은 국소 변형)으로 후퇴하는 것은 실패다 — 확정적이면서 난이도에 맞는 표적은 거의 모든 지문에 있다.",
      `- 전부를 동시에 만족할 수 없으면 **포인트 다양성부터 양보하라**(같은 포인트 2회까지 허용된다). 그래도 막히면 **표적 문장을 지문의 다른 문장으로 교체하라** — 판정 확정성과 재구성 축자 일치는 절대 양보 불가.`,
      "",
      "## 재구성 축자 일치 자가 검산 (필수 — 출력 직전 실제로 재구성해 원문과 대조하라)",
      "- markedPassage 의 각 마커 안 텍스트에서 errorPart 를 correctedPart 로 되돌린 결과를 마커 자리에 되꽂아 이어 붙이면 소스 지문과 한 글자도 다르지 않아야 한다(공백·따옴표·구두점 포함). 다르면 자동 반려된다.",
      "- 마커 밖의 모든 텍스트는 원문과 완전히 동일해야 한다 — 문장 추가·삭제·재배열·구두점 변경·철자 교정 전부 반려된다.",
      "- 한 마커 안에서 바꾼 곳은 **딱 한 곳**이다 — 두 곳 이상을 바꾸면 복원이 어긋나 반려된다.",
      "- correctedPart 는 원문에 실제로 있던 바로 그 표현이다 — 원문에도 없고 errorPart 도 아닌 제3의 표현을 답으로 만들면 반려된다.",
      "",
      "## 마커·라벨 검산 (필수)",
      `- 마커는 정확히 ${errorCount}개, [[A:구간]] 형식(대문자 라벨·반각 콜론)이며 라벨은 지문 등장 순서대로 ${labels.join("")} 다.`,
      `- fixes 는 마커와 같은 라벨로 정확히 ${errorCount}개다 — 마커에 없는 라벨(유령)·같은 라벨 두 번(중복)은 반려된다.`,
      errorCount >= 2
        ? `- 밑줄 ${errorCount}곳은 서로 다른 문장에 흩고, 출제 포인트도 서로 다르게 하며, 난이도를 고르게 맞춰라.`
        : "",
      "",
      "## 밑줄 구간 검산 (필수 — 기출 형식: 넓은 밑줄)",
      "- 밑줄(마커 안)은 오류 토큰이 아니라 **문장 또는 절 전체**다. 틀린 표현만 밑줄 치면(되돌린 밑줄 = correctedPart) 답을 알려 준 것이라 반려된다.",
      "- 밑줄 단어 수는 최소 5단어 이상이면서 '틀린 표현 단어 수 + 3' 이상, 최대 60단어(두 문장 이상 묶음 금지)다.",
      "- errorPart 는 마커 안에 적은 형태 그대로(축자) **정확히 1회**만 등장해야 한다 — 표기가 다르면 0회로, 같은 단어가 구간에 두 번 있으면 자리 비유일로 반려된다. 세어 보라.",
      "- errorPart 와 correctedPart 는 판단이 걸린 최소 단위(보통 1~3단어)로 적고, 둘이 같으면 반려된다.",
      "",
      "## 정답 시비 검산 (필수 — 하나라도 걸리면 자동 반려된다)",
      "- 규칙동사 현재↔과거 단독 교체(realizes↔realized, does↔did 류) 금지 — 시간부사가 없으면 둘 다 성립한다.",
      "- 수량 의미토글(few↔a few, little↔a little, less↔fewer, amount↔number, some↔any) 금지 — 둘 다 문법적이고 의미만 다르다.",
      "- 능동·수동 부정사 선호(to gain↔to be gained)와 지각·사역동사 보어(원형/-ing/to부정사)가 둘 이상 성립하는 자리 금지.",
      "- 틀린 형태로 심은 후보 표현이 지문 본문의 다른 자리에 기등장해 학생의 다른 답이 성립하면 정답 시비가 된다 — 다른 표적으로 교체하라.",
      "- 각 자리에서 '학생이 쓸 수 있는 다른 정답이 있는가'를 스스로 반박해 보라 — 하나라도 떠오르면 그 자리는 버리고 재설계하라.",
      ctx.rawDifficulty === "KILLER"
        ? "- KILLER 다 — 밑줄은 구조 하중(관계절·삽입구·병렬·수량 주어구·도치·가목적어) 있는 12단어 이상 문장으로 잡아라. 구조 하중 없는 짧은 국소 변형은 얇은 표적으로 반려된다."
        : "",
      "",
      "## 허용답 검산 (필수)",
      "- acceptedAnswers 에 **errorPart 를 절대 넣지 마라** — 오답이 정답 처리된다. 확신 있는 동등 교정형만 넣고, 동등한 답이 correctedPart 하나뿐이면 빈 배열로 둬라.",
      "",
      "## 해설 검산 (필수)",
      "- 해설은 비우면 반려된다. 한국어 합쇼체(-습니다)로 통일하고, (A)부터 순서대로 그 자리가 요구하는 구조와 왜 표시된 형태가 비문인지 쓴다.",
      // 26-08-18 O225 해설 다이어트
      "- 해설 분량: 밑줄당 1~2문장(어떤 규칙을 왜 어기는지·고친 형태만) — 이 유형은 오답 해설이 없다. \"학생이 ~로 잘못 고치고 싶어진다\"·\"~와 헷갈리기 쉽다\" 같은 유혹·심리 서사는 쓰지 마라 — 짧을수록 좋다.",
      "- 구조 서술(진짜 주어의 핵·선행사 위치·수식 관계)은 실제 지문을 다시 읽고 **사실만** 써라 — '멀리 있는 선행사' 같은 상투 문구를 위치 확인 없이 복사하면 반려된다.",
      ...teacherBlock,
    ]
      .filter(Boolean)
      .join("\n");
  },

  parseAndGate(text, ctx): MdLaneParsed {
    try {
      const raw = JSON.parse(text) as {
        markedPassage?: unknown;
        fixes?: Array<{
          label?: unknown;
          errorPart?: unknown;
          correctedPart?: unknown;
          acceptedAnswers?: unknown;
        }>;
        explanation?: unknown;
      };
      let markedPassage = String(raw.markedPassage ?? "").trim();
      let fixes: RawFix[] = (Array.isArray(raw.fixes) ? raw.fixes : []).map((f) => ({
        label: normalizeFixLabel(f?.label),
        errorPart: String(f?.errorPart ?? "").trim(),
        correctedPart: String(f?.correctedPart ?? "").trim(),
        acceptedAnswers: Array.isArray(f?.acceptedAnswers)
          ? (f.acceptedAnswers as unknown[]).map((a) => String(a ?? "").trim())
          : [],
      }));

      // 코어스 1 — 마커 라벨 등장순 재번호(0원 결정형).
      const rn = renumberMarkersByAppearance(markedPassage, fixes);
      markedPassage = rn.markedPassage;
      fixes = rn.fixes;

      // 파서 규약 답습: 세그먼트의 진실원은 **마커**다 — 고침 항목이 없어도 자리를
      // 남겨 게이트가 "(B) 고침 줄 없음" 을 지목하게 한다(유령·중복 라벨은 fixLabels
      // 로 그대로 실어 게이트 #3 이 진단한다).
      const fixByLabel = new Map<string, RawFix>();
      const fixLabels: string[] = [];
      for (const f of fixes) {
        if (!f.label) continue;
        fixLabels.push(f.label);
        if (!fixByLabel.has(f.label)) fixByLabel.set(f.label, f);
      }
      const segments = collectCorrectionMarks(markedPassage).map((m) => {
        const pair = fixByLabel.get(m.label);
        return {
          label: m.label,
          displayedText: m.shown,
          errorPart: pair?.errorPart ?? "",
          correctedPart: pair?.correctedPart ?? "",
          acceptedAnswers: pair ? [...pair.acceptedAnswers] : [],
        };
      });

      let q: MdGrammarCorrectionQuestion = {
        kind: "grammarCorrection",
        markedPassage,
        segments,
        fixLabels,
        explanation: String(raw.explanation ?? "").trim(),
      };
      // 코어스 2 — 레인 스냅 재사용(꼬리 구두점·화살표 방향·대소문자·허용답 정규화).
      const snapped = autoSnapCorrectionSegments(q);
      q = snapped.question;
      return {
        question: q,
        gateIssues: [
          ...gateMdGrammarCorrection(q, ctx.passage, {
            errorCount: errorCountOf(ctx),
            requestedDifficulty: ctx.rawDifficulty,
          }),
          ...teacherPointIssues(q, ctx),
        ],
        corrections: [...rn.corrections, ...snapped.corrections],
      };
    } catch (e) {
      return {
        question: null,
        gateIssues: [`luna JSON 파싱 실패: ${e instanceof Error ? e.message : String(e)}`],
        corrections: [],
      };
    }
  },

  // md 표면 동형 순서: 밑줄지문 → 고침(라벨: 틀린 표현 → 올바른 표현) → 해설.
  // acceptedAnswers 는 채점 메타 배열이라 침묵시킨다(SPEC §2 bridgeSpecs).
  bridgeSpecs: [
    { path: "markedPassage", prefix: "밑줄지문:\n", suffix: "\n" },
    { path: "fixes[].label", prefix: "\n고침" },
    { path: "fixes[].errorPart", prefix: ": " },
    { path: "fixes[].correctedPart", prefix: " → " },
    { path: "explanation", prefix: "\n해설: ", suffix: "\n" },
  ] satisfies LunaBridgeFieldSpec[],

  renderEvalSurface(aiQuestion, passage): string {
    // 어댑터 산출(aiQuestion)로부터 학생 시험 표면을 렌더한다 — 후처리
    // processGrammarCorrection 의 passageWithUnderline 규칙 등가: 원 지문의 각
    // sourceText 자리를 밑줄 표기(__(A) 변형본__)로 치환한다(학생은 변형본을 본다).
    const segments = Array.isArray(aiQuestion.underlinedSegments)
      ? (aiQuestion.underlinedSegments as Array<Record<string, unknown>>)
      : [];
    const labels = segments.map((s) => String(s.label ?? ""));
    const direction =
      typeof aiQuestion.direction === "string" && aiQuestion.direction.trim()
        ? aiQuestion.direction
        : grammarCorrectionMdDirection(labels);
    let body = "";
    let cursor = 0;
    for (const seg of segments) {
      const sourceText = String(seg.sourceText ?? "");
      const displayedText = String(seg.displayedText ?? sourceText);
      const label = String(seg.label ?? "");
      const at = sourceText ? passage.indexOf(sourceText, cursor) : -1;
      if (at < 0) continue; // 위치 확정 실패 — 원문 그대로 두고 넘어간다(평가 전용).
      body += passage.slice(cursor, at) + `__${label} ${displayedText}__`;
      cursor = at + sourceText.length;
    }
    body += passage.slice(cursor);
    const answerLines = labels.map((l) => `${l}: ____________________`).join("\n");
    return `${direction}\n\n${body}\n\n[답안]\n${answerLines}`;
  },
};
