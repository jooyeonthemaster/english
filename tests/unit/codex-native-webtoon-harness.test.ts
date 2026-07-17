import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  buildCodexNativeWebtoonPrompt,
  CODEX_NATIVE_WEBTOON_CONCEPTS,
  extractCodexNativeCorePhrases,
} from "../../src/lib/exam-passages/codex-native-webtoon";
import type { ExamPassage } from "../../src/lib/exam-passages/types";

const passage: ExamPassage = {
  id: "sample-q20",
  examId: "sample",
  year: 2026,
  exam: "6월",
  form: "",
  board: "학력평가",
  era: "modern",
  qNumbers: [20],
  type: "주장",
  typeGroup: "주장",
  answer: 1,
  reconstructionKind: "none",
  confidence: "high",
  hasDeliberateError: false,
  wordCount: 42,
  grade: "고2",
  text: "Students learn difficult ideas by connecting them to concrete examples. A clear visual sequence helps them remember the relationship between cause and effect. Repeated explanation can then become independent understanding. Teachers should preserve accuracy while making the lesson engaging. The final goal is durable comprehension.",
};

test("builds two distinct direct-native bilingual prompt contracts", () => {
  const prompts = CODEX_NATIVE_WEBTOON_CONCEPTS.map((concept) =>
    buildCodexNativeWebtoonPrompt({ passage, concept: concept.id }),
  );
  assert.equal(prompts.length, 2);
  assert.notEqual(prompts[0], prompts[1]);
  for (const prompt of prompts) {
    assert.match(prompt, /Generate the artwork AND every Korean\/English character together/);
    assert.match(prompt, /No text overlay, compositing, inpainting, or post-added typography/);
    assert.match(prompt, /SOURCE PASSAGE/);
  }
  assert.match(prompts[0], /10-12 clearly separated rectangular panels/);
  assert.match(prompts[1], /Exactly 10 clearly separated rectangular panels/);
  assert.match(prompts[1], /white-tone reference/);
  assert.match(prompts[1], /No chibi, super-deformed, baby proportions/);
  assert.match(prompts[1], /Text should occupy roughly one quarter to one third/);
});

test("core phrases remain exact substrings of the source", () => {
  const phrases = extractCodexNativeCorePhrases(passage.text);
  assert.ok(phrases.length >= 5 && phrases.length <= 6);
  for (const phrase of phrases) assert.ok(passage.text.includes(phrase), phrase);
});

function phraseContractFailures(passages: ExamPassage[]): string[] {
  const failures: string[] = [];

  for (const item of passages) {
    const phrases = extractCodexNativeCorePhrases(item.text);
    if (phrases.length < 5 || phrases.length > 8) {
      failures.push(`${item.id}: expected 5-8 phrases, received ${phrases.length}`);
      continue;
    }
    if (new Set(phrases).size !== phrases.length) {
      failures.push(`${item.id}: duplicate phrase`);
      continue;
    }

    let cursor = 0;
    for (const phrase of phrases) {
      const sourceIndex = item.text.indexOf(phrase, cursor);
      if (sourceIndex < 0) {
        failures.push(`${item.id}: non-source or overlapping phrase ${JSON.stringify(phrase)}`);
        break;
      }
      if (phrase.length > 168) {
        failures.push(`${item.id}: phrase exceeds 168 characters`);
        break;
      }
      cursor = sourceIndex + phrase.length;
    }

    for (const concept of CODEX_NATIVE_WEBTOON_CONCEPTS) {
      const conceptPhrases = extractCodexNativeCorePhrases(item.text, concept.id);
      if (new Set(conceptPhrases).size !== conceptPhrases.length) {
        failures.push(`${item.id}/${concept.id}: duplicate phrase`);
        continue;
      }
      let conceptCursor = 0;
      let invalidConceptPhrase = false;
      for (const phrase of conceptPhrases) {
        const sourceIndex = item.text.indexOf(phrase, conceptCursor);
        if (sourceIndex < 0) {
          failures.push(`${item.id}/${concept.id}: non-source, overlapping, or out-of-order phrase ${JSON.stringify(phrase)}`);
          invalidConceptPhrase = true;
          break;
        }
        conceptCursor = sourceIndex + phrase.length;
      }
      if (invalidConceptPhrase) continue;
      if (concept.id === "CUTE_PASTEL") {
        if (conceptPhrases.length < 5 || conceptPhrases.length > 7) {
          failures.push(`${item.id}/${concept.id}: expected 5-7 phrases, received ${conceptPhrases.length}`);
          continue;
        }
        if (conceptPhrases.some((phrase) => phrase.length > 96 || phrase.trim().split(/\s+/).length > 15)) {
          failures.push(`${item.id}/${concept.id}: phrase exceeds compact reference density`);
          continue;
        }
      }
      const prompt = buildCodexNativeWebtoonPrompt({ passage: item, concept: concept.id });
      for (const phrase of conceptPhrases) {
        if (!prompt.includes(phrase)) {
          failures.push(`${item.id}/${concept.id}: prompt omitted exact phrase`);
          break;
        }
      }
    }
  }

  return failures;
}

test("extracts 5-8 exact, unique, ordered phrases for all 4,537 passages", () => {
  const corpus = JSON.parse(
    readFileSync(
      resolve(process.cwd(), "src/data/exam-passages/passages.json"),
      "utf8",
    ),
  ) as ExamPassage[];

  assert.equal(corpus.length, 4_537, "the invariant must cover the complete corpus");
  assert.deepEqual(phraseContractFailures(corpus), []);
});

test("cute reference mode keeps exact source excerpts short and sparse", () => {
  const phrases = extractCodexNativeCorePhrases(passage.text, "CUTE_PASTEL");
  assert.ok(phrases.length >= 5 && phrases.length <= 7);
  for (const phrase of phrases) {
    assert.ok(passage.text.includes(phrase));
    assert.ok(phrase.length <= 96);
    assert.ok(phrase.trim().split(/\s+/).length <= 15);
  }
});

test("short, abbreviated, quoted, whitespace-rich, and repeated sources stay exact", () => {
  const adversarialSources = [
    "Mr. Lee asked Dr. Kim to read one short note before class. The U.S. team agreed, and everyone began immediately.",
    '"Practice carefully," she said.\n\nThen  check every word; keep the source exact, and do not invent text.',
    Array.from({ length: 8 }, () => "Practice makes progress.").join(" "),
    "One two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty.",
  ];

  const adversarialPassages = adversarialSources.map(
    (text, index): ExamPassage => ({
      ...passage,
      id: `adversarial-${index}`,
      text,
      wordCount: text.trim().split(/\s+/).length,
    }),
  );

  assert.deepEqual(phraseContractFailures(adversarialPassages), []);
});
