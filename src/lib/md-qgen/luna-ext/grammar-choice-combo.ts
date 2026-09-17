// ============================================================================
// 네모 어법(GRAMMAR_CHOICE_COMBO) luna 레인 확장 — 전 유형 이식 캠페인(26-08-14).
// 계약: ../luna-ext-types.ts · 스펙 정본:
// experiments/question-quality-20260715/luna-migration-20260814/SPEC.md
// 견본: ./title.ts (선택형) — 이 파일은 **치환·네모 계열(vocabRecon 패밀리)** 이식이다.
//
// 이 패밀리의 최강 방어선 2개(luna 기지 결함 계통과 정면 충돌하는 축):
//  · 재구성 불변식 — 마커를 파이프 왼쪽(올바른 표현=원문 축자)으로 되돌리면 원
//    지문과 축자 동일(gate-combo #5). 검산 블록이 "출력 직전 실제 재구성 대조"를
//    강제한다(어법 F 30%→5% 소멸 레시피의 이 유형 판).
//  · 누설 게이트 — 후보(올바른·틀린 쪽 모두)가 네모 밖 지문에 기등장하면 정답
//    시비(gate-combo #11 3분기). 검산이 "다른 표적으로 교체"를 탈출구로 명시한다.
//
// json_schema 는 파서 산출물(MdComboQuestion)과 동형으로 설계해 레인의
// 스냅(autoSnapComboSlots)·게이트(gateMdCombo)·어댑터(adaptMdComboToAiQuestion)를
// 무수정 재사용한다. 형식 노브 없음(네모 3·선지 5 고정 — prompts-combo.ts 근거,
// 범위 밖 설정은 lane.isEligible 이 이미 fast 로 되돌린다) — 스키마는 정적이다.
//
// 결정형 코어스 4종(§1-8 "고쳐서 살린다"):
//  · slots 라벨 오름차순 정렬(배열 순서 드리프트 — 값 계약이 라벨축이라 무손실)
//  · 라벨 등장순 재번호(마커가 [[B: 먼저 나오는 출력 — 마커·메타·선지 값 순열·
//    해설 라벨 언급까지 동기 치환. luna-lane renumberGrammarByAppearance 동형)
//  · 오답해설 라벨 오름차순 정렬(표시 결정론 — 어법·빈칸·TITLE 동일)
//  · **후보쌍 공통 토큰 트리밍**(r1 판정 26-08-14 — 확정 F 5건 중 4건이 이 계통).
//    [[A:that we can't hear|what we can't hear]] 처럼 두 후보가 공유하는 어휘까지
//    상자에 넣는 구·절 단위 네모는 기출 형식 위반이고 실사용 반려 사고 계통이다
//    (SPEC §1-9). 공통 앞·뒤 토큰을 상자 **밖**으로 밀어내면 재구성 텍스트는 한
//    글자도 바뀌지 않으므로 무손실이다. 좁아진 후보가 누설·준동사 게이트에 새로
//    걸릴 수는 있어 게이트 이슈가 늘면 통째로 롤백한다(안전 코어스).
// ============================================================================

import type { MdLaneContext, MdLaneParsed } from "../lane-types";
import type { LunaLaneExt, LunaJsonSchemaSpec } from "../luna-ext-types";
import type { LunaBridgeFieldSpec } from "../luna-stream-bridge";
import { normalizeWs } from "../parser";
import {
  COMBO_MD_LABELS,
  COMBO_MD_OPTION_COUNT,
  COMBO_MD_SLOT_COUNT,
  COMBO_MD_VALUE_JOINER,
} from "../prompts-combo";
import {
  COMBO_CIRCLED,
  COMBO_LABEL_KEYS,
  autoSnapComboSlots,
  comboCmp as cmp,
  type MdComboQuestion,
} from "../parser-combo";
import { gateMdCombo } from "../gate-combo";
import { COMBO_MD_DIRECTION, COMBO_OPTION_JOINER } from "../adapter-combo";

const SLOT_LABELS = COMBO_MD_LABELS.map((l) => `(${l})`); // ["(A)","(B)","(C)"]
const OPTION_LABELS = COMBO_CIRCLED.split(""); // ①~⑤
const POINT_CODES = "abcdefghijklm".split(""); // adapter POINT_NAME 닫힌 집합

