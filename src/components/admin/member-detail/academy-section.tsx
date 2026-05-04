import Link from "next/link";
import {
  Building2,
  ExternalLink,
  GraduationCap,
  FileText,
  HelpCircle,
  ClipboardList,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  CountChip,
  DefList,
  DefRow,
  SectionCard,
} from "@/components/admin/member-detail/atoms";
import {
  academyStatusClass,
  academyStatusLabel,
} from "@/components/admin/member-detail/badges";
import type { MemberDetail } from "@/actions/admin-members";

function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

export function AcademySection({ academy }: { academy: MemberDetail["academy"] }) {
  return (
    <SectionCard title="학원" icon={<Building2 />}>
      <DefList>
        <DefRow
          label="학원명"
          value={
            <Link
              href={`/admin/academies/${academy.id}`}
              className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30 rounded"
            >
              {academy.name}
              <ExternalLink
                className="size-3 shrink-0"
                strokeWidth={2}
                aria-hidden
              />
            </Link>
          }
        />
        <DefRow
          label="식별자"
          value={
            <span className="font-mono text-[11px] text-gray-500">
              /{academy.slug}
            </span>
          }
        />
        <DefRow
          label="상태"
          value={
            <Badge
              variant="secondary"
              className={cn(
                "text-[11px] font-medium border-0 px-2",
                academyStatusClass(academy.status),
              )}
            >
              {academyStatusLabel(academy.status)}
            </Badge>
          }
        />
        <DefRow label="주소" value={academy.address ?? "—"} />
        <DefRow
          label="개설일"
          value={
            <span className="tabular-nums">{formatDate(academy.createdAt)}</span>
          }
        />
      </DefList>

      <div className="mt-3 pt-3 border-t border-gray-50 grid grid-cols-2 gap-2">
        <CountChip
          icon={<GraduationCap className="size-3.5" strokeWidth={1.8} />}
          label="학생"
          value={academy.counts.students}
        />
        <CountChip
          icon={<FileText className="size-3.5" strokeWidth={1.8} />}
          label="지문"
          value={academy.counts.passages}
        />
        <CountChip
          icon={<HelpCircle className="size-3.5" strokeWidth={1.8} />}
          label="문제"
          value={academy.counts.questions}
        />
        <CountChip
          icon={<ClipboardList className="size-3.5" strokeWidth={1.8} />}
          label="시험"
          value={academy.counts.exams}
        />
      </div>
    </SectionCard>
  );
}
