// ============================================================================
// 네모 어법(GRAMMAR_CHOICE_COMBO) md 프롬프트 — 정본(빈칸·어법) 7블록 골격의 이식본.
// 견본: prompts-antonym.ts / 정본: prompts.ts(buildMdGrammarPrompt·buildMdMultiBlankPrompt)
// 계약 문서: docs/md-qgen-type-expansion-spec.md §4-3 · md-qgen-recon-synthesis.md §3-B
//
// 왜 이 유형이 md 로 와야 하는가(실장애): 구형 경로는 어법 프리미엄 사다리와
// 다단 검수리를 태워 250~271s 를 먹고 270s 데드라인에 클램프돼 "생성 실패"로
// 끝났다. md 는 단일 콜 + 0원 결정형 게이트라 그 사다리 전체가 사라진다.
//
// 공예 서사의 출처: question-prompts-mc.ts:235-308(GRAMMAR_CHOICE_COMBO 실전
// 지시 — 출제철학·슬롯선정·wrong 11종 변형·약한 네모 금지·정동사 자리 금지·
// 조합 믹스 규칙)을 md 공예 문체로 증류했다. 콤보는 어법 사다리 대상이 아니라
// A등급 실물 코퍼스가 없으므로(정찰 §3-B B-3), few-shot 은 "실물 지문 복제"가
// 아니라 **설계 해부**로 쓴다 — 규칙 나열보다 해부가 공예를 끌어올린다는 것이
// 정본의 확정 결론이기 때문이다.
// ============================================================================

import type { MdDifficulty, MdExplanationMode } from "./prompts";

/** 네모 라벨 정본 — 후처리 COMBO_SLOT_LABELS(grammar-choice-combo.ts:19)와 동일 축. */
export const COMBO_MD_LABELS = ["A", "B", "C"] as const;

/** 조합 선지 라벨 정본 — 다중 빈칸과 동일한 원문자 축(어댑터가 "1"~"5"로 변환). */
export const COMBO_MD_CIRCLED = ["①", "②", "③", "④", "⑤"] as const;

/**
 * 네모 개수는 **3 고정**이다(설정 노브 없음).
 * 근거: 후처리 processGrammarChoiceCombo 가 `slots.length !== 3` 을 하드 실패로
 * 처리하고(grammar-choice-combo.ts:100-107), 검증기도 `slots.length !== 3` 을
 * error 로 잡는다(validators/grammar/combo.ts:149). resolved 설정에도 개수 키가
 * 없다(dispatchers.ts:121-136 — grammarPointFocus 단독). 다른 값이 들어오면
 * md 가 만들어 봐야 후처리에서 죽으므로, 여기서 3으로 클램프하고 lane 의
 * isEligible 이 3 이외의 요청을 fast 로 되돌린다.
 */
export const COMBO_MD_SLOT_COUNT = 3;
export const COMBO_MD_OPTION_COUNT = 5;

/** 값 구분자 — 다중 빈칸 계약 리터럴과 동일(prompts.ts:198 · parser.ts:117). */
export const COMBO_MD_VALUE_JOINER = " …… ";

/**
 * 후처리 정본 joiner 는 `" - "`(grammar-choice-combo.ts:22)지만 md 단계에서는
 * 쓰지 않는다 — 후보에 하이픈(well-being · non-finite · en-dash)이 들어가면
 * 분해가 깨지기 때문이다. md 는 ` …… ` 로 받고 어댑터가 `" - "` 로 재조립한다.
 */

// 포인트 코드 닫힌 집합 — adapter.ts POINT_NAME(a~m)과 1:1.
const COMBO_MD_POINT_LIST =
  "(a)정동사·준동사 (b)관계사 (c)분사 (d)수일치 (e)능·수동태 (f)형용사·부사 (g)대명사 (h)목적격보어 (i)병렬 (j)가정법 (k)부정사·동명사 (l)전치사·접속사 (m)비교구문";

