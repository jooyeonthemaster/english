"use client";

// ============================================================================
// 회원(원장)을 다른 학원으로 강제 재그룹핑하는 모달. SUPER_ADMIN 전용.
// 크레딧은 학원 단위 지갑이라 이동 후 대상 학원의 잔액을 공유하게 되고,
// 기존 콘텐츠는 원 학원에 남는다는 점을 경고로 안내한다.
// ============================================================================

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, Search, Building2, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
      .filter((a) =>
        q ? `${a.name} ${a.slug}`.toLowerCase().includes(q) : true,
      )
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
      toast.success(
        `${res.memberName} 회원을 '${res.toAcademyName}' 학원으로 이동했습니다`,
      );
      reset();
      onOpenChange(false);
      onDone();
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="text-[16px] font-semibold text-gray-900">
            회원 학원 이동
          </DialogTitle>
          <DialogDescription className="text-[12px] text-gray-500">
            선택한 회원을 다른 학원으로 강제 재그룹핑합니다.
          </DialogDescription>
        </DialogHeader>

        {member && (
          <div className="space-y-4 pt-1">
            {/* 이동 요약 */}
            <div className="flex items-center gap-2 rounded-lg bg-gray-50 border border-gray-100 px-3 py-2.5 text-[12px]">
              <span className="font-medium text-gray-800">{member.name}</span>
              <span className="text-gray-400">·</span>
              <span className="truncate text-gray-500">{member.academyName}</span>
              <ArrowRight className="size-3.5 shrink-0 text-gray-400" strokeWidth={2} />
              <span className="truncate font-medium text-blue-600">
                {target ? target.name : "학원 선택"}
              </span>
            </div>

            {/* 학원 검색 + 선택 */}
            <div className="space-y-1.5">
              <div className="relative">
                <Search
                  className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400"
                  strokeWidth={1.8}
                  aria-hidden
                />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="이동할 학원 검색 (이름·슬러그)"
                  className="pl-9 h-9 text-[13px]"
                  aria-label="학원 검색"
                />
              </div>
              <div className="max-h-[240px] overflow-y-auto rounded-lg border border-gray-100">
                {candidates.length === 0 ? (
                  <p className="py-8 text-center text-[12.5px] text-gray-400">
                    해당하는 학원이 없습니다
                  </p>
                ) : (
                  <ul className="divide-y divide-gray-50">
                    {candidates.map((a) => (
                      <li key={a.id}>
                        <button
                          type="button"
                          onClick={() => setTargetId(a.id)}
                          className={cn(
                            "flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors",
                            targetId === a.id ? "bg-blue-50" : "hover:bg-gray-50",
                          )}
                        >
                          <Building2
                            className={cn(
                              "size-4 shrink-0",
                              targetId === a.id ? "text-blue-600" : "text-gray-400",
                            )}
                            strokeWidth={1.8}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] text-gray-800">
                              {a.name}
                            </span>
                            <span className="block truncate text-[11px] text-gray-400">
                              /{a.slug}
                            </span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* 경고 */}
            <div className="flex items-start gap-2 rounded-md bg-amber-50 border border-amber-100 px-3 py-2">
              <AlertTriangle
                className="size-4 shrink-0 text-amber-500 mt-px"
                strokeWidth={2}
                aria-hidden
              />
              <p className="text-[11.5px] leading-relaxed text-amber-800">
                이동하면 이 회원은 대상 학원의 크레딧·구독을 공유하게 됩니다. 기존
                학원에서 만든 지문·문제 등 콘텐츠는 원 학원에 그대로 남습니다.
              </p>
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-md bg-rose-50 border border-rose-100 px-3 py-2">
                <AlertTriangle
                  className="size-4 text-rose-500 shrink-0 mt-px"
                  strokeWidth={2}
                  aria-hidden
                />
                <p className="text-[12px] text-rose-700">{error}</p>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="pt-2 gap-2 sm:gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => handleOpenChange(false)}
            disabled={isPending}
            className="text-[13px]"
          >
            취소
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={!targetId || isPending}
            className="text-[13px] min-w-[90px] bg-blue-600 hover:bg-blue-700"
          >
            {isPending ? (
              <>
                <Loader2 className="size-3.5 mr-1.5 animate-spin" strokeWidth={2} aria-hidden />
                이동 중
              </>
            ) : (
              "이동"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
