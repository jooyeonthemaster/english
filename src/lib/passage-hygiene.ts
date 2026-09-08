/**
 * 지문 위생 감지기 — 「이 지문은 생성 전에 정리가 필요하다」를 결정론으로 판정한다.
 *
 * 왜(26-09-08 실구매 학원 전수조사): 무결성 게이트 반려 76건 중 「지문 축자 불일치」
 * 계통의 상당수가 모델 결함이 아니라 **입력 오염**이었다 — 학습지·시험지 PDF 를
 * 그대로 붙여넣어 단독 숫자 행(`3`), `(A) using / to use` 선택지 슬래시, 이미 뚫린
 * 빈칸이 섞인 지문에 모델이 문장을 복원해 쓰고 축자 대조에서 떨어졌다(민쌤 8/27~31
 * 8건 — 전부 번호 줄 또는 선택지 슬래시를 품고 있었다). 게이트는 정상이었고,
 * 사용자는 「실패」만 봤다.
 *
 * 이것은 **게이트가 아니다.** 차단하지 않고, 재생성하지 않고, 모델을 부르지 않는다
 * (passage-authoring/metrics.ts 의 교리와 같다). 카드 배지·편집기 칩·실패 문구에
 * 사실만 얹는다. 판단은 선생님이 한다.
 *
 * 순수 정규식·클라이언트 안전 — 매 키 입력마다 불러도 된다. 기존
 * detectProblemFormArtifacts(passage-source.ts — 문제 형태 흔적)를 포함해 한 보고서로 낸다.
 */
import { detectProblemFormArtifacts } from "@/lib/passage-source";

export type PassageHygieneCode =
  | "HYPHEN_BREAK"
  | "NUMBER_LINES"
  | "CHOICE_SLASH"
  | "KOREAN_MIXED"
  | "PROBLEM_FORM";

export type PassageHygieneLevel = "clean" | "warn" | "dirty";

export interface PassageHygieneIssue {
  code: PassageHygieneCode;
  /** 배지·칩에 그대로 쓰는 짧은 한국어 라벨 */
  label: string;
  /** 판정 근거(개수 등) — 툴팁용 */
  detail?: string;
}

export interface PassageHygieneReport {
  level: PassageHygieneLevel;
  dirty: boolean;
  issues: PassageHygieneIssue[];
  /** 「지문 정리 필요 — 번호만 있는 줄 2줄, (A) x / y 선택지」 꼴 한 줄 */
  summary: string;
}

const CLEAN: PassageHygieneReport = { level: "clean", dirty: false, issues: [], summary: "" };

const NUMBER_LINE_RE = /^\s*\d{1,3}[.)]?\s*$/;
const HYPHEN_BREAK_RE = /[a-z]-\n[ \t]*[a-z]/;
// `(A) using / to use` · `[ using / to use ]` — 어법 선택 학습지의 슬래시 선택지.
const CHOICE_SLASH_PAREN_RE =
  /\(\s*[A-Ea-e]\s*\)\s*[A-Za-z'’-]+(?:\s+[A-Za-z'’-]+){0,3}\s*\/\s*[A-Za-z]/;
const CHOICE_SLASH_BRACKET_RE =
  /\[\s*[A-Za-z'’-]+(?:\s+[A-Za-z'’-]+){0,3}\s*\/\s*[A-Za-z'’-]+(?:\s+[A-Za-z'’-]+){0,3}\s*\]/;

export function analyzePassageHygiene(content: string | null | undefined): PassageHygieneReport {
  const text = String(content ?? "");
  if (!text.trim()) return CLEAN;
  const issues: PassageHygieneIssue[] = [];

  // ── 1. (의도적 부재) 문장 중간 줄바꿈은 신호가 아니다 ─────────────────────
  // 실측(26-09-08, 최근 30일 생성 성공 지문 242건): 문장 중간 줄바꿈은 성공 지문의
  // 52% 에도 있다 — 축자 대조가 공백을 접어 비교하므로(normalizeWs) 줄바꿈만으론
  // 아무것도 안 깨진다. 여기에 배지를 달면 절반의 카드가 노랗게 되고 진짜 오염이
  // 묻힌다. 아래 신호들은 같은 표본에서 4~5% 만 잡았고 그 전부가 실제 오염이었다.
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  // ── 2. 단어 중간 하이픈 줄바꿈(`under-\nstand`) ────────────────────────────
  if (HYPHEN_BREAK_RE.test(text)) {
    issues.push({ code: "HYPHEN_BREAK", label: "단어 중간 줄바꿈" });
  }

  // ── 3. 번호만 있는 줄(문항 번호·페이지 번호 잔재) ──────────────────────────
  const numberLines = lines.filter((l) => NUMBER_LINE_RE.test(l)).length;
  if (numberLines > 0) {
    issues.push({
      code: "NUMBER_LINES",
      label: "번호만 있는 줄",
      detail: `${numberLines}줄`,
    });
  }

  // ── 4. `(A) x / y` 선택지 슬래시 ───────────────────────────────────────────
  if (CHOICE_SLASH_PAREN_RE.test(text) || CHOICE_SLASH_BRACKET_RE.test(text)) {
    issues.push({ code: "CHOICE_SLASH", label: "(A) x / y 선택지" });
  }

  // ── 5. 영어 지문에 한글 섞임(해석·메모 붙어 들어옴) ─────────────────────────
  const latin = (text.match(/[A-Za-z]/g) ?? []).length;
  const hangul = (text.match(/[가-힣]/g) ?? []).length;
  if (latin >= 200 && hangul >= 15) {
    issues.push({
      code: "KOREAN_MIXED",
      label: "한글 섞임",
      detail: `한글 ${hangul}자`,
    });
  }

  // ── 6. 문제 형태 흔적(빈칸·①②③·(A)(B)·발문 …) — 기존 감지기 포함 ─────────
  const form = detectProblemFormArtifacts(text);
  for (const hint of form.hints) {
    issues.push({ code: "PROBLEM_FORM", label: hint });
  }

  if (issues.length === 0) return CLEAN;
  // 한글 섞임만 있으면 경고 수준 — 나머지는 축자 대조를 실제로 깨는 오염이다.
  const dirty = issues.some((i) => i.code !== "KOREAN_MIXED");
  const summary =
    (dirty ? "지문 정리 필요 — " : "확인 필요 — ") +
    issues.map((i) => (i.detail ? `${i.label} ${i.detail}` : i.label)).join(", ");
  return { level: dirty ? "dirty" : "warn", dirty, issues, summary };
}

/** 생성 실패 문구에 붙일 안내 — 지문이 오염됐을 때만 문자열, 아니면 null. */
export function passageHygieneAdvice(content: string | null | undefined): string | null {
  const report = analyzePassageHygiene(content);
  if (!report.dirty) return null;
  const labels = [...new Set(report.issues.map((i) => i.label))].slice(0, 4).join(", ");
  return `이 지문에는 ${labels} 흔적이 있어 원문 대조 검사에서 반려되기 쉬워요. 지문을 정리(번호·선택지 제거, 빈칸 채우기, 잘린 단어 잇기)한 뒤 다시 생성해 주세요.`;
}
