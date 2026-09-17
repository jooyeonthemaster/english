// ============================================================================
// 요약문 완성 객관식(SUMMARY_COMPLETE_MC) 0원 결정형 게이트.
// 견본: gate-combo.ts / 계약: docs/md-qgen-type-expansion-spec.md §1 [6]
//
// 게이트 메시지는 **자리를 지목한다**(규범 §1-B 철칙 5) — 이 문구가 그대로
// [반려 재생성] 피드백으로 실려 재생성 성공률을 가른다.
//
// 이 유형은 지문을 변형하지 않으므로 "지문 재구성 대조"(어법·어휘·반의어의 최강
// 게이트)가 없다. 그 자리를 대신하는 것이 아래 두 가지다:
//   · 요약문의 지문 연속 복사 금지(8단어) — 이 유형의 핵심 품질축은 압축 재진술이다.
//   · 조합 구조 검사(반쪽 정답·열 병렬·열 다양성) — fast 검증기가 error 로 잡는
//     summary-mc-* 결함을 생성 시점에 결정형으로 선반영한다.
// ============================================================================

import {
  sameSummarySemanticField,
  summarySemanticFamily,
} from "@/lib/question-quality/validators/summary/killer-trap";
import { normalizeWs } from "./parser";
import {
  stripSummaryMcMarkers,
  summaryMcAnswerValues,
  summaryMcCmp,
  summaryMcLabelSequence,
  SUMMARY_MC_ALL_LABELS,
  type MdSummaryMcQuestion,
} from "./parser-summary-mc";
import {
  SUMMARY_MC_MD_OPTION_COUNT,
  summaryMcMdLabels,
} from "./prompts-summary-mc";

/** 요약문 최소·최대 단어 수 — 한 문장 압축의 상식 범위(절단·장광설 검출). */
const SUMMARY_MIN_WORDS = 8;
const SUMMARY_MAX_WORDS = 60;
/** 값 최대 단어 수 — 빈칸 채움말은 단어 또는 짧은 어구다. */
const VALUE_MAX_WORDS = 6;
/**
 * 같은 열(빈칸) 값들의 단어 수 허용 편차.
 * 정본 마감 규칙은 "±3단어"였으나 26-08-22 기출 전수 실측에서 수능·평가원·학평
 * 156문항 중 14건(9.0%)이 편차 4~6단어로 오반려됐다(분포 {4:12, 6:2}, 7 이상
 * 0건). 기출 최대값 6을 허용 상한으로 올려 오반려 0%로 맞춘다.
 */
const COLUMN_WORD_SPREAD_MAX = 6;
/** 지문 연속 복사로 간주하는 토큰 길이. */
const COPY_NGRAM = 8;

const HANGUL_RE = /[가-힣]/;
const LATIN_RE = /[A-Za-z]/;

function words(value: string): string[] {
  return normalizeWs(value).split(" ").filter(Boolean);
}

function tokens(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter(Boolean);
}

