// ============================================================================
// KO_LIT_NARR — 문학 서술상 특징(산문)  【서술 개념어 은행 내장 MC5】
// ============================================================================
// 카탈로그 §2.2 KO_LIT_NARR 사양의 전면 구현.
//
// 실측 근거:
//   발문: "윗글의 서술상 특징으로 가장 적절한 것은?" (긍정발문 고정 —
//   4개 오답 전수 소거 부담이 이 유형의 체감 난도 원천)
//   개념 풀: 시점·서술자 개입·초점화·요약/장면 제시·역순행·내적 독백 등
//   오답 원리: 서술 주체 바꿔치기 · 없는 시간 조작(역순행) 삽입 · 효과부 허위 ·
//   발췌 장면 밖 특징(전체 줄거리 지식) 서술
//   핵심 판정 기준: **발췌 장면 기준** — 같은 작품도 발췌마다 답이 다르다
//   (내신 고정지식형 "이 작품은 1인칭 관찰자" 암기와의 결정적 차이).
//
// 결정론 검증 축:
//   (1) 서술 개념어 은행 대조 — 선언된 기법 개념어가 은행 등재 용어이고
//       해당 선지 문면에 실제로 등장하는지 (G8 개념어 온톨로지 게이트의
//       기계 검증 가능 부분 — 개념어 오용은 AI 생성 국어 문항 최대 실패 양상)
//   (2) 시점 개념어 상호 배타 휴리스틱 — '1인칭 주인공'과 '3인칭 전지적'이
//       한 발췌에서 동시에 참일 수 없다 (장면별 서술자 교체·액자식 구성이
//       주장된 경우만 예외) → 정답 유일성 붕괴 차단
// ============================================================================

import { z } from "zod";
import { koMc5Envelope } from "../registry/envelope-schema";
import { buildDefaultKoRenderModel, type KoRenderModel } from "../core/render-model";
import type {
  KoQualityIssue,
  KoRenderContext,
  KoResolvedTypeSettings,
  KoTypeModule,
  KoValidationContext,
} from "../registry/type-module";

// ---------------------------------------------------------------------------
// 서술 개념어 은행 (닫힌 집합 — 프롬프트·검증기가 동일 원천 공유)
// ---------------------------------------------------------------------------

/** 상호 배타 시점 그룹 — 서로 다른 두 그룹이 한 발췌에서 동시에 참일 수 없다. */
type KoPovGroup = "FIRST_PROT" | "FIRST_OBS" | "THIRD_OMNI" | "THIRD_LTD";

interface NarrativeDeviceEntry {
  /** 은행 등재 용어 (correctDevice / wrongOptionTraps[].device 는 이 값 그대로) */
  term: string;
  /** 선지 문면에서 이 기법의 언급을 탐지하는 패턴 (공백 정규화 폼 대상) */
  re: RegExp;
  /** 시점 개념어면 배타 그룹 */
  pov?: KoPovGroup;
  /** true = 한 발췌 안 복수 시점 공존을 정당화하는 장치(교체·액자) — 배타 검사 면제 트리거 */
  multiPov?: boolean;
}

