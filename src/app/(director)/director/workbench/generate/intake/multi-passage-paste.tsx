"use client";

// ============================================================================
// 직접 입력 표면 — "그대로 추출 / AI로 원문 복원 / AI로 지문 생성" 3분기.
//
// 이 파일이 전략적으로 중요한 이유:
//   문제 생성·학습지 생성·유사문항·커스텀유형·웹툰 등 8개 호스트 라우트가 전부
//   IntakeSurface 를 거쳐 이 컴포넌트 하나를 '직접 입력' 탭으로 쓴다. 그래서 새
//   입력 수단(AI 지문 생성)을 여기에 한 번만 배선하면 8곳 모두가 자동으로 얻는다.
//   반대로 이 파일이 깨지면 8곳이 동시에 깨진다 → 아래 계약을 반드시 지킬 것.
//
// 회귀 방지 계약
//  · verbatim/restored 동작은 무회귀다. 세 번째 모드는 "추가"이지 "변경"이 아니다.
//  · TextInputBoard 는 authoring 으로 넘어가도 **언마운트하지 않는다**(hidden).
//    쌓아둔 지문 행이 모드를 오갈 때 사라지면 안 된다 — IntakeSurface 가 업로드·
//    붙여넣기 탭에 쓰는 hidden-mount 관례와 같다.
//  · TextInputBoard 의 outputMode 계약은 "verbatim"|"restored" 뿐이다. authoring
//    중에는 **직전 텍스트 모드를 붙들어** 숨겨진 보드의 라벨·튜토리얼 상태가
//    흔들리지 않게 한다(돌아왔을 때 흔적이 남으면 안 된다).
//  · AuthoringBoard 도 한 번 마운트되면 유지한다 — 생성은 수 분짜리 백그라운드
//    작업이라, 모드를 되돌렸다고 진행 카드가 사라지면 안 된다.
//  · 지문 생성은 영어 전용 파이프라인이라 국어 고정 모드(koreanFixed)에서는
//    원문 복원과 똑같이 비활성 + 사유 title 을 준다.
//  · **AuthoringBoard 의 visible 게이트는 출력모드만으로는 부족하다.**
//    authoringActive 는 "이 표면 안에서 어떤 모드를 골랐나"만 말한다. 정작 이
//    표면 전체를 숨기는 주체는 바깥이다 — IntakeSurface 의 pasteActive(탭이
//    'paste' 이고 intakeView 가 'intake' 인가)와 워크스페이스 오버레이다. 게다가
//    등록 직후 use-passage-intake 가 setIntakeView("library") 를 호출하므로
//    "지문 생성 모드인 채로 내 지문함/워크스페이스를 보고 있는" 상태가 **기본
//    경로**다. 그 상태에서 백그라운드 실행이 끝나면 body 포털 모달이 전면을 덮고
//    body 스크롤까지 잠갔다(실사고). 그래서 호스트가 넘기는 boardVisible 을
//    반드시 AND 로 겹친다. 미전달 시 true — 단독 호스트는 무영향.
// ============================================================================

import {
  useCallback,
  useEffect,
  useState,
  type MutableRefObject,
} from "react";
import { toast } from "sonner";

import {
  KO_PASSAGE_KIND_LABELS,
  type KoPassageKind,
} from "@/lib/korean/core/passage-meta";

import { TextInputBoard } from "../../passages/import/_components/intake/text/text-input-board";
import { AuthoringBoard } from "./authoring/authoring-board";
import {
  OutputModeToggle,
  type OutputMode,
  type TextBoardMode,
} from "./paste-output-mode-toggle";

export interface PastedPassageInput {
  title: string;
  content: string;
  /** 지문 과목 — 미지정=영어(기존 소비처 무변경), "KOREAN"=국어 직접입력. */
  subject?: "KOREAN";
  /** 국어 갈래 — subject === "KOREAN" 일 때만 의미. 호출부가 태그로 병합한다. */
  koKind?: KoPassageKind;
}

