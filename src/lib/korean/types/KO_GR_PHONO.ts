// ============================================================================
// KO_GR_PHONO — 문법: 음운 변동 사례 분류·복합 판정 (<보기> 제시형)
// ============================================================================
// 카탈로그 §2.5 KO_GR_PHON 사양의 전면 구현. 이 유형의 심장은 **결정론 검증기**다:
// 빈출 음운 변동 goldmap(단어→표준 발음→변동 유형→음운 개수 증감)을 상수로 내장하고,
// <보기> 사례·cases 분석표·'참이어야 하는 선지'의 진술을 전부 goldmap과 기계 대조한다.
// 정오가 결정론적으로 검증 가능한 유일 계열(카탈로그 "규칙 엔진으로 자동 검증 가능").
//
// 실측 근거(수능·학평 관행):
//   발문: "<보기>의 ㄱ~ㄷ에 대한 설명으로 적절한 것은?" / "<보기>를 바탕으로 …"
//   메커니즘: 교체/탈락/첨가/축약 4분류 정의 + 복수 변동 순차 적용 단어
//   (색연필[생년필]: ㄴ 첨가+비음화) 의도 선별. 빈도: 거의 매년.
//   오답 4원리: 유형 라벨 오귀속 · 적용 순서 도치 · 음운 개수 증감 오판 · 동화 방향 교란
//   내신: 순행/역행 분류 매트릭스·겹받침 Q&A 등 더 전수적.
//
// 지문 불요: 문법 단독형 — <보기>만으로 성립(meta.includesPassage=false).
// GRAMMAR_CONCEPT 지문이 있으면 프롬프트 수준에서 활용하되 문항에 동봉하지 않는다.
// ============================================================================

import { z } from "zod";
import { koMc5Envelope } from "../registry/envelope-schema";
import { buildDefaultKoRenderModel, type KoRenderModel } from "../core/render-model";
import { BOGI_ITEM_LABELS } from "../core/markers";
import type {
  KoDifficulty,
  KoQualityIssue,
  KoRenderContext,
  KoResolvedTypeSettings,
  KoTypeModule,
  KoValidationContext,
} from "../registry/type-module";

// ---------------------------------------------------------------------------
// 음운 변동 분류 체계 (학교문법 통설 — 2015 개정 언어와 매체 교과 기준)
// ---------------------------------------------------------------------------

const KO_PHONO_CHANGE_TYPES = [
  "음절의 끝소리 규칙",
  "비음화",
  "유음화",
  "구개음화",
  "된소리되기",
  "자음군 단순화",
  "ㅎ 탈락",
  "ㄴ 첨가",
  "거센소리되기",
] as const;
type KoPhonoChangeType = (typeof KO_PHONO_CHANGE_TYPES)[number];

type KoPhonoCategory = "교체" | "탈락" | "첨가" | "축약";

const KO_PHONO_CATEGORY_OF: Record<KoPhonoChangeType, KoPhonoCategory> = {
  "음절의 끝소리 규칙": "교체",
  비음화: "교체",
  유음화: "교체",
  구개음화: "교체",
  된소리되기: "교체",
  "자음군 단순화": "탈락",
  "ㅎ 탈락": "탈락",
  "ㄴ 첨가": "첨가",
  거센소리되기: "축약",
};

/** 선지 텍스트에서 세부 변동 주장을 추출하기 위한 별칭 사전 (교과서 병기 용어 포함). */
const KO_PHONO_CHANGE_ALIASES: readonly [KoPhonoChangeType, readonly string[]][] = [
  ["음절의 끝소리 규칙", ["음절의 끝소리 규칙", "음절 끝소리 규칙", "평파열음화", "말음 법칙", "말음법칙"]],
  ["비음화", ["비음화"]],
  ["유음화", ["유음화"]],
  ["구개음화", ["구개음화"]],
  ["된소리되기", ["된소리되기", "경음화"]],
  ["자음군 단순화", ["자음군 단순화", "자음군단순화", "자음군의 단순화"]],
  ["ㅎ 탈락", ["ㅎ 탈락", "ㅎ탈락", "'ㅎ' 탈락", "‘ㅎ’ 탈락", "히읗 탈락"]],
  ["ㄴ 첨가", ["ㄴ 첨가", "ㄴ첨가", "'ㄴ' 첨가", "‘ㄴ’ 첨가", "니은 첨가"]],
  ["거센소리되기", ["거센소리되기", "거센소리 되기", "자음 축약", "유기음화", "격음화"]],
];

const KO_PHONO_CATEGORY_TOKENS: readonly [KoPhonoCategory, readonly string[]][] = [
  ["교체", ["교체", "대치"]],
  ["탈락", ["탈락"]],
  ["첨가", ["첨가"]],
  ["축약", ["축약"]],
];

// ---------------------------------------------------------------------------
// 빈출 음운 변동 goldmap — 학교문법 통설로 분석이 확정적인 사례만 수록.
// changes 는 급여(feeding) 관계가 확정적인 경우 적용 순서대로 배열하되,
// 검증은 집합 비교로만 수행한다(순서 논쟁 사례의 오차단 방지).
// phonemeCountDelta: 교체=0, 탈락·축약=각 -1, 첨가=각 +1 의 합산.
// 발음은 장음 기호(ː) 없이 표기한다.
// ---------------------------------------------------------------------------

interface KoPhonoGoldmapEntry {
  word: string;
  pronunciation: string;
  changes: readonly KoPhonoChangeType[];
  phonemeCountDelta: number;
}

