"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, Search, Users } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ALL_AUDIENCES,
  AUDIENCE_LABELS,
  type BannerAudience,
} from "@/lib/site-banners/templates";
import {
  getBannerTargetCandidates,
  type BannerTargetCandidate,
} from "@/actions/admin-banners";
import {
  FilterDropdown,
  DropdownOptions,
} from "@/components/admin/members-list-client/filter-dropdown";
import { FilterPill } from "@/components/admin/members-list-client/subcomponents";

type ProviderFilter = "all" | "google" | "kakao" | "other";
type ActiveFilter = "all" | "active" | "inactive";
type CreditFilter = "all" | "zero" | "lt100" | "lt1000" | "gte1000";
type ExpiryFilter = "all" | "expired" | "d7" | "d30" | "none";

export interface TargetSelection {
  audiences: BannerAudience[];
  targetMode: "ALL" | "SPECIFIC";
  academyIds: string[];
}

const DAY = 24 * 60 * 60 * 1000;

function providerLabel(p: string | null): string {
  if (p === "google") return "구글";
  if (p === "kakao") return "카카오";
  return "기타";
}
function matchesProvider(p: string | null, f: ProviderFilter): boolean {
  if (f === "all") return true;
  if (f === "other") return p !== "google" && p !== "kakao";
  return p === f;
}
function matchesCredit(balance: number, f: CreditFilter): boolean {
  switch (f) {
    case "zero":
      return balance <= 0;
    case "lt100":
      return balance >= 1 && balance <= 99;
    case "lt1000":
      return balance >= 100 && balance <= 999;
    case "gte1000":
      return balance >= 1000;
    default:
      return true;
  }
}
function matchesExpiry(expiresAt: string | null, f: ExpiryFilter, now: number): boolean {
  if (f === "all") return true;
  if (f === "none") return !expiresAt;
  if (!expiresAt) return false;
  const t = new Date(expiresAt).getTime();
  if (Number.isNaN(t)) return false;
  const diff = t - now;
  if (f === "expired") return diff < 0;
  if (f === "d7") return diff >= 0 && diff <= 7 * DAY;
  if (f === "d30") return diff >= 0 && diff <= 30 * DAY;
  return true;
}
/** 가입일 범위 필터 — from/to 는 "YYYY-MM-DD" (빈 문자열이면 미지정). */
function matchesSignupRange(createdAt: string, from: string, to: string): boolean {
  if (!from && !to) return true;
  const t = new Date(createdAt).getTime();
  if (Number.isNaN(t)) return false;
  if (from) {
    const f = new Date(`${from}T00:00:00`).getTime();
    if (!Number.isNaN(f) && t < f) return false;
  }
  if (to) {
    const e = new Date(`${to}T23:59:59.999`).getTime();
    if (!Number.isNaN(e) && t > e) return false;
  }
  return true;
}

function toDateInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function todayInput(): string {
  return toDateInput(new Date());
}
function daysAgoInput(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return toDateInput(d);
}
/** "2026-07-03" → "26.07.03" (트리거 요약용). */
function shortDate(iso: string): string {
  return iso ? iso.slice(2).replace(/-/g, ".") : "…";
}

const PROVIDER_OPTS: [ProviderFilter, string][] = [
  ["all", "전체"],
  ["google", "구글"],
  ["kakao", "카카오"],
  ["other", "기타"],
];
const STATUS_OPTS: [ActiveFilter, string][] = [
  ["all", "전체"],
  ["active", "활성"],
  ["inactive", "비활성"],
];
const CREDIT_OPTS: [CreditFilter, string][] = [
  ["all", "전체"],
  ["zero", "0"],
  ["lt100", "1~99"],
  ["lt1000", "100~999"],
  ["gte1000", "1000+"],
];
const EXPIRY_OPTS: [ExpiryFilter, string][] = [
  ["all", "전체"],
  ["d7", "7일 이내"],
  ["d30", "30일 이내"],
  ["expired", "만료됨"],
  ["none", "없음"],
];
function labelOf<T extends string>(opts: [T, string][], v: T): string {
  return opts.find(([val]) => val === v)?.[1] ?? "";
}

