"use client";

import { type ReactNode } from "react";
import {
  ChevronRight,
  ClipboardPaste,
  FilePen,
  FolderOpen,
  ImageUp,
} from "lucide-react";
import { dispatchGenerateTourMilestone } from "@/lib/generate-tour-demo";
import {
  MultiPassagePaste,
  type PastedPassageInput,
} from "./multi-passage-paste";

export type IntakeView = "intake" | "library";
export type IntakeTab = "paste" | "upload";

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
  showPasteTab = true,
  suppressTutorial = false,
  upload,
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
  const uploadActive = intakeView === "intake" && intakeTab === "upload";
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
        {libraryActive ? (
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
