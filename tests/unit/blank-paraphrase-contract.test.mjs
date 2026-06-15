import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

const harnessSource = `
import pp from "@/lib/question-postprocess";
import quality from "@/lib/question-quality";

const { postProcessQuestion } = pp;
const { validateQuestionQuality } = quality;

const passage = [
  "Students remember new information better when they connect new facts to personal experiences.",
  "This connection gives abstract ideas a familiar anchor and makes later recall easier.",
  "By building such anchors, learners turn isolated facts into knowledge they can use."
].join(" ");

const baseQuestion = {
  direction: "Choose the best expression for the blank.",
  originalExpression: "connect new facts to personal experiences",
  surroundingText: "remember new information better when they connect new facts to personal experiences. This connection",
  correctAnswer: "1",
  explanation: "The blank must explain why personal connection improves memory.",
  wrongOptionExplanations: {
    "2": "It reverses the relation between new facts and familiar experience.",
    "3": "It mentions abstract ideas but removes the anchor relation.",
    "4": "It borrows later recall but turns the process into guessing.",
    "5": "It refers to anchors but says students ignore them."
  },
  keyPoints: ["memory anchor", "personal connection", "recall"],
  tags: ["blank paraphrase"],
  difficulty: "BASIC",
};

const defaultModeQuestion = {
  ...baseQuestion,
  options: [
    { label: "1", text: "link new facts with their own experiences" },
    { label: "2", text: "separate new facts from familiar moments" },
    { label: "3", text: "repeat abstract ideas without any anchor" },
    { label: "4", text: "replace later recall with quick guessing" },
    { label: "5", text: "ignore the anchors that support memory" }
  ],
};

const exactParaphraseQuestion = {
  ...baseQuestion,
  blankAnswerMode: "PARAPHRASE",
  answerLogic: "정답은 원문의 personal experience 연결 관계를 보존해야 하지만, 이 샘플은 원문을 그대로 복사했다.",
  options: [
    { label: "1", text: "connect new facts to personal experiences" },
    { label: "2", text: "separate new facts from familiar moments" },
    { label: "3", text: "repeat abstract ideas without any anchor" },
    { label: "4", text: "replace later recall with quick guessing" },
    { label: "5", text: "ignore the anchors that support memory" }
  ],
};

const goodParaphraseQuestion = {
  ...baseQuestion,
  blankAnswerMode: "PARAPHRASE",
  answerLogic: "정답은 원문의 connect new facts to personal experiences를 직접 복사하지 않고, 새 정보와 자기 경험을 연결한다는 의미를 쉬운 표현으로 바꾼 것이다.",
  options: [
    { label: "1", text: "link new facts with their own experiences" },
    { label: "2", text: "separate new facts from familiar moments" },
    { label: "3", text: "repeat abstract ideas without any anchor" },
    { label: "4", text: "replace later recall with quick guessing" },
    { label: "5", text: "ignore the anchors that support memory" }
  ],
};

const awkwardParaphraseQuestion = {
  ...baseQuestion,
  blankAnswerMode: "PARAPHRASE",
  answerLogic: "This answer is intentionally awkward and should be rejected by the paraphrase naturalness gate.",
  options: [
    { label: "1", text: "sovereignly filtering external cultural influxes" },
    { label: "2", text: "separate new facts from familiar moments" },
    { label: "3", text: "repeat abstract ideas without any anchor" },
    { label: "4", text: "replace later recall with quick guessing" },
    { label: "5", text: "ignore the anchors that support memory" }
  ],
};

const slotPassage = [
  "The key challenge facing humanity is not whether to adopt these technologies but how to do so in ways that serve human flourishing.",
  "Leaders must weigh their benefits against ethical risks before making decisions."
].join(" ");

const slotMismatchQuestion = {
  direction: "Choose the best expression for the blank.",
  originalExpression: "The key challenge facing humanity",
  surroundingText: "The key challenge facing humanity is not whether to adopt these technologies",
  correctAnswer: "1",
  explanation: "The blank names the subject of a whether/how contrast.",
  wrongOptionExplanations: {
    "2": "It narrows the issue to stopping technology.",
    "3": "It removes the ethical decision frame.",
    "4": "It overstates speed as the main concern.",
    "5": "It shifts the focus to corporate control."
  },
  keyPoints: ["challenge", "technology adoption", "human flourishing"],
  tags: ["blank paraphrase"],
  difficulty: "BASIC",
  blankAnswerMode: "PARAPHRASE",
  answerLogic: "The source names the main challenge, but this answer changes it into a gerund process phrase that does not fit the whether/how subject frame.",
  options: [
    { label: "1", text: "balancing the advantages and drawbacks of technology" },
    { label: "2", text: "stopping every new form of technology" },
    { label: "3", text: "avoiding ethical choices about technology" },
    { label: "4", text: "speeding up all technological innovation" },
    { label: "5", text: "giving companies control over technology" }
  ],
};

const polarityPassage = [
  "Understanding art requires resisting the temptation to reduce it to a single function.",
  "A serious interpretation should preserve the many purposes art can serve in society."
].join(" ");

const polarityLossQuestion = {
  direction: "Choose the best expression for the blank.",
  originalExpression: "resisting the temptation to reduce it to a single function",
  surroundingText: "Understanding art requires resisting the temptation to reduce it to a single function.",
  correctAnswer: "1",
  explanation: "The blank must preserve the resistance to reduction.",
  wrongOptionExplanations: {
    "2": "It shifts the focus to entertainment alone.",
    "3": "It ignores the social purpose of art.",
    "4": "It treats art as only decoration.",
    "5": "It makes interpretation irrelevant."
  },
  keyPoints: ["art", "multiple functions", "resistance to reduction"],
  tags: ["blank paraphrase"],
  difficulty: "BASIC",
  blankAnswerMode: "PARAPHRASE",
  answerLogic: "This answer is intentionally wrong because it drops the resistance relation and turns the source into the opposite action.",
  options: [
    { label: "1", text: "simplifying the multifaceted purposes of art" },
    { label: "2", text: "treating art as simple entertainment" },
    { label: "3", text: "ignoring the public role of art" },
    { label: "4", text: "using art as decorative material" },
    { label: "5", text: "making interpretation unnecessary" }
  ],
};

const trailingFunctionPassage = [
  "Collaborative innovation networks will become increasingly important for future entrepreneurs.",
  "Such networks help people combine ideas and skills across fields."
].join(" ");

const trailingFunctionQuestion = {
  direction: "Choose the best expression for the blank.",
  originalExpression: "Collaborative innovation networks will",
  surroundingText: "Collaborative innovation networks will become increasingly important",
  correctAnswer: "1",
  explanation: "The blank target incorrectly includes a dangling modal.",
  wrongOptionExplanations: {
    "2": "It denies the role of networks.",
    "3": "It shifts the claim to individual talent.",
    "4": "It overstates patents.",
    "5": "It removes the future importance."
  },
  keyPoints: ["innovation networks", "future importance"],
  tags: ["blank paraphrase"],
  difficulty: "KILLER",
  blankAnswerMode: "PARAPHRASE",
  answerLogic: "This answer is intentionally built from a bad target span ending in a modal auxiliary.",
  options: [
    { label: "1", text: "shared innovation networks are likely to" },
    { label: "2", text: "isolated inventors are unlikely to" },
    { label: "3", text: "technical talent alone will always" },
    { label: "4", text: "patent protection systems should" },
    { label: "5", text: "short-term market trends cannot" }
  ],
};

const duplicatedFramePassage = [
  "This theory overlooks the creative ways in which local communities engage with global cultural flows.",
  "These communities adapt outside influences to local meanings."
].join(" ");

const duplicatedFrameQuestion = {
  direction: "Choose the best expression for the blank.",
  originalExpression: "local communities engage with global cultural flows",
  surroundingText: "overlooks the creative ways in which local communities engage with global cultural flows.",
  correctAnswer: "1",
  explanation: "The option repeats the left-context frame and should be rejected.",
  wrongOptionExplanations: {
    "2": "It reverses local agency.",
    "3": "It overstates global sameness.",
    "4": "It shifts the focus to regulation.",
    "5": "It ignores local adaptation."
  },
  keyPoints: ["local agency", "global cultural flows"],
  tags: ["blank paraphrase"],
  difficulty: "KILLER",
  blankAnswerMode: "PARAPHRASE",
  answerLogic: "This answer is intentionally awkward because the sentence already contains ways in which before the blank.",
  options: [
    { label: "1", text: "the active ways in which local groups negotiate global inputs" },
    { label: "2", text: "foreign media replaces local traditions without resistance" },
    { label: "3", text: "global culture erases every regional difference" },
    { label: "4", text: "governments block cultural exchange through strict rules" },
    { label: "5", text: "local audiences consume imported media passively" }
  ],
};

const clauseSlotPassage = [
  "Genuine happiness cannot be attained through wealth alone; it requires the cultivation of moral character and the active use of one's abilities.",
  "This view treats happiness as an activity rather than a passive state."
].join(" ");

const clauseSlotQuestion = {
  direction: "Choose the best expression for the blank.",
  originalExpression: "it requires the cultivation of moral character",
  surroundingText: "cannot be attained through wealth alone; it requires the cultivation of moral character and the active use",
  correctAnswer: "1",
  explanation: "The source is a finite clause but the option is only a gerund phrase.",
  wrongOptionExplanations: {
    "2": "It shifts the claim to wealth.",
    "3": "It focuses on pleasure.",
    "4": "It removes moral character.",
    "5": "It makes happiness passive."
  },
  keyPoints: ["happiness", "moral character", "finite clause"],
  tags: ["blank paraphrase"],
  difficulty: "BASIC",
  blankAnswerMode: "PARAPHRASE",
  answerLogic: "This answer is intentionally wrong because the blank starts after a semicolon and needs a finite clause, not a bare gerund phrase.",
  options: [
    { label: "1", text: "making moral excellence a key priority" },
    { label: "2", text: "wealth provides the main path" },
    { label: "3", text: "seeking pleasure becomes most important" },
    { label: "4", text: "moral growth is unnecessary" },
    { label: "5", text: "happiness happens without effort" }
  ],
};

const stackedPrepositionPassage = [
  "The wolves altered the course of rivers by allowing vegetation to recover along their banks.",
  "The new plant growth stabilized the river edges."
].join(" ");

const stackedPrepositionQuestion = {
  direction: "Choose the best expression for the blank.",
  originalExpression: "allowing vegetation to recover along their banks",
  surroundingText: "altered the course of rivers by allowing vegetation to recover along their banks.",
  correctAnswer: "1",
  explanation: "The left context already ends with by, so the option must not start with by.",
  wrongOptionExplanations: {
    "2": "It reverses recovery.",
    "3": "It shifts the cause to dams.",
    "4": "It makes migration the cause.",
    "5": "It removes vegetation."
  },
  keyPoints: ["wolves", "riverbanks", "vegetation recovery"],
  tags: ["blank paraphrase"],
  difficulty: "INTERMEDIATE",
  blankAnswerMode: "PARAPHRASE",
  answerLogic: "This answer is intentionally awkward because it creates by by when inserted into the blank.",
  options: [
    { label: "1", text: "by helping plants along the banks grow again" },
    { label: "2", text: "preventing riverside vegetation from returning" },
    { label: "3", text: "building artificial barriers near the water" },
    { label: "4", text: "moving animal migration away from valleys" },
    { label: "5", text: "removing plant roots from the banks" }
  ],
};

const killerTooEasyPassage = [
  "Many sharing platforms claim to build community.",
  "In reality, most are selling access to services much like ordinary firms.",
  "Because they charge fees for every exchange, the arrangement is closer to commerce than generosity."
].join(" ");

const killerTooEasyQuestion = {
  direction: "Choose the best expression for the blank.",
  originalExpression: "selling access to services much like ordinary firms",
  surroundingText: "In reality, most are selling access to services much like ordinary firms. Because they charge",
  correctAnswer: "1",
  explanation: "The blank must capture the commercial nature of the platforms.",
  wrongOptionExplanations: {
    "2": "It overstates community building and ignores the fee-based exchange.",
    "3": "It treats access as a gift rather than a transaction.",
    "4": "It shifts the point to regulation, which the passage does not discuss.",
    "5": "It focuses on friendship rather than the business model."
  },
  keyPoints: ["sharing economy", "commerce", "business model"],
  tags: ["blank paraphrase"],
  difficulty: "KILLER",
  blankAnswerMode: "PARAPHRASE",
  answerLogic: "This intentionally mirrors the weak screenshot-level item: the answer is only a short local synonym, not a true KILLER inference.",
  options: [
    { label: "1", text: "conduct commercial transactions" },
    { label: "2", text: "strengthen communal trust among neighbors" },
    { label: "3", text: "offer resources as generous public gifts" },
    { label: "4", text: "follow strict government rules for every exchange" },
    { label: "5", text: "replace market exchange with personal friendship" }
  ],
};

const standardKillerShallowPassage = [
  'We are taught from an early age that "sharing is caring."',
  "Advocates claim that the sharing economy is driven by the desire to benefit society.",
  "Thanks to popular websites and apps, users can share their cars, their spare bedrooms, their power tools, and even their own time and talents.",
  "And because both parties review each other, these digital platforms create a trusting environment even among complete strangers.",
  'According to one of its earliest supporters, the gig economy takes advantage of "idle capacity" to better utilize assets.',
  "While some sites continue to offer true sharing, most are in fact selling a product, much like a traditional business."
].join(" ");

const standardKillerShallowQuestion = {
  direction: "Choose the best expression for the blank.",
  originalExpression: "both parties review each other",
  surroundingText: "And because both parties review each other, these digital platforms create a trusting environment",
  correctAnswer: "1",
  explanation: "This is intentionally too local for a KILLER source-exact blank.",
  wrongOptionExplanations: {
    "2": "It shifts the focus from mutual reviews to direct payments.",
    "3": "It removes the trust mechanism.",
    "4": "It overstates government control.",
    "5": "It contradicts the platform setting."
  },
  keyPoints: ["sharing economy", "trust", "platforms"],
  tags: ["blank inference"],
  difficulty: "KILLER",
  options: [
    { label: "1", text: "both parties review each other" },
    { label: "2", text: "users pay fixed membership fees" },
    { label: "3", text: "trust becomes unnecessary online" },
    { label: "4", text: "governments inspect every transaction" },
    { label: "5", text: "strangers avoid digital platforms" }
  ],
};

const standardKillerComparisonQuestion = {
  direction: "Choose the best expression for the blank.",
  originalExpression: "selling a product, much like a traditional business",
  surroundingText: "most are in fact selling a product, much like a traditional business. With so much money",
  correctAnswer: "1",
  explanation: "The blank captures the passage's critical turn from sharing to commercial sale.",
  wrongOptionExplanations: {
    "2": "It keeps the sharing ideal that the passage questions.",
    "3": "It narrows the point to reviews rather than commercialization.",
    "4": "It reverses the profit motive.",
    "5": "It overstates environmental benefits."
  },
  keyPoints: ["sharing economy", "commercialization", "critical turn"],
  tags: ["blank inference"],
  difficulty: "KILLER",
  options: [
    { label: "1", text: "selling a product, much like a traditional business" },
    { label: "2", text: "expanding trust as a purely generous social practice" },
    { label: "3", text: "letting both parties review each other online" },
    { label: "4", text: "removing profit from every transaction" },
    { label: "5", text: "guaranteeing benefits for owners and communities" }
  ],
};

const intermediateTooShallowPassage = [
  "The anchoring effect describes our tendency to rely too heavily on the first information we encounter when making subsequent judgments.",
  "Even irrelevant initial numbers can distort the estimates people later produce."
].join(" ");

const intermediateTooShallowQuestion = {
  direction: "Choose the best expression for the blank.",
  originalExpression: "making subsequent judgments",
  surroundingText: "the first information we encounter when making subsequent judgments. Even irrelevant",
  correctAnswer: "1",
  explanation: "The blank names the later judgment process affected by anchoring.",
  wrongOptionExplanations: {
    "2": "It shifts the point to remembering facts.",
    "3": "It removes the later-evaluation relation.",
    "4": "It focuses on social pressure rather than anchoring.",
    "5": "It treats the first information as irrelevant only."
  },
  keyPoints: ["anchoring effect", "judgment", "paraphrase depth"],
  tags: ["blank paraphrase"],
  difficulty: "INTERMEDIATE",
  blankAnswerMode: "PARAPHRASE",
  answerLogic: "This is intentionally too shallow for INTERMEDIATE because it is only a three-word local synonym swap.",
  options: [
    { label: "1", text: "forming subsequent evaluations" },
    { label: "2", text: "recalling unrelated factual details" },
    { label: "3", text: "avoiding later mental comparisons" },
    { label: "4", text: "following social pressure from others" },
    { label: "5", text: "ignoring all initial reference points" }
  ],
};

const targetTooWidePassage = [
  "Fleming's ability to recognize the significance of what he had stumbled upon depended critically on his extensive training.",
  "Other researchers may have seen similar contamination without understanding its implications."
].join(" ");

const targetTooWideQuestion = {
  direction: "Choose the best expression for the blank.",
  originalExpression: "ability to recognize the significance of what he had stumbled upon depended critically on",
  surroundingText: "Fleming's ability to recognize the significance of what he had stumbled upon depended critically on his extensive training.",
  correctAnswer: "1",
  explanation: "The target is intentionally too broad for a clean paraphrase blank.",
  wrongOptionExplanations: {
    "2": "It changes recognition into publication.",
    "3": "It treats contamination as something predicted in advance.",
    "4": "It shifts the cause to institutional approval.",
    "5": "It removes Fleming's prepared understanding."
  },
  keyPoints: ["target width", "scientific discovery", "paraphrase"],
  tags: ["blank paraphrase"],
  difficulty: "INTERMEDIATE",
  blankAnswerMode: "PARAPHRASE",
  answerLogic: "The answer is reasonable, but the source target itself is a long clause and should be narrowed before generation.",
  options: [
    { label: "1", text: "capacity to discern the value of his accidental findings was highly contingent upon" },
    { label: "2", text: "attempt to publicize the medical benefits of his experiment was delayed by" },
    { label: "3", text: "capacity to predict contamination before it occurred was supported by" },
    { label: "4", text: "request for institutional approval of the discovery depended on" },
    { label: "5", text: "decision to dismiss the mold as meaningless came from" }
  ],
};

const infinitiveGerundPassage = [
  "A healthy democracy depends on citizens' capacity to evaluate competing claims before accepting them.",
  "Public judgment weakens when people repeat slogans without testing the evidence behind them."
].join(" ");

const infinitiveGerundQuestion = {
  direction: "Choose the best expression for the blank.",
  originalExpression: "evaluate competing claims before accepting them",
  surroundingText: "depends on citizens' capacity to evaluate competing claims before accepting them. Public judgment",
  correctAnswer: "1",
  explanation: "The blank follows capacity to, so the option must complete an infinitive phrase.",
  wrongOptionExplanations: {
    "2": "It accepts slogans without evidence.",
    "3": "It shifts judgment to party loyalty.",
    "4": "It removes the evidence-checking process.",
    "5": "It treats repetition as enough for judgment."
  },
  keyPoints: ["infinitive slot", "public judgment", "evidence"],
  tags: ["blank paraphrase"],
  difficulty: "KILLER",
  blankAnswerMode: "PARAPHRASE",
  answerLogic: "This answer is semantically close but grammatically broken after capacity to because it begins with an adverb plus gerund.",
  options: [
    { label: "1", text: "critically evaluating and weighing public arguments" },
    { label: "2", text: "accept slogans before checking their evidence" },
    { label: "3", text: "depend on party loyalty over evidence" },
    { label: "4", text: "avoid testing the claims they hear" },
    { label: "5", text: "repeat familiar claims until they sound true" }
  ],
};

const killerGiveawayPassage = [
  "Sustainable cities do not succeed simply by adding parks.",
  "They work when urban systems reinforce one another and keep green gains socially usable.",
  "This coordination prevents green reforms from becoming isolated symbols."
].join(" ");

const killerGiveawayQuestion = {
  direction: "Choose the best expression for the blank.",
  originalExpression: "urban systems reinforce one another and keep green gains socially usable",
  surroundingText: "They work when urban systems reinforce one another and keep green gains socially usable. This coordination",
  correctAnswer: "1",
  explanation: "The blank must connect environmental improvement with coordinated social usability.",
  wrongOptionExplanations: {
    "2": "It uses the city's topic but overstates all programs and ignores coordination.",
    "3": "It reverses the reinforcement relation by separating goals from access.",
    "4": "It borrows ecological language but makes the city passive.",
    "5": "It narrows the passage to parks rather than systems."
  },
  keyPoints: ["sustainable cities", "coordination", "near-miss distractors"],
  tags: ["blank paraphrase"],
  difficulty: "KILLER",
  blankAnswerMode: "PARAPHRASE",
  answerLogic: "The correct answer is rich enough, but the wrong options rely on obvious extreme/passive cues and should be rejected for KILLER.",
  options: [
    { label: "1", text: "linking policy domains so ecological improvements remain practically accessible" },
    { label: "2", text: "unconditionally expanding every urban program regardless of social use" },
    { label: "3", text: "completely separating environmental goals from public access" },
    { label: "4", text: "passively waiting for market habits to solve ecological problems" },
    { label: "5", text: "strictly adding more parks without coordinating city systems" }
  ],
};

const defaultProcessed = postProcessQuestion("BLANK_INFERENCE", passage, defaultModeQuestion);
const exactProcessed = postProcessQuestion("BLANK_INFERENCE", passage, exactParaphraseQuestion);
const goodProcessed = postProcessQuestion("BLANK_INFERENCE", passage, goodParaphraseQuestion);
const awkwardProcessed = postProcessQuestion("BLANK_INFERENCE", passage, awkwardParaphraseQuestion);
const slotMismatchProcessed = postProcessQuestion("BLANK_INFERENCE", slotPassage, slotMismatchQuestion);
const polarityLossProcessed = postProcessQuestion("BLANK_INFERENCE", polarityPassage, polarityLossQuestion);
const trailingFunctionProcessed = postProcessQuestion("BLANK_INFERENCE", trailingFunctionPassage, trailingFunctionQuestion);
const duplicatedFrameProcessed = postProcessQuestion("BLANK_INFERENCE", duplicatedFramePassage, duplicatedFrameQuestion);
const clauseSlotProcessed = postProcessQuestion("BLANK_INFERENCE", clauseSlotPassage, clauseSlotQuestion);
const stackedPrepositionProcessed = postProcessQuestion("BLANK_INFERENCE", stackedPrepositionPassage, stackedPrepositionQuestion);
const killerTooEasyProcessed = postProcessQuestion("BLANK_INFERENCE", killerTooEasyPassage, killerTooEasyQuestion);
const standardKillerShallowProcessed = postProcessQuestion("BLANK_INFERENCE", standardKillerShallowPassage, standardKillerShallowQuestion);
const standardKillerComparisonProcessed = postProcessQuestion("BLANK_INFERENCE", standardKillerShallowPassage, standardKillerComparisonQuestion);
const intermediateTooShallowProcessed = postProcessQuestion("BLANK_INFERENCE", intermediateTooShallowPassage, intermediateTooShallowQuestion);
const targetTooWideProcessed = postProcessQuestion("BLANK_INFERENCE", targetTooWidePassage, targetTooWideQuestion);
const infinitiveGerundProcessed = postProcessQuestion("BLANK_INFERENCE", infinitiveGerundPassage, infinitiveGerundQuestion);
const killerGiveawayProcessed = postProcessQuestion("BLANK_INFERENCE", killerGiveawayPassage, killerGiveawayQuestion);

const exactQuality = exactProcessed.success
  ? validateQuestionQuality({
      typeId: "BLANK_INFERENCE",
      question: exactProcessed.data,
      passage,
      requestedDifficulty: "BASIC",
      blankInferenceParaphraseAnswer: true,
    })
  : [];

const goodQuality = goodProcessed.success
  ? validateQuestionQuality({
      typeId: "BLANK_INFERENCE",
      question: goodProcessed.data,
      passage,
      requestedDifficulty: "BASIC",
      blankInferenceParaphraseAnswer: true,
    })
  : [];

const awkwardQuality = awkwardProcessed.success
  ? validateQuestionQuality({
      typeId: "BLANK_INFERENCE",
      question: awkwardProcessed.data,
      passage,
      requestedDifficulty: "BASIC",
      blankInferenceParaphraseAnswer: true,
    })
  : [];

const slotMismatchQuality = slotMismatchProcessed.success
  ? validateQuestionQuality({
      typeId: "BLANK_INFERENCE",
      question: slotMismatchProcessed.data,
      passage: slotPassage,
      requestedDifficulty: "BASIC",
      blankInferenceParaphraseAnswer: true,
    })
  : [];

const polarityLossQuality = polarityLossProcessed.success
  ? validateQuestionQuality({
      typeId: "BLANK_INFERENCE",
      question: polarityLossProcessed.data,
      passage: polarityPassage,
      requestedDifficulty: "BASIC",
      blankInferenceParaphraseAnswer: true,
    })
  : [];

const trailingFunctionQuality = trailingFunctionProcessed.success
  ? validateQuestionQuality({
      typeId: "BLANK_INFERENCE",
      question: trailingFunctionProcessed.data,
      passage: trailingFunctionPassage,
      requestedDifficulty: "KILLER",
      blankInferenceParaphraseAnswer: true,
    })
  : [];

const duplicatedFrameQuality = duplicatedFrameProcessed.success
  ? validateQuestionQuality({
      typeId: "BLANK_INFERENCE",
      question: duplicatedFrameProcessed.data,
      passage: duplicatedFramePassage,
      requestedDifficulty: "KILLER",
      blankInferenceParaphraseAnswer: true,
    })
  : [];

const clauseSlotQuality = clauseSlotProcessed.success
  ? validateQuestionQuality({
      typeId: "BLANK_INFERENCE",
      question: clauseSlotProcessed.data,
      passage: clauseSlotPassage,
      requestedDifficulty: "BASIC",
      blankInferenceParaphraseAnswer: true,
    })
  : [];

const stackedPrepositionQuality = stackedPrepositionProcessed.success
  ? validateQuestionQuality({
      typeId: "BLANK_INFERENCE",
      question: stackedPrepositionProcessed.data,
      passage: stackedPrepositionPassage,
      requestedDifficulty: "INTERMEDIATE",
      blankInferenceParaphraseAnswer: true,
    })
  : [];

const killerTooEasyQuality = killerTooEasyProcessed.success
  ? validateQuestionQuality({
      typeId: "BLANK_INFERENCE",
      question: killerTooEasyProcessed.data,
      passage: killerTooEasyPassage,
      requestedDifficulty: "KILLER",
      blankInferenceParaphraseAnswer: true,
    })
  : [];

const standardKillerShallowQuality = standardKillerShallowProcessed.success
  ? validateQuestionQuality({
      typeId: "BLANK_INFERENCE",
      question: standardKillerShallowProcessed.data,
      passage: standardKillerShallowPassage,
      requestedDifficulty: "KILLER",
    })
  : [];

const standardKillerComparisonQuality = standardKillerComparisonProcessed.success
  ? validateQuestionQuality({
      typeId: "BLANK_INFERENCE",
      question: standardKillerComparisonProcessed.data,
      passage: standardKillerShallowPassage,
      requestedDifficulty: "KILLER",
    })
  : [];

const intermediateTooShallowQuality = intermediateTooShallowProcessed.success
  ? validateQuestionQuality({
      typeId: "BLANK_INFERENCE",
      question: intermediateTooShallowProcessed.data,
      passage: intermediateTooShallowPassage,
      requestedDifficulty: "INTERMEDIATE",
      blankInferenceParaphraseAnswer: true,
    })
  : [];

const targetTooWideQuality = targetTooWideProcessed.success
  ? validateQuestionQuality({
      typeId: "BLANK_INFERENCE",
      question: targetTooWideProcessed.data,
      passage: targetTooWidePassage,
      requestedDifficulty: "INTERMEDIATE",
      blankInferenceParaphraseAnswer: true,
    })
  : [];

const infinitiveGerundQuality = infinitiveGerundProcessed.success
  ? validateQuestionQuality({
      typeId: "BLANK_INFERENCE",
      question: infinitiveGerundProcessed.data,
      passage: infinitiveGerundPassage,
      requestedDifficulty: "KILLER",
      blankInferenceParaphraseAnswer: true,
    })
  : [];

const killerGiveawayQuality = killerGiveawayProcessed.success
  ? validateQuestionQuality({
      typeId: "BLANK_INFERENCE",
      question: killerGiveawayProcessed.data,
      passage: killerGiveawayPassage,
      requestedDifficulty: "KILLER",
      blankInferenceParaphraseAnswer: true,
    })
  : [];

process.stdout.write(JSON.stringify({
  defaultProcessed,
  exactProcessed,
  goodProcessed,
  awkwardProcessed,
  slotMismatchProcessed,
  polarityLossProcessed,
  trailingFunctionProcessed,
  duplicatedFrameProcessed,
  clauseSlotProcessed,
  stackedPrepositionProcessed,
  killerTooEasyProcessed,
  standardKillerShallowProcessed,
  standardKillerComparisonProcessed,
  intermediateTooShallowProcessed,
  targetTooWideProcessed,
  infinitiveGerundProcessed,
  killerGiveawayProcessed,
  exactQuality,
  goodQuality,
  awkwardQuality,
  slotMismatchQuality,
  polarityLossQuality,
  trailingFunctionQuality,
  duplicatedFrameQuality,
  clauseSlotQuality,
  stackedPrepositionQuality,
  killerTooEasyQuality,
  standardKillerShallowQuality,
  standardKillerComparisonQuality,
  intermediateTooShallowQuality,
  targetTooWideQuality,
  infinitiveGerundQuality,
  killerGiveawayQuality,
}));
`;

