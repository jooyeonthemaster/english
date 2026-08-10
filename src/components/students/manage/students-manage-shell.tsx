"use client";

// ============================================================================
// 학생 관리 통합 셸 — students/(manage) 라우트 그룹 공통 헤더·뷰 스위처 (v3 C-2)
// (docs/director-console-v3-design.md §D4-1)
//
// /director/students · /students/classes · /students/assignments ·
// /students/grammar 4경로가 이 한 셸을 공유한다((manage) layout.tsx 가 PageShell
// 과 함께 렌더). 뷰 전환은 **Link 내비**(usePathname 활성 판정) — 쿼리 탭이
// 아니라 실 경로라 nav 활성판정·딥링크·북마크가 전부 살아 있다(D4-1 근거).
//
// 뷰 스위처는 kit SegmentPills 의 시각 규격(rounded-lg border slate-200 판 +
// 활성 bg-white/blue-700)을 대형(px-4 py-2, 13px)으로 미러한 Link 판이다 —
// SegmentPills 는 button/onChange 계약이라 내비에 그대로 쓸 수 없어 시각만
// 정본을 따른다(신규 시각 언어 발명 아님).
//
// 뷰별 헤더 액션(C-1 embedded 계약으로 각 클라이언트가 접은 헤더 액션의 대체):
//  - 학생: 대량 등록·학생 등록 — StudentFormDialog/StudentBulkImportDialog 자체
//    인스턴스(roster 내부 빈 상태 CTA 의 자체 다이얼로그와 독립 공존 — C-1 확인)
//  - 과제 달력: 과제 보내기 — AssignmentComposer 리프트(onCreated → refresh)
//  - 어법 현황: 학생 앱 열기(/g 새 탭)
//  - 반: + 새 반 — 인라인 생성 팝오버(이름 입력·생성 → createClassFolder,
//    v3 C-3). 생성 후 router.refresh → ClassFolderView 가 새 props 로 재동기화.
// 문구는 전량 director-glossary 참조(리터럴 금지 — D6).
// ============================================================================

import { type ReactNode, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ExternalLink, Loader2, Send, Upload } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { StudentFormDialog } from "@/components/students/student-form-dialog";
import { StudentBulkImportDialog } from "@/app/(director)/director/tutor/_components/student-bulk-import-dialog";
import { AssignmentComposer } from "@/components/study-assignments/assignment-composer";
import { createClassFolder } from "@/actions/students/class-folders";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import type {
  HubClass,
  HubSchool,
} from "@/app/(director)/director/tutor/_components/types";
import {
  CLASS_FOLDER_COPY,
  CTA_LABELS,
  MANAGE_VIEW_LABELS,
  STUDENTS_MANAGE_TITLE,
  SURFACE_ONELINERS,
  type ManageViewKey,
  type SurfaceOnelinerKey,
} from "@/lib/wording/director-glossary";

// ── 뷰 정의 — 경로·라벨·한 문장(글로서리 키) 단일 소스 ──────────────────────

const ALL_VIEWS: {
  key: ManageViewKey;
  href: string;
  label: string;
  surface: SurfaceOnelinerKey;
}[] = [
  {
    key: "roster",
    href: "/director/students",
    label: MANAGE_VIEW_LABELS.roster,
    surface: "students-home",
  },
  {
    key: "classes",
    href: "/director/students/classes",
    label: MANAGE_VIEW_LABELS.classes,
    surface: "students-classes",
  },
  {
    key: "assignments",
    href: "/director/students/assignments",
    label: MANAGE_VIEW_LABELS.assignments,
    surface: "students-assignments",
  },
  {
    key: "grammar",
    href: "/director/students/grammar",
    label: MANAGE_VIEW_LABELS.grammar,
    surface: "students-grammar",
  },
  {
    key: "vocab",
    href: "/director/students/vocab",
    label: MANAGE_VIEW_LABELS.vocab,
    surface: "students-vocab",
  },
];

