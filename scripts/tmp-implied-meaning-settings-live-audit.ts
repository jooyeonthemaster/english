/**
 * Live audit for IMPLIED_MEANING with new passages and varied generation settings.
 *
 * Covers STANDARD/PREMIUM, option counts, multi-answer variants, and visible
 * stem/option language settings. Writes incremental JSON so long PREMIUM runs
 * can be inspected mid-flight.
 */
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config({ path: path.join(process.cwd(), ".env") });
dotenv.config({ path: path.join(process.cwd(), ".env.local"), override: true });

import { runQuestionGenerationWithEmptyRetry } from "../src/app/api/ai/generate-questions-auto/_lib/run-question-generation";
import { validateQuestionQuality, type QuestionQualityIssue } from "../src/lib/question-quality";
import type { QuestionGenerationPlan } from "../src/lib/question-generation-plans";

const OUTDIR = path.join(process.cwd(), "scripts", "_gen_audit_out");
const OUTPATH = path.join(OUTDIR, "implied-meaning-settings-live-audit.json");
const LOG_PREFIX = "IMPLIED-SETTINGS";
const MAX_ATTEMPTS = Math.max(1, Number(process.env.MAX_ATTEMPTS || 3));
const RUN_LIMIT = Math.max(1, Number(process.env.SETTINGS_AUDIT_LIMIT || 24));
const START_INDEX = Math.max(0, Number(process.env.START_INDEX || 0));

type Lang = "ko" | "en";

type PassageCase = {
  id: string;
  domain: string;
  modeHint: string;
  text: string;
};

type SettingCase = {
  id: string;
  plan: QuestionGenerationPlan;
  optionCount: number;
  answerCount: number;
  stemLanguage: Lang;
  optionLanguage: Lang;
  difficulty: "INTERMEDIATE" | "KILLER";
};

type GeneratedQuestion = Record<string, unknown>;

type WholeIssue = {
  severity: "critical" | "major" | "minor";
  code: string;
  message: string;
  evidence?: string;
};

