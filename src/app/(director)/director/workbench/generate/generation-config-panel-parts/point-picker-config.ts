// "포인트 짚어주기"(Teacher Point Picker) 유형 매핑 선언 테이블 (point-picker-design.md §4).
// 클라(픽커 UI·유형 타일 배지)와 서버(run-question-generation 재앵커링 후 클램프)가
// 같은 규칙을 공유하는 단일 소스다 — "클라 캡 = 서버 클램프"가 여기서만 정의된다.
// React 비의존 순수 모듈(서버 임포트 안전). 미등재 유형은 undefined → 진입 행 미렌더.

import {
  readAntonymPairCountSetting,
  readBlankInferenceBlankCountSetting,
  readBlankInferenceGranularitySetting,
  readGrammarCorrectionErrorCountSetting,
  readGrammarMarkerCountSetting,
  readVocabChoiceMarkerCountSetting,
} from "@/lib/question-type-generation-settings";

// ── TeacherPoint (스펙 §2 그대로) ──────────────────────────────────────────

export const TEACHER_POINT_UNITS = ["word", "phrase", "clause", "sentence"] as const;

export type TeacherPointUnit = (typeof TEACHER_POINT_UNITS)[number];

export type TeacherPoint = {
  /** 지문 축자 텍스트 — 서버는 오프셋 대신 이 텍스트(indexOf)로 재앵커링한다. */
  text: string;
  sentenceIndex: number;
  start: number;
  end: number;
  unit: TeacherPointUnit;
  source: "manual" | "ai";
  tag?: string;
  note?: string;
};

/**
 * 전송(wire) 형태 — use-generation-handlers 가 questionTypeSettings.teacherPoints 로
 * 싣는 필드만. 오프셋(sentenceIndex/start/end)은 클라 전용·서버 미신뢰라 제외한다.
 */
export type TeacherPointPayload = Pick<TeacherPoint, "text" | "unit" | "tag" | "note">;

/** 유형당 전송·소비 상한(스펙 §2). 유형별 상한이 더 작으면 그쪽이 이긴다. */
export const TEACHER_POINTS_HARD_CAP = 12;

/** 재앵커링 대상 축자 텍스트의 방어적 길이 상한 — 문장 단위도 넉넉히 덮는다. */
export const TEACHER_POINT_TEXT_MAX = 400;

// ── 유형별 설정 테이블 ──────────────────────────────────────────────────────

export interface PointPickerTypeConfig {
  /**
   * 기본(1클릭) 선택 단위. 함수면 유형 세부설정(raw)으로 결정한다 —
   * BLANK_INFERENCE 가 blankGranularity 를 따라가는 경우.
   */
  unit: TeacherPointUnit | ((typeSettings: unknown) => TeacherPointUnit);
  /** 이 유형에서 포인트로 성립하는 단위들 — 픽커의 제스처 허용 범위(UI 참고용). */
  allowedUnits: readonly TeacherPointUnit[];
  /** unit==="word" 유형에서 드래그로 단어 경계 스냅 구(phrase) 선택을 허용하는지. */
  allowPhraseDrag?: boolean;
  /**
   * 설정값 연동 상한 산출 규칙. 함수면 유형 세부설정(raw)을 받아 계산한다 —
   * read*Setting 리더가 min/max 정규화까지 해 주므로 여기서 재검증하지 않는다.
   */
  maxPoints: number | ((typeSettings: unknown) => number);
  /** 안내 칩 단위어 — "3/8" 카운터 옆·튜토리얼 문구 치환용. */
  unitNoun: string;
  /** 무대 상단 안내 칩 문구(스펙 §3 문형). */
  guide: string;
  /** 프롬프트 "## 교사 지정 출제 포인트 (필수 반영)" 블록에서 이 유형의 포인트가 맡는 역할. */
  promptRole: string;
}

/**
 * 유형ID → 픽커 설정 (스펙 §4 표의 코드화). 여기 없는 유형은 픽커 진입 행 자체를
 * 렌더하지 않는다(죽은 버튼 0). 어휘 계열 중 SYNONYM(지문 미포함)·CONTEXT_MEANING
 * (마커 수 설정 부재)은 v1 의도적 미등재.
 */
