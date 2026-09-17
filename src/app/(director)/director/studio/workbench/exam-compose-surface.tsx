"use client";

// ============================================================================
// 클래스 스튜디오 — 우측 패널 내장 시험지 조판 (docs/class-studio-spec.md §3.10.17-a v2)
//
// 사용자 확정 구조(4차 지시 정정): **페이지·모드 전환 0** — 중앙 문항 목록은
// 그대로 살아 있고, 실행대의 [시험지 조판]을 누르면 **우측 「보내기」 패널 그
// 자리에** 이 표면이 부드럽게 들어온다. 이후 목록에서 체크할 때마다 문항이
// 시험지에 실시간으로 조판/제거된다(빌더 syncQuestionIds 라이브 동기화 —
// "체크하면 바로바로 문제가 시험지에 그대로 렌더링").
// 빌더는 additive prop 로만 임베드: shellClassName(h-full)·draftScope(studio)·
// initialClassId·onSavedExam(라우팅 아웃 차단)·onDirtyChange·
// hideQuestionLibrary(문항 라이브러리·문제관리 핸들 완전 제거 — 중앙 평면
// 리스트가 그 역할, §3.10.17-d v2.3)·initialLeftCollapsed(저장 우회 계약 겸용)·
// initialRightCollapsed={false}(편집/설정 패널 **기본 펼침** — 26-08-14 지시,
// 명시 전달이라 저장 우회 계약 유지)·syncQuestionIds.
// sessionStorage 시드는 이 경로에서 폐기 — 첫 sync 전달분이 초기 조판을
// 담당한다(이중 주입 방지). DOM id(exam-builder-shell·print-root) 유일 전제.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, CheckCircle2, ClipboardList, Loader2 } from "lucide-react";
import { getExamPaperBuilderEmbedData } from "@/actions/exam-paper-builder";
import { ExamPaperBuilderClient } from "@/components/exams/exam-paper-builder-client";

// 액션에 명명 반환 타입이 없다("use server" 파일은 async export 만) — 파생.
type ExamPaperBuilderData = Awaited<
  ReturnType<typeof getExamPaperBuilderEmbedData>
>;

type SurfaceState =
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "ready"; data: ExamPaperBuilderData };

// ── 재료 조회 = 임베드 전용 경량 액션(§3.10.17-e (m), 2026-08-14 비용 감사)
// 종전엔 무거운 getExamPaperBuilderData(문항 100건 976KB·학원 전량 스캔)를
// 부르면서 그 지연을 모듈 캐시 + 선조회로 가렸다. 그 캐시가 ①반 목록 스테일
// (새 클래스가 저장 폼에 안 뜸) ②강제 재조회가 inflight 중복제거를 깨서
// 2중 마운트 시 전량 스캔 2배 발사 — 두 결함의 원인이었다.
// 이제 질의 자체가 반·학교 2건뿐이라 캐시가 존재 이유를 잃었다: **캐시·선조회
// 전면 폐기**로 두 결함이 동시에 소멸하고 신선도는 항상 최신이 된다.
// 조판에 올릴 문항은 빌더가 syncQuestionIds → getExamPaperBuilderQuestionsByIds
// 로 필요한 id 만 가져온다(체크→조판 계약 불변).

