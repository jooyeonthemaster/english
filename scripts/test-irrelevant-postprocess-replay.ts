/* eslint-disable no-console */
/**
 * Phase A — Postprocess-only replay.
 *
 * Takes the exact AI sentences[] + irrelevantIndex that previously caused
 * "지문 변형" in production (1618학원), feeds them through the NEW
 * processIrrelevant repair logic, and verifies that every slot ends up
 * matching exactly one original passage sentence verbatim.
 *
 * No LLM call — pure post-processor regression test.
 */

import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import { processIrrelevant } from "../src/lib/question-postprocess/processors/irrelevant";

// ─── Recorded production cases (from Supabase 1618학원) ────────────────────
type Case = {
  qid: string;
  label: string;
  passage: string;
  aiSentences: string[];
  irrelevantIndex: number;
};

const CASES: Case[] = [
  {
    qid: "cmpij0hh6000zl704cqa84p9r",
    label: "basketball/excellence — 3-sentence fusion in slot 2",
    passage:
      "Individuals who perform at a high level in their profession often have instant credibility with others. People admire them, they want to be like them, and they feel connected to them. When they speak, others listen ― even if the area of their skill has nothing to do with the advice they give. Think about a world-famous basketball player. He has made more money from endorsements than he ever did playing basketball. Is it because of his knowledge of the products he endorses? No. It’s because of what he can do with a basketball. The same can be said of an Olympic medalist swimmer. People listen to him because of what he can do in the pool. And when an actor tells us we should drive a certain car, we don’t listen because of his expertise on engines. We listen because we admire his talent. Excellence connects. If you possess a high level of ability in an area, others may desire to connect with you because of it.",
    aiSentences: [
      "He has made more money from endorsements than he ever did playing basketball.",
      "Is it because of his knowledge of the products he endorses? No. It’s because of what he can do with a basketball.",
      "The same can be said of an Olympic medalist swimmer.",
      "To maximize market share, sports companies should design endorsement campaigns focused on specific athletic pools like swimming or basketball.",
      "People listen to him because of what he can do in the pool.",
    ],
    irrelevantIndex: 3,
  },
  {
    qid: "cmpgo30i70005jp0456urvuhc",
    label: "poverty/stress — 2-sentence fusion with ', and' in slot 2",
    passage:
      "Few people will be surprised to hear that poverty tends to create stress: a 2006 study published in the American journal Psychosomatic Medicine, for example, noted that a lower socioeconomic status was associated with higher levels of stress hormones in the body. However, richer economies have their own distinct stresses. The key issue is time pressure. A 1999 study of 31 countries by American psychologist Robert Levine and Canadian psychologist Ara Norenzayan found that wealthier, more industrialized nations had a faster pace of life — which led to a higher standard of living, but at the same time left the population feeling a constant sense of urgency, as well as being more prone to heart disease. In effect, fast­paced productivity creates wealth, but it also leads people to feel time­poor when they lack the time to relax and enjoy themselves.",
    aiSentences: [
      "Few people will be surprised to hear that poverty tends to create stress: a 2006 study published in the American journal Psychosomatic Medicine, for example, noted that a lower socioeconomic status was associated with higher levels of stress hormones in the body.",
      "However, richer economies have their own distinct stresses, and the key issue is time pressure.",
      "A 1999 study of 31 countries by American psychologist Robert Levine and Canadian psychologist Ara Norenzayan found that wealthier, more industrialized nations had a faster pace of life — which led to a higher standard of living, but at the same time left the population feeling a constant sense of urgency, as well as being more prone to heart disease.",
      "Therefore, individuals in highly developed societies must adopt advanced time-management software and digital devices to maximize their daily efficiency.",
      "In effect, fast­paced productivity creates wealth, but it also leads people to feel time­poor when they lack the time to relax and enjoy themselves.",
    ],
    irrelevantIndex: 3,
  },
  {
    qid: "cmpgnvun50005l204bh43y08h",
    label: "Lake Wobegon — 2-sentence fusion in slot 1",
    passage:
      "We tend to believe that we possess a host of socially desirable characteristics, and that we are free of most of those that are socially undesirable. For example, a large majority of the general public thinks that they are more intelligent, more fair­minded, less prejudiced, and more skilled behind the wheel of an automobile than the average person. This phenomenon is so reliable and ubiquitous that it has come to be known as the “Lake Wobegon effect,” after Garrison Keillor’s fictional community where “the women are strong, the men are good­looking, and all the children are above average.” A survey of one million high school seniors found that 70% thought they were above average in leadership ability, and only 2% thought they were below average. In terms of ability to get along with others, all students thought they were above average, 60% thought they were in the top 10%, and 25% thought they were in the top 1%!",
    aiSentences: [
      "We tend to believe that we possess a host of socially desirable characteristics, and that we are free of most of those that are socially undesirable. For example, a large majority of the general public thinks that they are more intelligent, more fair­minded, less prejudiced, and more skilled behind the wheel of an automobile than the average person.",
      "This phenomenon is so reliable and ubiquitous that it has come to be known as the “Lake Wobegon effect,” after Garrison Keillor’s fictional community where “the women are strong, the men are good­looking, and all the children are above average.”",
      "Therefore, to reduce traffic accidents, drivers must prioritize following safety regulations rather than trying to compete with others on the road.",
      "A survey of one million high school seniors found that 70% thought they were above average in leadership ability, and only 2% thought they were below average.",
      "In terms of ability to get along with others, all students thought they were above average, 60% thought they were in the top 10%, and 25% thought they were in the top 1%!",
    ],
    irrelevantIndex: 2,
  },
];

