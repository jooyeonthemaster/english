"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  Database,
  FileImage,
  FileText,
  Keyboard,
  Layers,
  Loader2,
  PanelBottomOpen,
  PlayCircle,
  RefreshCw,
  Save,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import { useExtractionUpload } from "@/hooks/use-extraction-upload";
import { useExtractionStream } from "@/hooks/use-extraction-stream";
import {
  imagesToSlots,
  revokeSlotUrls,
  splitPdfToImages,
} from "@/lib/extraction/pdf-splitter";
import { useExtractionStore } from "@/lib/extraction/store";
import {
  ACCEPTED_IMAGE_MIMES,
  ACCEPTED_PDF_MIMES,
  MAX_PAGE_IMAGE_BYTES,
  MAX_PAGES_PER_JOB,
  MAX_PDF_BYTES,
} from "@/lib/extraction/constants";
import type {
  ClientPageSlot,
  ExtractionJobStatus,
  M1PassageDraftChangeSnapshot,
  M1PassageDraftSnapshot,
} from "@/lib/extraction/types";

interface Props {
  initialCreditBalance: number;
}

interface JobDetailResponse {
  job: {
    id: string;
    mode: string;
    status: ExtractionJobStatus;
    originalFileName: string | null;
    totalPages: number;
    successPages: number;
    failedPages: number;
    pendingPages: number;
    createdAt: string;
    completedAt: string | null;
  };
  pages?: Array<{
    pageIndex: number;
    sourceFileName?: string | null;
  }>;
  m1PassageDrafts: M1PassageDraftSnapshot[];
}

interface QueueJob {
  id: string;
  mode: string;
  status: ExtractionJobStatus;
  originalFileName: string | null;
  totalPages: number;
  successPages: number;
  failedPages: number;
  pendingPages: number;
  createdAt: string;
  completedAt: string | null;
  draftResultCount: number;
  resultCount: number;
  m1DraftPipelineError?: boolean;
}

interface M1DraftJobSummary {
  id: string;
  originalFileName: string | null;
  totalPages: number;
  status: ExtractionJobStatus;
  createdAt: string | Date;
  completedAt: string | Date | null;
  pages?: Array<{
    pageIndex: number;
    sourceFileName: string | null;
  }>;
}

type M1PassageDraftWithJob = M1PassageDraftSnapshot & {
  job?: M1DraftJobSummary;
};

type WorkPanel = "jobs" | null;
type InputMode = "file" | "text";
type FileSourceType = "PDF" | "IMAGES";

interface DraftProblemEvidenceAction {
  type?: string | null;
  target?: string | null;
  value?: string | null;
  reason?: string | null;
  confidence?: number | null;
}

interface DraftProblemEvidenceQuestion {
  questionNumber?: number | null;
  questionType?: string | null;
  typeLabel?: string | null;
  confidence?: number | null;
  stem?: string | null;
  answer?: string | null;
  answerConfidence?: number | null;
  evidence?: string[];
  restorationActions?: DraftProblemEvidenceAction[];
  warnings?: string[];
}

interface DraftProblemEvidence {
  status?: string | null;
  model?: string | null;
  error?: string | null;
  evidence?: {
    status?: string | null;
    confidence?: number | null;
    sourceHints?: string[];
    questions?: DraftProblemEvidenceQuestion[];
    globalActions?: DraftProblemEvidenceAction[];
    unresolved?: string[];
    warnings?: string[];
  } | null;
}

interface SourceMatchDisplay {
  title: string | null;
  sourceRef: string | null;
  confidence: number | null;
  method: string;
  selected: boolean;
  publisher?: string | null;
  year?: number | null;
}

interface DraftQuestionChoiceDisplay {
  label: string;
  content: string;
  isAnswer?: boolean | null;
}

interface DraftQuestionDisplay {
  questionNumber: number | null;
  stem: string;
  questionType?: string | null;
  answer?: string | null;
  choices: DraftQuestionChoiceDisplay[];
  source: "saved" | "evidence";
}

const ACCEPTED = [...ACCEPTED_PDF_MIMES, ...ACCEPTED_IMAGE_MIMES] as const;
const TEXT_EXTRACTION_MIN_LENGTH = 20;
const TERMINAL = new Set<ExtractionJobStatus>([
  "COMPLETED",
  "PARTIAL",
  "FAILED",
  "CANCELLED",
]);

function getDraftSourceFileNames(draft: M1PassageDraftWithJob): string[] {
  const pages = draft.job?.pages ?? [];
  const byPage = new Map(pages.map((page) => [page.pageIndex, page.sourceFileName] as const));
  return [
    ...new Set(
      draft.sourcePageIndex
        .map((pageIndex) => byPage.get(pageIndex))
        .filter((name): name is string => typeof name === "string" && name.length > 0),
    ),
  ];
}

function getDraftSourceLabel(draft: M1PassageDraftWithJob): string {
  const fileNames = getDraftSourceFileNames(draft);
  const pageLabel = `${draft.sourcePageIndex.map((page) => page + 1).join(", ")}페이지`;
  if (fileNames.length === 1) return `${fileNames[0]} · ${pageLabel}`;
  if (fileNames.length > 1) return `${fileNames[0]} 외 ${fileNames.length - 1}개 · ${pageLabel}`;
  return `${draft.job?.originalFileName ?? "원본 파일"} · ${pageLabel}`;
}

function getDraftSourceShortLabel(draft: M1PassageDraftWithJob): string {
  const fileNames = getDraftSourceFileNames(draft);
  if (fileNames.length === 1) return fileNames[0];
  if (fileNames.length > 1) return `${fileNames[0]} 외 ${fileNames.length - 1}개`;
  return draft.job?.originalFileName ?? `${draft.job?.totalPages ?? 0}페이지 작업`;
}

function readProblemEvidence(draft: M1PassageDraftSnapshot): DraftProblemEvidence | null {
  const metadata = draft.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const evidence = (metadata as { problemEvidence?: unknown }).problemEvidence;
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) return null;
  return evidence as DraftProblemEvidence;
}

function inferProblemEvidenceFromRaw(rawText: string): DraftProblemEvidence | null {
  const positionMarkers = [
    ...rawText.matchAll(/\(\s*(?:[\u2460-\u24681-5]|\?|[^\x00-\x7F]{1,3})\s*\)/g),
  ];
  const chunkMarkers = [...rawText.matchAll(/(?:^|\n)\s*\([A-E]\)\s+/g)];
  const firstSentence = rawText
    .replace(/^\s*\d{1,3}\.\s*/, "")
    .replace(/\s+/g, " ")
    .trim()
    .match(/[A-Z][^.!?]{30,}?[.!?](?=\s|$)/)?.[0]
    ?.trim();
  const questions: DraftProblemEvidenceQuestion[] = [];

  if (positionMarkers.length >= 3) {
    questions.push({
      questionType: "SENTENCE_INSERT",
      typeLabel: "문장 삽입",
      confidence: 0.78,
      stem: "Detected insertion position markers in the extracted passage.",
      answer: null,
      answerConfidence: null,
      evidence: [`${positionMarkers.length} insertion markers detected.`],
      restorationActions: [
        {
          type: "INSERT_SENTENCE",
          target: "BEST_SUPPORTED_POSITION_MARKER",
          value: firstSentence ?? null,
          reason: "Solve the insertion point and remove all position markers.",
          confidence: 0.78,
        },
        {
          type: "REMOVE_PROBLEM_MARKER",
          target: "position markers",
          reason: "Remove insertion position markers.",
          confidence: 0.95,
        },
      ],
      warnings: ["Inferred in the review UI because saved evidence was missing."],
    });
  }

  if (chunkMarkers.length >= 2) {
    questions.push({
      questionType: "SENTENCE_ORDER",
      typeLabel: "글의 순서",
      confidence: 0.72,
      stem: "Detected labeled chunks such as (A), (B), (C).",
      evidence: [`${chunkMarkers.length} chunk labels detected.`],
      restorationActions: [
        {
          type: "REORDER_CHUNKS",
          target: "labeled chunks",
          reason: "Solve the chunk order and remove labels.",
          confidence: 0.72,
        },
      ],
    });
  }

  if (questions.length === 0) return null;

  return {
    status: "INFERRED",
    model: null,
    error: null,
    evidence: {
      status: "PARTIAL",
      confidence: Math.max(...questions.map((question) => question.confidence ?? 0.5)),
      sourceHints: firstSentence ? [firstSentence] : [],
      questions,
      globalActions: [],
      unresolved: [],
      warnings: ["Problem evidence was inferred from raw text for display."],
    },
  };
}

function getDraftProblemEvidence(draft: M1PassageDraftSnapshot): DraftProblemEvidence | null {
  return readProblemEvidence(draft) ?? inferProblemEvidenceFromRaw(draft.rawText);
}

function getEvidenceQuestions(draft: M1PassageDraftSnapshot): DraftProblemEvidenceQuestion[] {
  const evidence = getDraftProblemEvidence(draft)?.evidence;
  return Array.isArray(evidence?.questions) ? evidence.questions : [];
}

