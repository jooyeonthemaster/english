import type {
  ExtractionJobStatus,
  M1PassageDraftSnapshot,
} from "@/lib/extraction/types";

export interface JobDetailResponse {
  job: {
    id: string;
    mode: string;
    status: ExtractionJobStatus;
    originalFileName: string | null;
    displayName: string | null;
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
  /** ExtractionItem rows. Only `examMeta` + `sourcePageIndex` are read on
   *  the client (to surface the booklet's own page number on each draft
   *  card); the rest is ignored. */
  items?: Array<{
    sourcePageIndex: number[];
    examMeta: unknown;
  }>;
  m1PassageDrafts: M1PassageDraftSnapshot[];
}

export interface M1DraftJobSummary {
  id: string;
  originalFileName: string | null;
  displayName: string | null;
  totalPages: number;
  status: ExtractionJobStatus;
  createdAt: string | Date;
  completedAt: string | Date | null;
  pages?: Array<{
    pageIndex: number;
    sourceFileName: string | null;
    /** Booklet's own page number ("1 / 8" → 1). Null when OCR couldn't
     *  read it (page-meta footer absent or unparsed). Surface this on
     *  draft cards instead of `pageIndex + 1` so the teacher sees the
     *  booklet's page rather than the upload-order index. */
    examPageNumber?: number | null;
  }>;
}

export interface SourceMaterialSummary {
  id: string;
  /** Teacher-set override displayed in 자료 관리 only. Empty/null → derived
   *  `"{job name} 시험지 N"` label is used. `SourceMaterial.title` (auto-set
   *  by extraction AI) is intentionally NOT surfaced here because it's
   *  unreliable; that field is still read by other pages. */
  customLabel: string | null;
}

export type M1PassageDraftWithJob = M1PassageDraftSnapshot & {
  job?: M1DraftJobSummary;
  sourceMaterial?: SourceMaterialSummary | null;
};

export interface DraftProblemEvidenceAction {
  type?: string | null;
  target?: string | null;
  value?: string | null;
  reason?: string | null;
  confidence?: number | null;
}

export interface DraftProblemEvidenceQuestion {
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

export interface DraftProblemEvidence {
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

export interface SourceMatchDisplay {
  title: string | null;
  sourceRef: string | null;
  confidence: number | null;
  method: string;
  selected: boolean;
  publisher?: string | null;
  year?: number | null;
}

export interface DraftQuestionChoiceDisplay {
  label: string;
  content: string;
  isAnswer?: boolean | null;
}

export interface DraftQuestionDisplay {
  questionNumber: number | null;
  stem: string;
  questionType?: string | null;
  answer?: string | null;
  choices: DraftQuestionChoiceDisplay[];
  source: "saved" | "evidence";
}

export interface RestorationDebugMetadata {
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
