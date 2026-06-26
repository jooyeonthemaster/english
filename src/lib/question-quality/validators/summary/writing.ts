// Split from question-quality.ts — shared helpers in core.ts, public API via index.ts barrel.
import { QuestionQualitySeverity, containsHangul, containsLatinLetter, countLiteral, isRecord, normalizeComparableText, normalizeText, summaryWritingComparableTokens } from "../../core";



export function summaryWritingWordTokens(value: string): string[] {
  return (value.match(/[A-Za-z]+(?:[-'][A-Za-z]+)*/g) ?? []).map((token) =>
    token.toLowerCase(),
  );
}



export function validateSummaryWritingQuestion(
  question: Record<string, unknown>,
  add: (severity: QuestionQualitySeverity, code: string, message: string) => void,
) {
  const summary = normalizeText(question.summaryWithBlanks);
  const modelAnswer = normalizeText(question.modelAnswer);
  const clueMode = normalizeText(question.clueMode);
  const wordBankPolicy = normalizeText(question.wordBankPolicy);
  const blanks = Array.isArray(question.blanks)
    ? question.blanks.filter(isRecord)
    : [];
  const wordBank = Array.isArray(question.wordBank)
    ? question.wordBank
        .map((word) => normalizeText(word))
        .filter(Boolean)
    : [];
  const wordBankDistractors = Array.isArray(question.wordBankDistractors)
    ? question.wordBankDistractors
        .map((word) => normalizeText(word))
        .filter(Boolean)
    : [];

  // 라벨은 blanks[].label 우선, 없으면 summaryWithBlanks 의 (X) placeholder 에서 추출.
  const labelsFromBlanks = blanks
    .map((blank) => normalizeText(blank.label).toUpperCase())
    .filter((label) => /^\([A-Z]\)$/.test(label));
  const labelsFromSummary = Array.from(summary.matchAll(/\(([A-Z])\)/g)).map(
    (match) => `(${match[1]})`,
  );
  const blankLabels = [
    ...new Set(
      (labelsFromBlanks.length > 0
        ? labelsFromBlanks
        : labelsFromSummary.length > 0
          ? labelsFromSummary
          : ["(A)"]
      ).slice(0, 3),
    ),
  ].sort();

  // SW-GATE-MODELANSWER (sw-modelanswer-present): 모범답안 없으면 채점 불가.
  if (!modelAnswer) {
    add(
      "error",
      "sw-modelanswer-present",
      "SUMMARY_WRITING modelAnswer(전체 모범 영작)가 비어 있습니다.",
    );
  }

  if (!summary) {
    add(
      "error",
      "sw-summary-blank-marker-count",
      "SUMMARY_WRITING summaryWithBlanks(요약문)가 비어 있습니다.",
    );
  }

  // SW-GATE-MARKER (sw-summary-blank-marker-count): summaryWithBlanks 에 각 라벨이
  // 정확히 1회. placeholder 누락/중복은 마스킹·렌더가 깨진다.
  if (
    summary &&
    blankLabels.some((label) => countLiteral(summary, label) !== 1)
  ) {
    add(
      "error",
      "sw-summary-blank-marker-count",
      `summaryWithBlanks must contain ${blankLabels.join(", ")} exactly once each.`,
    );
  }

  // SW-GATE-ANSWER-LANGUAGE (sw-answer-language): 빈칸 answer·modelAnswer 는 영어.
  let answerLanguageReported = false;
  for (const blank of blanks) {
    const answer = normalizeText(blank.answer);
    if (!answer) continue;
    if (containsHangul(answer) || !containsLatinLetter(answer)) {
      add(
        "error",
        "sw-answer-language",
        "SUMMARY_WRITING blanks[].answer must be an English word or phrase.",
      );
      answerLanguageReported = true;
      break;
    }
  }
  if (
    !answerLanguageReported &&
    modelAnswer &&
    (containsHangul(modelAnswer) || !containsLatinLetter(modelAnswer))
  ) {
    add(
      "error",
      "sw-answer-language",
      "SUMMARY_WRITING modelAnswer must be an English sentence.",
    );
  }

  // SW-GATE-LEAK (sw-answer-not-in-summary): 정답 "어구"가 학생노출 요약문에 그대로
  // 적혀 있으면(=빈칸 자리에 정답을 써둔 실수) 누수. 단, 단일 내용어 1개가 겹치는
  // 것만으로는 막지 않는다 — 요약문은 지문의 paraphrase/inference 이고 connectorFrame
  // (", which can lead to greater bias in the result" 등)·빈칸밖 문장이 정답과 같은
  // 내용어(bias/sample/result/increasing …)를 정당하게 공유할 수 있어 거짓양성이 난다.
  // 진짜 누수는 정답의 "연속 다토큰 어구"가 요약문에 통째로 박혀 있는 경우다.
  // placeholder 무결성(빈칸에 정답이 안 들어감)은 sw-summary-blank-marker-count 가 보장.
  const summaryComparable = normalizeComparableText(summary);
  if (summaryComparable) {
    // placeholder 라벨((A))은 토큰 경계로만 작동하게 제거해 라벨이 인접 어구를
    // 잇는 거짓 연속을 막는다. connectorFrameAfter 같은 빈칸밖 텍스트는 그대로 둔다.
    const summaryTokens = summaryWritingComparableTokens(
      summary.replace(/\([A-Z]\)/g, " "),
    );
    const summarySequence = ` ${summaryTokens.join(" ")} `;
    // 빈칸별 answer(= 빈칸에 들어갈 비밀 어구)만 검사한다. modelAnswer 는 빈칸을 채운
    // "전체 문장"이라 connectorFrame·빈칸밖 문맥을 visible summary 와 길게 정당하게
    // 공유하므로 누수 비교에서 제외(포함 시 그 공유 문맥이 그대로 거짓양성을 만든다).
    const leakSources = blanks
      .map((blank) => normalizeText(blank.answer))
      .filter(Boolean);
    // 정답 어구의 연속 내용어(2토큰 이상)가 요약문 토큰열에 통째로 나타나면 누수로 본다.
    // 단일 내용어 1개 공유는 paraphrase/inference 의 자연스러운 겹침이라 허용.
    let leakedPhrase = "";
    for (const source of leakSources) {
      const phraseTokens = summaryWritingComparableTokens(source);
      if (phraseTokens.length < 2) continue;
      const phrase = ` ${phraseTokens.join(" ")} `;
      if (summarySequence.includes(phrase)) {
        leakedPhrase = phraseTokens.join(" ");
        break;
      }
    }
    if (leakedPhrase) {
      add(
        "error",
        "sw-answer-not-in-summary",
        `정답 어구가 summaryWithBlanks 에 통째로 노출됩니다(누수): "${leakedPhrase}". 빈칸에는 placeholder 라벨만 두세요.`,
      );
    }
  }

  // SW-GATE-ORDER (sw-wordbank-no-answer-order): [보기]의 나열 순서가 modelAnswer
  // (또는 answer 들을 이은) 어순과 같으면 어순을 무료로 누설. 반드시 셔플돼야 함.
  if (wordBank.length >= 2) {
    const bankSequence = wordBank
      .flatMap((chip) => summaryWritingWordTokens(chip))
      .join(" ");
    const answerSequence = (
      modelAnswer ||
      blanks.map((blank) => normalizeText(blank.answer)).join(" ")
    );
    const answerTokenSequence = summaryWritingWordTokens(answerSequence).join(" ");
    if (
      bankSequence &&
      answerTokenSequence &&
      answerTokenSequence.includes(bankSequence)
    ) {
      add(
        "error",
        "sw-wordbank-no-answer-order",
        "wordBank(보기)가 정답 어순 그대로입니다. 보기 순서를 정답과 다르게 셔플하세요.",
      );
    }
  }

  // SW-GATE-COVERAGE (sw-wordbank-answer-coverage): [보기] 칩 하나가 '여러 단어로 된 정답
  // 어구 전체'를 통째로(연속) 담으면 정답이 노출된다(예: wordBank=["depth of conceptual
  // synthesis and memory encoding"]). BASIC 재배열 영작은 정답을 단어 단위로 흩어 칩으로
  // 주므로(useAll+미끼0 이어도) 어떤 칩도 다단어 정답을 연속으로 담지 않아 무발화한다.
  // 단일어 정답은 정상적으로 보기에 들어가는 형식(받아쓰기)이라 검사 대상에서 제외한다.
  // (이전 '토큰 집합 커버리지' 방식은 BASIC useAll+미끼0 을 오탐 차단해 폐기 — 누설 신호는
  //  '커버리지'가 아니라 '한 칩 = 다단어 정답 통째'다.)
  {
    const deobf = (value: string) =>
      normalizeComparableText(value).replace(/_+/g, "").replace(/\s+/g, " ").trim();
    const chipsNorm = wordBank.map((chip) => deobf(chip)).filter(Boolean);
    const leaked = blanks
      .map((blank) => deobf(normalizeText(blank.answer)))
      .filter((ans) => ans.split(" ").filter(Boolean).length >= 2)
      .find((ans) => chipsNorm.some((chip) => chip === ans || chip.includes(ans)));
    if (leaked) {
      add(
        "error",
        "sw-wordbank-answer-coverage",
        "[보기]의 한 칩이 여러 단어로 된 정답 어구를 통째로 담아 정답이 노출됩니다. 정답 어구는 한 칩에 몰아넣지 말고 단어 단위로 흩거나 미끼(wordBankDistractors)를 추가하세요.",
      );
    }
  }

  // SW-GATE-FIRSTLETTER (clueMode=firstLetter): 앞글자 단서는 렌더 단계에서 blanks[].answer 의
  // 각 단어 첫 글자를 직접 파생해 "(A) r____ o____ ..." 단어별 슬롯으로 그린다
  // (summaryWritingMaskedSummary). 즉 모델의 firstLetterHint 필드는 표시에 쓰이지 않으므로
  // 그 토큰 정렬을 강제하지 않는다(과거 sw-firstletter-align 게이트가 안 쓰는 필드 때문에 멀쩡한
  // 문제를 리젝하던 것을 제거). 유효 조건은 각 빈칸 answer 가 존재하는 것뿐 — 이는 아래
  // sw-answer-language / sw-modelanswer-present 가 이미 보장한다.

  // SW-GATE-DISTRACTOR (sw-distractor-semantic): usePartial(미끼 사용) 인데
  // wordBankDistractors 가 비어 있으면 어느 게 미끼인지 검증·교사면이 비게 됨 — 경고.
  if (
    wordBankPolicy === "usePartial" &&
    wordBank.length > 0 &&
    wordBankDistractors.length === 0
  ) {
    add(
      "warning",
      "sw-distractor-semantic",
      "wordBankPolicy=usePartial 인데 wordBankDistractors(미끼 목록)가 비어 있습니다.",
    );
  }
}