const KO_PHONO_GOLDMAP: readonly KoPhonoGoldmapEntry[] = [
  // ── 교체 단일: 비음화 ──
  { word: "국물", pronunciation: "궁물", changes: ["비음화"], phonemeCountDelta: 0 },
  { word: "밥물", pronunciation: "밤물", changes: ["비음화"], phonemeCountDelta: 0 },
  { word: "닫는", pronunciation: "단는", changes: ["비음화"], phonemeCountDelta: 0 },
  { word: "종로", pronunciation: "종노", changes: ["비음화"], phonemeCountDelta: 0 },
  { word: "강릉", pronunciation: "강능", changes: ["비음화"], phonemeCountDelta: 0 },
  { word: "담력", pronunciation: "담녁", changes: ["비음화"], phonemeCountDelta: 0 },
  { word: "국력", pronunciation: "궁녁", changes: ["비음화"], phonemeCountDelta: 0 },
  { word: "독립", pronunciation: "동닙", changes: ["비음화"], phonemeCountDelta: 0 },
  { word: "협력", pronunciation: "혐녁", changes: ["비음화"], phonemeCountDelta: 0 },
  // ── 교체 단일: 유음화 ──
  { word: "신라", pronunciation: "실라", changes: ["유음화"], phonemeCountDelta: 0 },
  { word: "칼날", pronunciation: "칼랄", changes: ["유음화"], phonemeCountDelta: 0 },
  { word: "난로", pronunciation: "날로", changes: ["유음화"], phonemeCountDelta: 0 },
  { word: "광한루", pronunciation: "광할루", changes: ["유음화"], phonemeCountDelta: 0 },
  // ── 교체 단일: 구개음화 ──
  { word: "굳이", pronunciation: "구지", changes: ["구개음화"], phonemeCountDelta: 0 },
  { word: "같이", pronunciation: "가치", changes: ["구개음화"], phonemeCountDelta: 0 },
  { word: "해돋이", pronunciation: "해도지", changes: ["구개음화"], phonemeCountDelta: 0 },
  { word: "붙이다", pronunciation: "부치다", changes: ["구개음화"], phonemeCountDelta: 0 },
  { word: "밭이", pronunciation: "바치", changes: ["구개음화"], phonemeCountDelta: 0 },
  // ── 교체 단일: 된소리되기 ──
  { word: "국밥", pronunciation: "국빱", changes: ["된소리되기"], phonemeCountDelta: 0 },
  { word: "갈등", pronunciation: "갈뜽", changes: ["된소리되기"], phonemeCountDelta: 0 },
  // ── 교체 단일: 음절의 끝소리 규칙 ──
  { word: "옷", pronunciation: "옫", changes: ["음절의 끝소리 규칙"], phonemeCountDelta: 0 },
  { word: "잎", pronunciation: "입", changes: ["음절의 끝소리 규칙"], phonemeCountDelta: 0 },
  { word: "부엌", pronunciation: "부억", changes: ["음절의 끝소리 규칙"], phonemeCountDelta: 0 },
  { word: "바깥", pronunciation: "바깓", changes: ["음절의 끝소리 규칙"], phonemeCountDelta: 0 },
  // ── 탈락: ㅎ 탈락 ──
  { word: "좋은", pronunciation: "조은", changes: ["ㅎ 탈락"], phonemeCountDelta: -1 },
  { word: "낳은", pronunciation: "나은", changes: ["ㅎ 탈락"], phonemeCountDelta: -1 },
  { word: "많아", pronunciation: "마나", changes: ["ㅎ 탈락"], phonemeCountDelta: -1 },
  { word: "닳아", pronunciation: "다라", changes: ["ㅎ 탈락"], phonemeCountDelta: -1 },
  // ── 탈락: 자음군 단순화 ──
  { word: "넋", pronunciation: "넉", changes: ["자음군 단순화"], phonemeCountDelta: -1 },
  { word: "값", pronunciation: "갑", changes: ["자음군 단순화"], phonemeCountDelta: -1 },
  { word: "흙", pronunciation: "흑", changes: ["자음군 단순화"], phonemeCountDelta: -1 },
  { word: "삶", pronunciation: "삼", changes: ["자음군 단순화"], phonemeCountDelta: -1 },
  // ── 첨가: ㄴ 첨가 ──
  { word: "솜이불", pronunciation: "솜니불", changes: ["ㄴ 첨가"], phonemeCountDelta: 1 },
  { word: "맨입", pronunciation: "맨닙", changes: ["ㄴ 첨가"], phonemeCountDelta: 1 },
  { word: "한여름", pronunciation: "한녀름", changes: ["ㄴ 첨가"], phonemeCountDelta: 1 },
  { word: "담요", pronunciation: "담뇨", changes: ["ㄴ 첨가"], phonemeCountDelta: 1 },
  { word: "눈요기", pronunciation: "눈뇨기", changes: ["ㄴ 첨가"], phonemeCountDelta: 1 },
  // ── 축약: 거센소리되기 ──
  { word: "놓고", pronunciation: "노코", changes: ["거센소리되기"], phonemeCountDelta: -1 },
  { word: "좋다", pronunciation: "조타", changes: ["거센소리되기"], phonemeCountDelta: -1 },
  { word: "입학", pronunciation: "이팍", changes: ["거센소리되기"], phonemeCountDelta: -1 },
  { word: "국화", pronunciation: "구콰", changes: ["거센소리되기"], phonemeCountDelta: -1 },
  { word: "축하", pronunciation: "추카", changes: ["거센소리되기"], phonemeCountDelta: -1 },
  { word: "잡히다", pronunciation: "자피다", changes: ["거센소리되기"], phonemeCountDelta: -1 },
  { word: "맏형", pronunciation: "마텽", changes: ["거센소리되기"], phonemeCountDelta: -1 },
  { word: "많다", pronunciation: "만타", changes: ["거센소리되기"], phonemeCountDelta: -1 },
  { word: "않던", pronunciation: "안턴", changes: ["거센소리되기"], phonemeCountDelta: -1 },
  // ── 복합 2변동 ──
  { word: "색연필", pronunciation: "생년필", changes: ["ㄴ 첨가", "비음화"], phonemeCountDelta: 1 },
  { word: "막일", pronunciation: "망닐", changes: ["ㄴ 첨가", "비음화"], phonemeCountDelta: 1 },
  { word: "늑막염", pronunciation: "능망념", changes: ["ㄴ 첨가", "비음화"], phonemeCountDelta: 1 },
  { word: "물약", pronunciation: "물략", changes: ["ㄴ 첨가", "유음화"], phonemeCountDelta: 1 },
  { word: "서울역", pronunciation: "서울력", changes: ["ㄴ 첨가", "유음화"], phonemeCountDelta: 1 },
  { word: "값지다", pronunciation: "갑찌다", changes: ["자음군 단순화", "된소리되기"], phonemeCountDelta: -1 },
  { word: "넋두리", pronunciation: "넉뚜리", changes: ["자음군 단순화", "된소리되기"], phonemeCountDelta: -1 },
  { word: "흙과", pronunciation: "흑꽈", changes: ["자음군 단순화", "된소리되기"], phonemeCountDelta: -1 },
  { word: "앉다", pronunciation: "안따", changes: ["자음군 단순화", "된소리되기"], phonemeCountDelta: -1 },
  { word: "밟는", pronunciation: "밤는", changes: ["자음군 단순화", "비음화"], phonemeCountDelta: -1 },
  { word: "값만", pronunciation: "감만", changes: ["자음군 단순화", "비음화"], phonemeCountDelta: -1 },
  { word: "닭만", pronunciation: "당만", changes: ["자음군 단순화", "비음화"], phonemeCountDelta: -1 },
  { word: "훑는", pronunciation: "훌른", changes: ["자음군 단순화", "유음화"], phonemeCountDelta: -1 },
  { word: "옆집", pronunciation: "엽찝", changes: ["음절의 끝소리 규칙", "된소리되기"], phonemeCountDelta: 0 },
  { word: "옷만", pronunciation: "온만", changes: ["음절의 끝소리 규칙", "비음화"], phonemeCountDelta: 0 },
  { word: "앞날", pronunciation: "암날", changes: ["음절의 끝소리 규칙", "비음화"], phonemeCountDelta: 0 },
  { word: "짓는", pronunciation: "진는", changes: ["음절의 끝소리 규칙", "비음화"], phonemeCountDelta: 0 },
  { word: "부엌문", pronunciation: "부엉문", changes: ["음절의 끝소리 규칙", "비음화"], phonemeCountDelta: 0 },
  { word: "묻히다", pronunciation: "무치다", changes: ["거센소리되기", "구개음화"], phonemeCountDelta: -1 },
  // ── 복합 3변동 (킬러) ──
  { word: "꽃잎", pronunciation: "꼰닙", changes: ["음절의 끝소리 규칙", "ㄴ 첨가", "비음화"], phonemeCountDelta: 1 },
  { word: "홑이불", pronunciation: "혼니불", changes: ["음절의 끝소리 규칙", "ㄴ 첨가", "비음화"], phonemeCountDelta: 1 },
  { word: "읊다", pronunciation: "읍따", changes: ["자음군 단순화", "음절의 끝소리 규칙", "된소리되기"], phonemeCountDelta: -1 },
];