const PASSAGES: PassageCase[] = [
  {
    id: "sleep-darkness",
    domain: "health",
    modeHint: "metaphor in final sentence",
    text: "Modern bedrooms are often designed to keep the day from ending. Phones glow beside the pillow, emails arrive after midnight, and small notifications make the mind keep checking for unfinished business. Sleep researchers note that darkness is not just the absence of light; it is a signal that lets the body stop negotiating with the day.",
  },
  {
    id: "river-maps",
    domain: "geography",
    modeHint: "compressed contrast",
    text: "A map of a river may show a clean blue line, but no river is only a line on paper. It gathers soil, stories, borders, fish, factories, and floods as it moves. To understand a river, one must read the land around it, not simply trace the water.",
  },
  {
    id: "algorithmic-bias",
    domain: "technology",
    modeHint: "abstract central claim",
    text: "A hiring algorithm can appear neutral because it applies the same formula to every applicant. Yet the data used to train it may contain older patterns of exclusion. In that case, automation does not remove judgment; it can freeze yesterday's judgment inside today's machinery.",
  },
  {
    id: "school-lunch",
    domain: "education",
    modeHint: "policy implication",
    text: "School lunch programs are sometimes discussed only as a way to fill empty stomachs. Hunger matters, but a meal also shapes attention, dignity, and the feeling that school is a place prepared for the student. A tray of food can therefore become part of the lesson before any textbook is opened.",
  },
  {
    id: "coral-tourism",
    domain: "environment",
    modeHint: "surface benefit vs hidden cost",
    text: "Tourists often admire coral reefs through glass-bottom boats and underwater cameras. The visits can bring income to coastal towns, but too much traffic, sunscreen, and careless anchoring can injure the very reefs people came to see. A reef can become famous and fragile at the same time.",
  },
  {
    id: "public-apology",
    domain: "rhetoric",
    modeHint: "speech act",
    text: "Public apologies often contain the sentence everyone expects to hear. But an apology is not measured only by the presence of the word sorry. It must name the harm, accept responsibility, and change the conditions that made the harm possible. Otherwise, the apology is a door painted on a wall.",
  },
  {
    id: "citizen-science",
    domain: "science",
    modeHint: "role redefinition",
    text: "When volunteers count birds or record local temperatures, professional scientists do not simply gain more hands. They gain eyes placed in many neighborhoods and seasons that a single laboratory could never occupy. Citizen science turns observation into a shared instrument.",
  },
  {
    id: "microcredit",
    domain: "economics",
    modeHint: "double-edged tool",
    text: "Small loans are often praised because they let people begin projects without waiting for large investors. But debt can also narrow choices when income is uncertain and repayment schedules are rigid. A loan is a bridge only if it does not become the place where someone is trapped.",
  },
  {
    id: "language-accent",
    domain: "language",
    modeHint: "identity signal",
    text: "An accent is sometimes treated as a mistake left over after learning a language. Yet accents carry movement, family, region, and memory. To hear only error in an accent is to mistake a history for a defect.",
  },
  {
    id: "urban-benches",
    domain: "urban-design",
    modeHint: "object as civic signal",
    text: "A bench looks like a simple object for sitting. In a city, however, its presence says who is allowed to pause, wait, meet, or belong without buying anything. Removing benches can make a street cleaner on paper while making it less public in practice.",
  },
  {
    id: "scientific-failure",
    domain: "science",
    modeHint: "negative result",
    text: "A failed experiment can feel like an empty result because it does not confirm the hoped-for answer. But failure may close a false path, reveal a hidden assumption, or make a question more precise. In research, a dead end can still redraw the map.",
  },
  {
    id: "family-recipes",
    domain: "culture",
    modeHint: "archive metaphor",
    text: "A family recipe may list ingredients in a neat order, but the real knowledge often lives in gestures: how thick the dough should feel, when the smell changes, which shortcut an elder refuses to take. The recipe card is less an instruction sheet than a small archive of belonging.",
  },
  {
    id: "disaster-drills",
    domain: "safety",
    modeHint: "practice vs panic",
    text: "Emergency drills can seem artificial because everyone knows the alarm is only practice. Yet practice gives people a script before fear has time to write one. The purpose of a drill is not to imitate panic perfectly, but to keep panic from becoming the author of action.",
  },
  {
    id: "museum-replica",
    domain: "arts",
    modeHint: "authenticity nuance",
    text: "A museum replica may lack the age of the original object, but it can invite touch, close looking, and learning without risking damage. Authenticity is not always located only in the material itself. Sometimes a copy can protect the original while opening the experience.",
  },
  {
    id: "subscription-fatigue",
    domain: "business",
    modeHint: "convenience trap",
    text: "Subscription services promise convenience by turning separate purchases into automatic renewals. The problem begins when ease hides accumulation: music, storage, fitness, news, and software all quietly claim a small monthly space. Convenience can become a wallet with invisible doors.",
  },
  {
    id: "wildlife-corridors",
    domain: "biology",
    modeHint: "infrastructure for movement",
    text: "A protected forest is valuable, but animals do not live according to the borders drawn around reserves. They migrate, search for mates, and follow food across roads and farms. A wildlife corridor is not extra land; it is the grammar that lets separated habitats form a sentence.",
  },
  {
    id: "historical-statues",
    domain: "history",
    modeHint: "memory debate",
    text: "Debates about statues are often framed as a choice between remembering and forgetting. But public monuments do more than preserve facts; they assign honor in shared space. Moving a statue may therefore change not whether a society remembers, but what it asks memory to praise.",
  },
  {
    id: "elder-care-robots",
    domain: "technology",
    modeHint: "care distinction",
    text: "Robots can remind older adults to take medicine, detect falls, and connect them to emergency services. These functions are useful, but care is not only the delivery of tasks. A machine may support care without becoming the relationship that gives care its meaning.",
  },
  {
    id: "student-questions",
    domain: "education",
    modeHint: "question as evidence",
    text: "Teachers sometimes treat student questions as interruptions that slow the lesson. But a question can reveal exactly where thinking is alive, confused, or ready to move deeper. In a good classroom, a raised hand is not a delay; it is a window into learning.",
  },
  {
    id: "food-waste",
    domain: "environment",
    modeHint: "upstream framing",
    text: "Food waste is often imagined as what remains on plates after a meal. Yet waste begins earlier, in grading standards, package sizes, shopping habits, and fear of empty shelves. The trash bin is only the last page of a story written much earlier.",
  },
  {
    id: "noise-cities",
    domain: "urban-health",
    modeHint: "invisible pollution",
    text: "City noise is easy to dismiss because it rarely leaves a visible stain. Horns, engines, construction, and late-night crowds can still shape sleep, attention, and stress. Silence in a city is not emptiness; it is a public health resource.",
  },
  {
    id: "open-source",
    domain: "technology",
    modeHint: "collaboration economy",
    text: "Open-source software is often described as code anyone can download for free. But its deeper value lies in a community that can inspect, repair, and extend the work. The code is not just a product; it is an invitation to keep building together.",
  },
  {
    id: "youth-sports",
    domain: "psychology",
    modeHint: "success metric reversal",
    text: "Youth sports can become centered on trophies long before children understand the game. Winning can motivate effort, but it can also teach fear of mistakes. A healthy team treats the scoreboard as feedback, not as a mirror of a child's worth.",
  },
  {
    id: "water-pricing",
    domain: "policy",
    modeHint: "price as signal",
    text: "Cheap water can look like fairness because everyone pays less. But if low prices encourage waste and leave utilities unable to repair pipes, the hidden cost returns as shortages or unsafe systems. A price can be low and still fail to serve the public.",
  },
];

