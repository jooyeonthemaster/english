"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  CONSULTATION_TYPES,
  CONSULTATION_CHANNELS,
  CONSULTATION_STATUSES,
  CONSULTATION_CATEGORIES,
} from "@/lib/constants";
import { formatDate, formatTime, truncate } from "@/lib/utils";
import {
  Phone,
  MapPin,
  Monitor,
  MessageCircle,
  ChevronDown,
  ChevronUp,
  UserPlus,
  GraduationCap,
  Users,
  ClipboardCheck,
} from "lucide-react";

interface ConsultationItem {
  id: string;
  type: string;
  channel: string | null;
  status: string;
  date: Date;
  content: string | null;
  category: string | null;
  followUpDate: Date | null;
  followUpNote: string | null;
  staff?: { id: string; name: string } | null;
}

interface ConsultationTimelineProps {
  consultations: ConsultationItem[];
  compact?: boolean;
}

const TYPE_ICON_MAP: Record<string, React.ElementType> = {
  NEW_INQUIRY: UserPlus,
  STUDENT: GraduationCap,
  PARENT: Users,
  LEVEL_TEST: ClipboardCheck,
};

const CHANNEL_ICON_MAP: Record<string, React.ElementType> = {
  PHONE: Phone,
  VISIT: MapPin,
  ONLINE: Monitor,
  KAKAO: MessageCircle,
};

function getLabel(
  list: readonly { value: string; label: string }[],
  value: string
) {
  return list.find((item) => item.value === value)?.label || value;
}

function getStatusConfig(status: string) {
  return (
    CONSULTATION_STATUSES.find((s) => s.value === status) ||
    CONSULTATION_STATUSES[0]
  );
}

export function ConsultationTimeline({
  consultations,
  compact = false,
}: ConsultationTimelineProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  if (consultations.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground text-sm">
        상담 기록이 없습니다
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Vertical line */}
      <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-border" />

      <div className="space-y-0">
        {consultations.map((item, index) => {
          const TypeIcon = TYPE_ICON_MAP[item.type] || GraduationCap;
          const ChannelIcon = item.channel
            ? CHANNEL_ICON_MAP[item.channel]
            : null;
          const statusConfig = getStatusConfig(item.status);
          const isExpanded = expandedIds.has(item.id);
          const hasContent = item.content && item.content.length > 0;

          return (
            <div key={item.id} className="relative pl-10 pb-6">
              {/* Timeline dot */}
              <div
                className={`absolute left-2.5 top-1 size-3.5 rounded-full border-2 border-background ${
                  index === 0 ? "bg-blue-500" : "bg-muted-foreground/30"
                }`}
              />

              {/* Content */}
              <div
                className={`${
                  compact ? "p-2" : "p-3"
                } rounded-lg border hover:shadow-sm transition-shadow`}
              >
                {/* Header */}
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <TypeIcon className="size-3.5 text-muted-foreground shrink-0" />
                    <span className="text-sm font-medium">
                      {getLabel(CONSULTATION_TYPES, item.type)}
                    </span>
                    <Badge
                      variant="secondary"
                      className={`text-[10px] h-5 ${statusConfig.color}`}
                    >
                      {statusConfig.label}
                    </Badge>
                    {item.category && (
                      <Badge variant="outline" className="text-[10px] h-5">
                        {getLabel(CONSULTATION_CATEGORIES, item.category)}
                      </Badge>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {formatDate(item.date)} {formatTime(item.date)}
                  </span>
                </div>

                {/* Meta */}
                <div className="flex items-center gap-3 text-xs text-muted-foreground mb-2">
                  {item.staff && <span>상담자: {item.staff.name}</span>}
                  {ChannelIcon && (
                    <span className="flex items-center gap-1">
                      <ChannelIcon className="size-3" />
                      {item.channel && getLabel(CONSULTATION_CHANNELS, item.channel)}
                    </span>
                  )}
                </div>

                {/* Content Preview / Full */}
                {hasContent && (
                  <div>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                      {isExpanded
                        ? item.content
                        : truncate(item.content!, compact ? 60 : 120)}
                    </p>
                    {item.content!.length > (compact ? 60 : 120) && (
                      <button
                        onClick={() => toggleExpand(item.id)}
                        className="text-xs text-blue-500 hover:text-blue-600 mt-1 flex items-center gap-0.5"
                      >
                        {isExpanded ? (
                          <>
                            접기 <ChevronUp className="size-3" />
                          </>
                        ) : (
                          <>
                            더보기 <ChevronDown className="size-3" />
                          </>
                        )}
                      </button>
                    )}
                  </div>
                )}

                {/* Follow-up */}
                {item.followUpDate && (
                  <div className="mt-2 pt-2 border-t text-xs text-amber-600 bg-amber-50 -mx-3 -mb-3 px-3 py-2 rounded-b-lg">
                    후속 조치: {formatDate(item.followUpDate)}
                    {item.followUpNote && ` - ${item.followUpNote}`}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
