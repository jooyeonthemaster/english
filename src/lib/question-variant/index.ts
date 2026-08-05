// ============================================================================
// 오답 → 변형 문제 생성 연동 (규범: docs/student-hub-uiux-2607-spec.md §8)
//
// 학생이 틀린 문항에서 "그 지문 · 그 유형"으로 새 문제를 만들어 다시 과제로
// 내주는 한 줄기 흐름의 계약을 소유한다.
//
//   [오답 문항] ─(변형 만들기)─▶ /director/workbench/generate?passageIds&types&…
//                                 └ 지문 자동 적재 + 유형·개수·난이도 프리필
//                                   + 「오답 기반 변형」 컨텍스트 스트립
//                              ─(생성)─▶ 결과 패널 ─(과제 보내기)─▶ 그 학생에게 배포
//
// URL 은 짧게 유지하고(핵심 파라미터만), 원본 발문·정답·학생 답 같은 리치 시드는
// sessionStorage 로 넘긴다. 시드가 유실돼도(새 탭·새로고침) URL 파라미터만으로
// 지문·유형·난이도 프리필은 그대로 동작한다 — 무음 실패 없는 이중화.
// ============================================================================

import { QUESTION_TYPE_UI } from "@/lib/question-type-ui";

// ── 계약 ────────────────────────────────────────────────────────────────────

export interface VariantSeedQuestion {
  /** 원본 Question.id — 추적용(생성 입력에는 쓰지 않는다) */
  questionId: string;
  /** "1번" 등 표시용 라벨 */
  orderLabel: string;
  /** 카탈로그 키(QUESTION_TYPE_UI) — 생성 유형의 정본 */
  subType: string;
  typeLabel: string;
  /** "BASIC" | "INTERMEDIATE" | "KILLER" */
  difficulty?: string | null;
  /** 생성 대상 지문(Passage.id) — 없으면 변형 불가 */
  passageId: string;
  passageTitle?: string | null;
  /** 원본 발문 전문 — 프롬프트의 "참고(재사용 금지)" 블록에 인용 */
  questionText?: string | null;
  /** 정답 표기(선지 라벨 또는 서답형 모범답) */
  correctText?: string | null;
  /** 학생이 실제로 낸 답 — 오개념 재점검 지시의 근거 */
  studentText?: string | null;
  /** 해설 핵심 포인트 — 출제 포인트 계승용 */
  keyPoints?: string[];
}

export interface VariantSeed {
  origin: "exam-report" | "submission";
  studentId?: string | null;
  studentName?: string | null;
  examTitle?: string | null;
  /** ISO — 호출부가 주입한다(이 모듈은 순수 유지) */
  createdAt: string;
  questions: VariantSeedQuestion[];
}

/** 변형 1문항당 기본 생성 개수 — 원본 1개 → 변형 2개(재시험 + 예비) */
export const VARIANT_COUNT_PER_QUESTION = 2;
/** 한 번에 넘길 수 있는 원본 문항 수 상한 — 생성 요청이 유형당 1콜씩 나가므로 과폭주 방지 */
export const MAX_VARIANT_SOURCE_QUESTIONS = 10;

const SEED_PREFIX = "smoat:variant-seed:";
/** 동시에 남겨두는 시드 수 — 초과분은 오래된 것부터 청소 */
const SEED_KEEP = 5;

// ── 시드 저장소 (sessionStorage 핸드오프) ───────────────────────────────────

function makeSeedId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // 구형 브라우저 폴백 — 충돌해도 같은 탭 안 단명 키라 실해가 없다
  return `s${Math.abs(Date.now() ^ (Math.random() * 1e9)).toString(36)}`;
}

/** 시드를 저장하고 딥링크에 실을 id 를 돌려준다. 저장 불가 환경이면 빈 문자열 */
export function saveVariantSeed(seed: VariantSeed): string {
  if (typeof window === "undefined") return "";
  const id = makeSeedId();
  try {
    // 오래된 시드 청소 — sessionStorage 는 탭 수명이라 누적되면 용량을 먹는다
    const keys = Object.keys(window.sessionStorage).filter((k) => k.startsWith(SEED_PREFIX));
    if (keys.length >= SEED_KEEP) {
      keys.slice(0, keys.length - SEED_KEEP + 1).forEach((k) => window.sessionStorage.removeItem(k));
    }
    window.sessionStorage.setItem(SEED_PREFIX + id, JSON.stringify(seed));
    return id;
  } catch {
    // 프라이빗 모드·용량 초과 — URL 파라미터만으로도 동작하므로 조용히 포기한다
    return "";
  }
}

