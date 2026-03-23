"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { NoticeFormDialog } from "@/components/notices/notice-form-dialog";
import { getNotices } from "@/actions/communication";
import { NOTICE_TARGET_TYPES } from "@/lib/constants";
import { formatRelativeTime, truncate } from "@/lib/utils";
import {
  Plus,
  Pin,
  Search,
  Megaphone,
  Users,
  UserCheck,
  BookOpen,
} from "lucide-react";
import Link from "next/link";

type Notice = Awaited<ReturnType<typeof getNotices>>[number];

const FILTER_TABS = [
  { value: "ALL_FILTER", label: "전체" },
  ...NOTICE_TARGET_TYPES,
];

const TARGET_BADGE_MAP: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  ALL: { label: "전체", variant: "default" },
  CLASS: { label: "반별", variant: "secondary" },
  INDIVIDUAL: { label: "개인", variant: "outline" },
  PARENTS: { label: "학부모", variant: "secondary" },
};

const TARGET_ICON_MAP: Record<string, React.ElementType> = {
  ALL: Megaphone,
  CLASS: BookOpen,
  INDIVIDUAL: UserCheck,
  PARENTS: Users,
};

interface NoticesClientProps {
  initialNotices: Notice[];
  initialClasses: { id: string; name: string }[];
}

export default function NoticesClient({ initialNotices, initialClasses }: NoticesClientProps) {
  const [notices, setNotices] = useState<Notice[]>(initialNotices);
  const [classes] = useState(initialClasses);
  const [filter, setFilter] = useState("ALL_FILTER");
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function loadData() {
    startTransition(async () => {
      const noticeData = await getNotices({
        targetType: filter === "ALL_FILTER" ? undefined : filter,
        search: search || undefined,
      });
      setNotices(noticeData);
    });
  }

  function handleFilterChange(newFilter: string) {
    setFilter(newFilter);
    startTransition(async () => {
      const noticeData = await getNotices({
        targetType: newFilter === "ALL_FILTER" ? undefined : newFilter,
        search: search || undefined,
      });
      setNotices(noticeData);
    });
  }

  function handleSearch() {
    loadData();
  }

  const filteredNotices = search
    ? notices.filter(
        (n) =>
          n.title.toLowerCase().includes(search.toLowerCase()) ||
          n.content.toLowerCase().includes(search.toLowerCase())
      )
    : notices;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">공지사항</h1>
          <p className="text-muted-foreground text-sm mt-1">
            학원 공지를 작성하고 관리합니다
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="size-4" />
          공지 작성
        </Button>
      </div>

      {/* Search */}
      <div className="flex gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="공지 검색..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="pl-9"
          />
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-1 border-b">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => handleFilterChange(tab.value)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              filter === tab.value
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Notice List */}
      <div className="space-y-3">
        {isPending && notices.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            불러오는 중...
          </div>
        )}

        {!isPending && filteredNotices.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <Megaphone className="size-12 mx-auto mb-3 opacity-30" />
            <p>등록된 공지사항이 없습니다</p>
          </div>
        )}

        {filteredNotices.map((notice) => {
          const TargetIcon = TARGET_ICON_MAP[notice.targetType] || Megaphone;
          const badge = TARGET_BADGE_MAP[notice.targetType];
          const readCount = notice.reads.length;
          const totalTarget = 30;
          const readPercent =
            totalTarget > 0 ? Math.round((readCount / totalTarget) * 100) : 0;

          return (
            <Link
              key={notice.id}
              href={`/director/notices/${notice.id}`}
              className="block"
            >
              <Card className="p-4 hover:shadow-md transition-shadow cursor-pointer border-l-4 border-l-transparent hover:border-l-blue-500 gap-0">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      {notice.isPinned && (
                        <Pin className="size-3.5 text-amber-500 fill-amber-500 shrink-0" />
                      )}
                      <h3 className="font-semibold text-sm truncate">
                        {notice.title}
                      </h3>
                      <Badge variant={badge?.variant || "default"} className="shrink-0 text-xs">
                        <TargetIcon className="size-3 mr-1" />
                        {badge?.label || notice.targetType}
                      </Badge>
                    </div>
                    <p className="text-muted-foreground text-sm line-clamp-2 mb-3">
                      {truncate(notice.content, 120)}
                    </p>
                    <div className="flex items-center gap-4">
                      <span className="text-xs text-muted-foreground">
                        {formatRelativeTime(notice.publishAt)}
                      </span>
                      <div className="flex items-center gap-2 flex-1 max-w-[200px]">
                        <Progress value={readPercent} className="h-1.5" />
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {readCount}/{totalTarget}명 읽음
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            </Link>
          );
        })}
      </div>

      {/* Create Dialog */}
      <NoticeFormDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) loadData();
        }}
        classes={classes}
      />
    </div>
  );
}
