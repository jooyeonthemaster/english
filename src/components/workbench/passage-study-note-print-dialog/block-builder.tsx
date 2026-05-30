"use client";

import React from "react";
import { sanitizeAiModelDisclosureText } from "@/lib/question-generation-plans";
import type { PassageAnalysisData } from "@/types/passage-analysis";
import {
  DenseSectionTitle,
  ExamDenseBlock,
  ExamSummaryDenseBlock,
  FirstPageSummaryBlock,
  GrammarDenseBlock,
  SyntaxDenseBlock,
  TranslationOverviewBlock,
  VocabularyDenseBlock,
} from "./dense-blocks";
import { chunkArray, toExamEntries } from "./helpers";
import type { PageCategory, StudyNoteBlock, StudyNotePassage } from "./types";

function pushBlock(
  blocks: StudyNoteBlock[],
  passage: StudyNotePassage,
  category: PageCategory,
  label: string,
  pointCount: number,
  node: React.ReactNode,
  options: { id?: string; forceNewPage?: boolean; keepWithNext?: boolean } = {},
) {
  blocks.push({
    id: options.id || `${passage.id}-${category}-${blocks.length}`,
    passageId: passage.id,
    passageTitle: sanitizeAiModelDisclosureText(passage.title),
    category,
    label,
    pointCount,
    forceNewPage: options.forceNewPage,
    keepWithNext: options.keepWithNext,
    node,
  });
}

export function buildStudyNoteBlocks(
  items: Array<{ passage: StudyNotePassage; data: PassageAnalysisData }>,
) {
  const blocks: StudyNoteBlock[] = [];

  for (const { passage, data } of items) {
    pushBlock(
      blocks,
      passage,
      "summary",
      "지문 요약",
      1,
      <FirstPageSummaryBlock passage={passage} data={data} />,
      { id: `${passage.id}-summary`, forceNewPage: true, keepWithNext: true },
    );
    pushBlock(
      blocks,
      passage,
      "body",
      "본문/번역",
      data.sentences?.length || 0,
      <TranslationOverviewBlock data={data} />,
      { id: `${passage.id}-translation` },
    );

    const vocabulary = data.vocabulary || [];
    if (vocabulary.length > 0) {
      pushBlock(blocks, passage, "vocab", "어휘", 0, <DenseSectionTitle category="vocab" title="어휘 정리" count={vocabulary.length} />, {
        id: `${passage.id}-vocab-title`,
        keepWithNext: true,
      });
      chunkArray(vocabulary, 9).forEach((chunk, index) => {
        pushBlock(blocks, passage, "vocab", `어휘 ${index + 1}`, chunk.length, <VocabularyDenseBlock items={chunk} />, {
          id: `${passage.id}-vocab-${index}`,
        });
      });
    }

    const grammar = data.grammarPoints || [];
    if (grammar.length > 0) {
      pushBlock(blocks, passage, "grammar", "어법", 0, <DenseSectionTitle category="grammar" title="어법/문법 정리" count={grammar.length} />, {
        id: `${passage.id}-grammar-title`,
        keepWithNext: true,
      });
      chunkArray(grammar, 4).forEach((chunk, index) => {
        pushBlock(blocks, passage, "grammar", `어법 ${index + 1}`, chunk.length, <GrammarDenseBlock items={chunk} />, {
          id: `${passage.id}-grammar-${index}`,
        });
      });
    }

    const syntax = data.syntaxAnalysis || [];
    if (syntax.length > 0) {
      pushBlock(blocks, passage, "syntax", "읽기", 0, <DenseSectionTitle category="syntax" title="문장별 읽기 포인트" count={syntax.length} />, {
        id: `${passage.id}-syntax-title`,
        keepWithNext: true,
      });
      chunkArray(syntax, 4).forEach((chunk, index) => {
        pushBlock(blocks, passage, "syntax", `읽기 ${index + 1}`, chunk.length, <SyntaxDenseBlock items={chunk} />, {
          id: `${passage.id}-syntax-${index}`,
        });
      });
    }

    const examEntries = toExamEntries(data);
    const hasExamSummary = !!data.examDesign?.summaryKeyPoints?.length || !!data.examDesign?.descriptiveConditions?.length;
    if (examEntries.length > 0 || hasExamSummary) {
      pushBlock(blocks, passage, "exam", "출제", 0, <DenseSectionTitle category="exam" title="출제 포인트 정리" count={examEntries.length} />, {
        id: `${passage.id}-exam-title`,
        keepWithNext: true,
      });
      if (hasExamSummary) {
        pushBlock(blocks, passage, "exam", "요약/서술형", 1, <ExamSummaryDenseBlock data={data} />, {
          id: `${passage.id}-exam-summary`,
        });
      }
      chunkArray(examEntries, 4).forEach((chunk, index) => {
        pushBlock(blocks, passage, "exam", `출제 ${index + 1}`, chunk.length, <ExamDenseBlock items={chunk} />, {
          id: `${passage.id}-exam-${index}`,
        });
      });
    }
  }

  return blocks;
}
