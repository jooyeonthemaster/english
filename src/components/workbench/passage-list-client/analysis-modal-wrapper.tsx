// @ts-nocheck
"use client";

import React from "react";
import { PassageAnalysisModal } from "@/components/workbench/passage-analysis-modal";
import type { PassageAnalysisData } from "@/types/passage-analysis";

interface PassageItem {
  id: string;
  title: string;
  content: string;
  grade: number | null;
  semester: string | null;
  unit: string | null;
  publisher: string | null;
  difficulty: string | null;
  tags: string | null;
  createdAt: Date;
  school: { id: string; name: string; type: string } | null;
  analysis: { id: string; updatedAt: Date; analysisData?: string | null } | null;
  _count: { questions: number; notes: number };
}

interface Props {
  passage: PassageItem;
  onClose: () => void;
}

export function PassageAnalysisModalWrapper({ passage, onClose }: Props) {
  let analysisData: PassageAnalysisData | null = null;
  try {
    if (passage.analysis?.analysisData) {
      analysisData = JSON.parse(passage.analysis.analysisData as string);
    }
  } catch {
    // Ignore parse errors — fall back to no analysis data
  }

  return (
    <PassageAnalysisModal
      open
      onClose={onClose}
      passage={{
        id: passage.id,
        title: passage.title,
        content: passage.content,
        grade: passage.grade,
        semester: passage.semester,
        unit: passage.unit,
        publisher: passage.publisher,
        difficulty: passage.difficulty,
        tags: passage.tags,
        source: null,
        createdAt: passage.createdAt,
        school: passage.school,
        analysis: passage.analysis
          ? {
              id: passage.analysis.id,
              analysisData: passage.analysis.analysisData as string,
              contentHash: "",
              updatedAt: passage.analysis.updatedAt,
            }
          : null,
        notes: [],
        questions: [],
      }}
      initialAnalysis={analysisData}
    />
  );
}
