// ============================================================================
// 요약문 완성 단답형(SUMMARY_COMPLETE) md 파서 · 0원 스냅.
// 견본: parser-antonym.ts / 계약: docs/md-qgen-type-expansion-spec.md
// 정본 규약 답습: 파서는 관대하게(드리프트 흡수) · 게이트는 엄격하게.
//
// 이 유형은 지문을 **변형하지 않는다**(어법·어휘와 반대 계약). 따라서 "지문 재구성
// 대조" 같은 최강 게이트가 없고, 그 자리를 요약문 무결성(라벨 1회·정답 미노출·
// 지문 복사 금지)과 채점 계약(허용답 위생)이 대신한다 — gate-summary-complete.ts.
//
// ⚠ 서술형이다. 선지가 없으므로 `오답:` 블록도, 선지 라벨 축(①/1)도 없다.
//   유일한 라벨 축은 빈칸 라벨 **"(A)" 괄호 대문자**이며, 이 문자열이 그대로
//   학생 답안 입력 키가 된다(answer-spec.ts:210 → grade.ts:115).
//   "A" 나 "(a)" 로 새면 저장된 응답과 desync 되므로 파서가 항상 정규화한다.
//
// ⚠ 게이트 본체는 gate-summary-complete.ts 로 분리했다(파일 500줄 규약).
//   의존 방향은 gate → parser 단방향이다(재수출로 순환을 만들지 마라).
// ============================================================================

import { normalizeWs } from "./parser";
import {
  SUMMARY_COMPLETE_MD_LABEL_KEYS,
  summaryCompleteMdLabels,
} from "./prompts-summary-complete";

export interface MdSummaryCompleteBlank {
  /** "(A)"~"(E)" — 학생 답안 입력 키이자 채점 필드 키 */
  label: string;
  /** 이 빈칸의 정답 — `정답(A):` 줄이 유일 진실원 */
  answer: string;
  /**
   * 동치 허용답. **정답 자신은 담지 않는다** — 스키마가 요구하는 "answer 포함"은
   * 어댑터가 선두 강제 삽입으로 충족한다(규범 §1-B 철칙 1: 한 정보는 한 곳에서만).
   */
  accepted: string[];
}

export interface MdSummaryCompleteQuestion {
  kind: "summaryComplete";
  /** (A)~(E) 라벨을 각 1회 포함하는 영어 한 문장 요약문 */
  summary: string;
  blanks: MdSummaryCompleteBlank[];
  explanation: string;
}

/** 이 유형이 다룰 수 있는 라벨 전량 — 게이트의 '설정 범위 밖 라벨' 진단에 쓴다. */
export const SUMMARY_COMPLETE_ALL_LABELS: readonly string[] =
  summaryCompleteMdLabels(SUMMARY_COMPLETE_MD_LABEL_KEYS.length);

/** 라벨 정규화 — `a`·`(a)`·`A.` 전부 `(A)` 로. 범위 밖이면 빈 문자열. */
export function summaryCompleteParenLabel(raw: unknown): string {
  const key = String(raw ?? "")
    .trim()
    .replace(/[()[\].:：]/g, "")
    .toUpperCase();
  return key.length === 1 && SUMMARY_COMPLETE_MD_LABEL_KEYS.includes(key)
    ? `(${key})`
    : "";
}

/** 라벨 정렬 순위(범위 밖은 뒤로). */
export function summaryCompleteLabelRank(label: string): number {
  const index = SUMMARY_COMPLETE_ALL_LABELS.indexOf(label);
  return index < 0 ? SUMMARY_COMPLETE_ALL_LABELS.length : index;
}

/** 비교용 정규화 — 표면차(따옴표·대시·공백·대소문자·문말 구두점)만 흡수한다. */
export function summaryCompleteCmp(value: unknown): string {
  return normalizeWs(value)
    .toLowerCase()
    .replace(/[.,!?;:]+$/g, "")
    .trim();
}

/** 요약문에서 빈칸 라벨만 등장 순으로 뽑는다. */
export function summaryCompleteLabelSequence(summary: string): string[] {
  return [...String(summary ?? "").matchAll(/\(([A-Za-z])\)/g)]
    .map((m) => summaryCompleteParenLabel(m[1]))
    .filter(Boolean);
}

