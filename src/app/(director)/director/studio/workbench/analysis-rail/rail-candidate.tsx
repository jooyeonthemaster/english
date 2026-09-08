"use client";

// ============================================================================
// 레일 「후보」 화면 — 분석 행이 아직 없는 자체 시험지(v4, 26-09-02).
// 정본: docs/exam-analysis-v4-spec.md §1-1·§1-2 · §3 U5-2 · §2.5(U5 행)
//
// 발단: 자체 시험지 카드를 눌렀는데 오른쪽이 백지였다(§0 F1~F3). 후보 선택 시
// 레일은 제목·「문항 N」·여정 스트립(분석 active, 나머지 pending)·다음 단계 블록을
// 그린다 — 탭바 없음(상세가 없다).
//
// 【26-09-03 사용자 지시 — 발사 버튼 이사】 [AI 분석 시작 · N cr] 은 이 레일에서
// **중앙 판 하단 도크**(analysis-pane)로 옮겨 갔다. 원문: "미분석 시험에 대해서
// 분석을 하는 이 버튼은 위치가 저 우측 탭이 아니라 … 좌측 탭에 고정이 된 상태로."
// 그래서 이 화면은 이제 **안내 전용**이다(CTA 0). 실행자·잠금·토스트 규약은
// 그대로 살아 있고 소유자만 바뀌었다 — 단일 소스는 rail-next-step-actions
// `analyzeRequestFor`. 요약 폴이 행(boost RUNNING)을 내려주면 셸이 선택을 행으로
// 바꾼다(U6) — 이 뷰는 그때 언마운트된다. 후보가 바뀌면 부모가 key={examId} 로
// 이 상태를 버린다.
//
// 도크와 같은 골격을 쓰려고 다음 단계 블록도 **하단 도크**로 내렸다(레일 공통).
//
// 【26-09-04 사용자 지적 — 본문 백지】 "기본 분석 전에는 왜 오른쪽 탭에 애초에
// 아무것도 표시조차 안 돼. 시험지 원본, 학생들 그런 아무것도 없다는 소리야."
// 맞다 — 본문이 문자 그대로 빈 div 였다. 분석 결과는 아직 없지만 **분석과 무관하게
// 이미 존재하는 두 가지**는 보여줄 수 있고, 크레딧을 쓰기 전에 확인해야 할 것도 그 둘이다:
//   [원본] 조판된 시험지 — examId 만으로 조회된다(ensureExamSheet 키가 examId).
//   [학생] 클래스 로스터 — 아직 응시자는 없지만 **여기서 답안 링크를 보낼 수 있다**.
//          발급 시 서버가 INTERNAL 분석 행을 먼저 만든다(AI 0콜·무과금) → 그 순간
//          이 후보는 분석 행으로 승격되고 이 뷰는 언마운트된다.
// 탭 활성값은 셸 소유(api.activeTab)를 그대로 쓴다 — aside·드로어 두 렌더 동기화.
// 「총평」은 이 상태에 없으므로 students 가 아니면 source 로 접는다.
// ============================================================================

import { useEffect, useMemo } from "react";
import { FileClock } from "lucide-react";
import type { ExamCandidateRow } from "@/hooks/use-exam-report-activity";
import { deriveExamNextStep } from "@/lib/exam-report/next-step";
import { ANALYSIS_STATE_CHIP } from "@/components/exam-report/hub/board-shared";
import { FileBarChart } from "lucide-react";
import { RailExamSheetSection } from "./rail-exam-sheet-section";
import { RailHeader } from "./rail-header";
import { RailJourneyStrip } from "./rail-journey";
import { NEXT_STEP_COSTS, RailNextStepBlock } from "./rail-next-step";
import { ANALYZE_MOVED_NOTE } from "./rail-next-step-actions";
import { RailPerspectiveCaption } from "./rail-perspective-caption";
import { RailTab } from "./rail-primitives";
import { RailCandidateStudents } from "./rail-candidate-students";
import { RailStudentPickBar } from "./rail-student-pick-bar";
import { buildUnifiedRows } from "./rail-student-rows";
import type { AnalysisConsoleApi } from "./use-analysis-console";

// 배지 자구·색은 카드 칩과 **한 토큰**(26-09-04 「그냥 분석 전으로 통일」) —
// slate 였다가 amber 로 올렸다. 후보와 SHALLOW 는 사용자에게 같은 상태이므로
// 카드에서 레일로 넘어올 때 색이 바뀌면 안 된다.
const CANDIDATE_BADGE_CLASS = "border border-amber-200 bg-amber-50 text-amber-700";