const SETTINGS: SettingCase[] = [
  { id: "std-5-ko-en", plan: "STANDARD", optionCount: 5, answerCount: 1, stemLanguage: "ko", optionLanguage: "en", difficulty: "KILLER" },
  { id: "std-4-ko-en", plan: "STANDARD", optionCount: 4, answerCount: 1, stemLanguage: "ko", optionLanguage: "en", difficulty: "KILLER" },
  { id: "std-6-en-en", plan: "STANDARD", optionCount: 6, answerCount: 1, stemLanguage: "en", optionLanguage: "en", difficulty: "KILLER" },
  { id: "std-6-ko-ko", plan: "STANDARD", optionCount: 6, answerCount: 1, stemLanguage: "ko", optionLanguage: "ko", difficulty: "INTERMEDIATE" },
  { id: "std-5-multi2-ko-en", plan: "STANDARD", optionCount: 5, answerCount: 2, stemLanguage: "ko", optionLanguage: "en", difficulty: "KILLER" },
  { id: "std-7-multi2-en-en", plan: "STANDARD", optionCount: 7, answerCount: 2, stemLanguage: "en", optionLanguage: "en", difficulty: "KILLER" },
  { id: "std-8-multi3-ko-ko", plan: "STANDARD", optionCount: 8, answerCount: 3, stemLanguage: "ko", optionLanguage: "ko", difficulty: "KILLER" },
  { id: "prem-5-ko-en", plan: "PREMIUM", optionCount: 5, answerCount: 1, stemLanguage: "ko", optionLanguage: "en", difficulty: "KILLER" },
  { id: "prem-6-en-en", plan: "PREMIUM", optionCount: 6, answerCount: 1, stemLanguage: "en", optionLanguage: "en", difficulty: "KILLER" },
  { id: "prem-5-multi2-ko-en", plan: "PREMIUM", optionCount: 5, answerCount: 2, stemLanguage: "ko", optionLanguage: "en", difficulty: "KILLER" },
  { id: "prem-8-multi3-ko-ko", plan: "PREMIUM", optionCount: 8, answerCount: 3, stemLanguage: "ko", optionLanguage: "ko", difficulty: "KILLER" },
  { id: "prem-4-ko-ko", plan: "PREMIUM", optionCount: 4, answerCount: 1, stemLanguage: "ko", optionLanguage: "ko", difficulty: "INTERMEDIATE" },
];

