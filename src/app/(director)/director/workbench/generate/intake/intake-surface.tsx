"use client";

import {
  useEffect,
  useRef,
  type MutableRefObject,
  type ReactNode,
} from "react";
import {
  ChevronRight,
  ClipboardPaste,
  FilePen,
  FolderOpen,
  GraduationCap,
  ImageUp,
} from "lucide-react";
import { dispatchGenerateTourMilestone } from "@/lib/generate-tour-demo";
import {
  MultiPassagePaste,
  type PastedPassageInput,
} from "./multi-passage-paste";

export type IntakeView = "intake" | "library";
export type IntakeTab = "paste" | "upload" | "exam";

interface IntakeSurfaceProps {
  intakeView: IntakeView;
  setIntakeView: (v: IntakeView) => void;
  intakeTab: IntakeTab;
  setIntakeTab: (v: IntakeTab) => void;
  /** Count shown on the library tab. */
  libraryCount: number;
  /** Label for the library tab. Defaults to "내 지문". */
  libraryLabel?: string;
  /** The existing PassageCardGrid, rendered as the "내 지문" library view. */
  library: ReactNode;
  /** Persist pasted rows → select. Required when the 직접 입력 tab is shown. */
  onSubmitPastedRows?: (
    rows: PastedPassageInput[],
  ) => boolean | void | Promise<boolean | void>;
  pasteSaving?: boolean;
  /**
   * 직접 입력의 과목 스코프 — "KOREAN" 이면 국어 고정 붙여넣기(갈래 셀렉트·
   * (가)(나) 힌트만 노출, 세그먼트 없음). 미전달 = 영어 기본, 기존 소비처
   * (웹툰·유사문항 등) UI 픽셀 동일(무회귀).
   */
  pasteSubjectScope?: "KOREAN";
  /**
   * 좁은 컨테이너 임베드(클래스 스튜디오 워크벤치)용 — 직접 입력 보드에 세로
   * 적층을 강제한다(MultiPassagePaste stackedBoard 패스스루). 부재 = 기존 동작.
   */
  stackedPasteBoard?: boolean;
  /**
   * 고정 높이 임베드(클래스 스튜디오)용 — 직접 입력 보드 콘텐츠 열을 내부
   * 스크롤 컨테이너로 전환한다(MultiPassagePaste scrollBody 패스스루). 부재 =
   * 기존 동작 바이트 동일.
   */
  scrollPasteBoard?: boolean;
  /**
   * 직접 입력 빈 상태의 「사용 순서」 가이드 박스 숨김 — MultiPassagePaste
   * hideEmptyGuide 패스스루(§3.9v2.8 D9, 클래스 스튜디오 한정). 부재 =
   * 기존 동작 바이트 동일.
   */
  hideEmptyGuide?: boolean;
  /**
   * 직접 입력 시작 CTA 라벨 — MultiPassagePaste startLabel 패스스루(클래스
   * 스튜디오 「지문관리」 개칭 §3.10.14). 부재 = 기존 문자 그대로(무회귀).
   */
  pasteStartLabel?: string;
  /**
   * AI 지문 생성 간소화 모드 — MultiPassagePaste simplifiedAuthoring
   * 패스스루(§3.9v2.8 D10, 클래스 스튜디오 한정). 부재 = 기존 동작 바이트 동일.
   */
  simplifiedAuthoring?: boolean;
  /**
   * 파일업로드(이미지·PDF 추출) 탭 노출 여부. 기본 true(기존 동작). 국어
   * 라우트는 false — 추출 파이프라인은 영어 전용이라 국어 화면에서 숨긴다.
   */
  showUploadTab?: boolean;
  /**
   * Show the 직접 입력 (multi-passage paste) tab. Defaults to true (문제 생성).
   * The 학습지 생성 page sets this false — direct paste lives in its right
   * "지문" annotation stack instead, so the left panel is 이미지·PDF | 자료 관리.
   */
  showPasteTab?: boolean;
  /** Suppress nested intake tutorials while the page-level tour is open. */
  suppressTutorial?: boolean;
  /** Image/PDF extraction surface. Falls back to a placeholder. */
  upload?: ReactNode;
  /**
   * 수능·모평 기출 지문 라이브러리 브라우저(ExamPassageLibrary). 주면 "수능 기출"
   * 탭이 노출된다 — 문제 생성 페이지에서만 마운트한다.
   */
  examBrowser?: ReactNode;
  /**
   * 콘텐츠 영역을 덮는 오버레이 (지문 워크스페이스). 탭 행은 그대로 두고
   * 본문만 가린다 — 워크스페이스에 들어가도 입력·선택 탭이 남는다.
   */
  overlay?: ReactNode;
  /**
   * 오버레이가 떠 있을 때 탭을 누르면 오버레이를 닫고 그 탭 내용을 보여준다.
   */
  onDismissOverlay?: () => void;
  /**
   * 워크스페이스에 작업 중인 지문이 있는지 — 있고 오버레이가 닫혀 있으면
   * 탭 행 오른쪽에 보라색 '워크스페이스로' 버튼을 띄운다.
   */
  workspaceActive?: boolean;
  /** '워크스페이스로' 버튼 — 작업 중인 워크스페이스를 다시 연다. */
  onReopenWorkspace?: () => void;
  /**
   * 모바일 스텝 플로우(<lg) 전용 탭 노출 제어 — PC(≥lg)에는 영향 없음.
   * "sources": 지문 소스 탭(직접 입력·파일업로드·기출)만 남기고 내 지문함·
   * 워크스페이스 탭을 숨긴다(단계 이동은 페이지 스테퍼가 담당).
   * "hidden": 탭 행 전체를 숨긴다(입력 단계가 아닐 때).
   * 미지정: 기존 그대로 전부 노출.
   */
  mobileStepTabs?: "sources" | "hidden";
  /** 모바일 스텝 플로우 — 하단 고정 바가 직접 입력의 시작 동작을 대신 호출. */
  pasteStartRef?: MutableRefObject<(() => void) | null>;
  /**
   * 직접 입력의 누적 지문 수·작업 상태 알림(하단 바 라벨용).
   * `fixedFooter` 는 그 탭이 하단 고정 액션 바를 렌더하는지 — AI 지문 생성
   * 모드에서는 고정 바가 없어 false 다(호스트의 하단 여백 예약·스텝 네비 분기용).
   */
  onPasteStateChange?: (state: {
    count: number;
    busy: boolean;
    fixedFooter?: boolean;
  }) => void;
  /**
   * 탭 스트립(브레드크럼 행) 전체를 렌더하지 않는다 — 클래스 스튜디오
   * 워크벤치가 자체 소스 스위처(studio/workbench/source-switcher.tsx)로
   * 전환 UI 를 대신할 때만 true(§3.8.2). 본문 슬롯·hidden 유지 마운트·
   * 오버레이·pasteVisible 판정은 그대로다. 기본 false = 기존 호스트 바이트 동일.
   */
  hideTabBar?: boolean;
}

