// ============================================================================
// 요약문 완성 객관식(SUMMARY_COMPLETE_MC) md 파서 · 0원 스냅.
// 견본: parser-antonym.ts · parser-combo.ts / 정본 규약: 파서는 관대하게(드리프트
// 흡수) · 게이트는 엄격하게. 파서가 데이터를 조용히 버리면 게이트는 "개수 부족"
// 만 보게 되고 진짜 원인이 은폐된다(규범 §1-B 철칙 3).
//
// 0원 결정형 게이트는 **gate-summary-mc.ts** 로 분리했다(파일 400줄 분할 조항 ·
// gate-combo.ts 선례). 이 파일은 마크다운 → 구조체(파싱)와 무손실 보정(스냅)까지만.
//
// 이 유형의 계약 축(다른 유형과 다른 지점):
//  · 지문을 **전혀 변형하지 않는다**. 재구성 대조 게이트가 없는 대신, 요약문이
//    지문 문장의 복사가 아님을 확인하는 "연속 8단어 복사 금지" 게이트가 그 자리를
//    대신한다(이 유형의 핵심 품질축은 지문 보존이 아니라 압축 재진술이다).
//  · **빈칸 정답을 따로 받지 않는다.** `정답:` 줄이 가리키는 선지의 값이 곧 각
//    빈칸의 정답이다(규범 §1-B 철칙 1). fast 스키마의 blanks[].answer 는 어댑터가
//    이 파생값으로 채운다 — 그래서 correct-pair-mismatch 실패 모드가 없다.
// ============================================================================

import { normalizeWs } from "./parser";
import {
  SUMMARY_MC_MD_LABEL_KEYS,
  SUMMARY_MC_MD_VALUE_JOINER as VALUE_JOINER,
} from "./prompts-summary-mc";

/** 선지 라벨 정본 축(md 표면) — 어댑터가 숫자 문자열로 변환한다. */
export const SUMMARY_MC_CIRCLED = "①②③④⑤";

export interface MdSummaryMcOption {
  /** "①"~"⑤" */
  label: string;
  /** 원문 join 문자열(" …… ") */
  text: string;
  /** (A)(B)… 순서의 값 */
  values: string[];
  /**
   * 스냅이 각 값에서 떼어낸 빈칸 라벨(`(A)` 등). 라벨이 없던 자리는 null.
   *
   * 라벨을 **대조 없이 지우면** 열 정합을 검증할 수 있는 유일한 신호가 사라져
   * `⑤ (B) boredom …… (A) distracted` 같은 역전 행이 조용히 잘못된 열에 꽂힌다
   * (규범 §1-B 철칙 3 위반 · 적대검수 F5 실측). 스냅이 확실할 때는 라벨 기준으로
   * 재정렬하고, 애매하면 이 필드를 남겨 게이트가 자리를 지목하게 한다.
   */
  valueLabels?: (string | null)[];
}

export interface MdSummaryMcQuestion {
  kind: "summaryMc";
  /** (A)(B) 라벨이 박힌 영어 한 문장 요약문(밑줄 없음이 정본 표기) */
  summary: string;
  options: MdSummaryMcOption[];
  /** "①"~"⑤" — 정답의 유일한 진실원 */
  answer: string;
  explanation: string;
  wrong: { label: string; text: string }[];
}

