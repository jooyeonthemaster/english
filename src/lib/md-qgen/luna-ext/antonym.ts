// ============================================================================
// ANTONYM(반의어) luna 레인 확장 — 견본: ./title.ts (본체 작성).
// 계약: ../luna-ext-types.ts · 스펙 정본:
// experiments/question-quality-20260715/luna-migration-20260814/SPEC.md
//
// vocabRecon 패밀리(치환·네모 계열): 지문을 **변형하지 않고** 표적 단어에 마커만
// 감는 유형이다. 핵심 불변식 두 개 —
//   ① 축자 seam: 마커를 걷어낸 markedPassage 가 원문과 재구성 축자 일치
//      (reconstructionEq, 말미 종결부호만 관용)
//   ② 밑줄 자리 유일 확정: 표적 단어가 지문에 단어 경계 기준 정확히 1회
// 검산 블록은 gateMdAntonym(parser-antonym.ts)의 반려 조건 전부의 전사 +
// prompts-antonym.ts 의 기출 형식 관행 + 우선순위 사다리로 구성한다.
//
// 형식 노브: antonymPairCount(5~10) 하나 — 동적 스키마가 ctx 에서 계산한다.
// 파싱 산출물은 MdAntonymQuestion 동형으로 만들어 레인의 스냅(autoSnapAntonymPairs)·
// 게이트(gateMdAntonym)·어댑터(adaptMdAntonymToAiQuestion, 레인 adapt 경유)를
// 전부 재사용한다.
// ============================================================================

import type { MdLaneContext, MdLaneParsed } from "../lane-types";
import type { LunaLaneExt, LunaJsonSchemaSpec } from "../luna-ext-types";
import type { LunaBridgeFieldSpec } from "../luna-stream-bridge";
import { normalizeWs, wordBoundaryRegex } from "../parser";
import {
  autoSnapAntonymPairs,
  collectAntonymMarks,
  gateMdAntonym,
  type MdAntonymQuestion,
} from "../parser-antonym";
import {
  clampAntonymMdPairCount,
  ANTONYM_MD_LABELS,
  ANTONYM_MD_PAIR_COUNT_MIN,
} from "../prompts-antonym";
import { ANTONYM_MD_DIRECTION } from "../adapter-antonym";

const CIRCLED = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩"] as const;

function pairCountOf(ctx: MdLaneContext): number {
  return clampAntonymMdPairCount(
    (ctx.resolved as { antonymPairCount?: number }).antonymPairCount ??
      ANTONYM_MD_PAIR_COUNT_MIN,
  );
}

function labelsOf(ctx: MdLaneContext): string[] {
  return ANTONYM_MD_LABELS.slice(0, pairCountOf(ctx)).map((l) => `(${l})`);
}

/**
 * 교사 지정 준수 게이트 — lane-antonym.ts teacherPointIssues 의 동형 재현.
 * (lane 의 함수는 비공개라 import 불가·공유 파일 수정 금지 → 여기 복제한다.)
 * luna 경로가 gemini 경로보다 관대해지지 않도록 이슈 집합까지 동형을 유지한다.
 */
function teacherPointIssues(q: MdAntonymQuestion, ctx: MdLaneContext): string[] {
  if (ctx.teacherPoints.length === 0) return [];
  const issues: string[] = [];
  for (const p of ctx.teacherPoints) {
    const pt = normalizeWs(p.text);
    if (!pt) continue;
    const hit = q.pairs.some((pair) => {
      const w = normalizeWs(pair.word);
      return w.length > 0 && (w.includes(pt) || pt.includes(w));
    });
    if (!hit) issues.push(`교사 지정 표현이 밑줄에 없음: '${p.text.slice(0, 60)}'`);
  }
  return issues;
}

/**
 * 결정형 코어스 ①: 라벨 등장순 재번호 — luna-lane.ts renumberGrammarByAppearance
 * 의 반의어판(어법과 동일 사상·동일 2단계 임시 토큰 기법). markedPassage 의 마커
 * 등장 순서대로 (A)→ 재번호하고 pairs/answer/wrong 라벨을 동기 치환한다.
 * 라벨 중복 등 유일 확정 불가면 손대지 않고 게이트 반려로 보낸다.
 */