const NARRATIVE_DEVICE_BANK: NarrativeDeviceEntry[] = [
  // ── 시점·초점 ──
  { term: "1인칭 주인공 시점", re: /[1일]\s*인칭\s*주인공/, pov: "FIRST_PROT" },
  { term: "1인칭 관찰자 시점", re: /[1일]\s*인칭\s*관찰자/, pov: "FIRST_OBS" },
  { term: "3인칭 전지적 시점", re: /전지적/, pov: "THIRD_OMNI" },
  {
    term: "3인칭 제한적 시점",
    re: /[3삼]\s*인칭\s*(제한|관찰)|제한적\s*(시점|전지)|선택적\s*전지/,
    pov: "THIRD_LTD",
  },
  { term: "초점화(특정 인물 시각)", re: /초점화|특정\s*인물의?\s*(시각|눈|의식)|한\s*인물의\s*시각/ },
  {
    term: "장면별 서술자 교체",
    re: /서술자[가를]?\s*(교체|전환)|장면(마다|별로)[^.]{0,10}서술자|서술자가\s*바뀌/,
    multiPov: true,
  },
  // ── 서술자 태도 ──
  {
    term: "서술자 개입(편집자적 논평)",
    re: /서술자[가의]?\s*(직접\s*)?개입|편집자적\s*논평|서술자[가의]?\s*(논평|평가)/,
  },
  // ── 제시 방식 ──
  { term: "요약적 제시", re: /요약적\s*(제시|서술)|요약하여\s*(제시|서술|전달)/ },
  { term: "장면 제시(보여주기)", re: /장면\s*(제시|묘사)|보여\s*주기|극적\s*제시/ },
  { term: "내적 독백", re: /내적\s*독백|속마음을?\s*직접\s*(제시|드러내)/ },
  { term: "의식의 흐름", re: /의식의\s*흐름/ },
  { term: "대화 중심 서술", re: /대화[를가]?\s*(중심|통해)|인물\s*간의?\s*대화|대화를\s*주고받/ },
  // ── 구성 ──
  {
    term: "역순행적 구성",
    re: /역순행|시간의?\s*역전|과거\s*회상|(현재와\s*과거|과거와\s*현재)[가를]?\s*교차/,
  },
  { term: "삽화식 구성", re: /삽화식|삽화적|독립적인?\s*일화/ },
  { term: "액자식 구성", re: /액자식|액자\s*구조|(외부|내부)\s*이야기/, multiPov: true },
  // ── 문체·기타 ──
  { term: "현재형 진술", re: /현재형|현재\s*시제/ },
  { term: "감각적 배경 묘사", re: /감각적(인)?\s*(배경\s*)?묘사|배경을\s*감각적/ },
  { term: "공간 이동에 따른 장면 전환", re: /공간의?\s*이동|장면\s*전환/ },
  { term: "우의적 서술", re: /우의적|우화/ },
];

const BANK_TERMS_FOR_PROMPT = NARRATIVE_DEVICE_BANK.map((e) => e.term).join(" · ");

function normalizeSpace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** 선언된 개념어 문자열 → 은행 엔트리 (용어 일치 우선, 패턴 매치 관용). */
function findDeviceEntry(device: string): NarrativeDeviceEntry | null {
  const d = normalizeSpace(device);
  for (const e of NARRATIVE_DEVICE_BANK) {
    const base = e.term.replace(/\(.+?\)/, "").trim();
    if (d === e.term || d === base) return e;
  }
  for (const e of NARRATIVE_DEVICE_BANK) {
    if (e.re.test(d)) return e;
  }
  return null;
}

/** 선지 문면의 시점 개념어 탐지 — 제한적('제한적 전지' 포함)을 전지적보다 먼저 판정. */
const POV_DETECT_ORDER: { group: KoPovGroup; re: RegExp }[] = [
  { group: "FIRST_PROT", re: /[1일]\s*인칭\s*주인공/ },
  { group: "FIRST_OBS", re: /[1일]\s*인칭\s*관찰자/ },
  { group: "THIRD_LTD", re: /[3삼]\s*인칭\s*(제한|관찰)|제한적\s*(시점|전지)|선택적\s*전지/ },
  { group: "THIRD_OMNI", re: /전지적/ },
];

function detectPovGroup(text: string): KoPovGroup | null {
  const t = normalizeSpace(text);
  for (const p of POV_DETECT_ORDER) {
    if (p.re.test(t)) return p.group;
  }
  return null;
}

const POV_GROUP_LABELS: Record<KoPovGroup, string> = {
  FIRST_PROT: "1인칭 주인공 시점",
  FIRST_OBS: "1인칭 관찰자 시점",
  THIRD_OMNI: "3인칭 전지적 시점",
  THIRD_LTD: "3인칭 제한적 시점",
};

