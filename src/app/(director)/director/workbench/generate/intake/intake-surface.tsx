"use client";

import { type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ClipboardPaste,
  FilePen,
  FileText,
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
      {/* Single tab row: 직접 입력 · 이미지·PDF | 내 지문 */}
      <div
        className="flex h-11 shrink-0 items-center gap-3 border-b border-slate-100 px-3"
        data-generate-tour="intake-tabs"
      >
        <div className="flex w-[128px] shrink-0 items-center gap-1.5 text-[12.5px] font-bold text-slate-700">
          <FileText
            className="h-3.5 w-3.5 shrink-0 text-slate-400"
            aria-hidden="true"
          />
          <span className="truncate">지문 입력·선택</span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
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
          <span
            className="mx-1.5 h-4 w-px self-center bg-slate-200"
            aria-hidden="true"
          />
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
        </div>
        {/* 워크스페이스 ↔ 지문함 이동 버튼은 탭 행 오른쪽 끝에 고정 — 탭은
            왼쪽 정렬, 이 버튼 그룹만 ml-auto 로 우측에 붙인다. */}
        <div className="ml-auto flex shrink-0 items-center gap-1">
          {/* 워크스페이스 ↔ 지문함 이동 버튼 — 같은 줄(탭 행) 오른쪽 끝에
              현재 위치에 따라 하나만 보인다.
              · 워크스페이스 안: '지문함으로' (닫고 지문함 보기)
              · 지문함: '워크스페이스로' (작업 중인 워크스페이스로 복귀) */}
          {overlay ? (
            <>
              <span
                className="mx-1 h-4 w-px self-center bg-slate-200"
                aria-hidden="true"
              />
              <button
                type="button"
                onClick={() => {
                  dismissOverlay();
                  setIntakeView("library");
                }}
                title="워크스페이스를 닫고 내 지문함을 봅니다"
                className="inline-flex h-8 shrink-0 cursor-pointer items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 text-[11px] font-semibold text-slate-600 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-800"
              >
                <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                <span>지문함으로</span>
              </button>
            </>
          ) : workspaceActive && onReopenWorkspace ? (
            <>
              <span
                className="mx-1 h-4 w-px self-center bg-slate-200"
                aria-hidden="true"
              />
              <button
                type="button"
                onClick={onReopenWorkspace}
                title="작업 중인 워크스페이스로 돌아가 지문을 편집합니다"
                className="inline-flex h-8 shrink-0 cursor-pointer items-center gap-1 rounded-md border border-violet-300 bg-violet-600 px-2.5 text-[11px] font-semibold text-white shadow-sm transition-colors hover:bg-violet-700"
              >
                <FilePen className="h-3.5 w-3.5" aria-hidden="true" />
                <span>워크스페이스로</span>
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </>
          ) : null}
        </div>
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
          <div className="flex min-h-0 flex-1 flex-col">{library}</div>
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

function Tab({
  active,
  onClick,
  icon,
  label,
  tourKey,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
  tourKey?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-generate-tour={tourKey}
      className={
        "inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border px-3 text-[12.5px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 " +
        (active
          ? "border-blue-600 bg-blue-50/40 text-blue-700 shadow-sm"
          : "border-transparent text-slate-400 hover:bg-slate-50 hover:text-slate-600")
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
