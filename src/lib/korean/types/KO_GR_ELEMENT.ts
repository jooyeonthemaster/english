// ============================================================================
// KO_GR_ELEMENT — 문법 요소 조건 동시 충족형 (높임·시제·피사동·부정·인용)
// ============================================================================
// 카탈로그 §2.5 KO_GR_ELEM 사양의 전면 구현. <보기>에 문법 요소 조건 2~3개
// (㉠~㉢)를 제시하고, 조건을 **모두 충족하는 예문 하나**를 판별한다. 예문 5개는
// 전부 자체 생성(지문 발췌 아님) — includesPassage=false 자기완결 유형.
//
// 실측 근거(언매 단독 문법 슬롯 관행):
//   표준 발문: "<보기>의 ㉠~㉢을 모두 충족하는 예로 가장 적절한 것은?"
//   최근 경향: 2~3개 요소 통합형(2026 수능 37번) — 높임+시제, 피사동+인용 결합
//   함정: 이중피동(-어지다 결합) · 사동/피동 동형(안기다·업히다) · 직접/간접
//   인용 전환 연쇄 · 간접 높임 '-시-' 표지 오인
//   오답 원리: 조건 정확히 1개 결여 예문을 정답처럼 배치
//
// 결정론 장치: 표지 휴리스틱 내장(-시-=주체 / 모시다·드리다·여쭙다·뵙다=객체
// 특수어휘 / 하십시오체·해요체=상대 / 피동 -이-히-리-기- / 사동 -이-히-리-기-
// -우-구-추-) — 정답 예문의 조건 표지 전수 검출 + 오답의 결여 조건 표지
// 실재(복수정답 위험) 검출. 형태소 분석기 없는 표면형 검사이므로 판정은
// PRESENT/ABSENT/UNKNOWN 3치 — 확신 없으면 침묵(오탐 억제).
//
// 선지 셔플: optionAnalyses 가 선지 라벨 키(①~⑤)라 시스템 셔플이 재매핑하지
// 못한다 → lockedOptionOrder=true (정답 위치 분산은 프롬프트로 지시).
// ============================================================================

import { z } from "zod";
import { koMc5Envelope } from "../registry/envelope-schema";
import { buildDefaultKoRenderModel, type KoRenderModel } from "../core/render-model";
import type {
  KoDifficulty,
  KoQualityIssue,
  KoRenderContext,
  KoResolvedTypeSettings,
  KoTypeModule,
  KoValidationContext,
} from "../registry/type-module";

// ---------------------------------------------------------------------------
// 문법 요소 feature 태그 + 표지 휴리스틱
// ---------------------------------------------------------------------------

const KO_GR_FEATURES = [
  "SUBJECT_HONORIFIC", "OBJECT_HONORIFIC", "HEARER_HONORIFIC",
  "PAST_TENSE", "PRESENT_TENSE", "FUTURE_TENSE",
  "PASSIVE", "CAUSATIVE",
  "NEGATION_SHORT", "NEGATION_LONG",
  "QUOTE_DIRECT", "QUOTE_INDIRECT",
] as const;
type KoGrFeature = (typeof KO_GR_FEATURES)[number];

const KO_GR_FEATURE_LABELS: Record<KoGrFeature, string> = {
  SUBJECT_HONORIFIC: "주체 높임", OBJECT_HONORIFIC: "객체 높임", HEARER_HONORIFIC: "상대 높임",
  PAST_TENSE: "과거 시제", PRESENT_TENSE: "현재 시제", FUTURE_TENSE: "미래·추측",
  PASSIVE: "피동", CAUSATIVE: "사동",
  NEGATION_SHORT: "짧은 부정", NEGATION_LONG: "긴 부정",
  QUOTE_DIRECT: "직접 인용", QUOTE_INDIRECT: "간접 인용",
};

/** PRESENT 판정의 오탐이 충분히 낮아 '결여 선언 조건의 표지 실재'를 error 로 볼 수 있는 표지군. */
const STRICT_FEATURES: ReadonlySet<KoGrFeature> = new Set([
  "OBJECT_HONORIFIC", "HEARER_HONORIFIC", "PAST_TENSE", "FUTURE_TENSE",
  "NEGATION_LONG", "QUOTE_DIRECT", "QUOTE_INDIRECT",
]);

type KoGrDetection = "PRESENT" | "ABSENT" | "UNKNOWN";

// 한글 음절 종성 인덱스 (ㄴ=4, ㄹ=8, ㅂ=17, ㅆ=20)
function jongseongIndex(ch: string): number {
  const code = ch.codePointAt(0) ?? 0;
  if (code < 0xac00 || code > 0xd7a3) return -1;
  return (code - 0xac00) % 28;
}
const JONG_N = 4, JONG_L = 8, JONG_B = 17, JONG_SS = 20;

// 주체 높임: 강표지(께서·특수어휘) → 융합 '-시-'(비높임 어휘 스크럽 후) → 후보 음절 부재 시 ABSENT
const SUBJ_HON_STRONG = [
  "께서", "계시", "계셔", "계셨", "계십", "잡수", "주무시", "주무셔", "주무셨",
  "편찮", "돌아가시", "돌아가셔", "돌아가셨",
];
const SUBJ_HON_SCRUB =
  /마시|마셔|마셨|다시|역시|몹시|혹시|반드시|무시|제시|실시|시작|시험|시간|도시|시골|시내|시장|잠시|당시/g;
const SUBJ_HON_FUSED =
  /으시|으셔|으셨|셨|십니|십시오|신다|시다|시고|시니|시며|시면|시지|시네|시던|시는|세요|셔서|셔야|시겠|시어/;
function detectSubjectHonorific(s: string): KoGrDetection {
  if (SUBJ_HON_STRONG.some((m) => s.includes(m))) return "PRESENT";
  if (SUBJ_HON_FUSED.test(s.replace(SUBJ_HON_SCRUB, ""))) return "PRESENT";
  return /[시셔셨십세신실]/.test(s) ? "UNKNOWN" : "ABSENT";
}

