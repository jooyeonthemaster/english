// ============================================================================
// 무관한 문장(IRRELEVANT) 0원 결정형 게이트 — LLM 콜 없음. 빈 배열이면 클린.
// 견본: parser-antonym.ts 의 gateMdAntonym / 분리 선례: gate-order.ts(500줄 규약)
//
// 설계 원칙(규범 §1-B 철칙 5): 모든 메시지는 **자리를 지목한다**. 이 문구가 그대로
// `[반려 재생성]` 프롬프트 피드백으로 실려 재생성 성공률을 가른다.
//
// 프로덕션 검증기(validators/irrelevant.ts)가 error 로 판정하는 축을 md 단계로
// 앞당겨 이식했다 — md 레인은 validateQuestionQuality 결과를 차단하지 않고 기록만
// 하므로, 여기서 안 잡으면 결함 문항이 그대로 저장된다.
// ============================================================================

import {
  containsComparableSentence,
  contentTokens,
  countTokenOverlap,
  splitPassageSentences,
} from "@/lib/question-quality/core";
import {
  findAbsentExternalSettingCue,
  findComparablePassageSentenceIndex,
  findNewCounterclaimCue,
  findNewExtremeCue,
  findPrescriptiveGiveawayCue,
} from "@/lib/question-quality/validators/irrelevant";
import { normalizeWs } from "./parser";
import {
  collectIrrelevantMarks,
  comparableIrrelevantSentence,
  describeUnrecognizedIrrelevantMark,
  reconstructIrrelevantPassage,
  type MdIrrelevantQuestion,
} from "./parser-irrelevant";
import type { MdDifficulty } from "./prompts";

export interface MdIrrelevantGateOptions {
  /** 번호 슬롯 수(5~10) — resolved.irrelevantSlotCount */
  slotCount?: number;
  /** KILLER 전용 노출 단서 검사 분기(프로덕션 검증기와 동일 조건) */
  difficulty?: MdDifficulty;
  /** answer-only 모드면 오답해설 개수 검사를 끈다 */
  requireWrong?: boolean;
}

/**
 * 조언 단서 — validators/irrelevant.ts 가 KILLER error 로 잡는 축인데 그 파일 안에
 * 인라인이라 export 가 없다(그 파일은 FROZEN 이라 export 추가 불가). 같은 판정을
 * md 단계에서 먼저 내리기 위해 **최소 복제**한다. 지문이 이미 조언 어투(must/should)
 * 를 쓰면 발화하지 않는 passage-gated 규칙까지 그대로 옮겼다.
 */
const ADVICE_CUE_RE =
  /\b(?:designers?|managers?|users?|students?|teachers?|people|companies|individuals?|readers?|scientists?|researchers?|one|we|you)\s+(?:must|should|need\s+to|have\s+to|ought\s+to)\b/i;
const PASSAGE_ADVICE_REGISTER_RE = /\b(?:must|should|ought\s+to)\b/i;

/**
 * 방법론·측정·도구 드리프트 — 실측 최빈 자동탈락 패턴("가장 흔한 실수",
 * question-prompts-mc.ts:IRRELEVANT). 전부 passage-gated — 지문 자체가 그 어투면
 * 발화하지 않는다.
 *
 * ⚠ **프로덕션 9패턴 전량을 문자 그대로 복제한다.** 이전 판은 5패턴만 옮기면서
 *   옮긴 패턴 내부까지 좁혀 놓아(`system`·`important`·`mechanisms?|tutorials?` 탈락)
 *   프로덕션이 error(irrelevant-methodology-drift)로 잡는 삽입문이 md 게이트를
 *   통과해 그대로 저장됐다 — md 레인은 validateQuestionQuality 결과를 차단하지 않고
 *   기록만 하므로 여기서 안 잡으면 결함이 출하된다.
 *   원본: `src/lib/question-quality/validators/irrelevant.ts` 의
 *   `methodologyDriftPatterns`(FROZEN 파일 · 함수 내부 인라인이라 import 불가).
 *   scripts/_test-md-irrelevant.ts 가 원본 소스를 읽어 라벨·정규식 문자열을
 *   전수 대조하므로, 원본이 바뀌면 픽스처가 즉시 깨진다(유지보수 포크 방지).
 */
