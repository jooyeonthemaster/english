// ============================================================================
// 문법 오류 수정(GRAMMAR_CORRECTION) 0원 결정형 게이트 — LLM 콜 없음.
// parser-grammar-correction.ts 에서 분리했다(규범 "400줄에서 분할" 조항 —
// vocab·combo·order 선례). 의존 방향은 이 파일 → parser 단방향(역참조 금지).
//
// ⚠ 이 게이트가 md 레인의 **유일한** 차단 장치다. 라우트는 후처리 뒤
//   validateQuestionQuality 를 돌리지만 error 코드를 잡 result 에 기록만 하고
//   차단하지 않는다. 그래서 fast 검증기가 error 로 막는 정답시비 항목
//   (시제 단독 토글 · 수량 의미토글 · 지각동사 보어 토글 · 능수동 부정사 선호 ·
//   KILLER 얇은 표적)은 전부 여기로 **승격 이식**돼 있다.
//
// ⚠ 게이트 메시지는 반드시 "어느 라벨의 무엇이 어떻게" 를 적는다 — 이 문구가
//   그대로 [반려 재생성] 프롬프트의 피드백이 되기 때문이다(규범 §1-B 철칙 5).
//   같은 이유로 **거짓 지적을 절대 실으면 안 된다**: 사실이 아닌 사유가 피드백에
//   섞이면 모델이 멀쩡한 부분을 손대는 방향으로 재생성한다(#5 주석 참조).
// ============================================================================

import { countWordBoundaryMatches, normalizeWs, reconstructionEq } from "./parser";
import { isDisputableTenseToggle } from "@/lib/question-quality/validators/grammar/combo";
import { isThinKillerGrammarCorrectionTarget } from "@/lib/question-quality/validators/grammar/correction";
import {
  collectQuantityAnswerIssues,
  findGrammarPerceptionComplementToggle,
} from "@/lib/question-quality/validators/grammar/shared";
import {
  GRAMMAR_CORRECTION_MD_ERROR_COUNT_MAX,
  GRAMMAR_CORRECTION_MD_ERROR_COUNT_MIN,
  GRAMMAR_CORRECTION_MD_LABELS,
} from "./prompts-grammar-correction";
import {
  collectCorrectionMarks,
  deriveCorrectionSourceText,
  reconstructCorrectionPassage,
  type MdCorrectionSegment,
  type MdGrammarCorrectionQuestion,
} from "./parser-grammar-correction";

export interface CorrectionGateOptions {
  /** 교사 설정 오류(=밑줄) 개수 1~5 */
  errorCount?: number;
  /** KILLER 전용 검사 분기용 원본 난이도 문자열 */
  requestedDifficulty?: string;
}

/** 밑줄 구간 상한 — 한 문장·한 절 계약의 결정형 표현(두 문장 묶음·지문 통삼킴 차단). */
const MAX_SEGMENT_WORDS = 60;

/** 재구성 부분 대조용 센티널 — 지문에 절대 등장하지 않는 제어문자. */
const UNRESOLVED_SENTINEL = "\u0000";

function wordCount(text: string): number {
  return normalizeWs(text).split(" ").filter(Boolean).length;
}

function key(value: string): string {
  return normalizeWs(value).toLowerCase();
}


