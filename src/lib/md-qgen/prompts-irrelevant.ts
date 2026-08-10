// ============================================================================
// 무관한 문장(IRRELEVANT) md 프롬프트 — 정본(빈칸·어법) 7블록 골격의 이식본.
// 견본(EXEMPLAR): prompts-antonym.ts · 계약 문서: docs/md-qgen-type-expansion-spec.md
//
// 공예 서사는 question-prompts-mc.ts:650-700(IRRELEVANT) 의 실전 검증된 지시를
// md 골격으로 옮긴 것이다 — on-topic/off-logic 철학·표면 위장 3요소·역접어 금지·
// 방법론 드리프트 금지가 이미 실측 결함(fatal 판정분)에 대응해 다듬어져 있다.
//
// ⚠ 이 유형의 md 계약은 **삽입(insertion)** 이다. 번호지문은
//   "원 지문 전체(축자) + 무관 문장 1개가 두 원문 문장 사이에 끼워진 것" 이고,
//   그게 정확히 학생이 보는 표면이다(후처리 buildSpreadMarkedPassage 가 원문
//   전 문장을 그대로 출력하고 무관 문장만 끼워 넣기 때문). 따라서 최강 게이트는
//   "무관 문장을 들어내고 마커를 걷어낸 재구성본 == 원 지문" 이다.
//   ⛔ '원문 문장을 무관 문장으로 교체' 계약으로 쓰면 안 된다 — 후처리는 교체된
//      원문 문장을 지우지 않으므로 md 설계와 학생 표면이 어긋난다(gate 무력화).
// ============================================================================

import { circledForMarkIndex } from "./parser";
import type { MdDifficulty, MdExplanationMode } from "./prompts";

export const IRRELEVANT_MD_SLOT_COUNT_MIN = 5;
export const IRRELEVANT_MD_SLOT_COUNT_MAX = 10;

/** 설정값 → md 프롬프트가 커버하는 슬롯 수(5~10)로 클램프. */
export function clampIrrelevantMdSlotCount(value: unknown): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return IRRELEVANT_MD_SLOT_COUNT_MIN;
  return Math.min(
    IRRELEVANT_MD_SLOT_COUNT_MAX,
    Math.max(IRRELEVANT_MD_SLOT_COUNT_MIN, n),
  );
}

/** ①~⑩ 표기 — 학생 표면·`정답:` 줄의 라벨 축. */
export function irrelevantMdCircled(index: number): string {
  return circledForMarkIndex(index);
}

// few-shot 해부 — 규칙 나열보다 실물 해부가 공예를 끌어올린다는 정본의 확정 결론.
const IRRELEVANT_FEWSHOT = `## 모범 설계 해부 — 이 수준을 재현하라 (예시의 표현을 복사하지는 마라)
지문: 매몰비용 오류 — "이미 쏟아부은 자원은 앞으로의 결정을 정당화하지 못한다"를 논증하는 글.
- 끼워 넣은 자리: "A factory ... will often keep pouring resources into it, simply because so much has already been invested." 바로 뒤.
- 끼워 넣은 문장: "Indeed, the resources already invested in such a project can stand as a clear signal of commitment that reassures partners about its long-term direction."
- 왜 매끄러워 보이는가: 앞 문장의 내용어(resources · invested · project)를 그대로 이어받고 Indeed 로 첨가 연결까지 걸었다. 새 소재어가 하나도 없어서 훑어 읽으면 앞 문장을 부연하는 문장으로 읽힌다.
- 왜 무관한가: 이 글의 논지는 "과거 투자는 미래 결정의 근거가 못 된다"인데, 이 문장은 과거 투자를 "긍정적 신호"로 재평가한다. 소재는 같고 **논지 기능만** 뒤집혔다(관점 역전).
- 이 설계가 아름다운 이유: 어휘로는 절대 걸러지지 않는다. 이 문장 하나만 들어내면 앞뒤가 빈틈없이 이어지고, 나머지 어느 문장을 들어내면 오히려 논증이 끊긴다 — 정답의 유일성이 '어휘의 낯섦'이 아니라 '논리 기능'에서 나온다.`;