// ---------------------------------------------------------------------------
// [블록 2] few-shot 해부 — "이 설계가 아름다운 이유" 1줄 필수(정본 규약).
//
// ⚠ (C) 슬롯과 하드 포인트 풀은 pointFocus 분기다. 핵심 집중 모드가 켜지면 레인이
//   주입하는 가이드(grammar-point-catalog.ts:496)가 "병렬·비교·전치사 등은 정답으로
//   만들지 말고 디코이로만 쓰라"를 발행하는데, 네모 어법에는 디코이 자리가 없다
//   (세 네모가 전부 정답 포인트다) → (i)병렬 전면 금지가 된다. 그 상태에서 KILLER
//   분기가 {b,c,i} 중 2개를 요구하고 few-shot 이 (i)병렬을 모범으로 제시하면
//   프롬프트가 자기모순이라 모델이 둘 중 하나를 반드시 어긴다. fast 는 같은 충돌을
//   `hardPool = comboPointFocus ? ["b","c","d"] : ["b","c","i"]` 로 회피한다
//   (question-quality/candidate-blocks/grammar.ts:1140). md 도 같은 규칙을 쓴다.
// ---------------------------------------------------------------------------
type ComboPointMode = "parallel" | "focus";

const COMBO_FEWSHOT_C: Record<ComboPointMode, string> = {
  parallel: `- (C) 병렬(i) — "planners must widen trenches, add structural soil, and [ protect / protecting ] the root zone". 등위의 시작점(widen)이 세 항목 앞에 있어 네모에서 멀다. 가까운 명사구(structural soil)에 시선이 묶이면 -ing 가 그럴듯해 보인다.`,
  focus: `- (C) 관계사(b) — "planners protect the root zone, [ where / which ] a young tree stores the water it needs". 뒤따르는 절이 목적어까지 갖춘 완전한 절인지 문장 끝까지 읽어야 판정된다. 앞의 사물 선행사(the root zone)만 보면 which 가 그럴듯해 보인다.`,
};

const COMBO_FEWSHOT_WHY: Record<ComboPointMode, string> = {
  parallel: "(A)는 왼쪽의 선행사, (B)는 오른쪽의 by 행위자구, (C)는 문장 앞머리의 등위 시작점",
  focus: "(A)는 왼쪽의 선행사, (B)는 오른쪽의 by 행위자구, (C)는 관계사절이 끝나는 문장 끝",
};

function comboFewshot(mode: ComboPointMode): string {
  return `## 모범 설계 해부 — 이 수준을 재현하라 (예시의 지문·표현을 복사하지는 마라)
지문: 도시의 가로수가 열섬을 완화하지만, 뿌리가 자랄 부피가 확보되지 않으면 그 효과가 사라진다는 글.
- (A) 수일치(d) — "The benefit that these canopies [ provide / provides ] to dense blocks …". 관계절의 선행사는 멀리 있는 benefit 이 아니라 바로 앞 canopies 다. 밑줄만 보면 단수 provides 가 자연스러워 보이고, 선행사를 되짚어야만 판정된다. 두 후보 **모두 정동사**라 준동사를 놓는 즉답 함정이 아니다.
- (B) 분사 능·수동(c) — "Soil [ compacted / compacting ] by construction traffic holds little water". 뒤에 by 행위자구가 붙어 능동 분사를 고르면 곧장 비문이 된다. 학생은 "흙이 무언가를 다지고 있다"는 능동 해석을 잠깐 떠올렸다가 by 를 보고 무너진다.
${COMBO_FEWSHOT_C[mode]}
- 오답 조합 설계: ②는 (B)만 틀린 near-miss(한 자리만 검증하고 넘긴 학생을 잡는다), ③은 (A)(C) 두 자리가 틀림, ④는 (A)(B) 두 자리가 틀림, ⑤는 세 자리 전부 틀림. 세 네모의 틀린 후보가 오답 선지 전체에 최소 한 번씩 등장한다.
- 이 설계가 아름다운 이유: 세 네모의 판단 근거가 각각 **다른 방향으로 멀리** 있다 — ${COMBO_FEWSHOT_WHY[mode]}. 어느 한 요령(가까운 명사만 보기)으로도 세 개를 동시에 뚫을 수 없다.`;
}

/** KILLER 하드 포인트 풀 — fast hardPool 과 동일 규칙(pointFocus 면 i 를 d 로 치환). */
const COMBO_KILLER_HARD_POINTS: Record<ComboPointMode, string> = {
  parallel: "(b)관계사 · (c)분사 · (i)병렬",
  focus: "(b)관계사 · (c)분사 · (d)수일치",
};

