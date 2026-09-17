"use client";

// ============================================================================
// 클래스 스튜디오 워크벤치 — 중앙 단계 가이드 (docs/class-studio-spec.md
// §3.10.1·§3.10.9 「단계 안내 계약」)
//
// 클래스 미선택 시 LibraryPane 대신 중앙 전체를 차지한다 — "무조건 클래스
// 먼저"의 구조적 강제(E1). 스텝 카드 3장 세로:
//   ① 활성 = 기존 클래스 퀵 선택 그리드(이름+학생 N명) + 「+ 새 클래스」.
//     클래스 0개면 「새 클래스 만들기」 단독 CTA + 안내.
//   ②「자료 선택·생성」 ③「배포」 = 잠김 프리뷰(muted·자물쇠·1줄 설명).
// 데이터·핸들러는 오케스트레이터 소유(프레젠테이션 전용). 코치마크
// create-class 앵커(data-coach)는 레일 하단 소유 — 여기 버튼에는 달지 않는다.
//
// §M(26-08-22) 모바일 학습 임시 숨김: SHOW_STUDIO_MOBILE_LEARNING=false(기본)면
// ③ 잠김 카드 title 이 「배포」 대신 「조판」, 상단 부제도 조판 자구로 재작성
// 된다 — 이 파일은 카피만 분기한다. memo 원시 props 방어선 무접촉 — prop 추가
// 없이 모듈 상수 분기만. 복구는 env 1줄
// (NEXT_PUBLIC_SHOW_STUDIO_MOBILE_LEARNING=true).
// ============================================================================

import { memo } from "react";
import { Lock, Plus, Users } from "lucide-react";
import type { StudioClassRow } from "@/actions/studio/classes";
import { FEATURE_FLAGS } from "@/lib/feature-flags";

// §M 모바일 학습 임시 숨김 스위치 — 모듈 상수로만 소비한다(prop 화 금지:
// memo·시그니처 메모 방어선 무접촉). false 가 기본값 = 숨김이 새 정상.
const SHOW_MOBILE = FEATURE_FLAGS.SHOW_STUDIO_MOBILE_LEARNING;

export interface StepGuidePaneProps {
  classes: StudioClassRow[];
  /** 퀵 선택 — 오케스트레이터 selectClass(자동 펼침·로스터 로드 포함) */
  onSelectClass: (id: string) => void;
  /** 「+ 새 클래스」 — 오케스트레이터가 생성 모달을 연다 */
  onCreateClass: () => void;
}

// ── 스텝 번호 배지 — 큰 원형(가이드 카드 시각 앵커) ──────────────────────────

function StepBadge({ n, active }: { n: number; active: boolean }) {
  return (
    <span
      aria-hidden
      className={`flex size-9 shrink-0 items-center justify-center rounded-full text-[15px] font-bold ${
        active ? "bg-blue-600 text-white shadow-sm" : "bg-slate-100 text-slate-400"
      }`}
    >
      {n}
    </span>
  );
}

// ── 잠김 프리뷰 카드 (②·③) ──────────────────────────────────────────────────

function LockedStepCard({ n, title }: { n: number; title: string }) {
  return (
    <section className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50/60 px-4 py-3.5">
      <StepBadge n={n} active={false} />
      <div className="min-w-0 flex-1">
        <h3 className="flex items-center gap-1.5 text-[13.5px] font-bold text-slate-400">
          {title}
          <Lock aria-hidden className="h-3.5 w-3.5 text-slate-300" />
        </h3>
        <p className="mt-0.5 text-[11.5px] text-slate-400">
          클래스를 선택하면 열립니다
        </p>
      </div>
    </section>
  );
}

// ── 가이드 본체 ──────────────────────────────────────────────────────────────
// memo: 오케스트레이터는 큐 폴링(5초)마다 리렌더된다 — classes 배열·useCallback
// 핸들러는 그때 참조 불변이므로 여기서 재렌더를 끊는다.

