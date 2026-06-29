"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { StatusBadge } from "@/components/help-center/status-badge";
import {
  createSeminarRequest,
  cancelSeminarRequest,
  type SeminarRequestView,
} from "@/actions/help-center";
import {
  SEMINAR_CHANNELS,
  SEMINAR_TIME_SLOTS,
  SEMINAR_TOPICS,
  SEMINAR_STATUSES,
  statusOf,
  labelOf,
} from "@/lib/help-center";
import { formatDateTime } from "@/lib/utils";
import { toast } from "sonner";
import { Presentation, Phone, MessageCircle, CalendarClock, X, Plus, Video } from "lucide-react";

interface Prefill {
  applicantName: string;
  phone: string;
  email: string;
  academyName: string;
}

/** 프로토콜이 없는 링크(예: "www.smoat.co.kr")는 상대경로로 해석되므로 https://를 보정한다. */
function toExternalUrl(url: string) {
  const trimmed = url.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
        active
          ? "border-blue-500 bg-blue-50 text-blue-600"
          : "border-slate-200 bg-white text-slate-500 hover:border-blue-200"
      }`}
    >
      {children}
    </button>
  );
}

export function SeminarClient({
  prefill,
  initialRequests,
}: {
  prefill: Prefill;
  initialRequests: SeminarRequestView[];
}) {
  const [requests, setRequests] = useState(initialRequests);
  const [showForm, setShowForm] = useState(initialRequests.length === 0);
  const [isPending, startTransition] = useTransition();

  const [name, setName] = useState(prefill.applicantName);
  const [phone, setPhone] = useState(prefill.phone);
  const [email, setEmail] = useState(prefill.email);
  const [channel, setChannel] = useState("PHONE");
  const [times, setTimes] = useState<string[]>([]);
  const [topics, setTopics] = useState<string[]>([]);
  const [message, setMessage] = useState("");

  function toggle(list: string[], setList: (v: string[]) => void, value: string) {
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  }

  function submit() {
    if (!name.trim() || !phone.trim()) {
      toast.error("이름과 연락처를 입력하세요.");
      return;
    }
    if (times.length === 0) {
      toast.error("선호 시간대를 한 개 이상 선택하세요.");
      return;
    }
    startTransition(async () => {
      try {
        await createSeminarRequest({
          applicantName: name,
          phone,
          email: email || undefined,
          preferredChannel: channel as "PHONE" | "KAKAO" | "EITHER",
          preferredTimes: times.join(", "),
          topic: topics.join(", "),
          message: message || undefined,
        });
        toast.success("세미나 신청이 접수되었습니다. 곧 연락드리겠습니다.");
        // 새로고침 대신 낙관적 추가 — 서버 재조회는 페이지 진입 시.
        setRequests((prev) => [
          {
            id: `temp-${prev.length}`,
            applicantName: name,
            phone,
            email: email || null,
            preferredChannel: channel,
            preferredTimes: times.join(", "),
            topic: topics.join(", "),
            message: message || null,
            status: "RECEIVED",
            scheduledAt: null,
            meetingUrl: null,
            createdAt: new Date().toISOString(),
          },
          ...prev,
        ]);
        setShowForm(false);
        setMessage("");
        setTimes([]);
        setTopics([]);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "오류가 발생했습니다.");
      }
    });
  }

  function cancel(id: string) {
    if (!confirm("신청을 취소하시겠습니까?")) return;
    startTransition(async () => {
      try {
        await cancelSeminarRequest(id);
        setRequests((prev) =>
          prev.map((r) => (r.id === id ? { ...r, status: "CANCELED" } : r)),
        );
        toast.success("신청이 취소되었습니다.");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "오류가 발생했습니다.");
      }
    });
  }

  return (
    <div className="bg-card rounded-2xl border border-border shadow-sm p-5 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <Presentation className="size-5" strokeWidth={1.9} />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">1:1 세미나 신청</h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              줌(Zoom) 화상으로 프로그램 사용법을 1:1로 안내해 드립니다
            </p>
          </div>
        </div>
        {!showForm && (
          <Button onClick={() => setShowForm(true)}>
            <Plus className="size-4" />
            새 신청
          </Button>
        )}
      </div>

      {/* Form */}
      {showForm && (
        <div className="rounded-xl border border-slate-200 p-5 space-y-6">
          {/* Contact */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="sem-name">이름</Label>
              <Input id="sem-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sem-phone">연락처</Label>
              <Input
                id="sem-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="010-0000-0000"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sem-email">이메일 (선택)</Label>
              <Input id="sem-email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          </div>

          <Separator />

          {/* Channel */}
          <div className="space-y-2.5">
            <Label className="flex items-center gap-1.5">선호 연락 수단</Label>
            <div className="flex flex-wrap gap-2">
              {SEMINAR_CHANNELS.map((c) => (
                <Chip key={c.value} active={channel === c.value} onClick={() => setChannel(c.value)}>
                  <span className="inline-flex items-center gap-1.5">
                    {c.value === "PHONE" && <Phone className="size-3.5" />}
                    {c.value === "KAKAO" && <MessageCircle className="size-3.5" />}
                    {c.label}
                  </span>
                </Chip>
              ))}
            </div>
          </div>

          {/* Times */}
          <div className="space-y-2.5">
            <Label className="flex items-center gap-1.5">
              <CalendarClock className="size-3.5" />
              선호 시간대 <span className="text-xs font-normal text-muted-foreground">(복수 선택)</span>
            </Label>
            <div className="flex flex-wrap gap-2">
              {SEMINAR_TIME_SLOTS.map((t) => (
                <Chip key={t} active={times.includes(t)} onClick={() => toggle(times, setTimes, t)}>
                  {t}
                </Chip>
              ))}
            </div>
          </div>

          {/* Topics */}
          <div className="space-y-2.5">
            <Label>
              듣고 싶은 내용 <span className="text-xs font-normal text-muted-foreground">(복수 선택)</span>
            </Label>
            <div className="flex flex-wrap gap-2">
              {SEMINAR_TOPICS.map((t) => (
                <Chip key={t} active={topics.includes(t)} onClick={() => toggle(topics, setTopics, t)}>
                  {t}
                </Chip>
              ))}
            </div>
          </div>

          {/* Message */}
          <div className="space-y-2">
            <Label htmlFor="sem-msg">추가 메모 (선택)</Label>
            <Textarea
              id="sem-msg"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="추가로 전달할 내용이 있으면 적어 주세요"
              rows={3}
              className="resize-y"
            />
          </div>

          <div className="flex justify-end gap-2">
            {requests.length > 0 && (
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                취소
              </Button>
            )}
            <Button type="button" onClick={submit} disabled={isPending}>
              {isPending ? "접수 중..." : "신청하기"}
            </Button>
          </div>
        </div>
      )}

      {/* My requests */}
      {requests.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-500">내 신청 내역</h2>
          {requests.map((r) => (
            <div key={r.id} className="rounded-xl border border-slate-200 p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <StatusBadge status={statusOf(SEMINAR_STATUSES, r.status)} />
                    <span className="text-sm font-medium">
                      {labelOf(SEMINAR_CHANNELS, r.preferredChannel)} 연락 희망
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    신청일 {formatDateTime(new Date(r.createdAt))}
                    {r.preferredTimes ? ` · 선호: ${r.preferredTimes}` : ""}
                  </div>
                  {r.scheduledAt && (
                    <div className="text-xs font-medium text-violet-600 flex items-center gap-1">
                      <CalendarClock className="size-3.5" />
                      확정 일정: {formatDateTime(new Date(r.scheduledAt))}
                    </div>
                  )}
                  {r.topic && <div className="text-xs text-slate-500">주제: {r.topic}</div>}
                  {r.meetingUrl && (
                    <a
                      href={toExternalUrl(r.meetingUrl)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 mt-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-700"
                    >
                      <Video className="size-3.5" />
                      줌(Zoom) 화상 접속
                    </a>
                  )}
                </div>
                {r.status !== "DONE" && r.status !== "CANCELED" && !r.id.startsWith("temp-") && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-slate-400 hover:text-rose-600"
                    onClick={() => cancel(r.id)}
                  >
                    <X className="size-3.5" />
                    취소
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