export const METHODOLOGY_DRIFT_PATTERNS: Array<[string, RegExp]> = [
  ["procedure/process requires", /\b(?:the\s+)?(?:procedure|process|method|technique|protocol|system|approach)\s+(?:requires|involves|demands|entails|relies\s+on|depends\s+on)\b/i],
  ["it is essential/necessary to", /\bit\s+is\s+(?:essential|necessary|crucial|vital|important|imperative)\s+to\b/i],
  ["methodology gerund lead", /^(?:in\s+\w+,?\s+|while\s+[^,]+,\s+)?(?:measuring|optimi[sz]ing|calculating|quantifying|standardi[sz]ing|categori[sz]ing|catalogu?ing|indexing|monitoring|storing|organi[sz]ing|tracking)\b/i],
  ["to measure/optimize/...", /\bto\s+(?:measure|optimi[sz]e|calculate|quantify|standardi[sz]e|categori[sz]e|monitor|index|catalog|track)\b/i],
  ["measure/track the precise/exact", /\b(?:measure|track|calculate|monitor|quantify)\s+(?:the\s+)?(?:precise|exact|accurate)\b/i],
  ["requires precise/sufficient/advanced", /\brequires?\s+(?:the\s+)?(?:precise|exact|sufficient|accurate|advanced|specialized|highly|careful)\b/i],
  ["laboratory/equipment drift", /\b(?:laborator|lab)\w*\s+(?:equipment|procedures?|techniques?|settings?)\b/i],
  ["automated tracking/tooling", /\bautomat(?:ed|ically)\s+(?:track|monitor|catalog|index|record)\w*\b/i],
  ["develop/build tools/equipment", /\b(?:develop|building|build|design|implement|install)\w*\s+\w*\s*(?:tools?|equipment|software|systems?|infrastructure|mechanisms?|tutorials?|dashboards?|devices?)\b/i],
];

/** 해설 산문의 번호 지칭 — 실측 최다 결함(해설이 다른 번호를 부르면 문항 무효). */
const CIRCLED_IN_PROSE_RE = /[①-⑳]/;

function findMethodologyDrift(sentence: string, passage: string): string | null {
  const hit = METHODOLOGY_DRIFT_PATTERNS.find(
    ([, re]) => re.test(sentence) && !re.test(passage),
  );
  return hit ? hit[0] : null;
}

/**
 * 슬롯이 문장 정확히 하나인가 — 융합(두 문장 이어붙임)·미완결 절단을 잡는다.
 *
 * ⚠ 스플리터는 문장 **내부** 마침표(Dr. · U.S. · e.g.)에서도 쪼개므로, 지문 축자
 *   문장인데 false 가 나올 수 있다. 그 경우에도 후처리(processIrrelevant)가 같은
 *   스플리터 풀에 슬롯을 스냅하며 문장을 잘라 버리므로 반려 자체는 맞다 — 다만
 *   메시지가 "두 문장을 이어붙였다"만 말하면 모델이 이행할 방법이 없다.
 *   실제 원인 후보를 함께 적고 **행동**(다른 문장을 골라라)을 지시한다(철칙 5).
 */
