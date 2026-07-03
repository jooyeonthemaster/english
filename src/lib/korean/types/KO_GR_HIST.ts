// ============================================================================
// KO_GR_HIST — 문법: 국어사·중세 국어 (언매 39번 고정 슬롯 미러)
// ============================================================================
// 카탈로그 §2.5 KO_GR_HIST 사양의 전면 구현. 자체자료(koStimulus) 필수 유형 —
// 중세 국어 자료(ARCHAIC_TEXT)를 '원문 전사 행 + [현대어 풀이] 행' 쌍으로 신규
// 구성해 문항에 동봉하고, <보기>(탐구 개념 설명)를 해석 틀로 고정한다.
//
// 실측 관행(수능 언매 39번 슬롯):
//   발문: "<보기>의 중세 국어 자료를 통해 알 수 있는 내용으로 적절하지 않은 것은?"
//   — 본 구현은 자료를 <보기>와 분리 동봉하므로 "<보기>를 바탕으로 윗자료를
//     탐구한 내용으로 적절하지 않은 것은?" 프레임을 표준으로 삼는다.
//   자료: 원문 + [현대어 풀이] 병렬 — 낯선 소재여도 <보기> 설명만으로 풀리게
//   설계(평가원 관행 — 배경지식 무력화).
//   탐구 개념 풀: 주격 '이/ㅣ/∅', 관형격 'ㅅ/의', 객체 높임 '-삽-', 의문 어미,
//   이어적기(연철), 모음조화, 어두 자음군, 두음 법칙·구개음화 미적용, 8종성.
//   오답 원리: 현대 직관의 소급 적용 / 형태 오분석.
//
// 렌더 전제(v1 옛한글 회피 정책): 자료는 **현대 한글 전사만** 사용한다. 옛한글
// 조합 글리프(첫가끝 자모·아래아 등)는 렌더 폰트(맑은 고딕 계열) 미보장이므로
// 이 유형 검증기가 **error 로 차단**한다(공통 게이트의 warning 보다 엄격 —
// ARCHAIC 필수 유형은 글리프 혼입 확률이 구조적으로 높아 출하 차단이 필요).
//
// 표면 계약: 이 유형의 근거 표면은 지문이 아니라 자료(원문·풀이 행)와 <보기>다.
// 공통 게이트(quality/common.ts)는 지문/보기/자료 3표면을 모두 허용하므로,
// 여기 validate 가 "자료·보기 한정"을 자체 강제한다.
// ============================================================================

import { z } from "zod";
import { koBogiSchema, koMc5Envelope, koStimulusBlockSchema } from "../registry/envelope-schema";
import {
  buildDefaultKoRenderModel,
  readKoStimulusBlocks,
  type KoRenderModel,
  type KoRenderStimulusBlock,
} from "../core/render-model";
import type {
  KoQualityIssue,
  KoRenderContext,
  KoResolvedTypeSettings,
  KoTypeModule,
  KoValidationContext,
} from "../registry/type-module";

// ---------------------------------------------------------------------------
// 스키마 — 공통 봉투 + 중세 자료 필수 + <보기> 필수 + 오답 설계 기록
// ---------------------------------------------------------------------------

const schema = koMc5Envelope({
  koStimulus: z
    .array(koStimulusBlockSchema)
    .min(1)
    .describe(
      "중세 국어 자료 — 이 유형의 필수 자료. kind는 반드시 'ARCHAIC_TEXT' 1개 블록. lines는 엄격한 행 쌍: 원문 전사 행 바로 다음 행에 '[현대어 풀이] …' 행(2~4쌍). 원문은 현대 한글 전사만(옛한글 조합 글리프 절대 금지). title에 출전 표기(예: '훈민정음 언해(1459)')",
    ),
  bogi: koBogiSchema.describe(
    "<보기> — 탐구 개념 설명(이 유형의 필수 해석 틀). 자료에 실제로 나타나는 중세 국어 문법 개념 2~4개를 정의+현대 국어와의 대조로 설명. 모든 선지의 성립·배제가 이 개념 틀 안에서만 판정되도록 설계",
  ),
  distortionPrinciple: z
    .enum(["MODERN_INTUITION", "FORM_MISANALYSIS"])
    .describe(
      "정답(왜곡) 선지에 사용한 오답 원리: MODERN_INTUITION=현대 직관의 소급 적용(현대 국어 규칙·형태를 중세 자료에 무단 적용), FORM_MISANALYSIS=형태 오분석(형태소 경계 오분할·조사/어미 기능 오귀속)",
    ),
});

