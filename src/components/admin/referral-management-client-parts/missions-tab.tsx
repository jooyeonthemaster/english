"use client";

import { useState, useTransition } from "react";
import { Target } from "lucide-react";
import { toast } from "sonner";
import {
  toggleMission,
  upsertMission,
  type MissionCatalogRow,
} from "@/actions/admin/referrals";
import { AdminHoverDetail } from "@/components/admin/hover-detail/admin-hover-detail";
import {
  AdminEmptyState,
  DataTable,
  DataTableBody,
  DataTableEmpty,
  DataTableHeader,
  ResultCount,
  Td,
  Th,
  Tr,
} from "@/components/admin/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { missionRowDetail } from "./mission-hover-detail";

/** 미션 관리 탭 — 보상 크레딧 인라인 수정 + 활성 스위치. */
export function MissionsTab({ missions }: { missions: MissionCatalogRow[] }) {
  return (
    <div className="space-y-4">
      <ResultCount total={missions.length} unit="개" />
      <DataTable minWidth={760}>
        <DataTableHeader>
          <Tr>
            <Th>미션</Th>
            <Th>카테고리</Th>
            <Th>주기</Th>
            <Th>보상 크레딧</Th>
            <Th align="right">상태</Th>
          </Tr>
        </DataTableHeader>
        <DataTableBody>
          {missions.length === 0 ? (
            <DataTableEmpty colSpan={5}>
              <AdminEmptyState icon={Target} title="등록된 미션이 없습니다" />
            </DataTableEmpty>
          ) : (
            missions.map((m) => <MissionRow key={m.id} mission={m} />)
          )}
        </DataTableBody>
      </DataTable>
    </div>
  );
}

function MissionRow({ mission }: { mission: MissionCatalogRow }) {
  const [pending, startTransition] = useTransition();
  const [reward, setReward] = useState(String(mission.rewardCredits));
  const dirty = reward.trim() !== String(mission.rewardCredits);

  function save() {
    const value = Number(reward);
    if (!Number.isInteger(value) || value < 0) {
      toast.error("보상은 0 이상의 정수여야 합니다.");
      return;
    }
    startTransition(async () => {
      const res = await upsertMission({
        id: mission.id,
        key: mission.key,
        title: mission.title,
        description: mission.description,
        category: mission.category,
        cadence: mission.cadence,
        rewardCredits: value,
        iconKey: mission.iconKey,
        actionUrl: mission.actionUrl,
        ctaLabel: mission.ctaLabel,
        sortOrder: mission.sortOrder,
        maxRewardPerMonth: mission.maxRewardPerMonth,
      });
      if (res.success) toast.success("미션을 저장했습니다.");
      else toast.error(res.error ?? "저장에 실패했습니다.");
    });
  }

  function onToggle() {
    startTransition(async () => {
      const res = await toggleMission(mission.id, !mission.isActive);
      if (res.success)
        toast.success(mission.isActive ? "미션을 비활성화했습니다." : "미션을 활성화했습니다.");
      else toast.error(res.error ?? "변경에 실패했습니다.");
    });
  }

  return (
    <AdminHoverDetail title={mission.title} detail={missionRowDetail(mission)}>
      <Tr clickable>
        <Td>
          <div className="font-medium text-gray-900">{mission.title}</div>
          <div className="mt-0.5 font-mono text-[11px] text-gray-400">{mission.key}</div>
        </Td>
        <Td muted>{mission.category}</Td>
        <Td muted>{mission.cadence}</Td>
        <Td>
          <div className="flex items-center gap-1.5">
            <Input
              type="number"
              value={reward}
              onChange={(e) => setReward(e.target.value)}
              disabled={pending}
              className="h-8 w-20 text-[13px] tabular-nums"
              aria-label={`${mission.title} 보상 크레딧`}
            />
            <Button size="sm" disabled={pending || !dirty} onClick={save}>
              저장
            </Button>
          </div>
        </Td>
        <Td align="right">
          <Switch
            checked={mission.isActive}
            onCheckedChange={onToggle}
            disabled={pending}
            aria-label={mission.isActive ? "미션 비활성화" : "미션 활성화"}
          />
        </Td>
      </Tr>
    </AdminHoverDetail>
  );
}
