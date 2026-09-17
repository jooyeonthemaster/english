// ============================================================================
// 어휘 적절성(VOCAB_CHOICE) luna 레인 확장 — 전 유형 이식 캠페인(26-08-14).
// 계약: ../luna-ext-types.ts · 스펙 정본:
// experiments/question-quality-20260715/luna-migration-20260814/SPEC.md
// 견본: ./title.ts(선택형) · 어법 재구성 계열 정본: ../luna-lane.ts
//
// 이 유형은 치환·네모 계열(vocabRecon 패밀리)이다 — 최강 방어선은 어법과 같은
// 재구성 불변식 하나다:
//   markedPassage 의 [[a:표시어]] 마커를 전부 그 자리의 original(지문 축자 원문
//   단어)로 되돌리면 원 지문과 한 글자도 다르지 않다.
// 여기에 이 유형 고유의 정답 누설 축 두 개가 얹힌다(gate-vocab #10-a/#10-b):
//   원형은 지문에 정확히 1회만 등장해야 하고(2회+ = 자리 모호·남은 지문이 정답을
//   흘림), 정답 원단어는 대소문자만 달리도 밑줄 밖에 남으면 안 된다.
//
// json_schema 는 파서 산출물(MdVocabQuestion)과 동형으로 설계해 레인의
// 스냅(autoSnapVocabMarks)·게이트(gateMdVocab)·어댑터를 무수정 재사용한다.
// fixes 만 Record→배열로 바꿔 받는다(strict 스키마는 자유 키 객체를 못 쓴다 —
// 어법 NK 스키마 buildLunaGrammarJsonSchemaNK 와 같은 결정).
//
// ⚠ 정찰 R2 함정(parser-vocab·gate-vocab 헤더) — 이 파일도 같은 경계를 지킨다:
//   변형(synonymVariants) 모드에서는 비정답도 동의어로 표시되므로 "정답 축 동기"
//   류 검사가 구조적으로 성립하지 않는다. 스냅·게이트에 모드를 정확히 전달하는
//   것으로 끝 — 여기서 재구현하지 않는다.
//
// luna 전용 코어스 2개(0원 결정형):
//   (1) 라벨 등장순 재번호 — 어법 renumberGrammarByAppearance 의 소문자 이식.
//       answers·fixes·wrong 라벨을 동기 치환한다.
//   (2) shown ↔ 마커 실물 동기화 — md 경로에서는 shown 이 마커 텍스트에서
//       추출되어 다를 수 없지만, luna JSON 은 markedPassage 와 marks 를 따로
//       내므로 둘이 어긋날 수 있다. 학생이 실제로 보는 것은 마커 텍스트이므로
//       마커를 진실원으로 shown 을 맞춘다(어긋난 채 두면 게이트의 중복·누설
//       검사가 학생 표면과 다른 단어를 검사하는 사각이 된다).
// ============================================================================

import type { MdLaneContext, MdLaneParsed } from "../lane-types";
import type { LunaLaneExt, LunaJsonSchemaSpec } from "../luna-ext-types";
import type { LunaBridgeFieldSpec } from "../luna-stream-bridge";
import { normalizeWs, wordBoundaryRegex } from "../parser";
import {
  clampVocabMdAnswerCount,
  clampVocabMdMarkerCount,
  VOCAB_MD_ANSWER_COUNT_MIN,
  VOCAB_MD_AXIS_CODES,
  VOCAB_MD_LABELS,
  VOCAB_MD_MARKER_COUNT_MIN,
} from "../prompts-vocab";
import {
  autoSnapVocabMarks,
  collectVocabMarks,
  type MdVocabQuestion,
} from "../parser-vocab";
import { gateMdVocab } from "../gate-vocab";
import { VOCAB_MD_DIRECTION_SINGLE } from "../adapter-vocab";

interface VocabResolved {
  vocabChoiceMarkerCount?: number;
  vocabChoiceAnswerCount?: number;
  vocabChoiceSynonymVariants?: boolean;
}