interface MultiPassagePasteProps {
  /** Persist every valid row as a Passage, then select them. Parent handles it. */
  onSubmitRows: (
    rows: PastedPassageInput[],
  ) => boolean | void | Promise<boolean | void>;
  /** True while the parent is persisting + refreshing the list. */
  saving: boolean;
  /** Hide the built-in text tutorial while the page-level tour is active. */
  suppressTutorial?: boolean;
  /**
   * 과목 스코프 — "KOREAN" 이면 국어 고정 모드: 과목 세그먼트 없이 갈래
   * 셀렉트·(가)(나) 힌트만 노출하고, 모든 행에 subject/koKind 를 동봉한다.
   * 미전달(기본) = 영어 — 기존 소비처(웹툰·유사문항·등록 등) UI 픽셀 동일.
   */
  subjectScope?: "KOREAN";
  /**
   * 이 표면이 호스트 화면에서 **실제로 보이는가**. 호스트(IntakeSurface)는 탭이
   * 비활성이어도 이 컴포넌트를 hidden 으로 마운트해 두므로 컴포넌트 스스로는
   * 알 수 없다. AI 지문 생성 보드의 body 포털 모달(결과·자료 검토)이 다른
   * 화면 위로 튀어나오는 것을 막는 유일한 신호다. 미전달 = true(단독 호스트).
   */
  boardVisible?: boolean;
  /** 모바일 스텝 플로우 — 하단 고정 바에서 시작 동작을 대신 호출. */
  startRef?: MutableRefObject<(() => void) | null>;
  /** 누적 지문 수·작업 상태 변화 알림(하단 바 라벨용). */
  onDraftStateChange?: (state: {
    count: number;
    busy: boolean;
    /**
     * 이 탭이 화면 하단 고정 액션 바를 렌더하는지. 호스트는 이 값으로 하단 여백
     * 예약과 공용 스텝 네비 숨김을 정한다. AI 지문 생성 모드에서는 고정 바가
     * 없으므로 false — 넘기지 않는 호스트는 기존대로 동작한다(옵셔널).
     */
    fixedFooter?: boolean;
  }) => void;
}

/** 갈래 셀렉트 표시 순서 — 비문학(독서) → 문학 → 문법 → 복합. */
const KO_KIND_OPTIONS = Object.entries(KO_PASSAGE_KIND_LABELS) as [
  KoPassageKind,
  string,
][];

interface RestoreResponse {
  restoredText?: string;
  status?: "RESTORED" | "PARTIAL" | "NO_RESTORATION_NEEDED" | "FAILED";
  warnings?: string[];
  degraded?: boolean;
  error?: string;
  balance?: number;
  requiredCredits?: number;
}

async function restorePassageBeforeRegister(
  passage: PastedPassageInput,
): Promise<PastedPassageInput> {
  const res = await fetch("/api/workbench/restore-passage", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ passageText: passage.content }),
  });
  const data = (await res.json().catch(() => ({}))) as RestoreResponse;

  if (!res.ok) {
    if (res.status === 402) {
      const required = data.requiredCredits
        ? ` 필요 크레딧: ${data.requiredCredits}`
        : "";
      const balance =
        typeof data.balance === "number" ? ` 현재 잔액: ${data.balance}` : "";
      throw new Error(
        data.error || `크레딧이 부족합니다.${required}${balance}`,
      );
    }
    throw new Error(data.error || "AI 원문 복원에 실패했습니다.");
  }

  if (data.degraded || data.status === "PARTIAL") {
    toast.warning("일부 지문은 복원본 확인이 필요할 수 있습니다.");
  }

  return {
    title: passage.title,
    content: (data.restoredText || passage.content).trim(),
  };
}

/**
 * Direct-input surface for question generation. It reuses the extraction page's
 * text-mode board so text paste, accumulation, resize, and tutorial UI stay
 * consistent across the workbench.
 */
