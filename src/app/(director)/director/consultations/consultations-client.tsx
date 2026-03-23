"use client";

import { useState, useTransition, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ConsultationFormDialog } from "@/components/consultations/consultation-form-dialog";
import { ConsultationTimeline } from "@/components/consultations/consultation-timeline";
import {
  getConsultations,
  deleteConsultation,
  getUpcomingFollowUps,
} from "@/actions/consultations";
import {
  CONSULTATION_TYPES,
  CONSULTATION_STATUSES,
  CONSULTATION_CHANNELS,
} from "@/lib/constants";
import { formatDate, formatTime, truncate } from "@/lib/utils";
import {
  Plus,
  List,
  Calendar,
  Trash2,
  Pencil,
  Bell,
  UserPlus,
  GraduationCap,
  Users,
  ClipboardCheck,
  Filter,
} from "lucide-react";
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  addMonths,
  subMonths,
  isSameMonth,
  isToday,
} from "date-fns";
import { ko } from "date-fns/locale";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight } from "lucide-react";

type ConsultationItem = Awaited<ReturnType<typeof getConsultations>>[number];
type FollowUp = Awaited<ReturnType<typeof getUpcomingFollowUps>>[number];

const TYPE_ICON_MAP: Record<string, React.ElementType> = {
  NEW_INQUIRY: UserPlus,
  STUDENT: GraduationCap,
  PARENT: Users,
  LEVEL_TEST: ClipboardCheck,
};

function getTypeLabel(type: string) {
  return CONSULTATION_TYPES.find((t) => t.value === type)?.label || type;
}

function getStatusConfig(status: string) {
  return (
    CONSULTATION_STATUSES.find((s) => s.value === status) ||
    CONSULTATION_STATUSES[0]
  );
}

