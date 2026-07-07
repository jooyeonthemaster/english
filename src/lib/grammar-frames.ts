// ============================================================================
// 어법 9프레임 지식베이스 — 교육과정 내 구조 문법 프레임의 정본.
//
// 출처: 강사 제공 9대 어법 프레임(2026-07-04). 각 프레임은 "구조적 틀(formula)"
// 을 가지며, 출제는 임의 단어 교체가 아니라 (1) 프레임 선택 → (2) 지문에서
// 프레임 인스턴스 탐색 → (3) 최소 표면 변형 → (4) 반증 검사의 절차로 설계된다.
//
// 소비처: candidate-blocks/grammar.ts 의 buildGrammarNineFrameGuide(재작성판)가
// 이 데이터를 난이도별로 직렬화해 GRAMMAR_ERROR/GRAMMAR_CORRECTION/워크시트
// 프롬프트에 주입한다. pointCode(a~m) 체계는 grammar-point-catalog.ts 와 공유.
// ============================================================================

import type { GrammarPointCode } from "./grammar-point-catalog";

export interface GrammarFrame {
  id: number;
  /** 프레임 이름 (학생/해설 노출 가능한 표준 학교문법 용어) */
  name: string;
  /** 매핑되는 pointCode들 — 첫 코드가 대표 코드 */
  codes: GrammarPointCode[];
  /** 구조적 틀 — 프레임의 통사 공식 */
  formula: string;
  /** 판단 규칙 — 무엇으로 정오가 갈리는가 (학생이 수행해야 할 구조 판단) */
  decision: string;
  /** 오류(정답) 설계법 — 최소 표면 변형으로 명백한 단일 비문을 만드는 방향 */
  errorRecipe: string;
  /** 킬러 승격법 — 장거리 의존/중첩으로 판단 거리를 늘리는 방향 */
  killerLift: string;
  /** 해설에서 반드시 이름 붙여야 하는 구조 근거 */
  explanationCue: string;
}

