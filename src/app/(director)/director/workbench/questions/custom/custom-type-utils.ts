import { QUESTION_TYPE_META } from "@/lib/question-schemas";

// 커스텀 유형 UI 공유 타입·헬퍼.

export interface CustomTypeSpec {
  tier: "BUILTIN_OVERRIDE" | "GENERIC";
  nearestBuiltin: string | null;
  matchConfidence: "high" | "medium" | "low";
  passageBased: boolean;
  stimulusKind: string;
  answerShape: "MULTIPLE_CHOICE" | "SHORT_ANSWER" | "OTHER";
  optionCount: number;
  multipleAnswers: boolean;
  correctAnswerCount: number;
  difficulty: "BASIC" | "INTERMEDIATE" | "KILLER";
  targetPoints: string[];
  invariants: string[];
  variableAxes: string[];
  prompt: string;
  description: string;
  [key: string]: unknown;
}

export interface AnalyzeResponse {
  spec: CustomTypeSpec;
  suggestedName: string;
  source: unknown;
  analysisModel: string;
  otherQuestionCount: number;
}

export interface CustomTypeListItem {
  id: string;
  name: string;
  status: string;
  nearestBuiltin: string | null;
  matchConfidence: string | null;
  usageCount: number;
  generatedCount: number;
  approvedCount: number;
  createdAt: string;
  // 활성 버전 spec 요약 — 생성 패널 유형 카드 상세 토글(임시 override)의 기본값.
  answerShape: "MULTIPLE_CHOICE" | "SHORT_ANSWER" | "OTHER";
  optionCount: number;
  correctAnswerCount: number;
  multipleAnswers: boolean;
  passageBased: boolean;
  difficulty: "BASIC" | "INTERMEDIATE" | "KILLER";
  tunableParams: TunableParam[];
}

// 유형 고유의 조절 가능한 수치 파라미터(요약문 빈칸 수·순서배열 분할 개수 등). 분석에서 추출, value=기본값.
export interface TunableParam {
  key: string;
  label: string;
  value: number;
  min: number;
  max: number;
}

// 유형 카드 상세 토글에서 조절하는 생성 시 임시 override(미지정 필드는 유형 정의 그대로).
// 답형/지문기반 같은 "구조 전환"은 유형의 본질(동형성)이라 여기서 바꾸지 않는다(영구 편집은 ✦ 모달).
// 객관식 선지 수치 + 유형 고유 파라미터(params: key→value)만 조절한다.
export interface CustomTypeOverride {
  optionCount?: number;
  correctAnswerCount?: number;
  params?: Record<string, number>;
}

export type CustomGenJobStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";

export interface CustomGenJob {
  id: string;
  status: CustomGenJobStatus;
  customTypeId: string;
  passageCount: number;
  countPerPassage: number;
  totalCount: number;
  savedCount: number;
  skippedCount: number;
  errorMessage: string | null;
  gradeInfo: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface CustomTypeAnalysisJob {
  id: string;
  status: CustomGenJobStatus;
  suggestedName: string | null;
  createdTypeId: string | null;
  errorMessage: string | null;
  gradeInfo: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface CustomGenQuestion {
  id: string;
  subType: string | null;
  questionText: string;
  options: Array<{ label: string; text: string }>;
  correctAnswer: string;
  difficulty: string;
  points: number;
  createdAt: string;
  customTypeId: string | null;
  tier: string | null;
  passageTitle: string | null;
  explanation: string | null;
}

export interface PassageListItem {
  id: string;
  title: string;
  content: string | null;
  grade?: string | null;
}

export const DIFFICULTY_LABEL: Record<string, string> = {
  BASIC: "기본",
  INTERMEDIATE: "중급",
  KILLER: "킬러",
};

export const CONFIDENCE_LABEL: Record<string, string> = {
  high: "높음",
  medium: "보통",
  low: "낮음",
};

export function tierLabel(tier: string): string {
  return tier === "BUILTIN_OVERRIDE" ? "빌트인 기반(고품질)" : "범용 생성";
}

export function builtinLabel(id: string | null): string {
  if (!id) return "신규 구조";
  return QUESTION_TYPE_META[id]?.label ?? id;
}

export function answerShapeLabel(shape: string): string {
  if (shape === "MULTIPLE_CHOICE") return "객관식";
  if (shape === "SHORT_ANSWER") return "서술형/단답";
  return "기타";
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;
      if (typeof result === "string") resolve(result.split(",")[1] ?? result);
      else reject(new Error("이미지를 읽지 못했습니다."));
    };
    reader.onerror = () => reject(reader.error ?? new Error("이미지를 읽지 못했습니다."));
    reader.readAsDataURL(blob);
  });
}

export function mediaTypeForBlob(blob: Blob): "image/jpeg" | "image/png" | "image/webp" {
  if (blob.type === "image/png") return "image/png";
  if (blob.type === "image/webp") return "image/webp";
  return "image/jpeg";
}

export function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return `${d.getMonth() + 1}.${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(
      d.getMinutes(),
    ).padStart(2, "0")}`;
  } catch {
    return "";
  }
}