/**
 * pointFocus=ON 이면 (i)병렬은 **전면 금지**다(COMBO_FOCUS_PRECEDENCE). 그런데
 * few-shot 과 하드 풀만 분기하고 **산문 예시**에 "병렬을 써라"가 남아 있으면
 * 프롬프트가 자기모순이라 모델이 금지와 권유 중 하나를 반드시 어긴다 — 교사가
 * 지정한 포인트와 경합하는 잔여 결함이었다(재검증 26-07-26 독립 프로브 실증).
 * 아래 네 자리를 모드별로 갈아 끼워 ON 경로에서 (i)병렬 권유를 전멸시킨다.
 *
 * ⚠ 남겨야 하는 "(i)병렬" 두 곳:
 *   · COMBO_MD_POINT_LIST — 포인트코드 닫힌 집합(게이트가 a~m 을 요구한다).
 *   · COMBO_FOCUS_PRECEDENCE — 금지 선언문 자체.
 */
const COMBO_PARALLEL_SLOTS: Record<
  ComboPointMode,
  { hardCap: string; longDep: string; strongSlot: string; misreadAxis: string }
> = {
  parallel: {
    hardCap: "(b)관계사 (c)분사 (i)병렬 (j)가정법",
    longDep: "긴 수식어구를 건너뛴 주어·동사 수일치, 절 경계 너머의 병렬 대상, 삽입절을 건너뛴 선행사",
    strongSlot:
      "수식어구로 분리된 주어·동사 수일치, 콤마 뒤 분사구문, 관계사 선행사 판단, 병렬 대상이 멀리 있는 등위구조, 2형식 보어, 5형식 목적격보어",
    misreadAxis: "가까운 명사에 이끌린 수일치 착각 / 능·수동 착각 / 병렬 짝 오인 등",
  },
  focus: {
    hardCap: "(b)관계사 (c)분사 (j)가정법",
    longDep:
      "긴 수식어구를 건너뛴 주어·동사 수일치, 삽입절을 건너뛴 선행사, 문장 끝까지 읽어야 절의 완전·불완전이 갈리는 관계사",
    strongSlot:
      "수식어구로 분리된 주어·동사 수일치, 콤마 뒤 분사구문, 관계사 선행사 판단, by 행위자구가 뒤따르는 분사의 태 판단, 2형식 보어, 5형식 목적격보어",
    misreadAxis: "가까운 명사에 이끌린 수일치 착각 / 능·수동 착각 / 선행사 오인 등",
  },
};

/**
 * 핵심 집중 모드에서만 붙는 우선순위 못 — 주입 가이드와 이 절이 어긋나 보일 때
 * 어느 쪽을 따를지 프롬프트 안에서 확정한다(모순 방치 = 모델이 임의 선택).
 */
const COMBO_FOCUS_PRECEDENCE = `- ⭐ 핵심 집중 모드가 켜져 있다: 뒤에 붙는 '포인트 가이드'가 "디코이로만 쓰라"고 지정한 포인트(병렬·비교·전치사·정동사 단독 등)는 이 유형에 **디코이 자리가 없으므로 세 네모 어디에도 쓰지 마라**. 이 절의 포인트 지정이 그 제한을 이미 반영한 값이니, 둘이 어긋나 보이면 이 절을 따른다.`;

// ---------------------------------------------------------------------------
// [블록 3] 표적(네모) 설계 — 난이도 3분기. BASIC / INTERMEDIATE / KILLER 전부 필수.
// ---------------------------------------------------------------------------
const COMBO_TARGET_BY_DIFFICULTY: Record<MdDifficulty, string> = {
  BASIC: `## 네모 설계 (기본 난이도)
- 세 네모는 해당 문법 개념을 알면 명확히 판정되는 자리(교과서 수준)로 고른다. 판단 근거는 네모가 속한 **절 안에서** 해결되게 하라.
- 포인트는 표준 코드 위주로 분산한다: (d)수일치 · (f)형용사·부사 · (e)능·수동태 · (k)부정사·동명사. 하드 포인트(@@HARDCAP@@)는 최대 1개.
- 그래도 "한눈에 보이는 철자 오류" 수준은 금지다 — 개념 판단은 반드시 있어야 한다.`,
  INTERMEDIATE: `## 네모 설계 (중급 난이도)
- 세 네모 중 최소 하나는 문장 구조를 한 단계 분석해야 판정되는 자리(수식어구가 낀 수일치, 절 경계 확인이 필요한 관계사)로 둔다.
- 하드 포인트(@@HARDCAP@@)는 최대 1개, 나머지는 표준 포인트로 채운다.
- 판단 근거가 네모 바로 옆에 붙어 있는 자리(주어 바로 옆 동사, 지시 대상이 인접한 대명사)는 피하라.`,
  KILLER: `## 네모 설계 — KILLER 의 생명
- 다음 중 **2개 이상**을 충족해야 KILLER 다:
  ① 세 네모 중 2개 이상이 하드 포인트(@@HARD@@)를 묻는다.
  ② 판단 근거가 네모에서 **멀리 떨어진 장거리 의존**이다 — @@LONGDEP@@.
  ③ 두 네모 이상이 틀린 오답 선지를 2개 이상 포함한다.
- 세 네모의 판단 근거가 **서로 다른 방향**(왼쪽 선행사 / 오른쪽 행위자구 / 절 경계 너머)을 향하게 배치하라. 한 요령으로 세 개가 동시에 뚫리면 킬러가 아니다.
- 금지: 주어 바로 옆 단순 수일치, who/which 단순 교체, 진행형 뒤 -ing 겹치기 같은 한눈 비문.`,
};