/** 한 밑줄 자리의 검사 — 자리마다 독립이라 분리해 두면 메시지가 라벨을 항상 문다. */
function gateSegment(
  segment: MdCorrectionSegment,
  passage: string,
  requestedDifficulty: string | undefined,
  v: string[],
): void {
  const { label } = segment;
  if (!segment.displayedText) {
    v.push(`${label} 밑줄 구간이 비어 있음`);
    return;
  }
  if (!segment.errorPart || !segment.correctedPart) {
    v.push(
      `${label} 고침 줄 없음 또는 형식 오류 — "고침${label}: <틀린 표현> → <올바른 표현>" 한 줄이 필요하다(받은 값: 틀린 표현 '${segment.errorPart}' · 올바른 표현 '${segment.correctedPart}')`,
    );
    return;
  }
  if (key(segment.errorPart) === key(segment.correctedPart)) {
    v.push(`${label} 틀린 표현과 올바른 표현이 같음: '${segment.errorPart}'`);
    return;
  }

  const hits = countWordBoundaryMatches(segment.displayedText, segment.errorPart);
  if (hits === 0) {
    v.push(
      `${label} 틀린 표현 '${segment.errorPart}' 이 밑줄 구간 안에 없음 — 마커 안에 실제로 적은 형태 그대로 써라`,
    );
    return;
  }
  if (hits > 1) {
    v.push(
      `${label} 틀린 표현 '${segment.errorPart}' 이 밑줄 구간에 ${hits}회 등장 — 고칠 자리가 유일하지 않으니 밑줄을 옮기거나 더 긴 표현으로 지정하라`,
    );
    return;
  }

  const sourceText = deriveCorrectionSourceText(segment);
  if (!sourceText) {
    v.push(`${label} 밑줄 구간의 원문을 복원할 수 없음`);
    return;
  }
  if (!normalizeWs(passage).includes(normalizeWs(sourceText))) {
    v.push(
      `${label} 되돌린 밑줄 구간이 지문에 축자로 없음 — 마커 안에서 바꾼 곳이 한 군데가 아니거나 원문을 고쳐 썼다: '${sourceText.slice(0, 70)}'`,
    );
  }

  // 밑줄 폭 — 오류 토큰만 밑줄 치면 답을 알려 준 것이다(fast 의
  // grammar-correction-underline-too-narrow / -underlined-segment-short 등가).
  if (key(sourceText) === key(segment.correctedPart)) {
    v.push(`${label} 밑줄이 고칠 표현 자체 — 문장 또는 절 단위로 넓혀라`);
  }
  const shownWords = wordCount(segment.displayedText);
  const needWords = Math.max(5, wordCount(segment.errorPart) + 3);
  if (shownWords < needWords) {
    v.push(
      `${label} 밑줄 구간이 너무 짧음(${shownWords}단어) — 최소 ${needWords}단어 이상의 문장·절로 넓혀 오류 자리가 드러나지 않게 하라`,
    );
  }
  if (shownWords > MAX_SEGMENT_WORDS) {
    v.push(
      `${label} 밑줄 구간이 너무 김(${shownWords}단어) — 한 문장 또는 한 절까지만 밑줄 쳐라`,
    );
  }

  // ── 정답 시비 게이트 (fast 검증기 error 승격 이식) ─────────────────────
  if (isDisputableTenseToggle(segment.correctedPart, segment.errorPart)) {
    v.push(
      `${label} 시제 단독 교체('${segment.correctedPart}' ↔ '${segment.errorPart}')는 문맥상 둘 다 성립해 복수정답 시비가 된다 — 검증된 변형(수일치·관계사·분사 능수동·형부 등)으로 바꿔라`,
    );
  }
  for (const issue of collectQuantityAnswerIssues(
    segment.correctedPart,
    segment.errorPart,
    sourceText,
  )) {
    v.push(`${label} 수량 표현 정답 시비 — ${issue.message}`);
  }
  const perception = findGrammarPerceptionComplementToggle(
    segment.correctedPart,
    segment.errorPart,
    sourceText,
    passage,
  );
  if (perception) {
    v.push(`${label} 준동사 보어 토글 — ${perception}`);
  }
  if (
    /\bto\s+(?:be\s+)?(?:gain|gained|lose|lost)\b/.test(
      `${segment.errorPart} ${segment.correctedPart}`.toLowerCase(),
    )
  ) {
    v.push(`${label} 능동·수동 부정사 선호(to gain ↔ to be gained)는 정답 자리로 쓸 수 없다`);
  }
  // ⚠ 지문이 줄 수 없는 것을 요구하지 않는다(26-07-27 실사용 과잉차단 실측).
  // 이 검사는 "12단어 이상 문장으로 밑줄을 옮겨라"고 지시하는데, 지문에 그런 문장이
  // 하나도 없으면 **도달 불가능한 요구**가 되어 1차·2차 시도가 같은 사유로 죽는다
  // (실측: KILLER 문법 오류 수정 136s 소모 후 실패, 두 시도 모두 이 사유 단독).
  // 지문이 실제로 그 길이의 문장을 제공할 때만 요구한다.
  const passageOffersLongSentence = passage
    .split(/(?<=[.!?])\s+/)
    .some((s) => s.trim().split(/\s+/).filter(Boolean).length >= 12);
  if (
    requestedDifficulty === "KILLER" &&
    passageOffersLongSentence &&
    isThinKillerGrammarCorrectionTarget({
      sourceText,
      displayedText: segment.displayedText,
      displayedError: segment.errorPart,
      sourceCorrection: segment.correctedPart,
    })
  ) {
    v.push(
      `${label} KILLER 인데 구조 하중이 없는 얇은 표적 — 관계절·삽입구·병렬·수량 주어구·도치 중 하나를 품은 12단어 이상 문장으로 밑줄을 옮겨라`,
    );
  }

  // 허용답(채점 동치 집합) — 있을 때만 검사한다(선택 계약).
  for (const accepted of segment.acceptedAnswers) {
    if (key(accepted) === key(segment.errorPart)) {
      v.push(
        `${label} 허용답에 틀린 표현 '${segment.errorPart}' 이 들어 있음 — 오답이 정답 처리된다`,
      );
    }
  }
  if (
    segment.acceptedAnswers.length > 0 &&
    !segment.acceptedAnswers.some((a) => key(a) === key(segment.correctedPart))
  ) {
    v.push(`${label} 허용답에 올바른 표현 '${segment.correctedPart}' 이 빠져 있음`);
  }
}

