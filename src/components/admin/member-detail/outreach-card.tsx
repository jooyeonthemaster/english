"use client";

// ============================================================================
// OutreachCard — 회원 상세의 "맞춤 문자 생성" 모듈.
// DB 사용 내역(consumptionByOp)·접속 추이를 분석해 선생님 한 명 한 명에게 맞는
// 문자 초안을 만들어 준다. 잘 쓰는 기능은 칭찬하고, 안 쓰는 좋은 기능은 권유.
// 관리자가 초안을 다듬어 복사 → 솔라피/문자앱으로 발송하는 흐름.
// ============================================================================

import { useMemo, useState } from "react";
import {
  MessageSquare,
  Copy,
  Phone,
  RefreshCw,
  Info,
  Check,
  CircleSlash,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/admin/kit";
import {
  analyzeUsage,
  buildSmsDraft,
  recommendPreset,
  smsLength,
  OUTREACH_PRESETS,
  type OutreachPreset,
  type OutreachProfile,
} from "@/lib/outreach";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface OutreachInput {
  teacherName: string;
  academyName: string;
  phone: string | null;
  /** 마지막 활동(로그인 등) 시각 — 재방문 유도 판단용 */
  lastActiveAt: Date | string | null;
  /** 학원 단위 사용 내역(회원 공통) */
  consumptionByOp: { operationType: string | null; count: number }[];
  dailyConsumption: { total: number }[];
}

export function OutreachCard({
  teacherName,
  academyName,
  phone,
  lastActiveAt,
  consumptionByOp,
  dailyConsumption,
}: OutreachInput) {
  // 렌더 순수성 유지를 위해 "지금" 시각은 마운트 시 1회만 캡처(지연 초기화).
  const [now] = useState(() => Date.now());
  const profile = useMemo<OutreachProfile>(() => {
    const { used, unused } = analyzeUsage(
      consumptionByOp.map((c) => ({
        operationType: c.operationType,
        count: c.count,
      })),
    );
    const daysSinceActive = lastActiveAt
      ? Math.floor((now - new Date(lastActiveAt).getTime()) / DAY_MS)
      : null;
    const last30dUsage = dailyConsumption.reduce((s, d) => s + d.total, 0);
    return {
      teacherName,
      academyName,
      used,
      unused,
      daysSinceActive,
      last30dUsage,
      activeDays: dailyConsumption.length,
    };
  }, [teacherName, academyName, consumptionByOp, dailyConsumption, lastActiveAt, now]);

  const [preset, setPreset] = useState<OutreachPreset>(() =>
    recommendPreset(profile),
  );
  const [text, setText] = useState<string>(() =>
    buildSmsDraft(profile, recommendPreset(profile)),
  );
  const [copied, setCopied] = useState(false);

  function regenerate(next: OutreachPreset) {
    setPreset(next);
    setText(buildSmsDraft(profile, next));
  }

  async function copyText() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success("문자 내용을 복사했습니다");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("복사에 실패했습니다");
    }
  }

  async function copyPhone() {
    if (!phone) return;
    try {
      await navigator.clipboard.writeText(phone);
      toast.success(`전화번호 복사: ${phone}`);
    } catch {
      toast.error("복사에 실패했습니다");
    }
  }

  const len = smsLength(text);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-gray-50 px-5 py-4">
        <div className="flex items-center gap-2">
          <MessageSquare className="size-4 text-blue-600" strokeWidth={2} aria-hidden />
          <h3 className="text-[15px] font-semibold text-gray-900">맞춤 문자 생성</h3>
          <span className="text-[11px] text-gray-400">사용 내역 기반</span>
        </div>
        {phone ? (
          <Button type="button" variant="outline" size="sm" onClick={copyPhone}>
            <Phone className="size-3.5" strokeWidth={2} aria-hidden />
            {phone}
          </Button>
        ) : (
          <span className="inline-flex items-center gap-1 text-[11px] text-gray-400">
            <CircleSlash className="size-3.5" strokeWidth={2} aria-hidden />
            전화번호 없음
          </span>
        )}
      </div>

      <div className="space-y-4 p-5">
        {/* 사용/미사용 요약 */}
        <div className="space-y-2">
          <FeatureRow
            label="잘 쓰는 기능"
            empty="아직 사용 내역이 없어요"
            items={profile.used.map((f) => f.label)}
            tone="used"
          />
          <FeatureRow
            label="안 쓰는 기능"
            empty="주요 기능을 모두 활용 중이에요"
            items={profile.unused.map((f) => f.label)}
            tone="unused"
          />
        </div>

        {/* 프리셋 */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[11px] font-medium text-gray-400">메시지 톤</span>
          {OUTREACH_PRESETS.map((p) => (
            <Button
              key={p.value}
              type="button"
              size="xs"
              variant={preset === p.value ? "default" : "outline"}
              aria-pressed={preset === p.value}
              className="h-7 px-2.5 text-[12px]"
              onClick={() => regenerate(p.value)}
            >
              {p.label}
            </Button>
          ))}
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="ml-auto h-7 text-[12px] text-gray-500"
            onClick={() => regenerate(preset)}
          >
            <RefreshCw className="size-3.5" strokeWidth={2} aria-hidden />
            다시 생성
          </Button>
        </div>

        {/* 초안 */}
        <div className="space-y-1.5">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={7}
            className="resize-y text-[13px] leading-relaxed"
            placeholder="생성된 문자 초안이 여기에 표시됩니다"
          />
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-[11px] tabular-nums text-gray-400">
              {len.chars}자 · 약 {len.bytes}바이트
              <StatusBadge
                status={{
                  label: len.type,
                  tone: len.type === "SMS" ? "emerald" : "blue",
                }}
              />
            </span>
            <Button type="button" size="sm" onClick={copyText}>
              {copied ? (
                <Check className="size-3.5" strokeWidth={2} aria-hidden />
              ) : (
                <Copy className="size-3.5" strokeWidth={2} aria-hidden />
              )}
              문자 복사
            </Button>
          </div>
        </div>

        <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-gray-400">
          <Info className="mt-0.5 size-3.5 shrink-0 text-gray-300" strokeWidth={2} aria-hidden />
          이 회원의 실제 사용 내역으로 자동 작성된 초안이에요. 그대로 복사해 솔라피·문자 앱에
          붙여넣어 보내거나, 위에서 직접 다듬어 사용하세요.
        </p>
      </div>
    </div>
  );
}

function FeatureRow({
  label,
  items,
  empty,
  tone,
}: {
  label: string;
  items: string[];
  empty: string;
  tone: "used" | "unused";
}) {
  return (
    <div className="flex items-start gap-2">
      <span className="w-[72px] shrink-0 pt-0.5 text-[11px] font-medium text-gray-400">
        {label}
      </span>
      <div className="flex min-w-0 flex-wrap gap-1.5">
        {items.length === 0 ? (
          <span className="text-[11px] text-gray-400">{empty}</span>
        ) : (
          items.map((it) => (
            <span
              key={it}
              className={cn(
                "inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium",
                tone === "used"
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-blue-50 text-blue-700",
              )}
            >
              {it}
            </span>
          ))
        )}
      </div>
    </div>
  );
}