function runHarness() {
  const tmpDir = path.join(repoRoot, "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const harnessPath = path.join(tmpDir, ".blank-paraphrase-harness.mts");
  try {
    writeFileSync(harnessPath, harnessSource, "utf8");
    const raw = execSync(`npx tsx "${harnessPath}"`, {
      cwd: repoRoot,
      encoding: "utf8",
      env: { ...process.env, NODE_OPTIONS: "" },
    });
    return JSON.parse(raw);
  } finally {
    try {
      rmSync(harnessPath);
    } catch {
      // ignore
    }
  }
}

const result = runHarness();

test("default BLANK_INFERENCE still auto-fixes a non-source correct option", () => {
  assert.equal(result.defaultProcessed.success, true, result.defaultProcessed.error);
  const correct = result.defaultProcessed.data.options.find((option) => option.label === "1");
  assert.equal(correct.text, "connect new facts to personal experiences");
});

test("PARAPHRASE mode rejects a verbatim source correct option", () => {
  assert.equal(result.exactProcessed.success, true, result.exactProcessed.error);
  const codes = new Set(result.exactQuality.map((issue) => issue.code));
  assert.equal(codes.has("blank-paraphrase-answer-not-transformed"), true);
});

test("PARAPHRASE mode accepts a balanced difficulty-calibrated paraphrase", () => {
  assert.equal(result.goodProcessed.success, true, result.goodProcessed.error);
  assert.deepEqual(
    result.goodQuality.filter((issue) => issue.severity === "error"),
    [],
  );
});

test("PARAPHRASE mode rejects stilted non-exam paraphrase wording", () => {
  assert.equal(result.awkwardProcessed.success, true, result.awkwardProcessed.error);
  const codes = new Set(result.awkwardQuality.map((issue) => issue.code));
  assert.equal(codes.has("blank-awkward-correct-option"), true);
});

test("PARAPHRASE mode rejects gerund process answers in a challenge subject slot", () => {
  assert.equal(result.slotMismatchProcessed.success, true, result.slotMismatchProcessed.error);
  const codes = new Set(result.slotMismatchQuality.map((issue) => issue.code));
  assert.equal(codes.has("blank-paraphrase-subject-slot-mismatch"), true);
});

test("PARAPHRASE mode rejects answers that reverse a resistance relation", () => {
  assert.equal(result.polarityLossProcessed.success, true, result.polarityLossProcessed.error);
  const codes = new Set(result.polarityLossQuality.map((issue) => issue.code));
  assert.equal(codes.has("blank-paraphrase-polarity-loss"), true);
});

test("PARAPHRASE mode rejects target spans ending with a dangling auxiliary", () => {
  assert.equal(result.trailingFunctionProcessed.success, true, result.trailingFunctionProcessed.error);
  const codes = new Set(result.trailingFunctionQuality.map((issue) => issue.code));
  assert.equal(codes.has("blank-paraphrase-target-trailing-function"), true);
});

test("PARAPHRASE mode rejects options that duplicate a left-context frame", () => {
  assert.equal(result.duplicatedFrameProcessed.success, true, result.duplicatedFrameProcessed.error);
  const codes = new Set(result.duplicatedFrameQuality.map((issue) => issue.code));
  assert.equal(codes.has("blank-awkward-option"), true);
});

test("PARAPHRASE mode rejects gerund phrases in finite-clause slots", () => {
  assert.equal(result.clauseSlotProcessed.success, true, result.clauseSlotProcessed.error);
  const codes = new Set(result.clauseSlotQuality.map((issue) => issue.code));
  assert.equal(codes.has("blank-paraphrase-clause-slot-mismatch"), true);
});

test("PARAPHRASE mode rejects options that stack prepositions with the left context", () => {
  assert.equal(result.stackedPrepositionProcessed.success, true, result.stackedPrepositionProcessed.error);
  const codes = new Set(result.stackedPrepositionQuality.map((issue) => issue.code));
  assert.equal(codes.has("blank-awkward-option"), true);
});

test("KILLER PARAPHRASE rejects screenshot-level short local synonym answers", () => {
  assert.equal(result.killerTooEasyProcessed.success, true, result.killerTooEasyProcessed.error);
  const codes = new Set(result.killerTooEasyQuality.map((issue) => issue.code));
  assert.equal(codes.has("blank-paraphrase-killer-too-easy"), true);
});

test("KILLER standard BLANK_INFERENCE rejects shallow reciprocal source tails", () => {
  assert.equal(result.standardKillerShallowProcessed.success, true, result.standardKillerShallowProcessed.error);
  const codes = new Set(result.standardKillerShallowQuality.map((issue) => issue.code));
  assert.equal(codes.has("blank-killer-target-too-easy"), true);
});

test("KILLER standard BLANK_INFERENCE allows a single comparison comma target", () => {
  assert.equal(result.standardKillerComparisonProcessed.success, true, result.standardKillerComparisonProcessed.error);
  const codes = new Set(result.standardKillerComparisonQuality.map((issue) => issue.code));
  assert.equal(codes.has("blank-target-list-like"), false);
});

test("INTERMEDIATE PARAPHRASE rejects three-word local synonym swaps", () => {
  assert.equal(result.intermediateTooShallowProcessed.success, true, result.intermediateTooShallowProcessed.error);
  const codes = new Set(result.intermediateTooShallowQuality.map((issue) => issue.code));
  assert.equal(codes.has("blank-paraphrase-difficulty-mismatch"), true);
});

test("PARAPHRASE mode rejects overly broad source target spans", () => {
  assert.equal(result.targetTooWideProcessed.success, true, result.targetTooWideProcessed.error);
  const codes = new Set(result.targetTooWideQuality.map((issue) => issue.code));
  assert.equal(codes.has("blank-paraphrase-target-too-wide"), true);
});

test("PARAPHRASE mode rejects adverb plus gerund answers after an infinitive marker", () => {
  assert.equal(result.infinitiveGerundProcessed.success, true, result.infinitiveGerundProcessed.error);
  const codes = new Set(result.infinitiveGerundQuality.map((issue) => issue.code));
  assert.equal(codes.has("blank-paraphrase-verb-form-slot-mismatch"), true);
});

test("KILLER PARAPHRASE rejects giveaway extreme distractor sets", () => {
  assert.equal(result.killerGiveawayProcessed.success, true, result.killerGiveawayProcessed.error);
  const codes = new Set(result.killerGiveawayQuality.map((issue) => issue.code));
  assert.equal(codes.has("blank-paraphrase-killer-giveaway-distractors"), true);
});