export function ExamComposeSurface({
  academyId,
  classId,
  className,
  syncQuestionIds,
  active = true,
  onClose,
}: {
  academyId: string;
  /** 스튜디오 선택 클래스 — 저장 폼 반 프리셋(null = 프리셋 없음) */
  classId: string | null;
  /** 헤더 표기용 클래스명 */
  className: string | null;
  /** 체크 집합(조판 순서 = 체크 순서) — 변화가 곧 실시간 조판/제거 */
  syncQuestionIds: string[];
  /**
   * 표면이 지금 보이는가(§3.10.17-e) — 다른 자산 뷰로 가면 호스트가 숨김
   * 마운트로 보존하며 false 를 내린다. false 동안 Escape 닫기·포커스를
   * 비활성화(숨은 표면이 전역 Escape 를 가로채 confirm 을 띄우는 것 방지),
   * true 복귀 시 뒤로가기 버튼에 포커스를 되돌리며, **인쇄 대상에서도 빠진다**
   * (아래 `data-exam-print-exclude` — 학습지 축 `printExclude: !active` 와 동형).
   */
  active?: boolean;
  onClose: () => void;
}) {
  const [state, setState] = useState<SurfaceState>({ status: "loading" });
  const [dirty, setDirty] = useState(false);
  const [savedExamId, setSavedExamId] = useState<string | null>(null);

  // 재시도 카운터 방식 — effect 본문 동기 setState 금지.
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await getExamPaperBuilderEmbedData(academyId);
        if (!cancelled) setState({ status: "ready", data });
      } catch (err) {
        if (!cancelled) {
          setState({
            status: "error",
            error:
              err instanceof Error
                ? err.message
                : "시험지 재료를 불러오지 못했습니다.",
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [academyId, reload]);
  const retry = useCallback(() => {
    setState({ status: "loading" });
    setReload((n) => n + 1);
  }, []);

  const handleSaved = useCallback((examId: string) => {
    setSavedExamId(examId);
  }, []);

  const handleClose = useCallback(() => {
    // dirty 편집은 IndexedDB 초안(draftScope studio)이 자동 보존 — 그래도
    // 명시 confirm 으로 의도치 않은 이탈을 막는다.
    if (dirtyRef.current) {
      const ok = window.confirm(
        "조판 중인 시험지가 있습니다. 닫아도 임시 보관되어 다음에 이어서 작업할 수 있습니다 — 닫을까요?",
      );
      if (!ok) return;
    }
    onClose();
  }, [onClose]);
  const dirtyRef = useRef(false);
  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  // 진입·재가시 포커스 + Escape 닫기(빌더 내부 Radix 포털이 소비한 Escape
  // 존중). 숨김 마운트(active=false) 동안은 둘 다 비활성 — 다른 탭의 Escape
  // 가 숨은 조판을 닫아버리는 것을 막는다.
  const rootRef = useRef<HTMLDivElement | null>(null);
  const backBtnRef = useRef<HTMLButtonElement | null>(null);
  // active 는 호스트가 아는 숨김(자산 뷰 전환)만 잡는다. CSS 로만 숨는 경우
  // (xl 미만 aside 의 hidden xl:flex, 접힌 패널)는 호스트도 모르므로 자기
  // DOM 가시성으로 판정한다 — display:none 서브트리는 offsetParent 가 null.
  const isShowing = () => active && Boolean(rootRef.current?.offsetParent);
  useEffect(() => {
    if (isShowing()) backBtnRef.current?.focus();
    // isShowing 은 렌더마다 새 함수지만 판정 재료(active·DOM)는 안정적이다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (e.defaultPrevented) return;
      if (!isShowing()) return;
      handleClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, handleClose]);

  return (
    <div
      ref={rootRef}
      role="region"
      aria-label="시험지 조판"
      // ── 【E24 F3-1】 숨김 마운트 중에는 **인쇄를 가로채지 않는다** ────────────
      // 왜 이 형태인가: 이 표면 안의 빌더는 `usePrintPortal`(window 전역
      // `beforeprint`)을 달고 있어, 표면이 `hidden` 래퍼로 숨어 있어도 **누가
      // 인쇄하든** 발화한다. 그 포털이 돌면 `print-styles.tsx:36-38` 의
      // `body.exam-print-active > *:not(#exam-print-host){display:none!important}`
      // 가 앱 루트를 통째로 지운다. 그래서 학습지 축이 `printExclude: !active` 로
      // 선언하는 것과 **같은 계약**을 시험지 축에도 세운다 —
      // 표식은 `use-print-portal.ts` 의 `HOST_PRINT_OPT_OUT_SELECTOR` 가 읽는다
      // (`#exam-paper-print-root` 는 빌더 깊숙한 곳이라 여기서 직접 못 붙인다 →
      //  표면 루트에 붙이고 훅이 `closest()` 로 거슬러 찾는 구조).
      //
      // 어기면 무슨 사고가 나는가: 이 한 줄을 빼면 「시험지 조판을 열어 둔 채
      // [지문관리] 탭으로 나가 지문 목록을 Ctrl+P」에서 **보이지도 않는 시험지가
      // 인쇄된다**(E24 §1⑨ 가 그 동선을 기본으로 만들어 도달 빈도가 높다).
      // 훅의 종전 휴리스틱은 「화면에 살아 있는 `.par-root` 가 있을 때」만 발화하는
      // 논리곱이라, `.par-root` 가 없는 지문관리 뷰에서는 방어가 되지 않는다.
      // 타입 에러 0 · 화면 이상 0 · 콘솔 0 — **종이/PDF 로만** 드러나는 계열이다.
      //
      // ⚠ `active` 대신 DOM 가시성(offsetParent)으로 바꾸지 마라 — 렌더 산출물이
      //   레이아웃 결과에 의존하게 되어 React 가 추적할 수 없고, `<xl` 에서 aside
      //   자체가 `hidden xl:flex` 인 구간까지 함께 제외돼 현행 인쇄 동작이 바뀐다.
      data-exam-print-exclude={active ? undefined : "true"}
      className="flex h-full min-h-0 min-w-0 flex-col bg-white"
    >
      {/* ── 컴팩트 헤더 — 실행대 복귀 + 정체 + 저장 상태 ── */}
      <div className="flex h-10 shrink-0 items-center gap-1.5 border-b border-slate-200 bg-white px-2">
        <button
          ref={backBtnRef}
          type="button"
          onClick={handleClose}
          title="조판 닫기 — 실행대로 돌아갑니다"
          className="flex h-7 shrink-0 cursor-pointer items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-[11.5px] font-semibold text-slate-600 transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
        >
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          돌아가기
        </button>
        <ClipboardList
          className="size-3.5 shrink-0 text-blue-600"
          aria-hidden="true"
        />
        <h3 className="min-w-0 shrink-0 text-[12px] font-bold tracking-tight text-slate-800">
          시험지 조판
        </h3>
        {className ? (
          <span className="min-w-0 truncate text-[11px] font-medium text-slate-400">
            · {className}
          </span>
        ) : null}
        <span className="flex-1" aria-hidden="true" />
        {savedExamId ? (
          <span
            title="시험지 관리에 저장됨"
            className="flex shrink-0 items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600"
          >
            <CheckCircle2 className="size-3" aria-hidden="true" />
            저장됨
          </span>
        ) : null}
      </div>
      {/* (E25 §3.10.24) 구 「체크 = 조판」 상시 안내 1줄은 삭제 — 체크가 곧 개방·
          반영이 된 지금, 동작 자체가 그 문장이다(지시 원문 「이건 좀 없애줘」). */}

      {/* ── 본체 — 로딩/오류/빌더(라이브러리·편집 패널 접힘 시작) ── */}
      <div className="min-h-0 flex-1">
        {state.status === "loading" ? (
          <div className="flex h-full items-center justify-center">
            <div className="flex items-center gap-2 text-slate-400">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              <span className="text-[12.5px] font-medium">
                시험지 재료를 불러오는 중입니다
              </span>
            </div>
          </div>
        ) : state.status === "error" ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6">
            <p className="text-center text-[12.5px] text-slate-400 break-keep">
              {state.error}
            </p>
            <button
              type="button"
              onClick={retry}
              className="cursor-pointer rounded-md border border-slate-200 bg-white px-3 py-1.5 text-[11.5px] font-semibold text-slate-600 transition-colors hover:bg-slate-50"
            >
              다시 시도
            </button>
          </div>
        ) : (
          <ExamPaperBuilderClient
            academyId={academyId}
            questions={state.data.questions as never}
            total={state.data.total}
            totalPages={state.data.totalPages}
            statusCounts={state.data.statusCounts}
            collections={state.data.collections as never}
            classes={state.data.classes}
            schools={state.data.schools}
            shellClassName="relative flex h-full min-h-0 flex-col overflow-hidden"
            draftScope="studio"
            initialClassId={classId ?? undefined}
            onSavedExam={handleSaved}
            onDirtyChange={setDirty}
            initialLeftCollapsed
            // 편집/설정 패널 기본 펼침(26-08-14 사용자 지시) — 조판 aside 가
            // 잔여 전폭이라 여유가 있고, 명시 false 전달로 저장 우회 계약은 유지.
            initialRightCollapsed={false}
            hideQuestionLibrary
            // 이 표면의 컴팩트 헤더가 정체를 이미 표기 — 빌더 내부 자동 숨김
            // 헤더와 좌상단 「헤더 보기」 돌기는 임베드에서 통째 제거.
            hideBuilderHeader
            syncQuestionIds={syncQuestionIds}
          />
        )}
      </div>
    </div>
  );
}
