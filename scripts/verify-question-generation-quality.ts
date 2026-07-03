import fs from "node:fs/promises";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { generateObject } from "ai";
import { z } from "zod";

import { model as geminiModel } from "../src/lib/ai";
import { runQuestionGenerationWithEmptyRetry } from "../src/app/api/ai/generate-questions-auto/_lib/run-question-generation";
import { validateQuestionQuality } from "../src/lib/question-quality";
import { optionDisplayTextForSubtype } from "../src/components/exams/paper-builder/option-display";
import { StructuredQuestionRenderer } from "../src/components/workbench/question-renderers";

type Difficulty = "BASIC" | "INTERMEDIATE" | "KILLER";

interface VerificationCase {
  id: string;
  subType: string;
  difficulty: Difficulty;
  passage: string;
  targetPoints: string[];
  focus: string;
  typeSettings?: Record<string, unknown>;
}

const OUT_DIR = path.join(process.cwd(), ".tmp", "question-generation-quality");

const TECH_RESPONSIBILITY_PASSAGE = `When people evaluate new technologies, they often pretend that facts alone settle the debate. Yet facts become meaningful only when they are connected to values. A medical algorithm may predict risk with impressive accuracy, but deciding how much uncertainty a patient should accept is not a calculation the machine can finish. The numbers can point toward a decision; they cannot carry the weight of the decision for us. This is why technology does not remove human judgment but rearranges where it is needed. In the end, better tools do not free people from responsibility; they make the responsibility harder to ignore.`;

const URBAN_FARMING_PASSAGE = `In cities around the world, a quiet revolution is taking place on rooftops and in abandoned buildings. Urban farming has grown rapidly as people seek fresh, locally grown food. Unlike traditional agriculture, urban farms use innovative techniques such as vertical farming and hydroponics to grow crops in limited spaces. These methods use significantly less water and no soil at all. Beyond providing food, urban farms create green spaces that reduce air pollution and lower temperatures in crowded neighborhoods. Community gardens also bring people together, fostering social connections in areas where neighbors rarely interact.`;

const DIGITAL_DIVIDE_PASSAGE = `Access to the internet has become essential for education, employment, and social participation. However, millions of people worldwide still lack reliable internet connections. This gap, known as the digital divide, disproportionately affects rural communities and low-income households. Students without internet access struggle to complete homework assignments and miss opportunities for online learning. Governments and nonprofit organizations are working to bridge this divide by expanding broadband infrastructure and providing affordable devices. Closing the digital divide is not just a matter of technology; it is a matter of equality and opportunity for future generations.`;

const GRANDMOTHER_HYPOTHESIS_PASSAGE = `Scientists have long debated why humans, unlike most animals, continue to live for decades after they can no longer reproduce. One theory, known as the 'grandmother hypothesis,' suggests that older women who helped raise their grandchildren improved the family's chances of survival. By gathering food and sharing knowledge, these grandmothers allowed their daughters to have more children. Communities that benefited from such support were more likely to thrive, which means the trait was gradually passed down through generations.`;