const IRRELEVANT_DESIGN_BY_DIFFICULTY: Record<MdDifficulty, string> = {
  BASIC: `## 표적 설계 (기본 난이도)
- 무관 문장은 인접 문장과 소재·어휘를 공유하되, 다루는 **화제가 한 단계 벗어나** 문단을 끝까지 읽으면 논지에서 빠짐이 분명히 드러나야 한다(무관성 유형: 주제 침입).
- 근거 깊이는 한 문장이면 충분하다 — 바로 앞 문장과의 관계만 따져도 판정된다.
- 그래도 **티 나는 단서로 걸리게 하지는 마라**: 새 분야 용어·처방문(should/must)·극단어(always/never)·역접어 시작은 기본 난이도에서도 금지다. 그건 함정이 아니라 표식이다.`,
  INTERMEDIATE: `## 표적 설계 (중급 난이도)
- 무관 문장은 앞뒤 **두 문장의 역할**(예시→일반화, 원인→결과, 주장→근거)을 대조해야 어긋남이 드러나야 한다. 한 문장만 보면 그럴듯해야 한다.
- 어휘는 완전히 정박시켜라 — 무관 문장의 의미 있는 단어는 대부분 앞 문장과 지문에서 빌려 온다. 새 명사를 들여오지 마라.
- 무관성 유형은 '범위 이탈'을 우선한다: 소재는 그대로 두고 글이 논증하는 **측면**만 다른 측면으로 옮겨라(예: 정확성을 논하는 글에서 비용을 평가).`,
  KILLER: `## 표적 설계 — KILLER 의 생명
- 훑어 읽기로는 **절대** 걸리지 않아야 한다. 무관 문장은 앞 문장의 내용어를 3~4개 재사용하고, 지시어·첨가 연결(This/Such/These/Indeed/Moreover)로 앞 문장에 물려 있어야 한다.
- 어긋나는 것은 **단 하나, 논리 기능**이다: 관점·평가 역전 / 인과 방향 뒤집기 / 범위·주어 이동(개인↔사회, 이 사례↔일반론) / 하위 주제 드리프트(같은 단어, 다른 논점). 두 개 이상을 동시에 어긋내면 티가 난다.
- 정답 유일성은 2단서 수렴으로 만들어라: (i) 그 문장만 빼면 앞뒤가 완전히 이어지고, (ii) 나머지 표시 문장은 하나라도 빼면 논증 사슬이 끊긴다. 둘 다 성립하지 않으면 재설계다.
- 🚫 KILLER 즉사 금지: 새 소재어·새 무대(school/software/traffic 류), 처방문("To maximize…, you should…"), 극단어(always·never·completely·guarantees), 노골적 반론(However/Instead/In contrast 로 시작), 방법론 드리프트("측정하려면 절차가 필요하다", "도구를 개발해야 한다"). 이 중 하나라도 있으면 학생은 지문을 안 읽고 그 문장을 찍는다.`,
};

/** 무관성 유형 분류학 — irrelevant-point-catalog.ts(기출 227문항 LLM 검증)와 같은 축. */
const IRRELEVANT_TAXONOMY = `## 무관성 기제 분류학 — 하나만 고르고, 그 하나만 어긋나게 하라
- **주제 침입**(기출 63%): 글의 핵심 소재와 다른 화제를 끌어들인다. 단 인접 문장의 내용어 3~4개는 재사용해 표면을 위장한다.
- **범위 이탈**(20%): 소재는 같은데 글이 논증하는 측면이 아닌 다른 측면을 평가·서술한다.
- **대조 오용**(6%): 글이 일관되게 옹호하는 주장과 반대 입장을 편다. 단 역접어로 티 내지 말고 **내용으로만** 충돌시켜라.
- 인과 오류 / 결론 불일치는 저빈출이다 — 위 셋이 이 지문에 정말 안 맞을 때만 쓴다.
- 소재 구속: 무관 문장의 재료는 전부 **지문에 실재하는 소재·어휘**여야 한다. 지문 밖 개념을 수입하면 학생이 지문을 안 읽고 소거한다 — 그건 함정이 아니라 장식이다.`;