function markerCountOf(ctx: MdLaneContext): number {
  return clampVocabMdMarkerCount(
    (ctx.resolved as VocabResolved).vocabChoiceMarkerCount ?? VOCAB_MD_MARKER_COUNT_MIN,
  );
}

function answerCountOf(ctx: MdLaneContext): number {
  return clampVocabMdAnswerCount(
    (ctx.resolved as VocabResolved).vocabChoiceAnswerCount ?? VOCAB_MD_ANSWER_COUNT_MIN,
    markerCountOf(ctx),
  );
}

function synonymVariantsOf(ctx: MdLaneContext): boolean {
  return (ctx.resolved as VocabResolved).vocabChoiceSynonymVariants === true;
}

function parenLabelsOf(markerCount: number): string[] {
  return VOCAB_MD_LABELS.slice(0, markerCount).map((k) => `(${k})`);
}

// ── 교사 지정 준수 게이트 — lane-vocab.ts teacherPointIssues 의 판정 등가 복제 ──
// 레인 함수가 private 이라(공유 파일 수정 금지) 판정·메시지를 그대로 옮긴다 —
// luna 경로의 parseAndGate 산출이 레인 경로와 동형이어야 재생성 피드백이 같이 돈다.
function teacherPointIssues(q: MdVocabQuestion, ctx: MdLaneContext): string[] {
  if (ctx.teacherPoints.length === 0) return [];
  const issues: string[] = [];
  for (const p of ctx.teacherPoints) {
    const pt = normalizeWs(p.text);
    if (!pt) continue;
    const hit = q.marks.some((m) =>
      [m.original, m.shown].some((raw) => {
        const w = normalizeWs(raw);
        return w.length > 0 && (w.includes(pt) || pt.includes(w));
      }),
    );
    if (!hit) issues.push(`교사 지정 표현이 밑줄에 없음: '${p.text.slice(0, 60)}'`);
  }
  return issues;
}

/** 라벨 등장순 재번호(0원 결정형) — 어법 renumberGrammarByAppearance 의 소문자
 * (a)~(j) 이식. markedPassage 의 [[x: 등장 순서대로 marks 를 정렬해 a→ 로 다시
 * 붙이고 answers·fixes·wrong 을 동기 치환한다. 이미 등장순이면 무변화. 라벨
 * 중복·마커 실종이면 손대지 않는다(게이트가 원인을 직접 말한다). */
