// Split from question-quality.ts — shared helpers in core.ts, public API via index.ts barrel.
import { QuestionQualitySeverity, containsHangul, containsLatinLetter, countLiteral, isRecord, normalizeComparableText, normalizeText, summaryWritingComparableTokens } from "../../core";
import { chipsAreInAnswerOrder, topicBlankAnswerSequence } from "@/lib/topic-sentence-writing";
import { collectWordBankBuildBlanks, findUnbuildableWordBankBlanks } from "../summary/writing";



// ---------------------------------------------------------------------------
// 주제문 영작 (TOPIC_SENTENCE_WRITING) — 서술형 품질게이트 (바이블 §11)
// SUMMARY_WRITING(cloze 류) + WORD_ORDER(scrambled 류)의 하이브리드. 두 모드가 정확히
// 하나만 채워져야 한다(XOR). 학생 노출 필드(scrambledWords / summaryWithBlanks / wordBank /
// koreanGloss)에 정답계열(modelAnswer / blanks[].answer / acceptableVariants /
// wordBankDistractors / scoringCriteria)이 새어나가면 안 된다(SW-LEAK-1).
//
// 누수/구조무효 게이트는 SUMMARY_WRITING / WORD_ORDER 가 이미 RELAXED_BLOCKING_QUALITY_CODES
// 에 등록한 코드(sw-answer-not-in-summary / sw-summary-blank-marker-count /
// sw-modelanswer-present / sw-answer-language / scrambled-already-solved /
// punctuation-only-chunk)를 그대로 재사용해 relaxed 폴백에서도 출하를 막는다(정답 노출·
// placeholder 깨짐은 미생성이 잘못 생성보다 낫다). tsw-* 코드는 strict 전용 구조 품질 게이트.
// ---------------------------------------------------------------------------
export function validateTopicSentenceWritingQuestion(
  question: Record<string, unknown>,
  add: (severity: QuestionQualitySeverity, code: string, message: string) => void,
) {
  const mode = normalizeText(question.mode);
  const summary = normalizeText(question.summaryWithBlanks);
  const modelAnswer = normalizeText(question.modelAnswer);
  const blanks = Array.isArray(question.blanks)
    ? question.blanks.filter(isRecord)
    : [];
  const scrambledRaw = Array.isArray(question.scrambledWords)
    ? question.scrambledWords
    : [];
  const scrambledWords = scrambledRaw
    .map((word) => normalizeText(word))
    .filter(Boolean);
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
  const koreanGloss = normalizeText(question.koreanGloss);

  // 모드 판별: 명시 mode 우선, 누락 시 형태로 추론(scrambledWords vs blanks+summary).
  const scrambledPopulated = scrambledWords.length > 0;
  const clozePopulated = blanks.length > 0 && summary.length > 0;
  const isCloze =
    mode === "cloze" ||
    (mode !== "scrambled" && clozePopulated && !scrambledPopulated);
  const isScrambled =
    mode === "scrambled" ||
    (mode !== "cloze" && scrambledPopulated && !clozePopulated);

  // TSW-GATE-MODELANSWER (sw-modelanswer-present): 모범답안 없으면 채점 불가.
  if (!modelAnswer) {
    add(
      "error",
      "sw-modelanswer-present",
      "TOPIC_SENTENCE_WRITING modelAnswer(완성된 주제문/명사구 전체)가 비어 있습니다.",
    );
  }

  // TSW-GATE-MODE-XOR (tsw-mode-xor): 정확히 한 모드만 채워져야 한다.
  //   scrambled = scrambledWords 채워짐, cloze = blanks + summaryWithBlanks 채워짐.
  //   둘 다거나 둘 다 아니면 렌더·채점·직렬화가 갈린다.
  if (scrambledPopulated && clozePopulated) {
    add(
      "error",
      "tsw-mode-xor",
      "TOPIC_SENTENCE_WRITING 은 scrambled(scrambledWords)와 cloze(blanks+summaryWithBlanks) 중 하나만 채워야 하는데 둘 다 채워졌습니다.",
    );
  } else if (!scrambledPopulated && !clozePopulated) {
    add(
      "error",
      "tsw-mode-xor",
      "TOPIC_SENTENCE_WRITING 에 scrambledWords(scrambled)도 blanks+summaryWithBlanks(cloze)도 없습니다. 한 모드를 채우세요.",
    );
  }

  // TSW-GATE-ANSWER-LANGUAGE (sw-answer-language): modelAnswer / 빈칸 answer 는 영어.
  let answerLanguageReported = false;
  if (
    modelAnswer &&
    (containsHangul(modelAnswer) || !containsLatinLetter(modelAnswer))
  ) {
    add(
      "error",
      "sw-answer-language",
      "TOPIC_SENTENCE_WRITING modelAnswer must be an English sentence or phrase.",
    );
    answerLanguageReported = true;
  }
  if (!answerLanguageReported) {
    for (const blank of blanks) {
      const answer = normalizeText(blank.answer);
      if (!answer) continue;
      if (containsHangul(answer) || !containsLatinLetter(answer)) {
        add(
          "error",
          "sw-answer-language",
          "TOPIC_SENTENCE_WRITING blanks[].answer must be an English word or phrase.",
        );
        break;
      }
    }
  }

  // ── scrambled 모드 게이트 (WORD_ORDER 류) ──
  if (isScrambled) {
    // TSW-GATE-CHIP-COUNT (tsw-scrambled-too-few): 칩 1개면 배열 과제가 성립하지 않는다.
    if (scrambledWords.length < 2) {
      add(
        "error",
        "tsw-scrambled-too-few",
        "scrambled 모드는 배열할 제시어(scrambledWords)가 2개 이상이어야 합니다.",
      );
    }

    // TSW-GATE-PUNCT-CHIP (punctuation-only-chunk): 구두점만으로 된 칩 금지(WORD_ORDER 동일).
    if (
      scrambledRaw.some(
        (part) =>
          typeof part === "string" && /^[^\wA-Za-z]+$/.test(part.trim()),
      )
    ) {
      add(
        "error",
        "punctuation-only-chunk",
        "TOPIC_SENTENCE_WRITING scrambled 모드에 구두점만으로 된 칩이 있습니다.",
      );
    }

    // TSW-GATE-SOLVED (scrambled-already-solved): 칩 나열이 정답 어순 그대로(완전일치) 또는
    //   왼→오로 읽으면 정답 어순이 풀리는 "거의 정렬된" 상태면 어순 누수. 셔플돼 있어야 한다.
    //   (생성 후처리 reshuffleTopicSentenceWritingChips 가 1차 보장, 이 게이트는 심층 방어.)
    if (
      modelAnswer &&
      (scrambledWords.join(" ") === modelAnswer ||
        chipsAreInAnswerOrder(scrambledWords, modelAnswer))
    ) {
      add(
        "error",
        "scrambled-already-solved",
        "scrambledWords 가 정답 어순대로 읽혀 어순이 누설됩니다(셔플 필요).",
      );
    }

    // TSW-GATE-RECONSTRUCT (tsw-scrambled-reconstruct): 비미끼 칩이 modelAnswer 의 핵심
    //   내용어를 충분히 담는지(= 정답을 조립할 재료가 있는지)만 본다. "부족"만 잡고 "잉여"는
    //   보지 않는다(여분 칩은 난도만 올릴 뿐 문항을 깨지 않고, 미끼 누락과 구분이 불안정함).
    //   비교는 어간(앞 4글자)으로 해 어형 변형(fidelity=inflected: 칩=기본형, 정답=활용형)·
    //   청크 칩을 흡수한다. 단발 누락은 어간충돌/청크/굴절 잡음일 수 있어, 핵심 내용어가
    //   "2개 이상" 빠졌을 때만 결함으로 본다(거짓양성 회피 — 미생성<정상문항 차단).
    if (modelAnswer) {
      const distractorSet = new Set(
        wordBankDistractors.map((d) => normalizeComparableText(d)),
      );
      const nonDistractorChips = scrambledWords.filter(
        (chip) => !distractorSet.has(normalizeComparableText(chip)),
      );
      const stem = (t: string) => t.slice(0, 4);
      const chipStems = new Set(
        nonDistractorChips
          .flatMap((chip) => summaryWritingComparableTokens(chip))
          .map(stem),
      );
      const answerStems = [
        ...new Set(summaryWritingComparableTokens(modelAnswer).map(stem)),
      ];
      const missingCount = answerStems.filter((s) => !chipStems.has(s)).length;
      // 핵심 내용어가 2개 이상 칩에 없으면 정답 조립 불가 — 결함.
      if (answerStems.length >= 3 && missingCount >= 2) {
        add(
          "error",
          "tsw-scrambled-reconstruct",
          `정답 조립에 필요한 핵심 내용어 ${missingCount}개가 scrambledWords(미끼 제외)에 없습니다.`,
        );
      }
    }
  }

  // ── cloze 모드 게이트 (SUMMARY_WRITING 류) ──
  if (isCloze) {
    // 라벨: blanks[].label 우선, 없으면 summaryWithBlanks 의 (X) placeholder.
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
        ).slice(0, 2),
      ),
    ].sort();

    if (!summary) {
      add(
        "error",
        "sw-summary-blank-marker-count",
        "TOPIC_SENTENCE_WRITING cloze 모드 summaryWithBlanks(주제문)가 비어 있습니다.",
      );
    }

    // TSW-GATE-MARKER (sw-summary-blank-marker-count): summaryWithBlanks 에 각 라벨이
    //   정확히 1회. (A) 마커가 없으면 빈칸 렌더·마스킹이 깨진다.
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

    // TSW-GATE-STEM (tsw-cloze-degenerate-stem, wave5): 라벨을 걷어낸 줄기에 내용
    //   토큰이 3개 미만이면 문장 골격이 없는 퇴화 stem — 실측(26-07-05 final-std
    //   KILLER): summaryWithBlanks 가 "The (A), (B)" 뿐이라 연결 프레임이 렌더에
    //   반영되지 않고 발문 자체가 성립하지 않았다.
    if (summary) {
      const stemTokens = summary
        .replace(/\([A-J]\)/g, " ")
        .split(/\s+/)
        .filter((token) => /[A-Za-z]/.test(token));
      if (stemTokens.length < 3) {
        add(
          "error",
          "tsw-cloze-degenerate-stem",
          `summaryWithBlanks 줄기에 내용 단어가 ${stemTokens.length}개뿐입니다 — 빈칸 라벨을 제외하고도 완결된 주제문 골격이 보여야 합니다.`,
        );
      }
    }

    // TSW-GATE-BLANK-ANSWER (tsw-blank-answer-present): 각 빈칸은 비어있지 않은 answer 필요.
    if (blanks.some((blank) => !normalizeText(blank.answer))) {
      add(
        "error",
        "tsw-blank-answer-present",
        "TOPIC_SENTENCE_WRITING cloze 모드의 각 빈칸은 비어 있지 않은 answer 가 필요합니다.",
      );
    }

    // TSW-GATE-WORDBANK-ORDER (scrambled-already-solved): [보기]를 왼→오로 읽으면 빈칸 정답
    //   어순이 풀리면 어순 누수. 기준은 modelAnswer(고정 프레임 포함)이 아니라 "빈칸 정답들"이다
    //   (보기는 빈칸을 채우는 단어이므로). (후처리 reshuffle 이 1차 보장, 이 게이트는 심층 방어.)
    const blankAnswerSeq = topicBlankAnswerSequence(question);
    if (
      wordBank.length >= 2 &&
      blankAnswerSeq &&
      chipsAreInAnswerOrder(wordBank, blankAnswerSeq)
    ) {
      add(
        "error",
        "scrambled-already-solved",
        "[보기](wordBank)가 빈칸 정답 어순대로 읽혀 어순이 누설됩니다(셔플 필요).",
      );
    }

    // TSW-GATE-LEAK-SUMMARY (sw-answer-not-in-summary): 정답 "어구"(연속 2토큰 이상)가
    //   학생 노출 주제문에 통째로 박혀 있으면 누수. SUMMARY_WRITING 과 동일 로직 —
    //   placeholder 라벨은 토큰 경계로만 작동하게 제거, 단일 내용어 1개 공유는 허용.
    const summaryComparable = normalizeComparableText(summary);
    if (summaryComparable) {
      const summaryTokens = summaryWritingComparableTokens(
        summary.replace(/\([A-Z]\)/g, " "),
      );
      const summarySequence = ` ${summaryTokens.join(" ")} `;
      const leakSources = blanks
        .map((blank) => normalizeText(blank.answer))
        .filter(Boolean);
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

    // TSW-GATE-BUILDABLE (tsw-answer-not-buildable-from-wordbank): cloze 는 SUMMARY_WRITING
    //   과 동일 구조(wordBank 칩 + blanks[].answer, 어형변화 허용)라 같은 F결함(정답 조립
    //   불가)이 가능하다 — SW sw-answer-not-buildable-from-wordbank 미러. [보기] 칩 멀티셋으로
    //   빈칸 정답을 조립할 수 없으면(필요 토큰 부족) 채점 불능(F). 어형변화·미끼 초과·
    //   대체정답은 정상. wordBank 없는 cloze(자유 영작)는 검사하지 않는다 — 무회귀.
    if (wordBank.length > 0) {
      const buildBlanks = collectWordBankBuildBlanks(blanks);
      if (buildBlanks.length > 0) {
        const defects = findUnbuildableWordBankBlanks(wordBank, buildBlanks);
        if (defects.length > 0) {
          const detail = defects
            .map(
              (d) => `${d.label}: ${d.missing.map((token) => `"${token}"`).join(", ")}`,
            )
            .join(" / ");
          add(
            "error",
            "tsw-answer-not-buildable-from-wordbank",
            `[보기](wordBank) 칩으로 정답을 조립할 수 없습니다 — 부족 토큰 ${detail}. 필요한 단어를 wordBank 에 추가하세요(중복 필요 단어는 같은 문자열을 개수만큼). 미끼 초과는 허용됩니다.`,
          );
        }
      }
    }
  }

  // ── 공통 누수 게이트(두 모드 모두) — 학생 노출 필드에 정답이 통째로 박힘 ──
  // SW-LEAK-1: 정답(modelAnswer / blanks[].answer)의 "연속 내용토큰 어구(2+)"가 학생
  //   노출 필드에 통째로 나타나면 정답 받아쓰기 전락 — hard error.
  //   필드별 검사 방식이 다르다(거짓양성 회피):
  //   · koreanGloss: 한국어 단서라 영어 내용토큰 2+ 연속이 정답과 겹치면 1:1 직역 누수.
  //   · scrambledWords: 칩은 정답을 흩은 재료다(청크모드는 다단어 칩 정상). 한 칩 안에
  //       정답 "전체" 연속이 통째로 들어간 degenerate 경우만 누수로 본다(부분 연속 칩 허용).
  //   · wordBank(cloze): 한 칩이 "여러 단어로 된 빈칸 정답"을 통째로 담으면 누수
  //       (SUMMARY_WRITING sw-wordbank-answer-coverage 미러). 단일어 정답은 받아쓰기 형식이라 제외.
  //   · summaryWithBlanks(cloze)는 위 cloze 블록에서 이미 검사했으므로 여기서는 제외.
  {
    const answerPhrases: string[] = [];
    if (modelAnswer) answerPhrases.push(modelAnswer);
    const blankAnswers: string[] = blanks
      .map((blank) => normalizeText(blank.answer))
      .filter(Boolean);

    // 두 토큰열이 길이 2+ 의 연속 부분열을 공유하는지(어느 방향이든) — 부분 누수 검출.
    const sharesConsecutiveRun = (a: string[], b: string[]): boolean => {
      if (a.length < 2 || b.length < 2) return false;
      const bSeq = ` ${b.join(" ")} `;
      for (let i = 0; i + 2 <= a.length; i += 1) {
        for (let len = a.length - i; len >= 2; len -= 1) {
          if (bSeq.includes(` ${a.slice(i, i + len).join(" ")} `)) return true;
        }
      }
      return false;
    };

    let leaked: { where: string; phrase: string } | null = null;

    // koreanGloss: 정답과 2+ 연속 내용토큰을 공유하면 누수.
    if (koreanGloss && !leaked) {
      const glossTokens = summaryWritingComparableTokens(koreanGloss);
      for (const phrase of [...answerPhrases, ...blankAnswers]) {
        const phraseTokens = summaryWritingComparableTokens(phrase);
        if (sharesConsecutiveRun(phraseTokens, glossTokens)) {
          leaked = { where: "koreanGloss", phrase };
          break;
        }
      }
    }

    // scrambledWords: 한 칩이 정답 "전체" 연속을 통째로 담으면 누수(부분 칩 허용).
    if (!leaked) {
      for (const chip of scrambledWords) {
        const chipSeq = ` ${summaryWritingComparableTokens(chip).join(" ")} `;
        for (const phrase of answerPhrases) {
          const phraseTokens = summaryWritingComparableTokens(phrase);
          if (
            phraseTokens.length >= 2 &&
            chipSeq.includes(` ${phraseTokens.join(" ")} `)
          ) {
            leaked = { where: "scrambledWords", phrase };
            break;
          }
        }
        if (leaked) break;
      }
    }

    // wordBank(cloze): 한 칩이 다단어 빈칸 정답을 통째로(== 또는 포함) 담으면 누수.
    if (!leaked) {
      for (const chip of wordBank) {
        const chipSeq = ` ${summaryWritingComparableTokens(chip).join(" ")} `;
        for (const answer of blankAnswers) {
          const answerTokens = summaryWritingComparableTokens(answer);
          if (
            answerTokens.length >= 2 &&
            chipSeq.includes(` ${answerTokens.join(" ")} `)
          ) {
            leaked = { where: "wordBank", phrase: answer };
            break;
          }
        }
        if (leaked) break;
      }
    }

    if (leaked) {
      add(
        "error",
        "sw-answer-not-in-summary",
        `정답 어구가 ${leaked.where} 에 통째로 노출됩니다(누수): "${leaked.phrase}". 정답계열은 학생 노출 필드에 넣지 마세요.`,
      );
    }
  }
}