/** 표시할 원문 문장(= 오답 슬롯) 선정 규칙. */
function sourceSelectionBlock(slotCount: number): string {
  const sourceCount = slotCount - 1;
  return `## 표시할 원문 문장 ${sourceCount}개 — 여기서 문항의 격이 갈린다
- 표시 문장은 전부 **지문 원문 그대로**여야 한다. 요약·패러프레이즈·구두점 변경·두 문장 결합·한 문장 분할 전부 실격이다.
- ⭐ 지문 **첫 문장은 절대 표시하지 마라**. 첫 문장은 소재와 주제를 정하는 도입문이고, 학생이 관련성을 판정하는 기준점이라 번호 없이 그대로 보여 준다.
- ⭐ 표시 문장을 지문 전체에 분산하라. 앞부분에 몰아 고르지 말고, 지문이 길면(8문장 이상) 최소 한 문장은 뒤쪽 1/3에서 골라라. 원문 등장 순서는 그대로 유지한다.
- 표시 문장은 문단에서 서로 다른 역할(정의·예시·대조·귀결)을 맡은 것으로 골라라 — 오답 해설이 서로 같은 말이 되면 문항이 헐거워진다.`;
}

function irrelevantAnswerBlock(
  mode: MdExplanationMode,
  slotCount: number,
): string {
  const first = irrelevantMdCircled(0);
  const last = irrelevantMdCircled(slotCount - 1);
  const wrongCount = slotCount - 1;
  const head = `정답: <${first}~${last} 하나 — 새로 끼워 넣은 무관 문장의 번호. ${first} 와 ${last} 는 정답이 될 수 없다(가운데 번호에 넣어라)>
해설: <딱 2문장 — 그 문장이 앞뒤 문장과 어떤 논리 기능에서 어긋나는지, 그 문장을 빼면 왜 흐름이 복원되는지. 합니다체. 문장을 번호로 부르지 말고 내용으로 인용하라`;
  if (mode === "answer-only") {
    return `${head}. 오답 해설은 쓰지 마라>`;
  }
  return `${head}>
오답:
${irrelevantMdCircled(0)} <이 문장이 글에서 맡는 역할(정의·예시·대조·귀결 등)과 왜 흐름에 필요한지 1문장> (정답 번호는 제외하고 ${wrongCount}개만)
...`;
}

/**
 * 무관한 문장 md 프롬프트.
 * 출력 계약(parser-irrelevant.ts 와 1:1): `번호지문:` [[1:문장]] 인라인 마킹 +
 * `정답:` + `해설:` + `오답:`.
 *
 * 형식 설계 철칙(규범 §1-B) 검산:
 *  1. 한 정보는 한 곳에서만 — 정답은 `정답:` 줄이 유일 진실원이다. 마커 줄에
 *     O/X·정답표시 칸을 두지 않고, 삽입 문장은 "정답 번호 마커의 내용" 하나로만
 *     식별된다(별도 `삽입문:` 줄을 만들면 같은 사실을 두 번 받는 중복 계약이다).
 *  2. 줄당 칸 수 최소 — 마커는 `[[번호:문장]]` 칸 하나뿐이다.
 *  3. 파서가 조용히 버리지 않게 — 마커·오답은 줄/조각 단위 관대 파싱, 판정은 게이트.
 *  4. 게이트 메시지가 자리를 지목 — 번호와 문장 앞머리를 문구에 싣는다.
 */
