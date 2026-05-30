import type {
  StudentChip,
  StudentChoice,
  StudentMatch,
  StudentSpan,
  StudentText,
} from "@/lib/tutor/student-payload";

// 스테이지는 정답키가 제거된 학생용 payload를 받는다.
export interface StageProps<P> {
  payload: P;
  disabled: boolean;
  // 학생 입력이 바뀔 때마다 (응답객체, 제출가능여부)를 상위로 보고한다.
  onResponse: (response: unknown, canSubmit: boolean) => void;
}

export type ChoiceStageProps = StageProps<StudentChoice>;
export type ChipStageProps = StageProps<StudentChip>;
export type MatchStageProps = StageProps<StudentMatch>;
export type SpanStageProps = StageProps<StudentSpan>;
export type TextStageProps = StageProps<StudentText>;