const CASES: VerificationCase[] = [
  {
    id: "implied-basic",
    subType: "IMPLIED_MEANING",
    difficulty: "BASIC",
    passage: TECH_RESPONSIBILITY_PASSAGE,
    targetPoints: ["they cannot carry the weight of the decision for us"],
    focus: "?⑥텞?섎? 湲곕낯?? 諛쒕Ц-吏臾?諛묒쨪-?곷Ц ?좏깮吏 援ъ“? ?ъ슫 異붾줎??,
  },
  {
    id: "implied-intermediate",
    subType: "IMPLIED_MEANING",
    difficulty: "INTERMEDIATE",
    passage: TECH_RESPONSIBILITY_PASSAGE,
    targetPoints: ["they cannot carry the weight of the decision for us"],
    focus: "?⑥텞?섎? 以묒쐞?? 吏곸젒 ?⑥뼱留ㅼ묶???쇳븯怨?facts-values 援ъ“瑜??곌껐?섎뒗吏",
  },
  {
    id: "implied-killer",
    subType: "IMPLIED_MEANING",
    difficulty: "KILLER",
    passage: TECH_RESPONSIBILITY_PASSAGE,
    targetPoints: ["they cannot carry the weight of the decision for us"],
    focus: "?⑥텞?섎? 怨좊궃?꾪삎: ?뺣떟? ?볦? 異붾줎, ?ㅻ떟? 洹몃윺??븳 遺遺꾨룆??,
  },
  {
    id: "topic-intermediate",
    subType: "TOPIC",
    difficulty: "INTERMEDIATE",
    passage: URBAN_FARMING_PASSAGE,
    targetPoints: ["urban farming uses limited city spaces to provide food, environmental benefits, and social connection"],
    focus: "二쇱젣 異붾줎: 吏臾몄쓽 ????붿젣 踰붿쐞瑜?臾산퀬 ?붿???二쇱옣?쇰줈 ?먮Ⅴ吏 ?딅뒗吏",
  },
  {
    id: "topic-basic",
    subType: "TOPIC",
    difficulty: "BASIC",
    passage: URBAN_FARMING_PASSAGE,
    targetPoints: ["urban farming provides food, environmental benefits, and community connection in cities"],
    focus: "二쇱젣 湲곕낯?? ?붿젣 踰붿쐞瑜?紐낇솗???〓릺 ?덈Т 二쇱옣臾몄쿂??留뚮뱾吏 ?딅뒗吏",
  },
  {
    id: "topic-killer",
    subType: "TOPIC",
    difficulty: "KILLER",
    passage: URBAN_FARMING_PASSAGE,
    targetPoints: ["urban farming as a multidimensional urban solution, not just a food-production method"],
    focus: "二쇱젣 怨좊궃?꾪삎: ?앸웾/?섍꼍/怨듬룞泥대? 醫낇빀?섎뒗 愿묐쾾??二쇱젣? 留ㅻ젰 ?ㅻ떟",
  },
  {
    id: "main-idea-basic",
    subType: "MAIN_IDEA",
    difficulty: "BASIC",
    passage: TECH_RESPONSIBILITY_PASSAGE,
    targetPoints: ["technology cannot replace human responsibility in decisions involving values"],
    focus: "?붿? 湲곕낯?? ?듭떖 二쇱옣 臾몄옣???좏깮吏? ?ъ슫 ?ㅻ떟 諛곗젣",
  },
  {
    id: "main-idea-intermediate",
    subType: "MAIN_IDEA",
    difficulty: "INTERMEDIATE",
    passage: TECH_RESPONSIBILITY_PASSAGE,
    targetPoints: ["facts and numerical predictions need human value judgment to become decisions"],
    focus: "?붿? 以묒쐞?? facts-values ?議곗? responsibility 寃곕줎???곌껐?섎뒗吏",
  },
  {
    id: "main-idea-killer",
    subType: "MAIN_IDEA",
    difficulty: "KILLER",
    passage: TECH_RESPONSIBILITY_PASSAGE,
    targetPoints: ["better technology relocates rather than removes human responsibility"],
    focus: "?붿?/二쇱옣: 湲?댁씠???듭떖 二쇱옣 臾몄옣???좏깮吏? 怨좊궃???ㅻ떟 留ㅻ젰??,
  },
  {
    id: "title-killer",
    subType: "TITLE",
    difficulty: "KILLER",
    passage: DIGITAL_DIVIDE_PASSAGE,
    targetPoints: ["closing the digital divide is an equality and opportunity issue, not only a technology issue"],
    focus: "?쒕ぉ 異붾줎: ?쒕ぉ?ㅼ?, 怨쇱냼/怨쇰? ?쇰컲???ㅻ떟 ?덉쭏, ?먮Ц 吏臾?UI ?몄텧",
  },
  {
    id: "title-basic",
    subType: "TITLE",
    difficulty: "BASIC",
    passage: DIGITAL_DIVIDE_PASSAGE,
    targetPoints: ["the digital divide limits education, work, and future opportunity"],
    focus: "?쒕ぉ 湲곕낯?? 湲 ?꾩껜瑜???쒗븯???쒕ぉ怨?紐낅갚??踰붿쐞 珥덇낵 ?ㅻ떟",
  },
  {
    id: "title-intermediate",
    subType: "TITLE",
    difficulty: "INTERMEDIATE",
    passage: DIGITAL_DIVIDE_PASSAGE,
    targetPoints: ["the digital divide is a social equality issue, not merely internet access"],
    focus: "?쒕ぉ 以묒쐞?? technology/equality ?鍮꾨? ?쒕ぉ?듦쾶 ?뺤텞?섎뒗吏",
  },
  {
    id: "summary-mc-basic",
    subType: "SUMMARY_COMPLETE_MC",
    difficulty: "BASIC",
    passage: URBAN_FARMING_PASSAGE,
    targetPoints: ["urban farming uses limited city spaces to provide food, environmental benefits, and community connection"],
    focus: "?붿빟臾??꾩꽦 媛앷???湲곕낯?? ??臾몄옣 ?붿빟, (A)(B) ???좎?, 遺遺꾩젙???⑥젙",
  },
  {
    id: "summary-mc-intermediate",
    subType: "SUMMARY_COMPLETE_MC",
    difficulty: "INTERMEDIATE",
    passage: DIGITAL_DIVIDE_PASSAGE,
    targetPoints: ["closing the digital divide is about equality and opportunity, not only technology access"],
    focus: "?붿빟臾??꾩꽦 媛앷???以묒쐞沅? 湲곗닠 ?묎렐怨??ы쉶??湲고쉶 愿怨꾨? ??鍮덉뭏???섎늻?붿?",
  },
  {
    id: "summary-mc-killer",
    subType: "SUMMARY_COMPLETE_MC",
    difficulty: "KILLER",
    passage: TECH_RESPONSIBILITY_PASSAGE,
    targetPoints: ["better technology relocates rather than removes human responsibility in value-based decisions"],
    focus: "?붿빟臾??꾩꽦 媛앷????щ윭?? ?꾩껜 ?쇱? 異붿긽?붿? A-only/B-only 洹쇱젒 ?ㅻ떟 ?ㅺ퀎",
  },
  {
    id: "summary-mc-killer-grandmother",
    subType: "SUMMARY_COMPLETE_MC",
    difficulty: "KILLER",
    passage: GRANDMOTHER_HYPOTHESIS_PASSAGE,
    targetPoints: ["altruistic post-reproductive support increased family survival and was preserved through evolutionary selection"],
    focus: "?붿빟臾??꾩꽦 媛앷????щ윭?? altruistic/evolutionarily ?뺣떟?먯꽌 genetically 媛숈? ?듭떖 B ?⑥젙???뺣떟 A? 遺숈씠怨?cooperative 媛숈? A ?⑥젙???뺣떟 B? 遺숈씠?붿?",
  },
  {
    id: "blank-killer-control",
    subType: "BLANK_INFERENCE",
    difficulty: "KILLER",
    passage: TECH_RESPONSIBILITY_PASSAGE,
    targetPoints: ["technology does not remove human judgment but rearranges where it is needed"],
    focus: "鍮덉뭏 怨좊궃??湲곗??? 湲곗〈 怨좏뭹吏??좏삎???쇰━ 鍮덉뭏怨??ㅻ떟 ?ㅺ퀎 ?섏? 鍮꾧탳",
    typeSettings: { BLANK_INFERENCE: { doubleNegative: false } },
  },
  {
    id: "grammar-intermediate-control",
    subType: "GRAMMAR_ERROR",
    difficulty: "INTERMEDIATE",
    passage: URBAN_FARMING_PASSAGE,
    targetPoints: ["relative clauses, subject-verb agreement, participial phrases, comparison structures"],
    focus: "?대쾿 湲곗??? 湲곗〈 怨좏뭹吏??좏삎???쒖떆/?좏깮吏 異쒕젰 ?뺥깭? ?ㅻ떟 ?ㅻ챸",
    typeSettings: { GRAMMAR_ERROR: { markerCount: 5, answerCount: 1 } },
  },
];

