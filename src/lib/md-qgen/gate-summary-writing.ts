// ============================================================================
// 요약문 영작(SUMMARY_WRITING) 0원 결정형 게이트.
// 견본: gate-combo.ts · gate-summary-mc.ts / 파서: ./parser-summary-writing.ts
// 결정형 파생(미끼 = 잔여 칩)은 snap-summary-writing.ts 로 분리(500줄 분할 조항) —
// 게이트와 어댑터가 **같은 파생 함수 하나**를 부르는 관계는 그대로다.
//
// 설계 원칙:
//  · md 라우트는 validateQuestionQuality 를 **차단하지 않고 기록만** 한다. 그러나
//    fast 폴백 경로에서는 아래 코드들이 실제로 문항을 죽인다(RELAXED_BLOCKING).
//    따라서 정본 검증기(validators/summary/writing.ts)의 불변식을 **같은 알고리즘으로**
//    md 게이트에 이식해, 결함이 저장되기 전에 재생성으로 되돌린다.
//  · 조립 가능성 검사는 정본 함수(findUnbuildableWordBankBlanks)를 **그대로 호출**한다
//    — 재구현하면 판정이 갈라져 "게이트는 통과했는데 검증기는 error" 가 난다.
//  · 미끼(wordBankDistractors)는 받지 않고 파생한다. 보기 칩 중 어느 정답에도 소비되지
//    않는 칩이 정의상 미끼다. 자기신고 목록은 거짓말이 가능하지만 잔여 파생은 불가능하다.
// ============================================================================

import {
  answerRunInPassage,
  containsHangul,
  containsLatinLetter,
  countLiteral,
  summaryWritingComparableTokens,
} from "@/lib/question-quality/core";
import {
  collectWordBankBuildBlanks,
  findUnbuildableWordBankBlanks,
  summaryWritingWordTokens,
} from "@/lib/question-quality/validators/summary/writing";
import { normalizeWs } from "./parser";
import {
  chipsFollowAnswerOrder,
  deriveSummaryWritingDistractors,
} from "./snap-summary-writing";
import {
  SUMMARY_WRITING_SECTION_KEYWORDS,
  stripSummaryWritingLabels,
  summaryWritingAnswerTokens,
  summaryWritingLabelSequence,
  summaryWritingMdModelAnswer,
  summaryWritingRenderedLabels,
  type MdSummaryWritingQuestion,
} from "./parser-summary-writing";
import {
  summaryWritingDistractorNeed,
  summaryWritingMdLabels,
} from "./prompts-summary-writing";

export interface SummaryWritingGateOptions {
  blankCount: number;
  glossEnabled: boolean;
  wordBankEnabled: boolean;
  wordBankUsage: "useAll" | "usePartial" | "freeCount";
  boxDistractors: number;
  targetWordsMode: "exact" | "approx" | "hidden";
  targetWordsPerBlank: number;
  /** scoringGranularity === "rubric" — 루브릭 채점은 사람이 읽으므로 기준이 필수. */
  requireCriteria: boolean;
  /**
   * scoringGranularity === "keyword"(= scoringMode LEMMA) — 이때만 requiredLemmas 가
   * 실제로 채점기에 읽힌다(grade.ts:52 는 LEMMA 가 아니면 표제어를 보지도 않는다).
   * exact(VARIANTS)·rubric(MANUAL_ONLY)에서까지 필수화하면 **읽히지도 않는 필드**
   * 하나로 문항 전체가 반려된다(실측 major · 규범 §1-B 철칙 1의 중복 계약).
   */
  requireLemmas: boolean;
}

// ── 설정 집행(0원 절삭) ──────────────────────────────────────────────────────

/**
 * 교사 설정이 끄라고 한 상자를 모델이 그래도 냈을 때 **반려 대신 절삭**한다.
 * 반려하면 정상 문항이 재생성 비용을 물지만, 절삭은 발문(결정론 합성)과의 정합을
 * 오히려 회복시킨다. 조용히 버리지 않도록 corrections 에 남긴다(규범 §1-B 철칙 3·4).
 */
