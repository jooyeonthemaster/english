"use client";

import { useState, useTransition, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CalendarEventFormDialog } from "@/components/calendar/event-form-dialog";
import { getCalendarEvents } from "@/actions/communication";
import { CALENDAR_EVENT_TYPES } from "@/lib/constants";
import { formatTime, formatKoreanDate } from "@/lib/utils";
import {
  Plus,
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
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
  isSameDay,
  isToday,
} from "date-fns";
import { ko } from "date-fns/locale";

type CalendarEvent = Awaited<ReturnType<typeof getCalendarEvents>>[number];

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function getEventTypeConfig(type: string) {
  return (
    CALENDAR_EVENT_TYPES.find((t) => t.value === type) || CALENDAR_EVENT_TYPES[4]
  );
}

interface CalendarClientProps {
  initialEvents: CalendarEvent[];
  initialMonth: string;
}

export default function CalendarClient({ initialEvents, initialMonth }: CalendarClientProps) {
  const [currentDate, setCurrentDate] = useState(() => {
    const [year, month] = initialMonth.split("-").map(Number);
    return new Date(year, month - 1, 1);
  });
  const [events, setEvents] = useState<CalendarEvent[]>(initialEvents);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editEvent, setEditEvent] = useState<CalendarEvent | null>(null);
  const [isPending, startTransition] = useTransition();

  const monthStr = format(currentDate, "yyyy-MM");

  function loadEvents(month?: string) {
    const targetMonth = month || monthStr;
    startTransition(async () => {
      const data = await getCalendarEvents(targetMonth);
      setEvents(data);
    });
  }

  function prevMonth() {
    const newDate = subMonths(currentDate, 1);
    setCurrentDate(newDate);
    loadEvents(format(newDate, "yyyy-MM"));
  }

  function nextMonth() {
    const newDate = addMonths(currentDate, 1);
    setCurrentDate(newDate);
    loadEvents(format(newDate, "yyyy-MM"));
  }

  function goToday() {
    const now = new Date();
    setCurrentDate(now);
    setSelectedDate(now);
    loadEvents(format(now, "yyyy-MM"));
  }

  // Build calendar grid
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const calStart = startOfWeek(monthStart, { weekStartsOn: 0 });
    const calEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });

    const days: Date[] = [];
    let day = calStart;
    while (day <= calEnd) {
      days.push(day);
      day = addDays(day, 1);
    }
    return days;
  }, [currentDate]);

  // Events grouped by date
  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const ev of events) {
      const key = format(new Date(ev.startDate), "yyyy-MM-dd");
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(ev);
    }
    return map;
  }, [events]);

  // Events for selected date
  const selectedDateEvents = selectedDate
    ? eventsByDate.get(format(selectedDate, "yyyy-MM-dd")) || []
    : [];

  // Upcoming events (sorted, next 7 items)
  const upcomingEvents = useMemo(() => {
    const now = new Date();
    return events
      .filter((e) => new Date(e.startDate) >= now)
      .sort(
        (a, b) =>
          new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
      )
      .slice(0, 7);
  }, [events]);

  function openCreateDialog(date?: Date) {
    setEditEvent(null);
    setSelectedDate(date || null);
    setDialogOpen(true);
  }

  function openEditDialog(event: CalendarEvent) {
    setEditEvent(event);
    setDialogOpen(true);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">학원 캘린더</h1>
          <p className="text-muted-foreground text-sm mt-1">
            학원 일정을 한눈에 관리합니다
          </p>
        </div>
        <Button onClick={() => openCreateDialog()}>
          <Plus className="size-4" />
          일정 추가
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6">
        {/* Calendar Grid */}
        <Card className="p-4">
          {/* Month Navigation */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon-sm" onClick={prevMonth}>
                <ChevronLeft className="size-4" />
              </Button>
              <h2 className="text-lg font-semibold min-w-[140px] text-center">
                {format(currentDate, "yyyy년 M월", { locale: ko })}
              </h2>
              <Button variant="outline" size="icon-sm" onClick={nextMonth}>
                <ChevronRight className="size-4" />
              </Button>
            </div>
            <Button variant="outline" size="sm" onClick={goToday}>
              오늘
            </Button>
          </div>

          {/* Weekday Headers */}
          <div className="grid grid-cols-7 mb-1">
            {WEEKDAYS.map((day, i) => (
              <div
                key={day}
                className={`text-center text-xs font-medium py-2 ${
                  i === 0 ? "text-red-500" : i === 6 ? "text-blue-500" : "text-muted-foreground"
                }`}
              >
                {day}
              </div>
            ))}
          </div>

          {/* Calendar Days */}
          <div className="grid grid-cols-7 border-t border-l">
            {calendarDays.map((day) => {
              const dateKey = format(day, "yyyy-MM-dd");
              const dayEvents = eventsByDate.get(dateKey) || [];
              const inMonth = isSameMonth(day, currentDate);
              const today = isToday(day);
              const selected = selectedDate && isSameDay(day, selectedDate);
              const dayOfWeek = day.getDay();

              return (
                <button
                  key={dateKey}
                  onClick={() => setSelectedDate(day)}
                  onDoubleClick={() => openCreateDialog(day)}
                  className={`
                    relative min-h-[80px] md:min-h-[100px] p-1.5 border-r border-b text-left
                    transition-colors hover:bg-muted/50
                    ${!inMonth ? "opacity-40" : ""}
                    ${selected ? "bg-blue-50 ring-1 ring-blue-300" : ""}
                  `}
                >
                  <span
                    className={`
                      text-xs font-medium inline-flex items-center justify-center
                      ${today ? "bg-blue-500 text-white rounded-full size-6" : ""}
                      ${!today && dayOfWeek === 0 ? "text-red-500" : ""}
                      ${!today && dayOfWeek === 6 ? "text-blue-500" : ""}
                    `}
                  >
                    {format(day, "d")}
                  </span>

                  {/* Event dots / bars */}
                  <div className="mt-1 space-y-0.5">
                    {dayEvents.slice(0, 3).map((ev) => {
                      const typeConfig = getEventTypeConfig(ev.type);
                      return (
                        <div
                          key={ev.id}
                          className={`text-[10px] leading-tight truncate rounded px-1 py-0.5 text-white ${typeConfig.color}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            openEditDialog(ev);
                          }}
                        >
                          {ev.title}
                        </div>
                      );
                    })}
                    {dayEvents.length > 3 && (
                      <span className="text-[10px] text-muted-foreground pl-1">
                        +{dayEvents.length - 3}개
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Event Type Legend */}
          <div className="flex flex-wrap gap-3 mt-4 pt-3 border-t">
            {CALENDAR_EVENT_TYPES.map((t) => (
              <div key={t.value} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className={`size-2.5 rounded-full ${t.dotColor}`} />
                {t.label}
              </div>
            ))}
          </div>
        </Card>

        {/* Right Sidebar */}
        <div className="space-y-4">
          {/* Selected Date Events */}
          {selectedDate && (
            <Card className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-sm">
                  {formatKoreanDate(selectedDate)}
                </h3>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => openCreateDialog(selectedDate)}
                >
                  <Plus className="size-3.5" />
                </Button>
              </div>
              {selectedDateEvents.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  일정이 없습니다
                </p>
              ) : (
                <div className="space-y-2">
                  {selectedDateEvents.map((ev) => {
                    const typeConfig = getEventTypeConfig(ev.type);
                    return (
                      <button
                        key={ev.id}
                        onClick={() => openEditDialog(ev)}
                        className="w-full text-left p-2.5 rounded-lg border hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-start gap-2">
                          <span
                            className={`size-2 rounded-full mt-1.5 shrink-0 ${typeConfig.dotColor}`}
                          />
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">
                              {ev.title}
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {ev.allDay
                                ? "종일"
                                : formatTime(ev.startDate)}
                              {" · "}
                              <Badge variant="secondary" className="text-[10px] h-4">
                                {typeConfig.label}
                              </Badge>
                            </p>
                            {ev.description && (
                              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                {ev.description}
                              </p>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </Card>
          )}

          {/* Upcoming Events */}
          <Card className="p-4">
            <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
              <CalendarIcon className="size-4" />
              다가오는 일정
            </h3>
            {upcomingEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                예정된 일정이 없습니다
              </p>
            ) : (
              <div className="space-y-2">
                {upcomingEvents.map((ev) => {
                  const typeConfig = getEventTypeConfig(ev.type);
                  return (
                    <button
                      key={ev.id}
                      onClick={() => {
                        setSelectedDate(new Date(ev.startDate));
                        openEditDialog(ev);
                      }}
                      className="w-full text-left flex items-center gap-2.5 py-1.5 hover:bg-muted/50 rounded-md px-1.5 transition-colors"
                    >
                      <span
                        className={`size-2 rounded-full shrink-0 ${typeConfig.dotColor}`}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm truncate">{ev.title}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {formatKoreanDate(ev.startDate)}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Event Form Dialog */}
      <CalendarEventFormDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            setEditEvent(null);
            loadEvents();
          }
        }}
        event={editEvent}
        defaultDate={
          selectedDate ? format(selectedDate, "yyyy-MM-dd") : undefined
        }
      />
    </div>
  );
}