export function MultiPassagePaste({
  onSubmitRows,
  saving,
  suppressTutorial = false,
  subjectScope,
  boardVisible = true,
  startRef,
  onDraftStateChange,
}: MultiPassagePasteProps) {
  const [outputMode, setOutputMode] = useState<OutputMode>("verbatim");
  // authoring 으로 넘어가도 숨겨진 TextInputBoard 가 붙들고 있을 마지막 텍스트 모드.
  const [textMode, setTextMode] = useState<TextBoardMode>("verbatim");
  const [restoring, setRestoring] = useState(false);
  // AuthoringBoard 는 처음 고른 순간 마운트하고, 그 뒤로는 계속 살려 둔다.
  const [authoringMounted, setAuthoringMounted] = useState(false);
  // ── 국어 고정 모드 — 과목 토글 없음. 갈래 셀렉트만 노출된다. ──
  const koreanFixed = subjectScope === "KOREAN";
  const [koKind, setKoKind] = useState<KoPassageKind>("READING_HUM");
  // AI 원문 복원·AI 지문 생성은 영어 전용 파이프라인 — 국어는 그대로 등록만.
  const effectiveOutputMode: OutputMode = koreanFixed
    ? "verbatim"
    : outputMode;
  const effectiveTextMode: TextBoardMode = koreanFixed ? "verbatim" : textMode;
  const authoringActive = effectiveOutputMode === "authoring";
  const busy = saving || restoring;

  useEffect(() => {
    if (authoringActive) setAuthoringMounted(true);
  }, [authoringActive]);

  const selectOutputMode = useCallback((next: OutputMode) => {
    setOutputMode(next);
    // 텍스트 보드가 이해하는 모드일 때만 갱신 — authoring 은 직전 값을 남긴다.
    if (next !== "authoring") setTextMode(next);
  }, []);

  // 호스트(모바일 하단 스텝 바)에 알리는 누적 지문 수. authoring 화면에서는
  // 0으로 보고한다 — 숨겨진 텍스트 보드의 행 수를 그대로 흘리면 하단 바가
  // "다음으로 (내 지문함) · 지문 N개"를 띄워, 지금 화면에 보이지도 않는 행을
  // 등록하는 버튼이 된다. TextInputBoard 의 알림 효과는 이 콜백 identity 를
  // 의존성에 두므로, 모드가 바뀌면 자동으로 다시 보고된다.
  //
  // fixedFooter: 이 탭이 "화면 하단에 고정된 액션 바"를 렌더하는지. 호스트 페이지는
  // 이 값으로 (a) 하단 여백 예약(pb-[140px])과 (b) 공용 스텝 네비 숨김을 결정한다.
  // TextInputBoard 는 <lg 에서 fixed 바를 띄우지만, authoring 으로 넘어가면 그
  // 보드가 display:none 조상 아래로 들어가 fixed 바도 함께 사라진다. 그때도 호스트가
  // 고정 바가 있다고 믿으면 140px 빈 띠가 남고 스텝 네비까지 숨겨져, 모바일에서
  // 이동 수단이 없는 화면이 된다. authoring 보드의 CTA 는 fixed 가 아니라 흐름 안의
  // shrink-0 바이므로 여기서 false 를 보고한다.
  const emitDraftState = useCallback(
    (state: { count: number; busy: boolean }) => {
      onDraftStateChange?.(
        authoringActive
          ? { count: 0, busy: state.busy, fixedFooter: false }
          : { ...state, fixedFooter: true },
      );
    },
    [authoringActive, onDraftStateChange],
  );

  // 생성 결과를 기존 등록 경로(onSubmitRows)에 그대로 태운다. 호스트 라우트가
  // 붙여넣기 지문을 어떻게 처리하든(문항 생성·학습지·웹툰…) 생성본도 똑같이
  // 흘러가므로, 호스트별 추가 배선이 0줄이다.
  const registerAuthoredRows = useCallback(
    async (rows: { title: string; content: string }[]) => {
      const ok = await onSubmitRows(
        rows.map((r) => ({ title: r.title, content: r.content })),
      );
      return ok !== false;
    },
    [onSubmitRows],
  );

  const outputModeToggle = (
    <OutputModeToggle
      value={effectiveOutputMode}
      koreanFixed={koreanFixed}
      disabled={busy}
      onSelect={selectOutputMode}
    />
  );

  // ── 국어 고정 모드 컨트롤 — 갈래 셀렉트 + 복합지문 규약 힌트만. ──
  // 과목 세그먼트는 두지 않는다(국어 라우트는 국어 고정, 영어 라우트는 이
  // 컨트롤 자체가 렌더되지 않아 기존 UI 픽셀 동일).
  const subjectControls = koreanFixed ? (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <select
        value={koKind}
        onChange={(e) => setKoKind(e.target.value as KoPassageKind)}
        disabled={busy}
        aria-label="국어 갈래"
        // 높이는 옆 세그먼트(h-9)와 같은 줄에 서므로 같은 값이어야 한다 —
        // h-7 이면 흰 말풍선 안에서 기준선이 2px 어긋난 채 보인다.
        className="h-9 cursor-pointer appearance-none rounded-md border border-slate-200 bg-white px-2 pr-6 text-[12px] font-medium text-slate-600 transition-all hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {KO_KIND_OPTIONS.map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      <span className="text-[12px] leading-tight text-slate-500">
        복합 지문은 행 머리에 (가)/(나) 라벨을 붙여 붙여넣으세요.
      </span>
    </div>
  ) : null;

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden">
      {/* 출력 방식 — 위 '직접 입력' 탭에서 말풍선처럼 뻗어나온 하위 선택임을
          드러낸다(직접 입력 > 그대로 추출/AI 복원/AI 생성의 계층감). */}
      <div className="border-b border-slate-100 px-2 pb-2 pt-2 lg:px-3">
        {/* 말풍선 배경은 흰색·slate 테두리다. 이전의 blue-50 말풍선 위에서는
            안쪽 세그먼트의 활성 표시(blue 계열)가 배경과 같은 색군이라 '무엇이
            켜져 있는지'가 사실상 보이지 않았다 — 이 기능의 진입 스위치라 그
            대비가 최우선이다. */}
        <div className="relative w-full rounded-lg border border-slate-200 bg-white px-2 py-1 shadow-sm sm:w-fit">
          {/* 말풍선 꼬리 — 브레드크럼 첫 항목 '직접 입력' 탭 중앙 아래에서 삐져나오게. */}
          <span
            aria-hidden="true"
            className="absolute -top-[6px] left-12 z-10 hidden h-3 w-3 -translate-x-1/2 rotate-45 rounded-[2px] border-l border-t border-slate-200 bg-white sm:block"
          />
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
            {subjectControls}
            {subjectControls ? (
              <span
                aria-hidden="true"
                className="h-4 w-px shrink-0 bg-slate-200"
              />
            ) : null}
            {outputModeToggle}
          </div>
        </div>
      </div>

      <div
        className="flex min-h-0 flex-1 flex-col"
        data-generate-tour="paste-board"
      >
        {/* 텍스트 보드는 authoring 중에도 마운트를 유지한다(숨김만) — 쌓아둔
            지문 행이 모드를 오갈 때 사라지면 안 된다. */}
        <div
          className={
            authoringActive ? "hidden" : "flex min-h-0 flex-1 flex-col"
          }
        >
          <TextInputBoard
            busy={busy}
            outputMode={effectiveTextMode}
            suppressTutorial={suppressTutorial}
            onStart={async (passages) => {
              const rows = passages.map((passage) => ({
                title: passage.title ?? "",
                content: passage.text,
                // 국어 고정 모드에서만 과목·갈래 동봉 — 영어는 기존 형태 그대로.
                ...(koreanFixed
                  ? { subject: "KOREAN" as const, koKind }
                  : {}),
              }));

              if (effectiveTextMode === "verbatim") {
                const ok = await onSubmitRows(rows);
                return ok !== false;
              }

              setRestoring(true);
              try {
                const restoredRows: PastedPassageInput[] = [];
                for (const row of rows) {
                  restoredRows.push(await restorePassageBeforeRegister(row));
                }
                const ok = await onSubmitRows(restoredRows);
                return ok !== false;
              } catch (error) {
                toast.error(
                  error instanceof Error
                    ? error.message
                    : "AI 원문 복원 중 오류가 발생했습니다.",
                );
                return false;
              } finally {
                setRestoring(false);
              }
            }}
            reviewLabel={
              effectiveTextMode === "restored" ? "복원할 지문" : "등록할 지문"
            }
            emptyTitle={
              effectiveTextMode === "restored"
                ? "문제·선지 텍스트를 붙여넣고 지문을 쌓아요"
                : "텍스트를 붙여넣고 지문을 쌓아요"
            }
            guideStartLabel={
              effectiveTextMode === "restored" ? "복원 후 등록" : "등록하고 선택"
            }
            startLabel="다음으로 (내 지문함)"
            restoredStartLabel="다음으로 (내 지문함)"
            busyLabel={restoring ? "복원 중" : "등록 중"}
            startRef={startRef}
            onDraftStateChange={emitDraftState}
            // 문제 생성 직접 입력 탭: 모바일에서 '등록할 지문'을 하단 고정 장바구니
            // 바로 통일(파일업로드와 동일). 페이지는 이 탭에서 공용 스텝 네비를 숨긴다.
            mobileFixedFooter
          />
        </div>

        {/* AI 지문 생성 스튜디오 — 한 번 열면 계속 마운트해 둔다. 생성은 수 분
            짜리 백그라운드 작업이라, 모드를 되돌렸다고 진행 카드가 사라지면 안 된다. */}
        {authoringMounted ? (
          <div
            className={
              authoringActive ? "flex min-h-0 flex-1 flex-col" : "hidden"
            }
          >
            {/* visible 을 넘기는 이유: 이 보드는 숨겨도 언마운트되지 않는데,
                결과 모달·자료 검토 모달은 document.body 포털이라 조상의 hidden 이
                통하지 않는다. 넘기지 않으면 다른 화면에서 작업하는 도중 완료된
                실행의 모달이 전면을 덮고 body 스크롤까지 잠근다.

                **이 게이트는 출력모드(authoringActive)만으로는 부족하다 — 탭·
                오버레이까지 봐야 한다.** 실제 사고 경로: 지문 생성 모드를 켠 채
                결과를 등록하면 use-passage-intake 가 곧바로
                setIntakeView("library") 를 호출한다. 그러면 이 표면 전체가
                hidden 이 되는데 authoringActive 는 여전히 true 라, 뒤이어 끝난
                백그라운드 실행의 모달이 '내 지문함' 위로 전면 등장했다. 워크스페이스
                오버레이가 떠 있을 때도 마찬가지다. 호스트가 계산한 boardVisible
                (= pasteActive && !overlay)을 AND 로 겹쳐야 비로소 막힌다. */}
            <AuthoringBoard
              busy={busy}
              koreanFixed={koreanFixed}
              visible={authoringActive && boardVisible}
              onRegisterRows={registerAuthoredRows}
            />
          </div>
        ) : null}
      </div>
    </section>
  );
}