function getChannelLabel(channel: string | null) {
  if (!channel) return "-";
  return CONSULTATION_CHANNELS.find((c) => c.value === channel)?.label || channel;
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

interface ConsultationsClientProps {
  initialConsultations: ConsultationItem[];
  initialFollowUps: FollowUp[];
}

export default function ConsultationsClient({ initialConsultations, initialFollowUps }: ConsultationsClientProps) {
  const [consultations, setConsultations] = useState<ConsultationItem[]>(initialConsultations);
  const [followUps, setFollowUps] = useState<FollowUp[]>(initialFollowUps);
  const [view, setView] = useState<"list" | "calendar">("list");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<ConsultationItem | null>(null);
  const [isPending, startTransition] = useTransition();
  const [calDate, setCalDate] = useState(new Date());

  function loadData() {
    startTransition(async () => {
      const [data, followUpData] = await Promise.all([
        getConsultations({
          type: typeFilter === "ALL" ? undefined : typeFilter,
          status: statusFilter === "ALL" ? undefined : statusFilter,
        }),
        getUpcomingFollowUps(),
      ]);
      setConsultations(data);
      setFollowUps(followUpData);
    });
  }

  function handleTypeFilter(value: string) {
    setTypeFilter(value);
    startTransition(async () => {
      const [data, followUpData] = await Promise.all([
        getConsultations({
          type: value === "ALL" ? undefined : value,
          status: statusFilter === "ALL" ? undefined : statusFilter,
        }),
        getUpcomingFollowUps(),
      ]);
      setConsultations(data);
      setFollowUps(followUpData);
    });
  }

  function handleStatusFilter(value: string) {
    setStatusFilter(value);
    startTransition(async () => {
      const [data, followUpData] = await Promise.all([
        getConsultations({
          type: typeFilter === "ALL" ? undefined : typeFilter,
          status: value === "ALL" ? undefined : value,
        }),
        getUpcomingFollowUps(),
      ]);
      setConsultations(data);
      setFollowUps(followUpData);
    });
  }

  function handleEdit(item: ConsultationItem) {
    setEditItem(item);
    setDialogOpen(true);
  }

  function handleDelete(id: string) {
    if (!confirm("이 상담 기록을 삭제하시겠습니까?")) return;
    startTransition(async () => {
      try {
        await deleteConsultation(id);
        toast.success("삭제되었습니다.");
        loadData();
      } catch {
        toast.error("삭제 중 오류가 발생했습니다.");
      }
    });
  }

  // Calendar computation
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(calDate);
    const monthEnd = endOfMonth(calDate);
    const calStart = startOfWeek(monthStart, { weekStartsOn: 0 });
    const calEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });

    const days: Date[] = [];
    let day = calStart;
    while (day <= calEnd) {
      days.push(day);
      day = addDays(day, 1);
    }
    return days;
  }, [calDate]);

  const consultsByDate = useMemo(() => {
    const map = new Map<string, ConsultationItem[]>();
    for (const c of consultations) {
      const key = format(new Date(c.date), "yyyy-MM-dd");
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(c);
    }
    return map;
  }, [consultations]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">상담 관리</h1>
          <p className="text-muted-foreground text-sm mt-1">
            학생/학부모 상담을 기록하고 관리합니다
          </p>
        </div>
        <Button
          onClick={() => {
            setEditItem(null);
            setDialogOpen(true);
          }}
        >
          <Plus className="size-4" />
          상담 기록
        </Button>
      </div>

      {/* Follow-up Reminders */}
      {followUps.length > 0 && (
        <Card className="p-4 border-amber-200 bg-amber-50/50">
          <h3 className="font-semibold text-sm flex items-center gap-2 mb-3 text-amber-700">
            <Bell className="size-4" />
            후속 조치 필요 ({followUps.length}건)
          </h3>
          <div className="flex flex-wrap gap-2">
            {followUps.map((fu) => (
              <Badge
                key={fu.id}
                variant="outline"
                className="cursor-pointer hover:bg-amber-100 py-1.5 px-3"
                onClick={() => handleEdit(fu as unknown as ConsultationItem)}
              >
                {fu.student?.name || "신규"} · {formatDate(fu.followUpDate!)}
                {fu.followUpNote && ` · ${truncate(fu.followUpNote, 20)}`}
              </Badge>
            ))}
          </div>
        </Card>
      )}

      {/* Filters + View Toggle */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5">
          <Filter className="size-4 text-muted-foreground" />
        </div>
        <Select value={typeFilter} onValueChange={handleTypeFilter}>
          <SelectTrigger className="w-[140px] h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">전체 유형</SelectItem>
            {CONSULTATION_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={handleStatusFilter}>
          <SelectTrigger className="w-[140px] h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">전체 상태</SelectItem>
            {CONSULTATION_STATUSES.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="ml-auto flex gap-1 border rounded-md p-0.5">
          <Button
            variant={view === "list" ? "default" : "ghost"}
            size="xs"
            onClick={() => setView("list")}
          >
            <List className="size-3.5" />
            리스트
          </Button>
          <Button
            variant={view === "calendar" ? "default" : "ghost"}
            size="xs"
            onClick={() => setView("calendar")}
          >
            <Calendar className="size-3.5" />
            캘린더
          </Button>
        </div>
      </div>

      {/* List View */}
      {view === "list" && (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[100px]">날짜</TableHead>
                <TableHead className="w-[100px]">유형</TableHead>
                <TableHead>학생</TableHead>
                <TableHead className="w-[80px]">상담자</TableHead>
                <TableHead className="w-[80px]">채널</TableHead>
                <TableHead className="w-[80px]">상태</TableHead>
                <TableHead>요약</TableHead>
                <TableHead className="w-[80px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {consultations.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="text-center py-12 text-muted-foreground"
                  >
                    상담 기록이 없습니다
                  </TableCell>
                </TableRow>
              )}
              {consultations.map((item) => {
                const TypeIcon = TYPE_ICON_MAP[item.type] || GraduationCap;
                const statusConfig = getStatusConfig(item.status);

                return (
                  <TableRow key={item.id} className="cursor-pointer hover:bg-muted/50">
                    <TableCell className="text-sm">
                      <div>
                        {formatDate(item.date)}
                        <br />
                        <span className="text-muted-foreground text-xs">
                          {formatTime(item.date)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs gap-1">
                        <TypeIcon className="size-3" />
                        {getTypeLabel(item.type)}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium text-sm">
                      {item.student?.name || (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {item.staff?.name || "-"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {getChannelLabel(item.channel)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={`text-xs ${statusConfig.color}`}
                      >
                        {statusConfig.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[200px]">
                      {item.content ? truncate(item.content, 50) : "-"}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => handleEdit(item)}
                        >
                          <Pencil className="size-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          className="text-red-500 hover:text-red-600"
                          onClick={() => handleDelete(item.id)}
                        >
                          <Trash2 className="size-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Calendar View */}
      {view === "calendar" && (
        <Card className="p-4">
          {/* Month Navigation */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon-sm"
                onClick={() => setCalDate(subMonths(calDate, 1))}
              >
                <ChevronLeft className="size-4" />
              </Button>
              <h2 className="text-lg font-semibold min-w-[140px] text-center">
                {format(calDate, "yyyy년 M월", { locale: ko })}
              </h2>
              <Button
                variant="outline"
                size="icon-sm"
                onClick={() => setCalDate(addMonths(calDate, 1))}
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCalDate(new Date())}
            >
              오늘
            </Button>
          </div>

          {/* Weekday Headers */}
          <div className="grid grid-cols-7 mb-1">
            {WEEKDAYS.map((day, i) => (
              <div
                key={day}
                className={`text-center text-xs font-medium py-2 ${
                  i === 0
                    ? "text-red-500"
                    : i === 6
                      ? "text-blue-500"
                      : "text-muted-foreground"
                }`}
              >
                {day}
              </div>
            ))}
          </div>

          {/* Calendar Grid */}
          <div className="grid grid-cols-7 border-t border-l">
            {calendarDays.map((day) => {
              const dateKey = format(day, "yyyy-MM-dd");
              const dayConsults = consultsByDate.get(dateKey) || [];
              const inMonth = isSameMonth(day, calDate);
              const today = isToday(day);

              return (
                <div
                  key={dateKey}
                  className={`min-h-[80px] md:min-h-[100px] p-1.5 border-r border-b ${
                    !inMonth ? "opacity-40" : ""
                  }`}
                >
                  <span
                    className={`text-xs font-medium inline-flex items-center justify-center ${
                      today
                        ? "bg-blue-500 text-white rounded-full size-6"
                        : ""
                    }`}
                  >
                    {format(day, "d")}
                  </span>

                  <div className="mt-1 space-y-0.5">
                    {dayConsults.slice(0, 3).map((c) => {
                      const TypeIcon = TYPE_ICON_MAP[c.type] || GraduationCap;
                      return (
                        <button
                          key={c.id}
                          onClick={() => handleEdit(c)}
                          className="w-full text-left text-[10px] leading-tight truncate rounded px-1 py-0.5 bg-blue-100 text-blue-700 hover:bg-blue-200 transition-colors flex items-center gap-0.5"
                        >
                          <TypeIcon className="size-2.5 shrink-0" />
                          {c.student?.name || getTypeLabel(c.type)}
                        </button>
                      );
                    })}
                    {dayConsults.length > 3 && (
                      <span className="text-[10px] text-muted-foreground pl-1">
                        +{dayConsults.length - 3}건
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Consultation Form Dialog */}
      <ConsultationFormDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            setEditItem(null);
            loadData();
          }
        }}
        consultation={editItem}
      />
    </div>
  );
}