/** 문장 종결 개수 — 약어(U.S.)·소문자 후속을 문장 끝으로 세지 않는 보수 계수. */
function sentenceEndCount(text: string): number {
  let count = 0;
  for (const m of text.matchAll(/[.!?]+(?=\s+["'“‘([]?[A-Z]|\s*$)/g)) {
    const before = text.slice(0, m.index ?? 0);
    if (/(?:^|[\s(])[A-Z]$/.test(before)) continue;
    count += 1;
  }
  return count;
}

/** 요약문이 지문에서 연속 N토큰 이상을 그대로 옮겼는지(복사 검출). */
function findCopiedRun(summary: string, passage: string): string | null {
  const summaryTokens = tokens(stripSummaryMcMarkers(summary));
  if (summaryTokens.length < COPY_NGRAM) return null;
  const passageTokens = tokens(passage);
  if (passageTokens.length < COPY_NGRAM) return null;
  const grams = new Set<string>();
  for (let i = 0; i + COPY_NGRAM <= passageTokens.length; i += 1) {
    grams.add(passageTokens.slice(i, i + COPY_NGRAM).join(" "));
  }
  for (let i = 0; i + COPY_NGRAM <= summaryTokens.length; i += 1) {
    const gram = summaryTokens.slice(i, i + COPY_NGRAM).join(" ");
    if (grams.has(gram)) return gram;
  }
  return null;
}

export interface SummaryMcGateOptions {
  /** 교사 설정(2~4) · optionCount 는 5 고정 노브 없음 */
  blankCount?: number;
  optionCount?: number;
  requireWrong?: boolean;
  /**
   * 원본 난이도 문자열(BASIC | INTERMEDIATE | KILLER). 검증기가 보는 축과 동일한
   * `requestedDifficulty` 다. 미지정 시 **KILLER**(가장 엄격) — 난이도를 모른 채
   * 함정 검사를 느슨하게 열어 주면 킬러 결함이 무검사로 새 나간다.
   */
  difficulty?: string;
}

/**
 * 반쪽 정답(2빈칸) / near-miss(3빈칸 이상) 구조 검사. 난이도에 따라 차단/권고로
 * 갈리므로 판정과 채널을 분리했다 — 검사 로직은 한 곳뿐이다.
 */
function summaryMcTrapStructure(
  q: MdSummaryMcQuestion,
  answerKeys: string[],
  blankCount: number,
): { code: string; message: string }[] {
  const labels = summaryMcMdLabels(blankCount);
  let halfA = false;
  let halfB = false;
  let nearMiss = false;
  for (const option of q.options) {
    if (option.label === q.answer) continue;
    const matches = option.values.map((value, i) => summaryMcCmp(value) === answerKeys[i]);
    if (matches.filter(Boolean).length === blankCount - 1) nearMiss = true;
    if (blankCount === 2) {
      if (matches[0] && !matches[1]) halfA = true;
      if (!matches[0] && matches[1]) halfB = true;
    }
  }
  const issues: { code: string; message: string }[] = [];
  if (blankCount === 2) {
    if (!halfA) {
      issues.push({
        code: "half-a",
        message:
          "(A)만 정답이고 (B)가 틀린 반쪽 정답 조합이 없음 — 한쪽 빈칸만 보고 풀리는 문항이 됨",
      });
    }
    if (!halfB) {
      issues.push({
        code: "half-b",
        message:
          "(B)만 정답이고 (A)가 틀린 반쪽 정답 조합이 없음 — 한쪽 빈칸만 보고 풀리는 문항이 됨",
      });
    }
  } else if (!nearMiss) {
    issues.push({
      code: "near-miss",
      message: `한 칸만 틀린 near-miss 조합이 없음 — ${labels.join("")} 를 전부 검증해야 풀리게 설계할 것`,
    });
  }
  return issues;
}

/**
 * KILLER 함정 강도 — 검증기 `validateKillerSummaryTrapStrength` 가 error 로
 * 발행하는 6코드를 생성 시점에 결정형으로 선반영한다. 판정 함수
 * (`sameSummarySemanticField`/`summarySemanticFamily`)를 검증기와 **공유**하므로
 * 게이트를 통과한 문항은 그 6코드를 구조적으로 낼 수 없다.
 *
 * 가드도 검증기와 동일하다 — 정답 값이 어느 의미장에도 안 잡히면(family === null)
 * 검증기가 검사 자체를 건너뛰므로 게이트도 건너뛴다. 여기서 축이 갈라지면 fast 는
 * 통과시키는 문항을 md 만 반려하는 회귀가 난다.
 */
function killerTrapIssues(q: MdSummaryMcQuestion, answerValues: string[]): string[] {
  const [answerA, answerB] = answerValues;
  if (!answerA || !answerB) return [];
  const wrong = q.options.filter((o) => o.label !== q.answer);
  const keyA = summaryMcCmp(answerA);
  const keyB = summaryMcCmp(answerB);
  const issues: string[] = [];

  const aOnly = wrong.filter(
    (o) => summaryMcCmp(o.values[0]) === keyA && summaryMcCmp(o.values[1]) !== keyB,
  );
  const bOnly = wrong.filter(
    (o) => summaryMcCmp(o.values[0]) !== keyA && summaryMcCmp(o.values[1]) === keyB,
  );

  if (
    summarySemanticFamily(answerB) &&
    !aOnly.some((o) => sameSummarySemanticField(o.values[1], answerB))
  ) {
    issues.push(
      `KILLER 함정 강도 부족 — 정답 (A) '${answerA}' 와 짝지은 채로 (B) 자리만 '${answerB}' 와 같은 의미장의 다른 값으로 바꾼 오답이 없음. 가장 강한 (B) 함정을 정답 (A)에 붙일 것`,
    );
  }
  if (
    summarySemanticFamily(answerA) &&
    !bOnly.some((o) => sameSummarySemanticField(o.values[0], answerA))
  ) {
    issues.push(
      `KILLER 함정 강도 부족 — 정답 (B) '${answerB}' 와 짝지은 채로 (A) 자리만 '${answerA}' 와 같은 의미장의 다른 값으로 바꾼 오답이 없음. 가장 강한 (A) 함정을 정답 (B)에 붙일 것`,
    );
  }
  return issues;
}

/**
 * 0원 결정형 게이트 — 빈 배열이면 클린.
 *
 * ⚠ 차단 예산 배분(적대검수 #3·#4): 게이트가 반려하면 재생성 1회 → 실패 + 크레딧
 * 환불이다. 그 예산은 **검증기가 실제로 error 로 차단하는 결함**에만 쓴다.
 *  · `summary-mc-missing-half-correct-traps` / `-missing-all-but-one-trap` 은
 *    SHIP_FIRST 강등(core.ts:61) 또는 애초에 warning 이라 fast 레인에서는 정상
 *    출하된다. md 가 이걸 하드 반려하면 "fast 로는 나오던 문항이 md 승차 후 안
 *    나온다"는 회귀가 된다 → BASIC/INTERMEDIATE 에서는 비차단 권고로 내린다
 *    (summaryMcGateAdvisories).
 *  · 반대로 KILLER 함정 강도 코드(summary-mc-killer-weak-a/b-trap ·
 *    buried-a/b-trap · too-easy-a/b-column)는 SHIP_FIRST 밖 = 진짜 차단급인데
 *    게이트가 비어 있었다. 비운 예산을 그쪽에 옮겨 담는다.
 */
export function gateMdSummaryMc(
  q: MdSummaryMcQuestion,
  passage: string,
  options?: SummaryMcGateOptions,
): string[] {
  const blankCount = options?.blankCount ?? 2;
  const optionCount = options?.optionCount ?? SUMMARY_MC_MD_OPTION_COUNT;
  const requireWrong = options?.requireWrong !== false;
  const labels = summaryMcMdLabels(blankCount);
  const v: string[] = [];

  // #1 요약문 — 없으면 이후 검사가 전부 무의미하다.
  if (!q.summary) return ["요약문 누락 — '요약문:' 줄이 없거나 비어 있음"];

  // #2 선지 개수 — 어긋나면 조합 구조 검사가 전부 무의미하다.
  if (q.options.length !== optionCount) {
    return [
      `선지 ${q.options.length}개 (${optionCount}개 필요) — 각 줄은 '① 값1 …… 값2' 형식이어야 함`,
    ];
  }

  // ── 요약문 검사 ──────────────────────────────────────────────────────────
  // #3 라벨 개수·순서. 등장 순서가 (A)(B)… 가 아니면 학생이 읽는 순서와 선지
  //    열 순서가 어긋난다(선지의 i번째 값은 i번째 라벨의 값이라는 계약).
  const sequence = summaryMcLabelSequence(q.summary);
  if (sequence.join("") !== labels.join("")) {
    const extra = sequence.filter((l) => !labels.includes(l));
    if (extra.length > 0) {
      v.push(
        `요약문에 설정 범위 밖 빈칸 라벨 ${[...new Set(extra)].join("")} 가 있음 — ${labels.join("")} 만 써야 함`,
      );
    } else {
      v.push(
        `요약문 빈칸 라벨이 ${labels.join("")} 순서로 각 1회가 아님 — 실제 ${sequence.join("") || "없음"}`,
      );
    }
  }
  for (const label of SUMMARY_MC_ALL_LABELS) {
    if (!labels.includes(label)) continue;
    const count = sequence.filter((l) => l === label).length;
    if (count !== 1) v.push(`요약문에 ${label} 가 ${count}회 등장 (정확히 1회 필요)`);
  }

  // #4 요약문 언어 — 학생 표면은 영어 한 문장이다.
  if (HANGUL_RE.test(q.summary)) v.push("요약문에 한국어가 섞임 — 영어 한 문장이어야 함");
  if (!LATIN_RE.test(stripSummaryMcMarkers(q.summary))) {
    v.push("요약문에 영어 본문이 없음");
  }

  // #5 절단·다문장 검출.
  const tail = q.summary.replace(/["'”’)\]\s]+$/g, "");
  if (tail && !/[.!?]$/.test(tail)) {
    v.push(
      `요약문이 문장 종결 부호 없이 끝남("...${tail.slice(-25)}") — 생성이 잘린 요약문`,
    );
  }
  if (sentenceEndCount(q.summary) > 1) {
    v.push("요약문이 두 문장 이상 — 한 문장으로 압축해야 함");
  }

  // #6 분량 — 한 문장 압축의 상식 범위.
  const summaryWords = words(stripSummaryMcMarkers(q.summary)).length;
  if (summaryWords < SUMMARY_MIN_WORDS) {
    v.push(`요약문이 ${summaryWords}단어로 너무 짧음 (${SUMMARY_MIN_WORDS}단어 이상 필요)`);
  } else if (summaryWords > SUMMARY_MAX_WORDS) {
    v.push(`요약문이 ${summaryWords}단어로 너무 김 (${SUMMARY_MAX_WORDS}단어 이하)`);
  }

  // #7 지문 복사 — 이 유형의 정체성(압축 재진술)을 지키는 핵심 게이트.
  const copied = findCopiedRun(q.summary, passage);
  if (copied) {
    v.push(
      `요약문이 지문을 연속 ${COPY_NGRAM}단어 이상 그대로 옮김("${copied}") — 재진술로 다시 쓸 것`,
    );
  }

  // ── 선지(조합) 검사 ──────────────────────────────────────────────────────
  const expectedLabels = ["①", "②", "③", "④", "⑤"].slice(0, optionCount);
  if (q.options.map((o) => o.label).join("") !== expectedLabels.join("")) {
    v.push(
      `선지 번호가 ${expectedLabels.join("")} 순서가 아님 — 실제 ${q.options.map((o) => o.label).join("") || "없음"}`,
    );
  }

  let shapeOk = true;
  for (const option of q.options) {
    if (option.values.length !== blankCount) {
      shapeOk = false;
      v.push(
        `${option.label} 값 ${option.values.length}개 (${blankCount}개 필요) — ' …… ' 로 ${blankCount}개를 연결할 것`,
      );
      continue;
    }
    option.values.forEach((value, i) => {
      const label = labels[i];
      if (!value.trim()) {
        shapeOk = false;
        v.push(`${option.label} ${label} 값이 비어 있음`);
        return;
      }
      if (HANGUL_RE.test(value)) {
        v.push(`${option.label} ${label} 값에 한국어가 섞임: '${value.slice(0, 30)}'`);
      } else if (!LATIN_RE.test(value)) {
        v.push(`${option.label} ${label} 값이 영어가 아님: '${value.slice(0, 30)}'`);
      }
      if (/[(（]\s*[A-Da-d]\s*[)）]/.test(value)) {
        v.push(`${option.label} ${label} 값에 빈칸 라벨이 붙어 있음: '${value.slice(0, 30)}'`);
      }
      // 표 셀 잔재 — 관용이 반쪽만 새면 '| untrained' 같은 오염 정답이 게이트·
      // 검증기·표시 계층을 전부 통과해 인쇄된다(적대검수 F1). 자리를 지목해 둔다.
      if (/\|/.test(value)) {
        v.push(
          `${option.label} ${label} 값에 표 구분자 '|' 가 남아 있음: '${value.slice(0, 30)}' — 값만 적을 것`,
        );
      }
      // 모델이 붙인 값 라벨이 그 열의 라벨과 다르면 열이 뒤집힌 것이다. 스냅이
      // 확실한 경우(전 값 라벨·중복 없음)는 이미 재정렬했으므로, 여기 남는 것은
      // 부분 라벨·중복 라벨 같은 애매한 행뿐이다 — 조용히 버리지 않고 지목한다.
      const declared = option.valueLabels?.[i];
      if (declared && declared !== label) {
        v.push(
          `${option.label} ${i + 1}번째 값의 라벨이 ${declared} — 그 자리는 ${label} 값이어야 함`,
        );
      }
      const wordCount = words(value).length;
      if (wordCount > VALUE_MAX_WORDS) {
        v.push(
          `${option.label} ${label} 값이 ${wordCount}단어로 김 (${VALUE_MAX_WORDS}단어 이하): '${value.slice(0, 40)}'`,
        );
      }
    });
  }

  if (shapeOk) {
    // #8 열 병렬·열 다양성 — 열(빈칸)이 실제로 변별에 쓰이는지 검사한다.
    for (let i = 0; i < blankCount; i += 1) {
      const column = q.options.map((o) => o.values[i] ?? "");
      const distinct = new Set(column.map((value) => summaryMcCmp(value)));
      if (distinct.size < 2) {
        v.push(
          `${labels[i]} 열의 값이 전부 동일('${column[0]?.slice(0, 30) ?? ""}') — 그 빈칸을 묻지 않는 문항이 됨`,
        );
      }
      const lengths = column.map((value) => words(value).length);
      const spread = Math.max(...lengths) - Math.min(...lengths);
      if (spread > COLUMN_WORD_SPREAD_MAX) {
        v.push(
          `${labels[i]} 열의 값 길이 편차가 ${spread}단어 — 열 병렬 위반(±${COLUMN_WORD_SPREAD_MAX}단어 이내)`,
        );
      }
    }

    // #9 조합 중복 — 정답과 동일한 오답은 문항을 무효로 만든다.
    const byCombo = new Map<string, string[]>();
    for (const option of q.options) {
      const key = option.values.map((value) => summaryMcCmp(value)).join("");
      byCombo.set(key, [...(byCombo.get(key) ?? []), option.label]);
    }
    for (const group of byCombo.values()) {
      if (group.length < 2) continue;
      if (q.answer && group.includes(q.answer)) {
        v.push(
          `${group.filter((l) => l !== q.answer).join("")} 조합이 정답 ${q.answer} 조합과 완전히 동일`,
        );
      } else {
        v.push(`조합 중복: ${group.join("")} 가 같은 값 조합`);
      }
    }
  }

  // ── 정답 축 ──────────────────────────────────────────────────────────────
  if (!q.answer) {
    v.push("정답 누락 — '정답: ①' 형식의 줄이 필요함");
  } else if (!q.options.some((o) => o.label === q.answer)) {
    v.push(`정답 라벨(${q.answer})이 선지에 없음`);
  } else if (shapeOk) {
    const answerValues = summaryMcAnswerValues(q);
    const answerKeys = answerValues.map((value) => summaryMcCmp(value));

    // #10 정답 노출 — 요약문에 정답 값이 그대로 있으면 빈칸이 무의미해진다
    //     (검증기 summary-mc-answer-leaks-in-summary 선반영).
    const summaryKey = summaryMcCmp(stripSummaryMcMarkers(q.summary));
    answerKeys.forEach((key, i) => {
      if (key.length >= 4 && summaryKey.includes(key)) {
        v.push(
          `${labels[i]} 정답 값('${answerValues[i]}')이 요약문에 그대로 노출됨 — 빈칸이 무의미해짐`,
        );
      }
    });

    // #11·#12 함정 구조(반쪽 정답·near-miss)와 KILLER 함정 강도는 **전 난이도
    //     비차단**(summaryMcGateAdvisories) — 26-08-22 기출 전수 실측으로 차단
    //     해제했다. 수능·평가원·학평 요약문 156문항을 KILLER 설정으로 넣으면
    //     함정계가 84.6%(수능 본시험만도 81.3%)를 반려한다. 기출 조합 분포는
    //     「반쪽 정답 둘 다」 17.3% / A쪽만 59.6% / B쪽만 6.4% / 없음 16.7% —
    //     평가원 정형은 (A)열 중복·(B)열 전부 다름이라 이 게이트의 요구 구조
    //     자체가 기출과 다르다. "한쪽만이라도"(16.7% 오반려)·"값 공유 ≥1"
    //     (16.7% 오반려)로 완화해도 0% 오반려가 불가능하므로, 캠페인 배선 기준
    //     (기출 오탐 0%만 차단 자격)에 따라 권고로 강등한다.
  }

  // ── 해설 축 ──────────────────────────────────────────────────────────────
  if (!q.explanation) v.push("해설 누락");

  const wrongNeeded = optionCount - 1;
  if (requireWrong && q.wrong.length !== wrongNeeded) {
    v.push(
      `오답해설 ${q.wrong.length}개 (${wrongNeeded}개 필요) — 정답 번호를 제외한 모든 선지에 1줄씩`,
    );
  }
  if (q.answer && q.wrong.some((w) => w.label === q.answer)) {
    v.push("오답해설에 정답 라벨 포함");
  }

  return v;
}

/**
 * **비차단 권고** — 게이트가 반려하지 않고 잡 result 에만 남기는 항목.
 * 함정 구조(반쪽 정답·near-miss)는 전 난이도, KILLER 함정 강도는 KILLER 에서
 * 여기로 온다 — 26-08-22 기출 실측(수능 본시험 81.3% 오반려, 위 #11·#12 주석)
 * 으로 차단에서 강등했다. 반려하면 재생성 1회 후 크레딧 환불이라, 기출조차
 * 지키지 않는 구조 취향에 그 예산을 쓰지 않는다(적대검수 #4와 같은 원칙).
 *
 * gateMdSummaryMc 가 이미 반려한 문항에는 호출할 필요가 없다(레인이 순서 보장).
 */
export function summaryMcGateAdvisories(
  q: MdSummaryMcQuestion,
  options?: SummaryMcGateOptions,
): string[] {
  const blankCount = options?.blankCount ?? 2;
  const difficulty = options?.difficulty ?? "KILLER";
  if (!q.answer || !q.options.some((o) => o.label === q.answer)) return [];
  if (q.options.some((o) => o.values.length !== blankCount)) return [];
  const answerValues = summaryMcAnswerValues(q);
  const answerKeys = answerValues.map((value) => summaryMcCmp(value));
  const out = summaryMcTrapStructure(q, answerKeys, blankCount).map(
    (issue) => `참고(비차단): ${issue.message}`,
  );
  if (difficulty.toUpperCase() === "KILLER" && blankCount === 2) {
    out.push(
      ...killerTrapIssues(q, answerValues).map((m) => `참고(비차단): ${m}`),
    );
  }
  return out;
}