/** 라벨을 걷어낸 요약문 본문(단어 수·언어 검사용). */
export function stripSummaryCompleteMarkers(summary: string): string {
  return String(summary ?? "")
    .replace(/\([A-Za-z]\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ── 줄 단위 관대 파싱 ────────────────────────────────────────────────────────
// 규범 §1-B 철칙 3: 줄 전체를 단일 정규식으로 매칭하면 사소한 장식 하나에 그 줄이
// 통째로 사라지고, 게이트에는 "개수 부족"으로만 보여 진짜 원인이 은폐된다.
// 그래서 장식(불릿·굵게·표 파이프·번호)을 먼저 벗기고 머리표만 본다.

/** 머리표로 인정하는 키워드 — 대괄호 포장(`[해설]:`) 판별에만 쓴다. */
const HEAD_KEYWORD_RE = /^(?:요약문|정답|허용\s*답(?:안)?|허용\s*정답|동치|해설)/;

function stripLineDecoration(line: string): string {
  return (
    line
      .replace(/^\s*\|\s*/, "")
      .replace(/\s*\|\s*$/, "")
      // 별표 강조는 개수를 가리지 않고 걷어낸다 — `**정답:**` 만 흡수하고 `*정답:*`
      // 를 흘리면 그 줄이 통째로 사라져 게이트가 "정답 누락"이라는 **사실과 다른**
      // 원인을 지목하고, 그 문구가 그대로 재생성 피드백이 된다(규범 §1-B 철칙 3).
      // 밑줄(`_`)은 걷어내지 않는다 — 요약문의 `_____` 잔존은 게이트가 잡아야 한다.
      .replace(/\*+/g, "")
      .replace(/^\s*(?:[-•·]|\d+[.)])\s+/, "")
      // 머리표를 대괄호로 포장한 드리프트(`[해설]: ...`). 알려진 키워드일 때만
      // 포장을 벗긴다 — 해설 본문의 `[근거]` 같은 표기를 훼손하지 않기 위해서다.
      .replace(/^[[【]\s*([^\]】]{1,16})\s*[\]】]\s*/, (full, inner: string) =>
        HEAD_KEYWORD_RE.test(inner.trim()) ? inner.trim() : full,
      )
      .trim()
  );
}

/** 머리표 뒤 구분자는 `:` 가 계약이지만, 표 행 드리프트의 `|` 도 흡수한다. */
const SEP = "\\s*[:：|]\\s*";
const LABEL = "\\s*[(（\\[]?\\s*([A-Za-z])?\\s*[)）\\]]?\\s*";

const HEAD_SUMMARY = new RegExp(`^요약문${SEP}(.*)$`);
const HEAD_ANSWER = new RegExp(`^정답${LABEL}${SEP}(.*)$`);
const HEAD_ACCEPTED = new RegExp(
  `^(?:허용\\s*답(?:안)?|허용\\s*정답|동치)${LABEL}${SEP}(.*)$`,
);
const HEAD_EXPLANATION = new RegExp(`^해설${SEP}(.*)$`);

/**
 * 값 선두의 빈칸 라벨(`(A) untrained`). **장식이 아니라 라벨 정보다** — 조용히
 * 버리면 도착 순서 폴백이 (A)/(B) 를 뒤바꾼 채 게이트를 CLEAN 으로 통과한다
 * (적대검수 critical). 캡처해서 귀속·충돌 판정에 쓴다.
 */
const VALUE_LEADING_LABEL_RE = /^[(（[]\s*([A-Za-z])\s*[)）\]]\s*/;

/** 값 선두 라벨을 `(A)` 축으로 반환한다. 없거나 범위 밖이면 빈 문자열. */
function leadingValueLabel(value: string): string {
  const hit = value.match(VALUE_LEADING_LABEL_RE);
  return hit ? summaryCompleteParenLabel(hit[1]) : "";
}

/** 잔여 표 칸을 흡수하고 한 줄로 접는다. */
function firstCell(raw: string): string {
  const cell = raw.split("|").find((seg) => seg.trim().length > 0) ?? "";
  return cell.replace(/\s+/g, " ").trim();
}

/** "없음"·"none"·"-" 류 부재 표기를 빈 목록으로 흡수한다(빈 원소 저장 방지). */
function isEmptyMarker(value: string): boolean {
  return /^(?:없음|없다|해당\s*없음|불필요|none|n\/?a|null|-{1,3})$/i.test(value);
}

function splitAcceptedList(raw: string): string[] {
  const cleaned = firstCell(raw);
  if (!cleaned || isEmptyMarker(cleaned)) return [];
  return cleaned
    .split(/\s*[,;，、]\s*|\s+\/\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !isEmptyMarker(s));
}

type PendingKind = "summary" | "answer" | "accepted";

/**
 * 요약문 완성 md 파싱. 드리프트 관용(정본 parseMdBlank 규약):
 * 불릿·굵게·표 파이프·번호 접두, 라벨 소문자·괄호 누락, 머리표만 있고 값이 다음
 * 줄에 오는 접힘, 라벨 없는 구형 단일 빈칸 표기(`정답:`), "없음" 표기.
 */
export function parseMdSummaryComplete(text: string): MdSummaryCompleteQuestion {
  let summary = "";
  const answers = new Map<string, string>();
  const accepted = new Map<string, string[]>();
  /** 라벨 없이 온 줄 — 파싱이 끝난 뒤 미사용 라벨에 순서대로 귀속시킨다. */
  const bareAnswers: string[] = [];
  const bareAccepted: string[][] = [];
  const explanationLines: string[] = [];

  let pending: { kind: PendingKind; label: string } | null = null;
  let inExplanation = false;

  const assign = (kind: PendingKind, label: string, value: string) => {
    if (kind === "summary") {
      summary = firstCell(value);
      return;
    }
    // 머리표에 라벨이 없으면 **값 선두 라벨**로 귀속한다(도착 순서 폴백보다 우선).
    // 값 라벨을 버리고 순서로 붙이면 (A)/(B) 정답이 조용히 뒤바뀐다.
    if (kind === "answer") {
      const cell = firstCell(value);
      const target = label || leadingValueLabel(cell);
      // 값 원문은 그대로 둔다 — 자기 라벨이면 스냅이 벗기고, 다른 라벨이면
      // 게이트가 자리를 지목해 반려한다(조용한 삭제 금지).
      if (target) answers.set(target, cell);
      else bareAnswers.push(cell);
      return;
    }
    const target = label || leadingValueLabel(firstCell(value));
    if (target) accepted.set(target, splitAcceptedList(value));
    else bareAccepted.push(splitAcceptedList(value));
  };

  for (const rawLine of String(text ?? "").split(/\r?\n/)) {
    const decorated = stripLineDecoration(rawLine);
    if (!decorated) continue;
    // 머리표에 헤딩(`### 정답:`)을 씌우는 드리프트를 흡수한다. 마커를 벗긴 본문을
    // 머리표로 먼저 시도하고, 어느 머리표도 아니면(`## 지문`) 종전대로 섹션
    // 경계로 보아 해설 누적을 끊는다(루프 말미 guard).
    // 헤딩 뒤에 불릿·굵게가 겹쳐 오는 복합 드리프트가 있어 장식 제거를 한 번 더 돌린다.
    const heading = /^#{1,6}\s/.test(decorated);
    const line = heading
      ? stripLineDecoration(decorated.replace(/^#{1,6}\s*/, ""))
      : decorated;
    if (!line) continue;

    const summaryHead = line.match(HEAD_SUMMARY);
    if (summaryHead) {
      inExplanation = false;
      const value = summaryHead[1].trim();
      if (value) {
        assign("summary", "", value);
        pending = null;
      } else {
        pending = { kind: "summary", label: "" };
      }
      continue;
    }

    const answerHead = line.match(HEAD_ANSWER);
    if (answerHead) {
      inExplanation = false;
      const label = summaryCompleteParenLabel(answerHead[1] ?? "");
      const value = answerHead[2].trim();
      if (value) {
        assign("answer", label, value);
        pending = null;
      } else {
        pending = { kind: "answer", label };
      }
      continue;
    }

    const acceptedHead = line.match(HEAD_ACCEPTED);
    if (acceptedHead) {
      inExplanation = false;
      pending = null;
      const label = summaryCompleteParenLabel(acceptedHead[1] ?? "");
      const value = acceptedHead[2].trim();
      // 값이 비면 "동치 없음"이 계약이다(빈 줄을 쓰지 말라고 지시했지만 실측 드리프트).
      // 라벨도 값도 없는 줄은 아무 자리도 만들지 않는다 — 유령 빈칸 방지.
      if (value || label) assign("accepted", label, value);
      continue;
    }

    const explanationHead = line.match(HEAD_EXPLANATION);
    if (explanationHead) {
      pending = null;
      inExplanation = true;
      const value = explanationHead[1].trim();
      if (value) explanationLines.push(value);
      continue;
    }

    // 머리표가 아닌 헤딩은 프롬프트 섹션 경계다 — 값·해설로 흡수하지 않는다.
    if (heading) {
      pending = null;
      inExplanation = false;
      continue;
    }
    if (pending) {
      assign(pending.kind, pending.label, line);
      pending = null;
      continue;
    }
    if (inExplanation) explanationLines.push(line);
  }

  // 라벨 없는 줄 귀속 — 이미 명시 라벨이 쓰인 자리는 건드리지 않는다.
  const freeLabels = SUMMARY_COMPLETE_ALL_LABELS.filter((l) => !answers.has(l));
  bareAnswers.forEach((value, i) => {
    const label = freeLabels[i];
    if (label) answers.set(label, value);
  });
  // 라벨 없는 허용답은 **정답이 있는 자리**에만 귀속시킨다 — 아무 자리에나 붙이면
  // 존재하지 않는 빈칸이 생겨 게이트가 엉뚱한 곳을 지목한다.
  const answeredLabels = SUMMARY_COMPLETE_ALL_LABELS.filter((l) => answers.has(l));
  const freeAcceptedLabels = (
    answeredLabels.length > 0 ? answeredLabels : SUMMARY_COMPLETE_ALL_LABELS
  ).filter((l) => !accepted.has(l));
  bareAccepted.forEach((values, i) => {
    const label = freeAcceptedLabels[i];
    if (label) accepted.set(label, values);
  });

  const labels = [...new Set([...answers.keys(), ...accepted.keys()])].sort(
    (a, b) => summaryCompleteLabelRank(a) - summaryCompleteLabelRank(b),
  );
  const blanks: MdSummaryCompleteBlank[] = labels.map((label) => ({
    label,
    answer: answers.get(label) ?? "",
    accepted: accepted.get(label) ?? [],
  }));

  return {
    kind: "summaryComplete",
    summary,
    blanks,
    explanation: explanationLines.join(" ").replace(/\s+/g, " ").trim(),
  };
}

// ── 0원 자동 보정 ────────────────────────────────────────────────────────────
// 보수 가드: 확실할 때만 교정하고, 애매하면 그대로 두어 게이트가 반려하게 한다.
// 여기서 흡수하는 것은 전부 "표기 장식"이지 내용이 아니다.

/**
 * 요약문 안의 빈칸 라벨 표면형 — **설정 라벨 범위(A~E)로만** 좁힌다.
 * `[A-Za-z]` 로 넓히면 `worker(s)` 같은 정상 영문 표기까지 대문자로 바꿔
 * 학생 표면 문장을 훼손한다(게이트도 범위 밖 글자는 라벨로 세지 않는다).
 */
const SUMMARY_LABEL_SURFACE_RE = new RegExp(
  `[(（]\\s*([${SUMMARY_COMPLETE_MD_LABEL_KEYS}${SUMMARY_COMPLETE_MD_LABEL_KEYS.toLowerCase()}])\\s*[)）]`,
  "g",
);

/**
 * 값 앞에 라벨을 다시 붙이거나 따옴표로 감싸거나 문말 구두점을 붙인 표기 드리프트를
 * 벗긴다. 장식이 겹칠 수 있으므로(`"untrained".`) 더 벗길 것이 없을 때까지 반복한다.
 *
 * ⚠ 선두 라벨은 **자기 라벨일 때만** 벗긴다. `정답(A): (B) vulnerability` 처럼 다른
 *   빈칸 라벨이 붙은 값을 조용히 벗기면, 어느 칸의 정답인지 확정 불가한 입력이
 *   CLEAN 으로 통과해 (A)/(B) 가 뒤바뀐 채 EXACT 채점된다(되돌릴 수 없다).
 *   그 경우는 손대지 않고 게이트가 자리를 지목해 반려한다.
 */
function stripValueOrnament(value: string, ownLabel?: string): string {
  let out = value.trim();
  for (let i = 0; i < 4; i += 1) {
    let next = out;
    const hit = next.match(VALUE_LEADING_LABEL_RE);
    if (hit) {
      const found = summaryCompleteParenLabel(hit[1]);
      // 범위 밖 글자(`(x)`)는 라벨 정보가 아니라 장식이므로 종전대로 벗긴다.
      if (!found || !ownLabel || found === ownLabel) {
        next = next.slice(hit[0].length);
      }
    }
    // 감싼 따옴표는 **양끝이 짝일 때만** 벗긴다 — 한쪽만 벗기면 소유격
    // (`others'`)의 아포스트로피가 잘려 채점 집합이 오염된다.
    next = next
      .replace(/^(["'“‘])([\s\S]*)(["'”’])$/, "$2")
      .replace(/[.,;·]+$/, "")
      .trim();
    if (next === out) break;
    out = next;
  }
  return out;
}

export function autoSnapSummaryComplete(
  q: MdSummaryCompleteQuestion,
  options?: { blankCount?: number },
): { question: MdSummaryCompleteQuestion; corrections: string[] } {
  const corrections: string[] = [];

  // (0) 요약문 빈칸 라벨 표기 정규화 — 소문자·전각괄호·괄호 안 공백.
  //     게이트는 라벨을 대문자로 접어서 보므로(summaryCompleteParenLabel) 정규화를
  //     빼먹으면 `(b)` 가 든 요약문이 CLEAN 통과해 **저장본에 그대로 인쇄**되고,
  //     학생 표면 밑줄 정규식(`\([A-Z]\)`)이 그 칸만 빈칸선 없이 렌더한다.
  //     형제 레인 autoSnapSummaryMc 의 S1 과 동일한 보정이다.
  let summary = q.summary;
  const labelNormalized = summary.replace(
    SUMMARY_LABEL_SURFACE_RE,
    (_full, key: string) => `(${key.toUpperCase()})`,
  );
  if (labelNormalized !== summary) {
    summary = labelNormalized;
    corrections.push("요약문 빈칸 라벨 표기를 (A) 축으로 정규화(소문자·전각괄호·공백)");
  }

  // (1) 빈칸 자리에 밑줄·말줄임을 덧붙인 표기 — 시험지가 자동으로 넣으므로 걷어낸다.
  //     남겨 두면 저장본에 `(A) _____ _____` 처럼 이중 밑줄이 인쇄된다.
  const deOrnamented = summary
    .replace(/(\([A-Za-z]\))\s*(?:_{2,}|\.{3,}|…+|[-–—]{2,})/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (deOrnamented !== summary) {
    summary = deOrnamented;
    corrections.push("요약문 빈칸 라벨 뒤의 밑줄·말줄임 표기 제거");
  }

  // (2) 값 장식 제거 + 허용답 위생(자기중복·목록중복 제거).
  //     ⚠ "다른 빈칸의 정답이 허용답에 섞임"은 스냅에서 지우지 않는다 — 되돌릴 수
  //     없는 채점 사고라 조용히 고치면 안 되고, 게이트가 자리를 지목해야 한다.
  const blanks = q.blanks.map((blank) => {
    let answer = blank.answer;
    const trimmedAnswer = stripValueOrnament(answer, blank.label);
    if (trimmedAnswer && trimmedAnswer !== answer) {
      answer = trimmedAnswer;
      corrections.push(`${blank.label} 정답의 라벨·따옴표·문말 구두점 표기 제거`);
    }
    const ownKey = summaryCompleteCmp(answer);
    const seen = new Set<string>();
    const kept: string[] = [];
    let droppedSelf = 0;
    let droppedDup = 0;
    for (const raw of blank.accepted) {
      const value = stripValueOrnament(raw, blank.label);
      const key = summaryCompleteCmp(value);
      if (!key) continue;
      if (key === ownKey) {
        droppedSelf += 1;
        continue;
      }
      if (seen.has(key)) {
        droppedDup += 1;
        continue;
      }
      seen.add(key);
      kept.push(value);
    }
    if (droppedSelf > 0) {
      corrections.push(`${blank.label} 허용답에서 정답과 같은 값 ${droppedSelf}건 제거(중복 계약)`);
    }
    if (droppedDup > 0) {
      corrections.push(`${blank.label} 허용답 중복 ${droppedDup}건 제거`);
    }
    return { label: blank.label, answer, accepted: kept };
  });

  // (3) 제시 순서 — 진실원은 라벨이다. 순서만 뒤집힌 드리프트는 정렬로 흡수한다.
  const ordered = [...blanks].sort(
    (a, b) => summaryCompleteLabelRank(a.label) - summaryCompleteLabelRank(b.label),
  );
  if (ordered.map((b) => b.label).join("") !== blanks.map((b) => b.label).join("")) {
    corrections.push("정답 줄 제시 순서를 (A)(B)(C) 로 정렬");
  }

  // (4) 단일 빈칸 설정인데 라벨이 (A) 가 아닌 한 자리만 온 경우 — 라벨 축을 (A) 로
  //     맞춘다(요약문 라벨과 어긋나면 게이트 #3 이 잡으므로 요약문도 함께 확인).
  const blankCount = options?.blankCount;
  let finalBlanks = ordered;
  if (
    blankCount === 1 &&
    ordered.length === 1 &&
    ordered[0].label !== "(A)" &&
    summaryCompleteLabelSequence(summary).join("") === "(A)"
  ) {
    corrections.push(`정답 라벨 ${ordered[0].label} 를 요약문 라벨 (A) 로 보정`);
    finalBlanks = [{ ...ordered[0], label: "(A)" }];
  }

  return {
    question: { ...q, summary, blanks: finalBlanks },
    corrections,
  };
}
