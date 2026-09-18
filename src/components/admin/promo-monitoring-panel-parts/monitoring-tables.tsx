"use client";

// 프로모션 모니터링 — 프로모션·번들별 / 학원별 / 회원별 / 최근 활동 표.

import { Activity } from "lucide-react";
import type { PromoMonitoringPayload } from "@/actions/admin/credit-promotion-monitoring";
import { formatDate } from "@/lib/utils";
import {
  AdminEmptyState,
  DataTable,
  DataTableBody,
  DataTableEmpty,
  DataTableHeader,
  StatusBadge,
  Td,
  Th,
  Tr,
} from "@/components/admin/kit";

export const fmt = (n: number) => n.toLocaleString("ko-KR");

export function timeAgo(iso: string | null): string {
  if (!iso) return "-";
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "방금";
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  return formatDate(iso);
}

function EmptyRow({ colSpan, text }: { colSpan: number; text: string }) {
  return (
    <DataTableEmpty colSpan={colSpan}>
      <AdminEmptyState compact icon={Activity} title={text} />
    </DataTableEmpty>
  );
}

const CLAIM_BADGE = { label: "혜택받기", tone: "emerald" } as const;
const VIEW_BADGE = { label: "방문", tone: "blue" } as const;
const PROMO_BADGE = { label: "프로모션", tone: "gray" } as const;
const BUNDLE_BADGE = { label: "번들", tone: "violet" } as const;

/** 프로모션·번들별 현황 */
export function TargetTable({ data }: { data: PromoMonitoringPayload }) {
  const empty = data.perPromotion.length === 0 && data.perBundle.length === 0;
  return (
    <DataTable bare minWidth={640}>
      <DataTableHeader>
        <Tr>
          <Th>대상</Th>
          <Th align="right">방문</Th>
          <Th align="right">혜택받기</Th>
          <Th align="right">방문 학원</Th>
          <Th align="right">최근</Th>
        </Tr>
      </DataTableHeader>
      <DataTableBody>
        {empty ? (
          <EmptyRow colSpan={5} text="이 기간에 집계된 프로모션·번들 활동이 없습니다." />
        ) : (
          <>
            {data.perPromotion.map((p) => (
              <Tr key={`promo-${p.promotionId}`}>
                <Td>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-800">{p.name}</span>
                    <StatusBadge status={PROMO_BADGE} />
                  </div>
                  {p.productName && (
                    <div className="text-[11px] text-gray-400">{p.productName}</div>
                  )}
                </Td>
                <Td align="right" className="text-blue-600">{fmt(p.views)}</Td>
                <Td align="right" className="text-emerald-600">{fmt(p.claims)}</Td>
                <Td align="right">{fmt(p.uniqueAcademies)}</Td>
                <Td align="right" muted>{timeAgo(p.lastEventAt)}</Td>
              </Tr>
            ))}
            {data.perBundle.map((b) => (
              <Tr key={`bundle-${b.bundleId}`}>
                <Td>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-800">{b.name}</span>
                    <StatusBadge status={BUNDLE_BADGE} />
                  </div>
                  {b.slug && <div className="text-[11px] text-gray-400">/b/{b.slug}</div>}
                </Td>
                <Td align="right" className="text-blue-600">{fmt(b.views)}</Td>
                <Td align="right" className="text-emerald-600">{fmt(b.claims)}</Td>
                <Td align="right">{fmt(b.uniqueAcademies)}</Td>
                <Td align="right" muted>{timeAgo(b.lastEventAt)}</Td>
              </Tr>
            ))}
          </>
        )}
      </DataTableBody>
    </DataTable>
  );
}

/** 학원별 클릭 */
export function AcademyTable({ rows }: { rows: PromoMonitoringPayload["perAcademy"] }) {
  return (
    <DataTable bare stickyHeader maxHeight={420}>
      <DataTableHeader>
        <Tr>
          <Th>학원</Th>
          <Th align="right">방문</Th>
          <Th align="right">혜택</Th>
          <Th align="right">최근</Th>
        </Tr>
      </DataTableHeader>
      <DataTableBody>
        {rows.length === 0 ? (
          <EmptyRow colSpan={4} text="이 기간에 로그인 상태로 링크를 눌러본 학원이 없습니다." />
        ) : (
          rows.map((a) => (
            <Tr key={a.academyId}>
              <Td>
                <div className="font-semibold text-gray-800">{a.academyName}</div>
                <div className="text-[11px] text-gray-400">방문 회원 {fmt(a.members)}명</div>
              </Td>
              <Td align="right" className="text-blue-600">{fmt(a.views)}</Td>
              <Td align="right" className="text-emerald-600">{fmt(a.claims)}</Td>
              <Td align="right" muted>{timeAgo(a.lastEventAt)}</Td>
            </Tr>
          ))
        )}
      </DataTableBody>
    </DataTable>
  );
}

/** 회원별 클릭 */
export function MemberTable({ rows }: { rows: PromoMonitoringPayload["perMember"] }) {
  return (
    <DataTable bare stickyHeader maxHeight={420}>
      <DataTableHeader>
        <Tr>
          <Th>회원</Th>
          <Th align="right">방문</Th>
          <Th align="right">혜택</Th>
          <Th align="right">최근</Th>
        </Tr>
      </DataTableHeader>
      <DataTableBody>
        {rows.length === 0 ? (
          <EmptyRow colSpan={4} text="이 기간에 로그인 상태로 링크를 눌러본 회원이 없습니다." />
        ) : (
          rows.map((m) => (
            <Tr key={m.staffId}>
              <Td>
                <div className="font-semibold text-gray-800">{m.name}</div>
                <div className="text-[11px] text-gray-400">{m.academyName}</div>
              </Td>
              <Td align="right" className="text-blue-600">{fmt(m.views)}</Td>
              <Td align="right" className="text-emerald-600">{fmt(m.claims)}</Td>
              <Td align="right" muted>{timeAgo(m.lastEventAt)}</Td>
            </Tr>
          ))
        )}
      </DataTableBody>
    </DataTable>
  );
}

/** 최근 활동 */
export function RecentActivityTable({ rows }: { rows: PromoMonitoringPayload["recent"] }) {
  return (
    <DataTable bare>
      <DataTableHeader>
        <Tr>
          <Th>구분</Th>
          <Th>대상</Th>
          <Th>회원</Th>
          <Th align="right">시간</Th>
        </Tr>
      </DataTableHeader>
      <DataTableBody>
        {rows.length === 0 ? (
          <EmptyRow colSpan={4} text="이 기간에 최근 활동이 없습니다." />
        ) : (
          rows.map((r) => (
            <Tr key={r.id}>
              <Td>
                <StatusBadge status={r.kind === "CLAIM" ? CLAIM_BADGE : VIEW_BADGE} />
              </Td>
              <Td className="font-medium text-gray-800">{r.label}</Td>
              <Td muted>{r.who}</Td>
              <Td align="right" muted>{timeAgo(r.createdAt)}</Td>
            </Tr>
          ))
        )}
      </DataTableBody>
    </DataTable>
  );
}
