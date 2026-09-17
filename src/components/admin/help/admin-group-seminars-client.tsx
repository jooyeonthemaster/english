"use client";

// ============================================================================
// 단체 세미나(/admin/group-seminars) — 세미나 클래스를 개설하고 신청자를 관리한다.
//   · 목록 → 행 클릭 = 편집 팝업(AdminDialog xl, 좌 폼 / 우 신청자), 미리보기·QR 은 그 위 팝업.
//   · 폼 필드·신청자 패널·미리보기는 admin-group-seminars-client-parts/ 로 분리. 서버 액션은 그대로.
// ============================================================================

import { useState, useTransition } from "react";
import { Plus, QrCode, UsersRound } from "lucide-react";
import { toast } from "sonner";
import {
  adminCreateGroupSeminar,
  adminDeleteGroupSeminar,
  adminGetGroupSeminarDetail,
  adminGetGroupSeminars,
  adminSetGroupSeminarRegistrationStatus,
  adminSetSeminarDepositStatus,
  adminUpdateGroupSeminar,
  type AdminGroupSeminarDetail,
  type AdminGroupSeminarListItem,
} from "@/actions/admin-help-center";
import {
  AdminEmptyState,
  DataTable,
  DataTableBody,
  DataTableEmpty,
  DataTableHeader,
  PageHeader,
  StatusBadge,
  Td,
  Th,
  Tr,
  useConfirm,
} from "@/components/admin/kit";
import { Button } from "@/components/ui/button";
import { GROUP_SEMINAR_STATUSES } from "@/lib/help-center";
import { cn, formatDateTime } from "@/lib/utils";
import { HelpStatusBadge } from "./help-status-badge";
import { SeminarQrDialog } from "./seminar-qr-dialog";
import {
  buildPayload,
  detailToForm,
  EMPTY_FORM,
  type DepositStatus,
  type FormState,
  type QrTarget,
  type RegStatus,
} from "./admin-group-seminars-client-parts/group-seminar-form";
import { SeminarEditorDialog } from "./admin-group-seminars-client-parts/seminar-editor-dialog";
import { SeminarPreviewDialog } from "./admin-group-seminars-client-parts/seminar-preview-dialog";