// ---------------------------------------------------------------------------
// 스키마
// ---------------------------------------------------------------------------

const TRAP_PRINCIPLES = ["AGENT_SWAP", "FALSE_TEMPORAL", "FALSE_EFFECT", "OUTSIDE_EXCERPT"] as const;

const schema = koMc5Envelope({
  correctDevice: z
    .string()
    .min(2)
    .describe(
      "정답 선지가 판정하는 서술 기법 개념어 — 프롬프트의 개념어 은행 용어 그대로 (예: '요약적 제시'). 정답 선지 문면에도 이 개념어가 드러나야 함",
    ),
  wrongOptionTraps: z
    .array(
      z.object({
        label: z.enum(["①", "②", "③", "④", "⑤"]).describe("오답 선지 라벨 — 정답 제외 4개 전부"),
        principle: z
          .enum(TRAP_PRINCIPLES)
          .describe(
            "함정 원리: AGENT_SWAP=서술 주체 바꿔치기, FALSE_TEMPORAL=없는 시간 조작(역순행 등) 삽입, FALSE_EFFECT=기법은 발췌에 실재하나 효과부 허위, OUTSIDE_EXCERPT=발췌 장면 밖 특징(작품 전체 줄거리 지식) 서술",
          ),
        device: z
          .string()
          .min(2)
          .describe("이 오답 선지의 기법부 개념어 — 개념어 은행 용어 그대로, 선지 문면에도 드러나야 함"),
      }),
    )
    .length(4)
    .describe("오답 4개 각각의 함정 설계 선언 — 4개 함정 원리를 최소 3종 이상 섞을 것"),
});

// ---------------------------------------------------------------------------
// 생성 프롬프트 (출제 매뉴얼)
// ---------------------------------------------------------------------------

