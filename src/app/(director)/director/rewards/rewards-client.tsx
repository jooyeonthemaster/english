"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Copy, Gift, Link2, Loader2, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { GrowthIcon } from "@/components/growth/growth-icon";
import { KakaoShareButton } from "@/components/growth/kakao-share-button";
import { notifyCreditsChanged } from "@/lib/credits-client";
import { notifyNotificationsChanged } from "@/lib/growth/notifications-client";

// ─── Types (mirror @/lib/growth MissionView + ReferralStats) ─────────────────

interface MissionView {
  key: string;
  title: string;
  description: string | null;
  category: string;
  cadence: string;
  rewardCredits: number;
  iconKey: string | null;
  actionUrl: string | null;
  ctaLabel: string | null;
  sortOrder: number;
  completed: boolean;
  claimable: boolean;
  lockedReason: string | null;
}

interface ReferralStats {
  code: string;
  link: string;
  totalClicks: number;
  totalSignups: number;
  totalRewarded: number;
  rewardedCount: number;
  heldCount: number;
  creditsEarned: number;
}

// API responses may be wrapped ({missions}/{referral}) or bare — handle both.
function unwrapMissions(data: unknown): MissionView[] {
  if (Array.isArray(data)) return data as MissionView[];
  if (data && typeof data === "object" && Array.isArray((data as { missions?: unknown }).missions)) {
    return (data as { missions: MissionView[] }).missions;
  }
  return [];
}
function unwrapReferral(data: unknown): ReferralStats | null {
  if (!data || typeof data !== "object") return null;
  const obj = (data as { referral?: ReferralStats }).referral ?? (data as ReferralStats);
  return typeof obj.code === "string" ? obj : null;
}

// ─── Page ────────────────────────────────────────────────────────────────────