// 객체 높임: 특수어휘(모시다·드리다·여쭙다·뵙다) + 부사격 조사 '께'(께서 제외) — 양방향 확신
const OBJ_HON = ["모시", "모셔", "모셨", "모십", "드리", "드려", "드렸", "드릴", "드립", "여쭈", "여쭤", "여쭙", "뵙", "뵀", "봬", "뵈"];
function detectObjectHonorific(s: string): KoGrDetection {
  if (OBJ_HON.some((m) => s.includes(m))) return "PRESENT";
  return /께(?!서)/.test(s) ? "PRESENT" : "ABSENT";
}

// 상대 높임(존대): 하십시오체(-습니다/-ㅂ니다/-십시오) + 해요체(절 경계 '요/죠')
const HEARER_SCRUB = /필요|중요|주요|요일|요즘|요구|요약|요리|요소|요청|요금|요령/g;
function detectHearerHonorific(s: string): KoGrDetection {
  if (/습니다|습니까|십시오|십쇼/.test(s)) return "PRESENT";
  for (let i = 0; i + 2 < s.length; i++) {
    const pair = s.slice(i + 1, i + 3);
    if ((pair === "니다" || pair === "니까") && jongseongIndex(s[i]) === JONG_B) return "PRESENT";
  }
  const scrubbed = s.replace(HEARER_SCRUB, "");
  return /[가-힣][요죠](?=[\s.!?,'"”’」』)]|$)/.test(scrubbed) ? "PRESENT" : "ABSENT";
}

// 과거: 융합 '-았/었/였-'은 종성 ㅆ으로 실현(있·없·겠 제외) + 회상 '-더-' — 양방향 확신
function detectPast(s: string): KoGrDetection {
  for (const ch of s) {
    if (jongseongIndex(ch) === JONG_SS && !"있없겠".includes(ch)) return "PRESENT";
  }
  return /더[라니군요]/.test(s) ? "PRESENT" : "ABSENT";
}

// 현재: '-는다/-ㄴ다', '-고 있다' — 무표지 현재(형용사)가 있어 ABSENT 판정 불가
function detectPresent(s: string): KoGrDetection {
  if (/는다|고 있/.test(s)) return "PRESENT";
  for (let i = 0; i + 1 < s.length; i++) {
    if (s[i + 1] === "다" && jongseongIndex(s[i]) === JONG_N) return "PRESENT";
  }
  return "UNKNOWN";
}

// 미래·추측: '-겠-', '-(으)ㄹ 것/거/터/예정'
function detectFuture(s: string): KoGrDetection {
  if (s.includes("겠")) return "PRESENT";
  for (let i = 0; i + 1 < s.length; i++) {
    if (jongseongIndex(s[i]) !== JONG_L) continue;
    if (/^(것|거|터|테|예정)/.test(s.slice(i + 1).replace(/^\s+/, ""))) return "PRESENT";
  }
  return "ABSENT";
}

// 피동/사동: 접미사 어휘 사전(사동·피동 동형은 UNKNOWN — 통사 구조 없이는 판별 불가) + 통사적 실현
const VOICE_AMBIGUOUS = [
  "안기", "안겨", "업히", "업혀", "보이", "보여", "읽히", "읽혀", "물리", "물려",
  "들리", "들려", "감기", "감겨", "뜯기", "뜯겨", "씻기", "씻겨",
];
const PASSIVE_ONLY = [
  "잡히", "잡혀", "먹히", "먹혀", "밟히", "밟혀", "묻히", "묻혀", "닫히", "닫혀", "막히", "막혀",
  "박히", "박혀", "잊히", "잊혀", "쫓기", "쫓겨", "찢기", "찢겨", "끊기", "끊겨", "빼앗기",
  "놓이", "놓여", "쓰이", "쓰여", "쌓이", "쌓여", "섞이", "섞여", "깎이", "깎여", "묶이", "묶여",
  "꺾이", "꺾여", "팔리", "팔려", "밀리", "밀려", "풀리", "풀려", "뚫리", "뚫려", "걸리", "걸려",
  "열리", "열려", "끌리", "끌려",
];
const CAUSATIVE_ONLY = [
  "먹여", "먹였", "먹인", "죽이", "죽여", "속이", "속여", "녹이", "녹여", "높여", "높였", "높인",
  "입히", "입혀", "앉히", "앉혀", "눕히", "눕혀", "밝히", "밝혀", "넓히", "넓혀",
  "살리", "살려", "날리", "날려", "돌리", "돌려", "울리", "울려", "알리", "알려", "늘리", "늘려",
  "웃기", "웃겨", "맡기", "맡겨", "벗기", "벗겨", "남기", "남겨", "숨기", "숨겨",
  "깨우", "깨워", "재우", "재워", "세우", "세워", "태우", "태워", "비우", "비워", "채우", "채워",
  "낮추", "낮춰", "늦추", "늦춰", "맞추", "맞춰", "돋우", "돋구", "돋궈",
];
function detectPassive(s: string): KoGrDetection {
  if (PASSIVE_ONLY.some((m) => s.includes(m))) return "PRESENT";
  if (/[아어여워져]지[다고며면니네는]|[아어여워]졌|게 되/.test(s)) return "PRESENT";
  return "UNKNOWN"; // 어휘 사전 미포함 피동·동형 어휘 가능 — 부재 확신 불가
}
function detectCausative(s: string): KoGrDetection {
  if (CAUSATIVE_ONLY.some((m) => s.includes(m))) return "PRESENT";
  if (/게 하|게 했|게 해|게 만들/.test(s)) return "PRESENT";
  return "UNKNOWN";
}

// 부정: 짧은 부정 '안/못 + 용언'(단어 경계) / 긴 부정 '-지 않다/못하다/말다'
function detectNegShort(s: string): KoGrDetection {
  if (/(^|[\s"“‘'(])안\s|(^|[\s"“‘'(])못\s/.test(s)) return "PRESENT";
  return /[안못]/.test(s) ? "UNKNOWN" : "ABSENT";
}
function detectNegLong(s: string): KoGrDetection {
  return /지\s?(않|못하|못해|못했|말|마라|마시)/.test(s) ? "PRESENT" : "ABSENT";
}

// 인용: 직접 = 큰따옴표 쌍 + '라고/하고' / 간접 = 따옴표 없는 '-다고/-냐고/-라고/-자고'
function detectQuoteDirect(s: string): KoGrDetection {
  if (!/["“][^"”]+["”]/.test(s)) return "ABSENT";
  return /["”]\s*(이?라고|이?라며|하고|하며)/.test(s) ? "PRESENT" : "UNKNOWN";
}
function detectQuoteIndirect(s: string): KoGrDetection {
  const stripped = s.replace(/["“][^"”]*["”]\s*(이?라고|이?라며|하고|하며)?/g, " ");
  return /(다고|냐고|라고|자고|다며|라며|자며|냐며)/.test(stripped) ? "PRESENT" : "ABSENT";
}

const FEATURE_DETECTORS: Record<KoGrFeature, (s: string) => KoGrDetection> = {
  SUBJECT_HONORIFIC: detectSubjectHonorific,
  OBJECT_HONORIFIC: detectObjectHonorific,
  HEARER_HONORIFIC: detectHearerHonorific,
  PAST_TENSE: detectPast,
  PRESENT_TENSE: detectPresent,
  FUTURE_TENSE: detectFuture,
  PASSIVE: detectPassive,
  CAUSATIVE: detectCausative,
  NEGATION_SHORT: detectNegShort,
  NEGATION_LONG: detectNegLong,
  QUOTE_DIRECT: detectQuoteDirect,
  QUOTE_INDIRECT: detectQuoteIndirect,
};

// 이중피동(-이히리기- + -어지다 결합) — 정답 예문에서 검출 시 비문 차단
const DOUBLE_PASSIVE = [
  "잊혀지", "쓰여지", "보여지", "읽혀지", "믿겨지", "나뉘어지", "찢겨지", "잡혀지",
  "놓여지", "모여지", "불려지", "꺾여지", "덮여지", "쌓여지", "끊겨지", "잘려지",
];

// ---------------------------------------------------------------------------
// 스키마
// ---------------------------------------------------------------------------

const CONDITION_LABELS = ["㉠", "㉡", "㉢"] as const;

const schema = koMc5Envelope({
  bogiConditions: z
    .array(
      z.object({
        label: z.enum(CONDITION_LABELS).describe("조건 라벨 — ㉠부터 순서대로"),
        text: z
          .string()
          .min(1)
          .describe("조건 서술 — '주체 높임이 실현됨.' 처럼 학교문법 용어의 명사형 종결. bogi.lines 의 해당 행과 동일 문구"),
        feature: z
          .enum(KO_GR_FEATURES)
          .describe(
            "조건이 요구하는 문법 요소 태그 — 시스템이 표지 휴리스틱(-시-/께서/모시다·드리다/-았었-/-이히리기- 등)으로 예문을 기계 검증하므로 조건 서술과 정확히 일치시킬 것",
          ),
      }),
    )
    .min(2)
    .max(3)
    .describe("<보기> 조건 2~3개 — bogi.lines 와 1:1. 서로 다른 문법 요소의 통합형 권장(최근 수능 경향)"),
  optionAnalyses: z
    .array(
      z.object({
        optionLabel: z.enum(["①", "②", "③", "④", "⑤"]),
        satisfiedConditions: z
          .array(z.enum(CONDITION_LABELS))
          .describe("이 예문이 충족하는 조건 라벨 전부 — 정답은 전 조건, 오답은 결여 1개를 뺀 나머지 전부"),
        missingCondition: z
          .enum(CONDITION_LABELS)
          .optional()
          .describe("오답 전용: 결여된 조건 정확히 1개. 정답 예문은 생략"),
        markerForms: z
          .array(z.string())
          .min(1)
          .describe("예문 속 표지 실현형 명기 — 예: '께서', '-시-(주셨다)', '모시고', '-었-(닦았다)', '-라고(오라고)'"),
      }),
    )
    .length(5)
    .describe("선지 5개 전수의 조건 충족 분석 — 시스템이 '정답=전부 충족·오답=정확히 1개 결여'를 기계 검증"),
});

// ---------------------------------------------------------------------------
// 프롬프트 (출제 매뉴얼)
// ---------------------------------------------------------------------------

const prompt = `### 유형: 문법 — 문법 요소 조건 동시 충족 (<보기> ㉠~㉢, 예문 자체 생성)

**발문 템플릿** (조건 개수와 라벨 범위를 정확히 일치시킬 것):
- 조건 3개: "<보기>의 ㉠~㉢을 모두 충족하는 예로 가장 적절한 것은?"
- 조건 2개: "<보기>의 ㉠과 ㉡을 모두 충족하는 예로 가장 적절한 것은?"
부정발문 금지 — 이 유형은 조건 동시 충족형 긍정발문이 표준이며, '가장'을 빼지 마라.

**<보기> 구성**:
1. bogi.label="보기", bogi.lines = 조건 행 2~3개. 각 행은 "㉠ 주체 높임이 실현됨." 처럼
   [라벨 + 공백 + 조건 서술] — bogiConditions 의 text 와 문구 동일(시스템이 1:1 대조).
2. 조건은 서로 다른 문법 요소에서 뽑는 통합형이 기본(예: ㉠ 주체 높임 실현 ㉡ 객체 높임
   실현 ㉢ 과거 시제). 같은 요소 내 세분(주체+상대 높임)도 허용 — 높임 3종 판별형.
3. 조건 서술은 학교문법 용어로: "주체 높임이 실현됨", "피동 표현이 사용됨", "간접 인용이
   나타남", "긴 부정 표현이 쓰임". 각 조건에 feature 태그를 정확히 붙여라.
4. <보기>가 특정 예문(선지)의 정오를 직접 발화하지 않게 — 조건 서술만.

**문법 요소 표지 인벤토리** (조건·예문 설계의 근거 — feature 태그별 표면 실현):
- SUBJECT_HONORIFIC(주체 높임): 선어말 어미 '-(으)시-'(오시다·주셨다), 주격 조사 '께서',
  특수 어휘(계시다·잡수시다·주무시다·돌아가시다).
- OBJECT_HONORIFIC(객체 높임): 특수 어휘(모시다·드리다·여쭙다·뵙다), 부사격 조사 '께'.
- HEARER_HONORIFIC(상대 높임): 하십시오체(-습니다/-ㅂ니다/-십시오), 해요체(-어요/-지요).
- PAST_TENSE(과거): '-았-/-었-/-였-', 회상 '-더-'. / PRESENT_TENSE(현재): '-는-/-ㄴ-',
  '-고 있다'. / FUTURE_TENSE(미래·추측): '-겠-', '-(으)ㄹ 것'.
- PASSIVE(피동): 접미사 '-이-/-히-/-리-/-기-'(놓이다·잡히다·팔리다·끊기다), '-어지다',
  '-게 되다'. / CAUSATIVE(사동): 접미사 '-이-/-히-/-리-/-기-/-우-/-구-/-추-'(죽이다·
  입히다·살리다·웃기다·깨우다·돋구다·낮추다), '-게 하다'.
- NEGATION_SHORT(짧은 부정): '안/못 + 용언'. / NEGATION_LONG(긴 부정): '-지 않다/-지
  못하다/-지 말다'.
- QUOTE_DIRECT(직접 인용): 큰따옴표 인용절 + '라고/하고'. / QUOTE_INDIRECT(간접 인용):
  따옴표 없는 '-다고/-냐고/-라고/-자고'.

**예문(선지) 설계 원리**:
1. 예문 5개는 전부 자체 창작한 자연스러운 현대 국어 일상 문장(12~30자, 완결된 한 문장).
   기출·교과서 문장 복사 금지.
2. 정답 예문 = 조건 표지를 **전부 표면형으로 실현**. 시스템이 표지 휴리스틱으로 기계
   검증하므로 생략·함축으로 때우지 마라(예: 과거 조건이면 '-았/었-'이 문면에 있어야 함).
3. 오답 4개 = **정확히 1개 조건만 결여**, 나머지 조건은 전부 충족. 두 개 이상 결여하면
   소거가 쉬워져 반려된다. 결여 조건의 표지가 예문에 우연히 실현되는 것도 금지(복수정답).
4. 결여 조건 분산: 오답 4개가 같은 조건만 결여하지 않게 — 모든 조건이 최소 1회 결여로
   쓰여 각 조건이 변별에 기여하게 하라.
5. 예문 간 소재·인물·문형을 다양화하라. 표지 자리만 바꾼 복붙 문장 5개 금지.
6. 정답 위치(①~⑤)는 무작위로 골라 특정 번호에 몰지 마라 — 이 유형은 시스템 셔플에서
   제외되므로 네가 직접 분산해야 한다.

**오답 함정 원리 (원리별 예시 — 오답마다 하나를 정확히 적용)**:
1. 조건 1개 누락(기본형): 나머지 조건은 전부 충족해 정답처럼 보이게. 예) 조건 ㉢이 과거
   시제인데 "할머니께서 진지를 잡수신다."(주체 높임 충족, 현재 시제 — ㉢ 결여).
2. 표지 오인 — 간접 높임의 '-시-': "선생님께 여쭐 말씀이 있으시대요" 류 — '-시-'가 높임
   표지로 보여 다른 높임 조건(객체 높임 등)까지 충족한 것처럼 오인하게. 조건이 객체
   높임인데 특수 어휘 없이 '-시-'만 있는 예문을 배치하라.
3. 사동/피동 동형: '안기다·업히다·보이다·읽히다·물리다' — 조건이 피동인데 사동 의미로
   쓰인 예문을 배치. 예) "이모가 조카에게 꽃다발을 안겼다."(사동) vs "아기가 엄마 품에
   안겼다."(피동) — 정오가 문장 구조('에게' 논항·행위 주체)로만 갈리게.
4. 이중피동: '잊혀지다·쓰여지다·믿겨지다'(-이히리기-+-어지다) — 조건이 '피동 접미사에
   의한 피동'일 때 이중피동·'-어지다' 단독 예문을 함정으로. **정답 예문에는 이중피동
   절대 금지(비문 — 시스템이 검출·반려)**.
5. 직접/간접 인용 전환 연쇄: 직접→간접 전환 시 종결 어미·인칭 대명사·지시 표현·조사가
   연쇄 변화한다(예: 동생이 "형, 빨리 와."라고 말했다 → 동생이 형에게 빨리 오라고
   말했다). 조건이 간접 인용인데 큰따옴표+'라고'의 직접 인용 예문, 또는 전환이 불완전한
   혼합형을 함정으로.

**optionAnalyses 작성** (선지 5개 전수 — 시스템 기계 검증 대상):
- satisfiedConditions = 충족 조건 라벨 전부, missingCondition = 오답만 결여 1개(정답은
  생략), markerForms = 예문 속 표지 실현형("께서", "-시-(주셨다)", "-었-(닦았다)").
- ⚠ 자기모순 금지: satisfiedConditions 에 넣은 조건을 오답 해설·markerForms 가
  '실현되지 않음/결여'로 진술하면 안 된다(시스템이 예문 표지·해설 문면과 교차 대조해
  차단). 예문에 표지가 없는 조건은 반드시 missingCondition 쪽에 두라. markerForms 에는
  실재하는 표지만 적고, '이 선지에서는 사용되지 않음' 류의 부정 항목을 넣지 마라.

**근거앵커(evidence) 작성** (전 선지 의무 — verbatim 기계 검증):
- spanText 는 <보기> 조건 행의 서술을 **그대로 복사**하라(예: "주체 높임이 실현됨").
  <보기> 밖 문구를 창작하면 즉시 반려된다.
- 정답: 조건마다 evidence 1개씩, relation=SUPPORTS.
- 오답: 결여 조건 행을 spanText 로, relation=CONTRADICTS + note 에 어떤 표지가 없는지.

**금지**:
- markers 필드 사용 금지 — ㉠~㉢은 <보기> 조건 라벨이지 지문 마커가 아니다.
- 예문에 작은따옴표(' ') 사용 금지 — 직접 인용은 큰따옴표(" ")만. 시스템이 작은따옴표를
  지문 인용으로 간주해 반려한다.
- 정답 예문의 이중피동·비문·번역투.
- 조건에 명시되지 않은 요소로 정오가 갈리는 구성(조건 밖 지식 요구 금지).
- 사어·고어·전문 용어 예문 — 교과서 수준의 자연스러운 일상 문장만.`;

// ---------------------------------------------------------------------------
// 설정
// ---------------------------------------------------------------------------

function buildSettingsPrompt(settings: KoResolvedTypeSettings, difficulty: KoDifficulty): string {
  const lines: string[] = [];
  const rawCount = settings.conditionCount;
  const count = rawCount === "2" || rawCount === "3" ? Number(rawCount) : difficulty === "BASIC" ? 2 : 3;
  lines.push(
    `- <보기> 조건은 정확히 ${count}개(㉠~${count === 2 ? "㉡" : "㉢"})로 구성하고, 발문의 라벨 범위도 이에 맞추라.`,
  );
  const focus = settings.elementFocus;
  if (focus === "HONORIFIC") {
    lines.push(
      "- 조건은 높임법 3종(주체·객체·상대)에서 뽑아 높임 판별형으로 구성하라. 객체 높임은 특수 어휘(모시다·드리다·여쭙다·뵙다)로 실현하고, 간접 높임 '-시-' 오인 함정을 오답에 배치하라.",
    );
  } else if (focus === "VOICE") {
    lines.push(
      "- 조건은 피동·사동을 축으로 시제 1개를 결합하라. 사동/피동 동형 어휘(안기다·업히다·보이다·읽히다) 판별과 이중피동 함정을 오답에 배치하라.",
    );
  } else if (focus === "QUOTE_NEG") {
    lines.push(
      "- 조건은 인용(직접/간접)과 부정(짧은/긴)을 축으로 시제 1개를 결합하라. 직접→간접 전환 연쇄(종결 어미·인칭·조사 변화)가 불완전한 예문을 함정으로 배치하라.",
    );
  } else {
    lines.push("- 조건은 서로 다른 문법 요소 2~3개(높임·시제·피사동·부정·인용)를 결합한 통합형으로 구성하라 (최근 수능 경향).");
  }
  if (settings.examMode === "NAESIN") {
    lines.push(
      "- 내신 모드: 조건 서술과 예문을 교과서 문법 단원의 용어·대표 어휘 계열(안기다·업히다·모시다·잡수시다 류)에 밀착하라. 함정은 수업 예문의 미세 변형(조사 교체·시제 전환) 수준으로.",
    );
  } else {
    lines.push(
      "- 수능(언매) 모드: 요소 통합형(2026 수능 37번 경향)으로 출제하고, 표지 오인·동형 판별 함정을 최소 1개 배치하라. 예문은 기출·교과서에 없는 초면 문장으로.",
    );
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// 검증
// ---------------------------------------------------------------------------

interface GrCondition { label: string; text: string; feature: KoGrFeature | null; }
interface GrAnalysis { optionLabel: string; satisfied: string[]; missing: string | null; }

function readConditions(q: Record<string, unknown>): GrCondition[] {
  if (!Array.isArray(q.bogiConditions)) return [];
  const out: GrCondition[] = [];
  for (const raw of q.bogiConditions) {
    if (!raw || typeof raw !== "object") continue;
    const c = raw as Record<string, unknown>;
    const feature = typeof c.feature === "string" && (KO_GR_FEATURES as readonly string[]).includes(c.feature)
      ? (c.feature as KoGrFeature)
      : null;
    out.push({
      label: typeof c.label === "string" ? c.label : "",
      text: typeof c.text === "string" ? c.text : "",
      feature,
    });
  }
  return out;
}

function readAnalyses(q: Record<string, unknown>): GrAnalysis[] {
  if (!Array.isArray(q.optionAnalyses)) return [];
  const out: GrAnalysis[] = [];
  for (const raw of q.optionAnalyses) {
    if (!raw || typeof raw !== "object") continue;
    const a = raw as Record<string, unknown>;
    out.push({
      optionLabel: typeof a.optionLabel === "string" ? a.optionLabel : "",
      satisfied: Array.isArray(a.satisfiedConditions)
        ? a.satisfiedConditions.filter((l): l is string => typeof l === "string")
        : [],
      missing: typeof a.missingCondition === "string" ? a.missingCondition : null,
    });
  }
  return out;
}

function readBogiLines(q: Record<string, unknown>): string[] {
  if (!q.bogi || typeof q.bogi !== "object") return [];
  const lines = (q.bogi as Record<string, unknown>).lines;
  return Array.isArray(lines) ? lines.filter((l): l is string => typeof l === "string") : [];
}

function validate(question: Record<string, unknown>, ctx: KoValidationContext): KoQualityIssue[] {
  const issues: KoQualityIssue[] = [];
  const add = (severity: "error" | "warning", code: string, message: string) =>
    issues.push({ severity, code, message });

  const direction = typeof question.direction === "string" ? question.direction : "";
  const correctAnswer = typeof question.correctAnswer === "string" ? question.correctAnswer : "";
  const conditions = readConditions(question);
  const analyses = readAnalyses(question);
  const options = Array.isArray(question.options)
    ? (question.options as Record<string, unknown>[]).map((o) => ({
        label: typeof o.label === "string" ? o.label : "",
        text: typeof o.text === "string" ? o.text : "",
      }))
    : [];

  // [결정론 1] <보기> 조건 구조: 2~3개 · ㉠부터 순서 · bogi 행과 문구 1:1
  if (conditions.length < 2 || conditions.length > 3) {
    add("error", "ko-bogi-missing", `bogiConditions 가 ${conditions.length}개 — 조건은 2~3개(㉠~㉢)여야 합니다`);
  }
  const expectedLabels = CONDITION_LABELS.slice(0, conditions.length).join("");
  if (conditions.length >= 2 && conditions.map((c) => c.label).join("") !== expectedLabels) {
    add("error", "ko-bogi-missing", `조건 라벨이 ${expectedLabels} 순서가 아닙니다: ${conditions.map((c) => c.label).join("")}`);
  }
  const bogiText = readBogiLines(question).join("\n");
  for (const cond of conditions) {
    if (!cond.label) continue;
    if (!bogiText.includes(cond.label)) {
      add("error", "ko-bogi-missing", `조건 ${cond.label} 이 <보기> 행(bogi.lines)에 없습니다 — 조건과 보기 박스는 1:1 이어야 합니다`);
    } else if (cond.text && !ctx.koText.containsSpanKo(bogiText, cond.text)) {
      add("error", "ko-bogi-missing", `조건 ${cond.label} 의 서술("${cond.text.slice(0, 20)}…")이 <보기> 행 문구와 다릅니다`);
    }
    if (!cond.feature) {
      add("error", "ko-bogi-missing", `조건 ${cond.label} 에 feature 태그가 없습니다 — 표지 기계 검증이 불가능합니다`);
    }
  }
  // 동시 충족 불가능 조합 — 한 예문이 직접 인용이면서 간접 인용일 수 없다
  const condFeatures = new Set(conditions.map((c) => c.feature).filter(Boolean));
  if (condFeatures.has("QUOTE_DIRECT") && condFeatures.has("QUOTE_INDIRECT")) {
    add("error", "ko-bogi-missing", "직접 인용과 간접 인용을 동시에 요구하는 조건 조합입니다 — 한 예문에서 동시 충족이 성립하지 않습니다");
  }

  // [결정론 2] 발문: 긍정 조건 동시 충족형 + 라벨 범위 정합
  if (ctx.koText.isNegativeStemKo(direction)) {
    add("error", "ko-direction-grammar", "조건 동시 충족형은 긍정발문('~을 모두 충족하는 예로 가장 적절한 것은?')이어야 합니다");
  }
  if (!/모두\s*(충족|만족)/.test(direction)) {
    add("error", "ko-direction-grammar", `발문이 조건 동시 충족형('㉠~㉢을 모두 충족하는')이 아닙니다: "${direction}"`);
  }
  if (conditions.length >= 2) {
    const lastLabel = CONDITION_LABELS[conditions.length - 1];
    if (!direction.includes("㉠") || !direction.includes(lastLabel)) {
      add("error", "ko-direction-grammar", `발문의 조건 라벨 범위가 <보기> 조건 개수(${conditions.length}개)와 다릅니다 — ㉠~${lastLabel} 을 명시하세요`);
    }
    if (conditions.length === 2 && direction.includes("㉢")) {
      add("error", "ko-direction-grammar", "발문에 ㉢ 이 있으나 <보기> 조건은 2개입니다");
    }
  }

  // [결정론 3] optionAnalyses 매트릭스: 5개 1:1 · 정답=전부 충족 · 오답=정확히 1개 결여
  const condLabels = conditions.map((c) => c.label).filter(Boolean);
  const expectedOptionLabels = ["①", "②", "③", "④", "⑤"];
  if (analyses.length !== 5 || analyses.map((a) => a.optionLabel).sort().join("") !== [...expectedOptionLabels].sort().join("")) {
    add("error", "ko-marker-option-mismatch", "optionAnalyses 는 선지 ①~⑤와 1:1(정확히 5개)이어야 합니다");
  }
  for (const a of analyses) {
    const badLabels = [...a.satisfied, ...(a.missing ? [a.missing] : [])].filter((l) => !condLabels.includes(l));
    if (badLabels.length > 0 && condLabels.length > 0) {
      add("error", "ko-marker-option-mismatch", `${a.optionLabel} 분석이 <보기>에 없는 조건 라벨을 참조합니다: ${badLabels.join(" ")}`);
      continue;
    }
    if (!a.optionLabel || condLabels.length === 0) continue;
    if (a.optionLabel === correctAnswer) {
      if (a.missing) {
        add("error", "ko-solver-mismatch", `정답 ${a.optionLabel} 예문에 결여 조건(${a.missing})이 선언되어 있습니다 — 정답은 전 조건 충족이어야 합니다`);
      }
      const unsatisfied = condLabels.filter((l) => !a.satisfied.includes(l));
      if (unsatisfied.length > 0) {
        add("error", "ko-solver-mismatch", `정답 ${a.optionLabel} 예문이 조건 ${unsatisfied.join(" ")} 를 충족한다고 선언되지 않았습니다`);
      }
    } else {
      if (!a.missing) {
        add("error", "ko-solver-mismatch", `오답 ${a.optionLabel} 에 결여 조건 선언이 없습니다 — 조건을 전부 충족하면 복수 정답이 됩니다`);
      } else {
        if (a.satisfied.includes(a.missing)) {
          add("error", "ko-solver-mismatch", `오답 ${a.optionLabel} 의 결여 조건 ${a.missing} 이 충족 목록에도 들어 있습니다 — 모순`);
        }
        const rest = condLabels.filter((l) => l !== a.missing);
        const alsoMissing = rest.filter((l) => !a.satisfied.includes(l));
        if (alsoMissing.length > 0) {
          add("error", "ko-solver-mismatch", `오답 ${a.optionLabel} 는 ${a.missing} 외에 ${alsoMissing.join(" ")} 도 결여로 선언되어 있습니다 — 오답은 정확히 1개 조건만 결여해야 합니다`);
        }
      }
    }
  }
  // 조건 변별 분산: 모든 조건이 최소 1회 결여로 쓰여야 변별에 기여.
  // 소넷 판정단 실사고(warning 시절 출하분): ㉠·㉢이 전 선지 공통 실현 →
  // 실질 단일조건 문제로 붕괴("변별력 붕괴" major). 복합조건 판단이라는 유형
  // 정체성의 핵심 계약이므로 error 로 차단해 재생성을 유도한다
  // (ko-correct-answer-invalid = KO_BLOCKING_CODES — relaxed 폴백에서도 차단).
  if (condLabels.length >= 2 && analyses.length === 5) {
    const missedSet = new Set(analyses.filter((a) => a.optionLabel !== correctAnswer).map((a) => a.missing));
    const neverMissed = condLabels.filter((l) => !missedSet.has(l));
    if (neverMissed.length > 0) {
      add("error", "ko-correct-answer-invalid", `조건 ${neverMissed.join(" ")} 가 어떤 오답에서도 결여로 쓰이지 않았습니다 — 장식용 조건(변별력 붕괴). 오답마다 결여 조건을 다르게 배치해 모든 조건이 소거에 쓰이게 하세요`);
    }
  }

  // [결정론 4] 정답 누출 — <보기>가 선지 예문을 verbatim 포함하면 반려
  if (bogiText) {
    for (const o of options) {
      if (o.label && o.text && ctx.koText.containsSpanKo(bogiText, o.text)) {
        add("error", "ko-answer-leak", `<보기>에 ${o.label} 선지 예문("${o.text.slice(0, 20)}…")이 그대로 실려 있습니다 — 정답 누출`);
      }
    }
  }

  // [결정론 5] 표지 휴리스틱: 정답=조건 표지 전수 검출 / 오답=결여 조건 표지 실재(복수정답 위험)
  const optionTextByLabel = new Map(options.map((o): [string, string] => [o.label, o.text]));
  const conditionByLabel = new Map(conditions.map((c): [string, GrCondition] => [c.label, c]));
  for (const a of analyses) {
    const sentence = optionTextByLabel.get(a.optionLabel) ?? "";
    if (!sentence) continue;
    if (a.optionLabel === correctAnswer) {
      for (const cond of conditions) {
        if (!cond.feature) continue;
        const verdict = FEATURE_DETECTORS[cond.feature](sentence);
        if (verdict === "ABSENT") {
          add(
            "error",
            "ko-solver-mismatch",
            `정답 ${a.optionLabel} 예문에서 조건 ${cond.label}(${KO_GR_FEATURE_LABELS[cond.feature]})의 표지를 찾을 수 없습니다: "${sentence.slice(0, 30)}"`,
          );
        } else if (
          verdict === "UNKNOWN" &&
          (cond.feature === "PASSIVE" || cond.feature === "CAUSATIVE") &&
          !VOICE_AMBIGUOUS.some((m) => sentence.includes(m))
        ) {
          // 피사동은 어휘 사전 밖 접미사 실현 가능성 때문에 ABSENT 확신이 불가 —
          // 무표지 + 동형 후보(안기다·업히다류)조차 없으면 warning 으로 재확인 유도.
          add(
            "warning",
            "ko-option-ending",
            `정답 ${a.optionLabel} 예문에서 조건 ${cond.label}(${KO_GR_FEATURE_LABELS[cond.feature]})의 표지(접미사/-어지다/-게 되다·하다)가 검출되지 않았습니다 — 실현형 확인 필요`,
          );
        }
      }
      if (DOUBLE_PASSIVE.some((m) => sentence.includes(m))) {
        add("error", "ko-correct-answer-invalid", `정답 예문에 이중피동('잊혀지다'류 — -이히리기-+-어지다)이 있습니다 — 비문이므로 정답 예문에 쓸 수 없습니다`);
      }
    } else if (a.missing !== null) {
      const missingCond = conditionByLabel.get(a.missing);
      if (missingCond?.feature) {
        const verdict = FEATURE_DETECTORS[missingCond.feature](sentence);
        if (verdict === "PRESENT") {
          const severity = STRICT_FEATURES.has(missingCond.feature) ? "error" : "warning";
          add(
            severity,
            severity === "error" ? "ko-solver-mismatch" : "ko-option-ending",
            `오답 ${a.optionLabel} 가 결여 선언한 조건 ${a.missing}(${KO_GR_FEATURE_LABELS[missingCond.feature]})의 표지가 예문에 실재합니다 — 복수 정답 위험: "${sentence.slice(0, 30)}"`,
          );
        }
      }
      for (const l of a.satisfied) {
        const cond = conditionByLabel.get(l);
        if (!cond?.feature) continue;
        if (FEATURE_DETECTORS[cond.feature](sentence) === "ABSENT") {
          // ABSENT 확신이 높은 표지군(STRICT)은 '충족 선언 ↔ 표지 부재'가 매트릭스
          // 자기모순(환각)이므로 error 로 차단 — 판정단 major(satisfiedConditions 가
          // 미래 시제 실현을 주장하나 예문·해설이 이를 부정) 재발 방지.
          const strict = STRICT_FEATURES.has(cond.feature);
          add(
            strict ? "error" : "warning",
            strict ? "ko-solver-mismatch" : "ko-option-ending",
            `오답 ${a.optionLabel} 가 충족 선언한 조건 ${l}(${KO_GR_FEATURE_LABELS[cond.feature]})의 표지가 예문에서 검출되지 않습니다 — ${strict ? "optionAnalyses 자기모순(선언과 예문 불일치)" : "두 조건 이상 결여(소거 용이) 위험"}`,
          );
        }
      }
    }
  }

  // [결정론 6] optionAnalyses ↔ 오답 해설 자기모순: satisfiedConditions 에 넣은
  // 조건을 해설이 '결여/실현되지 않음'으로 진술하면 매트릭스가 환각이다(error).
  // 오탐 억제: 그 조건 라벨 **하나만** 등장하는 절(clause)에 부정 표지가 있을 때만
  // 판정한다(여러 라벨이 섞인 절은 대조 서술일 수 있어 침묵).
  const NEGATED_CLAIM_RE =
    /(결여|누락|충족하지|충족되지|실현되지 않|나타나지 않|나타나 있지 않|사용되지 않|쓰이지 않|드러나지 않|없)/;
  const wrongExplanations = Array.isArray(question.wrongOptionExplanations)
    ? (question.wrongOptionExplanations as Record<string, unknown>[])
    : [];
  const analysisByLabel = new Map(analyses.map((a): [string, GrAnalysis] => [a.optionLabel, a]));
  for (const w of wrongExplanations) {
    const label = typeof w.label === "string" ? w.label : "";
    const explanationText = typeof w.explanation === "string" ? w.explanation : "";
    const a = label ? analysisByLabel.get(label) : undefined;
    if (!a || !explanationText || label === correctAnswer) continue;
    const clauses = explanationText.split(/[,.;·]|지만|으나|는데/);
    for (const clause of clauses) {
      const mentioned = condLabels.filter((l) => clause.includes(l));
      if (mentioned.length !== 1) continue;
      const l = mentioned[0];
      if (!a.satisfied.includes(l) || a.missing === l) continue;
      if (NEGATED_CLAIM_RE.test(clause)) {
        add(
          "error",
          "ko-solver-mismatch",
          `${label} 의 optionAnalyses 는 조건 ${l} 충족을 선언했는데 오답 해설은 같은 조건의 결여를 진술합니다 — 매트릭스-해설 자기모순: "${clause.trim().slice(0, 40)}"`,
        );
        break;
      }
    }
  }

  return issues;
}

// ---------------------------------------------------------------------------
// 모듈
// ---------------------------------------------------------------------------

export const KO_GR_ELEMENT: KoTypeModule = {
  meta: {
    typeId: "KO_GR_ELEMENT",
    area: "GRAMMAR",
    label: "문법 요소(높임·시제·피사동)",
    formatCategory: "객관식",
    uiGroup: "국어 문법",
    answerFormat: "MC5",
    includesPassage: false, // <보기> 조건 + 자체 생성 예문으로 자기완결 — 지문 미동봉
    passageKinds: ["GRAMMAR_CONCEPT"],
    defaultPoints: 2,
    usesBogi: "required",
    markerFamilies: [], // ㉠~㉢은 <보기> 조건 라벨 — 지문 마커 아님
    optionEnding: "any", // 선지가 진술이 아니라 예문(인용·해요체 종결 허용)
    needsSolverGate: false,
    lockedOptionOrder: true, // optionAnalyses 가 선지 라벨 키 — 셔플 재매핑 불가로 제외
    description:
      "높임·시제·피사동·부정·인용의 문법 요소 조건 2~3개를 <보기>에 제시하고 조건을 모두 충족하는 자체 생성 예문 하나를 판별하는 조건 동시 충족형 — 표지 휴리스틱 기계 검증(2026 수능 37번 경향)",
    setSlot: "언매 단독 문법 슬롯(37~38번대)·내신 문법 단원 시험 — 최근 2~3개 요소 통합형(2026 수능 37번)",
    studentTask: "<보기>의 조건 ㉠~㉢(높임·시제·피사동 등)을 모두 충족하는 예문 하나를 선지 5개에서 고릅니다.",
    bestFor: [
      "높임법·시제·피동사동·부정·인용 문법 단원 평가",
      "문법 개념 설명 지문 세트의 요소 적용 슬롯",
      "내신 언어(문법) 단독 문항",
    ],
    outputUi: ["<보기> 조건 박스(㉠~㉢)", "자체 생성 예문 5지선다", "선지별 조건 충족 분석·근거 해설"],
  },
  schema,
  prompt,
  settings: {
    knobs: [
      {
        key: "conditionCount",
        label: "조건 개수",
        kind: "select",
        options: [
          { value: "AUTO", label: "자동(난이도 연동)" },
          { value: "2", label: "2개(㉠~㉡)" },
          { value: "3", label: "3개(㉠~㉢)" },
        ],
        defaultValue: "AUTO",
        description: "조건이 많을수록 동시 충족 판정량이 늘어 체감 난도가 올라갑니다",
      },
      {
        key: "elementFocus",
        label: "요소 초점",
        kind: "select",
        options: [
          { value: "AUTO", label: "자동(요소 통합)" },
          { value: "HONORIFIC", label: "높임법 중심(주체·객체·상대)" },
          { value: "VOICE", label: "피동·사동 중심(동형 판별)" },
          { value: "QUOTE_NEG", label: "인용·부정 중심(전환 연쇄)" },
        ],
        defaultValue: "AUTO",
        description: "조건을 뽑을 문법 요소 축을 지정합니다",
      },
    ],
    buildPrompt: buildSettingsPrompt,
  },
  validate,
  toRenderModel(question, ctx: KoRenderContext): KoRenderModel {
    const model = buildDefaultKoRenderModel({
      question,
      passage: ctx.passage,
      suppressPassage: ctx.suppressPassage,
      includesPassage: false,
      answerFormat: "MC5",
      defaultPoints: 2,
    });
    // 방어: bogi 누락 시 bogiConditions 로 <보기> 박스를 재구성 (usesBogi=required)
    if (!model.bogi) {
      const conds = readConditions(question).filter((c) => c.label && c.text);
      if (conds.length > 0) {
        model.bogi = { label: "보기", lines: conds.map((c) => `${c.label} ${c.text}`) };
      }
    }
    return model;
  },
  difficultyGuide: {
    BASIC:
      "조건 2개, 표지는 표면에 명시적으로('께서 ~ 주셨다' 수준). 오답은 단순 누락형으로 — 결여 조건이 예문만 읽어도 드러나게 하라. 동형·이중피동 함정 어휘는 쓰지 마라.",
    INTERMEDIATE:
      "조건 3개 통합형(높임+시제, 피사동+인용 등 요소 2~3개 결합). 오답 4개의 결여 조건을 분산시키고, 특수 어휘 높임(모시다·여쭙다·잡수시다)을 1회 이상 실현하라. 함정 1개(사동/피동 동형 또는 간접 높임 '-시-' 오인)를 배치하라.",
    KILLER:
      "표지 오인을 전면화하라 — 간접 높임 '-시-' 예문으로 주체/객체 높임 혼동을 유도하고, 사동/피동 동형 어휘(안기다·업히다)를 정답과 오답 양쪽에 배치해 문장 구조('에게' 논항·행위 주체)로만 판별되게 하라. 이중피동·불완전 인용 전환 함정을 결합하고, 조건 서술도 한 단계 추상화('높임의 대상이 문장의 객체임')하라.",
  },
};