export function RailCandidateView({
  candidate,
  onClose,
  console: api,
  classId = null,
  className = null,
}: {
  candidate: ExamCandidateRow;
  onClose: () => void;
  /** 셸 1인스턴스 — 시험지 조판·로스터 페치 소유(2중 마운트 방어). */
  console: AnalysisConsoleApi;
  classId?: string | null;
  className?: string | null;
}) {
  const step = useMemo(
    () => deriveExamNextStep({ row: null, candidate, costs: NEXT_STEP_COSTS }),
    [candidate],
  );
  // 【26-09-04】 탭 구성을 **행 레일과 동일**하게 맞췄다(총평/학생/원본 3개).
  // 종전엔 [총평]이 없어 students 가 아니면 원본으로 접었는데, 그 결과 후보를
  // 열었다가 무과금 승격되는 순간(analysis-pane promoteCandidate) 탭바가 2→3개로
  // 늘고 활성 탭이 원본→총평으로 튀었다. 같은 시험지를 보는 중에 화면 골격이
  // 바뀌면 다른 물건으로 읽힌다. 이제 셸의 activeTab 을 그대로 쓴다.
  const tab = api.activeTab;
  const { ensureRoster } = api;
  useEffect(() => {
    if (classId) ensureRoster(classId);
  }, [classId, ensureRoster]);
  return (
    <div
      data-analysis-rail
      data-analysis-rail-mode="candidate"
      className="flex h-full min-h-0 min-w-0 flex-col"
    >
      <RailHeader
        badgeLabel={ANALYSIS_STATE_CHIP.none.label}
        badgeClassName={CANDIDATE_BADGE_CLASS}
        badgeIcon={FileClock}
        title={candidate.title}
        meta={`문항 ${candidate.questionCount}`}
        onClose={onClose}
      >
        <RailJourneyStrip journey={step.journey} />
      </RailHeader>
      {/* 탭바 — 행 레일(analysis-detail-rail)과 **같은 순서·같은 자구**. */}
      <div className="flex shrink-0 items-stretch border-b border-slate-200 px-1">
        <RailTab
          tabKey="synthesis"
          label="총평"
          active={tab === "synthesis"}
          onSelect={api.setActiveTab}
        />
        <RailTab
          tabKey="students"
          label="학생"
          active={tab === "students"}
          onSelect={api.setActiveTab}
        />
        <RailTab
          tabKey="source"
          label="원본"
          active={tab === "source"}
          onSelect={api.setActiveTab}
        />
      </div>

      <div data-analysis-rail-scroll className="min-h-0 flex-1 overflow-y-auto">
        <div className="min-w-0 space-y-3 px-3 py-3">
          {tab === "synthesis" ? (
            <div className="min-w-0 space-y-2">
              {/* 관점 캡션·안내 자구는 행 레일 [총평] 탭과 동일 — 승격 전후로
                  같은 화면이 이어진다(문항별 분석은 승격된 뒤 채워진다). */}
              <RailPerspectiveCaption
                perspective="exam"
                icon={<FileBarChart className="size-3" aria-hidden="true" />}
                label="시험지 분석 리포트"
                hint="시험지 자체를 분석한 리포트 · 공유는 아래에서"
              />
              <p className="break-keep rounded-md border border-slate-100 bg-slate-50 px-2.5 py-2 text-[11.5px] leading-relaxed text-slate-500">
                시험 총평·난이도 프로필·유형 분포는{" "}
                <b className="font-semibold text-slate-700">AI 분석</b>에서
                만들어집니다. 출제할 때 저장된 문항별 해설은 곧 여기에 표시됩니다.
              </p>
            </div>
          ) : tab === "source" ? (
            <RailExamSheetSection examId={candidate.examId} console={api} />
          ) : classId ? (
            <div className="min-w-0 space-y-2">
              <p className="break-keep text-[11.5px] leading-relaxed text-slate-500">
                아직 이 시험을 본 {className ?? "우리 반"} 학생이 없어요. 링크를
                보내면 학생이 답을 입력하고, 객관식은 자동 채점됩니다. 여러 명을
                한꺼번에 보내려면 체크하세요.
              </p>
              {/* 26-09-04 목록 통합: 후보도 행 레일과 **같은 목록 부품**을 쓴다
                  (학생 행은 아직 없으니 전원 「답안 없음」 태그). 체크 → 하단 픽바. */}
              <RailCandidateStudents examId={candidate.examId} console={api} />
            </div>
          ) : (
            <p className="break-keep text-[11.5px] leading-relaxed text-slate-400">
              왼쪽에서 클래스를 선택하면 학생 목록이 표시됩니다
            </p>
          )}
        </div>
      </div>
      {/* 하단 도크 — 행 레일(analysis-detail-rail RailNextStepDock)과 같은 토큰.
          CTA 는 없다(위 머리 주석) — 안내 + 「어디를 누르는가」 note 뿐. */}
      <div
        data-rail-next-step-dock
        className="shrink-0 border-t border-slate-200 bg-white px-3 pb-3 pt-2.5 shadow-[0_-8px_20px_-12px_rgba(15,23,42,0.25)]"
      >
        {api.pickedStudentKeys.size > 0 ? (
          <RailStudentPickBar
            rows={buildUnifiedRows([], api.roster)}
            target={{ kind: "exam", id: candidate.examId }}
            gateOpen
            console={api}
          />
        ) : (
          <RailNextStepBlock step={step} note={ANALYZE_MOVED_NOTE} />
        )}
      </div>
    </div>
  );
}