/** 난이도 절 + pointFocus 치환·우선순위 못. KILLER 하드 풀은 fast hardPool 과 동형이다. */
function comboTargetSection(difficulty: MdDifficulty, pointFocus: boolean): string {
  const mode: ComboPointMode = pointFocus ? "focus" : "parallel";
  const body = COMBO_TARGET_BY_DIFFICULTY[difficulty]
    .replace("@@HARD@@", COMBO_KILLER_HARD_POINTS[mode])
    .replace("@@HARDCAP@@", COMBO_PARALLEL_SLOTS[mode].hardCap)
    .replace("@@LONGDEP@@", COMBO_PARALLEL_SLOTS[mode].longDep);
  return pointFocus ? `${body}\n${COMBO_FOCUS_PRECEDENCE}` : body;
}

// ---------------------------------------------------------------------------
// [블록 4] 오답(틀린 후보) 기제 분류학 + 조합 믹스 규칙.
// ---------------------------------------------------------------------------
function comboWrongCandidateSection(difficulty: MdDifficulty, mode: ComboPointMode): string {
  const base = `## 틀린 후보 만들기 — 어간은 유지하고 형태만 변형한다
- 허용 변형 11종에서만 고른다: ①V-ing↔p.p. ②정동사↔준동사 ③that↔what ④which↔where/when ⑤단수V↔복수V ⑥형용사↔부사 ⑦능동↔수동 ⑧대명사 수·격 ⑨to부정사↔동명사 ⑩가정법 시제 ⑪전치사↔접속사.
- 🚫 금지 변형: 품사 자체를 바꾸는 변형(동사↔명사), **시제만 단독으로 바꾸는 변형**(realizes↔realized, does↔did). 시제 단독 교체는 문맥에 따라 둘 다 가능해 복수정답 시비가 된다.
- 🚫 수량 의미토글 금지: little↔a little, few↔a few, some↔any, less↔fewer 처럼 둘 다 문법적이고 의미만 다른 자리.
- **재해석 검사**: 틀린 후보를 넣은 문장을 다른 통사 해석으로도 다시 읽어라 — 명사 앞 한정 수식(p.p.가 명사를 수식하는 해석), 전치사 목적어 동명사 등 **어느 한 해석으로라도 문법이 성립하면 그 변형은 탈락**이다.
- 각 틀린 후보는 "학생이 구체적으로 무엇 때문에 그쪽으로 손이 가는가"에 답할 수 있어야 한다. 세 네모의 오인 축을 서로 다르게 하라(${COMBO_PARALLEL_SLOTS[mode].misreadAxis}).`;
  if (difficulty === "BASIC") {
    return `${base}
- 기본 난이도에서는 틀린 후보가 그 자리에서 **명백히** 어법상 틀려야 한다. 애매하면 다른 변형으로 갈아라.`;
  }
  if (difficulty === "INTERMEDIATE") {
    return `${base}
- 틀린 후보는 밑줄만 보면 그럴듯해 보이되, 문장 구조를 한 단계 분석하면 반드시 무너져야 한다.`;
  }
  return `${base}
- KILLER 에서는 틀린 후보가 **로컬로 완전히 자연스러워** 보여야 한다 — 네모 주변 대여섯 단어만 읽으면 오히려 그쪽이 맞아 보이고, 멀리 있는 단서를 추적해야만 무너지는 형태로 만들어라.`;
}