const DIFFICULTY_INSTRUCTIONS: Record<Difficulty, string> = {
  BASIC: "?뺣떟 洹쇨굅媛 鍮꾧탳??吏곸젒?곸쑝濡??쒕윭?섎릺 ?⑥닚 蹂듬텤? ?쇳븯怨? ?ㅻ떟? 紐낅갚?섏?留??덈Т ?좎튂?섏? ?딄쾶 留뚮뱺??",
  INTERMEDIATE: "??臾몄옣 ?댁긽???곌껐???붽뎄?섍퀬, ?ㅻ떟? 遺遺꾩쟻?쇰줈 留욎?留??듭떖 踰붿쐞???쇰━媛 ?닿툔?섍쾶 留뚮뱺??",
  KILLER: "?듭떖 ?쇰━???꾪솚, 踰붿쐞, ?⑥텞??醫낇빀?댁빞 ?由щŉ, ?ㅻ떟? ?ㅼ젣 ?쒗뿕泥섎읆 留ㅻ젰?곸씤 遺遺꾨룆?댁? 怨쇱엵?쇰컲?붾? ?ы븿?쒕떎.",
};

const DIRECTOR_FEEDBACK_BLOCK = [
  "## Director feedback under verification",
  "- IMPLIED_MEANING must use the exact Korean direction: ?ㅼ쓬 湲?먯꽌 諛묒쨪 移?遺遺꾩씠 ?⑥텞 ?섎??섎뒗 諛붾줈 媛???곸젅??寃껋??",
  "- IMPLIED_MEANING layout must be direction, then the passage with only the target expression underlined, then options.",
  "- IMPLIED_MEANING options must be English-only.",
  "- TOPIC asks the topic/subject range; MAIN_IDEA asks the writer's main point or claim; TITLE asks a title-like phrase.",
  "- SUMMARY_COMPLETE_MC is the objective CSAT-style summary completion item, not the constructed-response summary item. Use one English summary sentence with (A)/(B) and five English paired options with half-correct traps.",
  "- Preview UI must show the actual passage for source-backed types, not a vague instruction to refer to the above passage.",
].join("\n");

const llmEvaluationSchema = z.object({
  cases: z.array(
    z.object({
      id: z.string(),
      overallScore: z.number().min(1).max(5),
      pass: z.boolean(),
      categoryScores: z.object({
        examFrame: z.number().min(1).max(5),
        answerability: z.number().min(1).max(5),
        distractorQuality: z.number().min(1).max(5),
        difficultyFit: z.number().min(1).max(5),
        languageAndFormat: z.number().min(1).max(5),
      }),
      strengths: z.array(z.string()),
      issues: z.array(
        z.object({
          severity: z.enum(["blocker", "major", "minor"]),
          message: z.string(),
        }),
      ),
      recommendation: z.string(),
    }),
  ),
});