const GOLDMAP_BY_WORD = new Map<string, KoPhonoGoldmapEntry>(
  KO_PHONO_GOLDMAP.map((e) => [e.word, e]),
);

function formatDelta(delta: number): string {
  if (delta > 0) return `${delta}개 증가`;
  if (delta < 0) return `${-delta}개 감소`;
  return "변화 없음";
}

function formatGoldmapEntry(e: KoPhonoGoldmapEntry): string {
  return `${e.word}[${e.pronunciation}] = ${e.changes.join(" + ")} (음운 개수 ${formatDelta(e.phonemeCountDelta)})`;
}

// ---------------------------------------------------------------------------
// 스키마 — cases 분석표가 결정론 검증의 앵커
// ---------------------------------------------------------------------------

const schema = koMc5Envelope({
  cases: z
    .array(
      z.object({
        itemLabel: z.enum(["ㄱ", "ㄴ", "ㄷ", "ㄹ"]).describe("<보기> 항목 라벨 — ㄱ부터 순서대로"),
        word: z.string().min(1).describe("사례 단어의 표기 (예: 값지다) — <보기> 병기와 동일"),
        pronunciation: z
          .string()
          .min(1)
          .describe("표준 발음 — 대괄호·장음 기호(ː) 없이 (예: 갑찌다)"),
        changes: z
          .array(z.enum(KO_PHONO_CHANGE_TYPES))
          .min(1)
          .max(3)
          .describe("이 단어에서 일어나는 음운 변동 전부 — 적용 순서대로, 하나도 빠뜨리지 말 것"),
        phonemeCountDelta: z
          .number()
          .int()
          .min(-3)
          .max(3)
          .describe("음운 개수 증감 합산: 교체=0, 탈락·축약=각 -1, 첨가=각 +1 (예: 색연필=+1, 값지다=-1)"),
      }),
    )
    .min(2)
    .max(4)
    .describe(
      "<보기> 사례 분석표 — <보기>의 ㄱ~ㄹ 항목과 1:1. 시스템이 내장 goldmap과 결정론 대조하므로 표준 분석과 다르면 자동 반려",
    ),
});

// ---------------------------------------------------------------------------
// 프롬프트 — goldmap 목록을 프로그램적으로 생성해 상수와 항상 동기
// ---------------------------------------------------------------------------