// ---------------------------------------------------------------------------
// 생성 프롬프트 — 카탈로그 §2.5 메커니즘을 출제 매뉴얼 수준으로
// ---------------------------------------------------------------------------

const prompt = `### 유형: 문법 — 국어사·중세 국어 탐구 (자료 자체 생성)

**⚠ 이 유형은 지문 출제형이 아니다.** 위에 제공된 지문은 참고하지 않아도 된다(소재 무관).
문항의 판정 대상은 네가 koStimulus 로 동봉하는 **중세 국어 자료**와 <보기>의 탐구 개념이며,
모든 선지·근거(evidence)는 자료와 <보기>에서만 성립해야 한다.

**발문 템플릿** (정확히 이 형태 — 부정발문 고정, [3점] 마크업 금지):
- 표준: "<보기>를 바탕으로 윗자료를 탐구한 내용으로 적절하지 않은 것은?"
긍정발문 금지. 낯선 자료여도 <보기> 설명만으로 풀리게 설계하는 것이 평가원 관행이다.

**중세 자료(koStimulus, kind="ARCHAIC_TEXT") 설계 — 행 쌍 구조 필수**:
1. ARCHAIC_TEXT 블록 1개. title 에 출전을 표기하라(예: "훈민정음 언해(1459)", "소학언해(1587)").
2. lines 는 **엄격한 행 쌍**이다: 원문 전사 행 1행 바로 다음 행에 "[현대어 풀이] …" 행 1행.
   이 쌍을 2~4개 배치하라. 풀이 없는 원문 행, 원문 없는 풀이 행은 모두 반려된다.
3. **현대 한글 전사만 사용하라 — 옛한글 문자 절대 금지.** 아래아(ㆍ)·첫가끝 조합 자모·
   어두 자음군 낱자·방점은 렌더 폰트가 보장되지 않아 시스템이 차단한다.
   전사 규약: 아래아는 문헌 관행 전사(사람/마음 류)로, 반치음·옛이응은 가장 가까운 현대
   자모로 근사하고, 성조(방점)는 논급 자체를 금지한다.
4. 자료는 교과서·기출에 반복 인용되는 대표 구절의 표준 전사를 우선 사용하라:
   - "나랏 말싸미 듕귁에 달아 문자와로 서르 사맛디 아니할쌔" (훈민정음 언해)
   - "불휘 기픈 남간 바라매 아니 뮐쌔" (용비어천가 2장)
   - "공자이 증자다려 닐러 가라사대" (소학언해)
   확실한 표준 전사가 없으면 <보기> 개념이 전형적으로 드러나는 구성 자료를 만들되,
   중세 국어의 실재 어형·문법에 부합해야 한다(사이비 고어 창작 금지).
5. 자료의 원문 행에는 <보기>에서 설명할 문법 현상이 **실제 어형으로** 2개 이상 나타나야
   한다. 풀이 행은 원문과 1:1 대응하는 자연스러운 현대어 번역으로 쓰라(원문을 그대로
   복사한 풀이 금지 — 풀이가 원문과 동일하면 중세 자료가 아니다).

**<보기>(bogi) 설계 — 탐구 개념 틀 (이 유형의 심장)**:
1. <보기>는 탐구 개념 2~4개의 설명이다. 개념 풀(닫힌 집합에서 자료에 실재하는 것만):
   - 조사: 주격 조사 '이/ㅣ/∅(영형태)' 환경별 실현, 목적격 '을/를' 계열, 관형격 'ㅅ'과 '의'
   - 높임: 객체 높임 선어말 어미 '-삽-/-잡-/-사옵-' 계열, 주체 높임 '-시-'
   - 어미: 판정 의문 '-가/-녀'와 설명 의문 '-고/-뇨'의 구별, 명사형 어미 '-옴/-움'
   - 표기·음운: 이어적기(연철), 모음조화, 어두 자음군, 두음 법칙 미적용,
     구개음화 미적용, 8종성 표기
2. 각 개념은 "중세 국어에서는 ~였다(현대 국어에서는 ~이다)" 골격으로 정의+현대 대조
   1~2문장. 항목이 여럿이면 'ㄱ. …' 형식 행으로 나눠라.
3. <보기>에 없는 개념으로만 성립하는 선지를 만들지 마라 — 판정 준거는 전부 <보기> 문면에
   있어야 한다(배경지식 무력화 원칙). <보기>에 자료 행을 그대로 복사하지 마라.

**선지 3요소 고정 규칙 (전 선지 공통 — 하나라도 빠지면 반려)**:
1. '자료 어절 인용': 자료의 어절을 작은따옴표('…')로 **2자 이상 verbatim** 인용 — 한 글자도
   바꾸지 마라. 형태소 하나('이', 'ㅣ')만 논할 때도 그것이 포함된 어절 전체를 함께 인용하라
   (예: "'말싸미'에는 …"). 인용은 선지마다 서로 다른 어절로, 자료 전체에 분산시켜라.
2. 보기 개념 연결: 인용 어절을 <보기>의 개념과 연결하는 탐구 진술 — <보기>에 쓴 개념
   어휘가 선지에 실제로 등장해야 한다.
3. 종결: 반드시 '~군' 또는 '~겠군'으로 끝낸다(학생 탐구 어미).
   예: "'말싸미'는 '말쌈'에 주격 조사 '이'가 결합하며 이어적기로 표기된 것이겠군."

**오답(왜곡) 선지 2원리 — distortionPrinciple 하나를 정확히 적용**:
- MODERN_INTUITION(현대 직관의 소급 적용): 현대 국어의 규칙·형태를 중세 자료에 무단
  적용한다. (예: 두음 법칙이 적용되었다고 서술, 주격 조사가 '가'로 실현되었다고 서술,
  끊어적기가 원칙이었다고 서술, 구개음화가 반영된 표기라고 서술)
- FORM_MISANALYSIS(형태 오분석): 어형 식별은 그럴듯하나 분석이 틀렸다. (예: '바미'를
  '바+미'로 오분할, 주격 'ㅣ' 결합을 목적격 실현으로 오귀속, 객체 높임 '-삽-'을 주체
  높임으로 서술, 판정 의문 어미를 설명 의문으로 라벨링)
왜곡은 **정확히 한 지점**이어야 한다. 인용 자체를 틀리게 하거나(자료에 없는 어형) 두 요소를
동시에 비틀면 난도가 무너진다 — 인용은 정답 선지에서도 항상 정확해야 한다.

**참 선지 4개 구성**:
- 각 선지는 서로 다른 인용 + 서로 다른 <보기> 개념으로, 자료-개념 대응이 [현대어 풀이]
  행과의 대조만으로 일의적으로 확인되게 하라.
- 참 선지끼리 개념 축(조사/높임/어미/표기·음운)을 분산시켜 특정 개념 편중을 피하라.

**빈발 반려 사유 — 인용·근거 verbatim (시스템이 기계 대조하므로 어기면 전량 반려)**:
1. **작성 순서 강제**: koStimulus 의 lines(원문 행+[현대어 풀이] 행)와 bogi.lines 를
   먼저 확정하고, 선지 인용·evidence spanText 는 **그 lines 에서 눈으로 찾아 복사-붙여넣기**
   하라. 기억 속 원문(훈민정음 언해·소학언해의 다른 판본 문구)이 아니라 **네가 이 응답에
   쓴 lines 가 유일한 인용 원천**이다 — lines 에 없는 문구를 인용하는 것이 최빈 반려 사유다.
2. [현대어 풀이] 행을 근거로 쓸 때는 그 행 문구 그대로 — 풀이를 다시 다듬거나 번역을
   바꿔 인용하면 반려된다. <보기> 근거도 bogi.lines 행 문구 그대로.
3. 선지의 작은따옴표 인용 어절('공자이', '뜯을' 류)도 자료 lines 에 실재하는 표기만 —
   인용할 어절이 자료에 없으면 자료 행을 고치는 게 아니라 인용을 자료에 있는 어절로 바꿔라.
4. 참고용 지문(위에 제공된 독서 지문)은 **어떤 표면에서도 인용 금지** — 이 유형의 근거
   표면은 중세 자료와 <보기>뿐이다.

**근거앵커(evidence) 작성 — 근거 표면은 자료와 <보기>다 (지문 인용 절대 금지)**:
- 모든 선지(①~⑤)에 evidence 1개 이상. spanText 는 **자료의 원문·풀이 행 또는 <보기> 행에서
  그대로 복사**한 구절이어야 한다(verbatim — 한 글자도 바꾸지 말 것).
- 참 선지: relation=SUPPORTS + 해당 어형이 실재하는 자료 구절(필요시 풀이 행 병용).
- MODERN_INTUITION 선지: 자료 표기가 왜곡 진술과 어긋남을 보이는 구절로
  relation=DISTORTS/CONTRADICTS. 자료에 아예 없는 현상의 사실화면 relation=NOT_MENTIONED +
  가장 가까운 관련 구절.
- FORM_MISANALYSIS 선지: relation=DISTORTS + 오분석 대상 어절이 포함된 자료 구절.

**금지**:
- 옛한글 조합 글리프(아래아·첫가끝 자모)·방점 논급 — 자료·보기·선지 전 표면에서 금지.
- 자료에 없는 어형의 인용, 풀이 행 없는 원문 행, 원문과 동일한 풀이 행.
- <보기>에 없는 개념으로만 정오가 갈리는 선지(배경지식 요구 — 이 유형의 자기부정).
- 두 개 이상의 선지가 같은 이유로 틀리는 구성, 왜곡 지점이 두 군데 이상인 정답 선지.
- 성조·방점·문헌 판본 등 전사로 검증 불가능한 문헌학 세부의 선지화.`;