export function RewardsClient() {
  const [missions, setMissions] = useState<MissionView[]>([]);
  const [referral, setReferral] = useState<ReferralStats | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchMissions = useCallback(async () => {
    try {
      const res = await fetch("/api/missions", { cache: "no-store" });
      if (res.ok) setMissions(unwrapMissions(await res.json()));
    } catch {
      // silent — non-critical
    }
  }, []);

  const fetchReferral = useCallback(async () => {
    try {
      const res = await fetch("/api/referral", { cache: "no-store" });
      if (res.ok) setReferral(unwrapReferral(await res.json()));
    } catch {
      // silent
    }
  }, []);

  const refetchAll = useCallback(async () => {
    await Promise.all([fetchMissions(), fetchReferral()]);
  }, [fetchMissions, fetchReferral]);

  useEffect(() => {
    let active = true;
    void (async () => {
      await refetchAll();
      if (active) setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [refetchAll]);

  const afterClaim = useCallback(
    async (rewardCredits?: number) => {
      if (rewardCredits) toast.success(`+${rewardCredits} 크레딧 적립`);
      notifyCreditsChanged();
      notifyNotificationsChanged();
      await refetchAll();
    },
    [refetchAll],
  );

  return (
    <div className="space-y-6 -mx-1">
      {/* Page header */}
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
          <Gift className="size-5" strokeWidth={1.9} />
        </span>
        <div>
          <h1 className="text-[20px] font-bold text-gray-900">크레딧 미션</h1>
          <p className="mt-0.5 text-[13px] text-gray-400">
            미션을 완료하고 동료를 추천해 크레딧을 적립하세요
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="size-5 animate-spin text-blue-500" />
        </div>
      ) : (
        <>
          <MissionGrid missions={missions} onClaimed={afterClaim} />
          <ReferralSection referral={referral} onShared={refetchAll} />
        </>
      )}
    </div>
  );
}

// ─── Mission grid ──────────────────────────────────────────────────────────

function MissionGrid({
  missions,
  onClaimed,
}: {
  missions: MissionView[];
  onClaimed: (rewardCredits?: number) => void | Promise<void>;
}) {
  if (missions.length === 0) {
    return (
      <div className="rounded-2xl border border-gray-200/60 bg-white px-5 py-12 text-center text-[13px] text-gray-400 shadow-sm">
        진행 중인 미션이 없습니다
      </div>
    );
  }

  return (
    <section>
      <h2 className="mb-3 text-[14px] font-semibold text-gray-800">미션</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {missions.map((mission) => (
          <MissionCard key={mission.key} mission={mission} onClaimed={onClaimed} />
        ))}
      </div>
    </section>
  );
}

function MissionCard({
  mission,
  onClaimed,
}: {
  mission: MissionView;
  onClaimed: (rewardCredits?: number) => void | Promise<void>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const isDailyCheckin = mission.key === "DAILY_CHECKIN";
  // KAKAO_SHARE is rewarded by the actual share action in the referral section
  // (KakaoShareButton → POST /api/missions/share), never by a direct claim here.
  const isShareViaReferral = mission.key === "KAKAO_SHARE";

  const claim = useCallback(
    async (endpoint: string) => {
      if (busy) return;
      setBusy(true);
      try {
        const res = await fetch(endpoint, { method: "POST" });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          reason?: string;
          rewardCredits?: number;
        };
        if (res.ok && data.ok) {
          await onClaimed(data.rewardCredits ?? mission.rewardCredits);
        } else if (data.reason === "already_claimed") {
          toast.info("이미 적립한 미션이에요");
          await onClaimed();
        } else {
          const msg =
            data.reason === "monthly_cap"
              ? "이번 달 적립 한도에 도달했어요"
              : data.reason === "condition_not_met"
                ? mission.lockedReason ?? "아직 조건을 충족하지 않았어요"
                : data.reason === "not_claimable"
                  ? "지금은 적립할 수 없는 미션이에요"
                  : "아직 적립할 수 없어요";
          toast.error(msg);
          // Resync the card with server state (handles cross-tab / stale claimable).
          await onClaimed();
        }
      } catch {
        toast.error("잠시 후 다시 시도해 주세요");
      } finally {
        setBusy(false);
      }
    },
    [busy, mission.rewardCredits, mission.lockedReason, onClaimed],
  );

  const handleCta = useCallback(() => {
    if (isDailyCheckin) {
      void claim("/api/missions/checkin");
      return;
    }
    // The share reward happens in the referral section — just scroll the director there.
    if (isShareViaReferral) {
      router.push(mission.actionUrl ?? "/director/rewards#referral");
      return;
    }
    // ONCE missions that are claimable right now → claim directly.
    if (mission.claimable) {
      void claim(`/api/missions/${mission.key}/claim`);
      return;
    }
    // Otherwise route the director to where they can complete the action.
    if (mission.actionUrl) router.push(mission.actionUrl);
  }, [
    claim,
    isDailyCheckin,
    isShareViaReferral,
    mission.actionUrl,
    mission.claimable,
    mission.key,
    router,
  ]);

  const ctaLabel = isDailyCheckin
    ? "출석하기"
    : isShareViaReferral
      ? mission.ctaLabel ?? "공유하기"
      : mission.claimable
        ? mission.ctaLabel ?? "받기"
        : mission.ctaLabel ?? "바로가기";
  // Show a navigate-only CTA when an action URL exists but the reward isn't claimable yet.
  // KAKAO_SHARE always shows its CTA (routes to the share section) until completed.
  const canAct =
    mission.claimable ||
    (isShareViaReferral && !mission.completed) ||
    (!mission.completed && Boolean(mission.actionUrl));

  return (
    <div
      className={cn(
        "flex flex-col rounded-2xl border bg-white p-4 shadow-sm transition-colors",
        mission.completed ? "border-emerald-100" : "border-gray-200/60",
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-xl",
            mission.completed ? "bg-emerald-50 text-emerald-600" : "bg-blue-50 text-blue-600",
          )}
        >
          <GrowthIcon iconKey={mission.iconKey} className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h3 className="truncate text-[14px] font-semibold text-gray-900">
              {mission.title}
            </h3>
            <span className="inline-flex shrink-0 items-center rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-bold tabular-nums text-blue-600">
              +{mission.rewardCredits}
            </span>
          </div>
          {mission.description && (
            <p className="mt-1 text-[12px] leading-snug text-gray-500">
              {mission.description}
            </p>
          )}
        </div>
      </div>

      <div className="mt-4">
        {mission.completed ? (
          <span className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-50 text-[13px] font-semibold text-emerald-600">
            <Check className="size-4" strokeWidth={2.4} />
            완료
          </span>
        ) : canAct ? (
          <button
            type="button"
            onClick={handleCta}
            disabled={busy}
            className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-xl bg-blue-600 text-[13px] font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : ctaLabel}
          </button>
        ) : (
          <span
            title={mission.lockedReason ?? undefined}
            className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-xl bg-gray-50 px-2 text-[12px] font-medium text-gray-400"
          >
            <Lock className="size-3.5" strokeWidth={1.9} />
            <span className="truncate">{mission.lockedReason ?? "조건 미충족"}</span>
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Referral section ────────────────────────────────────────────────────────

function ReferralSection({
  referral,
  onShared,
}: {
  referral: ReferralStats | null;
  onShared: () => void | Promise<void>;
}) {
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const copy = useCallback(
    async (text: string, kind: "code" | "link") => {
      try {
        await navigator.clipboard.writeText(text);
        if (kind === "code") {
          setCopiedCode(true);
          setTimeout(() => setCopiedCode(false), 1800);
          toast.success("추천 코드를 복사했어요");
        } else {
          setCopiedLink(true);
          setTimeout(() => setCopiedLink(false), 1800);
          toast.success("추천 링크를 복사했어요");
        }
      } catch {
        toast.error("복사에 실패했어요");
      }
    },
    [],
  );

  if (!referral) {
    return (
      <section id="referral" className="scroll-mt-20">
        <div className="rounded-2xl border border-gray-200/60 bg-white px-5 py-10 text-center text-[13px] text-gray-400 shadow-sm">
          추천 정보를 불러오지 못했습니다
        </div>
      </section>
    );
  }

  return (
    <section id="referral" className="scroll-mt-20">
      <div className="overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-sm">
        {/* Altruistic framing header */}
        <div className="bg-gradient-to-br from-blue-600 to-blue-700 px-6 py-6 text-white">
          <h2 className="text-[18px] font-bold leading-snug">
            동료 원장님께 30 크레딧을 선물하세요
          </h2>
          <p className="mt-1.5 text-[13px] leading-relaxed text-blue-100">
            추천 코드로 가입하면 두 학원 모두 크레딧을 받아요 (추천인 +50, 신규 학원 +30)
          </p>
        </div>

        <div className="space-y-5 px-6 py-5">
          {/* Code + link */}
          <div className="space-y-3">
            <div>
              <span className="block text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                내 추천 코드
              </span>
              <div className="mt-1.5 flex items-center gap-3">
                <span className="select-all font-mono text-[28px] font-extrabold tracking-[0.15em] text-gray-900">
                  {referral.code}
                </span>
                <button
                  type="button"
                  onClick={() => copy(referral.code, "code")}
                  aria-label="추천 코드 복사"
                  className="inline-flex size-9 items-center justify-center rounded-xl border border-gray-200 text-gray-500 transition-colors hover:border-blue-200 hover:text-blue-600"
                >
                  {copiedCode ? (
                    <Check className="size-4 text-emerald-600" strokeWidth={2.4} />
                  ) : (
                    <Copy className="size-4" strokeWidth={1.9} />
                  )}
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5">
              <Link2 className="size-4 shrink-0 text-gray-400" strokeWidth={1.9} />
              <span className="min-w-0 flex-1 truncate text-[12.5px] text-gray-600">
                {referral.link}
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => copy(referral.link, "link")}
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-gray-200 px-4 text-[13px] font-semibold text-gray-600 transition-colors hover:border-blue-200 hover:text-blue-600"
            >
              {copiedLink ? (
                <Check className="size-4 text-emerald-600" strokeWidth={2.4} />
              ) : (
                <Copy className="size-4" strokeWidth={1.9} />
              )}
              링크 복사
            </button>
            <KakaoShareButton link={referral.link} onShared={() => void onShared()} />
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-2 border-t border-gray-100 pt-4">
            <ReferralStat label="가입" value={referral.totalSignups} suffix="명" />
            <ReferralStat label="보상" value={referral.rewardedCount} suffix="건" />
            <ReferralStat label="적립" value={referral.creditsEarned} suffix="크레딧" />
          </div>
        </div>
      </div>
    </section>
  );
}

function ReferralStat({
  label,
  value,
  suffix,
}: {
  label: string;
  value: number;
  suffix: string;
}) {
  return (
    <div className="rounded-xl bg-gray-50 px-3 py-3 text-center">
      <span className="block text-[11px] font-medium text-gray-400">{label}</span>
      <span className="mt-0.5 block text-[18px] font-bold tabular-nums text-gray-900">
        {value.toLocaleString()}
        <span className="ml-0.5 text-[11px] font-medium text-gray-400">{suffix}</span>
      </span>
    </div>
  );
}