// N-2: 어법 현황 뷰는 훈련소 플래그와 3중 일치(nav children · 페이지 게이트 ·
// 이 스위처) — 플래그 off 면 스위처에서도 미노출. 단어 훈련도 동일 관용구.
const VIEWS = ALL_VIEWS.filter(
  (v) =>
    (v.key !== "grammar" || FEATURE_FLAGS.ENABLE_GRAMMAR_DRILL) &&
    (v.key !== "vocab" || FEATURE_FLAGS.ENABLE_VOCAB_DRILL),
);

/** usePathname → 활성 뷰. 하위 세그먼트(딥링크 쿼리 등)도 startsWith 로 흡수 */
function resolveView(pathname: string): ManageViewKey {
  if (pathname.startsWith("/director/students/classes")) return "classes";
  if (pathname.startsWith("/director/students/assignments")) return "assignments";
  if (pathname.startsWith("/director/students/grammar")) return "grammar";
  if (pathname.startsWith("/director/students/vocab")) return "vocab";
  return "roster";
}

// ── 헤더 액션 버튼 토큰 — roster 빈 상태 CTA(h-9/13px) 규격과 동일 ───────────

const PRIMARY_BTN =
  "inline-flex h-9 items-center gap-1.5 rounded-md bg-blue-600 px-4 text-[13px] font-semibold text-white transition-colors hover:bg-blue-700";
const SECONDARY_BTN =
  "inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-4 text-[13px] font-semibold text-slate-600 transition-colors hover:bg-slate-50";

