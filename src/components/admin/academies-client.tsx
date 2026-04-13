"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Search,
  Building2,
  ChevronRight,
  Users,
  UserCog,
  Coins,
  FileText,
} from "lucide-react";
import { cn, formatNumber } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface Academy {
  id: string;
  name: string;
  slug: string;
  status: string;
  createdAt: Date;
  subscription: {
    status: string;
    plan: {
      name: string;
      tier: string;
      monthlyCredits: number;
      monthlyPrice: number;
    };
  } | null;
  creditBalance: {
    balance: number;
    monthlyAllocation: number;
    lowCreditThreshold: number;
    totalConsumed: number;
  } | null;
  questionCount: number;
  staffCount: number;
  studentCount: number;
}

interface AcademiesClientProps {
  initialAcademies: Academy[];
}

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  ACTIVE: { label: "활성", className: "bg-emerald-50 text-emerald-600 border-0" },
  TRIAL: { label: "체험", className: "bg-blue-50 text-blue-600 border-0" },
  SUSPENDED: { label: "정지", className: "bg-red-50 text-red-600 border-0" },
  DEACTIVATED: { label: "비활성", className: "bg-gray-100 text-gray-500 border-0" },
};

export function AcademiesClient({ initialAcademies }: AcademiesClientProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const filtered = initialAcademies.filter((a) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      a.name.toLowerCase().includes(q) || a.slug.toLowerCase().includes(q)
    );
  });

  return (
    <>
      {/* Search */}
      <div className="flex items-center gap-3">
        <div className="relative w-[300px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400" />
          <Input
            placeholder="학원 검색..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9 text-[13px] bg-white"
          />
        </div>
        <span className="text-[12px] text-gray-400">
          전체 {initialAcademies.length}개 중 {filtered.length}개
        </span>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="text-[12px] text-gray-400 font-medium h-10 pl-5">
                학원명
              </TableHead>
              <TableHead className="text-[12px] text-gray-400 font-medium h-10">
                요금제
              </TableHead>
              <TableHead className="text-[12px] text-gray-400 font-medium h-10 text-center">
                크레딧
              </TableHead>
              <TableHead className="text-[12px] text-gray-400 font-medium h-10 text-center">
                문제
              </TableHead>
              <TableHead className="text-[12px] text-gray-400 font-medium h-10 text-center">
                학생
              </TableHead>
              <TableHead className="text-[12px] text-gray-400 font-medium h-10 text-center">
                직원
              </TableHead>
              <TableHead className="text-[12px] text-gray-400 font-medium h-10">
                상태
              </TableHead>
              <TableHead className="text-[12px] text-gray-400 font-medium h-10 pr-5 text-right">
                &nbsp;
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="text-center text-[13px] text-gray-400 py-16"
                >
                  <div className="flex flex-col items-center gap-2">
                    <Building2 className="size-8 text-gray-200" strokeWidth={1.5} />
                    <span>학원이 없습니다</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((academy) => {
                const sc =
                  STATUS_CONFIG[academy.status] || STATUS_CONFIG.ACTIVE;
                const isLow =
                  academy.creditBalance &&
                  academy.creditBalance.balance <=
                    academy.creditBalance.lowCreditThreshold;
                return (
                  <TableRow
                    key={academy.id}
                    className="hover:bg-gray-50/50 group cursor-pointer"
                  >
                    <TableCell className="pl-5">
                      <Link
                        href={`/admin/academies/${academy.id}`}
                        className="flex items-center gap-3"
                      >
                        <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-slate-100 group-hover:bg-blue-50 transition-colors">
                          <Building2
                            className="size-4 text-slate-500 group-hover:text-blue-500 transition-colors"
                            strokeWidth={1.7}
                          />
                        </div>
                        <div>
                          <span className="text-[13px] font-medium text-gray-800 group-hover:text-blue-600 transition-colors">
                            {academy.name}
                          </span>
                          <span className="block text-[11px] text-gray-400">
                            {academy.slug}
                          </span>
                        </div>
                      </Link>
                    </TableCell>
                    <TableCell className="text-[12px] text-gray-600">
                      {academy.subscription?.plan.name ?? (
                        <span className="text-gray-400">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <span
                          className={cn(
                            "text-[13px] font-medium",
                            isLow ? "text-red-600" : "text-gray-700",
                          )}
                        >
                          {formatNumber(academy.creditBalance?.balance ?? 0)}
                        </span>
                        <span className="text-[11px] text-gray-400">
                          / {formatNumber(academy.creditBalance?.monthlyAllocation ?? 0)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className="text-[13px] text-gray-600">
                        {formatNumber(academy.questionCount)}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1.5 text-[13px] text-gray-600">
                        <Users className="size-3.5 text-gray-400" strokeWidth={1.7} />
                        {formatNumber(academy.studentCount)}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1.5 text-[13px] text-gray-600">
                        <UserCog className="size-3.5 text-gray-400" strokeWidth={1.7} />
                        {formatNumber(academy.staffCount)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={`text-[11px] px-2 ${sc.className}`}
                      >
                        {sc.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="pr-5 text-right">
                      <Link href={`/admin/academies/${academy.id}`}>
                        <ChevronRight className="size-4 text-gray-300 group-hover:text-blue-400 transition-colors inline-block" />
                      </Link>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