// ─── Verifier ──────────────────────────────────────────────────────────────
const SENTENCE_SPLIT_RE = /[^.!?]+[.!?]+[\u201D\u2019")\]]*(?=\s|$)/g;
function splitSentences(text: string): string[] {
  const cleaned = text.replace(/\s+/g, " ").trim();
  const matches = cleaned.match(SENTENCE_SPLIT_RE);
  return matches ? matches.map((s) => s.trim()) : [cleaned];
}
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[\u00ad]/g, "")
    .replace(/[\u00a0]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[.,;:!?"'()\-]/g, "")
    .trim();
}

function verify(slot: string, originals: string[]): { ok: boolean; matchedIdx: number } {
  const n = normalize(slot);
  for (let i = 0; i < originals.length; i++) {
    if (normalize(originals[i]) === n) return { ok: true, matchedIdx: i };
  }
  return { ok: false, matchedIdx: -1 };
}

function run() {
  let total = 0;
  let passed = 0;
  for (const c of CASES) {
    console.log(`\n${"=".repeat(80)}`);
    console.log(`Case: ${c.qid}`);
    console.log(`  → ${c.label}`);
    console.log("=".repeat(80));

    const ai = {
      sentences: c.aiSentences,
      irrelevantIndex: c.irrelevantIndex,
      correctAnswer: "①②③④⑤"[c.irrelevantIndex],
    };
    const result = processIrrelevant(c.passage, ai);

    if (!result.success) {
      console.log(`POST-PROCESS FAILED: ${result.error}`);
      total += 4;
      continue;
    }

    const repaired = (result.data as { sentences: string[] }).sentences;
    const originals = splitSentences(c.passage);
    console.log(`Warnings:`);
    for (const w of result.warnings) console.log(`  • ${w}`);
    console.log(`Repaired slots:`);
    for (let i = 0; i < repaired.length; i++) {
      if (i === c.irrelevantIndex) {
        console.log(`  [${i}] ✦ IRRELEVANT (untouched): "${repaired[i].slice(0, 70)}..."`);
        continue;
      }
      const v = verify(repaired[i], originals);
      const changed = repaired[i] !== c.aiSentences[i];
      const flag = v.ok ? "✓ EXACT" : "✗ STILL DRIFTED";
      const changedTag = changed ? " [REPAIRED]" : "";
      console.log(`  [${i}] ${flag}${changedTag} → orig#${v.matchedIdx}`);
      if (changed) {
        console.log(`       was: "${c.aiSentences[i].slice(0, 80)}..."`);
        console.log(`       now: "${repaired[i].slice(0, 80)}..."`);
      }
      total++;
      if (v.ok) passed++;
    }
  }

  console.log(`\n${"#".repeat(80)}`);
  console.log(`# REPLAY RESULT: ${passed}/${total} slots now match original verbatim`);
  console.log("#".repeat(80));
}

run();