// ── 교사 지정 준수 게이트 — lane-combo.ts teacherPointIssues 의 판정 등가 복제 ──
// 레인 parseAndGate 는 게이트 + 교사포인트 준수검사를 합쳐 반환하는데 그 함수가
// 레인 파일의 private 이라(공유 파일 수정 금지) 판정만 그대로 옮긴다 —
// point-picker-config 준수 표면(slots[].correctExpression)과 동일 축.
function teacherPointIssues(q: MdComboQuestion, ctx: MdLaneContext): string[] {
  if (ctx.teacherPoints.length === 0) return [];
  const issues: string[] = [];
  for (const p of ctx.teacherPoints) {
    const pt = normalizeWs(p.text);
    if (!pt) continue;
    const hit = q.slots.some((slot) => {
      const correct = normalizeWs(slot.correct);
      return correct.length > 0 && (correct.includes(pt) || pt.includes(correct));
    });
    if (!hit) issues.push(`교사 지정 표현이 네모에 없음: '${p.text.slice(0, 60)}'`);
  }
  return issues;
}

// ── 결정형 코어스: 라벨 등장순 재번호 (luna-lane renumberGrammarByAppearance 동형) ──
// 마커 라벨이 지문 등장순 (A)(B)(C) 가 아니면 등장순으로 다시 붙이고 slots 순서·
// 선지 값 순열·해설/오답해설의 라벨 언급을 동기 치환한다. 조합 유형이라 값 축이
// 라벨 순서에 묶여 있어 순열 치환까지가 한 몸이다 — 어느 하나라도 확정 불가면
// 무변화로 두고 게이트가 반려한다(보수 원칙).
function renumberComboByAppearance(q: MdComboQuestion): {
  question: MdComboQuestion;
  renumbered: boolean;
} {
  if (!q.markedPassage || q.slots.length !== COMBO_MD_SLOT_COUNT) {
    return { question: q, renumbered: false };
  }
  const labels = q.slots.map((s) => s.label);
  if (new Set(labels).size !== labels.length) return { question: q, renumbered: false };
  const positions = q.slots.map((slot) => ({
    slot,
    pos: q.markedPassage.indexOf(`[[${slot.label.replace(/[()]/g, "")}:`),
  }));
  if (positions.some((p) => p.pos < 0)) return { question: q, renumbered: false };
  const sorted = [...positions].sort((a, b) => a.pos - b.pos);
  if (sorted.every((p, i) => p.slot.label === `(${COMBO_LABEL_KEYS[i]})`)) {
    return { question: q, renumbered: false };
  }
  const relabel = new Map<string, string>(); // 옛 라벨 → 새 라벨
  sorted.forEach((p, i) => relabel.set(p.slot.label, `(${COMBO_LABEL_KEYS[i]})`));

  // 마커 치환은 임시 토큰 경유 2단계 — (A)↔(B) 맞교환의 자기충돌 방지(정본 기법).
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

  // 해설·오답해설의 라벨 언급 동기 치환(@@ 센티널 2단계 — 후처리 @@GLBL 동형).
  const remapText = (value: string): string => {
    let out = value;
    for (const [oldLabel, newLabel] of relabel) {
      if (oldLabel === newLabel) continue;
      out = out.split(oldLabel).join(`@@CMB_${newLabel.replace(/[()]/g, "")}@@`);
    }
    return out.replace(/@@CMB_([A-C])@@/g, "($1)");
  };

  // 선지 값은 라벨축 계약(values[i] ↔ 라벨 (A|B|C)[i])이라 라벨 순열대로 재배열.
  const oldIndexForNew = sorted.map((p) => COMBO_LABEL_KEYS.indexOf(p.slot.label[1]));
  const options = q.options.map((o) => {
    if (o.values.length !== COMBO_MD_SLOT_COUNT || oldIndexForNew.some((i) => i < 0)) {
      return o;
    }
    const values = oldIndexForNew.map((i) => o.values[i]);
    return { ...o, values, text: values.join(COMBO_MD_VALUE_JOINER) };
  });

  return {
    question: {
      ...q,
      markedPassage: mp,
      slots: sorted.map((p, i) => ({ ...p.slot, label: `(${COMBO_LABEL_KEYS[i]})` })),
      options,
      explanation: remapText(q.explanation),
      wrong: q.wrong.map((w) => ({ ...w, text: remapText(w.text) })),
    },
    renumbered: true,
  };
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// ── 결정형 코어스: 후보쌍 공통 토큰 트리밍(기출 네모는 변별 토큰만 가둔다) ──
// 두 후보의 공통 **앞·뒤** 토큰만 상자 밖으로 밀어낸다. 올바른 쪽이
// prefix + 코어 + suffix 로 그대로 복원되므로 게이트 #5 재구성은 불변이고,
// 선지 값(라벨축 계약)도 같은 규칙으로 좁힌다. 가운데 공통 토큰은 건드리지
// 않는다(태 대조처럼 구 단위가 불가피한 자리를 망가뜨리지 않기 위한 보수 원칙).
function trimSharedCandidateTokens(q: MdComboQuestion): {
  question: MdComboQuestion;
  trimmed: string[];
} {
  const trimmed: string[] = [];
  const next = new Map<string, { correct: string; wrong: string }>();
  let mp = q.markedPassage;
  const slots = q.slots.map((slot) => {
    const c = slot.correct.split(/\s+/).filter(Boolean);
    const w = slot.wrong.split(/\s+/).filter(Boolean);
    if (c.length === 0 || w.length === 0 || slot.label.length !== 3) return slot;
    let head = 0;
    while (c.length - head > 1 && w.length - head > 1 && c[head] === w[head]) head += 1;
    let tail = 0;
    while (
      c.length - head - tail > 1 &&
      w.length - head - tail > 1 &&
      c[c.length - 1 - tail] === w[w.length - 1 - tail]
    ) {
      tail += 1;
    }
    if (head === 0 && tail === 0) return slot;
    const core = (arr: string[]) => arr.slice(head, arr.length - tail).join(" ");
    const nextCorrect = core(c);
    const nextWrong = core(w);
    if (!nextCorrect || !nextWrong || cmp(nextCorrect) === cmp(nextWrong)) return slot;
    const letter = slot.label[1];
    const markRe = new RegExp(
      `\\[\\[${letter}:\\s*${escapeRe(slot.correct)}\\s*\\|\\s*${escapeRe(slot.wrong)}\\s*\\]\\]`,
      "g",
    );
    if ((mp.match(markRe) ?? []).length !== 1) return slot;
    const prefix = c.slice(0, head).join(" ");
    const suffix = tail > 0 ? c.slice(c.length - tail).join(" ") : "";
    mp = mp.replace(
      markRe,
      `${prefix ? `${prefix} ` : ""}[[${letter}:${nextCorrect}|${nextWrong}]]${suffix ? ` ${suffix}` : ""}`,
    );
    trimmed.push(slot.label);
    next.set(slot.label, { correct: nextCorrect, wrong: nextWrong });
    return { ...slot, correct: nextCorrect, wrong: nextWrong };
  });
  if (trimmed.length === 0) return { question: q, trimmed };
  const options = q.options.map((o) => {
    if (o.values.length !== q.slots.length) return o;
    const values = o.values.map((value, i) => {
      const before = q.slots[i];
      const after = before ? next.get(before.label) : undefined;
      if (!before || !after) return value;
      if (cmp(value) === cmp(before.correct)) return after.correct;
      if (cmp(value) === cmp(before.wrong)) return after.wrong;
      return value;
    });
    return { ...o, values, text: values.join(COMBO_MD_VALUE_JOINER) };
  });
  return { question: { ...q, markedPassage: mp, slots, options }, trimmed };
}

/** 평가 표면 전용 — 후처리 correctCandidateFirst(:50-55) 동형 해시로 좌우 배치를
 * 재현한다(프로덕션 무관·블라인드 패널이 "정답 항상 왼쪽" 오라클을 얻지 않게). */
function evalCandidateOrder(correct: string, wrong: string): [string, string] {
  let hash = 0;
  const combined = `${correct}|${wrong}`;
  for (let i = 0; i < combined.length; i += 1) hash = (hash + combined.charCodeAt(i)) % 997;
  return hash % 2 === 0 ? [correct, wrong] : [wrong, correct];
}

export const GRAMMAR_CHOICE_COMBO_LUNA_EXT: LunaLaneExt = {
  // 26-08-14 판정 실측: 네모 5곳을 심은 지문 전문을 출력하는 유형이라 14k 에서
  // 사고 13,984/14,000 소진 → `{"markedPassage":"` 만 남고 절단(최종 실패 2건).
  // 품질은 luna 우세(F 0/6 vs g36 1/8)였고 수율만 예산에 막혔다 — 이 유형만 상향.
  maxTokens: 22_000,
  subType: "GRAMMAR_CHOICE_COMBO",

  buildJsonSchema(): LunaJsonSchemaSpec {
    // 필드 순서 = 스트리밍 도착 순서 — md 표면(네모지문 → 원형·포인트 → 선지 →
    // 정답 → 해설 → 오답)과 동형. 본문성 큰 필드(markedPassage)가 맨 앞이다.
    return {
      name: "grammar_choice_combo_item",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["markedPassage", "slots", "options", "answer", "explanation", "wrong"],
        properties: {
          markedPassage: {
            type: "string",
            description:
              "지문 전체를 원문 그대로 복사하되, 서로 다른 문장의 네모 3곳만 [[A:올바른표현|틀린표현]] ~ [[C:올바른표현|틀린표현]] 인라인 마커로 감싼 것. 파이프(|) 왼쪽이 반드시 원문 축자(어법상 옳은 표현), 오른쪽이 네가 만든 변형(어법상 틀린 표현)이다. 라벨은 지문 등장 순서대로 A→B→C. 마커 밖의 모든 텍스트는 원문과 한 글자도 달라선 안 된다 — 문장 추가·삭제·재배열·구두점 변경 전부 금지. 상자 안에는 **변별 토큰만** 넣어라(기출 형식): 두 후보가 공유하는 단어는 상자 밖에 남긴다 — `at a frequency [[A:that|what]] we can't hear` 는 옳고 `[[A:that we can't hear|what we can't hear]]` 는 형식 위반이다.",
          },
          slots: {
            type: "array",
            minItems: COMBO_MD_SLOT_COUNT,
            maxItems: COMBO_MD_SLOT_COUNT,
            description: "네모 3개의 원형·포인트 메타 — (A)(B)(C) 순서, 마커와 축자 동일",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["label", "correct", "wrong", "code"],
              properties: {
                label: { type: "string", enum: SLOT_LABELS },
                correct: {
                  type: "string",
                  description:
                    "어법상 옳은 표현 = 원문 축자(마커 파이프 왼쪽과 완전히 동일) — 틀린 표현과 공통 단어가 없어야 하며 대개 한 단어다",
                },
                wrong: {
                  type: "string",
                  description:
                    "어법상 틀린 표현(마커 파이프 오른쪽과 완전히 동일) — 어간은 유지하고 형태만 변형하며, 그 자리에서 어떤 통사 해석으로도 성립하면 안 된다. 옳은 표현과 공통 단어를 두지 마라(태 대조처럼 불가피할 때만 최소 구)",
                },
                code: {
                  type: "string",
                  enum: POINT_CODES,
                  description: "포인트 코드 a~m 한 글자 — 세 네모 모두 서로 달라야 한다",
                },
              },
            },
          },
          options: {
            type: "array",
            minItems: COMBO_MD_OPTION_COUNT,
            maxItems: COMBO_MD_OPTION_COUNT,
            description:
              "조합 선지 — ①~⑤ 순서 그대로. 기출 조합표: 세 자리 전부 옳은 정답 1개 + 한 자리만 틀린 near-miss 3개((A)만·(B)만·(C)만) + 두 자리 이상 틀린 1개. 이래야 어느 두 네모만으로는 정답이 확정되지 않는다",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["label", "values"],
              properties: {
                label: { type: "string", enum: OPTION_LABELS },
                values: {
                  type: "array",
                  minItems: COMBO_MD_SLOT_COUNT,
                  maxItems: COMBO_MD_SLOT_COUNT,
                  items: { type: "string" },
                  description:
                    "(A)(B)(C) 순서의 값 3개 — 각 값은 그 네모의 두 후보 중 하나와 축자로 완전히 같아야 한다(제3의 표현 금지)",
                },
              },
            },
          },
          answer: {
            type: "string",
            enum: OPTION_LABELS,
            description: "세 네모 전부 올바른 표현인 유일한 조합의 선지 라벨",
          },
          explanation: {
            type: "string",
            description:
              "정답 해설(한국어, 합쇼체) — 딱 2문장, (A)→(B)→(C) 순서로 각 네모의 올바른 표현이 왜 옳은지 구조 근거만",
          },
          wrong: {
            type: "array",
            minItems: COMBO_MD_OPTION_COUNT - 1,
            maxItems: COMBO_MD_OPTION_COUNT - 1,
            description: "정답을 제외한 오답 선지 4개 각각에 하나씩 — 정답 라벨 금지, 라벨 중복 금지",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["label", "text"],
              properties: {
                label: { type: "string", enum: OPTION_LABELS },
                text: {
                  type: "string",
                  description:
                    "이 조합의 어느 네모에서 어떤 값이 왜 틀렸는지 1문장(한국어, 합쇼체) — 그 선지에서 **실제로 틀린 값을 그대로 인용**하고 그 값이 놓인 라벨을 붙여라(예: \"(A)의 'environmentally'는 …\"). 그 선지에서 옳은 값이 든 라벨을 오류로 지적하거나 라벨과 설명 내용을 맞바꾸면 안 된다",
                },
              },
            },
          },
        },
      },
    };
  },

  buildSelfcheck(ctx): string {
    const teacherBlock =
      ctx.teacherPoints.length > 0
        ? [
            "",
            "## 교사 지정 준수 검산 (필수)",
            `- 교사 지정 표현 ${ctx.teacherPoints.length}개(${ctx.teacherPoints
              .map((p) => `'${p.text.slice(0, 40)}'`)
              .join(", ")}) 각각이 세 네모 중 하나의 **올바른 표현**과 겹치는지 확인하라 — 하나라도 네모에 반영되지 않으면 자동 반려된다.`,
          ]
        : [];
    return [
      "## 출력 예산 (이것부터 지켜라 — 어기면 문항 전체가 폐기된다)",
      "- 네 출력 예산은 유한하고, 이 유형의 최다 손실은 **사고가 길어져 JSON 이 markedPassage 도중에 잘리는 것**이다(실측). 표적 후보를 여러 개 만들어 비교하지 말고 **첫 적합 후보를 즉시 채택**하라.",
      "- 아래 검산 항목은 각각 **1회만** 훑고 통과하면 다시 돌아보지 마라. 표적 교체는 최대 1회. 선정이 끝나면 지체 없이 markedPassage(지문 전문 복사)부터 써 내려가라.",
      "",
      // 26-08-18 O223 사다리 수술(어법 실측 이식)
      "## 규칙 충돌 시 우선순위 (지시가 서로 부딪히면 이 사다리)",
      "- 판정 확정성(재구성 축자 일치·정답 조합 유일·후보쌍 시비 없음)은 **제약**이다: 후보쌍 금지 목록·누설에 걸리는 자리는 어떤 경우에도 쓰지 마라. 기출 형식(변별 토큰만 가두기·어간 유지 형태 변형·라벨 등장순·조합표)도 양보 불가다.",
      "- 그 제약 안에서는 **요청된 난이도에 맞는 네모 자리·포인트**가 목표다. '시비가 없다'는 이유로 요청 난이도보다 얕고 안전한 자리(지문 앞쪽 정형 자리·형태만 봐도 갈리는 후보쌍)로 후퇴하는 것은 실패다 — 확정적이면서 난이도에 맞는 자리는 거의 모든 지문에 있다.",
      "- 막히면 **공예부터 양보**하고(세 네모의 오인 축이 겹쳐도 좋다), 그래도 막히면 그 네모를 버리고 **다른 문장의 다른 포인트로 교체하라** — 지문은 수정할 수 없으므로 자리 재선정만이 탈출구다. 재구성 축자·정답 조합 유일성·포인트 코드 3종 상이는 절대 양보 불가.",
      "",
      "## 표적 선정 검산",
      "- 네모 3개는 **서로 다른 문장**에서 고르고 지문 전체에 흩어 놓아라(도입부에 몰지 마라). 라벨은 지문 등장순 (A)(B)(C) 이고 slots 메타도 같은 순서다.",
      "- **상자 안에는 변별 토큰만 넣어라(기출 형식의 핵심)**: 두 후보가 공유하는 단어는 상자 밖에 남긴다. `at a frequency [[A:that|what]] we can't hear` 는 옳고 `[[A:that we can't hear|what we can't hear]]`·`[[B:is the key|are the key]]` 는 형식 위반이다. 대개 한 단어이고, 태(voice) 대조처럼 불가피할 때만 최소 구로 하되 공통 조동사는 상자 밖에 둔다.",
      "- 후보쌍 금지 목록(전부 자동 반려): 두 후보가 동일 / **시제 단독 교체**(realizes↔realized) / **수량 의미토글**(little↔a little, less↔fewer 류) / 지각·사역동사 보어 자리 형태 토글 / 주격 관계대명사(who·which·that) 바로 뒤 동사 자리의 준동사 후보(그 자리는 수일치로 내라) / 후보 안의 `/ [ ] | …` 문자.",
      "- 틀린 후보를 넣은 문장을 **다른 통사 해석으로 한 번 더** 읽어라 — 어느 한 해석으로라도 성립하면 그 변형은 탈락이다.",
      "- 누설(이 계열 최다 반려 축): 후보 표현이 **올바른 쪽·틀린 쪽 모두** 네모 밖 지문에 기등장하면 반려된다. 직전 단어까지 묶은 연어('trees provide')도, that↔what 네모에서 '인지·단언 동사 + that + 완전절'이 네모 밖에 남아 있는 것도 같은 누설이다. 해소책은 **표적 교체뿐**이다(지문 수정 불가).",
      "- 포인트 코드는 a~m 한 글자, 세 네모 모두 다르게, 해설이 말하는 문법 범주와 일치하게.",
      "",
      "## 재구성 축자 검산 (출력 직전 1회)",
      "- 마커 3개를 **파이프 왼쪽 값**으로 되돌려 이은 텍스트가 원 지문과 한 글자도 다르지 않아야 한다(공백·따옴표·구두점 포함). 왼쪽은 반드시 **원문 축자**이고 원문은 항상 옳다고 가정하라.",
      "- 마커는 정확히 3개, 각 마커 안은 '올바름|틀림' 2개(파이프 1개 필수·빈 값 금지), slots 의 correct·wrong 은 마커 좌·우와 축자 동일.",
      "",
      "## 조합 선지 검산",
      "- 선지 5개·라벨 ①②③④⑤ 순서. 각 선지 값은 (A)(B)(C) 순 3개이고 각 값은 그 네모의 두 후보 중 하나와 **축자로 완전히** 같아야 한다(제3의 표현 금지·동일 조합 중복 금지).",
      "- 조합표는 기출 형태로 짜라: **정답(세 자리 전부 옳음) 1개 + 한 자리만 틀린 near-miss 3개((A)만 틀림·(B)만 틀림·(C)만 틀림) + 두 자리 이상 틀린 1개**. answer 는 전부-옳은 그 선지 라벨이다.",
      "- 조합표를 쓴 뒤 **한 네모씩 가리고 읽어라**: 두 네모만 풀어도 답이 하나로 좁혀지거나, 어떤 값이 5선지 중 한 곳에만 등장하면 그 문항은 결합형이 아니다 — 위 형태로 고쳐라.",
      "",
      "## 해설·오답 검산",
      "- 해설은 한국어 합쇼체 2문장, (A)→(B)→(C) 세 자리를 전부 설명하고 끝난다(마지막 라벨만 적고 끊기면 절단으로 반려). 본문에 '정답:' 라인 금지.",
      // 26-08-18 O225 해설 다이어트
      "- 해설 분량: 정답 해설은 위 2문장 안에서 세 네모의 판정 근거(어떤 규칙으로 옳은지)만, 오답 해설은 딱 1문장(어느 값이 왜 틀렸는지만). \"학생이 ~로 잘못 고르기 쉽다\" 같은 유혹·심리 서사는 쓰지 마라 — 짧을수록 좋다.",
      "- 구조 서술(선행사 위치·주어의 핵·수식 관계)은 지문을 다시 읽고 **사실만** 써라. '원문의 X를 Y로 바꿨다' 같은 변형 과정 서술 금지.",
      "- **that 규칙 정본**: that 은 선행사 없이도 명사절(주어절·목적어절)을 이끈다 — 'that 은 선행사 없이 명사절을 이끌 수 없다/명사절을 만들지 못한다'고 쓰면 사실 오류다. that↔what 자리는 **뒤 절에 주어·목적어가 결손인지**로만 설명하라. 인지·단언 동사 뒤의 that 을 '목적격 관계대명사'라 부르거나 '목적어가 빠졌다'고 쓰는 것도 금지다(뒤 절이 완전하고 what 을 넣으면 잉여 명사구가 생긴다고 써라).",
      "- wrong 은 정답 라벨을 제외한 4개 선지에 정확히 하나씩(라벨 중복·누락·정답 라벨 포함·빈 본문 전부 반려).",
      "- **오답해설 라벨 귀속 검산**: 오답해설을 쓸 때 그 선지의 값 3개를 (A)(B)(C)와 하나씩 대조해 **틀린 값이 든 라벨만** 지적하고 그 틀린 값을 그대로 인용하라(예: \"(A)의 'environmentally'는 …\"). 그 선지에서 옳은 값이 든 라벨을 오류로 적거나 라벨과 설명 내용을 맞바꾸면 학생이 해설로 자기 답을 대조할 수 없다 — 쓴 직후 라벨↔값을 한 번 되읽어 확인하라.",
      "- 해설·오답 해설은 한국어(지문 표현 인용만 영어 허용), 합쇼체(-습니다)로 통일.",
      ...teacherBlock,
    ].join("\n");
  },

  parseAndGate(text, ctx): MdLaneParsed {
    try {
      const raw = JSON.parse(text) as {
        markedPassage?: string;
        slots?: Array<{ label?: string; correct?: string; wrong?: string; code?: string }>;
        options?: Array<{ label?: string; values?: unknown[] }>;
        answer?: string;
        explanation?: string;
        wrong?: Array<{ label?: string; text?: string }>;
      };
      const answer = String(raw.answer ?? "").trim();
      const corrections: string[] = [];

      // 코어스 1 — slots 배열을 라벨 오름차순으로(값 계약이 라벨축이라 무손실).
      const slotsIn = (Array.isArray(raw.slots) ? raw.slots : []).map((s) => ({
        label: String(s?.label ?? "").trim(),
        correct: String(s?.correct ?? "").trim(),
        wrong: String(s?.wrong ?? "").trim(),
        code: String(s?.code ?? "").trim().toLowerCase(),
      }));
      const slotsSorted = [...slotsIn].sort((a, b) => a.label.localeCompare(b.label));
      if (slotsSorted.map((s) => s.label).join("") !== slotsIn.map((s) => s.label).join("")) {
        corrections.push("원형·포인트 항목을 라벨 오름차순으로 정렬");
      }

      let q: MdComboQuestion = {
        kind: "combo",
        markedPassage: String(raw.markedPassage ?? "").trim(),
        slots: slotsSorted,
        options: (Array.isArray(raw.options) ? raw.options : []).map((o) => {
          const values = (Array.isArray(o?.values) ? o.values : [])
            .map((v) => String(v ?? "").trim())
            .filter(Boolean);
          return {
            label: String(o?.label ?? "").trim(),
            text: values.join(COMBO_MD_VALUE_JOINER),
            values,
          };
        }),
        answer,
        explanation: String(raw.explanation ?? "").trim(),
        // md 파서와 동일 관용: 오답 목록에 정답 라벨이 끼면 걸러낸다(결손은 게이트가
        // 라벨 집합 대조로 진단). 이어 라벨 오름차순 정렬(표시 결정론) — 코어스 3.
        wrong: (Array.isArray(raw.wrong) ? raw.wrong : [])
          .map((w) => ({
            label: String(w?.label ?? "").trim(),
            text: String(w?.text ?? "").trim(),
          }))
          .filter((w) => w.label && w.label !== answer)
          .sort((a, b) => a.label.localeCompare(b.label)),
      };

      // 코어스 2 — 라벨 등장순 재번호(마커·메타·선지 값 순열·해설 언급 동기 치환).
      const rn = renumberComboByAppearance(q);
      if (rn.renumbered) {
        corrections.push("네모 라벨을 지문 등장순 (A)(B)(C) 로 재번호(선지 값·해설 동기 치환)");
        q = rn.question;
      }

      // 레인 스냅 재사용 — 마커 진실원 보정·선지 값 표기 정규화(0원, 보수 가드).
      const snapped = autoSnapComboSlots(q, ctx.passage);
      q = snapped.question;

      const allIssues = (x: MdComboQuestion): string[] => [
        ...gateMdCombo(x, ctx.passage, {
          slotCount: COMBO_MD_SLOT_COUNT,
          optionCount: COMBO_MD_OPTION_COUNT,
        }),
        ...teacherPointIssues(x, ctx),
      ];

      // 코어스 4 — 후보쌍 공통 토큰 트리밍. 좁힌 뒤 게이트를 다시 돌려 이슈가
      // 늘지 않을 때만 채택한다(누설 3분기·주격 관계사 준동사 축이 좁은 후보에서
      // 새로 울릴 수 있다 — 형식 개선이 판정 확정성을 깎으면 1순위 사다리 위반).
      let gateIssues = allIssues(q);
      const t = trimSharedCandidateTokens(q);
      if (t.trimmed.length > 0) {
        const after = allIssues(t.question);
        if (after.length <= gateIssues.length) {
          corrections.push(
            `네모 ${t.trimmed.join("")} 후보쌍의 공통 토큰을 상자 밖으로 트리밍(기출 형식 — 변별 토큰만 가둔다)`,
          );
          q = t.question;
          gateIssues = after;
        }
      }

      return {
        question: q,
        gateIssues,
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

  // md 표면 동형 순서: 네모지문 → 선지 → 정답 → 해설 → 오답.
  // slots(원형·포인트 메타)는 침묵 — 학생 표면이 아니다(SPEC §2 bridgeSpecs).
  // 값 구분은 다중 빈칸 브릿지의 " ┃ " 관례를 따른다(원소별 prefix 계약상 " …… "
  // 를 쓰면 첫 값 앞에도 붙어 표면이 깨진다).
  bridgeSpecs: [
    { path: "markedPassage", prefix: "네모지문:\n", suffix: "\n" },
    { path: "options[].label", prefix: "\n" },
    { path: "options[].values[]", prefix: " ┃ " },
    { path: "answer", prefix: "\n\n정답: " },
    { path: "explanation", prefix: "\n해설: ", suffix: "\n" },
    { path: "wrong[].label", prefix: "\n" },
    { path: "wrong[].text", prefix: " " },
  ] satisfies LunaBridgeFieldSpec[],

  renderEvalSurface(aiQuestion, passage): string {
    // 어댑터 산출(aiQuestion)로부터 학생 시험 표면을 렌더한다 — 후처리
    // processGrammarChoiceCombo 의 렌더 규칙 등가: 원 지문의 올바른 표현 자리를
    // "(A) [좌 / 우]" 네모로 치환(좌우는 해시 배치), 선지는 "① a - b - c".
    const direction =
      typeof aiQuestion.direction === "string" && aiQuestion.direction.trim()
        ? aiQuestion.direction
        : COMBO_MD_DIRECTION;
    const slots = Array.isArray(aiQuestion.slots)
      ? (aiQuestion.slots as Array<Record<string, unknown>>)
      : [];
    let body = "";
    let cursor = 0;
    const unplaced: string[] = [];
    for (const slot of slots) {
      const label = String(slot.label ?? "");
      const correct = String(slot.correctExpression ?? "");
      const wrongExpr = String(slot.wrongExpression ?? "");
      if (!correct) continue;
      const [left, right] = evalCandidateOrder(correct, wrongExpr);
      const box = `${label} [${left} / ${right}]`;
      // ⚠ 계기 정합(SPEC §5-2): 단순 indexOf 는 후보가 한 단어일 때(트리밍 코어스
      // 이후의 정상 형태다) 지문 앞쪽의 동형 토큰에 먼저 걸려 네모를 엉뚱한 자리에
      // 찍는다 — 감수 패널이 실물과 다른 문항을 보게 되는 판정 오염이다. 어댑터가
      // 실어 준 surroundingText(±45자 창)를 앵커로 삼고, 창 중앙에 가장 가까운
      // 후보 등장 위치를 고른다. 창이 안 잡히면 기존 순차 탐색으로 폴백한다.
      const around = String(slot.surroundingText ?? "");
      let idx = -1;
      const base = around ? passage.indexOf(around) : -1;
      if (base >= 0) {
        const center = around.length / 2;
        let best = -1;
        let bestDist = Number.POSITIVE_INFINITY;
        for (let p = around.indexOf(correct); p >= 0; p = around.indexOf(correct, p + 1)) {
          const dist = Math.abs(p + correct.length / 2 - center);
          if (dist < bestDist) {
            bestDist = dist;
            best = p;
          }
        }
        if (best >= 0 && base + best >= cursor) idx = base + best;
      }
      if (idx < 0) idx = passage.indexOf(correct, cursor);
      if (idx < 0) {
        unplaced.push(box);
        continue;
      }
      body += passage.slice(cursor, idx) + box;
      cursor = idx + correct.length;
    }
    body += passage.slice(cursor);
    if (unplaced.length > 0) body += `\n[위치 미확정 네모] ${unplaced.join(" ")}`;
    const optionLines = Array.isArray(aiQuestion.options)
      ? (aiQuestion.options as Array<Record<string, unknown>>)
          .map((o) => {
            const label = String(o.label ?? "");
            const circled = COMBO_CIRCLED[Number(label) - 1] ?? label;
            const text =
              typeof o.text === "string" && o.text.trim()
                ? o.text
                : Array.isArray(o.slotValues)
                  ? (o.slotValues as unknown[]).map(String).join(COMBO_OPTION_JOINER)
                  : "";
            return `${circled} ${text}`;
          })
          .join("\n")
      : "";
    return `${direction}\n\n${body}\n\n${optionLines}`;
  },
};