const prompt = `### 유형: 문학 — 서술상 특징(산문)

**발문 템플릿** (정확히 이 형태 — 긍정발문 고정):
- "윗글의 서술상 특징으로 가장 적절한 것은?"
- 복합 지문에서 한 파트만 판정할 때: "(가)의 서술상 특징으로 가장 적절한 것은?"
- 부정발문 금지 — 이 유형은 긍정형이라 학생이 오답 4개를 전수 소거해야 하며, 그 부담이 난도의 원천이다.

**대원칙 — 발췌 장면 기준 판정**:
모든 선지의 참/거짓은 **주어진 발췌 안에서만** 판정한다. 같은 작품이라도 발췌마다 답이 달라진다
(예: '삼대'의 어느 발췌는 대화 중심, 다른 발췌는 요약적 제시가 정답). 작품 전체에 대한 문학사
지식("이 작품은 1인칭 관찰자 시점이다")을 정답 근거로 삼지 마라 — 정답 기법은 발췌의 특정
지점(문장·대목)에서 명시적으로 확인 가능해야 하고, 그 지점을 evidence 로 verbatim 인용해야 한다.

**서술 개념어 은행** (선지의 기법부는 반드시 이 닫힌 집합에서만 — 은행 밖 신조어·유사 표현 금지):
- 시점·초점: 1인칭 주인공 시점 · 1인칭 관찰자 시점 · 3인칭 전지적 시점 · 3인칭 제한적 시점 · 초점화(특정 인물 시각) · 장면별 서술자 교체
- 서술자 태도: 서술자 개입(편집자적 논평)
- 제시 방식: 요약적 제시 · 장면 제시(보여주기) · 내적 독백 · 의식의 흐름 · 대화 중심 서술
- 구성: 역순행적 구성 · 삽화식 구성 · 액자식 구성
- 문체·기타: 현재형 진술 · 감각적 배경 묘사 · 공간 이동에 따른 장면 전환 · 우의적 서술
(전체 목록: ${BANK_TERMS_FOR_PROMPT})

**선지 구성 원리**:
1. 선지는 "[서술 기법]+ ~하여/~함으로써 +[효과]" 2단 구조의 완결 문장, 어미는 반드시 "~고 있다"로
   끝낸다 (예: "서술자가 직접 개입하여 인물의 처지에 대한 판단을 드러내고 있다").
2. 정답 선지: correctDevice 로 선언한 기법이 발췌에서 실현된 지점이 실재해야 하고, 효과부도 그
   지점의 실제 기능과 일치해야 한다. 기법·효과 둘 다 참인 선지는 정답 하나뿐이어야 한다.
3. 오답 4개는 wrongOptionTraps 로 함정 원리를 선언하고, 원리를 정확히 하나만 적용하라:
   - AGENT_SWAP(서술 주체 바꿔치기): 서술자가 한 것을 인물이 한 것으로, 또는 그 역.
     예) 서술자가 내력을 요약했는데 → "인물의 발화를 통해 지난 사건이 요약되고 있다"
     예) '나'의 외부 관찰만 있는데 → "서술자가 모든 인물의 내면을 서술하고 있다"
   - FALSE_TEMPORAL(없는 시간 조작 삽입): 발췌가 순행인데 시간 역전을 주장.
     예) 순행 발췌에 → "과거와 현재를 교차하여 사건의 입체감을 부여하고 있다"
   - FALSE_EFFECT(효과부 허위): 기법부는 발췌에 실재 — 효과부만 틀리게. 가장 매력적인 함정.
     예) 대화는 실재하나 갈등이 고조되는 발췌에 → "인물 간의 대화를 통해 갈등이 해소되는 과정을 보여 주고 있다"
   - OUTSIDE_EXCERPT(발췌 밖 특징): 작품 전체 지식으로는 참이지만 이 발췌에는 없는 특징.
     예) 작품 전체는 액자식이지만 발췌가 내부 이야기뿐일 때 → "액자식 구성으로 이야기의 신빙성을 높이고 있다"
     (전체 줄거리를 아는 학생이 걸려드는 함정 — 발췌 기준 판정 원칙을 시험한다)
4. 4개 오답에 같은 함정 원리를 3회 이상 반복하지 마라(최소 3종 사용). 두 오답이 같은 이유로
   틀리는 구성 금지.
5. 시점 개념어 상호 배타: 1인칭 주인공·1인칭 관찰자·3인칭 전지적·3인칭 제한적은 한 발췌에서
   동시에 참일 수 없다. 정답이 시점 선지라면, 다른 시점을 주장하는 오답은 그 시점 자체가
   거짓이어야 한다(FALSE_EFFECT 로 시점 오답을 만들지 마라 — 기법부 참 선언과 모순).
   단, '장면별 서술자 교체'·'액자식 구성'이 발췌에 실재할 때만 복수 시점 공존이 정당화된다.
6. 갈래 주의: 희곡·시나리오(LIT_PLAY)에는 서술자가 없다 — 시점·서술자 개입 선지를 만들지 말고
   장면 제시·대화 중심·무대 지시문(현재형 진술)·장면 전환 축으로 구성하라. 수필(LIT_ESSAY)은
   1인칭 고백체가 기본이므로 시점 선지의 변별력이 낮다 — 제시 방식·구성·문체 축을 써라.

**근거앵커(evidence) 작성**:
- 정답 선지: relation=SUPPORTS + 기법이 실현된 발췌 지점을 verbatim 인용 (예: 내적 독백이면
  독백 대목, 요약적 제시면 시간 압축 문장).
- AGENT_SWAP·FALSE_TEMPORAL 오답: relation=DISTORTS + 실제 서술 주체/시간 흐름이 확인되는 구절.
- FALSE_EFFECT 오답: relation=DISTORTS + 기법은 있으나 효과가 다르게 실현된 그 대목.
- OUTSIDE_EXCERPT 오답: relation=NOT_MENTIONED + 발췌에서 그 특징과 가장 가까운(그러나 해당
  특징이 아닌) 구절 — "발췌에는 없음"의 판정 기준점.

**금지**:
- 개념어 은행 밖의 기법 용어 (예: '입체적 조명', '카메라 아이' 등 비표준 용어).
- 발췌에서 확인 불가능한 작품 전체 단정을 정답 근거로 사용 ("이 작품은 ~다" 프레임).
- 기법부와 효과부가 둘 다 틀린 오답 (읽지 않아도 배제되는 선지 — 함정 원리 1지점 위반).
- 시점 개념어 2개가 동시에 참이 되는 구성 (상호 배타 위반 — 정답 유일성 붕괴).
- '~고 있다' 이외의 선지 어미.`;

