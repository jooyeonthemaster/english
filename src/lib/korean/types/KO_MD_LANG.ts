// ============================================================================
// KO_MD_LANG — 매체: 매체 언어 표현 (문법 융합 · 언매 42번 미러 · 3점 빈발)
// ============================================================================
// 카탈로그 §2.6 KO_MD_LANG 사양의 전면 구현. 자체자료(koStimulus) 필수 유형 —
// 매체 화면 텍스트 목업(MEDIA_SCREEN: 누리집 게시문·방송 자막·메신저)을 신규
// 생성해 문항에 동봉하고, 그 본문 문장 5곳에 ㉠~㉤을 stimulus 표면으로 마킹한다.
//
// 실측 관행(언매 40~45번 매체 세트, 2026 수능 42번 [3점] 확정):
//   발문: "㉠~㉤에 드러난 표현 방식에 대한 설명으로 적절하지 않은 것은?"
//   메커니즘: 매체 텍스트 문장에 피동(객관화)·인용(신뢰성·출처 명시)·
//   청유/의문 종결(관여 유도)·접속 표현 마킹 → '형식 → 의도 효과' 대응 판정.
//   오답원리(단일): 형식 식별은 옳되 **효과 오귀속** — 형식명을 틀리게 하지 않는다.
//   배점: 3점 빈발(고정 규칙 아님) — meta 기본 2점 + points 로 3점 상향(설정 knob).
//
// 결정론 게이트 3축:
//   ① 마커 5개(KOR_CIRCLED·stimulus 표면·㉠~㉤ 전원)
//   ② 선지-마커 1:1 순서 대응(①=㉠ … ⑤=㉤, lockedOptionOrder)
//   ③ 형식 표지 휴리스틱 — markerForms 선언 ↔ 자료 문장 표지(피동 '-되다/-어지다',
//      인용 '-라고/-다고', 청유 '-읍시다/-자', 의문 '?', 접속 부사) ↔ 선지 형식
//      식별부(피동/인용/청유/의문/접속) 3자 대조.
//
// 표면 계약: 이 유형의 근거 표면은 지문이 아니라 매체 자료다. 공통 게이트
// (quality/common.ts)의 evidence verbatim 판정은 지문/보기/자료 3표면을 모두
// 허용하므로, 여기 validate 가 "자료 표면 한정"을 자체 강제한다.
// ============================================================================

import { z } from "zod";
import { koMarkerSchema, koMc5Envelope, koStimulusBlockSchema } from "../registry/envelope-schema";
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
  KoTypeMeta,
  KoTypeModule,
  KoValidationContext,
} from "../registry/type-module";

// ---------------------------------------------------------------------------
// 형식 축 상수 — 스키마·프롬프트·검증기가 공유하는 단일 소스
// ---------------------------------------------------------------------------

const MARKER_LABELS = ["㉠", "㉡", "㉢", "㉣", "㉤"] as const;
type MarkerLabel = (typeof MARKER_LABELS)[number];

const FORM_VALUES = ["PASSIVE", "QUOTATION", "HORTATIVE", "INTERROGATIVE", "CONNECTIVE"] as const;
type KoMdForm = (typeof FORM_VALUES)[number];

/** 선지 [형식 식별]부에 반드시 등장해야 하는 문법 용어 (결정론 대조 축). */
const FORM_TERM_KO: Record<KoMdForm, string> = {
  PASSIVE: "피동",
  QUOTATION: "인용",
  HORTATIVE: "청유",
  INTERROGATIVE: "의문",
  CONNECTIVE: "접속",
};

/**
 * 형식 표지 휴리스틱 — 마킹된 자료 문장(spanText)에 선언 형식의 표면 표지가
 * 실재하는지 검사한다. 프롬프트가 생성을 검출 가능 형태로 제약하므로
 * (피동 = '-되다/-어지다' 형 강제, 의문 = 물음표 종결 등) error 로 안전하다.
 */
