"use client";

import { Mail, UserCog } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { AcademyDetailData } from "./types";

type StaffMember = AcademyDetailData["staff"][number];

export function StaffList({ staff }: { staff: StaffMember[] }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-50">
        <UserCog className="size-4 text-gray-400" strokeWidth={1.8} />
        <h3 className="text-[14px] font-semibold text-gray-800">직원 목록</h3>
      </div>
      <div className="p-3 space-y-1">
        {staff.length === 0 ? (
          <p className="text-center text-[13px] text-gray-400 py-6">
            직원이 없습니다
          </p>
        ) : (
          staff.map((member) => (
            <div
              key={member.id}
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-slate-100 text-slate-600 text-[11px] font-bold">
                {member.name.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-medium text-gray-800 truncate">
                    {member.name}
                  </span>
                  <Badge
                    variant="secondary"
                    className={cn(
                      "text-[9px] px-1.5 border-0",
                      member.role === "DIRECTOR"
                        ? "bg-blue-50 text-blue-600"
                        : "bg-gray-100 text-gray-500",
                    )}
                  >
                    {member.role === "DIRECTOR" ? "원장" : "강사"}
                  </Badge>
                  {!member.isActive && (
                    <Badge
                      variant="secondary"
                      className="text-[9px] px-1.5 border-0 bg-red-50 text-red-500"
                    >
                      비활성
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-1 mt-0.5">
                  <Mail className="size-3 text-gray-300" />
                  <span className="text-[11px] text-gray-400 truncate">
                    {member.email}
                  </span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