/**
 * 마커가 0개일 때 **어디가 문제인지** 를 지목한다.
 * "밑줄 마커 0개" 만 내보내면 모델은 '마커를 안 붙였다'는 거짓 지적을 받는다 —
 * 실제로는 붙였는데 표기(라벨 대소문자·공백·구분자)가 계약과 다른 경우가 많고,
 * 그 사실이 피드백 어디에도 없으면 재생성이 같은 표기를 반복한다(철칙 5).
 */
function markFormatHint(markedPassage: string): string | null {
  // `[[` 만 보면 절반만 짚는다 — 대괄호 한 겹·전각 괄호·꺾쇠로 마킹한 형태도
  // "마커를 안 붙였다" 는 거짓 지적을 받게 된다. 브래킷 계열을 함께 본다.
  const stray =
    markedPassage.match(/\[\[[^\n]{0,24}/) ??
    markedPassage.match(/[[【〔<]{1,2}\s*[([]?\s*[A-Ja-j]\s*[)\]]?\s*[:：][^\n]{0,20}/);
  if (!stray) return null;
  return `마커 표기가 [[A:구간]] 형식이 아님 — 발견된 형태: '${stray[0].trim()}…'`;
}

/**
 * 재구성본이 원문과 **갈라지는 첫 자리**를 지목한다.
 * "마커 밖 텍스트가 원문과 다르다" 만 던지면 모델은 지문 어디를 건드렸는지 모른 채
 * 통째로 다시 쓰고, 그 재생성이 오히려 원문을 훼손한다(철칙 5). 실제 갈라지는
 * 조각을 함께 실어야 재생성이 그 자리만 되돌릴 수 있다.
 */
function divergenceHint(reconstructed: string, passage: string): string {
  const got = normalizeWs(reconstructed);
  const want = normalizeWs(passage);
  let at = 0;
  while (at < got.length && at < want.length && got[at] === want[at]) at += 1;
  const from = Math.max(0, got.lastIndexOf(" ", at) + 1);
  const gotPiece = got.slice(from, from + 60).trim();
  const wantPiece = want.slice(from, from + 60).trim();
  if (!gotPiece && !wantPiece) return "";
  return ` — 처음 어긋나는 자리: 출력 '${gotPiece}…' · 원문 '${wantPiece}…'`;
}

/**
 * 마커 밖 텍스트만 대조하는 **축소 검사**.
 * 복원 실패 자리를 센티널로 비운 재구성본의 조각들이 원 지문에 **순서대로**
 * 실재하는지 본다. 복원에 성공한 자리는 조각 안에 그대로 들어가므로 함께 검사된다.
 */
function outsideTextMismatch(partial: string, passage: string): string | null {
  const pn = normalizeWs(passage);
  let cursor = 0;
  for (const chunk of partial.split(UNRESOLVED_SENTINEL)) {
    const piece = normalizeWs(chunk).trim();
    if (!piece) continue;
    const at = pn.indexOf(piece, cursor);
    if (at < 0) {
      // 조각 머리부터 잘라 보여 주면 정작 갈라진 자리가 화면 밖으로 밀린다 —
      // 원문에 아직 남아 있는 **최장 접두**를 이분 탐색해 그 경계를 지목한다
      // (접두가 길수록 찾힌다는 단조성이 성립하므로 이분 탐색이 유효하다).
      let lo = 0;
      let hi = piece.length;
      while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        if (pn.indexOf(piece.slice(0, mid), cursor) >= 0) lo = mid;
        else hi = mid - 1;
      }
      return piece.slice(Math.max(0, lo - 20), lo + 40).trim();
    }
    cursor = at + piece.length;
  }
  return null;
}

/** 0원 결정형 게이트 — 빈 배열이면 클린. */
export function gateMdGrammarCorrection(
  q: MdGrammarCorrectionQuestion,
  passage: string,
  options?: CorrectionGateOptions,
): string[] {
  const errorCount = Math.min(
    GRAMMAR_CORRECTION_MD_ERROR_COUNT_MAX,
    Math.max(
      GRAMMAR_CORRECTION_MD_ERROR_COUNT_MIN,
      options?.errorCount ?? q.segments.length,
    ),
  );
  const v: string[] = [];

  // #0/#1 형상 — 어긋나면 이후 검사가 전부 무의미하므로 즉시 반려.
  if (!q.markedPassage.trim()) return ["밑줄지문 누락"];
  const marks = collectCorrectionMarks(q.markedPassage);
  if (marks.length !== errorCount) {
    const issues = [`밑줄 마커 ${marks.length}개 (${errorCount}개 필요)`];
    if (marks.length === 0) {
      const hint = markFormatHint(q.markedPassage);
      if (hint) issues.push(hint);
    }
    return issues;
  }
  if (q.segments.length !== errorCount) {
    return [`밑줄 구간 ${q.segments.length}개 (${errorCount}개 필요)`];
  }

  // #2 라벨 축 — 지문 등장순 (A)(B)(C)… 고정.
  const expected = GRAMMAR_CORRECTION_MD_LABELS.slice(0, errorCount).map((k) => `(${k})`);
  const actual = marks.map((m) => m.label);
  if (actual.join("") !== expected.join("")) {
    v.push(
      `밑줄 라벨이 지문 등장순 ${expected.join("")} 이 아님 — 실제 ${actual.join("") || "없음"}`,
    );
  }

  // #3 고침 줄 라벨 축 — 중복·유령 라벨을 조용히 버리지 않고 지목한다.
  const markLabels = new Set(actual);
  const seenFix = new Set<string>();
  for (const label of q.fixLabels) {
    if (seenFix.has(label)) {
      v.push(`고침 줄 라벨 중복: ${label} — 밑줄 하나당 고침 한 줄이다`);
    }
    seenFix.add(label);
    if (!markLabels.has(label)) {
      v.push(`고침${label} 이 있는데 밑줄지문에 ${label} 마커가 없음`);
    }
  }

  // #4 자리별 검사.
  for (const segment of q.segments) {
    gateSegment(segment, passage, options?.requestedDifficulty, v);
  }

  // #5 지문 재구성 대조 — 마커 밖 무단 편집을 잡는 유일한 검사이자 최강 게이트다.
  //    자리별 검사가 이미 사유를 냈더라도 **끄지 않는다**: 마커 밖 편집은 어떤
  //    자리별 검사로도 드러나지 않아, 여기서 침묵하면 원문이 훼손된 지문이 저장된다.
  //
  //    ⚠ 단, 복원 실패 자리를 변형본 그대로 되꽂아 대조하면 재구성이 **반드시**
  //      어긋난다 — 지문을 한 글자도 안 건드린 출력에도 "마커 밖 텍스트가 원문과
  //      다르다" 는 거짓 지적이 항상 따라붙고, 그 문구가 [반려 재생성] 피드백에
  //      실려 모델이 멀쩡한 지문을 손대게 만든다(라우트는 반려 수가 줄지만 않으면
  //      그 재생성을 채택하므로 회복 시도가 지문 훼손을 유발한다).
  //      → 복원 실패 자리는 센티널로 비우고 **마커 밖 텍스트만** 대조한다.
  //        그 자리의 사유는 이미 #4 가 라벨을 지목해 냈다.
  const unresolved = q.segments
    .filter((segment) => deriveCorrectionSourceText(segment) === null)
    .map((segment) => segment.label);
  if (unresolved.length === 0) {
    const rebuilt = reconstructCorrectionPassage(q);
    if (!reconstructionEq(rebuilt, passage)) {
      v.push(
        `지문 재구성 불일치 — 마커 밖 텍스트가 원문과 다르거나 마커 안에서 두 곳 이상을 바꿨다${divergenceHint(rebuilt, passage)}`,
      );
    }
  } else {
    const stray = outsideTextMismatch(
      reconstructCorrectionPassage(q, { unresolved: UNRESOLVED_SENTINEL }),
      passage,
    );
    if (stray !== null) {
      v.push(
        `지문 재구성 불일치 — 마커 밖 텍스트가 원문과 다르다: '${stray}…'(${unresolved.join("")} 는 고침 줄을 읽지 못해 대조에서 제외했다)`,
      );
    }
  }

  // #6 해설.
  if (!q.explanation) v.push("해설 누락");

  return v;
}
