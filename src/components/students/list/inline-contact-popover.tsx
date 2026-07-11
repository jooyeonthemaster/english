"use client";

// ============================================================================
// 로스터 연락처 셀 팝오버 — inline-device-popover 미러(slate/blue 언어).
//
// PII 절제: 테이블 셀에는 연락처 "건수"만 보여주고, 번호는 팝오버를 열어야
// 노출된다(어깨너머 노출 최소화). 데이터는 행이 이미 들고 있는
// student.phone + parentLinks — 추가 서버 조회 0. 각 행에 tel: 발신 + 복사.
// ============================================================================

import { Copy, Phone } from "lucide-react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { HubParentLink } from "@/app/(director)/director/tutor/_components/types";

interface ContactRow {
  key: string;
  /** "학생" | 학부모 관계(어머니/아버지 등, 없으면 "학부모") */
  roleLabel: string;
  name: string;
  phone: string;
}

async function copyPhone(phone: string) {
  try {
    await navigator.clipboard.writeText(phone);
    toast.success("전화번호를 복사했습니다.");
  } catch {
    // http 로컬 등 clipboard API 불가 환경 폴백
    try {
      const ta = document.createElement("textarea");
      ta.value = phone;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      toast.success("전화번호를 복사했습니다.");
    } catch {
      toast.error("복사에 실패했습니다.");
    }
  }
}

export function InlineContactPopover({
  studentName,
  phone,
  parentLinks,
}: {
  studentName: string;
  phone: string | null;
  parentLinks: HubParentLink[];
}) {
  const rows: ContactRow[] = [];
  if (phone) {
    rows.push({ key: "self", roleLabel: "학생", name: studentName, phone });
  }
  for (const link of parentLinks) {
    if (!link.parent.phone) continue;
    rows.push({
      key: link.parent.id,
      roleLabel: link.parent.relation || "학부모",
      name: link.parent.name,
      phone: link.parent.phone,
    });
  }

  if (rows.length === 0) {
    return <span className="text-[11.5px] text-slate-300">미등록</span>;
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          aria-label={`${studentName} 연락처 ${rows.length}건 — 목록 열기`}
          className="-mx-1.5 inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 transition-colors hover:bg-slate-100"
        >
          <Phone className="size-3.5 shrink-0 text-slate-400" aria-hidden />
          <span className="text-[12px] font-semibold text-slate-600 tabular-nums">
            {rows.length}건
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-72 rounded-xl border-slate-200 p-0 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-slate-100 px-3 py-2.5">
          <p className="text-sm font-bold text-slate-900">연락처</p>
          <p className="mt-0.5 text-[11px] font-medium text-slate-400">{studentName}</p>
        </div>

        <div className="max-h-64 space-y-1.5 overflow-y-auto p-2">
          {rows.map((row) => (
            <div
              key={row.key}
              className="flex items-center gap-2.5 rounded-lg border border-slate-100 px-2.5 py-2"
            >
              <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10.5px] font-bold text-slate-500">
                {row.roleLabel}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-bold text-slate-800">{row.name}</p>
                <p className="truncate font-mono text-[11px] font-medium text-slate-400">
                  {row.phone}
                </p>
              </div>
              <a
                href={`tel:${row.phone.replace(/[^0-9+]/g, "")}`}
                onClick={(e) => e.stopPropagation()}
                aria-label={`${row.name}에게 전화 걸기`}
                className="flex size-7 shrink-0 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-blue-50 hover:text-blue-600"
              >
                <Phone className="size-3.5" aria-hidden />
              </a>
              <button
                type="button"
                onClick={() => copyPhone(row.phone)}
                aria-label={`${row.name} 전화번호 복사`}
                className="flex size-7 shrink-0 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
              >
                <Copy className="size-3.5" aria-hidden />
              </button>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