const comboWeakBoxSection = (mode: ComboPointMode) => `## ⚠ 약한 네모 금지 — 여기서 문항의 격이 결정된다
- 즉답 암기로 뚫리는 자리 금지: to부정사 전용 동사 뒤 to부정사(plan·want·decide), 동명사 전용 동사 뒤 동명사(enjoy·finish·avoid), 단순 관사, 단순 전치사, 고유명사.
- 🚫 **정동사 자리에 준동사 후보 금지**: 주격 관계대명사(who/which/that) 바로 뒤 동사 자리, 주어 바로 뒤 본동사 자리처럼 통사적으로 정동사가 강제되는 자리에는 "정동사 vs 준동사" 네모를 만들지 마라 — 준동사 후보가 한눈에 틀린 즉답 giveaway 라 변별이 0이다.
  - ❌ \`the person who [ wear / wearing ]\` · \`a device that [ measures / measuring ]\`
  - ✅ 그 자리는 **수일치**로 내라: \`[ wears / wear ]\` 처럼 **두 후보 모두 정동사**로 두고 선행사의 수를 묻는다.
- ⚠ 한 네모의 두 후보가 **둘 다 준동사**(\`[ wearing / to wear ]\`)면 정답이 없는 깨진 네모다. 정동사 자리면 두 후보 모두 정동사여야 한다.
- 강한 자리만 써라: ${COMBO_PARALLEL_SLOTS[mode].strongSlot}.
- 🚫 **누설 금지**: 네모로 만들 표현(올바른 쪽이든 틀린 쪽이든)과 같은 단어·연어가 지문의 **다른 곳에 무마킹으로 그대로 남아 있는 자리는 선택 금지**다. 같은 문장의 평행구가 남아 있으면 학생이 그것을 베껴 푼다 — 그건 문제가 아니라 답안지다.`;

function comboOptionMixSection(difficulty: MdDifficulty): string {
  const killerLine =
    difficulty === "KILLER"
      ? "\n- KILLER 는 두 네모 이상이 틀린 선지를 **2개 이상** 포함하라 — 한 자리만 확인하고 넘어가는 풀이를 원천 차단한다."
      : "";
  return `## 조합 선지 5개 — 행과 열을 모두 설계하라
- 선지마다 (A)(B)(C) 순서대로 값 3개를 "${COMBO_MD_VALUE_JOINER.trim()}" 로 연결한다(구분자 리터럴 고정, 다른 구분자 금지).
- 각 값은 그 네모의 두 후보(올바른 표현·틀린 표현) 중 **하나와 축자로 완전히 같아야** 한다. 제3의 표현을 지어내면 실격이다.
- 정답 선지는 정확히 1개 — 세 네모 전부 올바른 표현인 조합이다. 같은 조합이 두 선지에 반복되면 실격.
- 오답 4개 믹스: 한 네모만 틀린 선지 1~2개 + 두 네모가 틀린 선지 1~3개 + 세 네모 모두 틀린 선지 0~1개.
- **near-miss 필수**: 한 네모만 틀린 선지를 최소 1개 만들어라 — 학생이 세 자리를 전부 검증해야만 풀리게 하는 장치다.
- 각 네모의 틀린 후보가 오답 선지들에 **최소 1번씩은** 등장해야 한다(어느 네모의 틀린 후보도 미사용으로 남기지 마라).
- 정답 번호를 특정 자리에 몰지 마라 — ①~⑤ 중 매번 다른 자리를 고른다.${killerLine}`;
}