export function enforceSummaryWritingSettings(
  q: MdSummaryWritingQuestion,
  opts: Pick<SummaryWritingGateOptions, "glossEnabled" | "wordBankEnabled">,
): { question: MdSummaryWritingQuestion; corrections: string[] } {
  const corrections: string[] = [];
  let gloss = q.gloss;
  let chips = q.chips;
  if (!opts.glossEnabled && gloss) {
    corrections.push("교사 설정이 [해석] 미제공이라 해석 줄을 절삭");
    gloss = "";
  }
  if (!opts.wordBankEnabled && chips.length > 0) {
    corrections.push("교사 설정이 [보기] 미제공이라 보기 칩을 절삭");
    chips = [];
  }
  return { question: { ...q, gloss, chips }, corrections };
}

// ── 게이트 ───────────────────────────────────────────────────────────────────

function wordCount(value: string): number {
  return (value.match(/[A-Za-z]+(?:[-'][A-Za-z]+)*/g) ?? []).length;
}

/**
 * 요약문 값에 삼켜진 섹션 줄(괄호 없는 라벨 드리프트 포함)을 지목하기 위한 탐지기.
 * 키워드 목록은 파서와 **같은 정본**을 쓴다(목록이 갈리면 파서가 못 끊은 자리를 게이트도
 * 못 본다). 공용 keywordLineRe 를 쓰지 않는 이유: 저건 줄 **머리** 정규식(`^` 고정)인데
 * 여기서 찾는 것은 요약문 **한 줄 안에 섞여 든** 섹션 줄이다(`… bias. 정답 A: …`).
 * 대신 콜론 앞뒤 강조는 같은 계통으로 흡수한다 — `**정답**:` 를 놓치면 게이트가 자리를
 * 못 짚고 "빈칸 0개" 같은 **사실과 다른 원인**만 재생성 피드백으로 나간다(철칙 3·5).
 */
const STRAY_DECO = String.raw`[ \t*_~\x60]*`;
const STRAY_SECTION_LINE_RE = new RegExp(
  String.raw`(?:${SUMMARY_WRITING_SECTION_KEYWORDS.join("|")})${STRAY_DECO}(?:[（([]?${STRAY_DECO}[A-Za-z]${STRAY_DECO}[)）\]]?)?${STRAY_DECO}[:：]`,
);

/**
 * 그 키워드 줄이 **텍스트에 있기는 했는가**(파서가 값을 못 읽었을 뿐인가).
 * "누락" 과 "줄은 있는데 값을 못 읽음" 은 모델이 해야 할 일이 전혀 다르다. 없는 줄을
 * "누락" 이라 하면 맞지만, 있는 줄을 "누락" 이라 하면 모델은 이미 쓴 줄을 또 쓰고
 * 같은 자리에서 두 번째 반려를 맞는다 — 그 문구가 그대로 재생성 피드백이다(철칙 3·5).
 */
function sawHead(q: MdSummaryWritingQuestion, keyword: string): boolean {
  return Array.isArray(q.headsSeen) && q.headsSeen.includes(keyword);
}

/** 정본 writing-answer-verbatim-copy 와 동일 임계(내용토큰 6+ 且 80%+ 연속 런). */
function verbatimCopyRun(phrase: string, passage: string): string {
  const tokens = summaryWritingComparableTokens(phrase);
  if (tokens.length < 6) return "";
  return answerRunInPassage(
    phrase,
    passage,
    Math.max(6, Math.ceil(tokens.length * 0.8)),
  );
}

/** 정본 sw-answer-not-in-summary 와 동일(정답의 연속 2토큰+ 가 요약문에 통째). */
function summaryLeakPhrase(answer: string, summary: string): string {
  const summaryTokens = summaryWritingComparableTokens(
    summary.replace(/\([A-Z]\)/g, " "),
  );
  if (summaryTokens.length === 0) return "";
  const sequence = ` ${summaryTokens.join(" ")} `;
  const phraseTokens = summaryWritingComparableTokens(answer);
  if (phraseTokens.length < 2) return "";
  const phrase = phraseTokens.join(" ");
  return sequence.includes(` ${phrase} `) ? phrase : "";
}

function gateBlankShape(
  q: MdSummaryWritingQuestion,
  opts: SummaryWritingGateOptions,
  v: string[],
): void {
  const seen = new Set<string>();
  for (const blank of q.blanks) {
    if (!blank.answer) {
      v.push(`정답${blank.label} 줄을 인식할 수 없음(받은 값: '')`);
      continue;
    }
    if (containsHangul(blank.answer) || !containsLatinLetter(blank.answer)) {
      v.push(`정답${blank.label} 이 영어 어구가 아님: '${blank.answer.slice(0, 40)}'`);
    }
    const words = wordCount(blank.answer);
    if (words < 2) {
      v.push(
        `정답${blank.label} 이 ${words}단어 — 이 유형은 다단어 어구가 정답이어야 함: '${blank.answer.slice(0, 40)}'`,
      );
    }
    if (opts.targetWordsMode === "exact" && words !== opts.targetWordsPerBlank) {
      v.push(
        `정답${blank.label} 이 ${words}단어 — 발문이 정확히 ${opts.targetWordsPerBlank}단어를 요구함`,
      );
    } else if (
      opts.targetWordsMode === "approx" &&
      Math.abs(words - opts.targetWordsPerBlank) > 2
    ) {
      v.push(
        `정답${blank.label} 이 ${words}단어 — 발문이 약 ${opts.targetWordsPerBlank}단어(허용 ${Math.max(2, opts.targetWordsPerBlank - 2)}~${opts.targetWordsPerBlank + 2})를 안내함`,
      );
    }
    const key = normalizeWs(blank.answer).toLowerCase();
    if (seen.has(key)) v.push(`정답${blank.label} 이 다른 빈칸 정답과 동일`);
    seen.add(key);

    if (blank.lemmas.length === 0) {
      if (opts.requireLemmas) {
        v.push(`핵심어${blank.label} 누락 — 부분점수 채점 근거가 없음`);
      }
    } else {
      // 채점기(grade.ts:58)는 학생 답의 단어 토큰 집합에 표제어가 **정확히** 있는지만
      // 본다. 정답에 없는 형태를 표제어로 두면 어떤 학생도 그 조건을 만족할 수 없다.
      const surface = new Set([
        ...summaryWritingAnswerTokens(blank.answer),
        ...blank.variants.flatMap((variant) => summaryWritingAnswerTokens(variant)),
      ]);
      const orphan = blank.lemmas.find((lemma) => !surface.has(lemma));
      if (orphan) {
        v.push(
          `핵심어${blank.label} '${orphan}' 가 정답 어구에 없는 형태 — 채점기가 학생 답 토큰과 정확 대조하므로 정답에 실제로 등장하는 형태로 적어야 함`,
        );
      }
    }
    // 동치도 "그 빈칸의 완전한 대체 정답" 이다. 조각이 섞이면 그 조각이 만점 정답
    // 집합에 실려 반쪽만 쓴 학생이 CORRECT 를 받는다(쉼표 분해 사고의 2차 방어선).
    for (const variant of blank.variants) {
      if (containsHangul(variant) || !containsLatinLetter(variant)) {
        v.push(`동치${blank.label} 항목이 영어가 아님: '${variant.slice(0, 40)}'`);
        break;
      }
    }
    const answerWords = wordCount(blank.answer);
    const fragment = blank.variants.find((variant) => {
      const n = wordCount(variant);
      return n < 2 || n * 2 < answerWords;
    });
    if (fragment) {
      v.push(
        `동치${blank.label} 항목 '${fragment.slice(0, 40)}' 이 ${wordCount(fragment)}단어 — 정답(${answerWords}단어)의 완전한 대체 정답이 아니라 조각으로 보임. 동치는 한 줄에 하나씩 쓰고 쉼표로 이어 쓰지 마라`,
      );
    }
  }
}

function gateWordBank(
  q: MdSummaryWritingQuestion,
  opts: SummaryWritingGateOptions,
  v: string[],
): void {
  if (!opts.wordBankEnabled) return;
  if (q.chips.length < 2) {
    v.push(
      q.chips.length === 0 && sawHead(q, "보기")
        ? "`보기:` 줄은 있으나 칩을 하나도 읽지 못함 — 칩은 `보기: 칩1 / 칩2 / 칩3` 처럼 ` / ` 로 이어 쓰라"
        : `보기 칩 ${q.chips.length}개 — 교사 설정이 [보기] 제공이므로 최소 2개가 필요함(발문이 [보기]를 지시함)`,
    );
    return;
  }

  // 한 칩이 다단어 정답을 통째로 담으면 정답 노출(sw-wordbank-answer-coverage 동형).
  const deobf = (value: string) =>
    normalizeWs(value).toLowerCase().replace(/_+/g, "").replace(/\s+/g, " ").trim();
  const chipsNorm = q.chips.map(deobf).filter(Boolean);
  for (const blank of q.blanks) {
    const answer = deobf(blank.answer);
    if (answer.split(" ").filter(Boolean).length < 2) continue;
    if (chipsNorm.some((chip) => chip === answer || chip.includes(answer))) {
      v.push(
        `보기 칩 하나가 정답${blank.label} 어구를 통째로 담고 있음 — 정답이 그대로 노출됨`,
      );
      break;
    }
  }

  // 조립 가능성 — 정본 알고리즘 그대로 호출(판정 갈림 방지).
  const buildBlanks = collectWordBankBuildBlanks(
    q.blanks.map((blank) => ({
      label: blank.label,
      answer: blank.answer,
      acceptableVariants: blank.variants,
    })),
  );
  if (buildBlanks.length > 0) {
    for (const defect of findUnbuildableWordBankBlanks(q.chips, buildBlanks)) {
      v.push(
        `보기 칩으로 ${defect.label} 정답 조립 불가 — 부족 토큰 ${defect.missing
          .map((t) => `"${t}"`)
          .join(", ")}`,
      );
    }
  }

  // 보기 나열이 정답 어순 그대로면 어순을 무료로 누설(스냅이 실패했을 때만 남는다).
  if (chipsFollowAnswerOrder(q.chips, q.blanks.map((b) => b.answer).join(" "))) {
    v.push("보기 칩 나열이 정답 어순 그대로 — 어순이 무료로 노출됨");
  }

  // 칩에 불릿·번호 잔재가 있으면 학생 화면에 그대로 나간다(파서 흡수 실패의 최종 방어).
  const residue = q.chips.find(
    (chip) => /(^|\s)[-*•](\s|$)/.test(chip) || /^\d+[.)]/.test(chip),
  );
  if (residue) {
    v.push(
      `보기 칩에 불릿·번호 잔재가 있음: '${residue}' — 칩은 \` / \` 로만 구분하고 목록 기호를 붙이지 마라`,
    );
  }
  // 칩은 단어·짧은 덩어리다. 콜론이 든 칩은 `보기:` 블록에 섞여 들어온 라벨 줄
  // (`Note: ...` 류)이 칩으로 굳은 것이다 — 학생 [보기] 상자에 그대로 나가므로 지목한다.
  const labelish = q.chips.find((chip) => /[:：]/.test(chip));
  if (labelish) {
    v.push(
      `보기 칩에 라벨성 문자열이 섞임: '${labelish}' — \`보기:\` 블록에는 칩만 쓰고 메모·설명 줄을 붙이지 마라`,
    );
  }

  // 미끼(잔여 칩) 정합 — 설정이 약속한 개수만큼 실제로 안 쓰이는 칩이 있어야 한다.
  const leftover = deriveSummaryWritingDistractors(q.chips, q.blanks);
  if (opts.wordBankUsage === "useAll" && leftover.length > 0) {
    v.push(
      `보기에 정답에 쓰이지 않는 칩이 ${leftover.length}개 남음(useAll 은 전량 사용이 계약) — 잔여 칩: ${leftover
        .map((c) => `'${c}'`)
        .join(", ")}`,
    );
  }
  // ⚠ boxDistractors 는 난이도 프리셋을 타지 않는 숫자 노브라 **기본값이 0** 이다
  //   (NumericSettingSpec.defaultValue=0). 이 값을 그대로 요구하면 "미끼 0개" 를
  //   명령한 뒤 그 결과를 반려하는 결정론적 실패가 된다 — usePartial 은 정의상
  //   "안 쓰는 칩이 있다" 는 계약이므로 최소 1개를 요구한다(프롬프트와 대칭).
  if (opts.wordBankUsage === "usePartial") {
    // 요구 개수는 프롬프트와 **같은 함수**로 뽑는다 — 두 곳에서 따로 계산하면 언젠가
    // 갈라져 "프롬프트가 시킨 개수를 게이트가 반려" 하는 결정론적 실패가 돌아온다.
    const need = summaryWritingDistractorNeed({ boxDistractors: opts.boxDistractors });
    if (leftover.length < need) {
      v.push(
        `보기에 미끼 칩이 ${leftover.length}개 — usePartial 은 어느 정답에도 안 쓰이는 칩이 최소 ${need}개 필요함. 정답 단어의 동의어·활용형·역방향 단어를 ${need - leftover.length}개 더 넣어라`,
      );
    }
  }

  // 해석 + 미끼 0 + 칩 전부 정답 소속 → 영작이 받아쓰기로 전락(sw-gloss-answer-leak 동형).
  if (
    q.gloss &&
    opts.wordBankUsage === "usePartial" &&
    leftover.length === 0 &&
    q.blanks.some((blank) => summaryWritingWordTokens(blank.answer).length >= 2)
  ) {
    v.push("[해석]이 있는데 보기 칩 전부가 정답 단어 — 단어와 내용이 동시에 노출되어 받아쓰기가 됨");
  }
}

/** 0원 결정형 게이트 — 빈 배열이면 클린. */
export function gateMdSummaryWriting(
  q: MdSummaryWritingQuestion,
  passage: string,
  opts: SummaryWritingGateOptions,
): string[] {
  const v: string[] = [];
  const expected = summaryWritingMdLabels(opts.blankCount);

  // #1 개수·라벨 축 — 어긋나면 이후 검사가 전부 무의미하므로 즉시 반려.
  if (q.blanks.length !== expected.length) {
    return [
      `빈칸 정답 ${q.blanks.length}개 (${expected.length}개 필요) — 인식된 라벨: ${
        q.blanks.map((b) => b.label).join("") || "없음"
      } / 필요: ${expected.join("")}`,
    ];
  }
  if (q.blanks.map((b) => b.label).join("") !== expected.join("")) {
    return [
      `정답 라벨이 ${expected.join("")} 이 아님 — 실제 ${q.blanks.map((b) => b.label).join("")}`,
    ];
  }

  // #2 요약문 — 학생 표면의 본체. 라벨은 각 정확히 1회.
  if (!q.summary) {
    v.push(
      sawHead(q, "요약문")
        ? "`요약문:` 줄은 있으나 값을 읽지 못함 — 요약문 한 문장을 **같은 줄에** 이어서 쓰고, 그 줄에 다른 라벨(`정답:` 등)을 섞지 마라"
        : "요약문 누락",
    );
  } else {
    for (const label of expected) {
      const n = countLiteral(q.summary, label);
      if (n !== 1) v.push(`요약문에 ${label} 가 ${n}회 — 정확히 1회여야 함`);
    }
    const sequence = summaryWritingLabelSequence(q.summary);
    // 학생 렌더가 마스킹하는 축(반각 괄호·대문자)까지 함께 훑는다 — (D) 처럼 빈칸 축
    // 밖 라벨은 파서가 그 정답 줄을 버리므로, 여기서 안 잡으면 **채점되지 않는 빈칸**이
    // 학생 화면에 그대로 나간다(게이트 클린으로 출하된 실측).
    const extra = [
      ...new Set([...sequence, ...summaryWritingRenderedLabels(q.summary)]),
    ].filter((label) => !expected.includes(label));
    if (extra.length > 0) {
      v.push(
        `요약문에 설정 범위 밖 라벨: ${extra.join("")} — 이 자리는 정답 줄이 없어 학생 화면에 채점되지 않는 빈칸으로 렌더된다. 라벨은 ${expected.join("")} 만 쓰라`,
      );
    }
    const ordered = sequence.filter((label) => expected.includes(label));
    if (
      ordered.length === expected.length &&
      ordered.join("") !== expected.join("")
    ) {
      v.push(`요약문 라벨 등장 순서가 ${expected.join("")} 이 아님 — 실제 ${ordered.join("")}`);
    }
    const bare = stripSummaryWritingLabels(q.summary);
    if (containsHangul(bare) || !containsLatinLetter(bare)) {
      v.push("요약문이 영어 문장이 아님");
    }
    // 파서가 흡수하지 못한 라벨 드리프트(`정답 A:` 등)는 요약문 값에 삼켜진다.
    // 그대로 두면 게이트가 "빈칸 0개" 라는 **엉뚱한 원인**만 말하고, 그 문구가 그대로
    // [반려 재생성] 피드백이 된다 — 자리를 지목한다(§1-B 철칙 3·5).
    const stray = STRAY_SECTION_LINE_RE.exec(q.summary);
    if (stray) {
      v.push(
        `요약문에 다른 섹션 줄이 섞여 있음: '${stray[0]}' — 그 줄을 독립된 줄로 분리하고 라벨은 반드시 괄호 대문자 '(A)' 형식으로 쓰세요`,
      );
    }
    if (/_{3,}/.test(q.summary)) {
      v.push("요약문에 밑줄(____)이 남아 있음 — 빈칸 표시는 라벨만 쓰고 밑줄은 표시 계층이 붙임");
    }
    if (wordCount(bare) < 6) {
      v.push(`요약문이 ${wordCount(bare)}단어 — 글 전체를 압축한 한 문장이어야 함`);
    }
  }

  // #3 빈칸 형상 — 정답·핵심어·동치.
  gateBlankShape(q, opts, v);

  // #4 정답 누수 — 정답 어구가 학생에게 보이는 요약문에 이미 적혀 있으면 무효.
  if (q.summary) {
    for (const blank of q.blanks) {
      const leaked = summaryLeakPhrase(blank.answer, q.summary);
      if (leaked) {
        v.push(
          `정답${blank.label} 어구가 요약문에 통째로 노출됨: "${leaked}" — 빈칸에는 라벨만 두세요`,
        );
        break;
      }
    }
  }

  // #5 지문 축자 복사 — 영작형은 지문이 문항과 함께 보이므로 베껴쓰기 과제가 된다.
  // 정본 writing-answer-verbatim-copy(RELAXED_BLOCKING) 와 동일 임계.
  if (passage) {
    const phrases = [
      summaryWritingMdModelAnswer(q),
      ...q.blanks.map((blank) => blank.answer),
    ].filter(Boolean);
    for (const phrase of phrases) {
      const run = verbatimCopyRun(phrase, passage);
      if (run) {
        v.push(
          `모범답안이 지문 문장의 통째 복사입니다: "${run}". 시제/태/구문 전환을 최소 1개 넣어 상위 층위로 다시 설계하라.`,
        );
        break;
      }
    }
  }

  // #6 해석 — 발문이 [해석]을 지시하면 반드시 있어야 한다(sw-direction-wordbank-mismatch).
  if (opts.glossEnabled) {
    if (!q.gloss) {
      v.push(
        sawHead(q, "해석")
          ? "`해석:` 줄은 있으나 값을 읽지 못함 — 한국어 한 문장을 **같은 줄에** 이어서 쓰라"
          : "해석 누락 — 발문이 [해석]을 참고하라고 지시하므로 반드시 필요함",
      );
    } else if (!containsHangul(q.gloss)) {
      v.push("해석이 한국어가 아님");
    }
  }

  // #7 보기 상자.
  gateWordBank(q, opts, v);

  // #8 꼬리 — 해설·채점기준.
  if (!q.explanation) {
    v.push(
      sawHead(q, "해설")
        ? "`해설:` 줄은 있으나 값을 읽지 못함 — 한국어 2문장을 **같은 줄에** 이어서 쓰라"
        : "해설 누락",
    );
  } else if (!containsHangul(q.explanation)) {
    v.push("해설이 한국어가 아님");
  }
  if (opts.requireCriteria && q.criteria.length === 0) {
    v.push(
      sawHead(q, "채점기준")
        ? "`채점기준:` 줄은 있으나 항목을 하나도 읽지 못함 — 항목은 다음 줄부터 `- 의미가 드러나면 2점` 처럼 한 줄에 하나씩 쓰고, 줄머리를 `정답`·`해설`·`보기` 같은 섹션 키워드로 시작하지 마라(콜론이 없어도 그 줄에서 블록이 끊긴다). 항목명은 `의미`·`어순`·`정확성` 처럼 채점 축으로 붙여라"
        : "채점기준 누락 — 루브릭 채점 설정이라 사람이 읽을 항목별 기준이 필요함",
    );
  }

  return v;
}