// Shared column template for the member table (header + rows stay aligned):
// checkbox · 회원 · 가입경로 · 상태 · 크레딧 · 소멸시효 · 가입일 · 구입상품
const ROW_GRID =
  "grid grid-cols-[20px_minmax(150px,1.7fr)_54px_48px_72px_60px_66px_minmax(104px,1.1fr)] items-center gap-x-3";

const PILL = (activeState: boolean) =>
  cn(
    "rounded-md border px-2.5 py-1 text-[12px] font-bold transition-colors",
    activeState
      ? "border-blue-300 bg-blue-50 text-blue-700"
      : "border-slate-200 text-slate-500 hover:bg-slate-50",
  );

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="w-[52px] shrink-0 text-[11px] font-bold text-slate-400">{label}</span>
      {children}
    </div>
  );
}

export function BannerTargetPicker({
  open,
  onOpenChange,
  audiences: initialAudiences,
  targetMode: initialMode,
  selectedIds,
  onConfirm,
  hideRole = false,
  hideScope = false,
  title = "노출 대상 설정",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  audiences: BannerAudience[];
  targetMode: "ALL" | "SPECIFIC";
  selectedIds: string[];
  onConfirm: (selection: TargetSelection) => void;
  /** 역할(원장/강사/학생) 행 숨김 — 학원 단위 대상 지정 등에서 사용. */
  hideRole?: boolean;
  /** 범위(전체/특정) 행 숨김 — 항상 특정 대상 선택으로 고정. */
  hideScope?: boolean;
  title?: string;
}) {
  const [candidates, setCandidates] = useState<BannerTargetCandidate[] | null>(null);
  const [loading, setLoading] = useState(false);

  const [audiences, setAudiences] = useState<BannerAudience[]>(initialAudiences);
  const [mode, setMode] = useState<"ALL" | "SPECIFIC">(initialMode);
  const [selected, setSelected] = useState<Set<string>>(new Set(selectedIds));

  const [search, setSearch] = useState("");
  const [provider, setProvider] = useState<ProviderFilter>("all");
  const [active, setActive] = useState<ActiveFilter>("all");
  const [credit, setCredit] = useState<CreditFilter>("all");
  const [expiry, setExpiry] = useState<ExpiryFilter>("all");
  const [signupFrom, setSignupFrom] = useState<string>("");
  const [signupTo, setSignupTo] = useState<string>("");
  const [product, setProduct] = useState<string>("all");

  // Seed from props + (lazily) load candidates each time the picker opens.
  useEffect(() => {
    if (!open) return;
    setAudiences(initialAudiences);
    setMode(initialMode);
    setSelected(new Set(selectedIds));
    setSearch("");
    setProvider("all");
    setActive("all");
    setCredit("all");
    setExpiry("all");
    setSignupFrom("");
    setSignupTo("");
    setProduct("all");
    if (candidates === null && !loading) {
      setLoading(true);
      getBannerTargetCandidates()
        .then((rows) => setCandidates(rows))
        .catch(() => setCandidates([]))
        .finally(() => setLoading(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const productOptions = useMemo(() => {
    const set = new Set<string>();
    for (const c of candidates ?? []) if (c.lastProductName) set.add(c.lastProductName);
    return Array.from(set).sort();
  }, [candidates]);

  const filtered = useMemo(() => {
    const list = candidates ?? [];
    const now = Date.now();
    const q = search.trim().toLowerCase();
    return list.filter((c) => {
      if (!matchesProvider(c.provider, provider)) return false;
      if (active === "active" && !c.isActive) return false;
      if (active === "inactive" && c.isActive) return false;
      if (!matchesCredit(c.balance, credit)) return false;
      if (!matchesExpiry(c.expiresAt, expiry, now)) return false;
      if (!matchesSignupRange(c.createdAt, signupFrom, signupTo)) return false;
      if (product !== "all" && c.lastProductName !== product) return false;
      if (q) {
        const hay = `${c.memberName} ${c.academyName} ${c.email}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [candidates, search, provider, active, credit, expiry, signupFrom, signupTo, product]);

  const filteredIds = useMemo(() => filtered.map((c) => c.academyId), [filtered]);
  const allFilteredSelected =
    filteredIds.length > 0 && filteredIds.every((id) => selected.has(id));

  function toggleAudience(a: BannerAudience) {
    setAudiences((prev) => {
      const has = prev.includes(a);
      const next = has ? prev.filter((x) => x !== a) : [...prev, a];
      return next.length ? next : prev;
    });
  }
  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleAllFiltered() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) filteredIds.forEach((id) => next.delete(id));
      else filteredIds.forEach((id) => next.add(id));
      return next;
    });
  }

  function fmtBalance(n: number) {
    return n.toLocaleString("ko-KR");
  }
  function fmtExpiry(iso: string | null, now: number) {
    if (!iso) return "무기한";
    const t = new Date(iso).getTime();
    if (Number.isNaN(t)) return "무기한";
    const days = Math.ceil((t - now) / DAY);
    if (days < 0) return "만료";
    return `D-${days}`;
  }
  function fmtDate(iso: string) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "-";
    const p = (n: number) => String(n).padStart(2, "0");
    return `${String(d.getFullYear()).slice(2)}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
  }
  const now = Date.now();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[calc(100dvh-4rem)] w-[calc(100vw-3rem)] max-w-[1080px] flex-col gap-0 overflow-hidden p-0 sm:w-[calc(100vw-3rem)] sm:max-w-[1080px] sm:p-0">
        <DialogHeader className="shrink-0 border-b border-slate-200 px-5 py-3.5">
          <DialogTitle className="flex items-center gap-2 text-[15px] font-bold text-slate-900">
            <Users className="size-4 text-slate-400" />
            {title}
            {mode === "SPECIFIC" && (
              <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-600">
                {selected.size}{hideRole ? "곳" : "명"} 선택
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        {/* Role + scope */}
        {(!hideRole || !hideScope) && (
          <div className="shrink-0 space-y-2.5 border-b border-slate-100 px-5 py-3">
            {!hideRole && (
              <FilterRow label="역할">
                {ALL_AUDIENCES.map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => toggleAudience(a)}
                    className={PILL(audiences.includes(a))}
                  >
                    {AUDIENCE_LABELS[a]}
                  </button>
                ))}
              </FilterRow>
            )}
            {!hideScope && (
              <FilterRow label="범위">
                <button type="button" onClick={() => setMode("ALL")} className={PILL(mode === "ALL")}>
                  전체
                </button>
                <button
                  type="button"
                  onClick={() => setMode("SPECIFIC")}
                  className={PILL(mode === "SPECIFIC")}
                >
                  특정 대상
                </button>
              </FilterRow>
            )}
          </div>
        )}

        {mode === "ALL" ? (
          <div className="flex min-h-0 flex-1 items-center justify-center px-6 text-center">
            <p className="text-[13px] leading-relaxed text-slate-500">
              선택한 역할({audiences.map((a) => AUDIENCE_LABELS[a]).join("·") || "없음"})의{" "}
              <b className="text-slate-700">모든 학원</b>에 노출됩니다.
              <br />
              특정 학원만 지정하려면 위에서 <b>특정 대상</b>을 선택하세요.
            </p>
          </div>
        ) : (
          <>
            {/* Member filters — 회원 관리와 동일한 검색 + 팝오버 드롭다운 패턴 */}
            <div className="shrink-0 border-b border-slate-100 px-5 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative w-full min-w-[200px] sm:w-72">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="회원명 · 학원명 · 이메일 검색"
                    className="h-9 w-full min-w-0 rounded-md border border-gray-100 bg-gray-50 pl-9 pr-3 text-[13px] outline-none transition-colors focus-visible:border-blue-300 focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-blue-100"
                  />
                </div>

                <FilterDropdown
                  label="가입경로"
                  active={provider !== "all"}
                  summary={labelOf(PROVIDER_OPTS, provider)}
                >
                  <DropdownOptions>
                    {PROVIDER_OPTS.map(([v, label]) => (
                      <FilterPill key={v} active={provider === v} onClick={() => setProvider(v)} label={label} />
                    ))}
                  </DropdownOptions>
                </FilterDropdown>

                <FilterDropdown label="상태" active={active !== "all"} summary={labelOf(STATUS_OPTS, active)}>
                  <DropdownOptions>
                    {STATUS_OPTS.map(([v, label]) => (
                      <FilterPill key={v} active={active === v} onClick={() => setActive(v)} label={label} />
                    ))}
                  </DropdownOptions>
                </FilterDropdown>

                <FilterDropdown label="크레딧" active={credit !== "all"} summary={labelOf(CREDIT_OPTS, credit)}>
                  <DropdownOptions>
                    {CREDIT_OPTS.map(([v, label]) => (
                      <FilterPill key={v} active={credit === v} onClick={() => setCredit(v)} label={label} />
                    ))}
                  </DropdownOptions>
                </FilterDropdown>

                <FilterDropdown label="소멸시효" active={expiry !== "all"} summary={labelOf(EXPIRY_OPTS, expiry)}>
                  <DropdownOptions>
                    {EXPIRY_OPTS.map(([v, label]) => (
                      <FilterPill key={v} active={expiry === v} onClick={() => setExpiry(v)} label={label} />
                    ))}
                  </DropdownOptions>
                </FilterDropdown>

                <FilterDropdown
                  label="가입일"
                  active={Boolean(signupFrom || signupTo)}
                  summary={
                    signupFrom || signupTo
                      ? `${shortDate(signupFrom)}~${shortDate(signupTo)}`
                      : undefined
                  }
                  contentClassName="w-[260px]"
                >
                  <div className="flex flex-col gap-2.5">
                    <div className="flex flex-wrap gap-1.5">
                      <FilterPill
                        active={signupFrom === daysAgoInput(7) && signupTo === todayInput()}
                        onClick={() => {
                          setSignupFrom(daysAgoInput(7));
                          setSignupTo(todayInput());
                        }}
                        label="최근 7일"
                      />
                      <FilterPill
                        active={signupFrom === daysAgoInput(30) && signupTo === todayInput()}
                        onClick={() => {
                          setSignupFrom(daysAgoInput(30));
                          setSignupTo(todayInput());
                        }}
                        label="최근 30일"
                      />
                      <FilterPill
                        active={signupFrom === daysAgoInput(90) && signupTo === todayInput()}
                        onClick={() => {
                          setSignupFrom(daysAgoInput(90));
                          setSignupTo(todayInput());
                        }}
                        label="최근 90일"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="flex items-center justify-between gap-2 text-[12px] font-semibold text-slate-500">
                        시작일
                        <input
                          type="date"
                          value={signupFrom}
                          max={signupTo || undefined}
                          onChange={(e) => setSignupFrom(e.target.value)}
                          className="rounded-md border border-slate-200 px-2 py-1 text-[12px] text-slate-700 outline-none focus:border-blue-400"
                        />
                      </label>
                      <label className="flex items-center justify-between gap-2 text-[12px] font-semibold text-slate-500">
                        종료일
                        <input
                          type="date"
                          value={signupTo}
                          min={signupFrom || undefined}
                          onChange={(e) => setSignupTo(e.target.value)}
                          className="rounded-md border border-slate-200 px-2 py-1 text-[12px] text-slate-700 outline-none focus:border-blue-400"
                        />
                      </label>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSignupFrom("");
                        setSignupTo("");
                      }}
                      className="self-start text-[11px] font-semibold text-slate-400 hover:text-rose-500"
                    >
                      기간 초기화
                    </button>
                  </div>
                </FilterDropdown>

                <FilterDropdown
                  label="구입 상품"
                  active={product !== "all"}
                  summary={product !== "all" ? product : undefined}
                  contentClassName="max-w-[300px]"
                >
                  <div className="flex max-h-[260px] flex-col gap-2 overflow-y-auto">
                    <div className="flex flex-wrap gap-1.5">
                      <FilterPill active={product === "all"} onClick={() => setProduct("all")} label="전체" />
                      {productOptions.map((name) => (
                        <FilterPill key={name} active={product === name} onClick={() => setProduct(name)} label={name} />
                      ))}
                    </div>
                    {productOptions.length === 0 && (
                      <span className="text-[11px] text-slate-400">구입 이력이 있는 회원이 없어요</span>
                    )}
                  </div>
                </FilterDropdown>
              </div>
            </div>

            {/* List header */}
            <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-5 py-2">
              <button
                type="button"
                onClick={toggleAllFiltered}
                disabled={filteredIds.length === 0}
                className="inline-flex items-center gap-2 text-[12px] font-semibold text-slate-600 disabled:opacity-40"
              >
                <span
                  className={cn(
                    "flex size-4 items-center justify-center rounded border transition-colors",
                    allFilteredSelected ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 bg-white",
                  )}
                >
                  {allFilteredSelected && <Check className="size-3" />}
                </span>
                현재 목록 전체 선택 ({filteredIds.length})
              </button>
              {selected.size > 0 && (
                <button
                  type="button"
                  onClick={() => setSelected(new Set())}
                  className="text-[12px] font-semibold text-slate-400 hover:text-rose-500"
                >
                  선택 해제
                </button>
              )}
            </div>

            {/* Column header */}
            <div
              className={cn(
                ROW_GRID,
                "shrink-0 border-b border-slate-100 bg-slate-50 px-5 py-1.5 text-[11px] font-bold text-slate-400",
              )}
            >
              <span />
              <span>회원 · 학원</span>
              <span>가입경로</span>
              <span>상태</span>
              <span className="text-right">크레딧</span>
              <span>소멸</span>
              <span>가입일</span>
              <span>구입상품</span>
            </div>

            {/* List */}
            <div className="min-h-0 flex-1 overflow-y-auto">
              {loading ? (
                <div className="flex h-full items-center justify-center gap-2 text-slate-400">
                  <Loader2 className="size-4 animate-spin" />
                  <span className="text-[13px]">불러오는 중…</span>
                </div>
              ) : filtered.length === 0 ? (
                <div className="flex h-full items-center justify-center text-[13px] text-slate-400">
                  조건에 맞는 회원이 없어요
                </div>
              ) : (
                <ul>
                  {filtered.map((c) => {
                    const checked = selected.has(c.academyId);
                    const expired = c.expiresAt ? new Date(c.expiresAt).getTime() < now : false;
                    return (
                      <li key={c.academyId}>
                        <button
                          type="button"
                          onClick={() => toggle(c.academyId)}
                          className={cn(
                            ROW_GRID,
                            "w-full border-b border-slate-50 px-5 py-2 text-left transition-colors",
                            checked ? "bg-blue-50/50" : "hover:bg-slate-50",
                          )}
                        >
                          <span
                            className={cn(
                              "flex size-5 shrink-0 items-center justify-center rounded border transition-colors",
                              checked ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 bg-white",
                            )}
                          >
                            {checked && <Check className="size-3.5" />}
                          </span>
                          {/* 회원 · 학원 */}
                          <span className="min-w-0">
                            <span className="block truncate text-[13px] font-bold text-slate-900">
                              {c.memberName}
                            </span>
                            <span className="block truncate text-[11px] text-slate-400">
                              {c.academyName} · {c.email}
                            </span>
                          </span>
                          {/* 가입경로 */}
                          <span className="truncate text-[12px] text-slate-500">
                            {providerLabel(c.provider)}
                          </span>
                          {/* 상태 */}
                          <span
                            className={cn(
                              "text-[12px] font-semibold",
                              c.isActive ? "text-emerald-600" : "text-slate-400",
                            )}
                          >
                            {c.isActive ? "활성" : "비활성"}
                          </span>
                          {/* 크레딧 */}
                          <span className="text-right text-[12px] tabular-nums text-slate-600">
                            {fmtBalance(c.balance)}
                          </span>
                          {/* 소멸시효 */}
                          <span className={cn("text-[12px] tabular-nums", expired ? "text-rose-500" : "text-slate-500")}>
                            {fmtExpiry(c.expiresAt, now)}
                          </span>
                          {/* 가입일 */}
                          <span className="text-[12px] tabular-nums text-slate-500">
                            {fmtDate(c.createdAt)}
                          </span>
                          {/* 구입상품 */}
                          <span className="truncate text-[12px] text-slate-500">
                            {c.lastProductName ?? "-"}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </>
        )}

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-slate-200 px-5 py-3">
          <span className="text-[12px] font-semibold text-slate-500">
            {!hideRole && (
              <>
                {audiences.map((a) => AUDIENCE_LABELS[a]).join("·") || "역할 미선택"}
                {" · "}
              </>
            )}
            {mode === "ALL" ? "전체 학원" : (
              <>
                특정 <b className="text-slate-800">{selected.size}</b>
                {hideRole ? "개 학원" : "명"}
              </>
            )}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              취소
            </Button>
            <Button
              onClick={() => {
                onConfirm({
                  audiences,
                  targetMode: mode,
                  academyIds: mode === "SPECIFIC" ? Array.from(selected) : [],
                });
                onOpenChange(false);
              }}
            >
              적용
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
