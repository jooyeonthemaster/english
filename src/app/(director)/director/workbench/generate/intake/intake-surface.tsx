"use client";

import { type ReactNode } from "react";
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
  showUploadTab = true,
  showPasteTab = true,
  suppressTutorial = false,
  upload,
  examBrowser,
  overlay,
  onDismissOverlay,
  workspaceActive = false,
  onReopenWorkspace,
}: IntakeSurfaceProps) {
  // 오버레이(워크스페이스)가 떠 있을 땐 탭이 가리키는 내용이 그 아래 깔려
  // 있으므로, 탭을 누르면 먼저 오버레이를 닫아 해당 내용을 드러낸다.
  const dismissOverlay = () => onDismissOverlay?.();
  const pasteActive =
    showPasteTab && intakeView === "intake" && intakeTab === "paste";
  const uploadActive =
    showUploadTab && intakeView === "intake" && intakeTab === "upload";
  const examActive =
    !!examBrowser && intakeView === "intake" && intakeTab === "exam";
  const libraryActive = intakeView === "library";

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden bg-white">
      {/* 탭 행 — 파일 경로(브레드크럼)처럼:
          직접 입력 · 파일업로드  ›  내 지문함  ›  워크스페이스 */}
      <div
        className="flex h-11 shrink-0 items-center gap-1.5 overflow-x-auto border-b border-slate-100 px-3"
        data-generate-tour="intake-tabs"
      >
        {showPasteTab ? (
          <Tab
            active={pasteActive && !overlay}
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
        {onReopenWorkspace ? (
          <>
            <BreadcrumbSep />
            <Tab
              active={!!overlay}
              title="워크스페이스 열기"
              onClick={() => onReopenWorkspace()}
              icon={<FilePen className="h-3.5 w-3.5" />}
              label="워크스페이스"
            />
          </>
        ) : null}
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col">
        {/* Upload stays mounted (hidden when inactive) so its in-flight extraction
            survives the auto-flip to 내 지문 right after 추출 시작. */}
        <div
          className={uploadActive ? "flex min-h-0 flex-1 flex-col" : "hidden"}
        >
          {upload ?? <UploadPlaceholder />}
        </div>
        {examActive ? (
          <div className="flex min-h-0 flex-1 flex-col">{examBrowser}</div>
        ) : libraryActive ? (
          // isolate: 지문함 카드의 '상세보기' 버튼(z-30)이 워크스페이스
          // 오버레이(z-10) 위로 새어 보이지 않도록 그리드의 stacking context 를
          // 가둔다. 오버레이가 닫혀 지문함이 다시 드러나면 버튼은 정상 노출된다.
          <div className="isolate flex min-h-0 flex-1 flex-col">{library}</div>
        ) : pasteActive && onSubmitPastedRows ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <MultiPassagePaste
              onSubmitRows={onSubmitPastedRows}
              saving={pasteSaving ?? false}
              suppressTutorial={suppressTutorial}
              subjectScope={pasteSubjectScope}
            />
          </div>
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
function BreadcrumbSep() {
  return (
    <ChevronRight
      className="size-3.5 shrink-0 text-slate-300"
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
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
  tourKey?: string;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      data-generate-tour={tourKey}
      className={
        "inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-[12.5px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-slate-300 " +
        (active
          ? "border-blue-600 bg-blue-50/40 text-blue-700 shadow-sm"
          : "cursor-pointer border-transparent text-slate-400 hover:bg-slate-50 hover:text-slate-600")
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