function optionTexts(question: Record<string, unknown>): string[] {
  if (!Array.isArray(question.options)) return [];
  return question.options
    .map((option) => {
      if (!option || typeof option !== "object") return "";
      const text = (option as Record<string, unknown>).text;
      return typeof text === "string" ? text.trim() : "";
    })
    .filter(Boolean);
}

function normalizeComparable(value: unknown): string {
  return typeof value === "string"
    ? value.toLowerCase().replace(/[^a-z0-9]+/g, "")
    : "";
}

function summaryBlankAnswer(question: Record<string, unknown>, label: "(A)" | "(B)") {
  if (!Array.isArray(question.blanks)) return "";
  const expected = label.replace(/[()]/g, "").toLowerCase();
  const blank = question.blanks.find((item) => {
    if (!item || typeof item !== "object") return false;
    const rawLabel = (item as Record<string, unknown>).label;
    return String(rawLabel ?? "").replace(/[()]/g, "").toLowerCase() === expected;
  });
  if (!blank || typeof blank !== "object") return "";
  const answer = (blank as Record<string, unknown>).answer;
  return typeof answer === "string" ? answer.trim() : "";
}

function summaryOptionPairs(question: Record<string, unknown>) {
  if (!Array.isArray(question.options)) return [];
  return question.options.map((option) => {
    if (!option || typeof option !== "object") {
      return { label: "", blankA: "", blankB: "", text: "" };
    }
    const record = option as Record<string, unknown>;
    const label = normalizeLabel(record.label);
    const text = typeof record.text === "string" ? record.text.trim() : "";
    const explicitA = typeof record.blankA === "string" ? record.blankA.trim() : "";
    const explicitB = typeof record.blankB === "string" ? record.blankB.trim() : "";
    if (explicitA || explicitB) {
      return { label, blankA: explicitA, blankB: explicitB, text };
    }

    const parts = text
      .replace(/^\s*(?:[\u2460-\u2473\u3251-\u325F\u32B1-\u32BF]|\((?:[A-Ja-j]|\d{1,3})\)|(?:[A-Ja-j]|\d{1,3})[.)])\s*/, "")
      .split(/\s*(?:?╈?\.{3,}|??\/|\||;|,|\s[-?볛?\s)\s*/u)
      .map((part) => part.trim())
      .filter(Boolean);

    return {
      label,
      blankA: parts[0] ?? "",
      blankB: parts.slice(1).join(" "),
      text,
    };
  });
}

function wrongOptionLabels(question: Record<string, unknown>): string[] {
  const correct = normalizeLabel(question.correctAnswer);
  if (!Array.isArray(question.options)) return [];
  return question.options
    .map((option) => {
      if (!option || typeof option !== "object") return "";
      return normalizeLabel((option as Record<string, unknown>).label);
    })
    .filter((label) => label && label !== correct);
}

function normalizeLabel(value: unknown): string {
  return typeof value === "string"
    ? value.replace(/^[\s?졻몼?™몿?ㅲ뫁?╈뫃?ⓥ뫆]+/, "").trim().toLowerCase()
    : "";
}