function renumberAntonymByAppearance(q: MdAntonymQuestion): {
  question: MdAntonymQuestion;
  renumbered: boolean;
} {
  if (!q.markedPassage) return { question: q, renumbered: false };
  const marks = collectAntonymMarks(q.markedPassage);
  if (marks.length === 0 || marks.length > ANTONYM_MD_LABELS.length) {
    return { question: q, renumbered: false };
  }
  const seen = new Set(marks.map((m) => m.label));
  if (seen.size !== marks.length) return { question: q, renumbered: false };
  if (marks.every((m, i) => m.label === `(${ANTONYM_MD_LABELS[i]})`)) {
    return { question: q, renumbered: false };
  }
  const relabel = new Map<string, string>();
  marks.forEach((m, i) => relabel.set(m.label, `(${ANTONYM_MD_LABELS[i]})`));
  // 마커 치환은 임시 토큰 경유 2단계 — (A)↔(B) 맞교환에서의 자기충돌 방지.
  let mp = q.markedPassage;
  for (const oldLabel of relabel.keys()) {
    const letter = oldLabel.replace(/[()]/g, "");
    mp = mp.replace(new RegExp(`\\[\\[${letter}:`, "g"), `[[TMP_${letter}:`);
  }
  for (const [oldLabel, newLabel] of relabel) {
    mp = mp.replace(
      new RegExp(`\\[\\[TMP_${oldLabel.replace(/[()]/g, "")}:`, "g"),
      `[[${newLabel.replace(/[()]/g, "")}:`,
    );
  }
  const mapLabel = (l: string) => relabel.get(l) ?? l;
  return {
    question: {
      ...q,
      markedPassage: mp,
      pairs: q.pairs.map((p) => ({ ...p, label: mapLabel(p.label) })),
      answer: mapLabel(q.answer),
      wrong: q.wrong.map((w) => ({ ...w, label: mapLabel(w.label) })),
    },
    renumbered: true,
  };
}

/**
 * 평가 표면용 밑줄 — 후처리(processAntonym → findWordInPassage)와 같은 규칙으로
 * surroundingText 창 우선·단어 경계 일치를 `__(A) word__` 처리. 평가 전용이라
 * 실패한 표적은 밑줄 없이 남는다(픽스처 검증이 잡는다).
 */
function underlineMarkedWords(
  passage: string,
  markedWords: Array<Record<string, unknown>>,
): string {
  const reps: Array<{ at: number; len: number; text: string }> = [];
  for (const mw of markedWords) {
    const word = typeof mw.word === "string" ? mw.word.trim() : "";
    const label = typeof mw.label === "string" ? mw.label : "";
    if (!word) continue;
    const surrounding =
      typeof mw.surroundingText === "string" ? mw.surroundingText : "";
    let at = -1;
    let len = word.length;
    const ctxIdx = surrounding ? passage.indexOf(surrounding) : -1;
    if (ctxIdx >= 0) {
      const m = wordBoundaryRegex(word).exec(
        passage.slice(ctxIdx, ctxIdx + surrounding.length),
      );
      if (m) {
        at = ctxIdx + m.index;
        len = m[0].length;
      }
    }
    if (at < 0) {
      const m = wordBoundaryRegex(word).exec(passage);
      if (m) {
        at = m.index;
        len = m[0].length;
      }
    }
    if (at >= 0) {
      reps.push({ at, len, text: `__${label} ${passage.slice(at, at + len)}__` });
    }
  }
  reps.sort((a, b) => b.at - a.at);
  let out = passage;
  for (const r of reps) out = out.slice(0, r.at) + r.text + out.slice(r.at + r.len);
  return out;
}

