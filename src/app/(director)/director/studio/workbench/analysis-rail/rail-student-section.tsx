"use client";

// ============================================================================
// 레일 S3 「학생」 — **단일 목록**(26-09-04 개편) + 인라인 추가 + 방금 보낸 링크.
//
// 26-09-04 사용자 지시 2건으로 구조가 바뀌었다:
//  ① "여기 학생이랑 여기 학생이랑 이렇게 구분할 필요가 있나? 그냥 정답 체크 완료,
//     미완료 태그로 분류만 해주는게 좋지 않아?" → 「등록됨」/「아직 응시하지 않은
//     학생」 2섹션을 **한 목록 + 상태 태그**로 통합(rail-student-rows).
//  ② "애초에 여기서 체크를 하면 버튼이 뜨도록 하면 되잖아." → 행 체크 →
//     하단 도크가 픽바로 바뀐다(rail-student-pick-bar, 도크는 analysis-detail-rail).
//  ③ "로스터 같은 어려운 표현 쓰지 마." → 화면 자구는 「우리 반 학생」·「학생 명단」.
//
// 이 파일이 드는 것: 클래스 명단 적재 요청(ensureRoster) · 인라인 학생 추가 패널
// (검수 게이트 미완이면 잠금 — 서버 가드와 한 쌍) · 목록 · 방금 보낸 링크 패널 ·
// 앱 응시(배포) 링크. 행 렌더·스크롤 보정은 rail-student-rows, 액션은 픽바 소관.
// 검색 페치는 상호작용 구동(디바운스 250ms) — 숨은 인스턴스는 침묵한다.
// ============================================================================