function renumberVocabByAppearance(q: MdVocabQuestion): {
  question: MdVocabQuestion;
  renumbered: boolean;
} {
  if (!q.markedPassage || q.marks.length === 0) return { question: q, renumbered: false };
  const letters = q.marks.map((m) => m.label.replace(/[()]/g, ""));
  if (new Set(letters).size !== letters.length) return { question: q, renumbered: false };
  const positions = q.marks.map((mark) => ({
    mark,
    pos: q.markedPassage.indexOf(`[[${mark.label.replace(/[()]/g, "")}:`),
  }));
  if (positions.some((p) => p.pos < 0)) return { question: q, renumbered: false };
  const sorted = [...positions].sort((a, b) => a.pos - b.pos);
  if (sorted.every((p, i) => p.mark.label === `(${VOCAB_MD_LABELS[i]})`)) {
    return { question: q, renumbered: false };
  }
  const relabel = new Map<string, string>();
  sorted.forEach((p, i) => relabel.set(p.mark.label, `(${VOCAB_MD_LABELS[i]})`));
  // 마커 문자 치환은 임시 토큰 경유 2단계 — (a)↔(b) 맞교환의 자기충돌 방지
  // (어법 정본과 동일 기법).
  let mp = q.markedPassage;
  for (const [oldLabel] of relabel) {
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
  const fixes: Record<string, string> = {};
  for (const [k, v] of Object.entries(q.fixes)) fixes[mapLabel(k)] = v;
  return {
    question: {
      ...q,
      markedPassage: mp,
      marks: sorted.map((p, i) => ({ ...p.mark, label: `(${VOCAB_MD_LABELS[i]})` })),
      answers: q.answers.map(mapLabel),
      fixes,
      wrong: q.wrong.map((w) => ({ ...w, label: mapLabel(w.label) })),
    },
    renumbered: true,
  };
}

const AXIS_LIST_KO =
  "(n)지시대상·의미장 (v)동작 방향·극성 (j)정도·평가 극성 (d)논리 연결(인과·양보·조건) (c)연어·공기제약";

export const VOCAB_CHOICE_LUNA_EXT: LunaLaneExt = {
  subType: "VOCAB_CHOICE",
  // O223 A축(26-08-18): 지문 전문(markedPassage)을 재출력하는 유형 — 14k 는 긴
  // 지문에서 사고 잠식 절단(finish=length) 위험. 조건영작 20k 전례.
  maxTokens: 20_000,

  buildJsonSchema(ctx): LunaJsonSchemaSpec {
    const markerCount = markerCountOf(ctx);
    const answerCount = answerCountOf(ctx);
    const variant = synonymVariantsOf(ctx);
    const labels = parenLabelsOf(markerCount);
    const lastKey = VOCAB_MD_LABELS[markerCount - 1];
    const wrongCount = markerCount - answerCount;
    // 필드 순서 = 스트리밍 도착 순서 — md 표면(밑줄지문 → 원형·판단축 → 정답 →
    // 고침 → 해설 → 오답)과 동형. 본문성 큰 필드(markedPassage)가 맨 앞이다.
    const properties: Record<string, unknown> = {
      markedPassage: {
        type: "string",
        description: variant
          ? `지문 전체를 한 글자도 바꾸지 말고 그대로 옮겨 적되, 밑줄 ${markerCount}곳만 [[a:표시어]] ~ [[${lastKey}:표시어]] 인라인 마커로 감싼 것(라벨은 지문 등장 순서대로 a→${lastKey}). 동의어 변장 모드: 표시어는 ${markerCount}곳 전부 원문 단어와 달라야 한다 — 비정답 ${wrongCount}곳은 그 자리에 완벽히 들어맞는 근접 동의어, 정답 ${answerCount}곳은 문맥상 틀린 오용어. 마커 밖 텍스트는 원문과 완전히 동일해야 한다(문장 추가·삭제·재배열·구두점 변경 금지).`
          : `지문 전체를 한 글자도 바꾸지 말고 그대로 옮겨 적되, 밑줄 ${markerCount}곳만 [[a:표시어]] ~ [[${lastKey}:표시어]] 인라인 마커로 감싼 것(라벨은 지문 등장 순서대로 a→${lastKey}). 정답 ${answerCount}곳만 표시어가 원문과 다른 오용어이고, 비정답 ${wrongCount}곳은 원문 단어 그대로다. 마커 밖 텍스트는 원문과 완전히 동일해야 한다(문장 추가·삭제·재배열·구두점 변경 금지).`,
      },
      marks: {
        type: "array",
        minItems: markerCount,
        maxItems: markerCount,
        description: `밑줄 ${markerCount}곳의 메타 — 지문 등장 순서대로 (a)→(${lastKey}).`,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["label", "original", "shown", "code"],
          properties: {
            label: { type: "string", enum: labels },
            original: {
              type: "string",
              description:
                "이 자리의 지문 축자 원문 단어 — 정답 자리도 (마커 안 오용어가 아니라) 원문 단어를 적는다. 변장 여부와 무관하게 항상 원문이다. 한 단어.",
            },
            shown: {
              type: "string",
              description:
                "markedPassage 의 같은 라벨 마커 안에 실제로 표시한 단어와 동일해야 한다. 한 단어.",
            },
            code: {
              type: "string",
              enum: [...VOCAB_MD_AXIS_CODES],
              description: `판단축 한 글자 — ${AXIS_LIST_KO}`,
            },
          },
        },
      },
      answers: {
        type: "array",
        minItems: answerCount,
        maxItems: answerCount,
        items: { type: "string", enum: labels },
        description: `문맥상 낱말의 쓰임이 적절하지 않은 밑줄 라벨 정확히 ${answerCount}개.`,
      },
      fixes: {
        type: "array",
        minItems: answerCount,
        maxItems: answerCount,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["label", "fix"],
          properties: {
            label: { type: "string", enum: labels },
            fix: {
              type: "string",
              description:
                "그 정답 자리의 고침 = 지문 축자 원문 단어 — marks 의 같은 라벨 original 과 한 글자도 다르면 안 된다.",
            },
          },
        },
        description: `정답 라벨마다 하나씩, 정확히 ${answerCount}개.`,
      },
      explanation: {
        type: "string",
        // 26-08-18 O225 해설 다이어트
        description:
          "정답 해설(한국어, 합쇼체, 1~2문장) — 표시된 단어가 어떤 의미축을 왜 배반하는지와 근거 문장만. 학생 심리·출제 의도 서사 금지.",
      },
      wrong: {
        type: "array",
        minItems: wrongCount,
        maxItems: wrongCount,
        description: `정답을 제외한 비정답 ${wrongCount}곳 전부에 하나씩(라벨 중복·정답 라벨 금지).`,
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
                "이 자리 단어가 이 문맥에서 왜 적절한지 딱 1문장(한국어, 합쇼체) — 판정 근거만, 유혹·심리 서사 금지.",
            },
          },
        },
      },
    };
    return {
      name: "vocab_choice_item",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        required: Object.keys(properties),
        properties,
      },
    };
  },

  buildSelfcheck(ctx): string {
    const markerCount = markerCountOf(ctx);
    const answerCount = answerCountOf(ctx);
    const variant = synonymVariantsOf(ctx);
    const lastKey = VOCAB_MD_LABELS[markerCount - 1];
    const wrongCount = markerCount - answerCount;
    const modeLines = variant
      ? [
          `- 동의어 변장 모드다: 밑줄 ${markerCount}곳 **전부** shown 이 original 과 달라야 한다. 비정답 ${wrongCount}곳의 표시어는 그 자리에 논쟁 여지 없이 들어맞는 근접 동의어(품사·굴절·수·시제·연어 동일), 정답 ${answerCount}곳의 표시어는 문맥상 틀린 오용어다. 비정답 표시어가 원문 그대로면 반려된다.`,
          "- 비정답 표시어가 어떤 정답 자리의 원문 단어와 같으면 정답이 통째로 노출된다 — 반려된다. 표시어 전체의 난이도·문체 대역을 맞춰라(정답 자리만 낯선 단어면 변장이 무의미하다).",
          "- original 은 변장 여부와 무관하게 **항상 지문 축자 원문 단어**다 — 여기에 동의어를 적으면 재구성 검산이 무너져 반려된다.",
        ]
      : [
          `- 정답 ${answerCount}곳만 shown≠original(문맥상 틀린 오용어)이고, 비정답 ${wrongCount}곳은 shown 과 original 이 축자로 완전히 같아야 한다(원문 그대로). answers 라벨 집합과 표시어가 변형된 자리 집합이 정확히 일치해야 한다.`,
        ];
    return [
      // 26-08-18 O223 사다리 수술(어법 실측 이식)
      "## 규칙 충돌 시 우선순위 (필수 — 지시가 서로 부딪히면 이 사다리를 따르라)",
      "- 판정 확정성(재구성 축자 일치·원형 1회 등장·정답 유일)은 **제약**이다: 아래 검산에 걸리는 표적·표시어는 어떤 경우에도 쓰지 마라. 기출 형식(단어 단위 밑줄·라벨 등장순·지문 전역 분산)도 양보 불가다.",
      "- 그 제약 안에서는 **요청된 난이도에 맞는 표적·오용어**가 목표다. '시비가 없다'는 이유로 요청 난이도보다 얕고 안전한 선택(기초 어휘 표적·문맥 판단 없이도 튀는 오용어)으로 후퇴하는 것은 실패다 — 확정적이면서 난이도에 맞는 표적은 거의 모든 지문에 있다.",
      "- 전부를 동시에 만족할 수 없으면 **오용 기제 다양성부터 양보하라**(같은 판단축을 두 번 써도 좋다). 그래도 막히면 표적 단어를 지문에 1회만 등장하는 다른 내용어로 교체하라 — 재구성 축자·원형 유일 등장·정답 유일성은 절대 양보 불가.",
      "",
      "## 재구성 축자 검산 (필수 — 출력 직전 실제로 재구성해 대조하라)",
      `- markedPassage 의 [[a:…]]~[[${lastKey}:…]] 마커 ${markerCount}개를 전부 marks 의 같은 라벨 original 로 되돌려 이어 붙인 텍스트가 소스 지문과 한 글자도 다르지 않아야 한다(공백·따옴표·구두점 포함). 다르면 자동 반려된다.`,
      "- 마커 밖 텍스트는 원문과 완전히 동일해야 한다 — 문장 추가·삭제·재배열·바꿔 쓰기·구두점 변경 전부 자동 반려된다.",
      "- 치환은 정확히 그 한 단어뿐이다 — 치환 자리 좌우의 쉼표·문장부호를 옮기거나 지우면 반려된다.",
      "- marks 의 shown 은 markedPassage 마커 안에 실제 표시한 단어와 같아야 한다.",
      "",
      "## 표적 유일성·정답 누설 검산 (필수)",
      "- 각 original 이 지문 전체에서 **정확히 1회**만 등장하는지 세어라(단어 경계·대소문자 무시). 0회는 오기이고, 2회 이상이면 밑줄 자리가 모호하고 남은 지문이 정답을 흘린다 — 그 표적을 버리고 다른 단어로 교체하라.",
      "- 정답 자리의 원문 단어는 문두 대문자 등 대소문자만 다른 형태로도 지문의 다른 곳에 남아 있으면 안 된다 — 학생이 지문만 보고 정답을 역추론한다(자동 반려).",
      "- 후보 표현(오용어·동의어)이 지문 본문에 이미 등장하는 단어면 정답 시비가 난다 — 다른 표현이나 다른 표적으로 교체하라.",
      "- 표시어끼리 같은 단어가 두 번 나오면 반려된다(학생 표면에 글자까지 같은 선지 두 개). 어떤 표시어도 **다른 밑줄의 원문 단어**와 같으면 안 된다 — 특히 정답 자리의 원문 단어를 표시어로 쓰면 정답이 통째로 노출된다.",
      "- 원문이 구동사(leaving out 류)면 머리 동사만 바꾸지 마라 — particle 이 잔류해 존재하지 않는 결합('including out')이 되면 문법 파손만으로 정답이 드러나 자동 반려된다. 그 자리를 피하거나 통째로 다른 표적을 골라라.",
      "",
      "## 기출 형식 검산 (필수)",
      "- 밑줄은 **단어 단위**가 기출 관행이다 — original·shown 은 각각 한 단어(하이픈 결합 한 덩어리 허용). 3단어 초과·구·절·괄호 뜻풀이는 자동 반려된다.",
      `- 마커 라벨은 지문 등장 순서대로 (a)→(${lastKey}) 이고, marks 배열도 같은 순서다.`,
      `- 밑줄 ${markerCount}곳은 지문 전역에 흩어라 — 첫 문장 금지, 한 문장에 두 개 금지(기출 관행). 밑줄은 내용어(동사·명사·형용사·부사)만, 관사·전치사·접속사·대명사·조동사·고유명사·숫자는 실격이다.`,
      "- 오용어는 원문 단어와 품사·굴절·수·시제가 완전히 같아야 한다 — 형태가 튀면 문맥 판단 없이 정답이 드러난다. 밑줄 단어들의 난이도·길이 대역도 맞춰라(정답 자리만 유독 낯설면 그 자체가 단서다).",
      "- 판단축 code 는 n·v·j·d·c 닫힌 집합의 한 글자만 쓴다(괄호·설명 부착 금지).",
      "",
      "## 정답·고침 검산 (필수)",
      `- answers 는 정확히 ${answerCount}개이고 전부 실재 마커 라벨이어야 한다.`,
      ...modeLines,
      ...(answerCount >= 2
        ? [
            `- 정답 ${answerCount}곳은 서로 다른 문장에 두고 서로 다른 판단축을 배반시켜라 — 한 문장을 해부하면 정답 두 개가 같이 나오는 배치는 금지.`,
          ]
        : []),
      "- fixes 는 정답 라벨마다 정확히 하나씩이고, fix 값은 marks 의 같은 라벨 original 과 한 글자도 다르면 안 된다. 비정답 라벨에 고침을 붙이면 반려된다.",
      '- 각 정답에 대해 "이 낱말이 어긋난다는 근거 문장이 무엇인가"를 한 줄로 답해보라 — 못 대면 표적을 다시 설계하라. 각 비정답에 대해 "이 낱말이 이 자리에 맞는 이유"를 답해보라 — 못 대는 자리는 밑줄을 옮겨라.',
      "",
      "## 해설 검산 (필수)",
      wrongCount > 0
        ? `- explanation 은 비울 수 없다. wrong 은 정답을 제외한 비정답 ${wrongCount}곳 전부에 정확히 한 줄씩이다 — 라벨 중복·누락·정답 라벨 포함은 자동 반려된다.`
        : "- explanation 은 비울 수 없다. 모든 밑줄이 정답이므로 wrong 은 빈 배열이다.",
      "- 해설·오답 해설은 한국어로 쓰고(지문 표현 인용만 영어 허용) 합쇼체(-습니다)로 통일하라.",
      // 26-08-18 O225 해설 다이어트
      "- 해설 분량: 정답 해설 1~2문장(어떤 의미축을 왜 배반하는지·근거 문장), 오답 해설 딱 1문장(왜 적절한지만). \"학생이 ~와 헷갈리기 쉽다\" 같은 유혹·심리 서사는 쓰지 마라 — 짧을수록 좋다.",
      "- '무엇을 무엇으로 바꿨다'는 출제 과정을 쓰지 마라 — 학생에게는 왜 이 문맥에 어긋나는지만 설명한다. 근거 문장 서술은 실제 지문을 다시 읽고 **사실만** 써라 — 지문에 없는 내용을 지어내면 반려된다.",
    ].join("\n");
  },

  parseAndGate(text, ctx): MdLaneParsed {
    const markerCount = markerCountOf(ctx);
    const answerCount = answerCountOf(ctx);
    const variant = synonymVariantsOf(ctx);
    try {
      const raw = JSON.parse(text) as {
        markedPassage?: unknown;
        marks?: Array<{ label?: unknown; original?: unknown; shown?: unknown; code?: unknown }>;
        answers?: unknown[];
        fixes?: Array<{ label?: unknown; fix?: unknown }>;
        explanation?: unknown;
        wrong?: Array<{ label?: unknown; text?: unknown }>;
      };
      const corrections: string[] = [];
      const fixes: Record<string, string> = {};
      for (const f of Array.isArray(raw.fixes) ? raw.fixes : []) {
        const label = String(f?.label ?? "").trim();
        const fix = String(f?.fix ?? "").trim();
        if (label && fix) fixes[label] = fix;
      }
      let q: MdVocabQuestion = {
        kind: "vocab",
        markedPassage: String(raw.markedPassage ?? "").trim(),
        marks: (Array.isArray(raw.marks) ? raw.marks : []).map((m) => ({
          label: String(m?.label ?? "").trim(),
          original: String(m?.original ?? "").trim(),
          shown: String(m?.shown ?? "").trim(),
          code: String(m?.code ?? "").trim(),
        })),
        answers: (Array.isArray(raw.answers) ? raw.answers : [])
          .map((a) => String(a ?? "").trim())
          .filter(Boolean),
        fixes,
        explanation: String(raw.explanation ?? "").trim(),
        wrong: (Array.isArray(raw.wrong) ? raw.wrong : []).map((w) => ({
          label: String(w?.label ?? "").trim(),
          text: String(w?.text ?? "").trim(),
        })),
      };

      // 코어스 1 — 라벨 등장순 재번호(answers·fixes·wrong 동기 치환).
      const rn = renumberVocabByAppearance(q);
      if (rn.renumbered) {
        q = rn.question;
        corrections.push("밑줄 라벨 등장순 재번호 — marks·answers·fixes·wrong 동기 치환");
      }

      // 코어스 2 — shown 을 마커 실물로 동기화(마커 텍스트가 학생 표면의 진실원).
      const renderedByLabel = new Map(
        collectVocabMarks(q.markedPassage).map((m) => [m.label, m.shown]),
      );
      q = {
        ...q,
        marks: q.marks.map((m) => {
          const rs = renderedByLabel.get(m.label);
          if (rs === undefined || normalizeWs(rs) === normalizeWs(m.shown)) return m;
          corrections.push(`${m.label} 표시어를 마커 실물로 동기화: '${m.shown}' → '${rs}'`);
          return { ...m, shown: rs };
        }),
      };

      // 코어스 3 — 오답 해설 라벨 오름차순 정렬(표시 결정론 — 어법·빈칸·TITLE 동일).
      q = { ...q, wrong: [...q.wrong].sort((a, b) => a.label.localeCompare(b.label)) };

      // 코어스 4 — 레인 스냅 재사용(비정답 원형 교정·대소문자 스냅·고침 채우기).
      // answerCount 전달로 "정답 축 확정" 가드가 레인 경로와 동일하게 선다.
      const snapped = autoSnapVocabMarks(q, ctx.passage, {
        synonymVariants: variant,
        answerCount,
      });
      q = snapped.question;

      return {
        question: q,
        gateIssues: [
          ...gateMdVocab(q, ctx.passage, {
            markerCount,
            answerCount,
            synonymVariants: variant,
          }),
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

  // md 표면 동형 순서: 밑줄지문 → (marks 침묵) → 정답 → 고침 → 해설 → 오답.
  // marks 는 원형(=정답 열쇠)을 담은 메타 배열이라 반드시 침묵시킨다.
  bridgeSpecs: [
    { path: "markedPassage", prefix: "밑줄지문:\n", suffix: "\n" },
    { path: "answers[]", prefix: "\n정답: " },
    { path: "fixes[].label", prefix: "\n고침" },
    { path: "fixes[].fix", prefix: ": " },
    { path: "explanation", prefix: "\n해설: ", suffix: "\n" },
    { path: "wrong[].label", prefix: "\n" },
    { path: "wrong[].text", prefix: " " },
  ] satisfies LunaBridgeFieldSpec[],

  renderEvalSurface(aiQuestion, passage): string {
    // 학생 시험 표면 — 기출 실물처럼 발문 + 밑줄 번호가 박힌 지문만 보여준다
    // (별도 선지 목록 없음 — 밑줄이 곧 선지다). 어댑터 산출(markedWords)의
    // originalWord 위치를 원 지문에서 찾아 표시어(substituteWord)로 갈아 끼운다.
    const direction =
      typeof aiQuestion.direction === "string" && aiQuestion.direction.trim()
        ? aiQuestion.direction
        : VOCAB_MD_DIRECTION_SINGLE;
    const CIRCLED = "①②③④⑤⑥⑦⑧⑨⑩";
    const markedWords = Array.isArray(aiQuestion.markedWords)
      ? (aiQuestion.markedWords as Array<Record<string, unknown>>)
      : [];
    const spots: Array<{ index: number; length: number; render: string }> = [];
    markedWords.forEach((mw, i) => {
      const original = String(mw.originalWord ?? "").trim();
      const shown = String(mw.substituteWord ?? "").trim() || original;
      if (!original) return;
      const m = wordBoundaryRegex(original).exec(passage);
      const index = m ? m.index : passage.indexOf(original);
      if (index < 0) return;
      spots.push({
        index,
        length: m ? m[0].length : original.length,
        render: `__${CIRCLED[i] ?? `(${i + 1})`} ${shown}__`,
      });
    });
    spots.sort((a, b) => a.index - b.index);
    let body = "";
    let cursor = 0;
    for (const s of spots) {
      if (s.index < cursor) continue;
      body += passage.slice(cursor, s.index) + s.render;
      cursor = s.index + s.length;
    }
    body += passage.slice(cursor);
    return `${direction}\n\n${body}`;
  },
};