/**
 * Left-panel host for the generate page. A single tab row flattens intake +
 * library into one level: 직접 입력 · 이미지·PDF (add new) | 내 지문 (browse
 * existing). The library node is the unchanged PassageCardGrid.
 */
export function IntakeSurface({
  intakeView,
  setIntakeView,
  intakeTab,
  setIntakeTab,
  libraryCount,
  libraryLabel = "내 지문",
  library,
  onSubmitPastedRows,
  pasteSaving,
  pasteSubjectScope,
  stackedPasteBoard = false,
  scrollPasteBoard = false,
  hideEmptyGuide = false,
  pasteStartLabel,
  simplifiedAuthoring = false,
  showUploadTab = true,
  showPasteTab = true,
  suppressTutorial = false,
  upload,
  examBrowser,
  overlay,
  onDismissOverlay,
  onReopenWorkspace,
  mobileStepTabs,
  pasteStartRef,
  onPasteStateChange,
  hideTabBar = false,
}: IntakeSurfaceProps) {
  // 오버레이(워크스페이스)가 떠 있을 땐 탭이 가리키는 내용이 그 아래 깔려
  // 있으므로, 탭을 누르면 먼저 오버레이를 닫아 해당 내용을 드러낸다.
  const dismissOverlay = () => onDismissOverlay?.();
  const overlayActive = !!overlay;
  const pasteActive =
    showPasteTab && intakeView === "intake" && intakeTab === "paste";
  // 이 화면에서 '직접 입력 탭이 실제로 눈에 보이는가'의 단일 판정.
  // 탭의 active 표시와 MultiPassagePaste 의 boardVisible 이 **같은 값**을 써야
  // 한다 — 갈라지면 탭은 꺼져 보이는데 보드는 자기가 보인다고 믿는 상태가 생기고,
  // 그 순간 AI 지문 생성의 body 포털 모달이 다른 화면 위로 튀어나온다(step 19).
  // 붙여넣기 표면은 비활성일 때도 hidden 으로 마운트를 유지하므로(아래 :240)
  // "마운트됨 ≠ 보임"이다. 워크스페이스 오버레이(:265)는 본문을 통째로 덮으므로
  // 탭 상태와 무관하게 보이지 않는 것으로 친다.
  const pasteVisible = pasteActive && !overlayActive;
  const uploadActive =
    showUploadTab && intakeView === "intake" && intakeTab === "upload";
  const examActive =
    !!examBrowser && intakeView === "intake" && intakeTab === "exam";
  const libraryActive = intakeView === "library";
  // 모바일 스텝 플로우: <lg 에서만 탭을 숨긴다 — PC 는 클래스가 무효라 그대로.
  const hideNavTabsOnMobile = mobileStepTabs != null ? "max-lg:hidden" : "";

  // ── 좁은 열 임베드에서 탭 스트립이 가로 스크롤로 넘칠 때 활성 탭이 화면
  // 밖으로 사라지는 문제(클래스 스튜디오 중앙 열 실측) — 마운트·활성 변경 시
  // 활성 탭을 nearest 로 끌어온다. 넘치지 않는 기존 호스트에서는 스크롤할 게
  // 없어 no-op 이다(픽셀 불변).
  const tabRowRef = useRef<HTMLDivElement>(null);
  const activeTabKey = overlayActive
    ? "workspace"
    : libraryActive
      ? "library"
      : examActive
        ? "exam"
        : uploadActive
          ? "upload"
          : pasteVisible
            ? "paste"
            : "none";
  useEffect(() => {
    // 스트립 자체를 렌더하지 않는 호스트(hideTabBar)에서는 끌어올 탭이 없다.
    if (hideTabBar) return;
    const row = tabRowRef.current;
    if (!row) return;
    // ⚠ scrollIntoView 금지 — 문서까지 포함한 모든 스크롤 조상을 움직여, 탭이
    // 넘치지 않는 기존 호스트에서도 메인 스크롤을 탭 행으로 끌어올리는 수직
    // 하이재킹이 된다(적대검수 R-1 실측). 스트립 내부 가로 스크롤만 직접 계산.
    if (row.scrollWidth <= row.clientWidth) return;
    const el = row.querySelector<HTMLElement>('[data-intake-tab-active="true"]');
    if (!el) return;
    const left = el.offsetLeft;
    const right = left + el.offsetWidth;
    if (left < row.scrollLeft) row.scrollLeft = left;
    else if (right > row.scrollLeft + row.clientWidth)
      row.scrollLeft = right - row.clientWidth;
  }, [activeTabKey, hideTabBar]);

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden bg-white">
      {/* 탭 행 — 파일 경로(브레드크럼)처럼:
          직접 입력 · 파일업로드  ›  내 지문함  ›  워크스페이스
          hideTabBar(스튜디오 소스 스위처 대체) 시 행 전체를 렌더하지 않는다 —
          본문 슬롯·오버레이·pasteVisible 판정은 아래에서 그대로 유지된다. */}
      {hideTabBar ? null : (
      <div
        ref={tabRowRef}
        className={
          "flex min-h-11 shrink-0 flex-wrap items-center gap-1.5 overflow-visible border-b border-slate-100 px-3 py-1.5 sm:h-11 sm:flex-nowrap sm:overflow-x-auto sm:py-0" +
          (mobileStepTabs === "hidden" ? " max-lg:hidden" : "")
        }
        data-generate-tour="intake-tabs"
      >
        {showPasteTab ? (
          <Tab
            active={pasteVisible}
            onClick={() => {
              dismissOverlay();
              setIntakeView("intake");
              setIntakeTab("paste");
              dispatchGenerateTourMilestone("paste-tab-opened");
            }}
            icon={<ClipboardPaste className="h-3.5 w-3.5" />}
            label="직접 입력"
            tourKey="intake-paste"
          />
        ) : null}
        {showUploadTab ? (
          <Tab
            active={uploadActive && !overlay}
            onClick={() => {
              dismissOverlay();
              setIntakeView("intake");
              setIntakeTab("upload");
              dispatchGenerateTourMilestone("upload-tab-opened");
            }}
            icon={<ImageUp className="h-3.5 w-3.5" />}
            label="파일업로드"
            tourKey="intake-upload"
          />
        ) : null}
        {examBrowser ? (
          <Tab
            active={examActive && !overlay}
            onClick={() => {
              dismissOverlay();
              setIntakeView("intake");
              setIntakeTab("exam");
            }}
            icon={<GraduationCap className="h-3.5 w-3.5" />}
            label="기출 지문"
            tourKey="intake-exam"
          />
        ) : null}
        {/* 구분자 「›」는 다음 탭과 한 덩어리(shrink-0)로 묶는다 — 탭 행이
            줄바꿈·클리핑될 때 구분자만 고립 렌더되지 않는다. gap 은 부모 탭
            행과 같은 1.5 라 넘치지 않는 호스트에서는 픽셀 동일. */}
        <span
          className={
            "flex shrink-0 items-center gap-1.5" +
            (hideNavTabsOnMobile ? " " + hideNavTabsOnMobile : "")
          }
        >
          <BreadcrumbSep />
          <Tab
            active={libraryActive && !overlay}
            onClick={() => {
              dismissOverlay();
              setIntakeView("library");
            }}
            icon={<FolderOpen className="h-3.5 w-3.5" />}
            label={`${libraryLabel} ${libraryCount > 0 ? `(${libraryCount})` : ""}`.trim()}
            tourKey="intake-library"
          />
        </span>
        {onReopenWorkspace ? (
          <span
            className={
              "flex shrink-0 items-center gap-1.5" +
              (hideNavTabsOnMobile ? " " + hideNavTabsOnMobile : "")
            }
          >
            <BreadcrumbSep />
            <Tab
              active={!!overlay}
              title="워크스페이스 열기"
              onClick={() => onReopenWorkspace()}
              icon={<FilePen className="h-3.5 w-3.5" />}
              label="워크스페이스"
            />
          </span>
        ) : null}
      </div>
      )}

      {/* 모바일(<lg) 최소 높이는 워크스페이스 오버레이가 떠 있을 때만 확보 —
          오버레이는 absolute 라 자기 높이를 못 만드므로 이 컨테이너가 바닥을
          제공한다. 입력 탭만 있을 땐 콘텐츠 높이만 차지해 아래 사이트 푸터
          위에 빈 공간이 생기지 않는다. */}
      <div
        className={
          "relative flex min-h-0 flex-1 flex-col" +
          (overlay ? " max-lg:!min-h-[55vh]" : "")
        }
      >
        {/* Upload stays mounted (hidden when inactive) so its in-flight extraction
            survives the auto-flip to 내 지문 right after 추출 시작. */}
        <div
          className={uploadActive ? "flex min-h-0 flex-1 flex-col" : "hidden"}
        >
          {upload ?? <UploadPlaceholder />}
        </div>
        {/* Paste도 upload처럼 마운트를 유지(비활성 시 숨김) — 붙여넣어 쌓아둔
            지문 행이 내 지문함·워크스페이스를 다녀와도 사라지지 않는다. */}
        {showPasteTab && onSubmitPastedRows ? (
          <div
            className={pasteActive ? "flex min-h-0 flex-1 flex-col" : "hidden"}
          >
            <MultiPassagePaste
              onSubmitRows={onSubmitPastedRows}
              saving={pasteSaving ?? false}
              suppressTutorial={suppressTutorial}
              subjectScope={pasteSubjectScope}
              stackedBoard={stackedPasteBoard}
              scrollBody={scrollPasteBoard}
              hideEmptyGuide={hideEmptyGuide}
              simplifiedAuthoring={simplifiedAuthoring}
              startLabel={pasteStartLabel}
              startRef={pasteStartRef}
              onDraftStateChange={onPasteStateChange}
              // 탭 active 와 **같은 값**을 넘긴다. 이 표면은 비활성일 때 hidden
              // 으로만 숨는데, AI 지문 생성 보드의 결과·검토 모달은 body 포털이라
              // 조상의 display:none 이 통하지 않는다.
              boardVisible={pasteVisible}
            />
          </div>
        ) : null}
        {examActive ? (
          <div className="flex min-h-0 flex-1 flex-col">{examBrowser}</div>
        ) : libraryActive ? (
          // isolate: 지문함 카드의 '상세보기' 버튼(z-30)이 워크스페이스
          // 오버레이(z-10) 위로 새어 보이지 않도록 그리드의 stacking context 를
          // 가둔다. 오버레이가 닫혀 지문함이 다시 드러나면 버튼은 정상 노출된다.
          <div className="isolate flex min-h-0 flex-1 flex-col">{library}</div>
        ) : null}
        {/* 워크스페이스 오버레이 — 본문만 덮고 위 탭 행은 그대로 둔다.
            아래 내용은 마운트된 채 남아 진행 중 추출/입력 상태를 잃지 않는다. */}
        {overlay ? (
          <div className="absolute inset-0 z-10 flex min-h-0 flex-col bg-white">
            {overlay}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** 브레드크럼 구분자 — 탭 사이의 '›' 셰브론. */
function BreadcrumbSep({ className = "" }: { className?: string }) {
  return (
    <ChevronRight
      className={`hidden size-3.5 shrink-0 text-slate-300 sm:block ${className}`}
      aria-hidden="true"
    />
  );
}

function Tab({
  active,
  onClick,
  icon,
  label,
  tourKey,
  disabled = false,
  title,
  className = "",
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
  tourKey?: string;
  disabled?: boolean;
  title?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      data-generate-tour={tourKey}
      // 탭 스트립 오버플로 시 활성 탭 scrollIntoView 대상 지정(IntakeSurface).
      data-intake-tab-active={active ? "true" : undefined}
      className={
        "inline-flex h-8 max-w-full shrink-0 items-center gap-1.5 rounded-md border px-3 text-[12.5px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-slate-300 " +
        (active
          ? "border-blue-600 bg-blue-50/40 text-blue-700 shadow-sm"
          : "cursor-pointer border-transparent text-slate-400 hover:bg-slate-50 hover:text-slate-600") +
        (className ? " " + className : "")
      }
    >
      {icon}
      {label}
    </button>
  );
}

function UploadPlaceholder() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
        <ImageUp className="h-5 w-5" />
      </span>
      <p className="text-[13px] font-semibold text-slate-600">
        이미지·PDF에서 바로 추출
      </p>
      <p className="text-[11.5px] leading-relaxed text-slate-400">
        지문을 크롭·합성하고 필요하면 AI 원문 복원까지.
      </p>
    </div>
  );
}
