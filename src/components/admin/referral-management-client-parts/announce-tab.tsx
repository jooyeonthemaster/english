"use client";

import { useMemo, useState, useTransition } from "react";
import { Loader2, Megaphone } from "lucide-react";
import { toast } from "sonner";
import { sendAnnouncement } from "@/actions/admin/referrals";
import { SectionCard, useConfirm } from "@/components/admin/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const CATEGORY_OPTIONS = [
  { value: "SYSTEM", label: "시스템" },
  { value: "MISSION", label: "미션" },
  { value: "REFERRAL", label: "추천" },
  { value: "BILLING", label: "결제" },
] as const;

const TARGET_OPTIONS = [
  { value: "ALL_DIRECTORS", label: "모든 원장" },
  { value: "ALL_STAFF", label: "모든 직원" },
] as const;

/** 공지 발송 탭 — 전 학원에 한 번에 나가는 알림이라 발송 전 확인을 받는다. */
export function AnnounceTab() {
  const confirm = useConfirm();
  const [pending, startTransition] = useTransition();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState<"SYSTEM" | "MISSION" | "REFERRAL" | "BILLING">("SYSTEM");
  const [target, setTarget] = useState<"ALL_DIRECTORS" | "ALL_STAFF">("ALL_DIRECTORS");
  const [actionUrl, setActionUrl] = useState("");

  const canSubmit = useMemo(() => title.trim().length > 0 && !pending, [title, pending]);

  async function submit() {
    if (title.trim().length === 0) {
      toast.error("제목을 입력해주세요.");
      return;
    }
    // 되돌릴 수 없는 전체 발송 — 명시적으로 확인받는다.
    const targetLabel = TARGET_OPTIONS.find((o) => o.value === target)?.label ?? target;
    const ok = await confirm({
      title: `'${targetLabel}' 전체에게 공지를 발송할까요?`,
      description: "발송 후에는 회수할 수 없습니다.",
      confirmLabel: "발송",
    });
    if (!ok) return;
    startTransition(async () => {
      const res = await sendAnnouncement({
        title: title.trim(),
        body: body.trim() || null,
        category,
        target,
        actionUrl: actionUrl.trim() || null,
      });
      if (res.success) {
        toast.success(`${res.count.toLocaleString("ko-KR")}명에게 공지를 발송했습니다.`);
        setTitle("");
        setBody("");
        setActionUrl("");
      } else {
        toast.error(res.error ?? "발송에 실패했습니다.");
      }
    });
  }

  return (
    <SectionCard
      icon={Megaphone}
      title="전체 공지 발송"
      description="선택한 대상 전원에게 알림이 발송됩니다."
      className="max-w-2xl"
      actions={
        <Button onClick={submit} disabled={!canSubmit}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Megaphone className="size-4" strokeWidth={2} />}
          공지 발송
        </Button>
      }
    >
      <div className="space-y-4">
        <Field label="제목" htmlFor="announce-title">
          <Input
            id="announce-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="공지 제목"
            maxLength={120}
            disabled={pending}
            className="text-[13px]"
          />
        </Field>

        <Field label="본문 (선택)" htmlFor="announce-body">
          <Textarea
            id="announce-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="공지 내용을 입력하세요"
            maxLength={2000}
            disabled={pending}
            className="min-h-30 resize-y text-[13px]"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="분류">
            <Select
              value={category}
              onValueChange={(v) => setCategory(v as typeof category)}
              disabled={pending}
            >
              <SelectTrigger size="sm" className="w-full text-[13px]" aria-label="분류">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORY_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="대상">
            <Select
              value={target}
              onValueChange={(v) => setTarget(v as typeof target)}
              disabled={pending}
            >
              <SelectTrigger size="sm" className="w-full text-[13px]" aria-label="대상">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TARGET_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>

        <Field label="이동 링크 (선택)" htmlFor="announce-url">
          <Input
            id="announce-url"
            value={actionUrl}
            onChange={(e) => setActionUrl(e.target.value)}
            placeholder="예: /director/rewards (알림 클릭 시 이동할 경로)"
            maxLength={500}
            disabled={pending}
            className="text-[13px]"
          />
        </Field>
      </div>
    </SectionCard>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="text-[11px] font-semibold text-gray-500">
        {label}
      </Label>
      {children}
    </div>
  );
}