export function buildMdIrrelevantPrompt(
  passage: string,
  mode: MdExplanationMode = "full",
  difficulty: MdDifficulty = "KILLER",
  opts?: { slotCount?: number },
): string {
  const slotCount = clampIrrelevantMdSlotCount(
    opts?.slotCount ?? IRRELEVANT_MD_SLOT_COUNT_MIN,
  );
  const sourceCount = slotCount - 1;
  const firstCircled = irrelevantMdCircled(0);
  const lastCircled = irrelevantMdCircled(slotCount - 1);
  const innerRange = `${irrelevantMdCircled(1)}~${irrelevantMdCircled(slotCount - 2)}`;

  const headline =
    difficulty === "KILLER"
      ? `아래 지문의 흐름 속에 무관한 문장 하나를 심고 "전체 흐름과 관계 없는 문장"을 고르게 하는 KILLER 문항 1개를 설계하라. 번호 ${slotCount}개 하나하나에 명확한 출제 의도가 박힌 아름다운 킬러 문항이어야 한다. 학생이 어느 번호에서 흔들릴지를 계산하고 학생 머리 꼭대기에서 설계하라.`
      : `아래 지문의 흐름 속에 무관한 문장 하나를 심고 "전체 흐름과 관계 없는 문장"을 고르게 하는 문항 1개(난이도: ${difficulty === "BASIC" ? "기본 — 교과서 수준 확인형" : "중급 — 모의고사 중위권, 논리 기능 판단 필요"})를 설계하라. 번호 ${slotCount}개 하나하나에 명확한 출제 의도가 있어야 한다.`;

  const fewshotBlock = difficulty === "BASIC" ? "" : `${IRRELEVANT_FEWSHOT}\n\n`;

  return `너는 대한민국 수능 영어영역을 20년 출제해 온 최정상 출제위원이다. ${headline}

${fewshotBlock}## 이 유형의 핵심 철학 — on-topic / off-logic
무관한 문장은 "완전히 다른 주제의 문장"이 아니다. 지문의 중심 소재어와 핵심 어휘를 그대로 공유하면서 **문단의 논리 기능만** 어긋나는 문장이다. 훑어 읽으면 자연스럽고, 앞뒤 문장의 역할을 따져야만 걸러져야 한다. 어휘만 맞춰 보는 학생은 절대 못 푸는 함정이어야 한다.

## 문항의 물리 구조 — 반드시 이해하고 시작하라
- 학생이 보는 지문은 **원 지문 전체(한 글자도 안 바뀐 채) + 네가 새로 쓴 무관 문장 1개가 끼워진 것**이다. 원문 문장을 지우거나 다른 문장으로 갈아 끼우는 것이 아니다.
- 무관 문장은 **연속된 두 원문 문장 사이**에 끼워 넣는다. 그 문장 하나만 들어내면 원 지문이 빈틈없이 그대로 복원되어야 한다(remove-and-reconnect).
- 번호 ${slotCount}개는 무관 문장 1개 + 원문 문장 ${sourceCount}개에 지문 등장 순서대로 붙는다. 무관 문장 **바로 앞 문장도 반드시 번호를 붙인 표시 문장**이어야 한다(무관 문장이 어디에 물려 있는지가 확정되어야 한다).

${IRRELEVANT_DESIGN_BY_DIFFICULTY[difficulty]}

${IRRELEVANT_TAXONOMY}

${sourceSelectionBlock(slotCount)}

## 표면 위장 3요소 — 무관 문장이 갖춰야 할 것
1. **연결 위장**: 바로 앞 표시 문장의 단어를 이어받거나 This/Such/These/Indeed/Moreover 같은 지시어·첨가 연결어로 시작해 이어진 척한다.
2. **소재 정박**: 지문의 중심 소재어를 포함하고, 주변 원문의 내용어를 최소 2개 재사용한다.
3. **문체 정합**: 길이·어휘 수준·문체·추상도를 주변 원문 문장에 맞춘다. 유독 짧거나 유독 긴 문장은 읽기 전에 들킨다.

## 마감 — 위반하면 시험 요령으로 뚫린다
- 🚫 무관 문장을 **역접 연결어(However / Yet / Instead / In contrast / On the contrary)로 시작하지 마라.** 실측 fatal 이다 — "However + 반대 주장"은 훑기만으로 걸린다. 무관 문장은 지문과 같은 방향인 척해야 한다.
- 🚫 원문에 없는 처방어(should / must / need to / it is essential to)·극단어(always / never / everyone / completely / guarantees)를 쓰지 마라.
- 🚫 방법론·측정·도구·실험 장비로 새는 문장 금지("to measure this, the procedure requires…", "build automated tracking tools") — 가장 흔한 자동 탈락 패턴이다.
- 🚫 새 무대·새 분야 명사(software / dashboard / classroom / restaurant / traffic 류)를 지문에 없는데 끌어오지 마라.
- 무관 문장은 앞 문장과 **사실관계로 모순**되게 만들지 마라(앞 문장이 '색이 바랜다'인데 '선명한 색을 유지한다'). 사실은 그럴듯하되 논리 기능만 어긋나게 하라.
- 정답 위치는 가운데(${innerRange})다. ${firstCircled} 와 ${lastCircled} 에 넣지 마라. 항상 같은 자리만 쓰지 말고 골고루 분산하라.
- 오답 해설 ${sourceCount}개는 서로 다른 역할을 말해야 한다. "흐름에 자연스럽습니다"를 ${sourceCount}번 반복하면 실패다.

## 출력 전 자기검산 (사고 안에서 수행)
- ★ 번호지문에서 마커를 전부 걷어내고 **무관 문장까지 들어낸** 결과가 원 지문과 한 글자도 다르지 않은지 확인하라. 구두점·대소문자·철자 하나라도 다르면 기계 검사에서 즉시 반려된다.
- 무관 문장을 빼면 그 앞뒤 원문이 빈틈없이 이어지는가? (가장 중요)
- 표시한 원문 ${sourceCount}개 중 하나라도 빼면 오히려 흐름이 어색해지는가? (정답 유일성)
- 무관 문장이 "다른 분야라서"가 아니라 "논리 기능이 틀려서" 빠지는가? 어느 무관성 유형인지 한 문장으로 말할 수 있는가?
- 무관 문장 바로 앞 문장에 번호를 붙였는가? 지문 첫 문장에는 번호를 붙이지 않았는가?
- 표시 문장이 지문 앞부분에만 몰려 있지 않은가?
- 무관 문장의 첫 단어가 역접 연결어가 아닌가? 처방어·극단어·방법론어가 섞이지 않았는가?
- 해설·오답 해설 본문에서 문장을 "②번 문장"처럼 **번호로 지칭하지 마라** — 실측 최다 결함이다(해설이 다른 번호를 부르면 문항 전체가 무효가 된다). 반드시 내용 인용으로 지칭하라. 줄 맨 앞의 번호 라벨은 형식이므로 예외다.
- 오답 목록에 정답 번호를 절대 포함하지 마라.
- 해설은 한국어만 쓴다(영단어를 한국어 문장의 어휘로 섞지 마라 — 지문 표현 인용만 허용).

## 마킹 규칙 (기계 파싱 계약)
- 번호 마커는 \`[[번호:문장 전체]]\` 하나뿐이다. 문장의 **끝 구두점까지 마커 안에** 넣어라.
- 번호는 \`1\` 부터 \`${slotCount}\` 까지, **지문 등장 순서대로** 붙인다. 건너뛰거나 되돌아가지 마라.
- 마커 밖의 텍스트는 원 지문 그대로여야 한다. 문장 추가·삭제·재배열·구두점 변경 전부 금지다.
- 어느 번호가 무관 문장인지는 마커에 표시하지 말고 아래 \`정답:\` 줄로만 알려라.

## 출력 형식 (마크다운 — 이 형식 그대로, 다른 말 붙이지 마라)
번호지문:
<지문 "전체"를 한 글자도 바꾸지 말고 그대로 옮겨 적되, 네가 쓴 무관 문장 1개를 연속된 두 원문 문장 사이에 끼워 넣는다. 그리고 무관 문장을 포함한 문장 ${slotCount}개를 지문 등장 순서대로 [[1:문장 전체]] ~ [[${slotCount}:문장 전체]] 로 감싼다. 지문 첫 문장은 감싸지 않는다.>

${irrelevantAnswerBlock(mode, slotCount)}

## 지문
${passage}`;
}