// ---------------------------------------------------------------------------
// [블록 6] 출력 전 자기검산 — 게이트 불변식과 1:1로 대응시킨다.
// ---------------------------------------------------------------------------
function comboSelfCheck(mode: MdExplanationMode): string {
  return [
    "## 출력 전 자기검산 (사고 안에서 수행)",
    "- 네모지문에서 마커를 **파이프 왼쪽 값(올바른 표현)** 으로 되돌린 텍스트가 원 지문과 한 글자도 다르지 않은지 확인하라 — 다르면 지문을 무단 편집한 것이고 문항 전체가 무효다.",
    "- 마커 안의 왼쪽·오른쪽 값이 '원형·포인트' 섹션의 값과 축자로 같은지 대조하라.",
    "- 세 네모의 올바른 표현이 각각 지문에 **딱 한 번만** 등장하는지 확인하라 — 두 번 나오면 학생이 다른 곳을 베껴 푼다(자리 재선정).",
    "- 세 네모의 포인트 코드가 서로 다른지, 그리고 그 코드가 해설이 설명하는 문법 범주와 실제로 일치하는지 확인하라.",
    "- 다섯 선지의 값을 각각 문장에 꽂아 읽어, 값이 두 후보 중 하나와 정확히 같은지 확인하라.",
    "- 세 네모 전부 올바른 값인 조합이 **정확히 1개**이고 그것이 '정답:' 번호인지 확인하라.",
    "- 한 네모만 틀린 near-miss 선지가 있는지, 세 네모의 틀린 후보가 오답 선지에 최소 1회씩 등장하는지 확인하라.",
    ...(mode === "full"
      ? ["- 오답 목록에 정답 번호를 절대 포함하지 마라."]
      : []),
    "- 해설이 (A)로 시작해 (C)까지 세 자리를 전부 설명하고 끝나는지 확인하라 — 마지막 라벨만 적고 내용 없이 끊기면 반려된다.",
    "- 해설은 한국어만 쓴다(영단어를 한국어 문장의 어휘로 섞지 마라 — 지문 표현 인용만 허용).",
    "- 해설에 '원문의 X를 Y로 바꿨다' 같은 **출제 변형 과정**을 서술하지 마라 — 학생 관점의 어법 근거만 쓴다.",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// [블록 7] 출력 형식 리터럴 — parser-combo.ts 와 1:1 계약.
// ---------------------------------------------------------------------------
function comboExplanationBlock(mode: MdExplanationMode): string {
  const head = `정답: <①~⑤ 하나 — 세 네모 전부 올바른 표현인 유일한 조합>
해설: <딱 2문장 — (A)→(B)→(C) 순서로 각 네모의 올바른 표현이 왜 옳은지 구조 근거만. 합니다체`;
  if (mode === "answer-only") {
    return `${head}. 오답 해설은 쓰지 마라>`;
  }
  return `${head}>
오답:
① <이 조합의 어느 네모에서 어떤 값이 왜 틀렸는지 1문장> (정답 번호는 제외하고 오답 4개만)
...`;
}

/** 네모 개수를 지원 범위(3 고정)로 클램프한다. lane.isEligible 이 범위 밖을 fast 로 되돌린다. */
export function clampComboMdSlotCount(value: unknown): number {
  const n = Math.round(Number(value));
  return Number.isFinite(n) && n === COMBO_MD_SLOT_COUNT ? n : COMBO_MD_SLOT_COUNT;
}

/**
 * 네모 어법 md 프롬프트.
 *
 * 출력 계약(parser-combo.ts 와 1:1):
 *   `네모지문:` [[A:올바름|틀림]] 인라인 마킹(파이프 왼쪽=원문 축자)
 * + `원형·포인트:` (A) 올바름 | 틀림 | 코드
 * + `선지:` ①~⑤ (값 3개를 " …… " 로 연결)
 * + `정답:` + `해설:` + `오답:`
 */
export function buildMdComboPrompt(
  passage: string,
  mode: MdExplanationMode = "full",
  difficulty: MdDifficulty = "KILLER",
  opts?: { slotCount?: number; pointFocus?: boolean },
): string {
  const slotCount = clampComboMdSlotCount(opts?.slotCount ?? COMBO_MD_SLOT_COUNT);
  const pointFocus = Boolean(opts?.pointFocus);
  // 이 한 값이 few-shot·하드풀·장거리 의존 예시·강한 자리·오인 축을 한꺼번에 가른다.
  const pointMode: ComboPointMode = pointFocus ? "focus" : "parallel";
  const labels = COMBO_MD_LABELS.slice(0, slotCount);
  const labelsText = labels.map((l) => `(${l})`).join(", ");
  const lastLabel = labels[labels.length - 1];

  const headline =
    difficulty === "KILLER"
      ? `아래 지문으로 ${labelsText} 네모 ${slotCount}개짜리 '네모 어법' KILLER 문항 1개를 설계하라. 네모 ${slotCount}개와 조합 선지 다섯 개 하나하나에 명확한 출제 의도가 박힌 아름다운 킬러 문항이어야 한다. 학생이 어느 네모에서 흔들릴지를 계산하고 학생 머리 꼭대기에서 설계하라.`
      : `아래 지문으로 ${labelsText} 네모 ${slotCount}개짜리 '네모 어법' 문항 1개(난이도: ${difficulty === "BASIC" ? "기본 — 교과서 수준 확인형" : "중급 — 모의고사 중위권, 구조 분석 필요"})를 설계하라. 네모 ${slotCount}개와 조합 선지 다섯 개 하나하나에 명확한 출제 의도가 있어야 한다.`;

  // few-shot 은 BASIC 에서 생략 — 정본 어법 빌더의 선례(prompts.ts:386-389)를 따른다.
  const fewshotBlock = difficulty === "BASIC" ? "" : `${comboFewshot(pointMode)}\n\n`;

  const metaScaffold = labels
    .map((l, i) =>
      i === 0
        ? `(${l}) <올바른 표현(원문 축자 — 마커의 파이프 왼쪽과 완전히 동일)> | <틀린 표현(마커의 파이프 오른쪽과 완전히 동일)> | <포인트코드 한 글자만, 괄호·설명 금지>`
        : `(${l}) ...`,
    )
    .join("\n");

  const optionShape = labels.map((l) => `<${l}값>`).join(COMBO_MD_VALUE_JOINER);
  const optionLines = COMBO_MD_CIRCLED.map((c) => `${c} ${optionShape}`).join("\n");

  return `너는 대한민국 수능 영어 어법 문항을 20년 출제해 온 최정상 출제위원이다. ${headline}

${fewshotBlock}## 출제 철학 — 네모 어법이 밑줄 어법과 다른 점
- 학생은 "틀린 곳 찾기"가 아니라 **두 후보를 나란히 놓고 고르기**를 한다. 그래서 두 후보가 나란히 보이는 순간 정답 시비가 날 여지가 있으면 그 자리는 실격이다 — 틀린 후보는 그 자리에서 **어떤 통사 해석으로도** 성립하면 안 된다.
- 네모 ${slotCount}개는 **서로 다른 문장**에서 고른다. 한 네모의 판단이 다른 네모의 답을 암시하면 안 된다 — 세 자리는 독립된 판단 지점이어야 한다.
- 세 네모의 포인트 코드는 **서로 달라야** 한다. 코드 풀: ${COMBO_MD_POINT_LIST}.
- 올바른 표현은 **원문 축자**(한 글자도 변경 금지)다. 원문은 항상 옳다고 가정하라.

${comboTargetSection(difficulty, pointFocus)}

${comboWrongCandidateSection(difficulty, pointMode)}

${comboWeakBoxSection(pointMode)}

${comboOptionMixSection(difficulty)}

## 마감 — 위반하면 시험 요령으로 뚫린다
- 한 네모의 두 후보는 길이·형태가 서로 비슷해야 한다. 유독 길거나 유독 낯선 후보 하나가 정답을 흘리면 안 된다.
- 후보 안에 \`/\` \`[\` \`]\` \`|\` 와 말줄임표(…)를 쓰지 마라 — 네모 표기와 선지 구분자가 무너진다.
- 정답 시비가 조금이라도 있는 자리(복수 등위 주어 + each 뒤 동사의 수, 집합명사 수일치, 사용역에 따라 갈리는 변이형)는 네모로 만들지 마라.
- 해설의 통사 기능 명명을 정확히 하라: 목적어 명사절을 이끄는 접속사 that 을 관계대명사라 부르거나, 동명사를 분사라 부르지 마라. 확신이 없으면 범주명 대신 구조를 풀어 설명하라.

${comboSelfCheck(mode)}

## 출력 형식 (마크다운 — 이 형식 그대로, 다른 말 붙이지 마라)
네모지문:
<지문 "전체"를 한 글자도 바꾸지 말고 그대로 옮겨 적는다. 단, 네모 ${slotCount}곳만 [[A:올바른표현|틀린표현]] ~ [[${lastLabel}:올바른표현|틀린표현]] 로 감싼다. 파이프(|) 왼쪽이 반드시 원문 축자(어법상 옳은 표현), 오른쪽이 네가 만든 변형(어법상 틀린 표현)이다. 라벨은 지문 등장 순서대로 A, B, C 를 붙인다. 마커 밖의 모든 텍스트는 원문과 완전히 동일해야 한다 — 문장 추가·삭제·재배열·구두점 변경 전부 금지.>

원형·포인트:
${metaScaffold}

선지:
${optionLines}
${comboExplanationBlock(mode)}

## 지문
${passage}`;
}