const GOLDMAP_PROMPT_BLOCK = (() => {
  const singles = new Map<KoPhonoChangeType, string[]>();
  const complex: string[] = [];
  for (const e of KO_PHONO_GOLDMAP) {
    if (e.changes.length === 1) {
      const list = singles.get(e.changes[0]) ?? [];
      list.push(`${e.word}[${e.pronunciation}]`);
      singles.set(e.changes[0], list);
    } else {
      complex.push(formatGoldmapEntry(e));
    }
  }
  const lines: string[] = [];
  for (const t of KO_PHONO_CHANGE_TYPES) {
    const list = singles.get(t);
    if (list?.length) lines.push(`- ${t}(${KO_PHONO_CATEGORY_OF[t]}): ${list.join(", ")}`);
  }
  lines.push("- 복합 변동(2개 이상 동시 적용 — 중·고난도용):");
  for (const c of complex) lines.push(`  · ${c}`);
  return lines.join("\n");
})();

const prompt = `### 유형: 문법 — 음운 변동 사례 분류·복합 판정 (<보기> 제시형, 지문 불요)

**발문 템플릿** (정확히 이 형태로 — 시스템 발문 문법 게이트가 검사한다):
- 긍정발문(기본): "<보기>의 ㄱ~ㄷ에 대한 설명으로 가장 적절한 것은?"
- 긍정 변형: "<보기>의 ㄱ~ㄷ에서 일어나는 음운 변동에 대한 설명으로 가장 적절한 것은?"
- 부정발문: "<보기>의 ㄱ~ㄷ에 대한 설명으로 적절하지 않은 것은?"
- "바르게 이해한 것은?" 같은 비규격 종결 금지. 사례가 2개면 "ㄱ, ㄴ", 4개면 "ㄱ~ㄹ"로 범위 표기를 맞춰라.

**<보기> 구성 (bogi.lines)**:
1. (기본) 첫 행들에 4분류 정의 블록을 제시:
   "◦ 교체: 한 음운이 다른 음운으로 바뀌는 현상" / "◦ 탈락: 두 음운 중 한 음운이 없어지는 현상" /
   "◦ 첨가: 없던 음운이 새로 생기는 현상" / "◦ 축약: 두 음운이 합쳐져 하나의 새로운 음운이 되는 현상"
2. 이어서 사례 행: "ㄱ. 값지다[갑찌다]" 형식 — 반드시 '단어[표준 발음]' 병기, 장음 기호(ː)는 쓰지 않는다. 라벨은 ㄱ부터 순서대로.
3. 사례 단어는 **반드시 아래 goldmap 목록에서만** 고른다 — 목록 밖 단어는 시스템이 검증 불가 경고를 낸다.

**출제 사례 goldmap (이 목록의 단어·발음·분석을 그대로 사용하라)**:
${GOLDMAP_PROMPT_BLOCK}

**사례 조합 원리**:
1. 사례들이 서로 다른 대분류(교체/탈락/첨가/축약)에 최소 2개 이상 걸치게 조합하라.
2. 함정 축을 먼저 계획하라: '개수 증감은 같은데 유형이 다른 쌍'(좋은[조은] 탈락 vs 놓고[노코] 축약 — 둘 다 1개 감소),
   '표기는 닮았는데 변동이 다른 쌍'(좋은[조은] ㅎ 탈락 vs 좋다[조타] 거센소리되기), '복합 vs 단일'(색연필 vs 국물).
3. cases 배열에 각 사례의 {itemLabel, word, pronunciation, changes(빠짐없이 전부), phonemeCountDelta}를
   goldmap과 똑같이 선언하라 — 하나라도 어긋나면 자동 반려된다.

**선지 구성 원리**:
1. 진술 축 5가지에서 고르되 한 문항 안에서 3축 이상을 섞어라:
   ① 대분류 귀속: "ㄱ에서는 음운의 탈락이 일어난다."
   ② 세부 변동 명칭: "ㄴ에서는 인접한 자음의 영향으로 비음화가 일어난다."
   ③ 음운 개수 증감: "ㄷ은 음운 변동의 결과 음운의 개수가 한 개 줄어든다."
   ④ 적용 순서: "ㄱ에서는 ㄴ 첨가가 일어난 뒤 그 결과로 비음화가 적용된다."
   ⑤ 사례 간 공통·차이: "ㄱ과 ㄷ에서는 모두 음운의 개수가 변하지 않는다."
2. 선지 하나는 사례 1~2개만 다루고, 5개 선지가 사례 전체를 고르게 커버하게 하라.
3. 어미는 평서형 '~다'로 통일. 부정발문이면 참 4개 + 거짓 1개(=정답), 긍정발문이면 거짓 4개 + 참 1개(=정답).
4. 정답이 참이어야 하는 선지의 진술은 goldmap 사실과 완전히 일치해야 한다 — 시스템이 결정론 대조한다.

**오답 함정 원리 — 오답(거짓 진술)마다 정확히 하나를 적용**:
1. 유형 라벨 오귀속: 세부 변동을 틀린 대분류·명칭에 귀속.
   예) 값지다[갑찌다]의 된소리되기(교체)를 "축약이 일어난다"로. 놓고[노코]의 거센소리되기(축약)를 "교체가 일어난다"로.
2. 적용 순서 도치: 급여(feeding) 관계가 확정적인 복합 변동의 순서를 뒤집기.
   예) 색연필[생년필]은 'ㄴ 첨가가 일어난 뒤 첨가된 ㄴ 때문에 비음화가 일어나는' 것인데 "비음화가 일어난 뒤 ㄴ이 첨가된다"로.
3. 음운 개수 증감 오판: 예) 놓고[노코](축약, 1개 감소)를 "음운의 개수에 변화가 없다"로,
   색연필[생년필](첨가, 1개 증가)을 "음운의 개수가 줄어든다"로.
4. 동화 방향 교란: 예) 국물[궁물]은 뒤 자음 ㅁ이 앞 자음 ㄱ을 바꾸는 역행 동화인데 "앞 자음의 영향으로 뒤 자음이 바뀐다"로.
   칼날[칼랄](순행 유음화)과 신라[실라](역행 유음화)의 방향을 서로 맞바꾸기.

**근거앵커(evidence) 작성**: 이 유형은 지문이 없다 — spanText에는 판정 대상 <보기> 사례 병기를
그대로 쓴다(예: "값지다[갑찌다]"). 참 진술 선지=SUPPORTS, 거짓 진술 선지=DISTORTS.

**금지**:
- 해설·오답 해설에 수학 기호 사용 금지 — 'Δ=-1', '+1/-1', '=', '→' 같은 기호 표기 대신
  "자음군 단순화(탈락)로 음운이 1개 줄고, 된소리되기(교체)는 개수 변화가 없다"처럼
  국어 문법 해설의 서술형 문체로 쓰라(학원 교재 해설 문체 계약).
- goldmap 목록 밖 단어 사례. 특히 사잇소리 현상·반모음 첨가·두음 법칙·모음 탈락(ㅡ 탈락 표기 반영형)·
  'ㅀ+ㄴ'류(끓는)처럼 학교문법 내 분석이 갈리는 사례 절대 금지.
- 복수 표준 발음이 있거나 의미에 따라 발음이 갈리는 단어(예: 신고, 밭이랑).
- <보기> 정의 블록이 특정 선지의 정오를 직접 판정해 주는 서술(정답 누출).
- 두 개 이상의 선지가 같은 사례의 같은 진술 축을 중복해서 다루는 구성.
- 발음 병기 임의 변형 — goldmap의 발음을 한 글자도 바꾸지 마라.`;

