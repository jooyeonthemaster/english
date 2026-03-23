"use client";

import { useState, useEffect, useTransition } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { NoticeFormDialog } from "@/components/notices/notice-form-dialog";
import { getNotice, deleteNotice } from "@/actions/communication";
import { getClassList } from "@/actions/consultations";
import { NOTICE_TARGET_TYPES } from "@/lib/constants";
import { formatDateTime, getInitials } from "@/lib/utils";
import {
  ArrowLeft,
  Pin,
  Pencil,
  Trash2,
  Eye,
  EyeOff,
  Megaphone,
} from "lucide-react";
import { toast } from "sonner";

type NoticeDetail = Awaited<ReturnType<typeof getNotice>>;

export default function NoticeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const noticeId = params.noticeId as string;

  const [notice, setNotice] = useState<NoticeDetail>(null);
  const [classes, setClasses] = useState<{ id: string; name: string }[]>([]);
  const [editOpen, setEditOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    loadNotice();
  }, [noticeId]);

  function loadNotice() {
    startTransition(async () => {
      const [data, classData] = await Promise.all([
        getNotice(noticeId),
        getClassList(),
      ]);
      setNotice(data);
      setClasses(classData);
    });
  }

  function handleDelete() {
    if (!confirm("이 공지를 삭제하시겠습니까?")) return;
    startTransition(async () => {
      try {
        await deleteNotice(noticeId);
        toast.success("공지가 삭제되었습니다.");
        router.push("/director/notices");
      } catch {
        toast.error("삭제 중 오류가 발생했습니다.");
      }
    });
  }

  if (!notice && isPending) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        불러오는 중...
      </div>
    );
  }

  if (!notice) {
    return (
      <div className="text-center py-20 text-muted-foreground">
        <Megaphone className="size-12 mx-auto mb-3 opacity-30" />
        <p>공지를 찾을 수 없습니다</p>
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => router.push("/director/notices")}
        >
          목록으로 돌아가기
        </Button>
      </div>
    );
  }

  const targetLabel =
    NOTICE_TARGET_TYPES.find((t) => t.value === notice.targetType)?.label ||
    notice.targetType;
  const readReaders = notice.reads;
  const readCount = readReaders.length;

  return (
    <div className="space-y-6">
      {/* Back + actions */}
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/director/notices")}
        >
          <ArrowLeft className="size-4" />
          목록
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            <Pencil className="size-3.5" />
            수정
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-red-600 hover:text-red-700 hover:bg-red-50"
            onClick={handleDelete}
            disabled={isPending}
          >
            <Trash2 className="size-3.5" />
            삭제
          </Button>
        </div>
      </div>

      {/* Notice Content */}
      <Card className="p-6">
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            {notice.isPinned && (
              <Pin className="size-4 text-amber-500 fill-amber-500 mt-1 shrink-0" />
            )}
            <div className="flex-1">
              <h1 className="text-xl font-bold">{notice.title}</h1>
              <div className="flex items-center gap-3 mt-2 text-sm text-muted-foreground">
                <Badge variant="secondary">{targetLabel}</Badge>
                <span>{formatDateTime(notice.publishAt)}</span>
              </div>
            </div>
          </div>

          <Separator />

          <div className="prose prose-sm max-w-none whitespace-pre-wrap leading-relaxed">
            {notice.content}
          </div>
        </div>
      </Card>

      {/* Read Status */}
      <Card className="p-6">
        <h2 className="font-semibold mb-4 flex items-center gap-2">
          <Eye className="size-4" />
          읽음 현황
          <Badge variant="secondary" className="ml-1">
            {readCount}명
          </Badge>
        </h2>

        {readReaders.length > 0 ? (
          <div className="space-y-3">
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                <Eye className="size-3.5" />
                읽은 사람
              </h3>
              <div className="flex flex-wrap gap-2">
                {readReaders.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-sm"
                  >
                    <Avatar className="size-5">
                      <AvatarFallback className="text-[10px] bg-emerald-200">
                        {getInitials(r.readerId.slice(0, 2))}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-emerald-700 text-xs">
                      {r.readerType === "PARENT" ? "학부모" : "학생"} ·{" "}
                      {formatDateTime(r.readAt)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-6 text-muted-foreground text-sm">
            <EyeOff className="size-8 mx-auto mb-2 opacity-30" />
            아직 읽은 사람이 없습니다
          </div>
        )}
      </Card>

      {/* Edit Dialog */}
      <NoticeFormDialog
        open={editOpen}
        onOpenChange={(open) => {
          setEditOpen(open);
          if (!open) loadNotice();
        }}
        notice={notice}
        classes={classes}
      />
    </div>
  );
}
