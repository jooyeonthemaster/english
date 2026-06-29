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