// ---------------------------------------------------------------------------
// 설정 → 프롬프트
// ---------------------------------------------------------------------------

function buildSettingsPrompt(settings: KoResolvedTypeSettings, difficulty: KoDifficulty): string {
  const lines: string[] = [];
  const count = settings.caseCount === "2" ? 2 : settings.caseCount === "4" ? 4 : 3;
  const lastLabel = BOGI_ITEM_LABELS[count - 1];
  const range = count === 2 ? "ㄱ, ㄴ" : `ㄱ~${lastLabel}`;
  lines.push(`- <보기> 사례는 ${range} 정확히 ${count}개. cases 배열도 ${count}개로 1:1 선언하라.`);
  if (settings.taxonomyBogi === false) {
    lines.push("- <보기>에 4분류 정의 블록 없이 사례만 제시하라 (교체/탈락/첨가/축약 분류 지식 자체를 평가).");
  } else {
    lines.push("- <보기> 상단에 교체/탈락/첨가/축약 한 줄 정의 블록을 먼저 제시하고 사례 행을 이어라.");
  }
  if (settings.examMode === "NAESIN") {
    lines.push(
      "- 내신 모드: 교과서 전수 확인형 — 동화의 방향(순행/역행)·조음 위치와 조음 방법 개념어·표기와 발음의 대응까지 진술 축에 포함하라. 겹받침(자음군 단순화) 사례를 적극 활용하고, 교과서 병기 용어(된소리되기=경음화)를 함께 쓸 수 있다.",
    );
  } else {
    lines.push(
      "- 수능 모드: 복합 변동 판정 + 음운 개수 증감 통합 진술 중심 — 표를 그려 전수 분석해야 풀리게 사례 간 비교 선지를 반드시 포함하라.",
    );
  }
  if (difficulty === "KILLER") {
    lines.push("- 사례 중 최소 1개는 3변동 복합(꽃잎·홑이불·읊다 계열) 또는 축약+교체 복합(묻히다)로 하라.");
  } else if (difficulty === "BASIC") {
    lines.push("- 단일 변동 사례 위주로 구성하라 (복합 변동은 최대 1개).");
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// 결정론 검증기 — goldmap 대조가 이 유형의 핵심
// ---------------------------------------------------------------------------

interface ParsedBogiCase {
  label: string;
  word: string;
  pronunciation: string;
}

const BOGI_CASE_LINE_RE = /^([ㄱ-ㅎ])[.)．]\s*(.+)$/;
const WORD_PRON_RE = /([가-힣]+)\s*\[\s*([가-힣ː\s]+)\]/;

function stripLong(pron: string): string {
  return pron.replace(/[ː\s]/g, "");
}

function parseBogiCases(bogi: unknown): ParsedBogiCase[] {
  if (!bogi || typeof bogi !== "object") return [];
  const lines = (bogi as Record<string, unknown>).lines;
  if (!Array.isArray(lines)) return [];
  const out: ParsedBogiCase[] = [];
  for (const raw of lines) {
    if (typeof raw !== "string") continue;
    const m = BOGI_CASE_LINE_RE.exec(raw.trim());
    if (!m) continue;
    const pair = WORD_PRON_RE.exec(m[2]);
    if (!pair) continue;
    out.push({ label: m[1], word: pair[1], pronunciation: stripLong(pair[2]) });
  }
  return out;
}

/** 두 변동 목록이 집합으로 같은지 (순서 논쟁 사례의 오차단 방지 — 집합 비교만). */
function sameChangeSet(a: readonly string[], b: readonly string[]): boolean {
  const setA = new Set(a);
  const setB = new Set(b);
  if (setA.size !== setB.size) return false;
  for (const v of setA) if (!setB.has(v)) return false;
  return true;
}

/**
 * '참이어야 하는 선지' 텍스트에서 결정론 판정 가능한 주장(세부 변동·대분류·개수 증감)을
 * 추출해 goldmap과 대조한다. 모순이 증명되면 사유 문자열, 판정 불가면 null.
 * 보수 설계: 부정('않')·대조('달리') 구문, 방향 혼합 진술은 skip — 오차단 최소화.
 */
function findClaimContradiction(
  optionText: string,
  goldByLabel: ReadonlyMap<string, KoPhonoGoldmapEntry>,
  goldByBogiWord: ReadonlyMap<string, KoPhonoGoldmapEntry>,
): string | null {
  if (/않|달리/.test(optionText)) return null;

  // 1) 세부 변동 주장 추출 + 별칭 제거(자모 라벨 오인 방지: "ㄴ 첨가"의 ㄴ 등)
  const claimedSubtypes: KoPhonoChangeType[] = [];
  let stripped = optionText;
  for (const [subtype, aliases] of KO_PHONO_CHANGE_ALIASES) {
    let hit = false;
    for (const alias of aliases) {
      if (stripped.includes(alias)) {
        hit = true;
        stripped = stripped.split(alias).join(" ");
      }
    }
    if (hit) claimedSubtypes.push(subtype);
  }
  // 음운(자모) 자체를 논하는 대목 제거: 따옴표 낀 자모, "ㄴ으로", "ㄴ이 첨가/탈락/바뀌…" 류
  stripped = stripped
    .replace(/['‘’"“”「」]\s*[ㄱ-ㅎ]\s*['‘’"“”」]/g, " ")
    .replace(/[ㄱ-ㅎ]\s*(?:으로|로)/g, " ")
    .replace(/[ㄱ-ㅎ](?=\s*[이가]\s*[가-힣\s]{0,8}(?:첨가|탈락|바뀌|축약|덧나|줄어|합쳐))/g, " ");

  // 2) 앵커 수집: <보기>에 실린 goldmap 단어 직접 언급 + (정제 후) 항목 라벨 언급
  const anchored: { name: string; gold: KoPhonoGoldmapEntry }[] = [];
  for (const [word, gold] of goldByBogiWord) {
    if (optionText.includes(word)) anchored.push({ name: `'${word}'`, gold });
  }
  for (const [label, gold] of goldByLabel) {
    const re = new RegExp(`${label}(?=\\s*(?:은|는|의|도|만|과|와|에서|에는|에|,|·|~))`);
    if (re.test(stripped) && !anchored.some((a) => a.gold.word === gold.word)) {
      anchored.push({ name: label, gold });
    }
  }
  if (anchored.length === 0) return null;

  // 2.5) 다중 앵커 × 다중 변동 주장 = 분배 서술("ㄱ에서는 탈락이, ㄴ에서는 축약이" —
  // 수능 관행 문형)일 수 있다. 주장-앵커의 대응 관계를 텍스트만으로 확정할 수 없으므로
  // 판정 불가로 skip 한다 (5)의 up/down/same 혼재 skip 과 동일한 보수 설계 — 참 선지
  // 오차단 방지). 단일 앵커 × 다주장(색연필의 'ㄴ 첨가와 비음화')과 다앵커 × 단일
  // 주장('ㄱ과 ㄷ에서는 모두 ~')은 대응이 유일해 현행 그대로 판정한다.
  const claimedCategories = KO_PHONO_CATEGORY_TOKENS.filter(([, tokens]) =>
    tokens.some((t) => stripped.includes(t)),
  ).map(([category]) => category);
  if (anchored.length >= 2 && claimedSubtypes.length + claimedCategories.length >= 2) {
    return null;
  }

  // 3) 세부 변동 주장 대조 — 앵커된 사례에 그 변동이 없으면 모순
  for (const subtype of claimedSubtypes) {
    for (const a of anchored) {
      if (!a.gold.changes.includes(subtype)) {
        return `${a.name}(${formatGoldmapEntry(a.gold)})에는 '${subtype}'이(가) 없습니다`;
      }
    }
  }

  // 4) 대분류 주장 대조 (세부 별칭 제거 후 남은 텍스트에서만 — '자음 축약' 등의 이중 계상 방지)
  for (const category of claimedCategories) {
    for (const a of anchored) {
      if (!a.gold.changes.some((ch) => KO_PHONO_CATEGORY_OF[ch] === category)) {
        const actual = [...new Set(a.gold.changes.map((ch) => KO_PHONO_CATEGORY_OF[ch]))].join("+");
        return `${a.name}(${a.gold.word}[${a.gold.pronunciation}])의 대분류는 ${actual}인데 '${category}' 주장`;
      }
    }
  }

  // 5) 음운 개수 증감 주장 대조 — 방향이 단일하게 읽힐 때만 판정
  if (/개수|음운의 수/.test(optionText)) {
    const up = /늘어|늘었|증가/.test(optionText);
    const down = /줄어|줄었|감소/.test(optionText);
    const same = /변화가 없|변화 없|달라지지 않|그대로|동일/.test(optionText);
    if ([up, down, same].filter(Boolean).length === 1) {
      const numMatch = /([한두세])\s*개/.exec(optionText);
      const magnitude = numMatch ? ({ 한: 1, 두: 2, 세: 3 } as Record<string, number>)[numMatch[1]] : null;
      for (const a of anchored) {
        const d = a.gold.phonemeCountDelta;
        const actual = formatDelta(d);
        if (up && d <= 0) return `${a.name}(${a.gold.word})의 음운 개수는 ${actual}인데 '늘어난다' 주장`;
        if (down && d >= 0) return `${a.name}(${a.gold.word})의 음운 개수는 ${actual}인데 '줄어든다' 주장`;
        if (same && d !== 0) return `${a.name}(${a.gold.word})의 음운 개수는 ${actual}인데 '변화 없다' 주장`;
        if (magnitude !== null && (up || down) && Math.abs(d) !== magnitude) {
          return `${a.name}(${a.gold.word})의 음운 개수 증감은 ${actual}인데 '${numMatch?.[1]} 개' 주장`;
        }
      }
    }
  }

  return null;
}

function validate(question: Record<string, unknown>, ctx: KoValidationContext): KoQualityIssue[] {
  const issues: KoQualityIssue[] = [];
  const add = (severity: "error" | "warning", code: string, message: string) =>
    issues.push({ severity, code, message });

  const direction = typeof question.direction === "string" ? question.direction : "";
  if (direction && !direction.includes("보기")) {
    add("error", "ko-direction-grammar", "음운 변동 유형은 <보기> 제시형입니다 — 발문에 <보기> 지시가 없습니다");
  }

  // ── 1. <보기> 사례 파싱 (필수) ─────────────────────────────────────────
  const bogiCases = parseBogiCases(question.bogi);
  if (!question.bogi) {
    add("error", "ko-bogi-missing", "<보기>가 없습니다 — 이 유형은 발음 병기 사례 <보기>가 필수입니다");
  } else if (bogiCases.length < 2) {
    add(
      "error",
      "ko-bogi-missing",
      "<보기>에서 'ㄱ. 단어[발음]' 형식의 사례를 2개 이상 찾지 못했습니다 — 사례 행 형식을 지키세요",
    );
  }

  // 항목 라벨 순서(ㄱ→ㄴ→ㄷ…) 검사
  const expectedLabels = bogiCases.map((_, i) => BOGI_ITEM_LABELS[i] ?? "?");
  if (bogiCases.length >= 2 && bogiCases.map((c) => c.label).join("") !== expectedLabels.join("")) {
    add(
      "warning",
      "ko-marker-order",
      `<보기> 항목 라벨이 ${expectedLabels.join("")} 순서가 아닙니다: ${bogiCases.map((c) => c.label).join("")}`,
    );
  }

  // ── 2. <보기> 발음 병기 goldmap 결정론 대조 ────────────────────────────
  for (const c of bogiCases) {
    const gold = GOLDMAP_BY_WORD.get(c.word);
    if (!gold) {
      add(
        "warning",
        "ko-phono-goldmap-uncovered",
        `${c.label}. ${c.word}[${c.pronunciation}]: 검증 불가 사례 — goldmap 내 사례 사용을 권장합니다`,
      );
      continue;
    }
    if (gold.pronunciation !== c.pronunciation) {
      add(
        "error",
        "ko-correct-answer-invalid",
        `<보기> 발음 병기 오류: '${c.word}'의 표준 발음은 [${gold.pronunciation}]인데 [${c.pronunciation}]로 표기했습니다`,
      );
    }
  }

  // ── 3. cases 분석표 ↔ <보기> ↔ goldmap 3자 대조 ────────────────────────
  const cases = Array.isArray(question.cases) ? (question.cases as Record<string, unknown>[]) : [];
  if (cases.length === 0) {
    add("error", "ko-correct-answer-invalid", "cases 분석표가 없습니다 — 사례별 변동 유형·개수 증감 선언이 필수입니다");
  }
  if (bogiCases.length >= 2 && cases.length > 0 && cases.length !== bogiCases.length) {
    add(
      "error",
      "ko-marker-option-mismatch",
      `<보기> 사례 ${bogiCases.length}개와 cases 분석표 ${cases.length}개가 1:1 대응하지 않습니다`,
    );
  }
  for (const raw of cases) {
    const itemLabel = typeof raw.itemLabel === "string" ? raw.itemLabel : "";
    const word = typeof raw.word === "string" ? raw.word : "";
    const pron = typeof raw.pronunciation === "string" ? stripLong(raw.pronunciation) : "";
    const changes = Array.isArray(raw.changes)
      ? raw.changes.filter((v): v is string => typeof v === "string")
      : [];
    const delta = typeof raw.phonemeCountDelta === "number" ? raw.phonemeCountDelta : null;

    // <보기>와 verbatim 정합
    const inBogi = bogiCases.find((b) => b.label === itemLabel);
    if (bogiCases.length >= 2) {
      if (!inBogi || inBogi.word !== word) {
        add(
          "error",
          "ko-quote-not-verbatim",
          `cases의 ${itemLabel}. '${word}'이(가) <보기>의 같은 라벨 사례와 일치하지 않습니다`,
        );
      } else if (inBogi.pronunciation !== pron) {
        add(
          "error",
          "ko-quote-not-verbatim",
          `${itemLabel}. '${word}': cases 발음([${pron}])이 <보기> 병기([${inBogi.pronunciation}])와 다릅니다`,
        );
      }
    }

    // goldmap 대조 (핵심 결정론 게이트)
    const gold = GOLDMAP_BY_WORD.get(word);
    if (!gold) {
      if (word && (!inBogi || inBogi.word !== word)) {
        add(
          "warning",
          "ko-phono-goldmap-uncovered",
          `${itemLabel}. ${word}: 검증 불가 사례 — goldmap 내 사례 사용을 권장합니다`,
        );
      }
      continue;
    }
    if (pron && gold.pronunciation !== pron) {
      add(
        "error",
        "ko-correct-answer-invalid",
        `${itemLabel}. '${word}' 발음 선언 오류: 표준 발음은 [${gold.pronunciation}]인데 [${pron}]로 선언했습니다`,
      );
    }
    if (changes.length > 0 && !sameChangeSet(changes, gold.changes)) {
      add(
        "error",
        "ko-correct-answer-invalid",
        `${itemLabel}. '${word}' 변동 유형 선언 오류: 표준 분석은 '${gold.changes.join(" + ")}'인데 '${changes.join(" + ")}'로 선언했습니다`,
      );
    }
    if (delta !== null && delta !== gold.phonemeCountDelta) {
      add(
        "error",
        "ko-correct-answer-invalid",
        `${itemLabel}. '${word}' 음운 개수 선언 오류: 표준은 '${formatDelta(gold.phonemeCountDelta)}'인데 '${formatDelta(delta)}'로 선언했습니다`,
      );
    }
  }

  // ── 4. '참이어야 하는 선지' 진술의 goldmap 모순 검사 ───────────────────
  //   부정발문 → 정답 외 4개가 참이어야 함 / 긍정발문 → 정답 1개가 참이어야 함.
  //   모순이 결정론적으로 증명되는 경우만 차단(부정·대조 구문은 보수적으로 skip).
  const negative = ctx.koText.isNegativeStemKo(direction);
  const correctAnswer = typeof question.correctAnswer === "string" ? question.correctAnswer : "";
  const goldByLabel = new Map<string, KoPhonoGoldmapEntry>();
  const goldByBogiWord = new Map<string, KoPhonoGoldmapEntry>();
  for (const c of bogiCases) {
    const gold = GOLDMAP_BY_WORD.get(c.word);
    if (gold) {
      goldByLabel.set(c.label, gold);
      goldByBogiWord.set(c.word, gold);
    }
  }
  const options = Array.isArray(question.options)
    ? (question.options as Record<string, unknown>[])
    : [];
  if (goldByLabel.size > 0) {
    for (const o of options) {
      const label = typeof o.label === "string" ? o.label : "";
      const text = typeof o.text === "string" ? o.text : "";
      if (!label || !text) continue;
      const mustBeTrue = negative ? label !== correctAnswer : label === correctAnswer;
      if (!mustBeTrue) continue;
      const contradiction = findClaimContradiction(text, goldByLabel, goldByBogiWord);
      if (contradiction) {
        add(
          "error",
          "ko-correct-answer-invalid",
          `${label} 선지는 참이어야 하는데 goldmap과 모순됩니다: ${contradiction}`,
        );
      }
    }
  }

  return issues;
}

// ---------------------------------------------------------------------------
// 모듈
// ---------------------------------------------------------------------------

export const KO_GR_PHONO: KoTypeModule = {
  meta: {
    typeId: "KO_GR_PHONO",
    area: "GRAMMAR",
    label: "음운 변동(사례 분류)",
    formatCategory: "객관식",
    uiGroup: "국어 문법",
    answerFormat: "MC5",
    includesPassage: false,
    passageKinds: ["GRAMMAR_CONCEPT"],
    defaultPoints: 2,
    usesBogi: "required",
    markerFamilies: [],
    optionEnding: "plain",
    needsSolverGate: false,
    description:
      "<보기>에 발음 병기 사례(값지다[갑찌다] 등)를 제시하고 교체/탈락/첨가/축약 분류·복합 변동·음운 개수 증감을 판정하는 문법 유형 — 지문 없이 <보기>만으로 성립하며, 내장 goldmap으로 정오를 결정론 검증",
    setSlot: "언매 단독 문법 슬롯(37~39번대) 단골 — 거의 매년 출제, 내신 문법(음운) 단원 최다 빈출 축",
    studentTask:
      "<보기>의 발음 병기 사례 ㄱ~ㄷ 각각에서 일어나는 음운 변동의 유형·적용 순서·음운 개수 증감을 분석해, 진술이 참(또는 거짓)인 선지 하나를 고릅니다.",
    bestFor: [
      "음운 변동 4분류(교체·탈락·첨가·축약) 개념 확인",
      "복합 변동 단어(색연필·꽃잎·값지다)의 순차 적용 분석 훈련",
      "내신 문법 단원 지필 대비(겹받침·동화 방향 전수 확인)",
    ],
    outputUi: ["<보기> 사례 박스(발음 병기)", "5지선다", "사례별 변동 분석 해설"],
  },
  schema,
  prompt,
  settings: {
    knobs: [
      {
        key: "caseCount",
        label: "<보기> 사례 수",
        kind: "select",
        options: [
          { value: "2", label: "2개 (ㄱ, ㄴ)" },
          { value: "3", label: "3개 (ㄱ~ㄷ — 표준)" },
          { value: "4", label: "4개 (ㄱ~ㄹ — 전수형)" },
        ],
        defaultValue: "3",
        description: "사례가 많을수록 표 그리기(전수 분석) 부담이 커집니다",
      },
      {
        key: "taxonomyBogi",
        label: "4분류 정의 블록",
        kind: "toggle",
        defaultValue: true,
        description: "<보기> 상단에 교체/탈락/첨가/축약 한 줄 정의를 함께 제시(끄면 분류 지식 자체를 평가)",
      },
    ],
    buildPrompt: buildSettingsPrompt,
  },
  validate,
  toRenderModel(question, ctx: KoRenderContext): KoRenderModel {
    return buildDefaultKoRenderModel({
      question,
      passage: ctx.passage,
      suppressPassage: ctx.suppressPassage,
      includesPassage: false,
      answerFormat: "MC5",
      defaultPoints: 2,
    });
  },
  difficultyGuide: {
    BASIC:
      "단일 변동 사례(국물·신라·굳이·놓고·좋은)로 <보기>를 구성하고, 선지는 4분류 귀속·세부 변동 명칭 판정 중심으로. 음운 개수 증감 진술은 정답 확정에만 보조적으로 사용하라.",
    INTERMEDIATE:
      "2변동 복합 사례(색연필·값지다·물약·옷만)를 절반 이상 포함하라. 선지는 변동 유형+음운 개수 증감 이중 판정으로, 사례 간 공통점 비교('ㄱ과 ㄷ에서는 모두 ~') 선지를 1개 이상 넣어라.",
    KILLER:
      "3변동 사례(꽃잎·홑이불·읊다) 또는 축약+교체 복합(묻히다)을 1개 이상 포함하고, 오답은 음운 개수 증감 오판·적용 순서 도치·동화 방향 교란으로만 구성해 사례 전부의 표 그리기(전수 분석)를 강제하라. '개수 증감이 같은 탈락 vs 축약'(좋은 vs 놓고) 대비 쌍을 반드시 심어라.",
  },
};
