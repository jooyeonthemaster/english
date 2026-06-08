"use client";

import { useState } from "react";
import type { SavedPrompt } from "./types";
import type { QuestionGenerationPlan } from "@/lib/question-generation-plans";
import {
  DEFAULT_ANALYSIS_TONE,
  type AnalysisTone,
} from "@/lib/passage-analysis-options";

/**
 * Groups the contiguous useState calls for the passage input form
 * (core fields, annotations, image, metadata, analysis prompt). Called at
 * the same hook slot as the original first useState in this contiguous run
 * so overall hook call order is preserved.
 */
export function usePassageFormState() {
  // Per-passage fields (title/content/annotations/image) now live on the
  // individual passage blocks — see use-passage-blocks.ts. This hook only
  // holds state shared across every passage in the center editor.

  // Metadata — school/grade/semester persist between saves for batch entry
  const [schoolId, setSchoolId] = useState("");
  const [grade, setGrade] = useState("");
  const [semester, setSemester] = useState("");
  const [unit, setUnit] = useState("");
  const [publisher, setPublisher] = useState("");
  const [publisherCustom, setPublisherCustom] = useState("");
  const [source, setSource] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);

  // Analysis prompt
  const [analysisPrompt, setAnalysisPrompt] = useState("");
  const [analysisGenerationPlan, setAnalysisGenerationPlan] =
    useState<QuestionGenerationPlan>("STANDARD");
  const [analysisTone, setAnalysisTone] =
    useState<AnalysisTone>(DEFAULT_ANALYSIS_TONE);
  const [savedPrompts, setSavedPrompts] = useState<SavedPrompt[]>([]);
  const [showSavedPrompts, setShowSavedPrompts] = useState(false);
  const [newPromptName, setNewPromptName] = useState("");
  const [savingPrompt, setSavingPrompt] = useState(false);

  return {
    schoolId, setSchoolId,
    grade, setGrade,
    semester, setSemester,
    unit, setUnit,
    publisher, setPublisher,
    publisherCustom, setPublisherCustom,
    source, setSource,
    tagInput, setTagInput,
    tags, setTags,
    analysisPrompt, setAnalysisPrompt,
    analysisGenerationPlan, setAnalysisGenerationPlan,
    analysisTone, setAnalysisTone,
    savedPrompts, setSavedPrompts,
    showSavedPrompts, setShowSavedPrompts,
    newPromptName, setNewPromptName,
    savingPrompt, setSavingPrompt,
  };
}
