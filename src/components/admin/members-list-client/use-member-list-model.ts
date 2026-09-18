"use client";

// 회원 목록 파생 데이터 — 필터·정렬·학원 묶기·옵션·카운트를 메모해 화면에 넘긴다.

import { useMemo } from "react";
import type { MemberListItem } from "@/actions/admin-members";
import type { OperationalFilters } from "./filter-model";
import {
  countMembers,
  filterMembers,
  groupByAcademy,
  sortMembers,
  type ClientFilters,
} from "./member-list-model";
import type { AcademyOption } from "./move-member-modal";

export function useMemberListModel(
  members: MemberListItem[],
  filters: ClientFilters,
  op: OperationalFilters,
  searchQuery: string,
) {
  const filtered = useMemo(
    () => filterMembers(members, filters, op, searchQuery),
    [members, filters, op, searchQuery],
  );

  const sorted = useMemo(
    () => sortMembers(filtered, filters.sortKey, filters.sortOrder),
    [filtered, filters.sortKey, filters.sortOrder],
  );

  const academyGroups = useMemo(() => groupByAcademy(sorted), [sorted]);

  const totalAcademies = useMemo(
    () => new Set(members.map((m) => m.academy.id)).size,
    [members],
  );

  // 학원 이동 모달의 대상 학원 후보 — 로드된 회원의 소속 학원(중복 제거).
  const academyOptions = useMemo<AcademyOption[]>(() => {
    const map = new Map<string, AcademyOption>();
    for (const m of members) {
      if (!map.has(m.academy.id)) {
        map.set(m.academy.id, { id: m.academy.id, name: m.academy.name, slug: m.academy.slug });
      }
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "ko"));
  }, [members]);

  // academyId → 대표 원장 memberId(일괄 조정 대상, 학원당 1건만 적용).
  const academyToRep = useMemo(
    () => new Map(academyGroups.map((g) => [g.academyId, g.members[0]?.id])),
    [academyGroups],
  );

  const counts = useMemo(() => countMembers(members), [members]);

  // 상세필터 구입 상품 옵션 — 목록에 실제 존재하는 "최근 구입 상품명"만 노출.
  const { productOptions, hasNoPurchaseMembers } = useMemo(() => {
    const names = new Set<string>();
    let noPurchase = false;
    for (const m of members) {
      if (m.latestPurchase?.name) names.add(m.latestPurchase.name);
      else noPurchase = true;
    }
    return {
      productOptions: [...names].sort((a, b) => a.localeCompare(b, "ko")),
      hasNoPurchaseMembers: noPurchase,
    };
  }, [members]);

  return {
    sorted,
    academyGroups,
    totalAcademies,
    academyOptions,
    academyToRep,
    counts,
    productOptions,
    hasNoPurchaseMembers,
  };
}