const STOPWORDS = new Set([
  "the", "and", "for", "that", "this", "with", "from", "into", "only", "than",
  "they", "their", "them", "were", "been", "being", "have", "has", "had",
  "does", "more", "less", "such", "when", "where", "what", "which", "while",
  "about", "after", "before", "because", "through", "without", "within",
  "between", "rather", "instead", "always", "still", "also", "very", "every",
  "some", "many", "much", "most", "same", "just", "over", "under", "onto",
]);

const RUN_CASES = Array.from({ length: Math.min(PASSAGES.length, SETTINGS.length * 3) }, (_, index) => ({
  passage: PASSAGES[index % PASSAGES.length],
  setting: SETTINGS[index % SETTINGS.length],
})).slice(START_INDEX, START_INDEX + RUN_LIMIT);

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function normalizeComparable(value: unknown): string {
  return normalizeText(value).toLowerCase().replace(/[^a-z0-9가-힣]+/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeLabel(value: unknown): string {
  const text = normalizeText(value);
  const circled = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧"];
  const circledIndex = circled.findIndex((label) => text.startsWith(label));
  if (circledIndex >= 0) return String(circledIndex + 1);
  const match = text.match(/^[([]?([1-8])[\]).:]?/);
  return match?.[1] ?? text.toLowerCase();
}

function correctLabels(question: GeneratedQuestion): string[] {
  const rawCorrectAnswers = Array.isArray(question.correctAnswers)
    ? question.correctAnswers
    : [];
  const values = rawCorrectAnswers.length > 0
    ? rawCorrectAnswers
    : normalizeText(question.correctAnswer).split(/[,/·，、\s]+/).filter(Boolean);
  return [...new Set(values.map(normalizeLabel).filter(Boolean))];
}

function englishWords(text: string): string[] {
  return (text.toLowerCase().match(/[a-z]+(?:'[a-z]+)?/g) ?? [])
    .filter((word) => word.length > 2 && !STOPWORDS.has(word));
}

function lexicalUnits(text: string): number {
  return (text.match(/[A-Za-z0-9]+(?:'[A-Za-z0-9]+)?/g) ?? []).length;
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function getMarkers(text: string): string[] {
  return [...text.matchAll(/__([^_]+)__/g)].map((match) => normalizeText(match[1]));
}

function getOptions(question: GeneratedQuestion): Array<Record<string, unknown>> {
  return Array.isArray(question.options)
    ? question.options.filter((option): option is Record<string, unknown> =>
        typeof option === "object" && option !== null)
    : [];
}

function overlapCount(a: string[], b: string[]): number {
  const bSet = new Set(b);
  return new Set(a.filter((token) => bSet.has(token))).size;
}

function likelyEnglish(text: string): boolean {
  const letters = text.match(/[A-Za-z]/g)?.length ?? 0;
  const hangul = text.match(/[가-힣]/g)?.length ?? 0;
  return letters >= Math.max(8, hangul * 2);
}

function likelyKorean(text: string): boolean {
  return (text.match(/[가-힣]/g)?.length ?? 0) >= 3;
}

function conceptFamilies(text: string): Set<string> {
  const normalized = normalizeComparable(text);
  const families = new Set<string>();
  const groups: Array<[string, RegExp]> = [
    ["health", /\b(?:health|sleep|body|stress|silence|medicine|care|meal|hunger)\b|건강|수면|몸|스트레스|침묵|의학|돌봄|식사|급식|허기|정서|주의/i],
    ["policy", /\b(?:policy|public|fairness|price|water|system|shortage|utility|serve|income|economic|benefits?|commercial|towns?|tourism)\b|정책|공공|공정|가격|물|수도|체계|부족|서비스|접근|소득|경제|이익|상업|마을|관광/i],
    ["technology", /\b(?:algorithm|automation|robot|software|code|open|source|machine|data)\b|알고리즘|자동화|로봇|소프트웨어|코드|오픈소스|기계|데이터/i],
    ["environment", /\b(?:reef|reefs|forest|habitat|wildlife|waste|trash|food|river|land|water|environment|environmental|ecological|degradation|damage|damaged|vulnerable|fragile|traffic|sunscreen|anchoring|popularity|popular)\b|산호|숲|서식지|야생|폐기물|쓰레기|음식|강|땅|물|환경|생태|훼손|손상|취약|인기|관광/i],
    ["education", /\b(?:student|teacher|classroom|question|learning|lesson|feedback|school|trophy|scoreboard)\b|학생|교사|교실|질문|학습|수업|피드백|학교|트로피|점수판|배움/i],
    ["culture", /\b(?:accent|language|recipe|family|history|memory|statue|monument|honor)\b|억양|언어|레시피|요리|가족|역사|기억|동상|기념물|명예|소속|정체성|유대/i],
    ["urban", /\b(?:city|bench|street|public|pause|belong|noise|construction)\b|도시|벤치|거리|공공|멈춤|소속|소음|공사|공간/i],
    ["science", /\b(?:experiment|research|failure|laboratory|observation|volunteer|scientist)\b|실험|연구|실패|실험실|관찰|자원봉사|시민|과학자|전제|재검토|협업/i],
    ["metaphor", /\b(?:bridge|map|archive|door|wall|window|grammar|sentence|mirror|resource|instrument|invitation|signal)\b|다리|지도|기록|문|벽|창|문법|문장|거울|자원|도구|초대|신호|공유/i],
  ];
  for (const [family, pattern] of groups) {
    if (pattern.test(normalized)) families.add(family);
  }
  return families;
}

function conceptOverlapCount(optionText: string, passageText: string): number {
  const direct = overlapCount(englishWords(optionText), englishWords(passageText));
  const optionFamilies = conceptFamilies(optionText);
  const passageFamilies = conceptFamilies(passageText);
  let familyOverlap = 0;
  for (const family of optionFamilies) {
    if (passageFamilies.has(family)) familyOverlap += 1;
  }
  return direct + familyOverlap;
}

function findSentenceContaining(passage: string, expression: string): string {
  const comparable = normalizeComparable(expression);
  return passage
    .split(/(?<=[.!?])\s+/)
    .find((sentence) => normalizeComparable(sentence).includes(comparable)) ?? "";
}

function auditWholeQuestion(
  question: GeneratedQuestion | undefined,
  passage: PassageCase,
  setting: SettingCase,
  qualityIssues: QuestionQualityIssue[],
): { ok: boolean; score: number; issues: WholeIssue[]; metrics: Record<string, unknown> } {
  const issues: WholeIssue[] = [];
  if (!question) {
    return {
      ok: false,
      score: 0,
      issues: [{ severity: "critical", code: "missing-question", message: "No generated question." }],
      metrics: {},
    };
  }

  const underlinedExpression = normalizeText(question.underlinedExpression);
  const passageWithUnderline = normalizeText(question.passageWithUnderline);
  const markers = getMarkers(passageWithUnderline);
  const options = getOptions(question);
  const labels = options.map((option) => normalizeLabel(option.label));
  const correct = correctLabels(question);
  const correctSet = new Set(correct);
  const correctOptions = options.filter((option) => correctSet.has(normalizeLabel(option.label)));
  const correctText = correctOptions.map((option) => normalizeText(option.text)).join(" ");
  const wrongOptions = options.filter((option) => !correctSet.has(normalizeLabel(option.label)));
  const optionTexts = options.map((option) => normalizeText(option.text));
  const sentence = findSentenceContaining(passage.text, underlinedExpression);
  const targetWords = englishWords(underlinedExpression);
  const correctWords = englishWords(correctText);
  const literalOverlapRatio = correctWords.length
    ? overlapCount(targetWords, correctWords) / Math.max(1, Math.min(targetWords.length, correctWords.length))
    : 0;
  const attractiveWrongCount = wrongOptions.filter((option) => {
    const text = normalizeText(option.text);
    return text.length >= 12 && conceptOverlapCount(text, passage.text) >= 1;
  }).length;
  const duplicateOptionCount = optionTexts.length - new Set(optionTexts.map(normalizeComparable)).size;
  const qualityErrors = qualityIssues.filter((issue) => issue.severity === "error");
  const qualityWarnings = qualityIssues.filter((issue) => issue.severity === "warning");
  const direction = normalizeText(question.direction);

  for (const issue of qualityErrors) {
    issues.push({
      severity: "critical",
      code: `quality:${issue.code}`,
      message: issue.message,
      evidence: issue.code,
    });
  }
  if (!underlinedExpression) {
    issues.push({ severity: "critical", code: "missing-underlined-expression", message: "underlinedExpression is empty." });
  }
  if (wordCount(underlinedExpression) > 6 || lexicalUnits(underlinedExpression) > 6) {
    issues.push({ severity: "critical", code: "target-too-long-holistic", message: "Target exceeds six words or lexical units.", evidence: underlinedExpression });
  }
  if (!normalizeComparable(passage.text).includes(normalizeComparable(underlinedExpression))) {
    issues.push({ severity: "critical", code: "target-not-in-source-holistic", message: "Target is not found in passage.", evidence: underlinedExpression });
  }
  if (markers.length !== 1) {
    issues.push({ severity: "critical", code: "visible-underline-count", message: `Expected exactly one visible underline marker, got ${markers.length}.` });
  } else if (normalizeComparable(markers[0]) !== normalizeComparable(underlinedExpression)) {
    issues.push({ severity: "critical", code: "visible-underline-mismatch", message: "Visible underline differs from underlinedExpression.", evidence: markers[0] });
  }
  if (options.length !== setting.optionCount) {
    issues.push({ severity: "critical", code: "option-count-setting", message: `Expected ${setting.optionCount} options, got ${options.length}.` });
  }
  if (new Set(labels).size !== labels.length) {
    issues.push({ severity: "critical", code: "duplicate-option-label", message: "Option labels are duplicated." });
  }
  if (correct.length !== setting.answerCount) {
    issues.push({ severity: "critical", code: "answer-count-setting", message: `Expected ${setting.answerCount} correct answer(s), got ${correct.length}.`, evidence: correct.join(", ") });
  }
  if (correctOptions.length !== correct.length) {
    issues.push({ severity: "critical", code: "missing-correct-option", message: "Some correct labels do not resolve to options.", evidence: correct.join(", ") });
  }
  if (setting.answerCount >= 2 && !/모두|all|apply/i.test(direction)) {
    issues.push({ severity: "major", code: "multi-answer-direction", message: "Multi-answer item should ask students to choose all appropriate options." });
  }
  if (setting.stemLanguage === "en" && !likelyEnglish(direction)) {
    issues.push({ severity: "major", code: "stem-language-mismatch", message: "Direction does not look English.", evidence: direction });
  }
  if (setting.stemLanguage === "ko" && !likelyKorean(direction)) {
    issues.push({ severity: "major", code: "stem-language-mismatch", message: "Direction does not look Korean.", evidence: direction });
  }
  const optionLanguageMismatches = optionTexts.filter((text) =>
    setting.optionLanguage === "en" ? !likelyEnglish(text) : !likelyKorean(text),
  ).length;
  if (optionLanguageMismatches > 0) {
    issues.push({ severity: "major", code: "option-language-mismatch", message: `${optionLanguageMismatches} option(s) do not match requested option language.` });
  }
  if (duplicateOptionCount > 0) {
    issues.push({ severity: "major", code: "duplicate-options", message: `${duplicateOptionCount} duplicate option text(s).` });
  }
  if (correctText && correctWords.length < 4 && setting.optionLanguage === "en") {
    issues.push({ severity: "major", code: "correct-option-too-thin", message: "Correct option is too short to express implied meaning.", evidence: correctText });
  }
  if (literalOverlapRatio >= 0.75 && targetWords.length >= 2) {
    issues.push({ severity: "major", code: "correct-option-too-literal", message: "Correct option heavily reuses target wording.", evidence: correctText });
  }
  if (wrongOptions.length > 0 && attractiveWrongCount === 0) {
    issues.push({ severity: "major", code: "weak-distractors-holistic", message: `Only ${attractiveWrongCount} wrong options overlap passage concepts.` });
  } else if (wrongOptions.length > 1 && attractiveWrongCount < Math.min(2, wrongOptions.length)) {
    issues.push({ severity: "minor", code: "weak-distractors-manual-review", message: `Only ${attractiveWrongCount} wrong option(s) directly overlap passage concepts; synonym-based distractors may still be acceptable.` });
  }
  if (normalizeText(question.surfaceMeaning).length < 12) {
    issues.push({ severity: "major", code: "surface-meaning-thin", message: "surfaceMeaning is too thin." });
  }
  if (normalizeText(question.impliedMeaning).length < 18) {
    issues.push({ severity: "major", code: "implied-meaning-thin", message: "impliedMeaning is too thin." });
  }
  if (normalizeText(question.reasoningGap).length < 28) {
    issues.push({ severity: "major", code: "reasoning-gap-thin", message: "reasoningGap is too thin." });
  }
  for (const issue of qualityWarnings) {
    issues.push({
      severity: "minor",
      code: `quality-warning:${issue.code}`,
      message: issue.message,
      evidence: issue.code,
    });
  }

  const majorCount = issues.filter((issue) => issue.severity === "major").length;
  const criticalCount = issues.filter((issue) => issue.severity === "critical").length;
  const minorCount = issues.filter((issue) => issue.severity === "minor").length;
  const score = Math.max(0, 100 - criticalCount * 35 - majorCount * 12 - minorCount * 3);

  return {
    ok: criticalCount === 0 && majorCount === 0,
    score,
    issues,
    metrics: {
      underlinedExpression,
      targetWordCount: wordCount(underlinedExpression),
      targetLexicalUnits: lexicalUnits(underlinedExpression),
      optionCount: options.length,
      answerCount: correct.length,
      expectedOptionCount: setting.optionCount,
      expectedAnswerCount: setting.answerCount,
      attractiveWrongCount,
      duplicateOptionCount,
      literalOverlapRatio: Number(literalOverlapRatio.toFixed(2)),
      qualityErrorCount: qualityErrors.length,
      qualityWarningCount: qualityWarnings.length,
      targetSentenceFound: Boolean(sentence),
    },
  };
}

async function runCase(passage: PassageCase, setting: SettingCase, index: number) {
  console.log(`[${LOG_PREFIX}] ${index + 1}/${RUN_CASES.length} ${setting.id} ${passage.id} (${passage.domain}; ${passage.modeHint})`);
  const generationResult = await runQuestionGenerationWithEmptyRetry({
    plan: [
      {
        subType: "IMPLIED_MEANING",
        count: 1,
        reason: `IMPLIED_MEANING settings audit: ${setting.id}`,
        targetPoints: [],
      },
    ],
    schoolType: "high school",
    gradeInfo: "grade 2",
    passageContent: passage.text,
    teacherIntentBlock: "",
    analysisContext: "",
    diffLabel: setting.difficulty,
    diffInstruction: setting.difficulty === "KILLER"
      ? "top-tier implied meaning inference with compact central target and near-miss distractors"
      : "solid implied meaning inference with a clear central target",
    generationPlan: setting.plan,
    typeSettings: {
      IMPLIED_MEANING: {
        optionCount: setting.optionCount,
        answerCount: setting.answerCount,
        stemLanguage: setting.stemLanguage,
        optionLanguage: setting.optionLanguage,
        generationPlan: setting.plan,
        difficulty: setting.difficulty,
      },
    },
  }, {
    maxAttempts: MAX_ATTEMPTS,
    logPrefix: LOG_PREFIX,
  });

  const question = generationResult.questions[0] as GeneratedQuestion | undefined;
  const qualityIssues = question
    ? validateQuestionQuality({
        typeId: "IMPLIED_MEANING",
        question,
        passage: passage.text,
        requestedDifficulty: setting.difficulty,
        genericOptionCount: setting.optionCount,
        genericAnswerCount: setting.answerCount,
        stemLanguage: setting.stemLanguage,
        optionLanguage: setting.optionLanguage,
      })
    : [];
  const whole = auditWholeQuestion(question, passage, setting, qualityIssues);
  const underlinedExpression = normalizeText(question?.underlinedExpression);
  const gateOk = Boolean(question) && !qualityIssues.some((issue) => issue.severity === "error");
  console.log(
    `[${LOG_PREFIX}] ${setting.id}/${passage.id} gate=${gateOk ? "pass" : "fail"} whole=${whole.ok ? "pass" : "fail"} score=${whole.score} attempts=${generationResult.attempts} target="${underlinedExpression}"`,
  );

  return {
    passage,
    setting,
    attempts: generationResult.attempts,
    question,
    qualityIssues,
    whole,
  };
}

type RunResult = Awaited<ReturnType<typeof runCase>>;

function summarize(results: RunResult[]) {
  const total = results.length;
  const qualityPass = results.filter((result) => !result.qualityIssues.some((issue) => issue.severity === "error")).length;
  const wholePass = results.filter((result) => result.whole.ok).length;
  const scoreAverage = total
    ? Math.round(results.reduce((sum, result) => sum + result.whole.score, 0) / total)
    : 0;
  const issueCounts = new Map<string, number>();
  const settingCounts = new Map<string, number>();
  const planCounts = new Map<string, number>();
  for (const result of results) {
    for (const issue of result.whole.issues) {
      issueCounts.set(issue.code, (issueCounts.get(issue.code) ?? 0) + 1);
    }
    settingCounts.set(result.setting.id, (settingCounts.get(result.setting.id) ?? 0) + 1);
    planCounts.set(result.setting.plan, (planCounts.get(result.setting.plan) ?? 0) + 1);
  }
  return {
    total,
    qualityPass,
    wholePass,
    scoreAverage,
    issueCounts: Object.fromEntries([...issueCounts.entries()].sort((a, b) => b[1] - a[1])),
    settingCounts: Object.fromEntries([...settingCounts.entries()].sort((a, b) => b[1] - a[1])),
    planCounts: Object.fromEntries([...planCounts.entries()].sort((a, b) => b[1] - a[1])),
    failed: results
      .filter((result) => !result.whole.ok)
      .map((result) => ({
        id: result.passage.id,
        setting: result.setting.id,
        plan: result.setting.plan,
        target: result.whole.metrics.underlinedExpression,
        score: result.whole.score,
        issues: result.whole.issues,
      })),
  };
}

function writeSnapshot(results: RunResult[]) {
  fs.mkdirSync(OUTDIR, { recursive: true });
  const summary = summarize(results);
  fs.writeFileSync(
    OUTPATH,
    JSON.stringify({
      generatedAt: new Date().toISOString(),
      maxAttempts: MAX_ATTEMPTS,
      startIndex: START_INDEX,
      limit: RUN_LIMIT,
      summary,
      results,
    }, null, 2),
  );
  return summary;
}

async function main() {
  if (RUN_CASES.length === 0) {
    throw new Error("No run cases selected.");
  }
  const results: RunResult[] = [];
  for (const [index, run] of RUN_CASES.entries()) {
    const result = await runCase(run.passage, run.setting, START_INDEX + index);
    results.push(result);
    writeSnapshot(results);
  }
  const summary = writeSnapshot(results);
  console.log(`[${LOG_PREFIX}] wrote ${OUTPATH}`);
  console.log(`[${LOG_PREFIX}] summary ${JSON.stringify(summary)}`);
}

main().catch((error) => {
  console.error(`[${LOG_PREFIX}] fatal`, error);
  process.exitCode = 1;
});