export const GRAMMAR_FRAMES: GrammarFrame[] = [
  {
    id: 1,
    name: "주어-동사 수일치",
    codes: ["d"],
    formula: "S_head + [수식어구: 관계사절·분사구·전치사구·동격 삽입] + V(단/복수)",
    decision:
      "동사 바로 앞 명사가 아니라, 수식어구를 걷어낸 진짜 주어 핵(S_head)과 동사의 수를 일치시킨다. 수식어구 안에 주어와 수가 반대인 명사가 있는 자리가 좋은 출제 지점이다.",
    errorRecipe:
      "S_head 와 V 사이에 반대 수의 명사가 끼어 있는 문장을 골라 V의 수만 뒤집는다(밑줄은 V 1단어). the number of(단수)/a number of(복수)/one of+복수N+단수V/부분표현(percent·most·half of)도 안전한 변형 자리다. ⚠️ 정답 자격 게이트: 주어 핵과 동사 사이에 **주어와 수가 반대인 명사가 실제로 1개 이상** 개입한 자리만 정답으로 쓴다 — 주어-동사가 인접하거나 개입 명사가 전부 주어와 같은 수면 이 프레임을 정답으로 쓰지 말고 자리를 바꾼다(BASIC 요청 시에만 인접 허용). head noun이 이미 -s 복수형이라 복수 표지가 이중(복수형+and 병렬)인 주어도 금지 — 형태만 보고 즉답된다. **디코이로 쓸 때도** 주어와 수가 다른 간섭 명사가 실재해야 한다 — 주어와 인접 명사의 수가 모두 같으면 변별 0인 패딩이다.",
    killerLift:
      "수식어구를 2겹 이상 통과해야 S_head 가 보이는 자리(관계절 안 전명구, 동격 삽입구+분사구), 또는 도치문(There/장소구/부정어구 뒤 진짜 주어)과 결합해 판단 거리를 늘린다.",
    explanationCue: "진짜 주어 핵이 무엇인지, 사이에 낀 수식어구가 무엇인지(관계절/전명구/삽입구) 이름 붙여 제시",
  },
  {
    id: 2,
    name: "목적격보어의 준동사 형태",
    codes: ["h", "k"],
    formula:
      "S + V(사역 make·have·let / 지각 see·hear·watch·notice / 요구·허용 allow·enable·cause·force·encourage·expect / 준사역 get) + O + OC(원형/to-V/V-ing/p.p.)",
    decision:
      "본동사의 종류가 OC 형태를 결정한다(사역 make·have·let=원형, 지각=원형 또는 V-ing(진행 강조 — 둘 다 정문), allow류·get=to-V). 여기에 O와 OC의 능수동 관계가 겹친다 — O가 당하는 쪽이면 p.p.(have+O+p.p., keep+O+p.p.).",
    errorRecipe:
      "본동사 규칙과 어긋난 OC 형태로 변형(allow+O+원형, make+O+to-V), 또는 O-OC가 수동 관계인 자리의 p.p.를 능동형으로 뒤집는다(밑줄은 OC 형태 1~2단어). ⚠️ 지각동사의 원형↔V-ing 교체는 둘 다 정문이라 정답 변형 금지(복수정답 시비). to-V 변형(*saw him to cross)도 목적어 명사가 to부정사 보문을 취하면(power/ability/potential/opportunity to-V 등) '명사+to-V' 파스로 정문이 돼 금지 — 역으로 그런 명사 뒤 원문 to-V에서 to를 지우는 것도 지각동사 보어(원형)로 정문이 된다(실측 사고: We see the power of AI to broaden → broaden = 무정답). 지각동사가 같은 절 앞에 보이면 그 뒤 준동사 자리는 정답으로 아예 쓰지 마라.",
    killerLift:
      "O가 긴 명사구라 본동사와 OC가 멀리 떨어진 자리, 또는 수동 보어(have+O+p.p.)에 능수동 판단을 겹친 자리를 고른다.",
    explanationCue: "본동사가 무엇이고 어떤 보어를 요구하는지 + O와 OC의 능/수동 관계",
  },
  {
    id: 3,
    name: "능동태 vs 수동태",
    codes: ["e"],
    formula: "능동: S + V(타동사) + O  /  수동: S + be + p.p. (+ 전치사구·부사구), 목적어 없음",
    decision:
      "동사의 타동성을 먼저 확정하고, 주어가 행위자인지 대상인지 + 뒤에 목적어가 있는지로 판단한다. 관계대명사절에서 목적어가 gap 으로 앞에 빠진 경우 목적어가 안 보여도 능동 유지 — 이것이 대표 함정.",
    errorRecipe:
      "뒤에 목적어가 버젓이 있는 타동사를 수동으로, 또는 주어가 명백한 대상인 자리를 능동으로 뒤집는다. 자동사(occur·happen·appear·disappear·consist·belong)의 수동화(*be appeared)는 한눈에 보이는 즉답이라 정답 금지 — 자동사 자리는 원문의 옳은 능동형에 밑줄만 긋는 디코이로 쓴다(비문 수동형을 지문에 인쇄하지 않는다).",
    killerLift:
      "관계대명사절 내부(목적어 gap 자리)의 태 판단, 또는 4형식·5형식 수동(수동 뒤 보어/목적어 잔류)처럼 '목적어 유무' 규칙만으로는 틀리는 자리를 고른다.",
    explanationCue: "주어와 동사의 행위자-대상 관계 + 목적어 유무(관계절이면 gap 위치)",
  },
  {
    id: 4,
    name: "관계사절 (관계대명사 vs 관계부사)",
    codes: ["b"],
    formula:
      "선행사 + who/which/that + 불완전절(주어·목적어 결손)  /  선행사 + where/when/why·전치사+관계대명사 + 완전절",
    decision:
      "관계사 뒤 절의 필수 성분(주어·목적어)이 비었는지로만 판단한다. 선행사의 의미(장소니까 where)로 찍게 만드는 것이 함정 — 추상 선행사(point·case·situation·stage) + where 를 적극 활용.",
    errorRecipe:
      "완전절 앞의 where/in which 를 which 로, 불완전절 앞의 which 를 where 로 교체(밑줄은 관계사 1~2단어). 콤마+which(앞 절 전체 선행)는 that/what 으로 바꾸면 명백한 비문.",
    killerLift:
      "선행사와 관계사가 멀리 떨어진 자리, 전치사+관계대명사(in which/by which), 삽입절(I think/believe) 을 건너뛰어야 절의 완전성이 보이는 자리를 고른다.",
    explanationCue: "관계사 뒤 절이 완전한지/어느 성분이 결손인지 + 실제 선행사가 무엇인지",
  },
  {
    id: 5,
    name: "명사절 that vs 관계대명사 what",
    codes: ["b"],
    formula: "명사 자리(S/O/C): that + 완전절  /  what + 불완전절(선행사를 자체 포함)",
    decision:
      "명사절 내부의 성분 결손 여부로 판단한다. what 은 선행사를 포함하므로 앞에 명사(선행사)가 있으면 쓸 수 없고, that 은 완전한 절만 이끈다.",
    errorRecipe:
      "완전절을 이끄는 that 을 what 으로, 목적어가 빈 절을 이끄는 what 을 that 으로 교체한다(밑줄은 that/what 1단어) — 정답은 '명사절 슬롯의 that↔what' 대조에서만 만든다. ⚠️ 선행사(명사)가 바로 앞에 있는 자리의 that 을 what 으로 바꾸는 'N what ...' 변형은 한눈에 보이는 비문이라 정답으로 쓰면 게이트에 반려된다 — 이 형태는 정답 레시피가 아니라, '왜 이 자리에는 what 이 불가하고 that 이어야 하는가'를 짚는 미끼 반증용으로만 쓴다.",
    killerLift:
      "What 주어절(What matters is ~)이나 전치사의 목적어 자리, 절 내부가 길어 결손 확인에 거리가 있는 자리를 고른다.",
    explanationCue: "명사절 내부가 완전한지(무엇이 결손인지) + 선행사 유무",
  },
  {
    id: 6,
    name: "분사구문과 분사의 태",
    codes: ["c"],
    formula:
      "(접속사 +) V-ing(능동·진행)/p.p.(수동, 자동사는 완료) ~, S_main + V_main  /  with + O + V-ing/p.p.  /  명사 + 후치 분사",
    decision:
      "분사의 생략된 의미상 주어(주절 주어, with 뒤 명사, 수식받는 명사)를 특정하고 능/수동 관계로 판단한다. 분사 뒤 목적어가 있으면 능동. 자동사 분사는 태 공식이 안 통하는 함정 — 진행·미완 의미면 목적어 없이도 V-ing(a missing child, a sleeping baby), 완료 의미면 p.p.(a retired teacher, fallen leaves — 수동이 아니라 완료). '목적어 없으면 p.p.=수동' 암기의 반례.",
    errorRecipe:
      "의미상 주어와의 관계를 뒤집는다: 대상인데 V-ing, 행위자인데 p.p.(밑줄은 분사 1단어). 접속사 잔류 절축약(if eaten, when asked, if left untreated)은 기출 빈출 형태.",
    killerLift:
      "문두 분사구문의 의미상 주어가 멀리 있는 주절 주어인 자리, with 부대상황, 접속사 잔류 절축약처럼 절 축약을 복원해야 능수동이 보이는 자리를 고른다.",
    explanationCue: "분사의 의미상 주어가 무엇인지 특정 + 그 주어와 분사의 능/수동 관계",
  },
  {
    id: 7,
    name: "가목적어 it 구문",
    codes: ["g", "f"],
    formula: "S + make/find/think/consider + it(가목적어) + OC(형용사/명사) + 진목적어(to-V / that절)",
    decision:
      "이 it 은 지시대명사가 아니라 뒤로 미뤄진 진목적어(to-V/that절)를 대신하는 가목적어이며, OC 자리에는 형용사만 온다(부사 불가).",
    errorRecipe:
      "OC 형용사를 부사로 뒤집거나(f: *found it impossibly), 가목적어 it 을 them·소유격으로 뒤집는다(g). ⚠️ it 생략이나 it↔this/that 교체는 정답 시비가 있어 금지 — f/g 변형만 안전.",
    killerLift: "진목적어 to-V/that절이 길어 it–OC–진목적어의 연결이 한눈에 안 보이는 자리를 고른다.",
    explanationCue: "가목적어-진목적어 구조(무엇이 진짜 목적어인지) + OC 자리의 품사",
  },
  {
    id: 8,
    name: "부정어구 도치와 수일치",
    codes: ["d", "i"],
    formula:
      "부정·제한어구(Never/Not only/Hardly/Scarcely/Only then/No sooner) + [do·does·did + S + V원형 / be·have·조동사 + S (+ p.p./보어)]  /  There·장소구 + V + S",
    decision:
      "문두 부정어구는 의문문 어순 도치를 강제하며, 도치된 동사는 뒤에 오는 진짜 주어와 수일치해야 한다. 안전한 정답은 어순 자체가 아니라 **도치 후 수일치**다(어순·조동사 시제를 정답 삼으면 시비).",
    errorRecipe:
      "도치문의 조동사/동사를 뒤 진짜 주어와 불일치로 뒤집는다(*Never has the scientists, *There is many)(밑줄은 동사 1단어).",
    killerLift:
      "부정어구+완료 조동사+긴 주어의 조합, Not only A but also B 병렬과 겹친 도치처럼 두 프레임이 얽힌 자리를 고른다.",
    explanationCue: "도치를 일으킨 문두 어구 + 도치된 동사 뒤의 진짜 주어",
  },
  {
    id: 9,
    name: "형용사 자리 vs 부사 자리",
    codes: ["f"],
    formula:
      "2형식(be/remain/keep/stay/become/seem/look/sound/feel) 보어 = 형용사  /  5형식(make/find/keep/leave) OC = 형용사  /  동사·형용사·문장 수식 = 부사",
    decision:
      "우리말로 '~하게'라 번역돼도 문장 구조상 보어 자리면 반드시 형용사다. 해석이 아니라 문형(2형식/5형식)으로 판단하게 한다.",
    errorRecipe:
      "보어 자리의 형용사를 부사로 뒤집는다(*remain calmly, *found it strangely). ⚠️ 대응 부사가 없는 -ly 형용사(costly·friendly·lively·lonely·deadly)는 정답 변형 불가 — '부사로 착각하게 하는' 디코이 전용.",
    killerLift:
      "가목적어 구문의 OC, O가 긴 5형식(keep/leave + 긴 O + 형용사)처럼 보어 자리임을 문형 분석으로만 알 수 있는 자리를 고른다.",
    explanationCue: "몇 형식의 어떤 자리(주격보어/목적격보어/수식)인지 문형으로 명명",
  },
];