export function readVariantSeed(seedId: string | null | undefined): VariantSeed | null {
  if (!seedId || typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(SEED_PREFIX + seedId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as VariantSeed;
    if (!parsed || !Array.isArray(parsed.questions)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearVariantSeed(seedId: string | null | undefined): void {
  if (!seedId || typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(SEED_PREFIX + seedId);
  } catch {
    /* 접근 불가 — 무시 */
  }
}

// ── 유형·자격 판정 ──────────────────────────────────────────────────────────

/** 생성 파이프라인이 지원하는 유형인가 — 카탈로그(QUESTION_TYPE_UI)가 정본 */
export function isGeneratableSubType(subType: string | null | undefined): boolean {
  return !!subType && Object.prototype.hasOwnProperty.call(QUESTION_TYPE_UI, subType);
}

export function variantTypeLabel(subType: string): string {
  return QUESTION_TYPE_UI[subType]?.label ?? subType;
}

export type VariantBlockReason = "NO_QUESTIONS" | "NO_PASSAGE" | "UNSUPPORTED_TYPE";

/**
 * 넘길 수 있는 문항만 골라낸다. 하나도 못 고르면 이유를 함께 돌려줘 CTA 가
 * 침묵 대신 사유 툴팁을 걸 수 있게 한다(비활성 사유 표기 규범).
 */
export function filterVariantQuestions(questions: VariantSeedQuestion[]): {
  usable: VariantSeedQuestion[];
  reason: VariantBlockReason | null;
} {
  if (questions.length === 0) return { usable: [], reason: "NO_QUESTIONS" };
  const withPassage = questions.filter((q) => !!q.passageId);
  if (withPassage.length === 0) return { usable: [], reason: "NO_PASSAGE" };
  const usable = withPassage
    .filter((q) => isGeneratableSubType(q.subType))
    .slice(0, MAX_VARIANT_SOURCE_QUESTIONS);
  if (usable.length === 0) return { usable: [], reason: "UNSUPPORTED_TYPE" };
  return { usable, reason: null };
}

// ── 선지 표기 정규화 ────────────────────────────────────────────────────────
//
// 한 문항의 "선지 식별자"가 저장소마다 다른 축으로 남아 있다(2026-07-26 실측):
//   · 리포트 채점축   examMap.correctAnswer / response.chosenChoice → "3", "4"
//   · 문항 원본축     Question.correctAnswer / options[].label      → "(C)", "(D)"
//   · 화면 렌더축     QuestionCard 는 위치 기준 원형숫자             → ③, ④
// 셋을 그대로 두면 「학생 답 (D)」라고 적힌 옆에서 카드는 ④ 를 보여줘 서로
// 매칭이 안 되고, 생성 프롬프트에 실린 "(D)" 는 LLM 에게 아무 의미가 없다.
// 그래서 어떤 축의 토큰이 오든 **위치(index)** 로 환원한 뒤, 화면 렌더축(원형숫자)
// 과 선지 본문을 함께 표기해 한 언어로 통일한다.

const CIRCLED_DIGITS = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳";

export interface VariantChoiceOption {
  label: string;
  text: string;
}

/** 위치(0-based) → 화면 표기(원형숫자). 범위를 넘으면 (n) 폴백 */
export function choiceOrdinal(index0: number): string {
  return index0 >= 0 && index0 < CIRCLED_DIGITS.length
    ? CIRCLED_DIGITS[index0]
    : `(${index0 + 1})`;
}

/**
 * 선지 토큰 → 0-based 위치. "4" · "(D)" · "D" · "④" 를 모두 받는다.
 * 어느 축인지 알 수 없으면 null(호출부가 원문을 그대로 쓴다).
 */
export function choiceIndexOf(token: string): number | null {
  const t = token.trim().replace(/^\(|\)$/g, "").trim();
  if (!t) return null;
  const circled = CIRCLED_DIGITS.indexOf(t);
  if (circled >= 0) return circled;
  if (/^\d+$/.test(t)) {
    const n = Number(t);
    return n >= 1 && n <= 50 ? n - 1 : null;
  }
  if (/^[A-Za-z]$/.test(t)) return t.toUpperCase().charCodeAt(0) - 65;
  return null;
}

/** 옵션 JSON(문자열 또는 배열) → [{label,text}]. 실패하면 빈 배열 */
export function parseChoiceOptions(raw: unknown): VariantChoiceOption[] {
  let arr: unknown = raw;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    try {
      arr = JSON.parse(trimmed);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(arr)) return [];
  return arr.flatMap((v) => {
    if (typeof v === "string") return [{ label: "", text: v }];
    if (!v || typeof v !== "object") return [];
    const o = v as { label?: unknown; text?: unknown };
    return [{ label: String(o.label ?? ""), text: String(o.text ?? "") }];
  });
}

/** 본문이 너무 길면 대조 바가 깨진다 — 표기용으로만 줄인다 */
function clipChoiceText(text: string, max = 42): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (!flat) return "";
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

/**
 * 선지 토큰(단일 또는 "2, 6" 복수) → 화면 표기.
 * 옵션 목록으로 위치를 확정할 수 있으면 `④ reinforces` 처럼 렌더축 + 본문으로,
 * 확정할 수 없으면(서술형·옵션 결손·이미 정규화된 문자열) 원문을 그대로 돌려준다.
 *
 * **멱등이어야 한다.** 시드를 만들 때 한 번, 원본 모달이 다시 한 번 부르는 경로가
 * 있어서 두 번 돌아도 값이 변하지 않아야 한다. 그래서 구분자에 **공백을 넣지
 * 않는다** — 넣으면 이미 정규화된 "② unconscious" 가 ["②","unconscious"] 로
 * 쪼개져 「② unconscious · unconscious」 가 된다(2026-07-26 실측).
 */
export function resolveChoiceDisplay(
  raw: string | null | undefined,
  options: VariantChoiceOption[],
): string | null {
  const value = raw?.trim();
  if (!value) return null;
  if (options.length === 0) return value;

  const tokens = value.split(/[,、/·]/).map((t) => t.trim()).filter(Boolean);
  const parts = tokens.map((token) => {
    const idx = choiceIndexOf(token);
    // 라벨 직접 일치도 허용 — 옵션 라벨이 "가"/"ㄱ" 같은 비표준 축일 수 있다
    const bare = token.replace(/^\(|\)$/g, "").trim();
    const byLabel = options.findIndex(
      (o) => o.label.replace(/^\(|\)$/g, "").trim() === bare,
    );
    const at = idx != null && idx < options.length ? idx : byLabel >= 0 ? byLabel : -1;
    // 위치를 못 구하면 원문 유지 — 이미 「② unconscious」 형태로 정규화된
    // 조각이거나 서답형 답안이다(어느 쪽이든 손대지 않는 것이 맞다).
    if (at < 0) return token;
    const text = clipChoiceText(options[at].text);
    return text ? `${choiceOrdinal(at)} ${text}` : choiceOrdinal(at);
  });
  return parts.join(" · ");
}

// ── 딥링크 조립 ─────────────────────────────────────────────────────────────

/** `types` 파라미터 직렬화 — "GRAMMAR_ERROR:2,BLANK_INFERENCE:4" */
export function serializeTypeCounts(counts: Record<string, number>): string {
  return Object.entries(counts)
    .filter(([, n]) => n > 0)
    .map(([id, n]) => `${id}:${n}`)
    .join(",");
}

export function parseTypeCounts(raw: string | null | undefined): Record<string, number> {
  if (!raw) return {};
  const out: Record<string, number> = {};
  for (const part of raw.split(",")) {
    const [id, rawCount] = part.split(":");
    const typeId = id?.trim();
    if (!typeId || !isGeneratableSubType(typeId)) continue;
    const n = Number(rawCount);
    if (!Number.isFinite(n)) continue;
    // 유형당 1~20 클램프 — 생성이 유형당 N콜로 나가므로 상한을 둔다
    out[typeId] = Math.min(20, Math.max(1, Math.round(n)));
  }
  return out;
}

const DIFFICULTIES = new Set(["BASIC", "INTERMEDIATE", "KILLER"]);

export function parseVariantDifficulty(raw: string | null | undefined): string | null {
  const v = raw?.toUpperCase();
  return v && DIFFICULTIES.has(v) ? v : null;
}

/** 여러 원본 문항 → 유형별 생성 개수(유형 중복은 합산) */
export function variantTypeCounts(questions: VariantSeedQuestion[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const q of questions) {
    if (!isGeneratableSubType(q.subType)) continue;
    out[q.subType] = (out[q.subType] ?? 0) + VARIANT_COUNT_PER_QUESTION;
  }
  return out;
}

/** 대표 난이도 — 최빈값, 동률이면 더 어려운 쪽(킬러 우선) */
export function variantDifficulty(questions: VariantSeedQuestion[]): string | null {
  const rank = ["BASIC", "INTERMEDIATE", "KILLER"];
  const tally = new Map<string, number>();
  for (const q of questions) {
    const d = parseVariantDifficulty(q.difficulty);
    if (d) tally.set(d, (tally.get(d) ?? 0) + 1);
  }
  if (tally.size === 0) return null;
  return [...tally.entries()].sort(
    (a, b) => b[1] - a[1] || rank.indexOf(b[0]) - rank.indexOf(a[0]),
  )[0][0];
}

/**
 * 생성 페이지 딥링크. 시드가 유실돼도 지문·유형·난이도는 URL 만으로 복원된다.
 * `from` 은 내부 절대경로만 허용한다(오픈 리다이렉트 방지).
 */
export function buildVariantGenerateHref(input: {
  seedId?: string;
  questions: VariantSeedQuestion[];
  studentId?: string | null;
  from?: string | null;
}): string {
  const passageIds = [...new Set(input.questions.map((q) => q.passageId).filter(Boolean))];
  const params = new URLSearchParams();
  if (passageIds.length > 0) params.set("passageIds", passageIds.join(","));
  const types = serializeTypeCounts(variantTypeCounts(input.questions));
  if (types) params.set("types", types);
  const difficulty = variantDifficulty(input.questions);
  if (difficulty) params.set("difficulty", difficulty);
  if (input.seedId) params.set("variant", input.seedId);
  if (input.studentId) params.set("student", input.studentId);
  if (input.from && input.from.startsWith("/")) params.set("from", input.from);
  return `/director/workbench/generate?${params.toString()}`;
}

// ── 생성 프롬프트 ───────────────────────────────────────────────────────────

function trimText(s: string | null | undefined, max: number): string | null {
  if (!s) return null;
  const flat = s.replace(/\s+/g, " ").trim();
  if (!flat) return null;
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

/**
 * 변형 생성 지시문 — GenerationConfigPanel 의 「추가 요청사항」에 프리필된다.
 * 사용자가 그대로 쓰거나 손봐서 쓸 수 있게 사람이 읽는 문장으로 만든다.
 *
 * 설계 원칙: 원본을 베끼게 하지 않는다. 원본이 겨눈 **출제 포인트**만 계승하고,
 * 학생이 빠진 오개념을 다시 시험하되 표현·정답 위치는 새로 만들게 한다.
 */
export function buildVariantPrompt(seed: VariantSeed, subType: string): string {
  const targets = seed.questions.filter((q) => q.subType === subType);
  if (targets.length === 0) return "";
  const label = variantTypeLabel(subType);
  const who = seed.studentName ? `${seed.studentName} 학생이` : "학생이";
  const where = seed.examTitle ? `「${seed.examTitle}」에서 ` : "";

  const lines: string[] = [
    `[변형 출제 요청] ${where}${who} 틀린 ${label} 문항의 변형본을 만듭니다.`,
    "",
    "규칙",
    "1. 같은 지문·같은 유형으로 **새 문항**을 만든다. 아래 원본의 발문·선지·정답 표현을 그대로 옮기지 않는다.",
    "2. 원본이 겨눈 출제 포인트(문법 항목·논리 관계·어휘 층위)는 그대로 계승한다.",
    "3. 학생이 고른 오답이 드러낸 오개념을 다시 시험하되, 정답의 위치와 표현은 원본과 다르게 한다.",
    "4. 정답은 하나로 명확해야 하며, 원본 정답과 문자열이 같아지면 안 된다.",
    "5. 발문·선지는 수능·내신 국내 규범 표기를 따른다.",
    "",
    "원본 (참고용 — 재사용 금지)",
  ];

  for (const q of targets) {
    const parts: string[] = [`· ${q.orderLabel}`];
    const stem = trimText(q.questionText, 220);
    if (stem) parts.push(`발문: ${stem}`);
    const correct = trimText(q.correctText, 80);
    if (correct) parts.push(`정답: ${correct}`);
    const student = trimText(q.studentText, 80);
    if (student) parts.push(`학생 답: ${student}`);
    const points = (q.keyPoints ?? []).map((p) => trimText(p, 60)).filter(Boolean);
    if (points.length > 0) parts.push(`출제 포인트: ${points.join(" / ")}`);
    lines.push(parts.join(" | "));
  }

  return lines.join("\n");
}

/** 시드 전체 → 유형별 프롬프트 맵. 생성 시 행 override 의 customPrompt 로 쓴다 */
export function buildVariantPrompts(seed: VariantSeed): Record<string, string> {
  const out: Record<string, string> = {};
  for (const subType of new Set(seed.questions.map((q) => q.subType))) {
    const prompt = buildVariantPrompt(seed, subType);
    if (prompt) out[subType] = prompt;
  }
  return out;
}

/** 컨텍스트 스트립 한 줄 요약 — "김연주 · 새 시험지 2026-07-24 · 오답 3문항" */
export function variantSeedSummary(seed: VariantSeed): string {
  const bits: string[] = [];
  if (seed.studentName) bits.push(seed.studentName);
  if (seed.examTitle) bits.push(seed.examTitle);
  bits.push(`오답 ${seed.questions.length}문항`);
  return bits.join(" · ");
}