export const POINT_PICKER_CONFIG: Record<string, PointPickerTypeConfig> = {
  // ── 어법 3종: word + 드래그 구, 마커/오류 수 연동 ──
  GRAMMAR_ERROR: {
    unit: "word",
    allowedUnits: ["word", "phrase"],
    allowPhraseDrag: true,
    maxPoints: (typeSettings) => readGrammarMarkerCountSetting(typeSettings),
    unitNoun: "단어",
    guide: "지문에서 단어를 클릭하거나 드래그해 출제 포인트를 지정하세요",
    promptRole:
      "지정한 표현을 밑줄 어법 판단 지점((A)~)에 반드시 포함해 출제합니다.",
  },
  GRAMMAR_CHOICE_COMBO: {
    unit: "word",
    allowedUnits: ["word", "phrase"],
    allowPhraseDrag: true,
    // 네모는 (A)/(B)/(C) 3개 고정 — 별도 마커 수 설정이 없다(dispatchers.ts 참조).
    maxPoints: 3,
    unitNoun: "단어",
    guide: "지문에서 단어를 클릭하거나 드래그해 출제 포인트를 지정하세요",
    promptRole:
      "지정한 표현을 (A)/(B)/(C) 네모 선택 지점으로 반드시 사용합니다.",
  },
  GRAMMAR_CORRECTION: {
    unit: "word",
    allowedUnits: ["word", "phrase"],
    allowPhraseDrag: true,
    maxPoints: (typeSettings) => readGrammarCorrectionErrorCountSetting(typeSettings),
    unitNoun: "단어",
    guide: "지문에서 단어를 클릭하거나 드래그해 출제 포인트를 지정하세요",
    promptRole:
      "지정한 표현 자리를 어법 오류로 변형해 교정 대상으로 반드시 출제합니다.",
  },

  // ── 빈칸 추론: phrase/clause, 빈칸 수 연동 ──
  BLANK_INFERENCE: {
    // blankGranularity 를 따라간다(양방향 제안·자동 변경 금지 — 픽커가 다른 크기의
    // 선택을 감지하면 제안만 하고 설정을 바꾸지 않는다). auto 는 phrase 로 시작.
    unit: (typeSettings) => {
      const granularity = readBlankInferenceGranularitySetting(typeSettings);
      if (granularity === "word") return "word";
      if (granularity === "clause") return "clause";
      return "phrase";
    },
    allowedUnits: ["word", "phrase", "clause"],
    maxPoints: (typeSettings) => readBlankInferenceBlankCountSetting(typeSettings),
    unitNoun: "구",
    guide: "지문에서 빈칸으로 낼 표현을 드래그해 지정하세요",
    promptRole:
      "지정한 표현을 빈칸(originalExpression)으로 반드시 사용합니다.",
  },

  // ── 어휘 계열: word, 마커/쌍 수 연동 ──
  VOCAB_CHOICE: {
    unit: "word",
    allowedUnits: ["word"],
    maxPoints: (typeSettings) => readVocabChoiceMarkerCountSetting(typeSettings),
    unitNoun: "단어",
    guide: "지문에서 단어를 클릭해 출제 포인트를 지정하세요",
    promptRole:
      "지정한 단어를 밑줄 어휘 판단 지점((a)~)에 반드시 포함해 출제합니다.",
  },
  ANTONYM: {
    unit: "word",
    allowedUnits: ["word"],
    maxPoints: (typeSettings) => readAntonymPairCountSetting(typeSettings),
    unitNoun: "단어",
    guide: "지문에서 단어를 클릭해 출제 포인트를 지정하세요",
    promptRole:
      "지정한 단어를 반의어 쌍((A)~)의 지문 단어로 반드시 사용합니다.",
  },

  // ── 문장 삽입: sentence 1 ──
  SENTENCE_INSERT: {
    unit: "sentence",
    allowedUnits: ["sentence"],
    maxPoints: 1,
    unitNoun: "문장",
    guide: "지문에서 삽입 문장으로 빼낼 문장을 클릭해 지정하세요",
    promptRole:
      "지정한 문장을 지문에서 빼내어 주어진(삽입) 문장으로 반드시 사용합니다.",
  },

  // ── 순서/무관: sentence 1~3 ──
  SENTENCE_ORDER: {
    unit: "sentence",
    allowedUnits: ["sentence"],
    maxPoints: 3,
    unitNoun: "문장",
    guide: "지문에서 문장을 클릭해 출제 포인트를 지정하세요",
    promptRole:
      "지정한 문장이 순서 판단의 핵심 단서(문단 경계·응집 장치)가 되도록 문단을 분할합니다.",
  },
  IRRELEVANT: {
    unit: "sentence",
    allowedUnits: ["sentence"],
    maxPoints: 3,
    unitNoun: "문장",
    guide: "지문에서 문장을 클릭해 출제 포인트를 지정하세요",
    promptRole:
      "지정한 문장 부근의 흐름을 겨냥해 무관한 문장을 삽입하고, 지정 문장은 번호 슬롯에 반드시 포함합니다.",
  },

  // ── 요지/주제/제목: 근거 sentence 1~3 ──
  MAIN_IDEA: {
    unit: "sentence",
    allowedUnits: ["sentence"],
    maxPoints: 3,
    unitNoun: "근거 문장",
    guide: "지문에서 근거 문장을 클릭해 출제 포인트를 지정하세요",
    promptRole:
      "지정한 근거 문장의 논지를 정답 선지와 해설의 근거로 반드시 반영합니다.",
  },
  TOPIC: {
    unit: "sentence",
    allowedUnits: ["sentence"],
    maxPoints: 3,
    unitNoun: "근거 문장",
    guide: "지문에서 근거 문장을 클릭해 출제 포인트를 지정하세요",
    promptRole:
      "지정한 근거 문장의 논지를 정답 선지와 해설의 근거로 반드시 반영합니다.",
  },
  // 레거시 주제/요지 통합형 — TOPIC/MAIN_IDEA 와 동일 계열이라 같은 규칙을 쓴다.
  TOPIC_MAIN_IDEA: {
    unit: "sentence",
    allowedUnits: ["sentence"],
    maxPoints: 3,
    unitNoun: "근거 문장",
    guide: "지문에서 근거 문장을 클릭해 출제 포인트를 지정하세요",
    promptRole:
      "지정한 근거 문장의 논지를 정답 선지와 해설의 근거로 반드시 반영합니다.",
  },
  TITLE: {
    unit: "sentence",
    allowedUnits: ["sentence"],
    maxPoints: 3,
    unitNoun: "근거 문장",
    guide: "지문에서 근거 문장을 클릭해 출제 포인트를 지정하세요",
    promptRole:
      "지정한 근거 문장의 논지를 정답 선지와 해설의 근거로 반드시 반영합니다.",
  },
};

