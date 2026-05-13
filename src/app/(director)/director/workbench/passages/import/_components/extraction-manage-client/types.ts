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

export interface M1DraftJobSummary {
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

export type M1PassageDraftWithJob = M1PassageDraftSnapshot & {
  job?: M1DraftJobSummary;
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
