"use client";

// ============================================================================
// 환영 · 완료 · 종료 확인 카드 (.tmp-studio-tour/spec.md §2 문구 정본)
// 전부 중앙 카드 — 스포트라이트 없이 전면 딤 위에 뜬다. 자구 변형 금지.
// ============================================================================

import {
  BookOpenCheck,
  CheckCircle2,
  ClipboardList,
  Cpu,
  FileText,
  FolderPlus,
  GraduationCap,
  LayoutTemplate,
  MonitorUp,
} from "lucide-react";

function CenterShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="absolute inset-0 flex items-center justify-center p-4"
      style={{ pointerEvents: "none" }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-[440px] max-w-full rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl shadow-slate-900/30"
        style={{ pointerEvents: "auto" }}
      >
        {children}
      </div>
    </div>
  );
}

export function WelcomeCard({
  isXl,
  hasResume,
  onStart,
  onDismiss,
}: {
  isXl: boolean;
  hasResume: boolean;
  onStart: () => void;
  onDismiss: () => void;
}) {
  return (
    <CenterShell>
      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50">
        <GraduationCap className="h-6 w-6 text-blue-600" />
      </div>
      <h2 className="mt-3.5 text-[18px] font-bold leading-snug text-slate-900 break-keep">
        클래스 스튜디오에 오신 것을 환영합니다
      </h2>
      {isXl ? (
        <>
          <p className="mt-2 text-[13.5px] leading-relaxed text-slate-600 break-keep">
            지문 하나로 학습지와 실전 시험지까지 — 이 화면에서 전부 만들 수 있습니다.
            3분이면 전체 흐름을 익히실 수 있도록 차근차근 안내해 드리겠습니다.
          </p>
          <p className="mt-2 text-[13.5px] leading-relaxed text-slate-600 break-keep">
            화면을 회색으로 가리고 지금 볼 곳만 밝게 비추며 진행합니다. 실제 데이터는
            만들지 않으니 마음 놓고 둘러보세요.
          </p>
          <div className="mt-5 flex items-center gap-2">
            <button
              type="button"
              data-tour-welcome-start
              className="inline-flex h-11 flex-1 items-center justify-center rounded-xl bg-blue-600 text-[14px] font-bold text-white hover:bg-blue-700"
              onClick={onStart}
            >
              {hasResume ? "이어서 보기" : "투어 시작하기"}
            </button>
            <button
              type="button"
              data-tour-welcome-dismiss
              className="inline-flex h-11 items-center justify-center rounded-xl px-4 text-[13px] font-semibold text-slate-500 hover:bg-slate-50"
              onClick={onDismiss}
            >
              나중에 보기
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="mt-2 text-[13.5px] leading-relaxed text-slate-600 break-keep">
            이 안내는 넓은 화면(가로 1280px 이상)에서 볼 수 있습니다. 창을 키운 뒤
            「튜토리얼」 버튼을 눌러 주세요.
          </p>
          <div className="mt-5">
            <button
              type="button"
              data-tour-welcome-dismiss
              className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-slate-100 text-[13px] font-bold text-slate-600 hover:bg-slate-200"
              onClick={onDismiss}
            >
              닫기
            </button>
          </div>
        </>
      )}
    </CenterShell>
  );
}

const FINISH_CHECKLIST = [
  { icon: FolderPlus, label: "클래스 만들기" },
  { icon: FileText, label: "지문 등록" },
  { icon: BookOpenCheck, label: "학습지 생성" },
  { icon: Cpu, label: "실전 문제 생성" },
  { icon: LayoutTemplate, label: "학습지 조판" },
  { icon: ClipboardList, label: "시험지 조판" },
];

export function FinishCard({
  onGoStart,
  onClose,
}: {
  onGoStart: () => void;
  onClose: () => void;
}) {
  return (
    <CenterShell>
      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50">
        <CheckCircle2 className="h-6 w-6 text-emerald-600" />
      </div>
      <h2 className="mt-3.5 text-[18px] font-bold leading-snug text-slate-900 break-keep">
        준비를 마쳤습니다. 이제 직접 만들어 보세요
      </h2>
      <p className="mt-2 text-[13.5px] leading-relaxed text-slate-600 break-keep">
        오늘 함께 본 흐름 그대로입니다 — 지문을 등록하고, 학습지와 문제를 만들고,
        조판해서 인쇄하면 됩니다. 막히는 부분이 있으면 언제든 위의 「튜토리얼」 버튼을
        눌러 주세요.
      </p>
      <div className="mt-4 grid grid-cols-2 gap-1.5">
        {FINISH_CHECKLIST.map(({ icon: Icon, label }, i) => (
          <div
            key={label}
            className="flex h-9 items-center gap-2 rounded-lg bg-slate-50 px-2.5"
          >
            <span className="text-[11px] font-bold tabular-nums text-slate-400">{i + 1}</span>
            <Icon className="h-3.5 w-3.5 text-blue-600" />
            <span className="text-[12px] font-semibold text-slate-700">{label}</span>
          </div>
        ))}
      </div>
      <div className="mt-5 flex items-center gap-2">
        <button
          type="button"
          data-tour-finish-start
          className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-blue-600 text-[14px] font-bold text-white hover:bg-blue-700"
          onClick={onGoStart}
        >
          <MonitorUp className="h-4 w-4" />
          지문 등록부터 시작하기
        </button>
        <button
          type="button"
          data-tour-finish-close
          className="inline-flex h-11 items-center justify-center rounded-xl px-4 text-[13px] font-semibold text-slate-500 hover:bg-slate-50"
          onClick={onClose}
        >
          닫기
        </button>
      </div>
    </CenterShell>
  );
}

export function ExitConfirmCard({
  onContinue,
  onExit,
}: {
  onContinue: () => void;
  onExit: () => void;
}) {
  return (
    <CenterShell>
      <h2 className="text-[16px] font-bold leading-snug text-slate-900 break-keep">
        튜토리얼을 닫으시겠습니까?
      </h2>
      <p className="mt-2 text-[13px] leading-relaxed text-slate-600 break-keep">
        진행 위치는 저장됩니다. 다음에 「튜토리얼」 버튼을 누르면 이어서 볼 수 있습니다.
      </p>
      <div className="mt-5 flex items-center gap-2">
        <button
          type="button"
          data-tour-exit-continue
          className="inline-flex h-10 flex-1 items-center justify-center rounded-xl bg-blue-600 text-[13px] font-bold text-white hover:bg-blue-700"
          onClick={onContinue}
        >
          계속 보기
        </button>
        <button
          type="button"
          data-tour-exit-confirm
          className="inline-flex h-10 items-center justify-center rounded-xl px-4 text-[13px] font-semibold text-slate-500 hover:bg-slate-50"
          onClick={onExit}
        >
          닫기
        </button>
      </div>
    </CenterShell>
  );
}