export function StudentsManageShell({
  academyId,
  schools,
  classes,
  children,
}: {
  academyId: string;
  schools: HubSchool[];
  classes: HubClass[];
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const view = resolveView(pathname ?? "/director/students");
  const activeView = VIEWS.find((v) => v.key === view) ?? VIEWS[0];

  // 셸 자체 인스턴스 상태 — 각 뷰 클라이언트 내부의 다이얼로그·컴포저와 독립
  const [studentDialogOpen, setStudentDialogOpen] = useState(false);
  const [bulkImportOpen, setBulkImportOpen] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);

  // 「+ 새 반」 인라인 생성 팝오버(C-3) — 이름 입력 하나·생성 버튼 하나
  const [newClassOpen, setNewClassOpen] = useState(false);
  const [newClassName, setNewClassName] = useState("");
  const [creatingClass, startCreatingClass] = useTransition();

  function handleCreateClass() {
    const name = newClassName.trim();
    if (!name || creatingClass) return;
    startCreatingClass(async () => {
      const res = await createClassFolder({ name });
      if (res.success) {
        toast.success(CLASS_FOLDER_COPY.CREATED_TOAST(name));
        setNewClassName("");
        setNewClassOpen(false);
        // ClassFolderView 는 서버 props sync effect 로 새 반을 반영한다
        router.refresh();
      } else {
        toast.error(res.error || CLASS_FOLDER_COPY.CREATE_FAILED);
      }
    });
  }

  return (
    <>
      {/* 헤더 — 제목 고정 「학생 관리」 + 활성 뷰의 SURFACE 한 문장(D6-2) */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[18px] font-bold tracking-tight text-slate-900">
            {STUDENTS_MANAGE_TITLE}
          </h1>
          <p className="mt-0.5 text-[12.5px] font-medium text-slate-400">
            {SURFACE_ONELINERS[activeView.surface]}
          </p>
        </div>

        {/* 뷰별 액션 — C-1 embedded 계약으로 접힌 각 클라 헤더 액션의 대체.
            mr: 전역 작업 목록 플로팅 버튼(top-right fixed) 예약 코너 회피(N-3 —
            hub-header 관용 미러) */}
        <div className="mr-10 flex shrink-0 items-center gap-2 min-[1800px]:mr-0">
          {view === "roster" ? (
            <>
              <button
                type="button"
                onClick={() => setBulkImportOpen(true)}
                className={SECONDARY_BTN}
              >
                <Upload className="size-3.5" aria-hidden />
                {CTA_LABELS.REGISTER_STUDENT_BULK}
              </button>
              <button
                type="button"
                onClick={() => setStudentDialogOpen(true)}
                className={PRIMARY_BTN}
              >
                {CTA_LABELS.REGISTER_STUDENT}
              </button>
            </>
          ) : null}
          {view === "assignments" ? (
            <button
              type="button"
              onClick={() => setComposerOpen(true)}
              className={PRIMARY_BTN}
            >
              <Send className="size-3.5" aria-hidden />
              {CTA_LABELS.SEND_TASK}
            </button>
          ) : null}
          {view === "grammar" || view === "vocab" ? (
            <a href="/g" target="_blank" rel="noreferrer" className={SECONDARY_BTN}>
              <ExternalLink className="size-3.5" aria-hidden />
              {CTA_LABELS.OPEN_STUDENT_APP}
            </a>
          ) : null}
          {view === "classes" ? (
            <Popover open={newClassOpen} onOpenChange={setNewClassOpen}>
              <PopoverTrigger asChild>
                <button type="button" className={PRIMARY_BTN}>
                  {CTA_LABELS.NEW_CLASS}
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                className="w-72 rounded-xl border-slate-200 p-3 shadow-lg"
              >
                <p className="text-[13px] font-bold text-slate-900">
                  {CLASS_FOLDER_COPY.NEW_CLASS_TITLE}
                </p>
                <div className="mt-2 flex items-center gap-1.5">
                  <input
                    autoFocus
                    value={newClassName}
                    onChange={(e) => setNewClassName(e.target.value)}
                    placeholder={CLASS_FOLDER_COPY.NEW_CLASS_PLACEHOLDER}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        // 한글 IME 조합 중 Enter 이중 발화 가드
                        if (e.nativeEvent.isComposing || e.repeat) return;
                        e.preventDefault();
                        handleCreateClass();
                      }
                      if (e.key === "Escape") {
                        e.preventDefault();
                        setNewClassOpen(false);
                        setNewClassName("");
                      }
                    }}
                    className="h-9 min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2.5 text-[13px] text-slate-700 outline-none transition-colors placeholder:text-slate-300 focus:border-blue-300 focus:ring-2 focus:ring-blue-500/10"
                  />
                  <button
                    type="button"
                    onClick={handleCreateClass}
                    disabled={creatingClass || !newClassName.trim()}
                    className="inline-flex h-9 shrink-0 items-center gap-1 rounded-md bg-blue-600 px-3 text-[12.5px] font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {creatingClass ? (
                      <Loader2 className="size-3.5 animate-spin" aria-hidden />
                    ) : null}
                    {CLASS_FOLDER_COPY.NEW_CLASS_SUBMIT}
                  </button>
                </div>
              </PopoverContent>
            </Popover>
          ) : null}
        </div>
      </header>

      {/* 뷰 스위처 — SegmentPills 시각 규격의 대형 Link 판(파일 상단 주석 참조) */}
      <nav
        aria-label={STUDENTS_MANAGE_TITLE}
        className="inline-flex self-start rounded-lg border border-slate-200 bg-slate-50 p-0.5"
      >
        {VIEWS.map((v) => (
          <Link
            key={v.key}
            href={v.href}
            aria-current={view === v.key ? "page" : undefined}
            className={cn(
              "rounded-md px-4 py-2 text-[13px] font-semibold transition-colors",
              view === v.key
                ? "bg-white text-blue-700 shadow-sm"
                : "text-slate-500 hover:text-slate-700",
            )}
          >
            {v.label}
          </Link>
        ))}
      </nav>

      {children}

      {/* 셸 리프트 인스턴스 — 활성 뷰에서만 마운트(비관련 뷰 번들 유입 방지) */}
      {view === "roster" ? (
        <>
          <StudentFormDialog
            open={studentDialogOpen}
            onOpenChange={setStudentDialogOpen}
            student={null}
            schools={schools}
            classes={classes}
          />
          <StudentBulkImportDialog
            open={bulkImportOpen}
            onOpenChange={setBulkImportOpen}
            academyId={academyId}
          />
        </>
      ) : null}
      {view === "assignments" ? (
        <AssignmentComposer
          open={composerOpen}
          onClose={() => setComposerOpen(false)}
          preset={null}
          onCreated={() => router.refresh()}
        />
      ) : null}
    </>
  );
}
