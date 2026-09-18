"use client";

// ============================================================================
// 회원(원장)을 다른 학원으로 강제 재그룹핑하는 모달. SUPER_ADMIN 전용.
// 크레딧은 학원 단위 지갑이라 이동 후 대상 학원의 잔액을 공유하게 되고,
// 기존 콘텐츠는 원 학원에 남는다는 점을 경고로 안내한다.
// ============================================================================

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, Building2, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { AdminDialog, SearchInput } from "@/components/admin/kit";
import { moveMemberAcademy } from "@/actions/admin-members";

export interface AcademyOption {
  id: string;
  name: string;
  slug: string;
}

interface MoveMemberModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 이동할 회원 */
  member: { id: string; name: string; academyId: string; academyName: string } | null;
  /** 이동 대상 후보 학원 목록(현재 소속 제외) */
  academyOptions: AcademyOption[];
  onDone: () => void;
}

export function MoveMemberModal({
  open,
  onOpenChange,
  member,
  academyOptions,
  onDone,
}: MoveMemberModalProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [targetId, setTargetId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const candidates = useMemo(() => {
    const q = search.trim().toLowerCase();
    return academyOptions
      .filter((a) => a.id !== member?.academyId)
      .filter((a) => (q ? `${a.name} ${a.slug}`.toLowerCase().includes(q) : true))
      .slice(0, 50);
  }, [academyOptions, member?.academyId, search]);

  const target = academyOptions.find((a) => a.id === targetId) ?? null;

  function reset() {
    setSearch("");
    setTargetId(null);
    setError(null);
  }

  function handleOpenChange(next: boolean) {
    if (isPending) return;
    if (!next) reset();
    onOpenChange(next);
  }

  function handleSubmit() {
    if (!member || !targetId || isPending) return;
    setError(null);
    startTransition(async () => {
      const res = await moveMemberAcademy({
        memberId: member.id,
        targetAcademyId: targetId,
      });
      if (!res.success) {
        setError(res.error);
        return;
      }
      toast.success(`${res.memberName} 회원을 '${res.toAcademyName}' 학원으로 이동했습니다`);
      reset();
      onOpenChange(false);
      onDone();
      router.refresh();
    });
  }

  return (
    <AdminDialog
      open={open}
      onOpenChange={handleOpenChange}
      size="sm"
      title="회원 학원 이동"
      description="선택한 회원을 다른 학원으로 강제 재그룹핑합니다."
      footer={
        <>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => handleOpenChange(false)}
            disabled={isPending}
          >
            취소
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleSubmit}
            disabled={!targetId || isPending}
            className="min-w-[90px]"
          >
            {isPending ? (
              <>
                <Loader2 className="size-3.5 animate-spin" strokeWidth={2} aria-hidden />
                이동 중
              </>
            ) : (
              "이동"
            )}
          </Button>
        </>
      }
    >
      {member && (
        <div className="space-y-4">
          {/* 이동 요약 */}
          <div className="flex items-center gap-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5 text-[12px]">
            <span className="font-medium text-gray-800">{member.name}</span>
            <span className="text-gray-400">·</span>
            <span className="truncate text-gray-500">{member.academyName}</span>
            <ArrowRight className="size-3.5 shrink-0 text-gray-400" strokeWidth={2} aria-hidden />
            <span className="truncate font-medium text-blue-600">
              {target ? target.name : "학원 선택"}
            </span>
          </div>

          {/* 학원 검색 + 선택 */}
          <div className="space-y-1.5">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="이동할 학원 검색 (이름·슬러그)"
              ariaLabel="학원 검색"
              className="sm:w-full"
            />
            <div className="max-h-[240px] overflow-y-auto rounded-lg border border-gray-100">
              {candidates.length === 0 ? (
                <p className="py-8 text-center text-[12px] text-gray-400">해당하는 학원이 없습니다</p>
              ) : (
                <ul className="divide-y divide-gray-50">
                  {candidates.map((a) => (
                    <li key={a.id}>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => setTargetId(a.id)}
                        aria-pressed={targetId === a.id}
                        className={cn(
                          "h-auto w-full justify-start gap-2.5 rounded-none px-3 py-2 text-left font-normal",
                          targetId === a.id && "bg-blue-50 hover:bg-blue-50",
                        )}
                      >
                        <Building2
                          className={cn(
                            "size-4 shrink-0",
                            targetId === a.id ? "text-blue-600" : "text-gray-400",
                          )}
                          strokeWidth={1.8}
                          aria-hidden
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] text-gray-800">{a.name}</span>
                          <span className="block truncate text-[11px] text-gray-400">/{a.slug}</span>
                        </span>
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* 경고 */}
          <div className="flex items-start gap-2 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2">
            <AlertTriangle className="mt-px size-4 shrink-0 text-amber-500" strokeWidth={2} aria-hidden />
            <p className="text-[12px] leading-relaxed text-amber-800">
              이동하면 이 회원은 대상 학원의 크레딧·구독을 공유하게 됩니다. 기존 학원에서 만든
              지문·문제 등 콘텐츠는 원 학원에 그대로 남습니다.
            </p>
          </div>

          {error && <p className="text-[12px] text-rose-600">{error}</p>}
        </div>
      )}
    </AdminDialog>
  );
}
