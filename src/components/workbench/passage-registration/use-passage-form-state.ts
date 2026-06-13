"use client";

import { useState } from "react";
import type { SavedPrompt } from "./types";
import {
  DEFAULT_ANALYSIS_TONE,
  type AnalysisTone,
} from "@/lib/passage-analysis-options";

/**
 * Groups the shared form state for the 학습지 생성 page — passage metadata, the
 * analysis prompt, tags, and saved-prompt UI. Passage text + teacher markings
 * no longer live here; they are per-row in the multi-passage input stack
 * (`passage-input/`). These fields persist between analyze runs so a teacher can
 * batch several passages under the same metadata.
 */
export function usePassageFormState() {
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
    analysisTone, setAnalysisTone,
    savedPrompts, setSavedPrompts,
    showSavedPrompts, setShowSavedPrompts,
    newPromptName, setNewPromptName,
    savingPrompt, setSavingPrompt,
  };
}