import { useEffect, useState } from "react";
import {
  ExternalLink,
  Loader2,
  RotateCw,
  UserRoundPlus,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import type { ExamReportSummaryRow } from "@/hooks/use-exam-report-activity";
import type { ExamAnalysisDetail } from "@/components/exam-report/ui-contracts";
import {
  addExamStudentFromRoster,
  enableAnswerLink,
  issueExamAnswerLinkForRoster,
} from "@/actions/exam-report";
import { cn } from "@/lib/utils";
import { RailIssuedLinks } from "./rail-issued-links";
import { RailStudentAddPanel } from "./rail-student-add-panel";
import {
  filterRowsByScope,
  isRosterPending,
  RailStudentRows,
  type UnifiedStudentRow,
} from "./rail-student-rows";
import { answerLinkUrl, copyToClipboard } from "./use-analysis-bulk";
import type { AnalysisConsoleApi } from "./use-analysis-console";

export function RailStudentSection({
  row,
  detail,
  rows,
  gateOpen,
  classId,
  className,
  console: api,
}: {
  row: ExamReportSummaryRow;
  detail: ExamAnalysisDetail;
  /** 통합 행 — **셸이 만든 것을 그대로 쓴다**(탭 배지·픽바와 같은 배열이어야 한다). */
  rows: ReadonlyArray<UnifiedStudentRow>;
  gateOpen: boolean;
  /** 스튜디오에서 선택된 클래스 — 명단(미응시) 축의 출처(26-09-04 §10). */
  classId: string | null;
  className: string | null;
  console: AnalysisConsoleApi;
}) {
  const isInternal = row.sourceType === "INTERNAL";
  // 자체 시험지의 검수 게이트는 **구조상 열림**(정답·배점은 시험지가 확정한 값) —
  // 서버 가드(assertStudentAddAllowed)와 같은 규칙. 이걸 안 맞추면 자체 시험지에서
  // 존재하지도 않는 검수를 요구하며 추가가 잠긴다.
  const canAdd = isInternal || gateOpen;

  // 클래스 학생 명단 — 셸 소유 슬라이스에 「이 클래스 것을 채워 달라」고만 알린다
  // (analysisId × classId 당 1회 dedup, 2중 마운트 안전).
  const { ensureRoster } = api;
  useEffect(() => {
    if (classId) ensureRoster(classId);
  }, [classId, ensureRoster]);

  // ── 인라인 추가 패널(열림만 콘솔 소유 — 검색·폼 상태는 패널 안에서 닫힌다) ──
  const addOpen = api.studentAddOpen;
  const setAddOpen = api.setStudentAddOpen;
  // 행 액션 진행 표시 — `l:<key>`(OMR 링크) / `m:<key>`(직접 입력).
  const [busyKey, setBusyKey] = useState<string | null>(null);

  /**
   * [🔗 OMR 링크] — 행 종류를 흡수한다(26-09-05 "처음부터 구현해버려").
   *  · 아직 이 시험에 행이 없는 학생: 담기 + 토큰 발급 + 복사를 한 동작으로.
   *  · 이미 행이 있는 학생: 토큰이 있으면 그대로 복사, 없으면 발급 후 복사.
   * 발급분은 셸의 issuedLinks 에 쌓아 「방금 보낸 링크」에 남긴다(증발 방지).
   */
  const handleIssue = async (row: UnifiedStudentRow) => {
    if (busyKey) return;
    setBusyKey(`l:${row.key}`);
    try {
      let url = "";
      if (row.roster) {
        const res = await issueExamAnswerLinkForRoster(detail.id, row.roster.studentId);
        url = answerLinkUrl(res.token);
        api.pushIssuedLinks([
          { studentId: row.roster.studentId, name: row.name, url },
        ]);
        api.reloadRoster();
        api.refreshDetail();
      } else if (row.student) {
        const s = row.student;
        const token =
          s.answerEnabled && s.answerToken
            ? s.answerToken
            : (await enableAnswerLink(s.id)).token;
        url = answerLinkUrl(token);
        api.patchDetailStudent(s.id, { answerToken: token, answerEnabled: true });
        api.pushIssuedLinks([{ studentId: s.id, name: row.name, url }]);
      }
      if (!url) throw new Error("링크 발급에 실패했습니다.");
      const copied = await copyToClipboard(url);
      toast.success(
        copied
          ? `${row.name} 학생 OMR 링크를 복사했어요.`
          : `${row.name} 학생 OMR 링크를 만들었어요.`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "링크 발급에 실패했습니다.");
    } finally {
      setBusyKey(null);
    }
  };

  /**
   * [✏ 직접 입력] — 강사가 학생 답을 대신 넣는 자리(= 답안지 아코디언)를 연다.
   *  · 행이 이미 있으면 그냥 펼친다.
   *  · 아직 없으면 **링크 없이 행만 만들고**(무과금·토큰 0) 곧바로 펼친다 —
   *    종전에는 링크 발급만이 행을 만드는 유일한 경로여서, 링크를 안 쓰는 학생은
   *    채점을 시작할 방법 자체가 없었다(26-09-05 사용자 지시).
   */
  const handleManualEntry = async (row: UnifiedStudentRow) => {
    if (busyKey) return;
    if (row.student) {
      api.focusStudent(row.student.id, null);
      return;
    }
    if (!row.roster) return;
    const entry = row.roster;
    setBusyKey(`m:${row.key}`);
    try {
      const { student } = await addExamStudentFromRoster(detail.id, entry.studentId);
      // 목록 갱신보다 먼저 펼침을 예약한다 — 행이 도착하는 순간 답안지가 열려 있다.
      api.focusStudent(student.id, null);
      api.reloadRoster();
      api.refreshDetail();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "학생을 담지 못했습니다.");
    } finally {
      setBusyKey(null);
    }
  };

  // 명단이 오기 전엔 목록·범위 숫자를 그리지 않는다 — 소속 「모름」 행을 먼저
  // 그렸다가 명단 도착에 접히는 3행→2행 플래시의 수리(isRosterPending 주석).
  const rosterLoading = isRosterPending(classId, api.rosterPhase);
  // 범위 필터 — 기본 「우리 반」. 접힌 행은 아래 한 줄 안내 + [전체 보기]로 남긴다.
  const visibleRows = filterRowsByScope(rows, api.studentScope);
  const classCount = filterRowsByScope(rows, "class").length;
  const hiddenCount = rows.length - visibleRows.length;

  return (
    <div className="min-w-0 space-y-2">
      {/* ── 범위 칩 + 학생 추가 (26-09-05 사용자 지시) ─────────────────────────
          "기본적으로는 이 반의 학생이 보이고, 전체 학생도 볼 수 있는 버튼이 있어야
           할 것 같은데" · "여기 페이지에서 학생 추가가 쉽게 이루어져야 하고"
          · 범위 칩은 **클래스를 알 때만** 그린다(판정 불가한 상태에서 「우리 반」을
            말하면 거짓이 된다).
          · [학생 추가]는 이제 **자체 시험지에서도 연다**. 종전 비노출 근거(브리지
            자동 등록이 정본)는 OMR 링크가 메인 배포 수단이 되며 이미 무너졌다 —
            로스터 [링크 보내기]가 같은 행을 만들고 있었다. 서버 가드도 roster 경로는
            INTERNAL 에 허용한다(assertStudentAddAllowed mode="roster"). 이름만
            추가하는 자유입력만 여전히 서버가 막는다(그 폼은 아래에서 감춘다). */}
      <div className="flex min-w-0 items-center gap-1.5">
        {classId ? (
          <div className="flex min-w-0 shrink-0 items-center gap-0.5 rounded-md bg-slate-100 p-0.5">
            {(["class", "all"] as const).map((key) => {
              const active = api.studentScope === key;
              const n = key === "class" ? classCount : rows.length;
              return (
                <button
                  key={key}
                  type="button"
                  data-student-scope={key}
                  aria-pressed={active}
                  title={
                    key === "class"
                      ? "이 클래스 학생만 보기"
                      : "다른 반 학생까지 모두 보기"
                  }
                  onClick={() => api.setStudentScope(key)}
                  className={cn(
                    "inline-flex h-6 cursor-pointer items-center gap-1 whitespace-nowrap rounded px-2 text-[11px] font-semibold transition-colors",
                    active
                      ? "bg-white text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.06)]"
                      : "text-slate-500 hover:text-slate-700",
                  )}
                >
                  {key === "class" ? className ?? "우리 반" : "전체"}
                  {rosterLoading ? null : (
                    <span className="tabular-nums text-slate-400">{n}</span>
                  )}
                </button>
              );
            })}
          </div>
        ) : null}
        <button
          type="button"
          disabled={!canAdd}
          onClick={() => setAddOpen(!addOpen)}
          title={
            canAdd
              ? "다른 반·명단 밖 학생을 이 시험에 담습니다"
              : "정답·배점 확인을 끝내야 학생을 등록할 수 있어요"
          }
          className={cn(
            "ml-auto inline-flex h-7 shrink-0 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md border px-2.5 text-[12px] font-semibold transition-colors",
            addOpen
              ? "border-slate-300 bg-slate-50 text-slate-900"
              : "border-slate-200 bg-white text-slate-600 shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900",
            !canAdd && "cursor-default opacity-50",
          )}
        >
          <UserRoundPlus className="size-3.5 shrink-0" aria-hidden="true" />
          {addOpen ? "닫기" : "학생 추가"}
        </button>
      </div>
      {!canAdd ? (
        <p className="break-keep text-[11px] leading-relaxed text-amber-600">
          정답·배점 확인을 끝내야 학생을 등록할 수 있어요
        </p>
      ) : null}

      {/* 인라인 학생 추가 패널 — 검색·담기·새 학생 등록(별도 파일, 500줄 상한)
          모든 상태가 그 안에서 닫힌다 — 여기는 열림 여부만 넘긴다. */}
      {addOpen && canAdd ? (
        <RailStudentAddPanel
          analysisId={detail.id}
          isInternal={isInternal}
          onAdded={() => api.refreshDetail()}
        />
      ) : null}

      {/* 방금 보낸 링크 — 발급하면 그 학생 행이 「답안 기다리는 중」으로 바뀌므로,
          여기 남겨 두지 않으면 방금 만든 링크가 화면에서 증발한다(26-09-04 지적). */}
      <RailIssuedLinks console={api} />

      {/* 한 목록: 이 시험을 본 학생 + 아직 답안이 없는 우리 반 학생(상태 태그로 구분) */}
      {rosterLoading ? (
        <div className="flex items-center gap-2 rounded-md border border-slate-100 bg-slate-50 px-2.5 py-2 text-[11.5px] text-slate-400">
          <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden="true" />
          학생을 불러오는 중…
        </div>
      ) : visibleRows.length === 0 && hiddenCount === 0 ? (
        <div className="flex flex-col items-center gap-1.5 rounded-lg border border-dashed border-slate-200 px-3 py-5 text-center">
          <Users className="size-5 text-slate-300" aria-hidden="true" />
          <p className="break-keep text-[11.5px] leading-relaxed text-slate-400">
            {isInternal
              ? "이 시험지를 배포하거나 답안 링크를 보내면 학생이 여기에 나타납니다"
              : "위 [학생 추가]로 등록하면 채점과 리포트를 만들 수 있어요"}
          </p>
        </div>
      ) : visibleRows.length === 0 ? null : (
        <>
          <p className="break-keep px-0.5 text-[11px] leading-relaxed text-slate-400">
            체크하면 아래에서 답안 링크·리포트를 한꺼번에 처리할 수 있어요.
          </p>
          <RailStudentRows
            rows={visibleRows}
            detail={detail}
            isInternal={isInternal}
            gateOpen={isInternal || gateOpen}
            busyKey={busyKey}
            onIssue={(r) => void handleIssue(r)}
            onManualEntry={(r) => void handleManualEntry(r)}
            console={api}
          />
        </>
      )}

      {/* 접힌 다른 반 학생 — **사라진 게 아니다**. 채점·리포트가 있는 행을 화면에서
          잃지 않는 것이 이 필터의 상한선이라, 몇 명인지와 여는 길을 항상 말한다. */}
      {hiddenCount > 0 ? (
        <div
          data-student-scope-hidden
          className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-slate-100 bg-slate-50 px-2.5 py-1.5"
        >
          <p className="min-w-0 flex-1 break-keep text-[11px] leading-relaxed text-slate-500">
            {className ?? "이 클래스"} 학생이 아닌 {hiddenCount}명이 이 시험을 쳤어요
          </p>
          <button
            type="button"
            onClick={() => api.setStudentScope("all")}
            className="shrink-0 cursor-pointer whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-semibold text-blue-600 transition-colors hover:bg-blue-50"
          >
            전체 보기
          </button>
        </div>
      ) : null}

      {api.rosterPhase === "error" ? (
        <div className="flex min-w-0 flex-wrap items-center gap-2 rounded-md border border-rose-100 bg-rose-50 px-2.5 py-2">
          <p className="min-w-0 flex-1 break-keep text-[11.5px] leading-relaxed text-rose-600">
            우리 반 학생을 불러오지 못했어요
          </p>
          <button
            type="button"
            onClick={() => api.reloadRoster()}
            className="inline-flex h-7 shrink-0 cursor-pointer items-center gap-1 rounded-md border border-rose-200 bg-white px-2.5 text-[11px] font-medium text-rose-600 transition-colors hover:bg-rose-100"
          >
            <RotateCw className="size-3 shrink-0" aria-hidden="true" />
            다시 시도
          </button>
        </div>
      ) : null}

      {/* 앱 응시(배포) 탈출구 — §1-8 예외 셀렉터 유지. 자체 시험지 전용. */}
      {isInternal && row.sourceExamId ? (
        <a
          href={`/director/exams/${row.sourceExamId}?tab=deployment`}
          target="_blank"
          rel="noopener noreferrer"
          data-rail-escape-allowed
          className="inline-flex min-w-0 items-center gap-1 truncate text-[11px] font-medium text-blue-600 underline-offset-2 transition-colors hover:text-blue-700 hover:underline"
        >
          <ExternalLink className="size-3 shrink-0" aria-hidden="true" />
          앱으로 응시시키기(시험지 배포)
        </a>
      ) : null}
    </div>
  );
}
