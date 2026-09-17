"use client";

// ============================================================================
// 클래스 홈 — 설정 탭 (docs/class-studio-spec.md §3.2 설정)
//
// 섹션 카드 3개: ① 클래스 이름 변경(renameStudioClass) ② 학생 코드 일괄 복사
// (listStudioClassStudents → "이름\t학생코드" 줄 텍스트, copyText 정본 재사용)
// ③ 클래스 보관(archiveStudioClass — 삭제 아님, 확인 문구는 스펙 §3.2 정본,
// 성공 시 클래스 목록으로 이동).
//
// §M(26-08-22) 모바일 학습 임시 숨김: SHOW_STUDIO_MOBILE_LEARNING=false(기본)면
// 클래스 이름 카드 설명이 초대장·과제 화면(모바일 학습) 자구 대신 "학생
// 화면에도 이 이름이 보입니다." 로 재작성된다. 코드 경로는 전부 존치 —
// 복구는 env 1줄(NEXT_PUBLIC_SHOW_STUDIO_MOBILE_LEARNING=true).
// ============================================================================

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { archiveStudioClass, renameStudioClass } from "@/actions/studio/classes";
import { listStudioClassStudents } from "@/actions/studio/students";
import { copyText } from "@/components/students/devices/student-code-row";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import { SectionHeader } from "./section-header";

// §M 모바일 학습 임시 숨김 스위치 — 모듈 상수로만 소비한다(prop 화 금지:
// memo·시그니처 메모 방어선 무접촉). false 가 기본값 = 숨김이 새 정상.
const SHOW_MOBILE = FEATURE_FLAGS.SHOW_STUDIO_MOBILE_LEARNING;

/**
 * 보관 고지 정본 (스펙 §3.2 개정 2026-08-09) — 카드 설명과 확인 모달이 **같은 상수**를
 * 쓴다. 감사 L1-05·R3-15: 화면에서 ERP 파급 문장이 통째로 빠져 있어, 원장이 반 목록
 * 비활성이라는 부작용을 모른 채 실행하고 있었다. 같은 Class 실체를 공유하므로 필수 고지.
 */
const ARCHIVE_NOTICE =
  "보관하면 목록에서 숨겨집니다. 학생 관리(ERP)의 반 목록에서도 비활성 처리되며, 학생 기록은 지워지지 않습니다.";

// ── 섹션 카드 (견본풍) ───────────────────────────────────────────────────────

function SettingCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <h3 className="text-[14px] font-bold text-slate-900">{title}</h3>
      {description && (
        <p className="mt-1 max-w-prose text-xs leading-relaxed text-slate-400 break-keep">
          {description}
        </p>
      )}
      <div className="mt-4">{children}</div>
    </section>
  );
}

// ── 보관 확인 모달 (소형 — 견본 CreateClassModal 패턴) ──────────────────────

