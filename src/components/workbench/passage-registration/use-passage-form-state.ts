"use client";

import { useState } from "react";
import type { Annotation } from "@/components/workbench/editor";
import type { SavedPrompt } from "./types";

/**
 * Groups the 19 contiguous useState calls for the passage input form
 * (core fields, annotations, image, metadata, analysis prompt). Called at
 * the same hook slot as the original first useState in this contiguous run
 * so overall hook call order is preserved.
 */
export function usePassageFormState() {
  // Core fields
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  // Annotations (teacher's markings on the passage)
  const [annotations, setAnnotations] = useState<Annotation[]>([]);

  // Image
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

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
  const [savedPrompts, setSavedPrompts] = useState<SavedPrompt[]>([]);
  const [showSavedPrompts, setShowSavedPrompts] = useState(false);
  const [newPromptName, setNewPromptName] = useState("");
  const [savingPrompt, setSavingPrompt] = useState(false);

  return {
    title, setTitle,
    content, setContent,
    annotations, setAnnotations,
    imageFile, setImageFile,
    imagePreview, setImagePreview,
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
    savedPrompts, setSavedPrompts,
    showSavedPrompts, setShowSavedPrompts,
    newPromptName, setNewPromptName,
    savingPrompt, setSavingPrompt,
  };
}