// ── 해석(resolve) ───────────────────────────────────────────────────────────

export interface ResolvedPointPickerMeta {
  /** 기본(1클릭) 선택 단위 — 설정 연동 유형은 현재 설정 기준으로 확정된 값. */
  unit: TeacherPointUnit;
  allowedUnits: readonly TeacherPointUnit[];
  allowPhraseDrag: boolean;
  /** 설정값 연동 상한(1 ~ TEACHER_POINTS_HARD_CAP 로 클램프된 최종값). */
  maxPoints: number;
  unitNoun: string;
  guide: string;
  promptRole: string;
}

/**
 * 유형ID + 유형 세부설정(raw)으로 픽커 메타를 확정한다. 미등재 유형은 undefined —
 * 호출부는 이 경우 픽커 진입 행을 렌더하지 않는다. typeSettings 는 해당 유형의
 * 설정 객체(questionTypeSettings[typeId])를 그대로 넘기면 된다 — read*Setting
 * 리더가 flat/nested 양쪽을 읽고 min/max 정규화까지 처리한다(비정상값 안전).
 */
export function resolvePointPickerMeta(
  typeId: string,
  typeSettings: unknown,
): ResolvedPointPickerMeta | undefined {
  const config = POINT_PICKER_CONFIG[typeId];
  if (!config) return undefined;
  const unit =
    typeof config.unit === "function" ? config.unit(typeSettings) : config.unit;
  const rawMax =
    typeof config.maxPoints === "function"
      ? config.maxPoints(typeSettings)
      : config.maxPoints;
  const maxPoints = Math.min(
    TEACHER_POINTS_HARD_CAP,
    Math.max(1, Math.round(Number.isFinite(rawMax) ? rawMax : 1)),
  );
  return {
    unit,
    allowedUnits: config.allowedUnits,
    allowPhraseDrag: config.allowPhraseDrag === true,
    maxPoints,
    unitNoun: config.unitNoun,
    guide: config.guide,
    promptRole: config.promptRole,
  };
}