function ArchiveConfirmModal({
  open,
  pending,
  onClose,
  onConfirm,
}: {
  open: boolean;
  pending: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/40 p-4"
      onClick={pending ? undefined : onClose}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label="클래스 보관 확인"
        className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-rose-50">
            <Archive className="h-4.5 w-4.5 text-rose-600" />
          </span>
          <h2 className="text-[15px] font-bold text-slate-900">클래스를 보관할까요?</h2>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-slate-500 break-keep">
          {ARCHIVE_NOTICE}
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="min-h-11 rounded-lg px-3.5 py-2 text-sm font-medium text-slate-500 hover:bg-slate-50 disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
          >
            {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
            {pending ? "보관하는 중…" : "보관하기"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 설정 탭 ──────────────────────────────────────────────────────────────────

export function SettingsTab({
  classId,
  currentName,
  onRenamed,
}: {
  classId: string;
  currentName: string;
  /** 이름 변경 성공 시 부모(클래스 홈 헤더) 상태 동기화용 — 적대검수 coherence 봉합 */
  onRenamed?: (name: string) => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(currentName);
  const [renamePending, startRename] = useTransition();
  const [copyPending, startCopy] = useTransition();
  const [archivePending, startArchive] = useTransition();
  const [archiveOpen, setArchiveOpen] = useState(false);

  const submitRename = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("클래스 이름을 입력해 주세요.");
      return;
    }
    if (trimmed === currentName) return;
    startRename(async () => {
      const res = await renameStudioClass({ classId, name: trimmed });
      if (!res.success) {
        toast.error(res.error ?? "이름 변경에 실패했습니다.");
        return;
      }
      toast.success("클래스 이름을 변경했습니다.");
      onRenamed?.(trimmed);
      router.refresh();
    });
  };

  const copyCodes = () => {
    startCopy(async () => {
      const res = await listStudioClassStudents(classId);
      if (!res.success || !res.data) {
        toast.error(res.error ?? "학생 목록을 불러오지 못했습니다.");
        return;
      }
      if (res.data.length === 0) {
        toast.error("복사할 학생이 없습니다. 학생 탭에서 먼저 등록해 주세요.");
        return;
      }
      const text = res.data.map((s) => `${s.name}\t${s.studentCode}`).join("\n");
      const ok = await copyText(text);
      if (ok) {
        toast.success(`학생 ${res.data.length}명의 코드를 복사했습니다.`);
      } else {
        toast.error("복사에 실패했습니다. 브라우저 설정을 확인해 주세요.");
      }
    });
  };

  const confirmArchive = () => {
    startArchive(async () => {
      const res = await archiveStudioClass({ classId });
      if (!res.success) {
        toast.error(res.error ?? "클래스 보관에 실패했습니다.");
        return;
      }
      toast.success("클래스를 보관했습니다.");
      router.push("/director/studio");
    });
  };

  return (
    <div>
      {/* 4탭 공통 섹션 헤더 — 설정 탭만 이 행이 없어 콘텐츠가 다른 탭보다 위에서
          시작했다(감사 L1-02·L4-08). */}
      <SectionHeader label="클래스 설정" />

      {/* 폭은 셸(max-w-5xl)이 통제한다 — 여기서 max-w-2xl 로 다시 좁히면 같은 페이지
          안에서 탭 바 밑줄과 카드 우측 끝이 290px 어긋난다(감사 L4-01·L1-03).
          읽기 폭은 카드 설명문(max-w-prose)에만 건다. */}
      <div className="flex flex-col gap-4">
        {/* ① 클래스 이름 */}
        <SettingCard
          title="클래스 이름"
          description={
            SHOW_MOBILE
              ? "학생 초대장·과제 화면에도 이 이름이 보입니다."
              : "학생 화면에도 이 이름이 보입니다."
          }
        >
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) submitRename();
              }}
              maxLength={60}
              placeholder="예: 한영고 1학년 내신 심화반"
              className="min-h-11 min-w-0 flex-1 basis-56 rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-300 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
            <button
              type="button"
              onClick={submitRename}
              disabled={renamePending || !name.trim() || name.trim() === currentName}
              className="min-h-11 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
            >
              {renamePending ? "저장 중…" : "저장"}
            </button>
          </div>
        </SettingCard>

        {/* ② 학생 코드 일괄 복사 */}
        <SettingCard
          title="학생 코드 일괄 복사"
          description="이 클래스 전체 학생의 이름과 학생 코드를 표 형태 텍스트로 복사합니다. 엑셀·메모장에 그대로 붙여넣을 수 있습니다."
        >
          <button
            type="button"
            onClick={copyCodes}
            disabled={copyPending}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:border-blue-300 hover:text-blue-600 disabled:opacity-50"
          >
            {copyPending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Copy className="h-4 w-4" aria-hidden />
            )}
            {copyPending ? "불러오는 중…" : "전체 학생 코드 복사"}
          </button>
        </SettingCard>

        {/* ③ 클래스 보관 — 설명과 확인 모달이 같은 상수(ARCHIVE_NOTICE)를 쓴다 */}
        <SettingCard title="클래스 보관" description={ARCHIVE_NOTICE}>
          <button
            type="button"
            onClick={() => setArchiveOpen(true)}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-4 py-2.5 text-sm font-semibold text-rose-600 transition hover:bg-rose-50"
          >
            <Archive className="h-4 w-4" aria-hidden />
            클래스 보관
          </button>
        </SettingCard>
      </div>

      <ArchiveConfirmModal
        open={archiveOpen}
        pending={archivePending}
        onClose={() => setArchiveOpen(false)}
        onConfirm={confirmArchive}
      />
    </div>
  );
}