const FORM_SURFACE_RE: Record<KoMdForm, RegExp> = {
  PASSIVE:
    /(되[었어여며고는니]|된다|됩니|됐|돼|[아어여워려혀]지[고게며면는니다]|[아어여워려혀]진|[아어여워려혀]져|[아어여워려혀]졌|[아어여워려혀]집)/,
  QUOTATION: /([라다냐자]고(\s|$|[는도만하'"”])|["“][^"”]{2,}["”])/,
  HORTATIVE: /(읍시다|[가-힣]시다|[가-힣]자)[\s.!~'"”』」)]*$/,
  INTERROGATIVE: /[?？]/,
  CONNECTIVE:
    /^(그리고|그러나|하지만|그런데|그래서|따라서|그러므로|왜냐하면|또한|게다가|한편|반면|즉|이처럼|아울러|더불어|그렇지만)/,
};

/** [의도·효과]부 존재 판정용 매체 소통 효과 어휘 (닫힌 집합 — 결정론). */
const EFFECT_TERMS = [
  "객관", "신뢰", "출처", "주체", "참여", "동참", "유도", "환기", "관심", "주의",
  "강조", "전달", "연결", "인과", "대조", "첨가", "전환", "응집", "친근", "생생",
  "현장감", "집중", "정보", "수용자", "독자", "시청자", "누리꾼", "관여", "실천", "인상",
] as const;

const OPTION_LABELS = ["①", "②", "③", "④", "⑤"] as const;
const DISTORT_RELATIONS = new Set(["DISTORTS", "CONTRADICTS", "NOT_MENTIONED"]);

// ---------------------------------------------------------------------------
// 스키마 — 공통 봉투 + 매체 화면 자료 필수 + 마커 5 + 형식 선언 5
// ---------------------------------------------------------------------------

const schema = koMc5Envelope({
  koStimulus: z
    .array(koStimulusBlockSchema)
    .min(1)
    .describe(
      "매체 화면 텍스트 목업 — 이 유형의 필수 자료. kind는 반드시 'MEDIA_SCREEN' 1개 블록. title=화면 이름(예: '○○시 보건소 누리집 게시판'), lines는 화면 행 단위 재현(연출 지시는 '［화면 상단 메뉴: 소식 | 참여 | 문의］' 대괄호 행). 마킹 대상 본문 문장 5개 포함",
    ),
  markers: z
    .array(koMarkerSchema)
    .length(5)
    .describe(
      "㉠~㉤ 마커 5개 — 전부 family='KOR_CIRCLED', targetSurface='stimulus'(자료 표면) 필수. spanText는 자료 본문 문장 전체를 그대로 복사(verbatim), 라벨은 자료 등장 순서대로",
    ),
  markerForms: z
    .array(
      z.object({
        label: z.enum(MARKER_LABELS).describe("마커 라벨 (㉠~㉤)"),
        form: z
          .enum(FORM_VALUES)
          .describe(
            "그 문장의 표현 형식: PASSIVE=피동('-되다/-어지다' 형), QUOTATION=인용('-라고/-다고'), HORTATIVE=청유형 종결('-읍시다/-자'), INTERROGATIVE=의문형 종결(물음표), CONNECTIVE=접속 표현(문두 접속 부사)",
          ),
      }),
    )
    .length(5)
    .describe(
      "마커별 표현 형식 선언 — 5형식을 각각 정확히 하나씩. 결정론 게이트가 자료 문장 표지·선지 형식 식별부와 3자 대조한다",
    ),
});

// ---------------------------------------------------------------------------
// 생성 프롬프트 — 카탈로그 §2.6 메커니즘을 출제 매뉴얼 수준으로
// ---------------------------------------------------------------------------

const prompt = `### 유형: 매체 — 매체 언어 표현 (문법 융합 · 언매 42번 미러)

**⚠ 이 유형은 지문 출제형이 아니다.** 위에 제공된 지문은 **매체 자료의 화제·정보 소재로만** 참고하라.
문항의 판정 대상은 네가 koStimulus 로 새로 쓰는 **매체 화면 텍스트(MEDIA_SCREEN)**이며, 마커 ㉠~㉤과
모든 근거(evidence)는 이 자료에서만 성립해야 한다. 지문 문장을 자료에 그대로 복사하지 마라(25자 이상
연속 일치 금지) — 게시문·자막·대화의 매체 문면으로 전면 재작성하라.

**발문 템플릿** (정확히 이 형태 — [3점] 마크업 금지):
"㉠~㉤에 드러난 표현 방식에 대한 설명으로 적절하지 않은 것은?"
이 유형의 발문은 반드시 부정발문이다. 긍정발문 금지.

**매체 자료(koStimulus, kind="MEDIA_SCREEN") 설계 — 텍스트 목업**:
1. 화면 형식 3종 중 하나: 누리집(기관·학교 홈페이지) 게시문 / 방송 프로그램 자막·진행자 멘트 /
   메신저 대화방. title 에 화면 이름을 적어라 (예: "○○시 보건소 누리집 게시판").
2. lines 는 화면의 행 단위 재현이다. 메뉴 바·버튼·이미지 자리 같은 화면 연출은 **대괄호 연출 지시
   행**으로 재현하라: "［화면 상단 메뉴: 소식 | 참여 마당 | 문의］", "［행사 홍보 사진］".
   연출 지시 행에는 마커를 걸지 마라 — 마킹 대상은 본문 문장이다. 정렬용 다중 공백은 쓰지 마라.
3. 본문 분량 300~700자(공백 제외). 수용자(누리꾼·시청자·대화 참여자)를 상정한 공적 매체 언어로 쓰라.
4. 본문 문장 5개에 아래 5가지 표현 형식을 **각각 정확히 하나씩** 구현하라 (markerForms 에 라벨별 기록):
   - PASSIVE(피동): 반드시 '-되다' 또는 '-어지다' 형으로. (예: "참가 신청은 이번 주 금요일에
     마감됩니다", "행사장 위치는 첨부 지도에서 자세히 확인되도록 안내되어 있습니다")
     접미 피동(이/히/리/기) 단독형은 쓰지 마라 — 결정론 게이트가 '-되다/-어지다' 표지를 검사한다.
   - QUOTATION(인용): 간접 인용 '-라고/-다고' (직접 인용 "…"+'라고' 허용). 인용 주체(전문가·기관·
     참여자)를 문장에 명시하라. (예: "보건 전문가들은 손 씻기가 가장 효과적인 예방법이라고 강조합니다")
   - HORTATIVE(청유형 종결): '-읍시다/-ㅂ시다' 또는 '-자'로 문장을 끝내라. (예: "우리 모두
     행사에 동참합시다.")
   - INTERROGATIVE(의문형 종결): 물음표(?)로 끝나는 의문문. (예: "여러분은 하루에 몇 번 손을
     씻고 있나요?")
   - CONNECTIVE(접속 표현): 문장 첫머리에 접속 부사(그리고/그러나/하지만/그런데/따라서/그래서/
     또한/한편/왜냐하면 등)를 두어 앞 문장과의 연결 관계를 명시하라.
5. markers: 5개 전부 family="KOR_CIRCLED", targetSurface="stimulus". 라벨 ㉠~㉤은 자료 등장
   순서대로, spanText 는 해당 문장 전체를 자료에서 그대로 복사하라(verbatim — 한 글자도 바꾸지 말 것).

**선지 구성 — [형식 식별]+[의도·효과] 2절, '~고 있다' 종결, 마커 1:1 순서 대응**:
1. 선지 ①~⑤는 마커 ㉠~㉤과 **순서대로 1:1 대응**한다(①=㉠, ②=㉡, … ⑤=㉤ — 이 유형은 정답 위치
   셔플 없음). 각 선지는 자기 마커 라벨을 지시하고 다른 마커 라벨을 언급하지 마라.
   예: "㉠: 피동 표현을 사용하여 접수 마감 사실을 행위 주체를 드러내지 않고 객관적으로 전달하고 있다."
2. [형식 식별]부: 그 마커 문장의 문법 형식을 정확한 용어로 명시하라 — 피동 (표현/접사), 인용 (표현),
   청유형 종결 (어미), 의문형 종결 (어미), 접속 (표현/부사). markerForms 선언과 일치해야 한다
   (게이트가 자료 표지·선언·선지 3자 대조).
3. [의도·효과]부: 매체 언어의 소통 효과. 형식별 정합 효과 축:
   - 피동 → 행위 주체를 드러내지 않음 · 정보의 객관적 전달(객관화)
   - 인용 → 전문가·기관의 말을 끌어와 신뢰성 확보 · 출처 명시
   - 청유 → 수용자의 행동·참여 유도(관여 유도)
   - 의문 → 수용자의 관심·주의 환기, 스스로 답을 떠올리게 하여 관여 유도
   - 접속 → 앞뒤 정보의 연결 관계(첨가·대조·인과) 명시로 내용의 응집성 강화
4. 모든 선지는 '~고 있다'로 끝낸다.

**정답(오답원리) — 형식은 옳되 효과 오귀속 (단일 원리)**:
- 정답 선지 1개도 [형식 식별]부는 정확해야 한다 — 형식명을 틀리게 만들지 마라(그건 이 유형의
  오답원리가 아니다).
- 왜곡은 [의도·효과]부에서 **정확히 한 지점**: 그 형식·국면에 맞지 않는 효과를 붙여라.
  예: 피동 문장(주체 숨김)에 "출처를 명시하여 신뢰성을 높이고 있다" / 관심 환기용 의문문에
  "수용자에게 정보의 사실 여부 확인을 요구하고 있다" / 첨가의 접속 표현에 "앞선 내용과 상반되는
  정보로 전환됨을 드러내고 있다".
- 참 선지 4개는 형식·효과가 모두 자료의 해당 국면과 정합해야 한다.

**근거앵커(evidence) 작성 — 근거 표면은 매체 자료다 (지문 인용 절대 금지)**:
- 모든 선지(①~⑤)에 evidence 1개 이상. spanText 는 **자료(koStimulus lines)에서 그대로 복사**한
  구절이어야 한다(verbatim).
- 참 선지: relation=SUPPORTS + 해당 마커 문장(또는 효과가 드러나는 주변 문맥).
- 정답(효과 오귀속) 선지: relation=DISTORTS + 실제 효과·기능이 드러나는 마커 문장.

**금지**:
- 형식 식별 자체가 틀린 정답 선지 (오답원리는 '효과 오귀속' 하나다).
- 두 선지가 같은 이유로 틀리는 구성, 왜곡 지점이 두 곳 이상인 정답 선지.
- 선지-마커 순서 어긋남(①=㉠ … ⑤=㉤ 고정), 한 선지가 다른 마커 라벨을 함께 언급.
- 연출 지시 행(［…］)에 마커 걸기, 지문 문장의 자료 통복사, evidence 의 지문 인용.
- '~고 있다' 이외의 선지 종결, [의도·효과]부 없는 형식 단독 선지.`;

// ---------------------------------------------------------------------------
// 설정
// ---------------------------------------------------------------------------

function buildSettingsPrompt(settings: KoResolvedTypeSettings): string {
  const lines: string[] = [];
  const format = settings.mediaFormat;
  if (format === "WEB_POST") {
    lines.push(
      "- 화면 형식: 누리집 게시문 — 연출 지시 행(상단 메뉴·게시판 제목·작성자·등록일)과 공지 본문으로 구성하라. 댓글 1~2행을 붙여도 좋다(마커는 본문에만).",
    );
  } else if (format === "BROADCAST") {
    lines.push(
      "- 화면 형식: 방송 프로그램 — '［자막: …］' 연출 지시 행과 진행자 멘트 행을 조합하라. 청유·의문 종결이 진행자 멘트에서 자연스럽게 나오게 하라.",
    );
  } else if (format === "MESSENGER") {
    lines.push(
      "- 화면 형식: 메신저 대화방 — 화자 라벨('진행자: …', '학생 1: …') 행으로 재현하라. 학급·동아리 공지방처럼 공적 안내 성격의 대화로 설정해 피동·인용도 자연스럽게 나오게 하라.",
    );
  } else {
    lines.push("- 화면 형식은 소재에 맞게 택1하라 (누리집 게시문/방송 자막·멘트/메신저 대화방).");
  }
  if (settings.points === "3") {
    lines.push(
      "- points 필드를 3으로 설정하라 — 언매 42번 3점 슬롯 미러(2026 수능 42번 [3점] 확정, 3점 빈발 유형).",
    );
  } else {
    lines.push("- points 는 2(기본 배점)로 두어라.");
  }
  if (settings.examMode === "NAESIN") {
    lines.push(
      "- 내신 모드: [형식 식별]부에 문법 개념어를 교과서 수준으로 정확히 명시하라(피동 표현 '-되다/-어지다', 간접 인용, 청유형 종결 어미, 의문형 종결 어미, 접속 부사) — 언어(문법) 단원 연계를 드러내라. 효과 오귀속은 수업에서 다루는 매체 언어 효과 개념(객관화·신뢰성·관여 유도·응집성) 안에서 구성하라.",
    );
  } else {
    lines.push(
      "- 수능 모드: 언매 42번 미러 — 매체 문면 대조만으로 일의적으로 판정되게 하되, 정답의 효과 오귀속은 해당 국면의 기능과 정면으로 어긋나게 하라(애매한 중간 지대 금지 — 매체 수용 유형은 이의신청 취약 유형군이다).",
    );
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// 검증 헬퍼 (결정론)
// ---------------------------------------------------------------------------

interface LocalMarker {
  family: string;
  label: string;
  spanText: string;
  targetSurface?: string;
}

function readMarkersLocal(v: unknown): LocalMarker[] {
  if (!Array.isArray(v)) return [];
  const out: LocalMarker[] = [];
  for (const raw of v) {
    if (!raw || typeof raw !== "object") continue;
    const m = raw as Record<string, unknown>;
    if (typeof m.family === "string" && typeof m.label === "string" && typeof m.spanText === "string") {
      out.push({
        family: m.family,
        label: m.label,
        spanText: m.spanText,
        targetSurface: typeof m.targetSurface === "string" ? m.targetSurface : undefined,
      });
    }
  }
  return out;
}

interface FormEntry {
  label: string;
  form: KoMdForm;
}

function readMarkerForms(v: unknown): FormEntry[] {
  if (!Array.isArray(v)) return [];
  const out: FormEntry[] = [];
  for (const raw of v) {
    if (!raw || typeof raw !== "object") continue;
    const f = raw as Record<string, unknown>;
    if (
      typeof f.label === "string" &&
      typeof f.form === "string" &&
      (FORM_VALUES as readonly string[]).includes(f.form)
    ) {
      out.push({ label: f.label, form: f.form as KoMdForm });
    }
  }
  return out;
}

/** 자료 블록들을 검증용 평문으로 (title 행 + 본문 행 — 공통 게이트와 동일 규약). */
function stimulusPlainText(blocks: KoRenderStimulusBlock[]): string {
  return blocks.map((b) => [b.title ?? "", ...b.lines].filter(Boolean).join("\n")).join("\n");
}

// ---------------------------------------------------------------------------
// 유형 특화 검증 (공통 게이트는 dispatch 가 선실행 — 마커 해소·중첩·어미 등)
// ---------------------------------------------------------------------------

function validate(question: Record<string, unknown>, ctx: KoValidationContext): KoQualityIssue[] {
  const issues: KoQualityIssue[] = [];
  const add = (severity: "error" | "warning", code: string, message: string) =>
    issues.push({ severity, code, message });

  const direction = typeof question.direction === "string" ? question.direction : "";

  // ── ① 발문: 부정발문 고정 + ㉠~㉤ 범위 + '표현 방식' 프레임 ─────────────
  if (direction && !ctx.koText.isNegativeStemKo(direction)) {
    add(
      "error",
      "ko-direction-grammar",
      "매체 언어 표현은 부정발문('㉠~㉤에 드러난 표현 방식에 대한 설명으로 적절하지 않은 것은?') 고정 유형입니다",
    );
  }
  if (direction && !(direction.includes("㉠") && direction.includes("㉤"))) {
    add(
      "error",
      "ko-direction-grammar",
      `발문이 마커 범위(㉠~㉤)를 지시하지 않습니다: "${direction.slice(0, 40)}"`,
    );
  }
  if (direction && !/표현/.test(direction)) {
    add(
      "error",
      "ko-direction-grammar",
      `발문이 '표현 방식'을 지시하지 않습니다: "${direction.slice(0, 40)}"`,
    );
  }

  // ── ② 매체 자료(MEDIA_SCREEN) 존재 + 분량 + 지문 통복사 ─────────────────
  const blocks = readKoStimulusBlocks(question.koStimulus);
  const mediaBlocks = blocks.filter((b) => b.kind === "MEDIA_SCREEN");
  if (mediaBlocks.length === 0) {
    // 공통 게이트의 required 결손과 별개로, kind 일탈(엉뚱한 자료만 동봉)도 여기서 차단
    add(
      "error",
      "ko-stimulus-missing",
      "매체 화면(kind=MEDIA_SCREEN) 자료가 없습니다 — 이 유형의 판정 대상은 매체 화면 텍스트입니다",
    );
  } else {
    const mediaText = stimulusPlainText(mediaBlocks);
    const mediaChars = ctx.koText.charCountKo(mediaText);
    if (mediaChars < 150) {
      add(
        "error",
        "ko-stimulus-missing",
        `매체 자료가 너무 짧습니다(공백 제외 ${mediaChars}자) — 표현 형식 5개 문장 판정에는 최소 150자(권장 300~700자)가 필요합니다`,
      );
    }
    for (const block of mediaBlocks) {
      const copied = block.lines.find(
        (line) => line.length >= 25 && ctx.koText.containsSpanKo(ctx.passage, line),
      );
      if (copied) {
        add(
          "warning",
          "ko-stimulus-kind",
          `매체 자료 행이 지문 문장을 그대로 복사했습니다 — 매체 문면(게시문·자막·대화)으로 재작성 필요: "${copied.slice(0, 30)}…"`,
        );
        break;
      }
    }
  }

  // ── ③ 마커 프레임: 5개 · KOR_CIRCLED · stimulus 표면 · ㉠~㉤ 전원 ───────
  const markers = readMarkersLocal(question.markers);
  if (markers.length !== 5) {
    add(
      "error",
      "ko-marker-option-mismatch",
      `마커가 ${markers.length}개입니다 — 이 유형은 ㉠~㉤ 5개 고정(선지-마커 1:1 대응)입니다`,
    );
  }
  const markerLabelSet = new Set(markers.map((m) => m.label));
  const missingLabels = MARKER_LABELS.filter((l) => !markerLabelSet.has(l));
  if (markers.length > 0 && missingLabels.length > 0) {
    add(
      "error",
      "ko-marker-option-mismatch",
      `마커 라벨이 ㉠~㉤ 을 채우지 못했습니다 (누락: ${missingLabels.join(" ")}) — 이 유형의 마커는 KOR_CIRCLED ㉠~㉤ 고정입니다`,
    );
  }
  for (const m of markers) {
    if (m.family !== "KOR_CIRCLED") {
      add(
        "error",
        "ko-marker-option-mismatch",
        `마커 ${m.label} 의 family(${m.family})가 규격 밖입니다 — 이 유형은 KOR_CIRCLED(㉠~㉤) 고정입니다`,
      );
    }
    if (m.targetSurface !== "stimulus") {
      add(
        "error",
        "ko-marker-unresolved",
        `마커 ${m.label} 가 targetSurface="stimulus" 가 아닙니다 — 이 유형의 마킹 표면은 매체 자료(화면)이며 지문 마킹은 금지입니다`,
      );
    }
    if (m.spanText.includes("［") || m.spanText.includes("］")) {
      add(
        "warning",
        "ko-marker-hierarchy",
        `마커 ${m.label} 가 연출 지시 행(［…］)에 걸렸습니다 — 마킹 대상은 본문 문장이어야 합니다`,
      );
    }
  }

  // ── ④ markerForms 선언: 라벨 전원 + 5형식 각 1회 + 자료 문장 표지 대조 ──
  const formEntries = readMarkerForms(question.markerForms);
  const formOf = new Map<string, KoMdForm>();
  for (const f of formEntries) {
    if (formOf.has(f.label)) {
      add("error", "ko-marker-option-mismatch", `markerForms 에 ${f.label} 선언이 중복됩니다`);
    }
    formOf.set(f.label, f.form);
  }
  const missingForms = MARKER_LABELS.filter((l) => !formOf.has(l));
  if (missingForms.length > 0) {
    add(
      "error",
      "ko-marker-option-mismatch",
      `markerForms 선언이 결손입니다 (누락: ${missingForms.join(" ")}) — 마커 5개 전원의 표현 형식을 선언해야 합니다`,
    );
  }
  const distinctForms = new Set(formEntries.map((f) => f.form));
  if (formEntries.length === 5 && distinctForms.size < FORM_VALUES.length) {
    add(
      "warning",
      "ko-marker-hierarchy",
      `표현 형식이 ${distinctForms.size}종입니다 — 5형식(피동/인용/청유/의문/접속) 각 1회 배분이 이 유형의 표준입니다`,
    );
  }
  // 형식 표지 휴리스틱: 선언 형식의 표면 표지가 마킹 문장에 실재해야 한다
  for (const m of markers) {
    const form = formOf.get(m.label);
    if (!form) continue;
    const span = m.spanText.trim();
    if (span && !FORM_SURFACE_RE[form].test(span)) {
      add(
        "error",
        "ko-marker-option-mismatch",
        `${m.label} 문장에 선언 형식(${form}=${FORM_TERM_KO[form]})의 표지가 없습니다 — 피동은 '-되다/-어지다', 인용은 '-라고/-다고', 청유는 '-읍시다/-자', 의문은 '?', 접속은 문두 접속 부사여야 합니다: "${span.slice(0, 40)}"`,
      );
    }
  }

  // ── ⑤ 선지-마커 1:1 순서 대응 + 형식 식별부 용어 + 효과부 존재 ──────────
  const options = Array.isArray(question.options)
    ? (question.options as Record<string, unknown>[])
    : [];
  if (options.length === 5) {
    for (let i = 0; i < 5; i++) {
      const o = options[i];
      const label = typeof o.label === "string" ? o.label : OPTION_LABELS[i];
      const text = typeof o.text === "string" ? o.text : "";
      if (!text) continue;
      const own: MarkerLabel = MARKER_LABELS[i];
      if (!text.includes(own)) {
        add(
          "error",
          "ko-marker-option-mismatch",
          `${label} 선지가 ${own} 을 지시하지 않습니다 — 선지-마커 1:1 순서 대응(①=㉠ … ⑤=㉤) 위반`,
        );
      }
      const foreign = MARKER_LABELS.filter((l) => l !== own && text.includes(l));
      if (foreign.length > 0) {
        add(
          "error",
          "ko-marker-option-mismatch",
          `${label} 선지가 자기 마커(${own}) 외의 마커(${foreign.join(" ")})를 언급합니다 — 1:1 대응 위반`,
        );
      }
      const form = formOf.get(own);
      if (form && !text.includes(FORM_TERM_KO[form])) {
        add(
          "error",
          "ko-marker-option-mismatch",
          `${label} 선지에 형식 식별부('${FORM_TERM_KO[form]}')가 없습니다 — ${own} 의 선언 형식(${form})과 선지 진술이 어긋납니다 (정답 선지도 형식 식별은 정확해야 함)`,
        );
      }
      if (!EFFECT_TERMS.some((term) => text.includes(term))) {
        add(
          "warning",
          "ko-option-ending",
          `${label} 선지에 [의도·효과]부(매체 소통 효과 어휘)가 없습니다 — [형식 식별]+[의도·효과] 2절 구조 위반 의심: "${text.slice(0, 40)}"`,
        );
      }
    }
  }

  // ── ⑥ 근거 표면 한정: evidence 스팬은 매체 자료 verbatim ─────────────────
  const allStimulusText = stimulusPlainText(blocks);
  const evidence = Array.isArray(question.evidence)
    ? (question.evidence as Record<string, unknown>[])
    : [];
  for (const e of evidence) {
    const span = typeof e.spanText === "string" ? e.spanText : "";
    if (!span) continue;
    if (!allStimulusText || !ctx.koText.containsSpanKo(allStimulusText, span)) {
      add(
        "error",
        "ko-evidence-not-in-passage",
        `근거 스팬이 매체 자료에 없습니다 — 이 유형의 근거 표면은 매체 화면 텍스트이며 지문 인용은 금지입니다: "${span.slice(0, 40)}"`,
      );
    }
  }

  // ── ⑦ 극성-근거관계 정합 (부정발문 고정: 정답=효과 오귀속 왜곡) ─────────
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
        `${label} 는 정답(효과 오귀속) 선지인데 근거 relation 이 왜곡 계열(DISTORTS/CONTRADICTS/NOT_MENTIONED)이 아닙니다`,
      );
    }
    if (!isCorrect && !relations.has("SUPPORTS")) {
      add(
        "error",
        "ko-evidence-missing",
        `${label} 는 참 선지인데 SUPPORTS 근거가 없습니다 — 형식·효과가 실현된 자료 문장을 앵커하세요`,
      );
    }
  }

  // ── ⑧ 배점 상궤: 2~3점 (3점 빈발 — 2026 수능 42번 [3점]) ────────────────
  const points = typeof question.points === "number" ? question.points : 2;
  if (points !== 2 && points !== 3) {
    add(
      "warning",
      "ko-points-unusual",
      `매체 언어 표현은 2~3점(3점 빈발) 관행입니다 (현재 ${points}점)`,
    );
  }

  return issues;
}

// ---------------------------------------------------------------------------
// 모듈
// ---------------------------------------------------------------------------

export const KO_MD_LANG: KoTypeModule = {
  meta: {
    typeId: "KO_MD_LANG",
    // ⚠ 계약 갭(specGaps 보고됨): KoArea·KoTypeMeta.uiGroup 유니온에 화법·작문·매체
    // 축이 아직 없다. 조립(레지스트리) 단계가 type-module.ts 유니온을
    // ("MEDIA" / "국어 화법·작문·매체") 로 확장하면 아래 두 단언은 자연 소멸한다.
    // (meta.area 는 현재 런타임 소비처 없음 — 단언은 타입 층위에만 영향.)
    area: "MEDIA" as unknown as KoTypeMeta["area"],
    label: "매체 언어 표현(문법 융합)",
    formatCategory: "객관식",
    uiGroup: "국어 화법·작문·매체" as unknown as KoTypeMeta["uiGroup"],
    answerFormat: "MC5",
    // 매체 유형: 지문 미동봉 — 사용자 지문은 매체 자료의 화제·정보 소재로만 프롬프트에 반영.
    includesPassage: false,
    passageKinds: ["READING_HUM", "READING_SOC", "READING_SCI", "READING_TECH", "READING_ART", "MIXED"],
    defaultPoints: 2,
    usesBogi: "none",
    usesStimulus: "required",
    stimulusKinds: ["MEDIA_SCREEN"],
    markerFamilies: ["KOR_CIRCLED"],
    optionEnding: "strategy",
    needsSolverGate: false,
    // 선지 ①~⑤가 마커 ㉠~㉤과 1:1 순서 대응 — 정답 위치 셔플 제외.
    lockedOptionOrder: true,
    description:
      "자체 생성 매체 화면 텍스트(누리집 게시문·방송 자막·메신저)의 문장 5곳에 피동·인용·청유/의문 종결·접속 표현을 ㉠~㉤으로 마킹하고, '형식 식별+의도 효과' 2절 선지에서 효과 오귀속 하나를 가려내는 문법 융합 매체 유형",
    setSlot: "언매 매체 세트(40~45번)의 문법 융합 슬롯 — 2026 수능 42번 [3점] 미러(3점 빈발)",
    studentTask:
      "매체 화면 텍스트의 ㉠~㉤ 문장에서 표현 형식(피동·인용·청유·의문·접속)을 식별하고, 각 선지의 [의도·효과] 진술이 그 형식·국면과 정합하는지 대조해 오귀속 하나를 고릅니다.",
    bestFor: [
      "언매 선택 대비 매체+문법 융합 훈련",
      "공공·생활 정보 소재 지문(매체 자료의 화제 소재)",
      "내신 매체 단원(매체 언어의 표현 효과 개념) 확인",
    ],
    outputUi: [
      "매체 화면(자료) 박스 — ㉠~㉤ 마킹·연출 지시 행 포함",
      "5지선다('~고 있다' 전략형, ①=㉠ 순서 고정)",
      "선지별 형식-효과 정합 해설",
    ],
  },
  schema,
  prompt,
  settings: {
    knobs: [
      {
        key: "mediaFormat",
        label: "화면 형식",
        kind: "select",
        options: [
          { value: "AUTO", label: "자동(소재에 맞게)" },
          { value: "WEB_POST", label: "누리집 게시문" },
          { value: "BROADCAST", label: "방송 자막·진행 멘트" },
          { value: "MESSENGER", label: "메신저 대화방" },
        ],
        defaultValue: "AUTO",
        description: "마킹 대상이 되는 매체 화면 텍스트 목업의 갈래",
      },
      {
        key: "points",
        label: "배점",
        kind: "select",
        options: [
          { value: "2", label: "2점(기본)" },
          { value: "3", label: "3점(수능 42번 미러 — 3점 빈발)" },
        ],
        defaultValue: "2",
        description: "이 유형은 3점 빈발(2026 수능 42번 [3점]) — 기본 2점에서 상향 가능",
      },
    ],
    buildPrompt: buildSettingsPrompt,
  },
  validate,
  toRenderModel(question, ctx: KoRenderContext): KoRenderModel {
    // 매체 자체자료형 — 지문 미동봉(화면 stimulus 는 buildDefault 가 항상 포함,
    // stimulus 표면 마커는 targetSurface 분리로 자료 행에 병합된다).
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
      "정답의 효과 오귀속을 형식 가족 간 정면 교차로 하라(피동 문장에 '출처 명시·신뢰성 확보', 청유 문장에 '정보의 객관적 전달') — 자료 한 번 읽기로 판정되게. 참 선지의 효과는 형식별 정합 효과의 표준 표현 그대로 쓰라.",
    INTERMEDIATE:
      "오귀속을 인접 효과로 좁혀라(의문의 '관심 환기'를 '사실 확인 요구'로, 첨가 접속의 연결 관계를 '대조 전환'으로) — 판정에 마커 문장 앞뒤 문맥과의 대조가 필요하게 하라. 참 선지 중 1개는 효과를 자료의 구체 국면(수용자·게시 목적)과 결합해 서술하라.",
    KILLER:
      "정답을 '절반 참' 설계로: 효과 어휘 자체는 그 형식에 일반적으로 가능한 효과이되 이 화면의 해당 국면과 어긋나게 하라(인용이 실제로는 반박 대상 소개인데 '견해를 뒷받침해 신뢰성 확보'로, 청유가 확정 절차 안내인데 '의견 수렴을 유도'로). points=3 상향을 기본으로 검토하라(언매 42번 3점 슬롯). 참 선지들도 효과 서술을 국면 종합으로 구성해 전 선지 전수 검증을 강제하되, 형식 표지·효과의 문면 근거는 자료에서 일의적으로 확인되게 하라(매체 유형은 이의신청 취약 — 해석 여지 금지).",
  },
};