// ── 클램프 (클라 캡 = 서버 클램프 단일 규칙) ────────────────────────────────

function isTeacherPointUnit(value: unknown): value is TeacherPointUnit {
  return (TEACHER_POINT_UNITS as readonly unknown[]).includes(value);
}

/**
 * 교사 포인트 목록을 유형 규칙으로 클램프한다. 클라(픽커 상한·초과 셰이크)와
 * 서버(재앵커링 직후) 모두 이 함수 하나만 쓴다:
 * - 미등재 유형 → [] (포인트 채널 자체가 없는 유형).
 * - text 가 비문자열/공백뿐/TEACHER_POINT_TEXT_MAX 초과, unit 이 4단위 밖 → 드롭.
 *   (unit 은 유형 allowedUnits 와 달라도 유지 — blankGranularity "양방향 제안,
 *   자동 변경 금지" 규칙상 설정과 어긋난 크기의 선택도 유효하다.)
 * - 동일 text 중복 → 첫 항목만 유지(상한 슬롯 낭비 방지).
 * - 앞에서부터 min(유형 상한, TEACHER_POINTS_HARD_CAP)개만 유지.
 * 제네릭이라 클라는 TeacherPoint[], 서버는 TeacherPointPayload[] 를 그대로 받는다.
 * text 는 축자 보존(트림/치환 금지 — 서버 indexOf 재앵커링 계약).
 */
// ── 준수(compliance) 판정 (서버 게이트 단일 소스) ──────────────────────────
// 프롬프트의 "교사 지정 출제 포인트 (필수 반영)" 블록은 지시일 뿐 모델이 무시할
// 수 있다(26-07-14 실측: 포인트 주입됐는데 빈칸이 엉뚱한 곳에 출제). 유형별로
// "포인트가 실제로 반영됐는지"를 문항 구조 필드에서 결정론적으로 판정한다.
// - hard(아래 테이블 등재 9유형): 모든 포인트가 유형별 표면과 겹쳐야 통과.
//   서버(run-question-generation)가 strict 반려→재시도, relaxed/scarce 는 경고
//   강등(생성실패 절대금지 계약)한다.
// - soft(요지/주제/제목 계열): "근거 문장의 논지를 정답·해설에 반영"은 의미
//   판단이라 결정론 검사 불가 — 테이블 미등재 = 항상 통과(프롬프트 전용).
// - 판정 불가(표면 필드 부재/빈 배열)는 통과 — 스키마 변화로 인한 오반려 방지.

const normalizeForCompliance = (s: string) =>
  s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** 단어 경계 보존 겹침 — 한쪽이 다른 쪽을 (공백 패딩 기준) 포함하면 참. */
function complianceOverlaps(a: string, b: string): boolean {
  const na = normalizeForCompliance(a);
  const nb = normalizeForCompliance(b);
  if (!na || !nb) return false;
  return ` ${na} `.includes(` ${nb} `) || ` ${nb} `.includes(` ${na} `);
}

const asRecord = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === "object" ? (v as Record<string, unknown>) : null;
const asString = (v: unknown): string => (typeof v === "string" ? v : "");
const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** 유형별 "포인트가 반영됐어야 하는 표면" 추출기 — 전부 지문 원문 기준 필드. */
const COMPLIANCE_SURFACES: Record<
  string,
  (question: Record<string, unknown>) => string[]