function isSingleSentence(text: string): boolean {
  if (!/[.!?]["'”’)\]]*$/.test(text.trim())) return false;
  return splitPassageSentences(text, { includeShort: true }).length === 1;
}

/**
 * 슬롯이 **후처리 문장 풀의 한 항목과 완전히 같은지**. 부분문자열 포함이 아니라
 * 완전 일치여야 한다 — 후처리(processIrrelevant)는 `splitPassageSentences` 결과만을
 * 정본 문장으로 보고 슬롯을 그 조각에 스냅하므로, 풀에 없는 문장은 축자여도
 * 잘려 나가거나(약어 `Dr.`) 지문에서 통째로 사라진다(소수점 `3.5` — 스플리터가 그
 * 앞 조각을 아예 만들지 못한다). 포함 매칭으로 통과시키면 게이트 CLEAN 인 문항이
 * 잘린 선지 + 문장이 빠진 지문으로 학생에게 나간다("설계=표면" 단정 반증 실측).
 */
function findExactPassageSentenceIndex(
  passageSentences: string[],
  slotText: string,
  used: Set<number>,
): number {
  const key = comparableIrrelevantSentence(slotText);
  if (!key) return -1;
  for (let i = 0; i < passageSentences.length; i += 1) {
    if (used.has(i)) continue;
    if (comparableIrrelevantSentence(passageSentences[i]) === key) return i;
  }
  return -1;
}

/** 0원 결정형 게이트 — 빈 배열이면 클린. */
export function gateMdIrrelevant(
  q: MdIrrelevantQuestion,
  passage: string,
  options?: MdIrrelevantGateOptions,
): string[] {
  const slotCount = options?.slotCount ?? q.slots.length;
  const difficulty = options?.difficulty ?? "KILLER";
  const requireWrong = options?.requireWrong !== false;
  const v: string[] = [];

  // ── #1 개수 — 어긋나면 이후 검사가 전부 무의미하므로 즉시 반려 ────────────
  if (!q.numberedPassage) return ["번호지문 누락"];
  const marks = collectIrrelevantMarks(q.numberedPassage);
  if (marks.length !== slotCount) {
    const base = `번호 마커 ${marks.length}개 (${slotCount}개 필요)`;
    // 철칙 5 — 개수만 알려주면 모델은 어디를 고칠지 알 수 없다. 인식 실패한 `[[` 를 지목한다.
    const miss = describeUnrecognizedIrrelevantMark(q.numberedPassage);
    return [
      miss
        ? `${base} — '[[' 는 ${miss.openers}곳인데 ${miss.recognized}곳만 마커로 인식됐다. 인식 실패 지점: '${miss.snippet}' (마커는 '[[번호:문장 전체]]' 형식이어야 하고 반드시 ']]' 로 닫아야 한다)`
        : base,
    ];
  }
  if (q.slots.length !== slotCount) {
    return [`번호 문장 ${q.slots.length}개 (${slotCount}개 필요)`];
  }

  // ── #2 라벨이 지문 등장순 1..N ────────────────────────────────────────────
  const expected = Array.from({ length: slotCount }, (_, i) => String(i + 1));
  const actual = q.slots.map((s) => s.label);
  if (actual.join(",") !== expected.join(",")) {
    v.push(
      `번호가 지문 등장순 1~${slotCount} 가 아님 — 실제 ${actual.join(",") || "없음"}`,
    );
  }

  // ── #3 정답 — `정답:` 줄이 유일 진실원 ───────────────────────────────────
  const answerIndex = q.slots.findIndex((s) => s.label === q.answer);
  if (!q.answer) {
    v.push("정답 누락 — 무관 문장의 번호를 `정답:` 줄에 적어라");
  } else if (answerIndex < 0) {
    v.push(`정답 번호(${q.answer})가 번호 문장에 없음`);
  } else if (answerIndex === 0 || answerIndex === slotCount - 1) {
    v.push(
      `정답이 첫/마지막 번호(${q.answer}번) — 무관 문장은 가운데 번호(2~${slotCount - 1})에 넣어라`,
    );
  }

  // ── #4 ★ 지문 재구성 대조 — 이 유형 최강 방어선 ──────────────────────────
  // 무관 문장을 들어내고 마커를 걷어낸 결과가 원 지문과 완전히 일치해야 한다.
  // 마커 밖 무단 편집 · 비정답 슬롯 변형 · 원문 문장 유실을 한 번에 잡는다.
  if (q.answer && answerIndex >= 0) {
    const rebuilt = reconstructIrrelevantPassage(q.numberedPassage, q.answer);
    if (normalizeWs(rebuilt) !== normalizeWs(passage)) {
      v.push(
        "지문 재구성 불일치 — 무관 문장을 들어낸 번호지문이 원 지문과 다름(마커 밖 텍스트를 고쳤거나 원문 문장을 지웠거나 표시 문장을 변형함)",
      );
    }
  }

  // ── #5·#6 슬롯 판정 — 형식(문장 하나·중복) + 비정답 축자·첫 문장·등장 순 ───
  // 판정 축은 **후처리(processIrrelevant)가 쓰는 문장 풀과 같은 축**이다. 후처리는
  // splitPassageSentences 결과만을 정본 문장으로 보고 슬롯을 그 조각에 스냅하므로,
  // 풀 항목과 완전히 같지 않은 슬롯은 축자여도 학생 표면에서 잘리거나 사라진다.
  // 슬롯 하나에 메시지 하나만 남긴다(재생성 피드백이 중복 문구로 흐려지지 않게):
  //   문장 하나로 안 잘림 → #5 문구 / 잘리긴 하는데 풀과 불일치 → #6 경계 문구.
  const passageSentences = splitPassageSentences(passage, { includeShort: true });
  const seen = new Set<string>();
  const used = new Set<number>();
  const sourceIndices: number[] = [];
  const sourceTexts: string[] = [];
  for (const slot of q.slots) {
    if (!slot.text) {
      v.push(`${slot.label}번 문장 누락`);
      continue;
    }
    const key = comparableIrrelevantSentence(slot.text);
    if (key && seen.has(key)) v.push(`${slot.label}번 문장이 다른 번호와 중복`);
    if (key) seen.add(key);

    const single = isSingleSentence(slot.text);
    if (!single) {
      // 행동 지시는 슬롯 성격에 맞춰 갈라야 한다 — 삽입 슬롯에 "다른 문장을 골라라"는
      // 맞지 않는다(네가 쓴 문장이지 지문에서 고른 문장이 아니다).
      const action =
        slot.label === q.answer
          ? "무관 문장은 한 문장이어야 한다 — 약어·소수점 마침표를 피해 다시 써라"
          : "후자라면 그 문장은 표시 대상에서 빼고 다른 문장을 골라라";
      v.push(
        `${slot.label}번이 문장 하나가 아님(두 문장을 이어붙였거나, 종결 부호가 빠졌거나, 문장 안에 약어·소수점 마침표(Dr. · U.S. · 3.5)가 있어 시스템이 경계를 잡지 못함): '${slot.text.slice(0, 60)}' — ${action}`,
      );
    }
    // 정답(삽입) 슬롯은 축자 검사 대상이 아니다. 정답 번호를 못 읽은 상태에서 돌리면
    // 삽입 문장을 "축자 아님"으로 지목해 엉뚱한 피드백을 준다(#3 이 먼저 지목한다).
    if (answerIndex < 0 || slot.label === q.answer) continue;
    sourceTexts.push(slot.text);
    const idx = findExactPassageSentenceIndex(passageSentences, slot.text, used);
    if (idx === -1) {
      if (!single) continue; // #5 가 이미 이 슬롯을 지목했다.
      v.push(
        findComparablePassageSentenceIndex(passageSentences, slot.text, used) === -1
          ? `${slot.label}번이 지문 축자 문장이 아님(요약·패러프레이즈·결합 금지): '${slot.text.slice(0, 60)}'`
          : `${slot.label}번이 지문 문장 경계와 어긋남 — 축자이긴 하나 문장 안에 약어·소수점 마침표(Dr. · U.S. · 3.5)가 있어 시스템이 이 문장을 하나로 자르지 못한다. 이 문장은 표시 대상에서 빼고 다른 문장을 골라라: '${slot.text.slice(0, 60)}'`,
      );
      continue;
    }
    used.add(idx);
    sourceIndices.push(idx);
    if (idx === 0) {
      v.push(
        `${slot.label}번이 지문 첫 문장 — 도입문은 판단 기준점이라 번호를 붙이면 안 된다`,
      );
    }
  }
  if (
    sourceIndices.length === slotCount - 1 &&
    sourceIndices.some((idx, i) => i > 0 && idx <= sourceIndices[i - 1])
  ) {
    v.push("표시 문장이 원문 등장 순서가 아님 — 번호는 지문에 나온 순서대로 붙여라");
  }

  // ── #7 분산 — 앞부분에 몰아 고르는 실측 결함(fast 규칙 3) ────────────────
  if (passageSentences.length >= 8 && sourceIndices.length > 0) {
    const lastThird = Math.floor((passageSentences.length * 2) / 3);
    if (Math.max(...sourceIndices) < lastThird) {
      v.push(
        `표시 문장이 지문 앞쪽에 몰려 있음 — 지문 뒤쪽 1/3(문장 ${lastThird + 1}번 이후)에서 최소 1문장을 표시하라`,
      );
    }
  }

  // ── #8 삽입 문장 검사 ────────────────────────────────────────────────────
  const inserted = answerIndex >= 0 ? q.slots[answerIndex].text : "";
  if (inserted) {
    v.push(...gateInsertedSentence(inserted, passage, sourceTexts, difficulty));

    // 인접 앵커 — 무관 문장 바로 앞 문장도 표시 문장이어야 후처리 렌더가 설계와
    // 같은 자리에 문장을 끼운다(buildSpreadMarkedPassage 는 "직전 슬롯의 원문
    // 위치" 뒤에 삽입한다). 이걸 놓치면 md 설계와 학생 표면이 어긋난다.
    const markPos = marks.findIndex((m) => m.label === q.answer);
    if (markPos > 0) {
      const prev = marks[markPos - 1];
      const gap = q.numberedPassage.slice(
        prev.index + prev.length,
        marks[markPos].index,
      );
      if (!/^[\s.!?"'”’)\]]*$/.test(gap)) {
        v.push(
          `무관 문장 바로 앞 문장에 번호가 없음 — 앞 문장도 표시 문장이어야 한다(사이 텍스트: '${normalizeWs(gap).slice(0, 60)}')`,
        );
      }
    }
  }

  // ── #9 해설·오답해설 ─────────────────────────────────────────────────────
  if (!q.explanation) {
    v.push("해설 누락");
  } else if (CIRCLED_IN_PROSE_RE.test(q.explanation)) {
    v.push(
      "해설 본문이 문장을 번호(①②③)로 지칭함 — 번호가 어긋나면 문항이 무효가 된다. 내용 인용으로 지칭하라",
    );
  }

  const wrongNeeded = slotCount - 1;
  if (requireWrong) {
    if (q.wrong.length !== wrongNeeded) {
      v.push(`오답해설 ${q.wrong.length}개 (${wrongNeeded}개 필요)`);
    }
    const wrongLabels = new Set(q.wrong.map((w) => w.label));
    const missing = expected.filter(
      (label) => label !== q.answer && !wrongLabels.has(label),
    );
    if (q.answer && missing.length > 0) {
      v.push(`오답해설이 없는 번호: ${missing.join(",")}`);
    }
    if (q.wrong.some((w) => CIRCLED_IN_PROSE_RE.test(w.text))) {
      v.push("오답해설 본문이 문장을 번호(①②③)로 지칭함 — 내용 인용으로 지칭하라");
    }
  }
  if (q.answer && q.wrong.some((w) => w.label === q.answer)) {
    v.push("오답해설에 정답 번호 포함");
  }

  return v;
}

/**
 * 삽입 문장(정답 자리) 전용 검사 — 프로덕션 validators/irrelevant.ts 의 error 축을
 * md 단계로 앞당긴 것. KILLER 전용 검사는 프로덕션과 **동일 조건**으로 건다
 * (md 만 엄격해지면 fast 와 판정이 갈려 포렌식이 오염된다).
 */
function gateInsertedSentence(
  inserted: string,
  passage: string,
  sourceTexts: string[],
  difficulty: MdDifficulty,
): string[] {
  const v: string[] = [];

  // 삽입문 신규성 — 지문에 이미 있는 문장이면 "무관 문장"이 아니다.
  // 프로덕션 irrelevant-answer-from-source 와 **같은 판정 함수**를 쓴다.
  if (containsComparableSentence(passage, inserted)) {
    v.push(
      "정답 자리 문장이 지문에 이미 있는 문장임 — 무관 문장은 네가 새로 쓴 문장이어야 한다",
    );
  }

  // 어휘 정박 — 지문·주변 문장과 내용어를 거의 안 나누면 훑기만으로 들킨다.
  const insertedTokens = contentTokens(inserted);
  const sourceOverlap = countTokenOverlap(
    insertedTokens,
    contentTokens(sourceTexts.join(" ")),
  );
  const passageOverlap = countTokenOverlap(insertedTokens, contentTokens(passage));
  // 임계 완화(26-07-27 실사용 과잉차단 실측): 표시문장 겹침 2개 요구는 과했다.
  // 무관 문장은 정의상 **다른 얘기**라 주변 문장과 내용어가 많이 겹칠 수 없다.
  // 지문 전체와의 정박(2개)은 유지하고, 표시문장 겹침은 1개로 낮춘다 — 0개면
  // 정말 아무 관계 없는 문장이라 훑기로 들키는 게 맞다.
  if (passageOverlap < 2 || sourceOverlap < 1) {
    v.push(
      `무관 문장이 지문과 내용어를 거의 공유하지 않음(지문 ${passageOverlap}개·표시문장 ${sourceOverlap}개, 지문 2개·표시문장 1개 이상 필요) — 주변 문장의 단어를 재사용해 표면을 위장하라`,
    );
  }

  // 문체 정합 — 길이가 튀면 읽기 전에 들킨다.
  const avgSourceLength =
    sourceTexts.reduce((sum, t) => sum + t.length, 0) / Math.max(1, sourceTexts.length);
  if (
    avgSourceLength > 0 &&
    (inserted.length < avgSourceLength * 0.45 || inserted.length > avgSourceLength * 1.8)
  ) {
    v.push(
      `무관 문장 길이가 주변 문장과 어긋남(${inserted.length}자 · 표시문장 평균 ${Math.round(avgSourceLength)}자) — 길이·문체를 맞춰라`,
    );
  }

  // 역접 시작 — 난이도 무관 실측 fatal("However + 반대 주장"은 훑기로 뚫린다).
  if (/^\s*(?:however|yet|instead|in\s+contrast|on\s+the\s+contrary|conversely|nevertheless|nonetheless)\b/i.test(inserted)) {
    v.push(
      "무관 문장이 역접 연결어로 시작함 — 훑어읽기만으로 들킨다. 같은 방향인 척하는 문장으로 다시 써라",
    );
  }

  if (difficulty !== "KILLER") return v;

  // 임계 완화(26-07-27 실사용 과잉차단 실측): 0.25 는 도달 불가에 가까웠다 —
  // 실제 모델 산출이 0.04·0.13 으로 **두 번 다** 반려되고 문항이 죽었다.
  // 무관 문장은 주변과 소재만 공유하고 논지는 어긋나야 하므로 어휘 겹침이 본질적으로
  // 낮다. 훑기로 들키는 수준(겹침 거의 0)만 막고 나머지는 프롬프트 공예에 맡긴다.
  const ratio = sourceOverlap / Math.max(1, insertedTokens.size);
  if (ratio < 0.1) {
    v.push(
      `무관 문장에 새 어휘가 너무 많음(표시문장과 겹치는 비율 ${ratio.toFixed(2)} < 0.10) — 재료를 지문에서 빌려 와라`,
    );
  }

  const extreme = findNewExtremeCue(inserted, passage);
  if (extreme) v.push(`무관 문장에 지문에 없는 극단어 사용: '${extreme}'`);

  const counterclaim = findNewCounterclaimCue(inserted, passage);
  if (counterclaim) v.push(`무관 문장이 노골적 반론 단서로 노출됨: '${counterclaim}'`);

  const prescriptive = findPrescriptiveGiveawayCue(inserted);
  if (prescriptive) v.push(`무관 문장이 처방·조언 단서로 노출됨: '${prescriptive}'`);

  if (ADVICE_CUE_RE.test(inserted) && !PASSAGE_ADVICE_REGISTER_RE.test(passage)) {
    v.push(
      "무관 문장이 '주체 + must/should/need to' 조언문 — 서술 지문의 어투에서 벗어나 즉시 들킨다",
    );
  }

  const methodology = findMethodologyDrift(inserted, passage);
  if (methodology) {
    v.push(`무관 문장이 방법론·측정·도구 화제로 샘: '${methodology}'`);
  }

  const external = findAbsentExternalSettingCue(inserted, passage);
  if (external) {
    v.push(`무관 문장이 지문에 없는 새 무대·소재를 끌어옴: '${external}'`);
  }

  return v;
}
