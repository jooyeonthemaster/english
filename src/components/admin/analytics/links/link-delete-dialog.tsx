"use client";

// 추적 링크 삭제·비활성 확인창 — 상태에 따라 세 갈래(D9).
//  ① 클릭 0            → 실삭제
//  ② 클릭 있음 · 활성  → 비활성 전환(통계 보존)
//  ③ 클릭 있음 · 비활성 → 이미 꺼진 링크. 할 일이 없으므로 안내만 하고 닫는다
//     (같은 확인창을 다시 띄우면 운영자가 「삭제가 안 된다」고 오해해 반복해서 누른다).

import { Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { TrackedLinkRow } from "@/lib/analytics/reports/links";
import { fmtInt } from "@/lib/analytics/format";

export type DeleteMode = "delete" | "deactivate" | "already-inactive";

export function deleteMode(link: TrackedLinkRow): DeleteMode {
  if (link.totalClicks === 0) return "delete";
  return link.isActive ? "deactivate" : "already-inactive";
}

const TITLES: Record<DeleteMode, string> = {
  delete: "이 링크를 삭제할까요?",
  deactivate: "이 링크를 비활성으로 전환할까요?",
  "already-inactive": "이미 꺼진 링크입니다",
};

export function LinkDeleteDialog({
  link,
  pending,
  onCancel,
  onConfirm,
}: {
  link: TrackedLinkRow | null;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const mode = link ? deleteMode(link) : "delete";
  const clicks = link ? fmtInt(link.totalClicks) : "0";
  return (
    <AlertDialog open={!!link} onOpenChange={(o) => !o && !pending && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{TITLES[mode]}</AlertDialogTitle>
          <AlertDialogDescription>
            {mode === "delete" &&
              `「${link?.label ?? ""}」을(를) 완전히 삭제합니다. 이미 배포한 곳이 있다면 그 주소는 홈으로 이동합니다.`}
            {mode === "deactivate" &&
              `「${link?.label ?? ""}」에는 클릭 ${clicks}회가 기록돼 있어 통계 보존을 위해 삭제 대신 비활성으로 바꿉니다. 이후 이 주소는 홈으로 이동합니다.`}
            {mode === "already-inactive" &&
              `「${link?.label ?? ""}」은(는) 이미 꺼져 있어 방문자는 홈으로 이동합니다. 클릭 ${clicks}회가 기록돼 있어 통계 보존을 위해 기록은 남습니다 — 목록에서만 접히고 완전 삭제는 되지 않습니다.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          {mode === "already-inactive" ? (
            <AlertDialogCancel>확인</AlertDialogCancel>
          ) : (
            <>
              <AlertDialogCancel disabled={pending}>취소</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                disabled={pending}
                onClick={(e) => {
                  e.preventDefault();
                  onConfirm();
                }}
              >
                {pending && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
                {mode === "deactivate" ? "비활성으로 전환" : "삭제"}
              </AlertDialogAction>
            </>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