function containsHangul(value: string): boolean {
  return /[媛-??/.test(value);
}

function containsLatin(value: string): boolean {
  return /[A-Za-z]/.test(value);
}

function englishWordCount(value: string): number {
  return (value.match(/[A-Za-z]+(?:[-'][A-Za-z]+)?/g) ?? []).length;
}

function sentenceLikeKoreanOption(value: string): boolean {
  return /[?ㅼ슂?꾪븿?④쾬]+[.!?]?$/.test(value.trim()) && value.trim().length >= 14;
}

function evaluateDeterministically(
  testCase: VerificationCase,
  question: Record<string, unknown>,
  html: string,
) {
  const issues: Array<{ severity: "error" | "warning"; code: string; message: string }> = [];
  const qualityIssues = validateQuestionQuality({
    typeId: testCase.subType,
    question,
    passage: testCase.passage,
    requestedDifficulty: testCase.difficulty,
    grammarMarkerCount: testCase.subType === "GRAMMAR_ERROR" ? 5 : undefined,
    grammarAnswerCount: testCase.subType === "GRAMMAR_ERROR" ? 1 : undefined,
  });

  for (const issue of qualityIssues) {
    issues.push({
      severity: issue.severity,
      code: issue.code,
      message: issue.message,
    });
  }

  const options = optionTexts(question);
  const direction = typeof question.direction === "string" ? question.direction : "";
  const passageWithUnderline =
    typeof question.passageWithUnderline === "string" ? question.passageWithUnderline : "";

  if (testCase.subType === "IMPLIED_MEANING") {
    const exactDirection = "?ㅼ쓬 湲?먯꽌 諛묒쨪 移?遺遺꾩씠 ?⑥텞 ?섎??섎뒗 諛붾줈 媛???곸젅??寃껋??";
    if (direction !== exactDirection) {
      issues.push({
        severity: "error",
        code: "implied-direction-not-exact",
        message: `Direction is not exact: ${direction}`,
      });
    }
    if ((passageWithUnderline.match(/__/g) ?? []).length !== 2) {
      issues.push({
        severity: "error",
        code: "implied-ui-underline-count",
        message: "passageWithUnderline must contain exactly one underlined expression.",
      });
    }
    options.forEach((option, index) => {
      if (containsHangul(option)) {
        issues.push({
          severity: "error",
          code: "implied-option-hangul",
          message: `Option ${index + 1} contains Hangul: ${option}`,
        });
      }
      if (!containsLatin(option) || englishWordCount(option) < 3) {
        issues.push({
          severity: "error",
          code: "implied-option-not-english-phrase",
          message: `Option ${index + 1} is not a meaningful English phrase: ${option}`,
        });
      }
    });
    if (html.includes("諛묒쨪 ?쒗쁽")) {
      issues.push({
        severity: "error",
        code: "implied-ui-extra-target-box",
        message: "UI still renders an extra target-expression box.",
      });
    }
    if (
      html.includes("?쒕㈃怨??⑥텞") ||
      html.includes("?쒕㈃ ?섎?") ||
      html.includes("異붾줎 媛꾧레") ||
      html.includes("洹쇨굅 ?먮쫫")
    ) {
      issues.push({
        severity: "error",
        code: "implied-ui-overexplained-answer",
        message: "IMPLIED_MEANING answer UI should match other objective types and not render separate surface/gap/evidence blocks.",
      });
    }
    if (!html.includes("underline decoration-2")) {
      issues.push({
        severity: "error",
        code: "implied-ui-no-underline",
        message: "Rendered UI does not contain the underline styling.",
      });
    }
  }

  if (["TOPIC", "MAIN_IDEA", "TITLE", "CONTENT_MATCH", "SUMMARY_COMPLETE_MC"].includes(testCase.subType)) {
    const sourceSnippet = testCase.passage.slice(0, 48);
    if (!html.includes(sourceSnippet)) {
      issues.push({
        severity: "error",
        code: "source-passage-not-rendered",
        message: "Preview HTML does not include the actual source passage.",
      });
    }
    if (html.includes("??吏臾?)) {
      issues.push({
        severity: "error",
        code: "above-passage-placeholder",
        message: "Preview HTML still contains an above-passage placeholder.",
      });
    }
  }

  if (testCase.subType === "SUMMARY_COMPLETE_MC") {
    const summary =
      typeof question.summaryWithBlanks === "string" ? question.summaryWithBlanks : "";
    const blankA = summaryBlankAnswer(question, "(A)");
    const blankB = summaryBlankAnswer(question, "(B)");
    const pairs = summaryOptionPairs(question);
    const correctLabel = normalizeLabel(question.correctAnswer);
    const correctPair = pairs.find((pair) => pair.label === correctLabel);

    if ((summary.match(/\(A\)/g) ?? []).length !== 1 || (summary.match(/\(B\)/g) ?? []).length !== 1) {
      issues.push({
        severity: "error",
        code: "summary-mc-marker-count",
        message: "summaryWithBlanks must contain exactly one (A) and one (B).",
      });
    }
    if (containsHangul(summary) || !containsLatin(summary)) {
      issues.push({
        severity: "error",
        code: "summary-mc-summary-not-english",
        message: `Summary is not an English sentence: ${summary}`,
      });
    }
    if (pairs.length !== 5 || pairs.some((pair) => !pair.blankA || !pair.blankB)) {
      issues.push({
        severity: "error",
        code: "summary-mc-option-pair-shape",
        message: "Every summary-completion option must have blankA and blankB.",
      });
    }
    if (pairs.some((pair) => containsHangul(`${pair.blankA} ${pair.blankB}`))) {
      issues.push({
        severity: "error",
        code: "summary-mc-option-hangul",
        message: "Summary-completion option pairs must be English-only.",
      });
    }
    if (
      !correctPair ||
      normalizeComparable(correctPair.blankA) !== normalizeComparable(blankA) ||
      normalizeComparable(correctPair.blankB) !== normalizeComparable(blankB)
    ) {
      issues.push({
        severity: "error",
        code: "summary-mc-correct-pair-mismatch",
        message: "Correct option pair does not match blanks answers.",
      });
    }

    const wrongPairs = pairs.filter((pair) => pair.label !== correctLabel);
    const hasAOnlyTrap = wrongPairs.some(
      (pair) =>
        normalizeComparable(pair.blankA) === normalizeComparable(blankA) &&
        normalizeComparable(pair.blankB) !== normalizeComparable(blankB),
    );
    const hasBOnlyTrap = wrongPairs.some(
      (pair) =>
        normalizeComparable(pair.blankA) !== normalizeComparable(blankA) &&
        normalizeComparable(pair.blankB) === normalizeComparable(blankB),
    );
    if (!hasAOnlyTrap || !hasBOnlyTrap) {
      issues.push({
        severity: testCase.difficulty === "KILLER" ? "error" : "warning",
        code: "summary-mc-half-correct-traps",
        message: "Expected at least one A-only and one B-only near-miss option.",
      });
    }
    if (!html.includes("(A)") || !html.includes("(B)")) {
      issues.push({
        severity: "error",
        code: "summary-mc-ui-frame",
        message: "Rendered UI does not show the summary-completion blank markers.",
      });
    }
    if (html.includes("grid-cols-[44px_1fr_1fr]") || html.includes(">No.</div>")) {
      issues.push({
        severity: "error",
        code: "summary-mc-ui-table-options",
        message: "SUMMARY_COMPLETE_MC options should use the shared objective option list, not a custom table.",
      });
    }
  }

  if (testCase.subType === "TOPIC") {
    const mainIdeaStyleOptions = options.filter(sentenceLikeKoreanOption);
    if (mainIdeaStyleOptions.length >= 3) {
      issues.push({
        severity: "warning",
        code: "topic-options-too-claim-like",
        message: "TOPIC options look too much like complete main-idea claims.",
      });
    }
  }

  if (testCase.subType === "MAIN_IDEA") {
    const shortTopicOptions = options.filter((option) => option.length < 12 || !sentenceLikeKoreanOption(option));
    if (shortTopicOptions.length >= 3) {
      issues.push({
        severity: "warning",
        code: "main-idea-options-too-topic-like",
        message: "MAIN_IDEA options look too short or title-like.",
      });
    }
  }

  if (testCase.subType === "GRAMMAR_ERROR") {
    const displayText = optionDisplayTextForSubtype("GRAMMAR_ERROR", 0, "(A)");
    if (displayText !== "") {
      issues.push({
        severity: "error",
        code: "grammar-paper-option-text-not-empty",
        message: "Grammar paper option display should hide option text and show only circled labels.",
      });
    }
  }

  const wrongLabels = wrongOptionLabels(question);
  const explanations =
    question.wrongOptionExplanations &&
    typeof question.wrongOptionExplanations === "object" &&
    !Array.isArray(question.wrongOptionExplanations)
      ? (question.wrongOptionExplanations as Record<string, unknown>)
      : {};
  const missingWrongExplanations = wrongLabels.filter((label) => {
    const raw = explanations[label] ?? explanations[label.toUpperCase()] ?? explanations[label.toLowerCase()];
    return typeof raw !== "string" || raw.trim().length < 10;
  });
  if (wrongLabels.length > 0 && missingWrongExplanations.length > 0) {
    issues.push({
      severity: "error",
      code: "missing-wrong-option-explanations",
      message: `Missing or thin wrong-option explanations: ${missingWrongExplanations.join(", ")}`,
    });
  }

  const uniqueOptionCount = new Set(options.map((option) => option.toLowerCase())).size;
  if (options.length >= 2 && uniqueOptionCount !== options.length) {
    issues.push({
      severity: "error",
      code: "duplicate-option-text-deterministic",
      message: "Duplicate option texts detected.",
    });
  }

  return {
    issueCount: issues.length,
    errorCount: issues.filter((issue) => issue.severity === "error").length,
    warningCount: issues.filter((issue) => issue.severity === "warning").length,
    issues,
  };
}

async function generateForCase(testCase: VerificationCase) {
  const result = await runQuestionGenerationWithEmptyRetry(
    {
      plan: [
        {
          subType: testCase.subType,
          count: 1,
          reason: testCase.focus,
          targetPoints: testCase.targetPoints,
        },
      ],
      schoolType: "怨좊벑?숆탳",
      gradeInfo: "2?숇뀈",
      passageContent: testCase.passage,
      teacherIntentBlock: DIRECTOR_FEEDBACK_BLOCK,
      analysisContext: "None.",
      diffLabel: testCase.difficulty,
      diffInstruction: DIFFICULTY_INSTRUCTIONS[testCase.difficulty],
      generationPlan: "STANDARD",
      typeSettings: testCase.typeSettings,
    },
    { maxAttempts: 1, logPrefix: `VERIFY-${testCase.id}` },
  );

  const question = result.questions[0] ?? null;
  const html = question
    ? renderToStaticMarkup(
        React.createElement(StructuredQuestionRenderer, {
          question,
          index: 0,
          sourcePassageContent: testCase.passage,
        }),
      )
    : "";

  return {
    case: testCase,
    generation: {
      count: result.questions.length,
      attempts: result.attempts,
      relaxedFallback: result.relaxedFallback,
      rejectionSummary: result.rejectionSummary,
    },
    question,
    html,
    deterministic: question
      ? evaluateDeterministically(testCase, question, html)
      : {
          issueCount: 1,
          errorCount: 1,
          warningCount: 0,
          issues: [
            {
              severity: "error",
              code: "no-generated-question",
              message: "Generation produced no accepted question.",
            },
          ],
        },
  };
}

async function judgeWithGemini(results: Awaited<ReturnType<typeof generateForCase>>[]) {
  const judgeInput = results.map((result) => ({
    id: result.case.id,
    subType: result.case.subType,
    difficulty: result.case.difficulty,
    focus: result.case.focus,
    passage: result.case.passage,
    generatedQuestion: result.question,
    deterministicIssues: result.deterministic.issues,
  }));

  const prompt = [
    "You are a senior Korean CSAT/紐⑥쓽怨좎궗 English question reviewer.",
    "Evaluate each generated question for real exam usability, not mere schema success.",
    "Score strictly from 1 to 5. A pass requires no format blocker, a defensible correct answer, plausible wrong options, and difficulty matching the requested level.",
    "Pay special attention to:",
    "- IMPLIED_MEANING exact Korean direction, passage underline layout, English-only options, and inferred meaning rather than surface paraphrase.",
    "- TOPIC vs MAIN_IDEA distinction.",
    "- TITLE options being title-like.",
    "- SUMMARY_COMPLETE_MC must be the CSAT objective summary-completion type: passage, one English summary sentence with (A)/(B), and five English paired options. Include A-only and B-only near-miss traps.",
    "- Wrong options being attractive but wrong, not nonsense.",
    "- KILLER difficulty requiring synthesis; BASIC being accessible.",
    "Return concise Korean findings.",
    "",
    JSON.stringify(judgeInput, null, 2),
  ].join("\n");

  const result = await generateObject({
    model: geminiModel,
    schema: llmEvaluationSchema,
    prompt,
    maxOutputTokens: 8192,
    abortSignal: AbortSignal.timeout(120_000),
  });

  return result.object;
}

function summarizeQuestion(question: Record<string, unknown> | null) {
  if (!question) return null;
  return {
    typeId: question._typeId,
    difficulty: question.difficulty,
    direction: question.direction,
    correctAnswer: question.correctAnswer,
    targetExpression: question.targetExpression,
    options: question.options,
    explanation: question.explanation,
    keyPoints: question.keyPoints,
    wrongOptionExplanations: question.wrongOptionExplanations,
    summaryWithBlanks: question.summaryWithBlanks,
    blanks: question.blanks,
    passageWithUnderline: question.passageWithUnderline,
    passageWithBlank: question.passageWithBlank,
    passageWithMarkers: question.passageWithMarkers,
    markedExpressions: question.markedExpressions,
  };
}

function buildHtmlReport(
  results: Awaited<ReturnType<typeof generateForCase>>[],
  llmEvaluation: z.infer<typeof llmEvaluationSchema>,
) {
  const evaluationById = new Map(llmEvaluation.cases.map((item) => [item.id, item]));
  const sections = results.map((result) => {
    const evaluation = evaluationById.get(result.case.id);
    const deterministicIssues = result.deterministic.issues
      .map((issue) => `<li><strong>${issue.severity}</strong> ${issue.code}: ${escapeHtml(issue.message)}</li>`)
      .join("");
    const llmIssues = (evaluation?.issues ?? [])
      .map((issue) => `<li><strong>${issue.severity}</strong> ${escapeHtml(issue.message)}</li>`)
      .join("");
    return `
      <section>
        <h2>${escapeHtml(result.case.id)} 쨌 ${escapeHtml(result.case.subType)} 쨌 ${escapeHtml(result.case.difficulty)}</h2>
        <p class="focus">${escapeHtml(result.case.focus)}</p>
        <div class="score">LLM score: ${evaluation?.overallScore ?? "n/a"} / 5 쨌 pass: ${evaluation?.pass ?? false}</div>
        <h3>Rendered UI</h3>
        <div class="rendered">${result.html}</div>
        <h3>Deterministic Issues</h3>
        <ul>${deterministicIssues || "<li>None</li>"}</ul>
        <h3>LLM Reviewer Issues</h3>
        <ul>${llmIssues || "<li>None</li>"}</ul>
      </section>
    `;
  });

  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <title>Question Generation Quality Verification</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 24px; color: #172033; background: #f8fafc; }
    h1 { font-size: 24px; margin-bottom: 8px; }
    h2 { font-size: 18px; margin: 0 0 6px; }
    h3 { font-size: 13px; margin: 18px 0 8px; color: #475569; }
    section { background: white; border: 1px solid #dbe3ef; border-radius: 8px; padding: 18px; margin: 16px 0; }
    .focus { color: #475569; margin: 0 0 8px; }
    .score { font-weight: 700; color: #0f766e; margin-bottom: 12px; }
    .rendered { border: 1px solid #dbe3ef; border-radius: 8px; padding: 14px; background: #fff; }
    ul { margin: 0; padding-left: 18px; }
    li { margin: 4px 0; }
    .rounded-lg { border-radius: 8px; }
    .border { border: 1px solid #dbe3ef; }
    .bg-white { background: white; }
    .bg-slate-50 { background: #f8fafc; }
    .bg-blue-600 { background: #2563eb; }
    .bg-slate-100 { background: #f1f5f9; }
    .text-white { color: white; }
    .text-blue-700 { color: #1d4ed8; }
    .text-slate-700 { color: #334155; }
    .text-slate-600 { color: #475569; }
    .text-slate-400 { color: #94a3b8; }
    .font-bold { font-weight: 700; }
    .font-semibold { font-weight: 600; }
    .font-mono { font-family: Consolas, "Courier New", monospace; }
    .underline { text-decoration-line: underline; text-decoration-thickness: 2px; text-underline-offset: 4px; }
    .space-y-3 > * + * { margin-top: 12px; }
    .space-y-1\\.5 > * + * { margin-top: 6px; }
    .p-4 { padding: 16px; }
    .p-3 { padding: 12px; }
    .pl-1 { padding-left: 4px; }
    .flex { display: flex; }
    .items-start { align-items: flex-start; }
    .items-center { align-items: center; }
    .justify-between { justify-content: space-between; }
    .gap-2 { gap: 8px; }
    .gap-1 { gap: 4px; }
    .shrink-0 { flex-shrink: 0; }
    .w-5 { width: 20px; }
    .h-5 { height: 20px; }
    .rounded-full { border-radius: 9999px; }
    .leading-\\[1\\.9\\] { line-height: 1.9; }
    .whitespace-pre-wrap { white-space: pre-wrap; }
    .text-\\[13px\\] { font-size: 13px; }
    .text-\\[12\\.5px\\] { font-size: 12.5px; }
    .text-\\[10px\\] { font-size: 10px; }
    .inline-flex { display: inline-flex; }
    .justify-center { justify-content: center; }
  </style>
</head>
<body>
  <h1>Question Generation Quality Verification</h1>
  <p>Generated through the real auto-generation pipeline, then checked with deterministic rules and a Gemini reviewer.</p>
  ${sections.join("\n")}
</body>
</html>`;
}

function escapeHtml(value: unknown): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function main() {
  if (!process.env.ATLASCLOUD_API_KEY && !process.env.OPENROUTER_API_KEY) {
    throw new Error("ATLASCLOUD_API_KEY or OPENROUTER_API_KEY must be set.");
  }

  await fs.mkdir(OUT_DIR, { recursive: true });

  const results: Awaited<ReturnType<typeof generateForCase>>[] = [];
  for (const testCase of CASES) {
    console.log(`[VERIFY] Generating ${testCase.id}...`);
    results.push(await generateForCase(testCase));
  }

  console.log("[VERIFY] Running Atlas quality reviewer...");
  const llmEvaluation = await judgeWithGemini(results);

  const report = {
    generatedAt: new Date().toISOString(),
    model: process.env.ATLASCLOUD_TEXT_MODEL ?? "google/gemini-3.5-flash",
    cases: results.map((result) => ({
      id: result.case.id,
      subType: result.case.subType,
      difficulty: result.case.difficulty,
      focus: result.case.focus,
      generation: result.generation,
      deterministic: result.deterministic,
      llmEvaluation: llmEvaluation.cases.find((item) => item.id === result.case.id) ?? null,
      question: summarizeQuestion(result.question),
      ui: {
        htmlLength: result.html.length,
        containsSourcePassage: result.html.includes(result.case.passage.slice(0, 48)),
        containsUnderlineClass: result.html.includes("underline decoration-2"),
        containsAbovePassagePlaceholder: result.html.includes("??吏臾?),
        containsTargetExpressionBox: result.html.includes("諛묒쨪 ?쒗쁽"),
      },
    })),
  };

  const jsonPath = path.join(OUT_DIR, "report.json");
  const htmlPath = path.join(OUT_DIR, "report.html");
  await fs.writeFile(jsonPath, JSON.stringify(report, null, 2), "utf8");
  await fs.writeFile(htmlPath, buildHtmlReport(results, llmEvaluation), "utf8");

  const consoleSummary = report.cases.map((item) => ({
    id: item.id,
    type: item.subType,
    difficulty: item.difficulty,
    generated: item.generation.count,
    deterministicErrors: item.deterministic.errorCount,
    deterministicWarnings: item.deterministic.warningCount,
    llmScore: item.llmEvaluation?.overallScore ?? null,
    llmPass: item.llmEvaluation?.pass ?? null,
    topIssues: [
      ...item.deterministic.issues.map((issue) => `${issue.severity}:${issue.code}`),
      ...(item.llmEvaluation?.issues ?? []).map((issue) => `${issue.severity}:${issue.message}`),
    ].slice(0, 4),
  }));

  console.log("[VERIFY] Report JSON:", jsonPath);
  console.log("[VERIFY] Report HTML:", htmlPath);
  console.log(JSON.stringify(consoleSummary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
