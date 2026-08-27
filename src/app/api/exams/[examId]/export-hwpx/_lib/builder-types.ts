import type { BlockNode } from "./types";
import type { BuilderItemResolved } from "./render/question";
import type { BuilderSettings } from "@/app/api/exams/[examId]/export-docx/_lib/build-builder-document";
import type { ExamQuestionData } from "@/app/api/exams/[examId]/export-docx/_lib/types";
export interface BuildHwpxOptions {
  title: string;
  settings: BuilderSettings | null;
  resolvedItems: BuilderItemResolved[];
  includeAnswers: boolean;
  fullExamQuestions: ExamQuestionData[];
  /**
   * 표지 정보 박스의 시험일 표기(YYYY-MM-DD). 없으면 빈 문자열.
   * 시험일은 exams.settings 가 아니라 exam.examDate 컬럼에만 있어서 라우트가 따로 넘긴다
   * (표기 형식은 빌더 미리보기의 formatExamDate 와 동일하게 맞춘다).
   */
  examDateLabel?: string;
  /**
   * 표지 구역(section0)을 만들지 여부. 기본 true(시험지).
   *
   * **false 로 꺼야 하는 호출자가 있다**: 문항 1개 내보내기
   * (`/api/questions/[questionId]/export-hwpx`). 거긴 시험지가 아니라 문항 한 장이라
   * 제목·학교·반·이름·시험일이 전부 빈 표지가 1쪽 붙어 버리면 종이만 두 배로 쓴다.
   * 그 라우트가 넘기는 설정에는 header 도 cover 도 없어서 "빈 표지"를 판별할 방법이
   * 값에는 없다 → 명시 플래그로 받는다(문항 1개짜리 시험지를 오판하지 않으려면
   * resolvedItems.length 같은 휴리스틱은 쓰면 안 된다).
   */
  includeCover?: boolean;
}

export interface ColumnUnit {
  placeKey: string | null;
  blocks: BlockNode[];
}
