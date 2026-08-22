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
  /**
   * 최상위 셸의 레이아웃 클래스 전체를 대체(bg 분기는 유지) — 임베드 호스트
   * (스튜디오 오버레이)는 뷰포트 고정(-m·100dvh) 대신 컨테이너 추종이 필요하다.
   * 미지정=현행 문자열(픽셀 불변).
   */
  shellClassName?: string;
  /**
   * 신규 첫 저장·다른 이름 저장 성공 시 router.replace(편집 라우트 이탈) 대신
   * 호출 — 임베드 호스트가 오버레이를 유지한다. 이후 저장은 내부 savedExamId 로
   * 같은 시험지 UPDATE 로 흐른다. 미지정=현행 라우팅.
   */
  onSavedExam?: (examId: string) => void;
  /**
   * IndexedDB 초안 키 접미사 — create 슬롯이 academyId 당 1개뿐이라 임베드
   * 호스트와 기존 생성 페이지가 초안을 쟁탈하는 것을 막는다. 미지정=기존 키.
   */
  draftScope?: string;
  /** 저장 폼 반 셀렉트 초기값 — initialExam 의 반이 항상 우선. */
  initialClassId?: string;
  /**
   * dirty 변화 통지 — beforeunload 는 인앱 언마운트를 못 막으므로 임베드
   * 호스트의 닫기 가드 재료(마운트 직후 1회 포함).
   */
  onDirtyChange?: (dirty: boolean) => void;
  /**
   * 좌측 문항 라이브러리 패널의 초기 접힘 강제(§3.10.17-a, additive) —
   * 임베드 호스트(클래스 스튜디오: 평면 리스트가 라이브러리 역할)용.
   * 제공 시 localStorage 복원·영속을 모두 우회한다(독립 라우트 시작 상태
   * 오염 방지). 미전달 = 기존 동작 그대로.
   */
  initialLeftCollapsed?: boolean;
  /**
   * 우측 편집/설정 패널의 초기 접힘 강제(§3.10.17, additive) — 좁은 임베드
   * (스튜디오 우측 패널)용. 좌측과 같은 저장 우회 계약. 미전달 = 기존 동작.
   */
  initialRightCollapsed?: boolean;
  /**
   * 외부 선택 라이브 동기화(§3.10.17, additive) — 배열 참조가 바뀔 때 직전
   * 동기 집합과의 **증분(diff)만** 시험지에 반영한다(체크 = 조판, 해제 =
   * 제거 · 빌더 내부 편집과 싸우지 않는 dead-reckoning). 첫 전달분은 전체
   * 추가(초기 시드). 미전달 = 무동작.
   */
  syncQuestionIds?: string[];
  /**
   * 좌측 문항 라이브러리(문제관리) 완전 제거(§3.10.17-d v2.3, additive) —
   * 클래스 스튜디오 인-플로우 조판처럼 중앙 목록이 라이브러리 역할을 대신하는
   * 임베드용. 접힘(initialLeftCollapsed)과 달리 여닫이 핸들·핸들 컬럼(24px)
   * 까지 소멸해 다시 열 수 없다. 미전달 = 기존 동작(픽셀 불변).
   */
  hideQuestionLibrary?: boolean;
  /**
   * 빌더 내부 자동 숨김 헤더(「시험지 생성」 타이틀)와 좌상단 「헤더 보기」
   * 삼각 토글까지 통째 제거(§3.10.17-e (i), additive) — 임베드 호스트가 자체
   * 헤더를 가질 때 이중 헤더·잔여 돌기(사용자 "이거 좀 없애라고")를 없앤다.
   * 미전달 = 기존 동작(픽셀 불변).
   */
  hideBuilderHeader?: boolean;
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