function getEvidenceActions(draft: M1PassageDraftSnapshot): DraftProblemEvidenceAction[] {
  const evidence = getDraftProblemEvidence(draft)?.evidence;
  const questionActions = getEvidenceQuestions(draft).flatMap((question) =>
    Array.isArray(question.restorationActions) ? question.restorationActions : [],
  );
  const globalActions = Array.isArray(evidence?.globalActions) ? evidence.globalActions : [];
  return [...questionActions, ...globalActions];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readSavedQuestions(draft: M1PassageDraftSnapshot): DraftQuestionDisplay[] {
  const metadata = asRecord(draft.metadata);
  const rawQuestions = Array.isArray(metadata?.questions) ? metadata.questions : [];
  return rawQuestions
    .map((item): DraftQuestionDisplay | null => {
      const question = asRecord(item);
      if (!question) return null;
      const stem = typeof question.stem === "string" ? question.stem.trim() : "";
      if (!stem) return null;
      const rawChoices = Array.isArray(question.choices) ? question.choices : [];
      const choices = rawChoices
        .map((choice, index): DraftQuestionChoiceDisplay | null => {
          const row = asRecord(choice);
          if (!row) return null;
          const content =
            typeof row.content === "string"
              ? row.content
              : typeof row.text === "string"
                ? row.text
                : "";
          if (!content.trim()) return null;
          return {
            label:
              typeof row.label === "string" && row.label.trim()
                ? row.label
                : String(index + 1),
            content,
            isAnswer: typeof row.isAnswer === "boolean" ? row.isAnswer : null,
          };
        })
        .filter((choice): choice is DraftQuestionChoiceDisplay => choice !== null);
      return {
        questionNumber:
          typeof question.questionNumber === "number"
            ? question.questionNumber
            : null,
        stem,
        choices,
        source: "saved",
      };
    })
    .filter((question): question is DraftQuestionDisplay => question !== null);
}

function readEvidenceQuestionsForDisplay(
  draft: M1PassageDraftSnapshot,
): DraftQuestionDisplay[] {
  return getEvidenceQuestions(draft)
    .map((question): DraftQuestionDisplay | null => {
      const stem =
        typeof question.stem === "string" && question.stem.trim()
          ? question.stem
          : labelQuestionType(question.questionType, question.typeLabel);
      if (!stem.trim()) return null;
      return {
        questionNumber:
          typeof question.questionNumber === "number"
            ? question.questionNumber
            : null,
        stem,
        questionType: question.questionType,
        answer: question.answer ?? null,
        choices: [],
        source: "evidence",
      };
    })
    .filter((question): question is DraftQuestionDisplay => question !== null);
}

function getOriginalQuestions(draft: M1PassageDraftSnapshot): DraftQuestionDisplay[] {
  const saved = readSavedQuestions(draft);
  if (saved.length > 0) return saved;
  return readEvidenceQuestionsForDisplay(draft);
}

function formatPercent(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return `${Math.round(value * 100)}%`;
}

function labelQuestionType(type: string | null | undefined, fallback?: string | null): string {
  if (fallback && fallback !== "Unknown") return fallback;
  const labels: Record<string, string> = {
    BLANK_INFERENCE: "빈칸 추론",
    BLANK_WORD: "단어 빈칸",
    BLANK_SENTENCE: "문장 빈칸",
    CONNECTOR: "연결어",
    SENTENCE_ORDER: "글의 순서",
    PARAGRAPH_ORDER: "문단 순서",
    SENTENCE_INSERT: "문장 삽입",
    IRRELEVANT: "무관한 문장",
    GRAMMAR_ERROR: "어법",
    GRAMMAR_CORRECTION: "어법 수정",
    VOCAB_CHOICE: "어휘",
    CONTEXT_MEANING: "문맥 의미",
    REFERENCE: "지칭",
    CONTENT_MATCH: "내용 일치",
    TOPIC_MAIN_IDEA: "주제/요지",
    TITLE: "제목",
    PURPOSE: "목적",
    MOOD_TONE: "분위기/심경",
    SUMMARY_COMPLETE: "요약문",
    WORD_ORDER: "배열 작문",
    SENTENCE_TRANSFORM: "문장 전환",
    CONDITIONAL_WRITING: "조건 작문",
    TEXTBOOK_DETAIL: "교과서 세부",
    DIALOGUE_ORDER: "대화 순서",
    DIALOGUE_RESPONSE: "대화 응답",
    KOREAN_TRANSLATION: "한국어 해석",
    ENGLISH_DEFINITION: "영영풀이",
    UNKNOWN: "유형 미확정",
  };
  return labels[type ?? ""] ?? type ?? "유형 미확정";
}

function labelActionType(type: string | null | undefined): string {
  const labels: Record<string, string> = {
    REMOVE_PROBLEM_MARKER: "문제 표시 제거",
    RESTORE_BLANK: "빈칸 복구",
    RESTORE_GRAMMAR: "어법 복구",
    RESTORE_VOCAB: "어휘 복구",
    REORDER_CHUNKS: "순서 재배열",
    INSERT_SENTENCE: "문장 삽입",
    REMOVE_IRRELEVANT_SENTENCE: "무관문 제거",
    RESTORE_WORD_ORDER: "배열 작문 복구",
    RESTORE_SUMMARY: "요약문 완성",
    NORMALIZE_LAYOUT: "레이아웃 정리",
    SOURCE_MATCH_ONLY: "출처 매칭 우선",
    TEACHER_REVIEW_REQUIRED: "검수 필요",
  };
  return labels[type ?? ""] ?? type ?? "복원 단서";
}

function inferKnownSourceFromRaw(rawText: string): SourceMatchDisplay | null {
  const normalized = rawText.toLowerCase();
  if (
    normalized.includes("material wealth") &&
    normalized.includes("emotional wealth") &&
    ((normalized.includes("money per se") &&
      normalized.includes("positive experiences")) ||
      (normalized.includes("bare minimum necessary for food and shelter") &&
        normalized.includes("means to an end")))
  ) {
    return {
      title: "Happier: Learn the Secrets to Daily Joy and Lasting Fulfillment",
      sourceRef:
        "Tal Ben-Shahar, Happier: Learn the Secrets to Daily Joy and Lasting Fulfillment",
      confidence: 0.93,
      method: "KNOWN_SOURCE_SIGNATURE",
      selected: false,
      publisher: "McGraw-Hill",
      year: 2007,
    };
  }
  return null;
}

function summarizeFileNames(files: File[]): string {
  if (files.length === 0) return "이미지";
  if (files.length === 1) return files[0].name;
  return `${files[0].name} 외 ${files.length - 1}개`;
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0KB";
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.max(1, Math.round(kb))}KB`;
  return `${(kb / 1024).toFixed(1)}MB`;
}

export function BulkExtractClient({ initialCreditBalance }: Props) {
  void initialCreditBalance;

  const router = useRouter();
  const phase = useExtractionStore((s) => s.phase);
  const jobId = useExtractionStore((s) => s.jobId);
  const error = useExtractionStore((s) => s.error);
  const slots = useExtractionStore((s) => s.slots);
  const splitProgress = useExtractionStore((s) => s.splitProgress);
  const uploadProgress = useExtractionStore((s) => s.uploadProgress);
  const setMode = useExtractionStore((s) => s.setMode);
  const setPhase = useExtractionStore((s) => s.setPhase);
  const setError = useExtractionStore((s) => s.setError);
  const setJobId = useExtractionStore((s) => s.setJobId);
  const setSlots = useExtractionStore((s) => s.setSlots);
  const setSource = useExtractionStore((s) => s.setSource);
  const setSplitProgress = useExtractionStore((s) => s.setSplitProgress);
  const setUploadProgress = useExtractionStore((s) => s.setUploadProgress);
  const startUpload = useExtractionUpload();

  const [sourceName, setSourceName] = useState<string | null>(null);
  const [sourceType, setSourceType] = useState<FileSourceType | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [queueRefreshKey, setQueueRefreshKey] = useState(0);
  const [activePanel, setActivePanel] = useState<WorkPanel>(null);
  const [inputMode, setInputMode] = useState<InputMode>("file");
  const [textTitle, setTextTitle] = useState("");
  const [textValue, setTextValue] = useState("");

  const bootstrapped = useRef(false);
  const navigatedToManage = useRef(false);
  const fileInputId = "m1-passage-workroom-file-input";

  useExtractionStream({
    jobId,
    enabled: phase === "processing" || phase === "starting" || phase === "uploading",
  });

  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;
    setMode("PASSAGE_ONLY");

    if (typeof window !== "undefined") {
      const resumeJobId = new URLSearchParams(window.location.search).get("jobId");
      if (resumeJobId) {
        router.replace(`/director/workbench/passages/import/jobs?jobId=${resumeJobId}`);
        return;
      }
    }

    setPhase("idle");
  }, [router, setMode, setPhase]);

  // 추출이 끝나(=`reviewing` 진입) 잡이 terminal 상태가 되면 자동으로 관리
  // 페이지로 이동시킨다. 이 페이지(`/import`)의 ReviewStep은 M1
  // (`extraction_m1_passage_drafts`)을 표시하지 않으므로, 추출 직후 사용자가
  // 손으로 새로고침/이동을 해야만 결과를 볼 수 있는 동선이 있었다. `?jobId`로
  // 진입한 ManageClient는 그 잡의 `loadJobDetails`를 호출해 drafts를 표시한다.
  useEffect(() => {
    if (navigatedToManage.current) return;
    if (phase !== "reviewing") return;
    if (!jobId) return;
    navigatedToManage.current = true;
    router.replace(
      `/director/workbench/passages/import/jobs?jobId=${jobId}`,
    );
  }, [phase, jobId, router]);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (phase === "preparing" || phase === "uploading" || phase === "starting") {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [phase]);

  const appendSlots = useCallback(
    (incoming: ClientPageSlot[]) => {
      const offset = slots.length;
      const adjusted = incoming.map((slot, index) => ({
        ...slot,
        pageIndex: offset + index,
      }));
      const next = [...slots, ...adjusted];
      setSlots(next);
      setSource(
        `${next.length}페이지`,
        incoming.length === 1 ? "IMAGES" : sourceType === "PDF" ? "PDF" : "IMAGES",
      );
    },
    [setSlots, setSource, slots, sourceType],
  );

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const arr = Array.from(files);
      if (arr.length === 0) return;
      setError(null);

      const pdf = arr.find((file) =>
        ACCEPTED_PDF_MIMES.includes(file.type as (typeof ACCEPTED_PDF_MIMES)[number]),
      );
      const allImages = arr.every((file) =>
        ACCEPTED_IMAGE_MIMES.includes(file.type as (typeof ACCEPTED_IMAGE_MIMES)[number]),
      );

      try {
        if (pdf) {
          if (arr.length > 1) {
      setError("PDF는 한 번에 하나만 추가해 주세요.");
            return;
          }
          if (pdf.size > MAX_PDF_BYTES) {
            setError(
        `PDF 파일은 최대 ${Math.round(MAX_PDF_BYTES / 1024 / 1024)}MB까지 업로드할 수 있습니다.`,
            );
            return;
          }
          if (slots.length >= MAX_PAGES_PER_JOB) {
      setError(`한 작업에는 최대 ${MAX_PAGES_PER_JOB}페이지까지 넣을 수 있습니다.`);
            return;
          }
          setPhase("preparing");
          setSplitProgress({ pageIndex: 0, totalPages: 0 });
          const pages = await splitPdfToImages(pdf, {
            onProgress: (progress) => {
              if (progress.phase !== "done") {
                setSplitProgress({
                  pageIndex: progress.pageIndex,
                  totalPages: progress.totalPages,
                });
              }
            },
          });
          if (slots.length + pages.length > MAX_PAGES_PER_JOB) {
            revokeSlotUrls(pages);
      setError(`한 작업에는 최대 ${MAX_PAGES_PER_JOB}페이지까지 넣을 수 있습니다.`);
            setPhase("idle");
            return;
          }
          appendSlots(pages);
          setSourceName((current) => current ?? pdf.name);
          setSourceType("PDF");
          setSource(pdf.name, "PDF");
          setPhase("idle");
          setSplitProgress(null);
          return;
        }

        if (allImages) {
          if (slots.length + arr.length > MAX_PAGES_PER_JOB) {
      setError(`한 작업에는 최대 ${MAX_PAGES_PER_JOB}페이지까지 넣을 수 있습니다.`);
            return;
          }
          const oversized = arr.find((file) => file.size > MAX_PAGE_IMAGE_BYTES);
          if (oversized) {
      setError(`${oversized.name} 파일이 너무 큽니다. 이미지는 5MB 이하로 올려 주세요.`);
            return;
          }
          const pages = await imagesToSlots(arr);
          appendSlots(pages);
          setSourceName((current) => current ?? summarizeFileNames(arr));
          setSourceType("IMAGES");
          setSource(summarizeFileNames(arr), "IMAGES");
          setPhase("idle");
          return;
        }

        setError("PDF, PNG, JPG, WebP 파일만 업로드할 수 있습니다.");
      } catch (err) {
        setError(err instanceof Error ? err.message : "파일을 처리하지 못했습니다");
        setPhase("idle");
      } finally {
        setSplitProgress(null);
      }
    },
    [
      appendSlots,
      setError,
      setPhase,
      setSource,
      setSplitProgress,
      slots.length,
    ],
  );

  const startExtraction = useCallback(async () => {
    if (slots.length === 0) {
      setError("추출할 파일을 먼저 추가해 주세요.");
      return;
    }
    const uploadSourceType: FileSourceType = sourceType === "PDF" ? "PDF" : "IMAGES";
    const nextJobId = await startUpload({
      slots,
      sourceType: uploadSourceType,
      originalFileName: sourceName,
      mode: "PASSAGE_ONLY",
    });
    if (nextJobId) {
      setJobId(nextJobId);
      setSlots([]);
      setSourceName(null);
      setSourceType(null);
      setUploadProgress(null);
      setActivePanel("jobs");
      setQueueRefreshKey((value) => value + 1);
    }
  }, [
    setError,
    setJobId,
    setSlots,
    setUploadProgress,
    slots,
    sourceName,
    sourceType,
    startUpload,
  ]);

  const startTextExtraction = useCallback(async () => {
    const trimmedText = textValue.trim();
    const trimmedTitle = textTitle.trim();
    if (trimmedText.length < TEXT_EXTRACTION_MIN_LENGTH) {
      setError(`텍스트는 ${TEXT_EXTRACTION_MIN_LENGTH}자 이상 입력해 주세요.`);
      return;
    }

    try {
      setError(null);
      setPhase("starting");
      setJobId(null);
      const res = await fetch("/api/extraction/text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          mode: "PASSAGE_ONLY",
          title: trimmedTitle || undefined,
          text: trimmedText,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
      throw new Error(data?.error ?? "텍스트 추출에 실패했습니다.");
      }
      const data = (await res.json()) as { jobId: string };
      setJobId(data.jobId);
      setPhase("reviewing");
      setTextTitle("");
      setTextValue("");
      setActivePanel("jobs");
      setQueueRefreshKey((value) => value + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "텍스트 추출에 실패했습니다.");
      setPhase("idle");
    }
  }, [setError, setJobId, setPhase, textTitle, textValue]);

  const clearFiles = useCallback(() => {
    setSlots([]);
    setSourceName(null);
    setSourceType(null);
    setError(null);
  }, [setError, setSlots]);

  const clearText = useCallback(() => {
    setTextTitle("");
    setTextValue("");
    setError(null);
  }, [setError]);

  const togglePanel = useCallback((panel: Exclude<WorkPanel, null>) => {
    setActivePanel((current) => (current === panel ? null : panel));
  }, []);

  useEffect(() => {
    if (!activePanel) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setActivePanel(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activePanel]);

  const busy =
    phase === "preparing" ||
    phase === "uploading" ||
    phase === "starting" ||
    phase === "processing";

  return (
    <div className="-m-6 flex min-h-[calc(100vh-56px)] bg-[#F4F6F9] px-4 py-4 sm:px-6 xl:px-8">
      <main className="mx-auto flex min-h-[calc(100vh-88px)] w-full max-w-[1680px] flex-col gap-4">
        <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 px-5 py-4 xl:px-6">
            <div className="flex items-center gap-3">
              <span className="flex size-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600 ring-1 ring-blue-100">
                <UploadCloud className="size-4" aria-hidden="true" />
              </span>
              <div>
                <h1 className="text-xl font-bold text-slate-950">자료 추출</h1>
                <p className="mt-0.5 text-sm text-slate-500">
                  PDF, 이미지, 텍스트를 등록하면 지문을 추출하고 원문 형태로 복원합니다.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setQueueRefreshKey((value) => value + 1)}
                className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md border border-slate-200 px-3 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <RefreshCw className="size-3.5" aria-hidden="true" />
                새로고침
              </button>
              <button
                type="button"
                onClick={() => togglePanel("jobs")}
                className={
                  "inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md border px-3 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 " +
                  (activePanel === "jobs"
                    ? "border-blue-300 bg-blue-50 text-blue-700"
                    : "border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:bg-slate-50")
                }
              >
                <PanelBottomOpen className="size-3.5" aria-hidden="true" />
                작업 목록
              </button>
            </div>
          </div>

          {error ? (
            <div className="mx-6 mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </div>
          ) : null}

          <div className="grid min-h-0 flex-1 gap-4 p-4 sm:p-5 xl:grid-cols-[minmax(0,1fr)_320px] 2xl:grid-cols-[minmax(0,1fr)_340px] xl:p-6">
            <UploadPanel
              busy={busy}
              dragActive={dragActive}
              fileInputId={fileInputId}
              inputMode={inputMode}
              slots={slots}
              splitProgress={splitProgress}
              textTitle={textTitle}
              textValue={textValue}
              uploadProgress={uploadProgress}
              onClear={clearFiles}
              onClearText={clearText}
              onFiles={handleFiles}
              onInputModeChange={setInputMode}
              onStart={startExtraction}
              onStartText={startTextExtraction}
              onDragActiveChange={setDragActive}
              onTextTitleChange={setTextTitle}
              onTextValueChange={setTextValue}
            />
            <ExtractionRunPanel
              busy={busy}
              inputMode={inputMode}
              pageCount={slots.length}
              textLength={textValue.trim().length}
              activeJobId={jobId}
              onOpenManage={() => router.push("/director/workbench/passages/import/jobs")}
            />
          </div>
        </section>

        <button
          type="button"
          onClick={() => togglePanel("jobs")}
          className={
            "fixed bottom-24 right-8 z-40 inline-flex h-11 items-center gap-2 rounded-full border px-4 text-[13px] font-bold shadow-lg transition-all " +
            (activePanel === "jobs"
              ? "border-blue-500 bg-blue-600 text-white"
              : "border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:text-blue-700")
          }
        >
          <PanelBottomOpen className="size-4" aria-hidden="true" />
          작업 목록
        </button>

        {activePanel === "jobs" ? (
          <div className="fixed bottom-40 right-8 z-50 w-[min(520px,calc(100vw-40px))]">
            <div className="relative max-h-[min(620px,calc(100vh-220px))] overflow-y-auto rounded-lg bg-white shadow-2xl ring-1 ring-slate-200/80 [&>section>div:first-child]:pr-14">
              <button
                type="button"
                onClick={() => setActivePanel(null)}
                className="absolute right-3 top-3 z-10 inline-flex size-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 shadow-sm hover:bg-slate-50 hover:text-slate-900"
                aria-label="작업 목록 닫기"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
              <QueuePanel
                activeJobId={jobId}
                refreshKey={queueRefreshKey}
                onDeleteActiveJob={() => {
                  setJobId(null);
                  setPhase("idle");
                }}
                onOpenJob={(id) => {
                  setJobId(id);
                  setPhase("processing");
                  setActivePanel(null);
                  router.push("/director/workbench/passages/import/jobs?jobId=" + id);
                }}
              />
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}

export function ExtractionManageClient() {
  const router = useRouter();
  const [drafts, setDrafts] = useState<M1PassageDraftWithJob[]>([]);
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [rerestoringId, setRerestoringId] = useState<string | null>(null);
  const [deletingDraftId, setDeletingDraftId] = useState<string | null>(null);
  const [resultScope, setResultScope] = useState<"all" | "job">("all");
  const [jobId, setJobId] = useState<string | null>(null);
  const [queueRefreshKey, setQueueRefreshKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const bootstrapped = useRef(false);

  const selectedDraft = useMemo(
    () => drafts.find((draft) => draft.id === selectedDraftId) ?? drafts[0] ?? null,
    [drafts, selectedDraftId],
  );
  const selectedDraftIndex = selectedDraft
    ? drafts.findIndex((draft) => draft.id === selectedDraft.id) + 1
    : 0;
  const reviewNeededCount = drafts.filter(
    (draft) => draft.restorationStatus === "PARTIAL" || draft.restorationStatus === "FAILED",
  ).length;

  const loadJobDetails = useCallback(async (nextJobId: string) => {
    setLoadingDetails(true);
    setError(null);
    try {
      const res = await fetch("/api/extraction/jobs/" + nextJobId, {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) throw new Error("작업 정보를 불러오지 못했습니다.");

      const data = (await res.json()) as JobDetailResponse;
      const jobSummary: M1DraftJobSummary = {
        id: data.job.id,
        originalFileName: data.job.originalFileName,
        totalPages: data.job.totalPages,
        status: data.job.status,
        createdAt: data.job.createdAt,
        completedAt: data.job.completedAt,
        pages: (data.pages ?? []).map((page) => ({
          pageIndex: page.pageIndex,
          sourceFileName: page.sourceFileName ?? null,
        })),
      };
      const nextDrafts = data.m1PassageDrafts.map((draft) => ({
        ...draft,
        job: jobSummary,
      }));
      setDrafts(nextDrafts);
      setSelectedDraftId(nextDrafts[0]?.id ?? null);
      setResultScope("job");
      setJobId(nextJobId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "작업 정보를 불러오지 못했습니다.");
    } finally {
      setLoadingDetails(false);
    }
  }, []);

  const loadAllDrafts = useCallback(async () => {
    setLoadingDetails(true);
    setError(null);
    try {
      const res = await fetch("/api/extraction/m1-passages?limit=200", {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) throw new Error("자료 목록을 불러오지 못했습니다.");

      const data = (await res.json()) as { drafts: M1PassageDraftWithJob[] };
      setDrafts(data.drafts);
      setSelectedDraftId(data.drafts[0]?.id ?? null);
      setResultScope("all");
      setJobId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "자료 목록을 불러오지 못했습니다.");
    } finally {
      setLoadingDetails(false);
    }
  }, []);

  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;

    const nextJobId =
      typeof window === "undefined"
        ? null
        : new URLSearchParams(window.location.search).get("jobId");
    if (nextJobId) {
      void loadJobDetails(nextJobId);
      return;
    }
    void loadAllDrafts();
  }, [loadAllDrafts, loadJobDetails]);

  const showAllResults = useCallback(() => {
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", window.location.pathname);
    }
    void loadAllDrafts();
  }, [loadAllDrafts]);

  const refreshResults = useCallback(() => {
    setQueueRefreshKey((value) => value + 1);
    if (resultScope === "job" && jobId) {
      void loadJobDetails(jobId);
      return;
    }
    void loadAllDrafts();
  }, [jobId, loadAllDrafts, loadJobDetails, resultScope]);

  const openJob = useCallback(
    (nextJobId: string) => {
      if (typeof window !== "undefined") {
        window.history.replaceState(null, "", "?jobId=" + nextJobId);
      }
      void loadJobDetails(nextJobId);
    },
    [loadJobDetails],
  );

  const updateDraftText = useCallback((id: string, teacherText: string) => {
    setDrafts((current) =>
      current.map((draft) => (draft.id === id ? { ...draft, teacherText } : draft)),
    );
  }, []);

  const saveDraft = useCallback(async (draft: M1PassageDraftSnapshot) => {
    setSavingId(draft.id);
    setError(null);
    try {
      const res = await fetch("/api/extraction/m1-passages/" + draft.id, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: draft.title ?? null,
          teacherText: draft.teacherText,
        }),
      });
      if (!res.ok) throw new Error("수정 내용을 저장하지 못했습니다.");

      const data = (await res.json()) as { draft: M1PassageDraftSnapshot };
      setDrafts((current) =>
        current.map((item) =>
          item.id === data.draft.id
            ? {
                ...item,
                ...data.draft,
              }
            : item,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "수정 내용을 저장하지 못했습니다.");
    } finally {
      setSavingId(null);
    }
  }, []);

  const rerestoreDraft = useCallback(async (draft: M1PassageDraftSnapshot) => {
    setRerestoringId(draft.id);
    setError(null);
    try {
      const res = await fetch(
        "/api/extraction/m1-passages/" + draft.id + "/rerestore",
        {
          method: "POST",
          credentials: "include",
        },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error ?? "AI 복원을 다시 실행하지 못했습니다.");
      }

      const data = (await res.json()) as { draft: M1PassageDraftSnapshot };
      setDrafts((current) =>
        current.map((item) =>
          item.id === data.draft.id
            ? {
                ...item,
                ...data.draft,
              }
            : item,
        ),
      );
      setQueueRefreshKey((value) => value + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI 복원을 다시 실행하지 못했습니다.");
    } finally {
      setRerestoringId(null);
    }
  }, []);

  const deleteDraft = useCallback(async (draft: M1PassageDraftSnapshot) => {
    const ok =
      typeof window === "undefined" ? true : window.confirm("이 추출 지문을 삭제할까요?");
    if (!ok) return;

    setDeletingDraftId(draft.id);
    setError(null);
    try {
      const res = await fetch("/api/extraction/m1-passages/" + draft.id, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("지문을 삭제하지 못했습니다.");

      setDrafts((current) => {
        const next = current.filter((item) => item.id !== draft.id);
        setSelectedDraftId((selected) =>
          selected === draft.id ? next[0]?.id ?? null : selected,
        );
        return next;
      });
      setQueueRefreshKey((value) => value + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "지문을 삭제하지 못했습니다.");
    } finally {
      setDeletingDraftId(null);
    }
  }, []);

  return (
    <div className="-m-6 flex min-h-[calc(100vh-56px)] bg-[#F4F6F9] px-4 py-4 sm:px-6 xl:px-8">
      <main className="mx-auto flex min-h-[calc(100vh-88px)] w-full max-w-[1680px] flex-col gap-4">
        <section className="flex min-h-0 flex-[0.72] flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 px-5 py-4 xl:px-6">
            <div className="flex items-center gap-3">
              <span className="flex size-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600 ring-1 ring-blue-100">
                <FileImage className="size-4" aria-hidden="true" />
              </span>
              <div>
                <h1 className="text-xl font-bold text-slate-950">자료 관리</h1>
                <p className="mt-0.5 text-sm text-slate-500">
                  추출한 지문을 작업별로 확인하고 복원문을 수정해서 저장합니다.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => router.push("/director/workbench/passages/import")}
                className="inline-flex h-9 cursor-pointer items-center rounded-md border border-slate-200 px-3 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                자료 추출
              </button>
              {resultScope === "job" ? (
                <button
                  type="button"
                  onClick={showAllResults}
                  className="inline-flex h-9 cursor-pointer items-center rounded-md border border-slate-200 px-3 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  전체 결과
                </button>
              ) : null}
              <button
                type="button"
                onClick={refreshResults}
                className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md border border-slate-200 px-3 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <RefreshCw className="size-3.5" aria-hidden="true" />
                새로고침
              </button>
            </div>
          </div>

          {error ? (
            <div className="mx-6 mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </div>
          ) : null}

          <ManagementSummaryBar
            resultScope={resultScope}
            draftCount={drafts.length}
            selectedIndex={selectedDraftIndex}
            reviewNeededCount={reviewNeededCount}
          />

          <div className="grid min-h-0 flex-1 gap-4 p-4 pt-0 sm:p-5 sm:pt-0 xl:grid-cols-[minmax(320px,0.38fr)_minmax(420px,0.62fr)] xl:p-6 xl:pt-0">
            <QueuePanel
              activeJobId={jobId}
              refreshKey={queueRefreshKey}
              onDeleteActiveJob={showAllResults}
              onOpenJob={openJob}
            />
            <ResultSelectorPanel
              busy={false}
              drafts={drafts}
              loading={loadingDetails}
              selectedDraftId={selectedDraftId}
              onSelect={setSelectedDraftId}
            />
          </div>
        </section>

          <ResultPanel
            busy={false}
            drafts={drafts}
            loading={loadingDetails}
            selectedDraft={selectedDraft}
            savingId={savingId}
            rerestoringId={rerestoringId}
            deletingDraftId={deletingDraftId}
            onDelete={deleteDraft}
            onRerestore={rerestoreDraft}
            onSave={saveDraft}
            onTextChange={updateDraftText}
          />
      </main>
    </div>
  );
}

function ExtractionRunPanel({
  activeJobId,
  busy,
  inputMode,
  pageCount,
  textLength,
  onOpenManage,
}: {
  activeJobId: string | null;
  busy: boolean;
  inputMode: InputMode;
  pageCount: number;
  textLength: number;
  onOpenManage: () => void;
}) {
  const hasInput =
    inputMode === "text" ? textLength >= TEXT_EXTRACTION_MIN_LENGTH : pageCount > 0;
  const statusLabel = busy
    ? "처리 중"
    : activeJobId
      ? "완료"
      : hasInput
        ? "준비 완료"
        : "대기";
  const statusIcon = busy ? (
    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
  ) : activeJobId || hasInput ? (
    <CheckCircle2 className="size-4" aria-hidden="true" />
  ) : (
    <Clock3 className="size-4" aria-hidden="true" />
  );
  const inputCount = inputMode === "text" ? textLength : pageCount;
  const inputUnit = inputMode === "text" ? "자" : "페이지";
  const inputLabel = inputMode === "text" ? "입력 텍스트" : "선택 자료";
  const inputIcon =
    inputMode === "text" ? (
      <Keyboard className="size-3.5" aria-hidden="true" />
    ) : (
      <FileImage className="size-3.5" aria-hidden="true" />
    );

  return (
    <aside className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-slate-950">추출 진행</h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              등록한 자료의 처리 상태를 작업 목록에서 추적합니다.
            </p>
          </div>
          <span
            className={
              "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold " +
              (busy
                ? "bg-blue-50 text-blue-700 ring-1 ring-blue-100"
                : activeJobId || hasInput
                  ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100"
                  : "bg-slate-50 text-slate-500 ring-1 ring-slate-200")
            }
            aria-live="polite"
          >
            {statusIcon}
            {statusLabel}
          </span>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2.5 p-3">
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
              {inputIcon}
              {inputLabel}
            </div>
            <div className="mt-2 text-2xl font-bold leading-none text-slate-950">
              {inputCount}
            </div>
            <div className="mt-1 text-xs text-slate-500">{inputUnit}</div>
          </div>
          <div className="rounded-lg border border-blue-100 bg-blue-50/70 px-3 py-2.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-700">
              <FileText className="size-3.5" aria-hidden="true" />
              추출 방식
            </div>
            <div className="mt-2 text-base font-bold text-blue-950">지문 전용</div>
            <div className="mt-1 text-xs text-blue-700">M1</div>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <div className="mb-2.5 flex items-center gap-2">
            <Layers className="size-4 text-blue-600" aria-hidden="true" />
            <h3 className="text-sm font-bold text-slate-900">작업 흐름</h3>
          </div>
          <ol className="space-y-2">
            <WorkflowStep
              index={1}
              title="자료 추가"
              description="파일은 페이지로, 텍스트는 원문 그대로 준비합니다."
              active={hasInput}
            />
            <WorkflowStep
              index={2}
              title="추출 실행"
              description="파일은 OCR 후 복원하고, 텍스트는 바로 복원합니다."
              active={busy}
            />
            <WorkflowStep
              index={3}
              title="자료 관리"
              description="결과 비교, 수정 저장, 삭제를 이어서 처리합니다."
              active={Boolean(activeJobId)}
            />
          </ol>
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="flex items-center gap-2">
            <Database className="size-4 text-slate-500" aria-hidden="true" />
            <h3 className="text-sm font-bold text-slate-900">결과 위치</h3>
          </div>
          <p className="mt-2 text-xs leading-5 text-slate-600">
            추출 결과의 원문 비교와 복원문 수정은 자료 관리에서 진행합니다.
          </p>
        </div>

        <div className="min-h-0 flex-1 rounded-lg border border-dashed border-slate-200 bg-white p-3">
          <div className="flex h-full min-h-[72px] flex-col justify-center">
            <div className="text-xs font-bold text-slate-500">권장 순서</div>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-800">
              자료를 입력한 뒤 추출을 시작하고, 완료된 작업은 자료 관리에서 검수하세요.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onOpenManage}
          className="inline-flex h-9 w-full cursor-pointer items-center justify-center gap-1.5 rounded-md border border-blue-200 bg-white text-sm font-bold text-blue-700 shadow-sm transition-colors hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <Database className="size-4" aria-hidden="true" />
          {activeJobId || busy ? "진행 작업 관리로 이동" : "자료 관리 열기"}
        </button>
      </div>
    </aside>
  );
}

function WorkflowStep({
  active,
  description,
  index,
  title,
}: {
  active: boolean;
  description: string;
  index: number;
  title: string;
}) {
  return (
    <li className="flex gap-2.5">
      <span
        className={
          "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold " +
          (active ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500")
        }
      >
        {index}
      </span>
      <div className="min-w-0">
        <div className="text-xs font-bold text-slate-800">{title}</div>
        <p className="mt-0.5 text-xs leading-5 text-slate-500">{description}</p>
      </div>
    </li>
  );
}

function UploadPanel({
  busy,
  dragActive,
  fileInputId,
  inputMode,
  slots,
  splitProgress,
  textTitle,
  textValue,
  uploadProgress,
  onClear,
  onClearText,
  onFiles,
  onInputModeChange,
  onStart,
  onStartText,
  onDragActiveChange,
  onTextTitleChange,
  onTextValueChange,
}: {
  busy: boolean;
  dragActive: boolean;
  fileInputId: string;
  inputMode: InputMode;
  slots: ClientPageSlot[];
  splitProgress: { pageIndex?: number; totalPages?: number } | null;
  textTitle: string;
  textValue: string;
  uploadProgress: { uploaded: number; total: number } | null;
  onClear: () => void;
  onClearText: () => void;
  onFiles: (files: FileList | File[]) => void;
  onInputModeChange: (mode: InputMode) => void;
  onStart: () => void;
  onStartText: () => void;
  onDragActiveChange: (active: boolean) => void;
  onTextTitleChange: (value: string) => void;
  onTextValueChange: (value: string) => void;
}) {
  const textLength = textValue.trim().length;
  const canStartText = textLength >= TEXT_EXTRACTION_MIN_LENGTH;
  const modeDescription =
    inputMode === "file"
      ? "PDF와 이미지를 계속 추가할 수 있습니다."
      : "지문 원문이나 문제 형식 텍스트를 붙여넣을 수 있습니다.";

  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div>
          <h2 className="text-sm font-bold text-slate-950">자료 입력</h2>
          <p className="mt-1 text-xs text-slate-500">{modeDescription}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-md bg-slate-100 p-0.5 text-xs font-bold text-slate-500">
            <button
              type="button"
              onClick={() => onInputModeChange("file")}
              className={
                "inline-flex h-7 cursor-pointer items-center gap-1.5 rounded px-2.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 " +
                (inputMode === "file"
                  ? "bg-white text-blue-700 shadow-sm"
                  : "hover:text-slate-800")
              }
            >
              <UploadCloud className="size-3.5" aria-hidden="true" />
              파일
            </button>
            <button
              type="button"
              onClick={() => onInputModeChange("text")}
              className={
                "inline-flex h-7 cursor-pointer items-center gap-1.5 rounded px-2.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 " +
                (inputMode === "text"
                  ? "bg-white text-blue-700 shadow-sm"
                  : "hover:text-slate-800")
              }
            >
              <Keyboard className="size-3.5" aria-hidden="true" />
              텍스트
            </button>
          </div>
          {inputMode === "file" && slots.length > 0 ? (
            <button
              type="button"
              onClick={onClear}
              disabled={busy}
              className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-slate-200 px-2.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Trash2 className="size-3.5" aria-hidden="true" />
              비우기
            </button>
          ) : null}
          {inputMode === "text" && (textTitle || textValue) ? (
            <button
              type="button"
              onClick={onClearText}
              disabled={busy}
              className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-slate-200 px-2.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Trash2 className="size-3.5" aria-hidden="true" />
              비우기
            </button>
          ) : null}
        </div>
      </div>

      {inputMode === "text" ? (
        <div className="flex min-h-0 flex-1 flex-col gap-3 p-3.5">
          <div className="grid gap-3 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
            <label className="block">
              <span className="text-xs font-bold text-slate-700">제목</span>
              <input
                value={textTitle}
                onChange={(event) => onTextTitleChange(event.target.value)}
                disabled={busy}
                placeholder="예: 222.jpg 텍스트 입력"
                className="mt-1.5 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition-colors placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50"
              />
            </label>
            <div className="grid grid-cols-3 gap-2">
              <UploadMetaChip icon={<Keyboard className="size-3.5" aria-hidden="true" />}>
                직접 입력
              </UploadMetaChip>
              <UploadMetaChip icon={<FileText className="size-3.5" aria-hidden="true" />}>
                문제 형식 가능
              </UploadMetaChip>
              <UploadMetaChip icon={<Database className="size-3.5" aria-hidden="true" />}>
                복원 적용
              </UploadMetaChip>
            </div>
          </div>

          <div className="flex min-h-[360px] flex-1 flex-col rounded-lg border border-slate-200 bg-slate-50/70 p-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-bold text-slate-900">텍스트 원문</div>
                <p className="mt-0.5 text-xs text-slate-500">
                  지문만 붙여넣거나 보기와 선택지가 포함된 문제 텍스트를 그대로 붙여넣으세요.
                </p>
              </div>
              <span
                className={
                  "shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ring-1 " +
                  (canStartText
                    ? "bg-emerald-50 text-emerald-700 ring-emerald-100"
                    : "bg-white text-slate-500 ring-slate-200")
                }
              >
                {textLength.toLocaleString()}??              </span>
            </div>
            <textarea
              value={textValue}
              onChange={(event) => onTextValueChange(event.target.value)}
              disabled={busy}
              placeholder={`Soft drink companies attract consumers by adding bright colors...\n\n(A) Also, the artificial flavor...\n(B) Studies have shown...\n(C) They are artificial chemicals...`}
              className="min-h-[280px] flex-1 resize-none rounded-md border border-dashed border-slate-300 bg-white px-4 py-3 text-sm leading-7 text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50"
            />
          </div>

          <div className="grid gap-2 rounded-lg border border-blue-100 bg-blue-50/50 p-3 text-xs leading-5 text-blue-800 md:grid-cols-3">
            <div>
              <div className="font-bold">입력</div>
              <p className="mt-0.5">붙여넣은 텍스트를 줄바꿈까지 그대로 보존합니다.</p>
            </div>
            <div>
              <div className="font-bold">복원</div>
              <p className="mt-0.5">문제 형식이면 본문을 기준으로 M1 복원을 실행합니다.</p>
            </div>
            <div>
              <div className="font-bold">검수</div>
              <p className="mt-0.5">완료된 결과는 자료 관리에서 비교하고 저장합니다.</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onStartText}
            disabled={busy || !canStartText}
            className="inline-flex h-10 w-full cursor-pointer items-center justify-center rounded-md bg-blue-600 px-5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {busy ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
                작업 중
              </>
            ) : (
              <>
                <PlayCircle className="mr-2 size-4" aria-hidden="true" />
                텍스트 추출 시작
              </>
            )}
          </button>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-3 p-3.5">
        <label
          htmlFor={fileInputId}
          onDragOver={(event) => {
            event.preventDefault();
            onDragActiveChange(true);
          }}
          onDragLeave={() => onDragActiveChange(false)}
          onDrop={(event) => {
            event.preventDefault();
            onDragActiveChange(false);
            if (event.dataTransfer.files.length > 0) onFiles(event.dataTransfer.files);
          }}
          className={
            "flex min-h-[260px] flex-[1.45] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-5 text-center transition-colors " +
            (dragActive
              ? "border-sky-500 bg-sky-50"
              : "border-slate-300 bg-white hover:border-blue-400 hover:bg-blue-50/30")
          }
        >
          <input
            id={fileInputId}
            type="file"
            className="sr-only"
            accept={ACCEPTED.join(",")}
            multiple
            disabled={busy}
            onChange={(event) => {
              if (event.target.files) onFiles(event.target.files);
              event.currentTarget.value = "";
            }}
          />
          <span className="flex size-12 items-center justify-center rounded-full bg-blue-50 text-blue-600 ring-1 ring-blue-100">
            <UploadCloud className="size-6" strokeWidth={1.8} aria-hidden="true" />
          </span>
          <div className="mt-3 text-sm font-bold text-slate-900">
            파일을 끌어놓거나 클릭해서 추가
          </div>
          <div className="mt-1 text-xs text-slate-500">
            여러 이미지와 PDF 페이지를 순서대로 등록합니다.
          </div>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <UploadMetaChip icon={<FileText className="size-3.5" aria-hidden="true" />}>
              PDF, PNG, JPG, WebP
            </UploadMetaChip>
            <UploadMetaChip icon={<Layers className="size-3.5" aria-hidden="true" />}>
              최대 {MAX_PAGES_PER_JOB}페이지
            </UploadMetaChip>
            <UploadMetaChip icon={<Database className="size-3.5" aria-hidden="true" />}>
              PDF {Math.round(MAX_PDF_BYTES / 1024 / 1024)}MB
            </UploadMetaChip>
          </div>
        </label>

        {splitProgress ? (
          <ProgressLine
            label="PDF 페이지 분리 중"
            value={splitProgress.pageIndex ?? 0}
            max={Math.max(1, splitProgress.totalPages ?? 1)}
          />
        ) : null}
        {uploadProgress ? (
          <ProgressLine
            label="업로드 중"
            value={uploadProgress.uploaded}
            max={Math.max(1, uploadProgress.total)}
          />
        ) : null}

        <div className="flex min-h-[150px] flex-[0.62] flex-col rounded-lg border border-slate-200 bg-slate-50/80 p-3">
          <div className="mb-2 flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-slate-900">자료 대기열</span>
              <p className="mt-0.5 text-xs text-slate-500">추출할 페이지를 확인합니다.</p>
            </div>
            <span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-blue-700 ring-1 ring-blue-100">
              {slots.length}페이지
            </span>
          </div>

          {slots.length === 0 ? (
            <div className="flex min-h-[92px] flex-1 flex-col items-center justify-center rounded-md border border-dashed border-slate-200 bg-white text-center">
              <FileImage className="size-6 text-slate-300" aria-hidden="true" />
              <div className="mt-2 text-xs font-semibold text-slate-500">
                아직 선택한 자료가 없습니다.
              </div>
              <div className="mt-1 text-xs text-slate-400">
                파일을 추가하면 페이지 목록이 표시됩니다.
              </div>
            </div>
          ) : (
            <div className="grid min-h-0 flex-1 grid-cols-2 content-start gap-2 overflow-y-auto pr-1 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {slots.map((slot) => (
                <div
                  key={slot.pageIndex + '-' + slot.previewUrl}
                  className="min-w-0 rounded-md border border-slate-200 bg-white p-2"
                  title={slot.sourceFileName ?? slot.pageIndex + 1 + '페이지'}
                >
                  <div className="relative aspect-[4/3] overflow-hidden rounded border border-slate-200 bg-slate-50">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={slot.previewUrl}
                      alt={slot.pageIndex + 1 + '페이지'}
                      className="h-full w-full object-cover"
                    />
                    <span className="absolute bottom-0 left-0 rounded-tr bg-slate-950/75 px-1.5 py-0.5 text-[10px] font-bold text-white">
                      {slot.pageIndex + 1}
                    </span>
                  </div>
                  <div className="mt-1 truncate text-[11px] font-bold text-slate-800">
                    {slot.sourceFileName ?? slot.pageIndex + 1 + '페이지 이미지'}
                  </div>
                  <div className="mt-0.5 flex items-center justify-between gap-1 text-[10.5px] text-slate-500">
                    <span>{slot.pageIndex + 1}페이지</span>
                    <span>{formatBytes(slot.bytes)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={onStart}
          disabled={busy || slots.length === 0}
          className="inline-flex h-10 w-full cursor-pointer items-center justify-center rounded-md bg-blue-600 px-5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {busy ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
              작업 중
            </>
          ) : (
            <>
              <PlayCircle className="mr-2 size-4" aria-hidden="true" />
              추출 시작
            </>
          )}
        </button>
      </div>
      )}
    </section>
  );
}

function UploadMetaChip({
  children,
  icon,
}: {
  children: ReactNode;
  icon: ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600">
      {icon}
      {children}
    </span>
  );
}

function ManagementSummaryBar({
  draftCount,
  resultScope,
  reviewNeededCount,
  selectedIndex,
}: {
  draftCount: number;
  resultScope: "all" | "job";
  reviewNeededCount: number;
  selectedIndex: number;
}) {
  return (
    <div className="grid gap-2 border-b border-slate-100 bg-slate-50/60 px-4 py-3 sm:grid-cols-2 xl:grid-cols-4 xl:px-6">
      <ManagementMetric
        icon={<Database className="size-3.5" aria-hidden="true" />}
        label="범위"
        value={resultScope === "job" ? "선택 작업" : "전체 결과"}
      />
      <ManagementMetric
        icon={<FileText className="size-3.5" aria-hidden="true" />}
        label="자료"
        value={`${draftCount}개`}
      />
      <ManagementMetric
        icon={<FileImage className="size-3.5" aria-hidden="true" />}
        label="선택"
        value={selectedIndex > 0 ? `${selectedIndex}/${draftCount}` : "-"}
      />
      <ManagementMetric
        icon={<AlertCircle className="size-3.5" aria-hidden="true" />}
        label="확인 필요"
        tone={reviewNeededCount > 0 ? "warning" : "default"}
        value={`${reviewNeededCount}개`}
      />
    </div>
  );
}

function ManagementMetric({
  icon,
  label,
  tone = "default",
  value,
}: {
  icon: ReactNode;
  label: string;
  tone?: "default" | "warning";
  value: string;
}) {
  return (
    <div
      className={
        "flex items-center justify-between gap-3 rounded-md border bg-white px-3 py-2 " +
        (tone === "warning" ? "border-amber-200" : "border-slate-200")
      }
    >
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
        <span
          className={
            "flex size-6 items-center justify-center rounded-md " +
            (tone === "warning" ? "bg-amber-50 text-amber-700" : "bg-slate-50 text-slate-500")
          }
        >
          {icon}
        </span>
        {label}
      </div>
      <strong
        className={
          "text-sm font-bold " + (tone === "warning" ? "text-amber-700" : "text-slate-900")
        }
      >
        {value}
      </strong>
    </div>
  );
}

function ResultSelectorPanel({
  busy,
  drafts,
  loading,
  selectedDraftId,
  onSelect,
}: {
  busy: boolean;
  drafts: M1PassageDraftWithJob[];
  loading: boolean;
  selectedDraftId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <div>
          <h2 className="text-sm font-bold text-slate-950">자료 목록</h2>
          <p className="mt-1 text-xs text-slate-500">
            검수할 추출 지문을 선택합니다.
          </p>
        </div>
        <span className="rounded-md bg-blue-50 px-2 py-1 text-xs font-bold text-blue-700 ring-1 ring-blue-100">
          {drafts.length}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden p-2.5">
        <div className="flex h-full min-h-[180px] flex-col gap-2 overflow-y-auto pr-1">
          {drafts.length === 0 ? (
            <div className="flex min-h-[150px] flex-col items-center justify-center rounded-md border border-dashed border-slate-200 bg-white px-3 py-8 text-center text-xs text-slate-400">
              <FileText className="mb-2 size-6 text-slate-300" aria-hidden="true" />
              {busy || loading
                ? "추출 결과를 기다리는 중입니다."
                : "아직 추출 결과가 없습니다."}
            </div>
          ) : (
            drafts.map((draft, index) => (
              <button
                key={draft.id}
                type="button"
                onClick={() => onSelect(draft.id)}
                className={
                  "cursor-pointer rounded-md border px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 " +
                  ((selectedDraftId ?? drafts[0]?.id) === draft.id
                    ? "border-blue-300 bg-blue-50 shadow-sm"
                    : "border-slate-200 bg-white hover:border-blue-200 hover:bg-slate-50")
                }
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-bold text-slate-900">
                      {draft.title ?? `지문 ${index + 1}`}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                      <span>표시 {index + 1}</span>
                      <span className="text-slate-300">|</span>
                      <span>
                        {draft.sourcePageIndex.map((page) => page + 1).join(", ")}페이지
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <RestorationBadge status={draft.restorationStatus} />
                    <span className="text-xs font-semibold text-slate-400">
                      {draft.sourcePageIndex.length}페이지
                    </span>
                  </div>
                </div>
                {draft.job ? (
                  <div
                    className="mt-2 truncate border-t border-slate-100 pt-2 text-xs text-slate-500"
                    title={getDraftSourceLabel(draft)}
                  >
                    {getDraftSourceShortLabel(draft)}
                  </div>
                ) : null}
              </button>
            ))
          )}
        </div>
      </div>
    </section>
  );
}

function ResultPanel({
  busy,
  drafts,
  loading,
  selectedDraft,
  savingId,
  rerestoringId,
  deletingDraftId,
  onDelete,
  onRerestore,
  onSave,
  onTextChange,
}: {
  busy: boolean;
  drafts: M1PassageDraftWithJob[];
  loading: boolean;
  selectedDraft: M1PassageDraftWithJob | null;
  savingId: string | null;
  rerestoringId: string | null;
  deletingDraftId: string | null;
  onDelete: (draft: M1PassageDraftSnapshot) => void;
  onRerestore: (draft: M1PassageDraftSnapshot) => void;
  onSave: (draft: M1PassageDraftSnapshot) => void;
  onTextChange: (id: string, teacherText: string) => void;
}) {
  return (
    <section className="flex min-h-0 flex-[1.28] flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 xl:px-5">
        <div>
          <h2 className="text-base font-bold text-slate-950">자료 추출 결과</h2>
          <p className="mt-1 text-xs text-slate-500">
            선택한 지문의 문제 원문과 복원문을 크게 비교합니다.
          </p>
        </div>
        <span className="rounded-md bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700 ring-1 ring-blue-100">
          결과 {drafts.length}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3.5 xl:p-4">
        {loading ? (
          <EmptyState
            icon={<Loader2 className="size-7 animate-spin" />}
            title="결과를 불러오는 중"
          />
        ) : selectedDraft ? (
          <PassageCompare
            draft={selectedDraft}
            saving={savingId === selectedDraft.id}
            rerestoring={rerestoringId === selectedDraft.id}
            deleting={deletingDraftId === selectedDraft.id}
            onDelete={() => onDelete(selectedDraft)}
            onRerestore={() => onRerestore(selectedDraft)}
            onSave={() => onSave(selectedDraft)}
            onTextChange={(value) => onTextChange(selectedDraft.id, value)}
          />
        ) : (
          <EmptyState
            icon={<FileImage className="size-7" />}
            title={busy ? "추출 결과를 기다리는 중입니다." : "추출한 지문이 여기에 표시됩니다."}
            description="자료 목록에서 검수할 지문을 선택할 수 있습니다."
          />
        )}
      </div>
    </section>
  );
}

function PassageCompare({
  draft,
  deleting,
  rerestoring,
  saving,
  onDelete,
  onRerestore,
  onSave,
  onTextChange,
}: {
  draft: M1PassageDraftWithJob;
  deleting: boolean;
  rerestoring: boolean;
  saving: boolean;
  onDelete: () => void;
  onRerestore: () => void;
  onSave: () => void;
  onTextChange: (value: string) => void;
}) {
  const busy = deleting || rerestoring || saving;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-[17px] font-bold text-slate-950">
              지문 {draft.passageOrder + 1}
            </h3>
            <RestorationBadge status={draft.restorationStatus} />
            <RestorationMethodBadge draft={draft} />
          </div>
          <p className="mt-1 text-[12px] text-slate-500">
            출처 {getDraftSourceLabel(draft)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onDelete}
            disabled={busy}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-red-200 bg-white px-3 text-[12px] font-bold text-red-600 hover:bg-red-50 disabled:opacity-60"
          >
            {deleting ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Trash2 className="size-3.5" aria-hidden="true" />
            )}
            삭제
          </button>
          <button
            type="button"
            onClick={onRerestore}
            disabled={busy}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-3 text-[12px] font-bold text-blue-700 hover:bg-blue-100 disabled:opacity-60"
          >
            {rerestoring ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCw className="size-3.5" aria-hidden="true" />
            )}
            AI 복원 다시 실행
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={busy}
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-slate-900 px-3 text-[12px] font-bold text-white hover:bg-slate-700 disabled:opacity-60"
          >
            {saving ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Save className="size-3.5" aria-hidden="true" />
            )}
            수정 저장
          </button>
        </div>
      </div>

      <SourceMatchPanel draft={draft} />
      <ComparisonPanel draft={draft} />

      <div className="grid min-h-0 flex-1 gap-4 2xl:grid-cols-2">
        <OriginalProblemBox draft={draft} />
        <EditableRestoredTextBox
          value={draft.teacherText}
          changes={draft.changes}
          onChange={onTextChange}
        />
      </div>
    </div>
  );
}

function RestorationEvidencePanel({ draft }: { draft: M1PassageDraftWithJob }) {
  const problemEvidence = getDraftProblemEvidence(draft);
  const evidence = problemEvidence?.evidence ?? null;
  const questions = getEvidenceQuestions(draft);
  const actions = getEvidenceActions(draft);
  const topSource = draft.sourceMatches[0] ?? null;
  const selectedSource =
    draft.sourceMatches.find((match) => match.selected) ?? topSource;
  const inferredSource = selectedSource ? null : inferKnownSourceFromRaw(draft.rawText);
  const displaySource = selectedSource ?? inferredSource;
  const sourceHints = Array.isArray(evidence?.sourceHints) ? evidence.sourceHints : [];
  const unresolved = Array.isArray(evidence?.unresolved) ? evidence.unresolved : [];

  return (
    <div className="grid gap-3 xl:grid-cols-[1.15fr_0.85fr]">
      <section className="rounded-lg border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <div className="flex items-center gap-2">
            <Layers className="size-4 text-blue-600" aria-hidden="true" />
            <span className="text-[13px] font-bold text-slate-950">
              문제 단서
            </span>
          </div>
          <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">
            {problemEvidence?.status ?? "SKIPPED"}
          </span>
        </div>
        <div className="space-y-3 px-4 py-3">
          {questions.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {questions.slice(0, 6).map((question, index) => (
                <div
                  key={`${question.questionNumber ?? index}-${question.questionType ?? "UNKNOWN"}`}
                  className="min-w-[150px] flex-1 rounded-md border border-blue-100 bg-blue-50/60 px-3 py-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[12px] font-bold text-blue-900">
                      {labelQuestionType(question.questionType, question.typeLabel)}
                    </span>
                    <span className="shrink-0 text-[11px] font-bold text-blue-600">
                      {formatPercent(question.confidence)}
                    </span>
                  </div>
                  <div className="mt-1 truncate text-[12px] text-slate-600">
                    {question.answer ? `정답 ${question.answer}` : "정답 단서 없음"}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-[12px] text-slate-500">
              문제형 단서가 없거나 원문형 자료로 판단했습니다.
            </div>
          )}

          <EvidenceActionList actions={actions} unresolved={unresolved} />
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <div className="flex items-center gap-2">
            <Database className="size-4 text-emerald-600" aria-hidden="true" />
            <span className="text-[13px] font-bold text-slate-950">
              출처 활용
            </span>
          </div>
          <span className="rounded bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
            {displaySource ? formatPercent(displaySource.confidence) : "NO MATCH"}
          </span>
        </div>
        <div className="space-y-3 px-4 py-3">
          {displaySource ? (
            <SourceMatchSummary match={displaySource} />
          ) : (
            <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-[12px] text-slate-500">
              아직 확정 가능한 출처 후보가 없습니다. 문제 단서 기반 복원과 교사 검수를 우선합니다.
            </div>
          )}
          {sourceHints.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {sourceHints.slice(0, 5).map((hint) => (
                <span
                  key={hint}
                  className="rounded bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-100"
                >
                  {hint}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function EvidenceActionList({
  actions,
  unresolved,
}: {
  actions: DraftProblemEvidenceAction[];
  unresolved: string[];
}) {
  const uniqueActions = actions
    .filter((action) => action.type)
    .filter((action, index, arr) => {
      const key = `${action.type}:${action.target ?? ""}:${action.value ?? ""}`;
      return (
        arr.findIndex(
          (candidate) =>
            `${candidate.type}:${candidate.target ?? ""}:${candidate.value ?? ""}` === key,
        ) === index
      );
    })
    .slice(0, 8);

  if (uniqueActions.length === 0 && unresolved.length === 0) {
    return (
      <div className="flex items-center gap-2 text-[12px] text-slate-500">
        <CheckCircle2 className="size-4 text-emerald-500" aria-hidden="true" />
        추가 복원 액션 없이 원문/출처 매칭 중심으로 처리합니다.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {uniqueActions.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {uniqueActions.map((action, index) => (
            <span
              key={`${action.type}-${index}`}
              className="rounded bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-700"
              title={action.reason ?? undefined}
            >
              {labelActionType(action.type)}
            </span>
          ))}
        </div>
      ) : null}
      {unresolved.length > 0 ? (
        <div className="rounded-md bg-amber-50 px-3 py-2 text-[12px] text-amber-800 ring-1 ring-amber-100">
          {unresolved.slice(0, 2).join(" / ")}
        </div>
      ) : null}
    </div>
  );
}

function SourceMatchSummary({ match }: { match: SourceMatchDisplay }) {
  const sourceRef =
    typeof match.sourceRef === "string" && match.sourceRef.startsWith("http")
      ? match.sourceRef
      : null;

  return (
    <div className="rounded-md border border-emerald-100 bg-emerald-50/60 px-3 py-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[13px] font-bold text-emerald-950">
            {match.title ?? match.sourceRef ?? "출처 후보"}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-emerald-700">
            <span>{match.method}</span>
            {match.publisher ? <span>{match.publisher}</span> : null}
            {match.year ? <span>{match.year}</span> : null}
          </div>
        </div>
        <span className="shrink-0 rounded bg-white px-2 py-0.5 text-[11px] font-bold text-emerald-700 ring-1 ring-emerald-100">
          {match.selected ? "SELECTED" : "CANDIDATE"}
        </span>
      </div>
      {sourceRef ? (
        <a
          href={sourceRef}
          target="_blank"
          rel="noreferrer"
          className="mt-2 block truncate text-[11px] font-semibold text-blue-700 underline-offset-2 hover:underline"
        >
          {sourceRef}
        </a>
      ) : null}
    </div>
  );
}

function SourceMatchPanel({ draft }: { draft: M1PassageDraftWithJob }) {
  const topSource = draft.sourceMatches[0] ?? null;
  const selectedSource =
    draft.sourceMatches.find((match) => match.selected) ?? topSource;
  const inferredSource = selectedSource
    ? null
    : inferKnownSourceFromRaw(draft.rawText);
  const displaySource = selectedSource ?? inferredSource;
  const evidence = getDraftProblemEvidence(draft)?.evidence ?? null;
  const sourceHints = Array.isArray(evidence?.sourceHints)
    ? evidence.sourceHints
    : [];

  return (
    <section className="rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <Database className="size-4 text-emerald-600" aria-hidden="true" />
          <span className="text-[13px] font-bold text-slate-950">출처 활용</span>
        </div>
        <span className="rounded bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
          {displaySource ? formatPercent(displaySource.confidence) : "NO MATCH"}
        </span>
      </div>
      <div className="space-y-3 px-4 py-3">
        {displaySource ? (
          <SourceMatchSummary match={displaySource} />
        ) : (
          <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-[12px] text-slate-500">
            아직 확정 가능한 출처 후보가 없습니다.
          </div>
        )}
        {sourceHints.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {sourceHints.slice(0, 5).map((hint) => (
              <span
                key={hint}
                className="rounded bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-100"
              >
                {hint}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}

interface RestorationDebugMetadata {
  finalMethod?: string | null;
  finalStatus?: string | null;
  aiRestoration?: {
    restoredText?: string | null;
    status?: string | null;
    method?: string | null;
    confidence?: number | null;
  } | null;
  comparison?: {
    agreement?: number | null;
    differences?: string[] | null;
    recommendation?: string | null;
  } | null;
  sourceMatch?: {
    title?: string | null;
    sourceRef?: string | null;
    confidence?: number | null;
  } | null;
}

function readRestorationMetadata(
  draft: M1PassageDraftWithJob,
): RestorationDebugMetadata | null {
  const metadata = draft.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata))
    return null;
  const restoration = (metadata as Record<string, unknown>).restoration;
  if (
    !restoration ||
    typeof restoration !== "object" ||
    Array.isArray(restoration)
  )
    return null;
  return restoration as RestorationDebugMetadata;
}

function recommendationLabel(value: string | null | undefined): {
  label: string;
  className: string;
} {
  switch (value) {
    case "BOTH_AGREE":
      return {
        label: "출처 = AI",
        className: "bg-emerald-50 text-emerald-800 ring-emerald-200",
      };
    case "SOURCE_PRIMARY":
      return {
        label: "출처 우선",
        className: "bg-blue-50 text-blue-800 ring-blue-200",
      };
    case "AI_PRIMARY":
      return {
        label: "AI 복원 우선",
        className: "bg-violet-50 text-violet-800 ring-violet-200",
      };
    case "TEACHER_REVIEW_REQUIRED":
      return {
        label: "교사 검수 필요",
        className: "bg-amber-50 text-amber-800 ring-amber-200",
      };
    default:
      return {
        label: value ?? "정보 없음",
        className: "bg-slate-50 text-slate-700 ring-slate-200",
      };
  }
}

function ComparisonPanel({ draft }: { draft: M1PassageDraftWithJob }) {
  const restoration = readRestorationMetadata(draft);
  if (!restoration) return null;
  const aiRestored = restoration.aiRestoration?.restoredText?.trim() ?? "";
  const comparison = restoration.comparison ?? null;
  const sourceMatch = restoration.sourceMatch ?? null;
  // 표시할 정보가 전혀 없으면 패널 자체를 숨긴다.
  if (!aiRestored && !comparison && !sourceMatch) return null;

  const agreementPct =
    typeof comparison?.agreement === "number"
      ? Math.round(comparison.agreement * 100)
      : null;
  const recLabel = recommendationLabel(comparison?.recommendation ?? null);
  const differences = Array.isArray(comparison?.differences)
    ? comparison.differences.filter(
        (d): d is string => typeof d === "string" && d.trim().length > 0,
      )
    : [];

  return (
    <section className="rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <Layers className="size-4 text-violet-600" aria-hidden="true" />
          <span className="text-[13px] font-bold text-slate-950">
            출처 ↔ AI 복원 비교
          </span>
          {restoration.finalMethod ? (
            <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">
              최종: {restoration.finalMethod}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {agreementPct != null ? (
            <span className="rounded bg-violet-50 px-2 py-0.5 text-[11px] font-bold text-violet-800 ring-1 ring-violet-100">
              일치도 {agreementPct}%
            </span>
          ) : null}
          <span
            className={
              "rounded px-2 py-0.5 text-[11px] font-bold ring-1 " + recLabel.className
            }
          >
            {recLabel.label}
          </span>
        </div>
      </div>
      <div className="space-y-3 px-4 py-3">
        {aiRestored ? (
          <details className="rounded-md border border-slate-200 bg-slate-50">
            <summary className="cursor-pointer select-none px-3 py-2 text-[12px] font-bold text-slate-700">
              AI 복원본 (출처 미사용 추론)
              <span className="ml-2 text-[11px] font-normal text-slate-500">
                {restoration.aiRestoration?.status ?? ""} ·{" "}
                {restoration.aiRestoration?.method ?? ""}
              </span>
            </summary>
            <div className="whitespace-pre-wrap border-t border-slate-200 bg-white px-3 py-2.5 text-[13px] leading-6 text-slate-800">
              {aiRestored}
            </div>
          </details>
        ) : null}
        {differences.length > 0 ? (
          <div className="rounded-md bg-amber-50 px-3 py-2 text-[12px] text-amber-900 ring-1 ring-amber-100">
            <div className="mb-1 font-bold">두 결과가 다른 부분</div>
            <ul className="list-disc space-y-0.5 pl-4">
              {differences.slice(0, 6).map((diff) => (
                <li key={diff}>{diff}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function OriginalProblemBox({ draft }: { draft: M1PassageDraftWithJob }) {
  return (
    <div className="flex min-h-[260px] flex-col rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <span className="text-[13px] font-bold text-slate-900">문제 원문</span>
        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10.5px] font-bold text-slate-600">
          RAW
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <div className="whitespace-pre-wrap text-[14px] leading-7 text-slate-800">
          {draft.rawText}
        </div>
      </div>
    </div>
  );
}

function EditableRestoredTextBox({
  value,
  changes,
  onChange,
}: {
  value: string;
  changes: M1PassageDraftChangeSnapshot[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex min-h-[260px] flex-col rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <span className="text-[13px] font-bold text-slate-900">복원문</span>
        <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10.5px] font-bold text-emerald-700">
          RESTORED
        </span>
      </div>
      <div className="relative min-h-[260px] flex-1">
        <div
          aria-hidden="true"
          className="pointer-events-none h-full min-h-[260px] overflow-y-auto whitespace-pre-wrap px-4 py-3 text-[14px] leading-7 text-slate-800"
        >
          <HighlightedText text={value} changes={changes} />
        </div>
        <textarea
          aria-label="복원문 수정"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          spellCheck={false}
          className="absolute inset-0 h-full min-h-[260px] w-full resize-none overflow-y-auto rounded-b-lg border-0 bg-transparent px-4 py-3 text-[14px] leading-7 text-transparent caret-slate-950 outline-none selection:bg-sky-200/60 focus:ring-2 focus:ring-sky-200"
        />
      </div>
    </div>
  );
}

function HighlightedText({
  text,
  changes,
}: {
  text: string;
  changes: M1PassageDraftChangeSnapshot[];
}) {
  const parts = useMemo(() => {
    const targets = changes
      .map((change) => change.after)
      .filter((after) => after.trim().length >= 3)
      .sort((a, b) => b.length - a.length);
    if (targets.length === 0) return [text];

    const result: Array<{ text: string; changed: boolean }> = [];
    let cursor = 0;
    while (cursor < text.length) {
      const match = targets.find((target) => text.startsWith(target, cursor));
      if (match) {
        result.push({ text: match, changed: true });
        cursor += match.length;
      } else {
        const nextIndex = targets
          .map((target) => text.indexOf(target, cursor + 1))
          .filter((index) => index >= 0)
          .sort((a, b) => a - b)[0];
        const end = nextIndex ?? text.length;
        result.push({ text: text.slice(cursor, end), changed: false });
        cursor = end;
      }
    }
    return result;
  }, [changes, text]);

  return (
    <>
      {parts.map((part, index) =>
        typeof part === "string" ? (
          <span key={index}>{part}</span>
        ) : part.changed ? (
          <mark key={index} className="rounded bg-amber-100 text-slate-900">
            {part.text}
          </mark>
        ) : (
          <span key={index}>{part.text}</span>
        ),
      )}
    </>
  );
}

function QueuePanel({
  activeJobId,
  refreshKey,
  onDeleteActiveJob,
  onOpenJob,
}: {
  activeJobId: string | null;
  refreshKey: number;
  onDeleteActiveJob: () => void;
  onOpenJob: (id: string) => void;
}) {
  const [filter, setFilter] = useState<"all" | "running" | "done" | "waiting">("all");
  const [jobs, setJobs] = useState<QueueJob[]>([]);
  const [loading, setLoading] = useState(false);

  const loadJobs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/extraction/jobs?limit=50", {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = (await res.json()) as { jobs: QueueJob[] };
      setJobs(data.jobs.filter((job) => job.mode === "PASSAGE_ONLY"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadJobs();
    const timer = window.setInterval(() => void loadJobs(), 10000);
    return () => window.clearInterval(timer);
  }, [loadJobs]);

  useEffect(() => {
    void loadJobs();
  }, [loadJobs, refreshKey]);

  const filtered = jobs.filter((job) => {
    if (filter === "all") return true;
    if (filter === "running") return job.status === "PROCESSING";
    if (filter === "waiting") return job.status === "PENDING";
    return TERMINAL.has(job.status);
  });
  const runningCount = jobs.filter((job) => job.status === "PROCESSING").length;

  const deleteJob = useCallback(
    async (job: QueueJob) => {
      const ok =
        typeof window === "undefined"
          ? true
          : window.confirm("이 추출 작업과 결과를 삭제할까요?");
      if (!ok) return;

      const res = await fetch("/api/extraction/jobs/" + job.id, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) return;
      setJobs((current) => current.filter((item) => item.id !== job.id));
      if (job.id === activeJobId) onDeleteActiveJob();
    },
    [activeJobId, onDeleteActiveJob],
  );

  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <div>
          <h2 className="text-sm font-bold text-slate-950">작업 목록</h2>
          <p className="mt-1 text-xs text-slate-500">
            백그라운드 추출 상태를 확인합니다.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {runningCount > 0 ? (
            <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10.5px] font-bold text-emerald-700">
              진행 {runningCount}
            </span>
          ) : null}
          <span className="rounded bg-slate-50 px-2 py-1 text-[11px] font-bold text-sky-700">
            {jobs.length}
          </span>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col p-3">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1">
            <QueueFilter active={filter === "all"} onClick={() => setFilter("all")}>
              전체
            </QueueFilter>
            <QueueFilter active={filter === "running"} onClick={() => setFilter("running")}>
              진행중
            </QueueFilter>
            <QueueFilter active={filter === "done"} onClick={() => setFilter("done")}>
              완료
            </QueueFilter>
            <QueueFilter active={filter === "waiting"} onClick={() => setFilter("waiting")}>
              대기중
            </QueueFilter>
          </div>
          <button
            type="button"
            onClick={() => void loadJobs()}
            className="cursor-pointer rounded-md border border-slate-200 p-1.5 text-slate-500 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            aria-label="작업 목록 새로고침"
          >
            <RefreshCw className={loading ? "size-3.5 animate-spin" : "size-3.5"} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
          {filtered.length === 0 ? (
            <div className="flex min-h-[150px] flex-col items-center justify-center rounded-md border border-dashed border-slate-200 bg-white py-8 text-center text-xs text-slate-400">
              <Clock3 className="mb-2 size-6 text-slate-300" aria-hidden="true" />
              표시할 작업이 없습니다.
            </div>
          ) : (
            filtered.map((job) => (
              <div
                key={job.id}
                className={
                  "w-full rounded-md border px-3 py-2 text-left transition-colors " +
                  (job.id === activeJobId
                    ? "border-sky-300 bg-sky-50"
                    : "border-slate-200 bg-white hover:border-sky-200")
                }
              >
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => onOpenJob(job.id)}
                    className="min-w-0 flex-1 cursor-pointer truncate text-left text-sm font-bold text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  >
                    {job.originalFileName ?? job.totalPages + "페이지 이미지"}
                  </button>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {job.m1DraftPipelineError ? (
                      <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10.5px] font-bold text-red-600">
                        저장 실패
                      </span>
                    ) : null}
                    <JobStatusBadge status={job.status} />
                    {TERMINAL.has(job.status) ? (
                      <button
                        type="button"
                        onClick={() => void deleteJob(job)}
                        className="cursor-pointer rounded p-1 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
                        aria-label="추출 작업 삭제"
                      >
                        <Trash2 className="size-3.5" aria-hidden="true" />
                      </button>
                    ) : null}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onOpenJob(job.id)}
                  className="mt-1 flex w-full cursor-pointer items-center justify-between text-left text-xs text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  <span>
                    {job.m1DraftPipelineError
                      ? "\uACB0\uACFC \uC800\uC7A5 \uC2E4\uD328 · \uC7AC\uCD94\uCD9C \uD544\uC694"
                      : job.successPages +
                        "/" +
                        job.totalPages +
                        "\uD398\uC774\uC9C0 · \uACB0\uACFC " +
                        job.resultCount}
                  </span>
                  <span>{formatDate(job.createdAt)}</span>
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}

function ProgressLine({
  label,
  value,
  max,
}: {
  label: string;
  value: number;
  max: number;
}) {
  const ratio = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div>
      <div className="mb-1 flex justify-between text-[11px] font-semibold text-slate-500">
        <span>{label}</span>
        <span>
          {value}/{max}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-200">
        <div className="h-full rounded-full bg-sky-500" style={{ width: `${ratio}%` }} />
      </div>
    </div>
  );
}

function QueueFilter({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "cursor-pointer rounded-full px-2.5 py-1 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 " +
        (active ? "bg-emerald-600 text-white" : "border border-slate-200 bg-white text-slate-500")
      }
    >
      {children}
    </button>
  );
}

function EmptyState({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
}) {
  return (
    <div className="flex min-h-[460px] flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50/70 text-center">
      <div className="text-slate-400">{icon}</div>
      <div className="mt-3 text-[14px] font-bold text-slate-700">{title}</div>
      {description ? <div className="mt-1 text-[12px] text-slate-400">{description}</div> : null}
    </div>
  );
}

function getRestorationMethod(draft: M1PassageDraftSnapshot): string | null {
  const metadata = draft.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }
  const restoration = (metadata as { restoration?: unknown }).restoration;
  if (!restoration || typeof restoration !== "object" || Array.isArray(restoration)) {
    return null;
  }
  const method = (restoration as { method?: unknown }).method;
  return typeof method === "string" ? method : null;
}

function RestorationMethodBadge({ draft }: { draft: M1PassageDraftSnapshot }) {
  const method = getRestorationMethod(draft);
  if (!method) return null;

  const label =
    method === "LOCAL_DB"
      ? "DB 원문"
      : method === "WEB_SEARCH"
        ? "웹 원문"
        : method.includes("WEB")
          ? "웹 후보"
          : method.includes("AI")
            ? "AI 복원"
            : method === "CODE_FALLBACK"
              ? "형식 보정"
              : method === "FAILED"
                ? "수동 필요"
                : "후보 검토";

  return (
    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10.5px] font-bold text-slate-600">
      {label}
    </span>
  );
}

function RestorationBadge({ status }: { status: string }) {
  if (status === "NO_RESTORATION_NEEDED") {
    return (
      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10.5px] font-bold text-emerald-700">
        복원 불필요
      </span>
    );
  }
  if (status === "PARTIAL" || status === "FAILED") {
    return (
      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10.5px] font-bold text-amber-700">
        확인 필요
      </span>
    );
  }
  return (
    <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[10.5px] font-bold text-sky-700">
      복원됨
    </span>
  );
}

function JobStatusBadge({ status }: { status: ExtractionJobStatus }) {
  const label =
    status === "PROCESSING"
      ? "진행중"
      : status === "PENDING"
        ? "대기중"
        : status === "COMPLETED"
          ? "완료"
          : status === "PARTIAL"
            ? "부분완료"
            : status === "FAILED"
              ? "실패"
              : "취소";
  return (
    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10.5px] font-bold text-slate-600">
      {label}
    </span>
  );
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