> = {
  GRAMMAR_ERROR: (q) =>
    asArray(q.markedExpressions)
      .map((m) => asString(asRecord(m)?.expression))
      .filter(Boolean),
  GRAMMAR_CHOICE_COMBO: (q) =>
    asArray(q.slots)
      .map((s) => asString(asRecord(s)?.correctExpression))
      .filter(Boolean),
  GRAMMAR_CORRECTION: (q) =>
    asArray(q.underlinedSegments)
      .map((s) => asString(asRecord(s)?.sourceText))
      .filter(Boolean),
  BLANK_INFERENCE: (q) =>
    [
      asString(q.originalExpression),
      ...asArray(q.blanks).map((b) => asString(asRecord(b)?.originalExpression)),
    ].filter(Boolean),
  VOCAB_CHOICE: (q) =>
    asArray(q.markedWords)
      .map((m) => asString(asRecord(m)?.originalWord))
      .filter(Boolean),
  ANTONYM: (q) =>
    asArray(q.markedWords)
      .map((m) => asString(asRecord(m)?.word))
      .filter(Boolean),
  SENTENCE_INSERT: (q) =>
    [asString(q.sourceSentenceToOmit), asString(q.givenSentence)].filter(Boolean),
  IRRELEVANT: (q) =>
    asArray(q.sentences).map((s) => asString(s)).filter(Boolean),
};

/** SENTENCE_ORDER 전용 — 지정 문장이 순서 판단 단서가 되려면 문단 경계(각
    덩어리의 시작/끝)나 주어진 글에 있어야 한다(promptRole 계약의 결정론 부분). */
function sentenceOrderComplies(
  question: Record<string, unknown>,
  point: TeacherPointPayload,
): boolean {
  const paragraphs = asArray(question.paragraphs)
    .map((p) => asString(asRecord(p)?.text))
    .filter(Boolean);
  if (paragraphs.length === 0) return true; // 판정 불가 — 통과
  if (complianceOverlaps(asString(question.givenSentence), point.text)) return true;
  const pt = normalizeForCompliance(point.text);
  if (!pt) return true;
  return paragraphs.some((text) => {
    const t = normalizeForCompliance(text);
    return t.startsWith(pt) || t.endsWith(pt);
  });
}

export interface TeacherPointComplianceResult {
  ok: boolean;
  /** 반영되지 않은 포인트들 — 반려 메시지·재시도 지시에 그대로 쓴다. */
  missing: TeacherPointPayload[];
}

/**
 * 교사 지정 포인트 준수 판정 — hard 유형은 "모든 포인트"가 유형 표면과 겹쳐야
 * 한다(포인트 수는 clampTeacherPoints 로 이미 유형 상한 이하). soft/미등재
 * 유형·표면 부재는 통과.
 */
export function checkTeacherPointCompliance(
  typeId: string,
  question: Record<string, unknown>,
  points: readonly TeacherPointPayload[],
): TeacherPointComplianceResult {
  if (points.length === 0) return { ok: true, missing: [] };
  if (typeId === "SENTENCE_ORDER") {
    const missing = points.filter((p) => !sentenceOrderComplies(question, p));
    return { ok: missing.length === 0, missing };
  }
  const extract = COMPLIANCE_SURFACES[typeId];
  // soft(요지/주제/제목) 등 — 단 MAIN_IDEA(요지)는 md 레인이 별도 결정형 집행을
  // 한다(gate-main-idea.ts #10: `근거:` 줄이 지정 문장과 겹쳐야 통과). 이 함수
  // 기준으로 soft 라고 해서 md 경로까지 무검사인 것은 아니다(26-08-22 과녁 검증).
  if (!extract) return { ok: true, missing: [] };
  const surfaces = extract(question);
  if (surfaces.length === 0) return { ok: true, missing: [] }; // 판정 불가
  const missing = points.filter(
    (point) => !surfaces.some((surface) => complianceOverlaps(surface, point.text)),
  );
  return { ok: missing.length === 0, missing };
}

export function clampTeacherPoints<T extends TeacherPointPayload>(
  typeId: string,
  typeSettings: unknown,
  points: readonly T[],
): T[] {
  const meta = resolvePointPickerMeta(typeId, typeSettings);
  if (!meta) return [];
  const kept: T[] = [];
  const seenTexts = new Set<string>();
  for (const point of points) {
    if (kept.length >= meta.maxPoints) break;
    if (typeof point.text !== "string") continue;
    if (point.text.trim().length === 0) continue;
    if (point.text.length > TEACHER_POINT_TEXT_MAX) continue;
    if (!isTeacherPointUnit(point.unit)) continue;
    if (seenTexts.has(point.text)) continue;
    seenTexts.add(point.text);
    kept.push(point);
  }
  return kept;
}