export const ANTONYM_LUNA_EXT: LunaLaneExt = {
  subType: "ANTONYM",
  // O223 A축(26-08-18): 지문 전문(markedPassage)을 재출력하는 유형 — 14k 는 긴
  // 지문에서 사고 잠식 절단(finish=length) 위험. 조건영작 20k 전례.
  maxTokens: 20_000,

  buildJsonSchema(ctx): LunaJsonSchemaSpec {
    const labels = labelsOf(ctx);
    const pairCount = labels.length;
    const lastLetter = ANTONYM_MD_LABELS[pairCount - 1];
    return {
      name: "antonym_item",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        required: [
          "markedPassage",
          "pairs",
          "answer",
          "correctAntonym",
          "explanation",
          "wrong",
        ],
        properties: {
          markedPassage: {
            type: "string",
            description: `지문 전체를 원문 그대로 복사하되, 표적 단어 ${pairCount}곳만 [[A:단어]] ~ [[${lastLetter}:단어]] 인라인 마커로 감싼 것. 마커 안 단어는 원문 축자 그대로(굴절형·대소문자 포함, 변형 절대 금지)이고, 마커 밖의 모든 텍스트도 원문과 한 글자도 달라선 안 된다(공백·따옴표·구두점 포함). 마커는 지문 등장 순서대로 A→${lastLetter}.`,
          },
          pairs: {
            type: "array",
            minItems: pairCount,
            maxItems: pairCount,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["label", "word", "antonym"],
              properties: {
                label: { type: "string", enum: labels },
                word: {
                  type: "string",
                  description:
                    "표적 단어 — 밑줄지문의 같은 라벨 마커 안 표현과 완전히 동일한 원문 축자",
                },
                antonym: {
                  type: "string",
                  description:
                    "선지에 표시할 짝 단어 — 한 단어(하이픈 결합 한 덩어리 허용). 구·절·괄호 뜻풀이 금지",
                },
              },
            },
          },
          answer: {
            type: "string",
            enum: labels,
            description: "반의 관계가 성립하지 않는 쌍의 라벨 하나 — 정답의 유일 진실원",
          },
          correctAntonym: {
            type: "string",
            description:
              "정답 자리 단어의, 이 지문 문맥에서의 실제 반의어 한 단어(정답 쌍의 짝 단어와 달라야 한다)",
          },
          explanation: {
            type: "string",
            // 26-08-18 O225 해설 다이어트
            description:
              "해설 1~2문장(한국어, 합쇼체) — 그 단어가 이 지문에서 갖는 의미축과 짝 단어가 왜 그 축의 반대가 아닌지만(판정 근거). 학생 심리·출제 의도 서사 금지",
          },
          wrong: {
            type: "array",
            minItems: pairCount - 1,
            maxItems: pairCount - 1,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["label", "text"],
              properties: {
                label: { type: "string", enum: labels },
                text: {
                  type: "string",
                  description:
                    "이 쌍이 이 지문 문맥에서 왜 정확한 반의 관계인지 1문장(한국어, 합쇼체) — 정답 라벨은 제외",
                },
              },
            },
          },
        },
      },
    };
  },

  buildSelfcheck(ctx): string {
    const pairCount = pairCountOf(ctx);
    const lastLetter = ANTONYM_MD_LABELS[pairCount - 1];
    const labelRun = labelsOf(ctx).join("");
    return [
      // 26-08-18 O223 사다리 수술(어법 실측 이식)
      "## 규칙 충돌 시 우선순위 (필수 — 지시가 서로 부딪히면 이 사다리를 따르라)",
      "- 판정 확정성(정답 쌍은 정확히 1개·미끼 전원 시비 없는 정확한 반의 쌍·밑줄 자리 유일 확정)은 **제약**이다: 아래 검산·금지 쌍에 걸리는 표적·짝은 어떤 경우에도 쓰지 마라. 기출 형식(단어 단위 밑줄·짝 단어 한 덩어리·형태 정합·라벨 지문 등장순)도 양보 불가다.",
      "- 그 제약 안에서는 **요청된 난이도에 맞는 표적·짝 단어**가 목표다. '시비가 없다'는 이유로 요청 난이도보다 얕고 안전한 선택(기초 어휘 쌍·문맥 판단 없이 갈리는 짝)으로 후퇴하는 것은 실패다 — 시비 없는 정확한 반의 쌍이면서 난이도에 맞는 표적은 거의 모든 지문에 있다.",
      "- 막히면 공예부터 양보하라: 오축 다의어 함정이 안 잡히면 근접 뉘앙스 함정으로, 그래도 막히면 기초 어휘 쌍을 1~2개까지 허용한다. 확정성과 기출 형식은 양보 불가.",
      "- 어떤 표적 단어가 아래 검산을 통과하지 못하면 그 단어를 고집하지 말고 **지문의 다른 내용어로 표적을 교체하라** — 그것이 허용된 탈출구다.",
      "",
      "## 출력 전 자가 검산 (필수 — 하나라도 어기면 기계 검사에서 자동 반려된다)",
      "1. **재구성 축자 일치 자가 검산**: markedPassage 에서 마커([[X:단어]] → 단어)를 전부 걷어낸 텍스트가 소스 지문과 한 글자도 다르지 않아야 한다(공백·따옴표·구두점·대소문자 포함). 출력 직전 실제로 재구성해 대조하라. 이 유형은 지문을 **변형하지 않는다** — 마커 안 단어도 원문 굴절형 그대로다(단수↔복수·시제 변경 절대 금지).",
      `2. 마커는 정확히 ${pairCount}개가 전부 본문 안에 있고, pairs 도 정확히 ${pairCount}개다. 라벨은 지문 등장 순서대로 ${labelRun} 이며(첫 표적이 (A), 마지막이 (${lastLetter})), pairs 배열도 같은 순서로 나열한다.`,
      "3. pairs 의 word 는 같은 라벨 마커 안 표현과 완전히 동일해야 한다 — 다르게 적으면 반려된다.",
      "4. 각 표적 단어는 지문에 **단어 경계 기준 정확히 1회**만 등장해야 한다. 여러 번 등장하는 단어는 밑줄 자리가 모호해 반려된다 — 그런 단어는 버리고 다른 표적으로 교체하라.",
      "5. 기출 형식: 밑줄은 **단어 1개 단위**다(구·절 밑줄 금지). 짝 단어도 한 단어(하이픈 결합 한 덩어리 허용)여야 하며, 3단어 이상·괄호 뜻풀이가 섞이면 반려된다.",
      "6. 표적 단어끼리 중복 금지, 짝 단어끼리 중복 금지, 표적 단어와 짝 단어가 같은 쌍 금지.",
      "7. 형태 정합(기계 검사): -s(3인칭·복수)·-ing·-ly·비교급·최상급은 표적과 짝 양쪽이 같은 형태여야 한다(subsides 면 escalates, 원형 escalate 는 반려).",
      "8. answer 는 pairs 라벨 중 하나이고, 반의 관계가 깨진 쌍은 **정확히 1개**다 — 두 쌍 이상 시비 걸릴 여지가 있으면 문항 무효이니 재설계하라.",
      "9. correctAntonym(바른짝)은 정답 자리 단어의 이 지문 문맥에서의 실제 반의어 한 단어다. 정답 쌍의 짝 단어와 같으면(그 쌍이 오류가 아니게 됨) 반려, 표적 단어와 같아도 반려된다.",
      `10. wrong 은 정답 라벨을 제외한 ${pairCount - 1}개 전부에 하나씩 있어야 한다 — 정답 라벨이 끼면 반려된다.`,
      "11. **정답 누설 검산(패밀리 특칙)**: 짝 단어·바른짝 후보 표현이 지문 본문에 기등장하면 정답 시비의 씨앗이다 — 그 후보를 버리고 다른 표적(또는 다른 짝 단어)으로 교체하라.",
      "12. 기출 형식: 표적은 지문 전체에 고루 분산하라 — 한 문장에 표적 2개 이상 금지, 같은 문장의 유사 의미 단어 두 개(common 과 same 류) 동시 표시 금지. 짝 단어들의 길이·난이도를 서로 맞춰 정답이 형태만으로 표나지 않게 하라.",
      "13. 금지 쌍(시비 확정 실측): force-restrain, mastery-ignorance, rational-emotional, dim-clear, justify-excuse, unproductive-passive, unproductive-uninterested, paid-refunded — 이 쌍은 어느 자리에도 쓰지 마라.",
      "14. 해설은 1~2문장, 오답 해설은 각 1문장 — 전부 한국어 합쇼체(-습니다)로 통일하고, 영단어는 지문 표현 인용만 허용한다. 지문에 없는 내용·확인하지 않은 의미축 서술을 지어내지 마라(실제 지문을 재확인한 사실만).",
      // 26-08-18 O225 해설 다이어트
      "15. 해설 분량: 정답 해설 1~2문장(의미축·왜 반대가 아닌지), 오답 해설 딱 1문장(왜 정확한 반의 관계인지만). \"학생이 ~라고 착각하기 쉽다\" 같은 유혹·심리 서사는 쓰지 마라 — 짧을수록 좋다.",
    ].join("\n");
  },

  parseAndGate(text, ctx): MdLaneParsed {
    try {
      const raw = JSON.parse(text) as {
        markedPassage: string;
        pairs: Array<{ label: string; word: string; antonym: string }>;
        answer: string;
        correctAntonym: string;
        explanation: string;
        wrong: Array<{ label: string; text: string }>;
      };
      const corrections: string[] = [];
      let q: MdAntonymQuestion = {
        kind: "antonym",
        markedPassage: String(raw.markedPassage ?? ""),
        pairs: (raw.pairs ?? []).map((p) => ({
          label: String(p.label ?? ""),
          word: String(p.word ?? "").trim(),
          antonym: String(p.antonym ?? "").trim(),
        })),
        answer: String(raw.answer ?? ""),
        correctAntonym: String(raw.correctAntonym ?? "").trim(),
        explanation: String(raw.explanation ?? "").trim(),
        wrong: (raw.wrong ?? []).map((w) => ({
          label: String(w.label ?? ""),
          text: String(w.text ?? "").trim(),
        })),
      };
      // 코어스 ①: 마커 등장순 재번호(어법 renumberGrammarByAppearance 동형).
      const rn = renumberAntonymByAppearance(q);
      q = rn.question;
      if (rn.renumbered) corrections.push("밑줄 라벨을 지문 등장순으로 재번호");
      // 코어스 ②: 짝 목록 라벨 오름차순 정렬(게이트의 '짝 라벨 순서' 결정형 위반 교정).
      const sortedPairs = [...q.pairs].sort((a, b) => a.label.localeCompare(b.label));
      if (sortedPairs.some((p, i) => p !== q.pairs[i])) {
        corrections.push("짝 목록을 라벨 오름차순으로 정렬");
      }
      // 오답 해설 정렬은 표시 결정론(어법·빈칸·title 동일) — 교정 기록 없이 수행.
      q = {
        ...q,
        pairs: sortedPairs,
        wrong: [...q.wrong].sort((a, b) => a.label.localeCompare(b.label)),
      };
      // 코어스 ③(레인 재사용): 짝 섹션 word 를 밑줄지문 마커 축자로 보정.
      const snapped = autoSnapAntonymPairs(q, ctx.passage);
      q = snapped.question;
      return {
        question: q,
        gateIssues: [
          ...gateMdAntonym(q, ctx.passage, { pairCount: pairCountOf(ctx) }),
          ...teacherPointIssues(q, ctx),
        ],
        corrections: [...corrections, ...snapped.corrections],
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
    { path: "markedPassage", prefix: "밑줄지문:\n", suffix: "\n" },
    { path: "pairs[].label", prefix: "\n" },
    { path: "pairs[].word", prefix: " " },
    { path: "pairs[].antonym", prefix: " - " },
    { path: "answer", prefix: "\n\n정답: " },
    { path: "correctAntonym", prefix: "\n바른짝: " },
    { path: "explanation", prefix: "\n해설: ", suffix: "\n" },
    { path: "wrong[].label", prefix: "\n" },
    { path: "wrong[].text", prefix: " " },
  ] satisfies LunaBridgeFieldSpec[],

  renderEvalSurface(aiQuestion, passage): string {
    const direction =
      typeof aiQuestion.direction === "string" && aiQuestion.direction.trim()
        ? aiQuestion.direction
        : ANTONYM_MD_DIRECTION;
    const markedWords = Array.isArray(aiQuestion.markedWords)
      ? (aiQuestion.markedWords as Array<Record<string, unknown>>)
      : [];
    const underlined = underlineMarkedWords(passage, markedWords);
    // 선지는 후처리 산출(options: "(A) word - antonym", 표시 계층에서 ① 변환)과 동형.
    const options = markedWords
      .map((mw, i) => {
        const circled = CIRCLED[i] ?? `${i + 1}.`;
        return `${circled} ${String(mw.label ?? "")} ${String(mw.word ?? "")} - ${String(mw.antonym ?? "")}`;
      })
      .join("\n");
    return `${direction}\n\n${underlined}\n\n${options}`;
  },
};