/** 대표 코드 → 프레임 역인덱스 (해설 검증·프롬프트 조립용) */
export function grammarFramesForCode(code: GrammarPointCode): GrammarFrame[] {
  return GRAMMAR_FRAMES.filter((frame) => frame.codes.includes(code));
}

export type GrammarFrameGuideMode = "judgment" | "correction" | "worksheet";

/**
 * 9프레임 설계 가이드 직렬화 — 기존 buildGrammarNineFrameGuide 를 대체하는
 * 프레임 지식 본문. 난이도에 따라 killerLift(킬러 승격법)를 포함한다.
 */
export function buildGrammarFrameKnowledge(
  mode: GrammarFrameGuideMode,
  requestedDifficulty?: string,
): string {
  const difficulty = String(requestedDifficulty ?? "").toUpperCase();
  const isKiller = difficulty === "KILLER";

  const frameLines = GRAMMAR_FRAMES.map((frame) => {
    const codes = frame.codes.map((code) => `(${code})`).join(",");
    const parts = [
      `${frame.id}. **${frame.name}** ${codes} — 틀: ${frame.formula}`,
      `   판단: ${frame.decision}`,
      `   오류 설계: ${frame.errorRecipe}`,
    ];
    if (isKiller) {
      parts.push(`   KILLER 승격: ${frame.killerLift}`);
    }
    parts.push(`   해설 필수 근거: ${frame.explanationCue}`);
    return parts.join("\n");
  });

  const modeLine =
    mode === "correction"
      ? "- 고쳐쓰기(서술형)에서는 오류를 절/문장 단위 밑줄 안에 숨기고, correctedPart 는 원문 표현 그대로여야 한다."
      : mode === "worksheet"
        ? "- 워크시트 네모([A / B])에서는 두 후보가 같은 자리에서 한쪽만 명백히 비문이어야 하며, 해설이 프레임 이름을 짚어야 한다."
        : "- 어법 판단(밑줄)에서는 판단이 걸리는 최소 표면(보통 1~3단어)에만 밑줄을 긋고, 정답이 아닌 밑줄은 어법상 명백히 옳아야 한다.";

  return [
    "## 어법 9프레임 — 구조 문법 출제의 정본 (이 프레임 밖의 임의 단어 교체 금지)",
    "출제는 반드시 이 절차를 따른다: ① 프레임 선택 → ② 지문에서 그 프레임의 구조 틀(formula)이 실재하는 문장 탐색 → ③ 오류 설계(errorRecipe 방향의 최소 표면 변형) → ④ 반증 검사(변형 후 문장을 다른 통사 해석으로도 읽어 '둘 다 성립'이면 폐기) → ⑤ 해설(프레임의 필수 근거를 이름 붙여 제시).",
    modeLine,
    ...frameLines,
    "- 좋은 디코이는 이 프레임들 중 하나의 실재 판단 지점에 밑줄만 긋고 어법상 옳게 둔 자리다 — 장식용 단어(관사·단순 전치사·어휘 형용사·비교 조각)는 디코이가 될 수 없다.",
    "- 해설은 반드시 그 프레임의 '해설 필수 근거'를 이름 붙여 제시해야 한다. '어색하다'는 근거가 아니다.",
    "- 지문에 정답을 가장 빨리 판별하게 해 주는 결정적 단서(예: 병렬 구조의 'and that ...' 같은 등위 접속, 상관어구 both A and B, 대응 시제·수의 앞선 짝)가 있으면, 해설에 그 단서를 반드시 짚어 정답 판별 경로를 명시하라.",
    "- 정답(오류) 포인트는 핵심 10선 안에서만 출제한다: 정동사vs준동사 / 관계사(that·what) / 분사 능·수동 / 수일치 / 능동vs수동태 / 형용사vs부사 / 대명사 일치 / 목적격보어 / 병렬구조 / to-v vs v-ing. 가정법·전치사vs접속사·비교수량은 디코이로만 쓴다.",
    "- keyPoints 는 정확히 3개, 각 항목을 실제 밑줄 라벨로 시작하라 — 형식: '(D) 능동태 vs 수동태 — 목적어 유무로 판정'. 1번째=정답 라벨, 2·3번째=학생이 가장 헷갈릴 실제 오답 라벨. 이 문항의 밑줄에 없는 문법 주제로 칸을 채우는 것 금지.",
  ].join("\n");
}