// ---------------------------------------------------------------------------
// 설정
// ---------------------------------------------------------------------------

function buildSettingsPrompt(settings: KoResolvedTypeSettings): string {
  const lines: string[] = [];
  const focus = settings.conceptFocus;
  if (focus === "CASE") {
    lines.push(
      "- 탐구 개념 초점: 조사 중심 — 주격 '이/ㅣ/∅'의 환경별 실현과 관형격 'ㅅ/의' 구별을 <보기>의 축으로 삼고, 자료에 주격 실현 환경이 서로 다른 어절을 2개 이상 심어라.",
    );
  } else if (focus === "HONOR") {
    lines.push(
      "- 탐구 개념 초점: 높임 중심 — 객체 높임 선어말 어미('-삽-' 계열)와 주체 높임 '-시-'의 구별을 <보기>의 축으로 삼고, 자료에 두 높임이 함께 나타나는 문장을 넣어라.",
    );
  } else if (focus === "ENDING") {
    lines.push(
      "- 탐구 개념 초점: 어미 중심 — 판정 의문('-가/-녀')과 설명 의문('-고/-뇨')의 구별, 명사형 어미 '-옴/-움'을 <보기>의 축으로 삼고, 자료에 의문문을 1개 이상 넣어라.",
    );
  } else if (focus === "SPELLING") {
    lines.push(
      "- 탐구 개념 초점: 표기·음운 중심 — 이어적기(연철)·모음조화·두음 법칙 미적용·구개음화 미적용·8종성 표기를 <보기>의 축으로 삼고, 연철 어절과 현대와 표기가 갈리는 어절을 자료에 심어라.",
    );
  } else {
    lines.push(
      "- 탐구 개념 초점은 자료 특성에 맞게 자동 배분하라(조사/높임/어미/표기·음운에서 2~4개 — 자료에 실재하는 현상만).",
    );
  }
  if (settings.examMode === "NAESIN") {
    lines.push(
      "- 내신 모드: 자료는 '세종어제훈민정음' 서문 등 교과서 수록 구절의 축자 분석 관행을 따르고, <보기>는 수업에서 다루는 개념 정의(연철·모음조화 등)를 명시적으로 재확인하는 서술로 구성하라. 선지 1개는 개념어 정의 자체의 정오 확인을 겸해도 좋다.",
    );
  } else {
    lines.push(
      "- 수능 모드: 언매 39번 고정 슬롯 관행 — 낯선 자료여도 <보기> 설명+[현대어 풀이] 대조만으로 전 선지가 판정되게 하라(배경지식·암기 무력화). 개념어 나열보다 어형-개념 대응의 정밀성을 우선하라.",
    );
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// 검증 헬퍼 (결정론)
// ---------------------------------------------------------------------------

/**
 * 옛한글 조합 글리프 — 첫가끝 자모(U+1100~11FF)·자모 확장 A(U+A960~)·
 * 확장 B(U+D7B0~)·아래아(U+318D ㆍ). quality/common.ts 의 검출식과 동일하되,
 * 이 유형은 ARCHAIC 자료 필수라 혼입 확률이 구조적으로 높아 **error** 로 차단한다
 * (v1 렌더 폰트 미보장 — 렌더 불가 방지).
 */
const ARCHAIC_GLYPH_RE = /[ᄀ-ᇿꥠ-ꥼힰ-ퟻㆍ]/;

/** '[현대어 풀이] …' 행 판정 (행 쌍 구조 게이트의 기준선). */
const GLOSS_LINE_RE = /^\s*\[현대어\s*풀이\]\s*/;

/** 자료 블록들을 검증용 평문으로 (title 행 + 본문 행 — 공통 게이트와 동일 규약). */
function stimulusPlainText(blocks: KoRenderStimulusBlock[]): string {
  return blocks.map((b) => [b.title ?? "", ...b.lines].filter(Boolean).join("\n")).join("\n");
}

// <보기> 준거 어휘 추출 — KO_LIT_BOGI 의 결정론 패턴 미러(조사 박리 + 초일반어 제외)
const TRAILING_JOSA_RE =
  /(에서의|으로써|이라는|이라고|에서는|에게서|으로는|으로도|까지도|라는|라고|에서|에게|께서|보다|처럼|까지|부터|조차|마저|과의|와의|으로|로서|로써|이며|이고|하며|하고|하는|되는|이다|한다|였다|와|과|은|는|이|가|을|를|의|에|도|만|로|며|다)$/;

const BOGI_STOPWORDS = new Set([
  "있다", "없다", "것이", "것은", "것을", "그것", "이것", "저것", "때문", "경우", "이후", "이전",
  "통해", "위해", "대해", "대한", "가장", "매우", "여러", "다른", "같은", "모든", "바로", "다시",
  "그리고", "그러나", "하지만", "또한", "이러한", "그런데", "따라서", "그래서", "한편",
  "자료", "윗자료", "보기", "탐구", "중세", "현대", "국어", "현대어", "풀이", "쓰였다", "달리",
]);

/** <보기> 행들에서 판정용 개념 어휘(2자 이상 한글 어간)를 결정론 추출한다. */
function extractBogiKeywords(bogiLines: string[]): string[] {
  const keys = new Set<string>();
  for (const line of bogiLines) {
    const tokens = line.match(/[가-힣]{2,}/g) ?? [];
    for (const token of tokens) {
      const candidates = new Set<string>([token]);
      const stripped = token.replace(TRAILING_JOSA_RE, "");
      if (stripped.length >= 2) candidates.add(stripped);
      for (const c of candidates) {
        if (c.length >= 2 && !BOGI_STOPWORDS.has(c)) keys.add(c);
      }
    }
  }
  return [...keys];
}

function readBogiLines(question: Record<string, unknown>): string[] {
  if (!question.bogi || typeof question.bogi !== "object") return [];
  const lines = (question.bogi as Record<string, unknown>).lines;
  return Array.isArray(lines) ? lines.filter((l): l is string => typeof l === "string") : [];
}

const DISTORT_RELATIONS = new Set(["DISTORTS", "CONTRADICTS", "NOT_MENTIONED"]);

// ---------------------------------------------------------------------------
// 유형 특화 검증 (공통 게이트는 dispatch 가 선실행)
// ---------------------------------------------------------------------------

function validate(question: Record<string, unknown>, ctx: KoValidationContext): KoQualityIssue[] {
  const issues: KoQualityIssue[] = [];
  const add = (severity: "error" | "warning", code: string, message: string) =>
    issues.push({ severity, code, message });

  const direction = typeof question.direction === "string" ? question.direction : "";
  const options = Array.isArray(question.options)
    ? (question.options as Record<string, unknown>[])
    : [];

  // ── ① 발문: 부정발문 고정 + <보기>·자료 지시 프레임 ─────────────────────
  if (direction && !ctx.koText.isNegativeStemKo(direction)) {
    add(
      "error",
      "ko-direction-grammar",
      "국어사 탐구는 부정발문('~탐구한 내용으로 적절하지 않은 것은?') 고정 유형입니다",
    );
  }
  if (direction && !/보기/.test(direction)) {
    add(
      "error",
      "ko-direction-grammar",
      `발문이 <보기>(탐구 개념)를 지시하지 않습니다: "${direction.slice(0, 40)}"`,
    );
  }
  if (direction && !/(윗자료|자료)/.test(direction)) {
    add(
      "error",
      "ko-direction-grammar",
      `발문이 자료(중세 국어 자료)를 지시하지 않습니다 — "<보기>를 바탕으로 윗자료를 탐구한 ~" 프레임 필요: "${direction.slice(0, 40)}"`,
    );
  }

  // ── ② 자료: ARCHAIC_TEXT 존재 + '원문 행/[현대어 풀이] 행' 쌍 구조 (결정론) ──
  const blocks = readKoStimulusBlocks(question.koStimulus);
  const archaicBlocks = blocks.filter((b) => b.kind === "ARCHAIC_TEXT");
  if (archaicBlocks.length === 0) {
    // 공통 게이트의 required 결손과 별개로, kind 일탈(엉뚱한 자료만 동봉)도 여기서 차단
    add(
      "error",
      "ko-stimulus-missing",
      "중세 국어 자료(kind=ARCHAIC_TEXT)가 없습니다 — 이 유형의 판정 대상은 중세 자료입니다",
    );
  }
  let totalPairs = 0;
  for (const block of archaicBlocks) {
    const lines = block.lines;
    for (let i = 0; i < lines.length; i++) {
      const isGloss = GLOSS_LINE_RE.test(lines[i]);
      if (isGloss) {
        const glossBody = lines[i].replace(GLOSS_LINE_RE, "").trim();
        const prevIsSource = i > 0 && !GLOSS_LINE_RE.test(lines[i - 1]);
        if (!prevIsSource) {
          add(
            "error",
            "ko-stimulus-missing",
            `[현대어 풀이] 행(${i + 1}행)에 대응하는 원문 행이 바로 앞에 없습니다 — '원문 행+풀이 행' 엄격 쌍 구조 위반`,
          );
          continue;
        }
        if (!glossBody) {
          add("error", "ko-stimulus-missing", `[현대어 풀이] 행(${i + 1}행)의 풀이 내용이 비어 있습니다`);
          continue;
        }
        totalPairs += 1;
        // 원문 행과 풀이가 사실상 동일 → 중세 국어 특징이 없는 자료
        const sourceFlat = lines[i - 1].replace(/\s+/g, "");
        const glossFlat = glossBody.replace(/\s+/g, "");
        if (sourceFlat === glossFlat) {
          add(
            "warning",
            "ko-stimulus-kind",
            `원문 행과 [현대어 풀이] 행이 동일합니다 — 중세 국어 특징(표기·조사·어미 차이)이 드러나야 합니다: "${lines[i - 1].slice(0, 30)}"`,
          );
        }
      } else if (i + 1 >= lines.length || !GLOSS_LINE_RE.test(lines[i + 1])) {
        add(
          "error",
          "ko-stimulus-missing",
          `원문 행(${i + 1}행) 바로 다음에 '[현대어 풀이] …' 행이 없습니다 — 모든 원문 행은 풀이 행과 쌍이어야 합니다: "${lines[i].slice(0, 30)}"`,
        );
      }
    }
    // 출전 표기 관행
    if (!block.title) {
      add(
        "warning",
        "ko-stimulus-kind",
        "자료에 출전 표기(title — 예: '훈민정음 언해(1459)')가 없습니다 — 국어사 자료 관행",
      );
    }
  }
  if (archaicBlocks.length > 0 && totalPairs < 1) {
    add(
      "error",
      "ko-stimulus-missing",
      "자료에 '원문 행+[현대어 풀이] 행' 쌍이 하나도 없습니다 — 최소 1쌍(권장 2~4쌍) 필요",
    );
  } else if (archaicBlocks.length > 0 && totalPairs < 2) {
    add(
      "warning",
      "ko-stimulus-kind",
      `자료의 원문-풀이 쌍이 ${totalPairs}쌍입니다 — 선지 5개 판정에는 2~4쌍을 권장합니다`,
    );
  }

  // ── ③ 옛한글 글리프 차단 (자료·보기·선지 전 표면 — error, 렌더 불가 방지) ──
  //     공통 게이트는 자료만 warning(ko-render-fallback) — 이 유형은 error 로 승격.
  const bogiLines = readBogiLines(question);
  const glyphSurfaces: [string, string][] = [
    ["자료", archaicBlocks.map((b) => [b.title ?? "", ...b.lines].join("\n")).join("\n")],
    ["<보기>", bogiLines.join("\n")],
    ["선지", options.map((o) => (typeof o.text === "string" ? o.text : "")).join("\n")],
  ];
  for (const [surface, text] of glyphSurfaces) {
    if (text && ARCHAIC_GLYPH_RE.test(text)) {
      add(
        "error",
        "ko-render-fallback",
        `${surface}에 옛한글 글리프(첫가끝 조합 자모·아래아)가 있습니다 — v1 은 현대 한글 전사만 허용(렌더 폰트 미보장, 출하 차단)`,
      );
    }
  }

  // ── ④ 선지 3요소 ①: 자료 어절 인용(작은따옴표 2자 이상) verbatim ─────────
  //     공통 게이트는 4자 이상 인용의 3표면 verbatim 만 검사 — 여기서 존재 자체와
  //     '자료 표면' 인용임을 강제한다(국어사 인용은 2~3자 어절이 흔해 하한을 낮춤).
  const stimulusText = stimulusPlainText(archaicBlocks);
  for (const o of options) {
    const label = typeof o.label === "string" ? o.label : "";
    const text = typeof o.text === "string" ? o.text : "";
    if (!text) continue;
    const quotes = ctx.koText.extractQuotedSpansKo(text).filter((q) => q.length >= 2);
    if (quotes.length === 0) {
      add(
        "error",
        "ko-quote-not-verbatim",
        `${label} 선지에 작은따옴표 자료 인용(2자 이상 어절)이 없습니다 — 선지 3요소('자료 어절 인용'+보기 개념 연결+~군) 위반`,
      );
      continue;
    }
    if (!stimulusText || !quotes.some((q) => ctx.koText.containsSpanKo(stimulusText, q))) {
      add(
        "error",
        "ko-quote-not-verbatim",
        `${label} 선지의 인용('${quotes[0].slice(0, 20)}…')이 자료(원문·풀이 행)에 없습니다 — 자료 어절을 verbatim 인용해야 합니다`,
      );
    }
  }

  // ── ⑤ 선지 3요소 ②: 각 선지에 <보기> 개념 어휘 1개 이상 ─────────────────
  if (bogiLines.length > 0) {
    const keywords = extractBogiKeywords(bogiLines);
    if (keywords.length > 0) {
      for (const o of options) {
        const label = typeof o.label === "string" ? o.label : "";
        const text = typeof o.text === "string" ? o.text : "";
        if (!text) continue;
        if (!keywords.some((k) => text.includes(k))) {
          add(
            "error",
            "ko-bogi-missing",
            `${label} 선지에 <보기> 탐구 개념 어휘가 하나도 없습니다 — 자료 인용을 <보기> 개념과 연결하는 탐구 진술이어야 합니다`,
          );
        }
      }
    }
  }

  // ── ⑥ 근거 표면 한정: evidence 스팬은 자료 또는 <보기> verbatim ───────────
  //     공통 게이트는 지문/보기/자료 3표면을 모두 허용 — 이 유형은 지문 표면을
  //     배제한다(지문에만 있는 스팬이 통과하는 구멍 봉쇄).
  const bogiText = bogiLines.join("\n");
  const evidence = Array.isArray(question.evidence)
    ? (question.evidence as Record<string, unknown>[])
    : [];
  for (const e of evidence) {
    const span = typeof e.spanText === "string" ? e.spanText : "";
    if (!span) continue;
    const inStimulus = !!stimulusText && ctx.koText.containsSpanKo(stimulusText, span);
    const inBogi = !!bogiText && ctx.koText.containsSpanKo(bogiText, span);
    if (!inStimulus && !inBogi) {
      add(
        "error",
        "ko-evidence-not-in-passage",
        `근거 스팬이 자료·<보기>에 없습니다 — 이 유형의 근거 표면은 중세 자료(원문·풀이 행)와 <보기>이며 지문 인용은 금지입니다: "${span.slice(0, 40)}"`,
      );
    }
  }

  // ── ⑦ 극성-근거관계 정합 (부정발문 고정: 정답=왜곡, 나머지=SUPPORTS) ──────
  const correctAnswer = typeof question.correctAnswer === "string" ? question.correctAnswer : "";
  const relationOf = new Map<string, Set<string>>();
  for (const e of evidence) {
    const label = typeof e.optionLabel === "string" ? e.optionLabel : "";
    const relation = typeof e.relation === "string" ? e.relation : "";
    if (!label || !relation) continue;
    const set = relationOf.get(label) ?? new Set<string>();
    set.add(relation);
    relationOf.set(label, set);
  }
  for (const [label, relations] of relationOf) {
    const isCorrect = label === correctAnswer;
    if (isCorrect && ![...relations].some((r) => DISTORT_RELATIONS.has(r))) {
      add(
        "error",
        "ko-evidence-missing",
        `${label} 는 정답(왜곡) 선지인데 근거 relation 이 왜곡 계열(DISTORTS/CONTRADICTS/NOT_MENTIONED)이 아닙니다`,
      );
    }
    if (!isCorrect && !relations.has("SUPPORTS")) {
      add(
        "error",
        "ko-evidence-missing",
        `${label} 는 참(적절한 탐구) 선지인데 SUPPORTS 근거가 없습니다 — 해당 어형이 실재하는 자료 구절을 앵커하세요`,
      );
    }
  }

  return issues;
}

// ---------------------------------------------------------------------------
// 모듈
// ---------------------------------------------------------------------------

export const KO_GR_HIST: KoTypeModule = {
  meta: {
    typeId: "KO_GR_HIST",
    area: "GRAMMAR",
    label: "국어사·중세 국어",
    formatCategory: "객관식",
    uiGroup: "국어 문법",
    answerFormat: "MC5",
    // 자체자료형: 지문 미동봉 — 중세 자료(koStimulus)+<보기>가 판정 표면의 전부.
    includesPassage: false,
    passageKinds: [
      "GRAMMAR_CONCEPT", "READING_HUM", "READING_SOC", "READING_SCI", "READING_TECH", "READING_ART", "MIXED",
    ],
    defaultPoints: 2,
    usesBogi: "required",
    usesStimulus: "required",
    stimulusKinds: ["ARCHAIC_TEXT"],
    markerFamilies: [],
    optionEnding: "appreciation",
    needsSolverGate: false,
    description:
      "중세 국어 자료(원문 전사+[현대어 풀이] 행 쌍)와 <보기> 탐구 개념(주격 이/ㅣ/∅·객체 높임·의문 어미·이어적기·모음조화 등)을 대조해, 현대 직관의 소급 적용·형태 오분석 선지를 가려내는 언매 39번형 국어사 유형",
    setSlot: "언매 국어사 슬롯(수능 39번 고정 관행) — 문법 세트 후반 단독 문항",
    studentTask:
      "중세 자료의 원문 어절을 [현대어 풀이]·<보기> 개념 설명과 대조해, 현대 직관을 소급 적용했거나 형태를 오분석한 탐구 하나를 고릅니다.",
    bestFor: [
      "언매 국어사(중세 국어) 대비 — 훈민정음 언해·용비어천가·소학언해 구절 탐구",
      "내신 '세종어제훈민정음' 축자 분석 단원 변형",
      "조사·높임·의문 어미·표기법의 통시 대조 훈련",
    ],
    outputUi: [
      "중세 자료 박스(원문 전사+[현대어 풀이] 행 쌍, 출전 표기)",
      "〈보기〉 탐구 개념 박스",
      "5지선다(~군 탐구형)",
      "선지별 어형-개념 정합 해설",
    ],
  },
  schema,
  prompt,
  settings: {
    knobs: [
      {
        key: "conceptFocus",
        label: "탐구 개념 초점",
        kind: "select",
        options: [
          { value: "AUTO", label: "자동(자료 특성)" },
          { value: "CASE", label: "조사(주격 이/ㅣ/∅·관형격)" },
          { value: "HONOR", label: "높임(객체 높임 -삽-·주체 -시-)" },
          { value: "ENDING", label: "어미(판정/설명 의문·명사형)" },
          { value: "SPELLING", label: "표기·음운(연철·모음조화·어두 자음군)" },
        ],
        defaultValue: "AUTO",
        description: "<보기> 탐구 개념과 자료 어형 설계의 무게 중심",
      },
    ],
    buildPrompt: buildSettingsPrompt,
  },
  validate,
  toRenderModel(question, ctx: KoRenderContext): KoRenderModel {
    // 자체자료형 — 지문 미동봉(중세 자료 stimulus 는 buildDefault 가 항상 포함).
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
      "탐구 개념 2개·자료 2쌍으로. 왜곡은 MODERN_INTUITION 위주 — <보기>의 '중세 국어에서는 ~였다' 정의 한 문장과 정면 배치되어 즉시 판정되게 하라. 인용 어절과 풀이 행의 대응을 표면에서 바로 확인 가능하게.",
    INTERMEDIATE:
      "탐구 개념 3개·자료 2~3쌍. 왜곡은 FORM_MISANALYSIS 위주 — 형태소 경계 오분할·조사 기능 오귀속처럼 [현대어 풀이]와의 정밀 대조가 필요하게 하라. 참 선지 중 1개는 <보기> 개념 2개를 결합한 진술로.",
    KILLER:
      "탐구 개념 4개·자료 3~4쌍. 왜곡은 '절반 참' 설계로: 어형 식별·인용·풀이 대응은 전부 정확하고 오직 문법 기능 라벨만 한 끗 오귀속하라(객체 높임↔주체 높임, 판정 의문↔설명 의문, 주격 ㅣ↔관형격). 유사 환경 어절 쌍을 자료에 심어 <보기> 조건('모음 뒤에서는 ㅣ' 류)의 정밀 적용 없이는 배제가 불가능하게 하라. 부정발문 유지 — 이 유형에 긍정 전환 관행은 없다.",
  },
};