export function AdminGroupSeminarsClient({
  initialSeminars,
}: {
  initialSeminars: AdminGroupSeminarListItem[];
}) {
  const confirm = useConfirm();
  const [seminars, setSeminars] = useState(initialSeminars);
  const [selectedId, setSelectedId] = useState<string | "new" | null>(null);
  const [detail, setDetail] = useState<AdminGroupSeminarDetail | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [isPending, startTransition] = useTransition();
  const [qrTarget, setQrTarget] = useState<QrTarget | null>(null);
  const [uploading, setUploading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const isNew = selectedId === "new";

  function newSeminar() {
    setSelectedId("new");
    setDetail(null);
    setForm(EMPTY_FORM);
  }

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function uploadCover(file: File) {
    if (!file.type.startsWith("image/")) {
      toast.error("이미지 파일만 업로드할 수 있어요.");
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/admin/group-seminars/upload", { method: "POST", body: fd });
      const data = (await res.json().catch(() => null)) as { url?: string; error?: string } | null;
      if (!res.ok || !data?.url) {
        toast.error(data?.error ?? "이미지 업로드에 실패했습니다.");
        return;
      }
      set("coverImageUrl", data.url);
      toast.success("이미지를 업로드했어요.");
    } catch {
      toast.error("이미지 업로드에 실패했습니다.");
    } finally {
      setUploading(false);
    }
  }

  function refreshList() {
    return adminGetGroupSeminars().then(setSeminars);
  }

  function selectSeminar(id: string) {
    startTransition(async () => {
      const d = await adminGetGroupSeminarDetail(id);
      if (!d) {
        toast.error("세미나를 찾을 수 없습니다.");
        return;
      }
      setSelectedId(id);
      setDetail(d);
      setForm(detailToForm(d));
    });
  }

  function closeEditor() {
    setSelectedId(null);
    setDetail(null);
    setShowPreview(false);
  }

  function save() {
    if (!form.title.trim()) {
      toast.error("제목을 입력하세요.");
      return;
    }
    startTransition(async () => {
      try {
        const payload = buildPayload(form);
        if (isNew) {
          const res = await adminCreateGroupSeminar(payload);
          toast.success("세미나가 개설되었습니다.");
          await refreshList();
          selectSeminar(res.id);
        } else if (selectedId) {
          await adminUpdateGroupSeminar(selectedId, payload);
          toast.success("저장되었습니다.");
          await refreshList();
          const d = await adminGetGroupSeminarDetail(selectedId);
          if (d) setDetail(d);
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "오류가 발생했습니다.");
      }
    });
  }

  async function remove() {
    if (isNew || !selectedId) return;
    const ok = await confirm({
      title: "이 세미나를 삭제할까요?",
      description: "신청 내역도 함께 삭제되며 되돌릴 수 없습니다.",
      confirmLabel: "삭제",
      tone: "danger",
    });
    if (!ok) return;
    startTransition(async () => {
      try {
        await adminDeleteGroupSeminar(selectedId);
        toast.success("삭제되었습니다.");
        setSelectedId(null);
        setDetail(null);
        await refreshList();
      } catch {
        toast.error("오류가 발생했습니다.");
      }
    });
  }

  function setRegStatus(regId: string, status: RegStatus) {
    if (!selectedId || isNew) return;
    startTransition(async () => {
      try {
        await adminSetGroupSeminarRegistrationStatus(regId, status);
        const d = await adminGetGroupSeminarDetail(selectedId);
        if (d) setDetail(d);
        await refreshList();
      } catch {
        toast.error("오류가 발생했습니다.");
      }
    });
  }

  function setDepStatus(regId: string, status: DepositStatus) {
    if (!selectedId || isNew) return;
    startTransition(async () => {
      try {
        await adminSetSeminarDepositStatus(regId, status);
        const d = await adminGetGroupSeminarDetail(selectedId);
        if (d) setDetail(d);
        await refreshList();
      } catch {
        toast.error("오류가 발생했습니다.");
      }
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="단체 세미나"
        description="세미나 클래스를 개설하면 원장이 열람하고 신청할 수 있습니다"
        actions={
          <Button onClick={newSeminar}>
            <Plus className="size-4" strokeWidth={2} />새 세미나 개설
          </Button>
        }
      />

      <div className={cn("transition-opacity", isPending && "opacity-60")}>
      <DataTable minWidth={720}>
        <DataTableHeader>
          <Tr>
            <Th>상태</Th>
            <Th>세미나</Th>
            <Th>일정</Th>
            <Th align="right">신청</Th>
            <Th align="right">QR</Th>
          </Tr>
        </DataTableHeader>
        <DataTableBody>
          {seminars.length === 0 ? (
            <DataTableEmpty colSpan={5}>
              <AdminEmptyState
                icon={UsersRound}
                title="개설된 세미나가 없습니다"
                description="새 세미나를 개설하면 원장이 열람하고 신청할 수 있습니다."
              />
            </DataTableEmpty>
          ) : (
            seminars.map((s) => (
              <Tr key={s.id} clickable selected={selectedId === s.id} onClick={() => selectSeminar(s.id)}>
                <Td>
                  <HelpStatusBadge options={GROUP_SEMINAR_STATUSES} value={s.status} />
                </Td>
                <Td>
                  <div className="flex items-center gap-1.5">
                    <span className="truncate font-medium text-gray-900">{s.title}</span>
                    {s.publicEnabled && (
                      <StatusBadge status={{ label: "공개", tone: "blue" }} className="h-5 shrink-0" />
                    )}
                  </div>
                </Td>
                <Td muted className="tabular-nums">
                  {s.scheduledAt ? formatDateTime(new Date(s.scheduledAt)) : "일정 미정"}
                </Td>
                <Td align="right">
                  {s.registeredCount}
                  {s.capacity != null ? `/${s.capacity}` : ""}명
                  {s.guestCount > 0 ? (
                    <span className="ml-1 text-[11px] font-normal text-gray-400">
                      비회원 {s.guestCount}
                    </span>
                  ) : null}
                </Td>
                <Td align="right">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="모집 QR 코드"
                    title="모집 QR 코드"
                    className="text-gray-400 hover:bg-blue-50 hover:text-blue-600"
                    onClick={(e) => {
                      e.stopPropagation();
                      setQrTarget({ id: s.id, title: s.title, status: s.status });
                    }}
                  >
                    <QrCode className="size-4" strokeWidth={2} />
                  </Button>
                </Td>
              </Tr>
            ))
          )}
        </DataTableBody>
      </DataTable>

      {selectedId && (
        <SeminarEditorDialog
          open
          isNew={isNew}
          detail={detail}
          form={form}
          set={set}
          isPending={isPending}
          uploading={uploading}
          onUploadCover={(f) => void uploadCover(f)}
          onClose={closeEditor}
          onSave={save}
          onDelete={() => void remove()}
          onPreview={() => setShowPreview(true)}
          onQr={() =>
            detail && setQrTarget({ id: detail.id, title: detail.title, status: detail.status })
          }
          onRegStatus={setRegStatus}
          onDepStatus={setDepStatus}
        />
      )}

      {selectedId && (
        <SeminarPreviewDialog form={form} open={showPreview} onOpenChange={setShowPreview} />
      )}

      {qrTarget && <SeminarQrDialog seminar={qrTarget} onClose={() => setQrTarget(null)} />}
      </div>
    </div>
  );
}