// ---------------------------------------------------------------------------
// 설정
// ---------------------------------------------------------------------------

function buildSettingsPrompt(settings: KoResolvedTypeSettings): string {
  const lines: string[] = [];
  const axis = settings.correctAxis;
  if (axis === "VIEWPOINT") {
    lines.push(
      "- 정답 기법 축=시점·초점화: 정답 선지는 시점·초점화·서술자 교체 계열에서 뽑아라. 이때 오답 시점 선지는 시점 자체가 거짓이어야 한다(상호 배타 원칙).",
    );
  } else if (axis === "MODE") {
    lines.push(
      "- 정답 기법 축=제시 방식: 정답 선지는 요약적 제시·장면 제시·내적 독백·의식의 흐름·대화 중심 서술 계열에서 뽑아라.",
    );
  } else if (axis === "STRUCTURE") {
    lines.push(
      "- 정답 기법 축=구성: 정답 선지는 역순행적·삽화식·액자식 구성, 공간 이동에 따른 장면 전환 계열에서 뽑아라. 발췌 안에서 구성 장치가 실제로 확인되는지(회상 진입부, 이야기 겹) 먼저 검증하라.",
    );
  } else {
    lines.push("- 정답 기법 축은 발췌에서 가장 뚜렷하게 실현된 서술 장치를 자동 선택하라.");
  }
  if (settings.examMode === "NAESIN") {
    lines.push(
      "- 내신 모드: 수업·자습서에서 정리되는 작품의 대표 서술 특징(고정 지식)을 선지 소재로 써도 좋다 — 단 정답의 근거는 반드시 이 발췌에서 확인 가능한 지점을 인용하라. 함정은 기출 선지의 미세 변형(서술 주체 한 단어 교체·효과부 극성 반전) 위주로, 암기만으로 풀리지 않게 하라.",
    );
  } else {
    lines.push(
      "- 수능 모드: 발췌 장면 기준 판정을 엄격 적용하라. 작품 전체 단정('이 작품은 ~') 프레임 금지. 오답 중 1개 이상은 OUTSIDE_EXCERPT(전체 줄거리로는 참이나 발췌에 없음) 함정으로 설계해 배경지식 의존 풀이를 차단하라.",
    );
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// 검증 (유형 특화 결정론 체크)
// ---------------------------------------------------------------------------

function validate(question: Record<string, unknown>, ctx: KoValidationContext): KoQualityIssue[] {
  const issues: KoQualityIssue[] = [];
  const add = (severity: "error" | "warning", code: string, message: string) =>
    issues.push({ severity, code, message });

  const direction = typeof question.direction === "string" ? question.direction : "";
  const correctAnswer = typeof question.correctAnswer === "string" ? question.correctAnswer : "";
  const correctDevice = typeof question.correctDevice === "string" ? question.correctDevice : "";

  const options = Array.isArray(question.options)
    ? (question.options as Record<string, unknown>[])
    : [];
  const optionTextOf = new Map<string, string>();
  for (const o of options) {
    if (typeof o.label === "string" && typeof o.text === "string") {
      optionTextOf.set(o.label, o.text);
    }
  }

  interface Trap {
    label: string;
    principle: string;
    device: string;
  }
  const traps: Trap[] = [];
  if (Array.isArray(question.wrongOptionTraps)) {
    for (const raw of question.wrongOptionTraps as Record<string, unknown>[]) {
      if (!raw || typeof raw !== "object") continue;
      traps.push({
        label: typeof raw.label === "string" ? raw.label : "",
        principle: typeof raw.principle === "string" ? raw.principle : "",
        device: typeof raw.device === "string" ? raw.device : "",
      });
    }
  }

  // ── 체크 1: 발문 템플릿 — '서술상 특징' 키워드 + 긍정발문 고정 ──
  const dNorm = normalizeSpace(direction);
  if (!/서술(상|의)?\s*(특징|방식)/.test(dNorm)) {
    add(
      "error",
      "ko-direction-grammar",
      "발문에 '서술상 특징' 이 없습니다 — 템플릿: '윗글의 서술상 특징으로 가장 적절한 것은?'",
    );
  }
  if (ctx.koText.isNegativeStemKo(direction)) {
    add(
      "error",
      "ko-direction-grammar",
      "이 유형은 긍정발문 고정('~으로 가장 적절한 것은?')입니다 — 부정발문은 오답 함정 4선언 구조와 상충",
    );
  }

  // ── 체크 2: 오답 함정 선언 커버리지 — 정답 제외 4개 라벨과 정확히 일치 ──
  const expectedWrong = options
    .map((o) => (typeof o.label === "string" ? o.label : ""))
    .filter((l) => l && l !== correctAnswer);
  if (options.length === 5 && correctAnswer && optionTextOf.has(correctAnswer)) {
    const declared = traps.map((t) => t.label).sort();
    const expected = [...expectedWrong].sort();
    if (declared.join("") !== expected.join("")) {
      add(
        "error",
        "ko-correct-answer-invalid",
        `wrongOptionTraps 라벨(${declared.join(",") || "없음"})이 정답(${correctAnswer}) 제외 4개(${expected.join(",")})와 일치하지 않습니다 — 함정 선언 무결성 위반`,
      );
    }
  }

  // ── 체크 3: 서술 개념어 은행 대조 (선언 개념어 은행 등재 + 선지 문면 실재) ──
  const correctEntry = correctDevice ? findDeviceEntry(correctDevice) : null;
  const correctText = optionTextOf.get(correctAnswer) ?? "";
  if (correctDevice && !correctEntry) {
    add(
      "error",
      "ko-correct-answer-invalid",
      `정답 기법 개념어("${correctDevice}")가 서술 개념어 은행에 없습니다 — 은행 용어만 사용 (G8 온톨로지 게이트)`,
    );
  } else if (correctEntry && correctText && !correctEntry.re.test(normalizeSpace(correctText))) {
    add(
      "error",
      "ko-correct-answer-invalid",
      `정답 선지(${correctAnswer}) 문면에 선언된 기법("${correctEntry.term}")의 개념어가 드러나지 않습니다 — 선언-문면 불일치`,
    );
  }
  for (const trap of traps) {
    const entry = trap.device ? findDeviceEntry(trap.device) : null;
    const text = optionTextOf.get(trap.label) ?? "";
    if (trap.device && !entry) {
      add(
        "error",
        "ko-correct-answer-invalid",
        `${trap.label} 오답의 기법 개념어("${trap.device}")가 서술 개념어 은행에 없습니다 — 함정 원리 검증 불가`,
      );
    } else if (entry && text && !entry.re.test(normalizeSpace(text))) {
      add(
        "error",
        "ko-correct-answer-invalid",
        `${trap.label} 오답 선지 문면에 선언된 기법("${entry.term}")의 개념어가 드러나지 않습니다 — 선언-문면 불일치`,
      );
    }
  }

  // ── 체크 4: 시점 개념어 상호 배타 휴리스틱 ──
  // '참으로 주장된' 시점 집합 = 정답 선지의 시점 + FALSE_EFFECT 오답(기법부 참)의 시점.
  // 서로 다른 배타 그룹이 2개 이상이면 한 발췌에서 동시 참 불가 → 정답 유일성 붕괴.
  // 예외: 장면별 서술자 교체·액자식 구성이 참으로 주장된 경우(복수 시점 정당화).
  const falseEffectEntries = traps
    .filter((t) => t.principle === "FALSE_EFFECT")
    .map((t) => ({ trap: t, entry: t.device ? findDeviceEntry(t.device) : null }));
  const multiPovAsserted =
    correctEntry?.multiPov === true ||
    falseEffectEntries.some(({ entry }) => entry?.multiPov === true);
  if (!multiPovAsserted) {
    const assertedPov = new Map<KoPovGroup, string[]>();
    const assertPov = (group: KoPovGroup | null, label: string) => {
      if (!group) return;
      const labels = assertedPov.get(group) ?? [];
      labels.push(label);
      assertedPov.set(group, labels);
    };
    assertPov(correctEntry?.pov ?? detectPovGroup(correctText), correctAnswer || "정답");
    for (const { trap, entry } of falseEffectEntries) {
      assertPov(entry?.pov ?? detectPovGroup(optionTextOf.get(trap.label) ?? ""), trap.label);
    }
    if (assertedPov.size >= 2) {
      const detail = [...assertedPov.entries()]
        .map(([group, labels]) => `${POV_GROUP_LABELS[group]}(${labels.join(",")})`)
        .join(" vs ");
      add(
        "error",
        "ko-correct-answer-invalid",
        `시점 개념어 상호 배타 위반: ${detail} 이 동시에 참으로 주장되었습니다 — 시점 오답을 FALSE_EFFECT(기법부 참)로 선언하면 정답 유일성이 붕괴합니다. 다른 함정 원리(AGENT_SWAP 등)로 바꾸세요`,
      );
    }
  }

  // ── 체크 5: 함정 원리 ↔ 근거 relation 극성 정합 ──
  const relationOf = new Map<string, Set<string>>();
  const evidence = Array.isArray(question.evidence)
    ? (question.evidence as Record<string, unknown>[])
    : [];
  for (const e of evidence) {
    const label = typeof e.optionLabel === "string" ? e.optionLabel : "";
    const relation = typeof e.relation === "string" ? e.relation : "";
    if (!label || !relation) continue;
    const set = relationOf.get(label) ?? new Set<string>();
    set.add(relation);
    relationOf.set(label, set);
  }
  const distortRelations = new Set(["DISTORTS", "CONTRADICTS", "NOT_MENTIONED"]);
  const correctRelations = relationOf.get(correctAnswer);
  if (correctRelations && !correctRelations.has("SUPPORTS")) {
    add(
      "error",
      "ko-evidence-missing",
      `정답 선지(${correctAnswer})에 SUPPORTS 근거(기법 실현 지점 인용)가 없습니다 — 극성 모순`,
    );
  }
  for (const trap of traps) {
    const relations = relationOf.get(trap.label);
    if (!relations) continue; // 근거 존재 자체는 공통 게이트가 검사
    if (trap.principle === "OUTSIDE_EXCERPT") {
      if (!relations.has("NOT_MENTIONED")) {
        add(
          "error",
          "ko-evidence-missing",
          `${trap.label} 오답은 발췌 밖 특징(OUTSIDE_EXCERPT) 함정인데 NOT_MENTIONED 근거가 없습니다 — 발췌 부재 판정의 기준 구절을 앵커하세요`,
        );
      }
    } else if (![...relations].some((r) => distortRelations.has(r))) {
      add(
        "error",
        "ko-evidence-missing",
        `${trap.label} 오답(${trap.principle})에 왜곡 계열 근거(DISTORTS/CONTRADICTS/NOT_MENTIONED)가 없습니다 — 극성 모순`,
      );
    }
  }

  // ── 보조: 함정 원리 다양성 (동일 원리 3회 이상 = 변별 저하 경고) ──
  const principleCount = new Map<string, number>();
  for (const trap of traps) {
    principleCount.set(trap.principle, (principleCount.get(trap.principle) ?? 0) + 1);
  }
  for (const [principle, count] of principleCount) {
    if (count >= 3) {
      add(
        "warning",
        "ko-option-ending",
        `오답 함정 원리 "${principle}" 가 ${count}회 반복되었습니다 — 최소 3종 원리를 섞어 변별을 확보하세요`,
      );
    }
  }

  return issues;
}

// ---------------------------------------------------------------------------
// 모듈
// ---------------------------------------------------------------------------

export const KO_LIT_NARR: KoTypeModule = {
  meta: {
    typeId: "KO_LIT_NARR",
    area: "LITERATURE",
    label: "서술상 특징(산문)",
    formatCategory: "객관식",
    uiGroup: "국어 문학",
    answerFormat: "MC5",
    includesPassage: true,
    passageKinds: ["LIT_MODERN_NOVEL", "LIT_CLASSIC_NOVEL", "LIT_ESSAY", "LIT_PLAY", "MIXED"],
    defaultPoints: 2,
    usesBogi: "none",
    markerFamilies: [],
    optionEnding: "strategy",
    needsSolverGate: false,
    description:
      "산문 발췌의 서술 방식(시점·서술자 개입·제시 방식·구성)을 개념어 은행 기반 선지로 판정 — 발췌 장면 기준(작품 전체 지식 아님)",
    setSlot: "산문 세트 1번 슬롯(도입) 고정 — 갈래복합 세트에서는 산문 파트의 서술 판정 담당",
    studentTask:
      "발췌 장면의 서술 방식을 판정해, 기법과 효과가 모두 성립하는 선지 하나를 오답 4개의 전수 소거로 찾습니다.",
    bestFor: [
      "서술 장치가 뚜렷한 현대·고전소설 발췌",
      "요약과 장면이 교차하는 산문",
      "수필·희곡·시나리오의 제시 방식 판정",
    ],
    outputUi: ["지문 동봉", "5지선다('~고 있다' 종결)", "선지별 기법·함정 해설"],
  },
  schema,
  prompt,
  settings: {
    knobs: [
      {
        key: "correctAxis",
        label: "정답 기법 축",
        kind: "select",
        options: [
          { value: "AUTO", label: "자동(발췌 특성)" },
          { value: "VIEWPOINT", label: "시점·초점화" },
          { value: "MODE", label: "제시 방식(요약·장면·독백)" },
          { value: "STRUCTURE", label: "구성(역순행·액자·삽화)" },
        ],
        defaultValue: "AUTO",
        description: "정답 선지가 판정하는 서술 기법의 축을 고정합니다",
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
      includesPassage: true,
      answerFormat: "MC5",
      defaultPoints: 2,
    });
  },
  difficultyGuide: {
    BASIC:
      "정답 기법이 발췌 표면에서 즉시 확인되게(직접 인용된 독백, 뚜렷한 서술자 개입). 오답은 발췌에 명백히 부재한 기법 위주(AGENT_SWAP·FALSE_TEMPORAL), 효과부는 단순하게.",
    INTERMEDIATE:
      "오답 중 2개를 FALSE_EFFECT(기법 실재·효과 허위)로 설계해 발췌 전체 조망을 강제하라. 정답의 효과부는 장면의 실제 기능(긴장 조성·심리 부각)과 정밀하게 맞춰라.",
    KILLER:
      "정답을 발췌의 미시 지점(부분적 요약 제시, 국지적 초점화)에서 뽑고, 오답 전부를 '절반 참'으로 — FALSE_EFFECT 와 OUTSIDE_EXCERPT(전체 줄거리로는 참) 조합으로 배경지식 의존 풀이를 역이용하라. 4개 함정 원리를 전부 사용해 전수 검증을 강제하라.",
  },
};
