"use client";

// ============================================================================
// 학습지(PassageReport) → 학생 앱 과제 배포 훅 (U6)
//
// 학습지 카드/뷰어의 "학생에게 배포" 진입점이 공유하는 로직.
// - openAssign: 지문 id 로 최신 PRIME 보고서 id 를 조회해 AssignmentComposer
//   프리셋(kind:"WORKSHEET", refId=passageReportId)을 구성하고 모달을 연다.
//   보고서가 없는 지문(레거시 분석만)은 배포 불가 안내만 띄운다.
// - useWorksheetAssignCreatedToast: 배포 완료 토스트 + 과제 관리 딥링크.
// ============================================================================

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { ComposerPreset } from "@/components/study-assignments/assignment-composer";

/** 배포 완료 토스트 — 과제 관리 상세(?open=)로 이동하는 액션 포함. */
export function useWorksheetAssignCreatedToast() {
  const router = useRouter();
  return useCallback(
    (assignmentId: string) => {
      toast.success("학생 앱으로 배포했습니다.", {
        action: {
          label: "과제 관리",
          onClick: () =>
            router.push(`/director/students/assignments?open=${assignmentId}`),
        },
      });
    },
    [router],
  );
}

export function useWorksheetAssign() {
  const [open, setOpen] = useState(false);
  const [preset, setPreset] = useState<ComposerPreset | null>(null);
  /** 보고서 id 조회 중인 지문 id — 해당 카드 버튼에 스피너. */
  const [busyId, setBusyId] = useState<string | null>(null);
  const onCreated = useWorksheetAssignCreatedToast();

  const openAssign = useCallback(
    async (passage: { id: string; title: string }) => {
      if (busyId) return;
      setBusyId(passage.id);
      try {
        const res = await fetch(
          `/api/workbench/passage-reports/prime/${passage.id}`,
        );
        const j = (await res.json().catch(() => null)) as {
          report?: { meta?: { titleKo?: string } } | null;
          reportId?: string;
        } | null;
        const reportId = j?.reportId;
        if (!res.ok || !reportId || !j?.report) {
          toast.error("배포할 학습지 보고서를 찾을 수 없습니다.");
          return;
        }
        const reportTitle = j.report.meta?.titleKo?.trim() || passage.title;
        setPreset({
          kind: "WORKSHEET",
          content: { refId: reportId, title: reportTitle, meta: passage.title },
        });
        setOpen(true);
      } catch {
        toast.error("학습지 정보를 불러오지 못했습니다.");
      } finally {
        setBusyId(null);
      }
    },
    [busyId],
  );

  const close = useCallback(() => setOpen(false), []);

  return { open, close, preset, busyId, openAssign, onCreated };
}
