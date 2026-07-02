import type { BuilderQuestion, ClassOption, QuestionCollection, SchoolOption } from "../paper-builder/types";
import type { ExamDetail } from "../exam-detail-client-parts/types";
import { PANEL_DEFAULT_WIDTHS } from "./builder-constants";
export interface ExamPaperBuilderClientProps {
  academyId: string;
  // 좌측 목록은 서버 페이지네이션(100/page) — questions 는 "초기 1페이지"다.
  questions: BuilderQuestion[];
  total: number;
  totalPages: number;
  statusCounts: { all: number; approved: number; pending: number };
  collections: QuestionCollection[];
  classes: ClassOption[];
  schools: SchoolOption[];
  initialExam?: ExamDetail | null;
  /**
   * 과목 스코프 — "KOREAN"=국어 시험지 편집: 좌측 문제 피커·폴더를 국어 전용
   * (subType KO_*·subject KOREAN 폴더)으로 조회한다. 미지정=영어 기본(종전과
   * byte 동일 — 픽셀 불변).
   */
  subjectScope?: "KOREAN";
}

export type BuilderPanelTab = "edit" | "settings";

export type PanelWidths = typeof PANEL_DEFAULT_WIDTHS;

export type PanelResizeSide = "left" | "right";

export type QuestionDropInsertion = {
  targetLocalId: string | null;
  targetPartKey: string | null;
  placement: "before" | "after";
};

export type SaveDraftOptions = {
  targetExamId?: string | null;
  titleOverride?: string;
  successMessage?: string;
};