/** 비교 정규화 — 대소문자·따옴표·대시·공백 차이를 흡수한 비교 축. */
export function summaryMcCmp(value: string): string {
  return normalizeWs(value)
    .toLowerCase()
    .replace(/^["'`(\[]+|["'`)\]]+$/g, "")
    .replace(/[.,;:!?]+$/g, "")
    .trim();
}

/** "3"·"③" → "③" (그 외는 빈 문자열). */
export function summaryMcCircled(raw: string): string {
  const token = raw.trim();
  if (SUMMARY_MC_CIRCLED.includes(token) && token.length === 1) return token;
  const n = Number(token);
  return Number.isInteger(n) && n >= 1 && n <= 5 ? SUMMARY_MC_CIRCLED[n - 1] : "";
}

/** 요약문에서 라벨을 등장 순으로 뽑는다(순서 게이트·개수 게이트 공용). */
export function summaryMcLabelSequence(summary: string): string[] {
  return [...summary.matchAll(/\(\s*([A-Da-d])\s*\)/g)].map(
    (m) => `(${m[1].toUpperCase()})`,
  );
}

/** 라벨을 걷어낸 요약문(지문 복사 검사·영어 검사 공용). */
export function stripSummaryMcMarkers(summary: string): string {
  return summary.replace(/\(\s*[A-Da-d]\s*\)/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * 빈칸 정답 = `정답:` 줄이 가리키는 선지의 값. **이 유형의 유일한 정답 진실원**
 * 이며 어댑터의 blanks[].answer 가 여기서 파생된다.
 */
export function summaryMcAnswerValues(q: MdSummaryMcQuestion): string[] {
  return q.options.find((o) => o.label === q.answer)?.values ?? [];
}

// ── 키워드 줄 관용 (규범 §1-B 철칙 3) ───────────────────────────────────────
// 선지·데이터 줄만 관대하게 파싱하고 `정답:` `해설:` `오답:` 같은 **키워드 줄**을
// 무관용 정규식으로 잡으면, 모델이 헤더를 굵게(`**해설:**`)·헤딩(`### 오답:`)으로
// 쓰는 순간 그 필드가 통째로 사라진다. 그러면 게이트가 "해설 누락" 처럼 **사실과
// 다른 원인**을 지목하고, 그 문구가 그대로 [반려 재생성] 피드백이 되어 모델은
// 이미 쓴 해설을 다시 쓰라는 지시를 받는다(적대검수 F2 실측 · 프로덕션 2회 사고).
// → 모든 키워드 줄이 **같은 관용 축**을 쓰도록 한 곳에서 만든다.
const KEYWORD_HEAD = String.raw`^[ \t]*\|?[ \t]*(?:>[ \t]*)*(?:#{1,6}[ \t]*)?(?:[-*•+][ \t]*)?(?:\*\*|__)?[ \t]*`;
const KEYWORD_TAIL = String.raw`[ \t]*(?:\*\*|__)?[ \t]*[:：][ \t]*(?:\*\*|__)?[ \t]*`;

/**
 * `<키워드>:` 줄 매처. 굵게(`**해설:**` `**해설**:`)·헤딩(`### 오답:`)·불릿·
 * 인용(`> `)·표 파이프·전각 콜론·앞뒤 공백을 전부 흡수한다.
 * @param anchorEol 헤더 뒤에 아무것도 없는 줄만 매칭(2단 분해의 1순위용)
 */
function keywordLineRe(word: string, anchorEol = false): RegExp {
  return new RegExp(`${KEYWORD_HEAD}${word}${KEYWORD_TAIL}${anchorEol ? "$" : ""}`, "m");
}

/** 키워드 줄 lookahead 조각 — 캡처 없는 형태로 조립해 split/lookahead 에 재사용. */
function keywordLookahead(...wordsToBreak: string[]): string {
  return wordsToBreak
    .map((word) => `${KEYWORD_HEAD}${word}${KEYWORD_TAIL}`)
    .join("|");
}

const SUMMARY_HEAD_RE = keywordLineRe("요약문");
const ANSWER_HEAD_RE = keywordLineRe("정답");
const EXPLANATION_HEAD_RE = keywordLineRe("해설");
const WRONG_HEAD_EOL_RE = keywordLineRe("오답", true);
const WRONG_HEAD_RE = keywordLineRe("오답");

// 라벨 줄 판별 — 선지 줄과 섹션 헤더를 함께 인식한다(요약문 절단 경계).
const SECTION_BREAK_RE = new RegExp(
  `^\\s*\\|?\\s*(?:[-*•]\\s*)?(?:\\*\\*)?(?:[①②③④⑤]|[1-5]\\s*[.)]|#{1,6}\\s)` +
    `|${keywordLookahead("정답", "해설", "오답", "선지", "요약문")}`,
);

// 선지 줄 — 불릿·굵게·표 파이프·숫자 라벨 드리프트를 전부 흡수한다.
const OPTION_LINE_RE =
  /^\s*\|?\s*(?:[-*•]\s*)?(?:\*\*)?(?:([①②③④⑤])|([1-5]))(?:\*\*)?\s*[.)]?\s*(.+)$/;

// 값 구분자 관용 — 계약 리터럴은 " …… " 이나 말줄임표 개수·점 표기·표 파이프·
// 슬래시 드리프트를 흡수한다(공백으로 둘러싸인 것만 — 값 내부 하이픈·슬래시 보호).
const VALUE_SPLIT_RE = /\s*(?:…+|\.{2,}|\?{2,})\s*|\s+[/|]\s+/;

/**
 * 표 셀 장식 제거. **선두 파이프도 반드시 지운다** — 라벨과 값을 각각 셀로 쓴
 * GFM 표 행(`| ① | untrained …… vulnerability |`)에서 꼬리 파이프만 지우면
 * 값 앞에 `"| "` 가 남아 `blanks[0].answer = "| untrained"` 라는 오염된 정답이
 * 게이트·검증기·표시 계층을 전부 통과해 저장·인쇄된다(적대검수 F1 실측).
 * 반쪽 관용은 큰 소리의 실패를 조용한 오염으로 바꾼다 — 관용은 양끝 대칭이어야 한다.
 */
function cleanCell(raw: string): string {
  return raw
    .replace(/^\s*\|+\s*/g, "")
    .replace(/\|+\s*$/g, "")
    .replace(/\*\*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 선지 줄을 관대하게 파싱한다. 라벨이 숫자(`3)` `3.`)로 와도 원문자로 정규화하고,
 * 표 행·불릿·굵게 장식을 흡수한다. 값 분해에 실패해도 **줄을 버리지 않는다** —
 * values 길이 불일치를 게이트가 지목해야 원인이 드러난다.
 */
function parseOptionLines(section: string): MdSummaryMcOption[] {
  const options: MdSummaryMcOption[] = [];
  const seen = new Set<string>();
  for (const rawLine of section.split(/\r?\n/)) {
    const m = rawLine.match(OPTION_LINE_RE);
    if (!m) continue;
    const label = summaryMcCircled(m[1] ?? m[2] ?? "");
    if (!label || seen.has(label)) continue;
    // 숫자 라벨은 구분자(`.`/`)`)가 있어야 선지로 본다 — 산문 첫 단어가 숫자인 줄을
    // 선지로 오인하면 조합이 통째로 오염된다(관용의 상한).
    if (!m[1] && !/^\s*\|?\s*(?:[-*•]\s*)?(?:\*\*)?[1-5](?:\*\*)?\s*[.)]/.test(rawLine)) {
      continue;
    }
    const text = cleanCell(m[3]);
    if (!text) continue;
    seen.add(label);
    options.push({
      label,
      text,
      values: text.split(VALUE_SPLIT_RE).map((s) => s.trim()).filter(Boolean),
    });
  }
  return options;
}

/** `요약문:` 이후 첫 문단을 한 줄로 접어 반환한다(라벨 다음 줄 개행 드리프트 흡수). */
function parseSummaryLine(text: string): string {
  const after = text.split(SUMMARY_HEAD_RE)[1];
  if (after === undefined) return "";
  const collected: string[] = [];
  for (const rawLine of after.split(/\r?\n/)) {
    if (SECTION_BREAK_RE.test(rawLine)) break;
    const line = cleanCell(rawLine);
    if (!line) {
      if (collected.length > 0) break;
      continue;
    }
    collected.push(line);
  }
  return collected.join(" ").replace(/\s+/g, " ").trim();
}

/**
 * 요약문 완성 객관식 md 파싱. 드리프트 관용(정본 parseMdBlank·parseMdCombo 규약):
 * 라벨 표기 흔들림, 구분자 주변 공백, 오답 목록에 정답 줄을 끼워 넣는 실측 패턴.
 */
export function parseMdSummaryMc(text: string): MdSummaryMcQuestion {
  const beforeWrong = text.split(WRONG_HEAD_RE)[0] ?? text;
  // 선지는 항상 `정답:` 앞에 온다 — 그 앞까지만 훑어 해설 속 번호 목록 오인을
  // 차단한다. 순서 드리프트(해설이 선지보다 앞)면 오답 섹션 앞 전체로 폴백한다.
  const primary = beforeWrong.split(ANSWER_HEAD_RE)[0] ?? beforeWrong;
  const primaryOptions = parseOptionLines(primary);
  const options =
    primaryOptions.length >= 5 ? primaryOptions : parseOptionLines(beforeWrong);

  const answer = summaryMcCircled(
    text.match(
      new RegExp(`${ANSWER_HEAD_RE.source}[([［]?[ \\t]*([①②③④⑤]|[1-5])`, "m"),
    )?.[1] ?? "",
  );

  const wrongSection =
    text.split(WRONG_HEAD_EOL_RE)[1] ?? text.split(WRONG_HEAD_RE)[1] ?? "";
  // 드리프트 관용: 오답 목록에 정답 줄을 끼워 넣는 실측 — 파서가 걸러낸다.
  const wrong = parseOptionLines(wrongSection)
    .map((o) => ({ label: o.label, text: o.text }))
    .filter((w) => w.label !== answer);

  return {
    kind: "summaryMc",
    summary: parseSummaryLine(text),
    options,
    answer,
    explanation:
      // lookahead 를 `오답:` 하나로 두면 섹션 순서 드리프트에서 '정답: ③' 라인을
      // 통째로 흡수해 학생 표면 해설에 정답 번호가 박힌다(combo 실측 계승).
      text.match(
        new RegExp(
          `${EXPLANATION_HEAD_RE.source}([\\s\\S]*?)(?=${keywordLookahead("오답", "정답", "요약문", "선지")}|^#{1,6}\\s)`,
          "m",
        ),
      )?.[1]?.trim() ??
      text.match(new RegExp(`${EXPLANATION_HEAD_RE.source}([\\s\\S]+)$`, "m"))?.[1]?.trim() ??
      "",
    wrong,
  };
}

// ── 0원 자동 보정 ────────────────────────────────────────────────────────────
// 보수 가드: 확실할 때만 교정하고 애매하면 손대지 않고 게이트가 반려하게 둔다.

const LABEL_MARKER_RE = /[(（]\s*([A-Da-d])\s*[)）]/g;
const BLANK_RUN_AFTER_MARKER_RE = /(\([A-D]\))\s*(?:_{2,}|…+|\.{3,}|[-–—]{2,})/g;
/** `(A) value` — 괄호가 라벨임을 확정하므로 구분자 없이 공백만 있어도 안전. */
const VALUE_PAREN_LABEL_PREFIX_RE = /^[(（]\s*[A-Da-d]\s*[)）]\s*[:.\-–—]?\s*/;
/**
 * `A: value` / `A) value` — 맨몸 글자는 구분자가 있을 때만 라벨로 본다.
 * 구분자를 요구하지 않으면 "A shift toward ..." 같은 정상 값의 관사를 잘라먹는다.
 */
const VALUE_BARE_LABEL_PREFIX_RE = /^[A-Da-d]\s*[:.)]\s+/;
const EDGE_QUOTE_RE = /^["'“”‘’`]+|["'“”‘’`]+$/g;
/** 표 셀 잔재 파이프 — 값 양끝에서만 제거한다(값 내부는 구분자 분해가 이미 처리). */
const EDGE_PIPE_RE = /^\s*\|+\s*|\s*\|+\s*$/g;

/**
 * 값 하나를 정규화하면서 **떼어낸 빈칸 라벨을 함께 돌려준다.**
 * 라벨을 조용히 버리면 열 정합을 검증할 유일한 신호가 사라진다(적대검수 F5).
 */
function cleanValue(raw: string): { value: string; label: string | null } {
  let value = raw.trim();
  value = value.replace(/^\*\*|\*\*$/g, "").trim();
  value = value.replace(EDGE_PIPE_RE, "").trim();
  // 따옴표 → 라벨 → 따옴표 순으로 두 번 훑는다(`"(A) x"` 와 `(A) "x"` 를 모두 흡수).
  value = value.replace(EDGE_QUOTE_RE, "").trim();
  let label: string | null = null;
  const paren = value.match(VALUE_PAREN_LABEL_PREFIX_RE);
  const bare = paren ? null : value.match(VALUE_BARE_LABEL_PREFIX_RE);
  const hit = paren ?? bare;
  if (hit) {
    label = `(${(hit[0].match(/[A-Da-d]/)?.[0] ?? "").toUpperCase()})`;
    value = value.slice(hit[0].length).trim();
  }
  value = value.replace(EDGE_QUOTE_RE, "").trim();
  value = value.replace(/[,;]+$/g, "").trim();
  return { value, label };
}

/**
 * 라벨이 붙은 값들의 열 정합 판정.
 *  · 전 값에 라벨이 있고 서로 다르면 → 라벨 알파벳 순으로 **재정렬**(결정형 보정).
 *  · 라벨이 일부만 있거나 중복이면 → 손대지 않고 라벨을 남겨 게이트가 지목하게 한다
 *    (스냅 보수 가드: 애매하면 교정하지 않는다).
 */
function alignValuesByLabel(
  values: string[],
  labels: (string | null)[],
): { values: string[]; labels: (string | null)[]; reordered: boolean } {
  const allLabeled = labels.length > 0 && labels.every((l) => l !== null);
  const distinct = new Set(labels.filter((l): l is string => l !== null)).size === labels.length;
  if (!allLabeled || !distinct) return { values, labels, reordered: false };
  const order = values
    .map((value, i) => ({ value, label: labels[i] as string, i }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const reordered = order.some((entry, i) => entry.i !== i);
  return {
    values: order.map((entry) => entry.value),
    labels: order.map((entry) => entry.label),
    reordered,
  };
}

/**
 * 0원 자동 보정.
 *  S1 요약문 라벨 표기 정규화 — 전각 괄호·소문자 라벨을 `(A)` 정본으로.
 *  S2 요약문의 빈칸선 제거 — `(A) _____` → `(A)`. 저장 정본은 라벨만이고 밑줄은
 *     표시 계층(addSummaryCompleteMcBlankLines)이 붙인다. 남겨 두면 요약문 축자
 *     비교·라벨 개수 검사에 잡티가 낀다.
 *  S3 선지 값 표기 정규화 — 굵게·따옴표·표 잔재 파이프·라벨 접두(`(A) x`)·꼬리
 *     쉼표 제거. ⚠ 값의 "내용"은 손대지 않는다(단어 교체·대소문자 변경 금지).
 *  S4 값 라벨 기준 열 재정렬 — 모델이 `⑤ (B) boredom …… (A) distracted` 처럼
 *     라벨을 뒤집어 붙인 행을 라벨 순으로 되돌린다. 라벨이 일부만 있거나 중복이면
 *     손대지 않고 valueLabels 를 남겨 게이트가 자리를 지목한다.
 */
export function autoSnapSummaryMc(
  q: MdSummaryMcQuestion,
): { question: MdSummaryMcQuestion; corrections: string[] } {
  const corrections: string[] = [];

  let summary = q.summary;
  const normalizedLabels = summary.replace(
    LABEL_MARKER_RE,
    (_full, key: string) => `(${key.toUpperCase()})`,
  );
  if (normalizedLabels !== summary) {
    corrections.push("요약문 빈칸 라벨 표기를 (A) 정본으로 정규화");
    summary = normalizedLabels;
  }
  const withoutBlankRuns = summary.replace(BLANK_RUN_AFTER_MARKER_RE, "$1");
  if (withoutBlankRuns !== summary) {
    corrections.push("요약문 라벨 뒤 빈칸선 제거 (표시 계층이 부착)");
    summary = withoutBlankRuns.replace(/\s+/g, " ").replace(/\s+([,.;:!?])/g, "$1").trim();
  }

  let snappedValues = 0;
  const reorderedOptions: string[] = [];
  const options = q.options.map((option) => {
    const cleaned = option.values.map((value) => {
      const next = cleanValue(value);
      if (next.value && next.value !== value) snappedValues += 1;
      return { value: next.value || value, label: next.label };
    });
    const aligned = alignValuesByLabel(
      cleaned.map((c) => c.value),
      cleaned.map((c) => c.label),
    );
    if (aligned.reordered) reorderedOptions.push(option.label);
    return {
      ...option,
      values: aligned.values,
      valueLabels: aligned.labels,
      text: aligned.reordered ? aligned.values.join(VALUE_JOINER) : option.text,
    };
  });
  if (snappedValues > 0) {
    corrections.push(`선지 값 ${snappedValues}개의 장식·라벨 접두를 제거`);
  }
  if (reorderedOptions.length > 0) {
    corrections.push(
      `${reorderedOptions.join("")} 값을 표기된 (A)(B) 라벨 순서로 재정렬 — 열이 뒤집힌 행`,
    );
  }

  return { question: { ...q, summary, options }, corrections };
}

/** 설정 범위 밖 라벨((C)(D) 오출력) 검출용 전체 라벨 집합. */
export const SUMMARY_MC_ALL_LABELS: readonly string[] = SUMMARY_MC_MD_LABEL_KEYS.split(
  "",
).map((k) => `(${k})`);
