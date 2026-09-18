"use client";

import { Eye, Loader2, QrCode, Save, Trash2 } from "lucide-react";
import type { AdminGroupSeminarDetail } from "@/actions/admin-help-center";
import { AdminDialog } from "@/components/admin/kit";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { GroupSeminarFormFields } from "./group-seminar-form-fields";
import { RegistrationsPanel } from "./registrations-panel";
import type { DepositStatus, FormState, RegStatus } from "./group-seminar-form";

/**
 * 세미나 개설·편집 팝업 — 좌(편집 폼) / 우(신청자 목록) 2단.
 * 폼 상태·저장·삭제는 부모가 갖는다(목록 새로고침과 함께 움직여야 하므로).
 */
export function SeminarEditorDialog({
  open,
  isNew,
  detail,
  form,
  set,
  isPending,
  uploading,
  onUploadCover,
  onClose,
  onSave,
  onDelete,
  onPreview,
  onQr,
  onRegStatus,
  onDepStatus,
}: {
  open: boolean;
  isNew: boolean;
  detail: AdminGroupSeminarDetail | null;
  form: FormState;
  set: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  isPending: boolean;
  uploading: boolean;
  onUploadCover: (file: File) => void;
  onClose: () => void;
  onSave: () => void;
  onDelete: () => void;
  onPreview: () => void;
  onQr: () => void;
  onRegStatus: (regId: string, status: RegStatus) => void;
  onDepStatus: (regId: string, status: DepositStatus) => void;
}) {
  const showRegistrations = !isNew && detail !== null;

  return (
    <AdminDialog
      open={open}
      onOpenChange={(next) => !next && !isPending && onClose()}
      size="xl"
      title={isNew ? "새 세미나 개설" : "세미나 편집"}
      description={isNew ? "개설하면 원장 화면에서 열람·신청할 수 있습니다." : detail?.title}
      bodyClassName="max-h-[74dvh]"
      footer={
        <>
          <div className="mr-auto flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onPreview}>
              <Eye className="size-3.5" strokeWidth={2} />
              미리보기
            </Button>
            {showRegistrations && (
              <Button type="button" variant="outline" size="sm" onClick={onQr}>
                <QrCode className="size-3.5" strokeWidth={2} />
                QR 코드
              </Button>
            )}
            {showRegistrations && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onDelete}
                disabled={isPending}
                className="text-gray-400 hover:bg-rose-50 hover:text-rose-600"
              >
                <Trash2 className="size-3.5" strokeWidth={2} />
                삭제
              </Button>
            )}
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={isPending}>
            취소
          </Button>
          <Button type="button" size="sm" onClick={onSave} disabled={isPending}>
            {isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Save className="size-3.5" strokeWidth={2} />
            )}
            {isNew ? "개설" : "저장"}
          </Button>
        </>
      }
    >
      <div
        className={cn(
          showRegistrations ? "grid gap-5 lg:grid-cols-[minmax(0,1fr)_420px]" : "space-y-5",
        )}
      >
        <div className="min-w-0">
          <GroupSeminarFormFields
            form={form}
            set={set}
            uploading={uploading}
            onUploadCover={onUploadCover}
          />
        </div>
        {showRegistrations && detail && (
          <RegistrationsPanel
            key={detail.id}
            detail={detail}
            isPending={isPending}
            onRegStatus={onRegStatus}
            onDepStatus={onDepStatus}
          />
        )}
      </div>
    </AdminDialog>
  );
}