function StepGuidePaneInner({
  classes,
  onSelectClass,
  onCreateClass,
}: StepGuidePaneProps) {
  const empty = classes.length === 0;

  return (
    <div className="h-full min-h-0 overflow-y-auto bg-slate-50/40">
      <div className="mx-auto w-full max-w-2xl px-4 py-8 md:py-12">
        {/* 상단 타이틀 — 이 화면의 유일한 지시 */}
        <div className="mb-6 text-center">
          <h2 className="text-[19px] font-bold tracking-tight text-slate-900">
            클래스를 먼저 선택하세요
          </h2>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-slate-500 break-keep">
            {SHOW_MOBILE
              ? "자료 생성과 배포는 모두 클래스 단위로 진행합니다."
              : "자료 생성과 조판은 모두 클래스 단위로 진행합니다."}
          </p>
        </div>

        <div className="space-y-3">
          {/* ① 클래스 선택 — 활성 카드 */}
          <section className="rounded-lg border border-blue-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <StepBadge n={1} active />
              <div className="min-w-0 flex-1">
                <h3 className="text-[13.5px] font-bold text-slate-900">
                  클래스 선택
                </h3>
                <p className="mt-0.5 text-[11.5px] text-slate-500 break-keep">
                  {empty
                    ? "아직 클래스가 없습니다. 첫 클래스를 만들어 주세요."
                    : SHOW_MOBILE
                      ? "문제를 만들고 배포할 클래스를 고르세요."
                      : "문제를 만들고 조판할 클래스를 고르세요."}
                </p>
              </div>
            </div>

            {empty ? (
              /* 클래스 0개 — 생성 CTA 단독 */
              <button
                type="button"
                onClick={onCreateClass}
                className="mt-4 flex h-11 w-full items-center justify-center gap-1.5 rounded-lg bg-blue-600 text-[13.5px] font-semibold text-white shadow-sm transition-colors hover:bg-blue-700"
              >
                <Plus className="h-4 w-4" />
                새 클래스 만들기
              </button>
            ) : (
              /* 기존 클래스 퀵 선택 그리드 + 「+ 새 클래스」 */
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {classes.map((c, i) => (
                  <button
                    key={c.id}
                    type="button"
                    // data-tour="quick-class": 온보딩 투어(E26)가 클래스 미선택
                    // 상태에서 실 UI 를 보여 주기 위해 실클릭한다 — 계약 앵커
                    // 유일성 관례에 따라 **첫 버튼에만** 스탬프한다.
                    data-tour={i === 0 ? "quick-class" : undefined}
                    onClick={() => onSelectClass(c.id)}
                    title={`${c.name} 선택`}
                    className="group rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-left transition-colors hover:border-blue-300 hover:bg-blue-50/50"
                  >
                    <span className="flex items-center gap-1.5">
                      <Users className="h-3.5 w-3.5 shrink-0 text-blue-400 transition-colors group-hover:text-blue-600" />
                      <span className="min-w-0 truncate text-[13px] font-bold text-slate-800 group-hover:text-blue-800">
                        {c.name}
                      </span>
                    </span>
                    <span className="mt-0.5 block pl-5 text-[11px] tabular-nums text-slate-400">
                      학생 {c.studentCount}명
                    </span>
                  </button>
                ))}
                <button
                  type="button"
                  onClick={onCreateClass}
                  className="flex min-h-[58px] items-center justify-center gap-1 rounded-lg border border-dashed border-slate-300 text-[12.5px] font-semibold text-slate-500 transition-colors hover:border-blue-300 hover:bg-blue-50/40 hover:text-blue-600"
                >
                  <Plus className="h-3.5 w-3.5" />새 클래스
                </button>
              </div>
            )}
          </section>

          {/* ②·③ — 잠김 프리뷰. §M off 면 ③ 은 조판이 실행 단계다 */}
          <LockedStepCard n={2} title="자료 선택·생성" />
          <LockedStepCard n={3} title={SHOW_MOBILE ? "배포" : "조판"} />
        </div>
      </div>
    </div>
  );
}

export const StepGuidePane = memo(StepGuidePaneInner);
