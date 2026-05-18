/**
 * Unit-test the post-processor's word-search logic in isolation.
 * Bypasses the LLM — feeds hand-crafted AI output directly to postProcessQuestion()
 * to confirm whether the substring-underline bug is reachable from realistic
 * AI outputs (with and without disambiguating surroundingText).
 */
import { postProcessQuestion } from "../src/lib/question-postprocess";

interface Scenario {
  label: string;
  type: string;
  passage: string;
  ai: any;
  expectMarkerAtWordBoundary: boolean;
}

const scenarios: Scenario[] = [
  // ─── REFERENCE — "it" with substring trap ───
  {
    label: "REFERENCE: 'it' with NO surroundingText (worst case — LLM forgot context)",
    type: "REFERENCE",
    passage: "In the digital age, knowledge flows quickly. Many people believe it is the key to success.",
    ai: {
      direction: "밑줄 친 'it'이 가리키는 것으로 가장 적절한 것은?",
      underlinedPronoun: "it",
      // INTENTIONALLY OMIT surroundingText
      options: [{ label: "①", text: "the digital age" }, { label: "②", text: "knowledge" }, { label: "③", text: "key" }, { label: "④", text: "success" }, { label: "⑤", text: "flow" }],
      correctAnswer: "②",
      explanation: "...",
      keyPoints: [],
      tags: [],
      difficulty: "BASIC",
      wrongOptionExplanations: {},
    },
    expectMarkerAtWordBoundary: true,
  },
  {
    label: "REFERENCE: 'it' with WRONG surroundingText (LLM picked the wrong context)",
    type: "REFERENCE",
    passage: "In the digital age, knowledge flows quickly. Many people believe it is the key to success.",
    ai: {
      direction: "...",
      underlinedPronoun: "it",
      surroundingText: "completely unrelated phrase that doesn't match the passage at all",
      options: [{ label: "①", text: "knowledge" }, { label: "②", text: "the digital age" }, { label: "③", text: "key" }, { label: "④", text: "success" }, { label: "⑤", text: "flow" }],
      correctAnswer: "①",
      explanation: "...",
      keyPoints: [],
      tags: [],
      difficulty: "BASIC",
      wrongOptionExplanations: {},
    },
    expectMarkerAtWordBoundary: true,
  },
  {
    label: "REFERENCE: short pronoun 'it' inside multiple substring traps (digital, with, fit)",
    type: "REFERENCE",
    passage: "The digital fit with society is debated. Some argue it harms privacy.",
    ai: {
      direction: "...",
      underlinedPronoun: "it",
      surroundingText: "Some argue it harms",
      options: [{ label: "①", text: "the digital fit" }, { label: "②", text: "society" }, { label: "③", text: "privacy" }, { label: "④", text: "debate" }, { label: "⑤", text: "harm" }],
      correctAnswer: "①",
      explanation: "...",
      keyPoints: [],
      tags: [],
      difficulty: "BASIC",
      wrongOptionExplanations: {},
    },
    expectMarkerAtWordBoundary: true,
  },
  {
    label: "REFERENCE: pronoun 'it' where ONLY substring matches exist (no standalone 'it')",
    type: "REFERENCE",
    passage: "Digital tools redefine literature and editing in society.",
    ai: {
      direction: "...",
      underlinedPronoun: "it",
      surroundingText: "Digital tools redefine literature",
      options: [{ label: "①", text: "digital" }, { label: "②", text: "literature" }, { label: "③", text: "editing" }, { label: "④", text: "society" }, { label: "⑤", text: "tools" }],
      correctAnswer: "②",
      explanation: "...",
      keyPoints: [],
      tags: [],
      difficulty: "BASIC",
      wrongOptionExplanations: {},
    },
    expectMarkerAtWordBoundary: true,
  },
  // ─── CONTEXT_MEANING — word with substring trap ───
  {
    label: "CONTEXT_MEANING: 'fit' as underlined word with 'fitness' nearby",
    type: "CONTEXT_MEANING",
    passage: "Fitness gurus emphasize routine. A good fit with one's schedule matters most.",
    ai: {
      direction: "...",
      underlinedWord: "fit",
      surroundingText: "A good fit with one's schedule",
      options: [{ label: "1", text: "match" }, { label: "2", text: "exercise" }, { label: "3", text: "skill" }, { label: "4", text: "habit" }, { label: "5", text: "design" }],
      correctAnswer: "1",
      explanation: "...",
      keyPoints: [],
      tags: [],
      difficulty: "BASIC",
      wrongOptionExplanations: {},
    },
    expectMarkerAtWordBoundary: true,
  },
];

function inspectMarkers(processedPassage: string) {
  const re = /__([^_]+)__/g;
  const findings: any[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(processedPassage)) !== null) {
    const start = m.index, end = m.index + m[0].length;
    const before = processedPassage[start - 1];
    const after = processedPassage[end];
    const leftOK = start === 0 || !/\w/.test(before ?? "");
    const rightOK = end === processedPassage.length || !/\w/.test(after ?? "");
    findings.push({
      marker: m[1],
      ctx: processedPassage.slice(Math.max(0, start - 15), Math.min(processedPassage.length, end + 15)),
      leftOK, rightOK,
      isSubstringInWord: !leftOK || !rightOK,
    });
  }
  return findings;
}

let totalViolations = 0;
let totalScenarios = 0;
for (const s of scenarios) {
  totalScenarios++;
  console.log("\n────────────────────────────────────────");
  console.log(`▶ ${s.label}`);
  console.log(`  passage: "${s.passage}"`);
  console.log(`  pronoun/word: "${s.ai.underlinedPronoun || s.ai.underlinedWord}"`);
  console.log(`  surroundingText: ${s.ai.surroundingText ? `"${s.ai.surroundingText}"` : "[omitted]"}`);

  const pp = postProcessQuestion(s.type, s.passage, s.ai);
  if (!pp.success) {
    console.log(`  ⚠️ post-process FAILED: ${pp.error}`);
    continue;
  }
  const result = pp.data.passageWithUnderline as string;
  console.log(`  result:  "${result}"`);

  const findings = inspectMarkers(result);
  for (const f of findings) {
    const tag = f.isSubstringInWord ? "❌ SUBSTRING-IN-WORD" : "✅ word-boundary";
    console.log(`     ${tag}: marker="${f.marker}", ctx="...${f.ctx}..."`);
    if (f.isSubstringInWord) totalViolations++;
  }
}

console.log("\n\n=========================================");
console.log(`Total scenarios: ${totalScenarios}`);
console.log(`Substring-in-word violations: ${totalViolations}`);
console.log(`Bug is${totalViolations > 0 ? " REPRODUCIBLE 🔥" : " not reachable in these scenarios"}`);
