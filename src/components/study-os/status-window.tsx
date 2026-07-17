"use client";

// ============================================================================
// 상태창(STATUS WINDOW) — 게임 소설의 시스템 창 (docs/study-os-spec.md §14)
//
// /g 라이트 지면 위에 소환되는 딥 네이비 시스템 패널(.gd-sys 계열, gd.css 정본).
//  - open 이 true 로 바뀔 때마다 GET /api/grammar-drill/stats 를 새로 읽는다
//    (단일 소스 — 클라이언트 캐시 없음). 실패 시 "다시 시도".
//  - 다크 패널 안 텍스트는 .gd-sys 가 잡아주는 기본(#dbe7f7)과 .gd-sys-label 만
//    쓴다 — var(--gd-ink) 는 라이트 잉크라 여기서는 보이지 않는다.
//  - 조작은 전부 탭: 배경 탭·X 버튼·ESC 로 닫는다. open=false 면 null.
// ============================================================================

import { useEffect, useRef, useState } from "react";
import {
  Flame,
  Heart,
  Lock,
  Repeat2,
  Shield,
  Swords,
  Trophy,
  X,
  type LucideIcon,
} from "lucide-react";
import type { StatusPayload } from "@/lib/study-os/stats";

// ── 시스템 패널 보조 톤 — gd.css .gd-sys 팔레트의 연장(라이트 토큰 사용 금지) ──

/** 부가 설명·수치 단위의 감쇠 — 색을 새로 만들지 않고 기본 잉크를 낮춘다 */
const SYS_DIM = { opacity: 0.62 } as const;
/** 로딩 스켈레톤 바 배경(다크 패널 전용) */
const SYS_SKELETON_BG = "rgba(127, 178, 255, 0.08)";

/** 0~1 비율 → width 퍼센트 문자열(클램프 포함) */
function pct(ratio: number): string {
  const r = Math.min(1, Math.max(0, ratio));
  return `${Math.round(r * 1000) / 10}%`;
}

// ── 조각 컴포넌트 ───────────────────────────────────────────────────────────

function SysSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section>
      <p className="gd-sys-label">{label}</p>
      <div className="mt-2">{children}</div>
    </section>
  );
}

/** 전적 그리드 셀 — 숫자는 .gd-mono 크게 */
function RecordCell({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="gd-sys-panel p-3">
      <p className="gd-sys-label flex items-center gap-1.5">
        <Icon className="h-3 w-3 shrink-0" strokeWidth={2} />
        {label}
      </p>
      <p className="gd-mono gd-t-xl mt-1 font-bold">{value}</p>
    </div>
  );
}

/** 로딩 스켈레톤 — 패널 레이아웃의 실루엣만 잡는다 */
function SysSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-hidden="true">
      <div className="animate-pulse rounded-lg" style={{ height: "1.5rem", width: "40%", background: SYS_SKELETON_BG }} />
      <div className="animate-pulse rounded-lg" style={{ height: "2rem", width: "64%", background: SYS_SKELETON_BG }} />
      <div className="animate-pulse rounded-xl" style={{ height: "5.75rem", background: SYS_SKELETON_BG }} />
      <div className="animate-pulse rounded-xl" style={{ height: "12rem", background: SYS_SKELETON_BG }} />
      <div className="grid grid-cols-2 gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="animate-pulse rounded-xl" style={{ height: "4.5rem", background: SYS_SKELETON_BG }} />
        ))}
      </div>
    </div>
  );
}

// ── 상태창 본체 ─────────────────────────────────────────────────────────────

export function StatusWindow({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [data, setData] = useState<StatusPayload | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  /** "다시 시도" 재요청 트리거 */
  const [tick, setTick] = useState(0);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  // 열 때마다 새로 fetch — 상태창의 단일 소스는 서버다(§14)
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setStatus("loading");
    (async () => {
      try {
        const res = await fetch("/api/grammar-drill/stats", { cache: "no-store" });
        if (!res.ok) throw new Error(`stats ${res.status}`);
        const json = (await res.json()) as StatusPayload;
        if (!json.ok) throw new Error("stats payload not ok");
        if (!cancelled) {
          setData(json);
          setStatus("ready");
        }
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, tick]);

  // ESC 로 닫기
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // 열리면 닫기 버튼으로 포커스 이동(키보드 사용자)
  useEffect(() => {
    if (open) closeRef.current?.focus();
  }, [open]);

  if (!open) return null;

  const s = data?.snapshot;
  const maxLensXp = data ? Math.max(0, ...data.lenses.map((l) => l.xp)) : 0;
  const remainXp = data ? Math.max(0, data.level.span - data.level.into) : 0;

  return (
    <>
      <button type="button" aria-label="상태창 닫기" className="gd-sys-backdrop" onClick={onClose} />
      <div className="gd-sys" role="dialog" aria-modal="true" aria-label="상태창">
        {/* ── 헤더 — 시스템 라벨 + 닫기 ── */}
        <header className="flex items-center justify-between gap-3 px-4 pb-3 pt-4">
          <span className="gd-sys-label">STATUS WINDOW · 어법 스텟</span>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="상태창 닫기"
            className="-my-2 -mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
          >
            <X className="h-4.5 w-4.5" strokeWidth={2} />
          </button>
        </header>
        <div className="gd-sys-hairline" />

        {/* ── 본문 — 내부 스크롤 ── */}
        {status === "error" ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-10">
            <p className="gd-t-sm font-semibold">스텟을 불러오지 못했습니다.</p>
            <p className="gd-t-2xs text-center" style={SYS_DIM}>
              네트워크 상태를 확인한 뒤 다시 시도하십시오.
            </p>
            <button
              type="button"
              className="gd-btn mt-2"
              style={{ border: "1px solid rgba(127, 178, 255, 0.3)", color: "#dbe7f7" }}
              onClick={() => setTick((t) => t + 1)}
            >
              다시 시도
            </button>
          </div>
        ) : (
          <div className="gd-scroll min-h-0 flex-1 px-4 py-4">
            {status === "loading" || !data || !s ? (
              <SysSkeleton />
            ) : (
              <div className="flex flex-col gap-5">
                {/* 소환자 — 이름 + 활성 칭호 */}
                <div className="flex flex-col items-start gap-1.5">
                  <p className="gd-t-lg font-bold">{data.studentName}</p>
                  <span className="gd-sys-title-badge" data-active="true">
                    {data.activeTitle.name}
                  </span>
                </div>

                {/* 레벨 · XP 게이지 */}
                <section className="gd-sys-panel p-4">
                  <div className="flex items-end justify-between gap-3">
                    <p className="flex items-baseline gap-1.5">
                      <span className="gd-sys-label">Lv.</span>
                      <span className="gd-mono gd-t-2xl font-bold leading-none">{data.level.level}</span>
                    </p>
                    <p className="gd-t-2xs" style={SYS_DIM}>
                      다음 레벨까지 <span className="gd-mono font-bold">{remainXp.toLocaleString()}</span> XP
                    </p>
                  </div>
                  <div className="gd-sys-xp mt-3">
                    <span style={{ width: pct(data.level.ratio) }} />
                  </div>
                  <p className="gd-t-3xs mt-1.5 text-right" style={SYS_DIM}>
                    누적 <span className="gd-mono">{s.xp.toLocaleString()}</span> XP
                  </p>
                </section>

                {/* 판별 렌즈 5축 — 최대 렌즈 XP 대비 상대 바(전부 0이면 0%) */}
                <SysSection label="판별 렌즈 · 5축">
                  <div className="gd-sys-panel flex flex-col gap-3 p-4">
                    {data.lenses.map((lens) => (
                      <div key={lens.id}>
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="gd-t-2xs min-w-0 flex-1 truncate font-semibold">
                            <span className="gd-mono mr-1.5" style={SYS_DIM}>
                              {lens.id}
                            </span>
                            {lens.name}
                          </p>
                          <p className="gd-mono gd-t-2xs shrink-0 font-bold">{lens.xp.toLocaleString()}</p>
                        </div>
                        <div className="gd-sys-bar mt-1.5">
                          <span style={{ width: maxLensXp > 0 ? pct(lens.xp / maxLensXp) : "0%" }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </SysSection>

                {/* 파트 4축 — 완주 done/total 진행 */}
                <SysSection label="파트 진행 · 4축">
                  <div className="gd-sys-panel flex flex-col gap-3 p-4">
                    {data.parts.map((part) => (
                      <div key={part.id}>
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="gd-t-2xs min-w-0 flex-1 truncate font-semibold">{part.name}</p>
                          <p className="gd-mono gd-t-2xs shrink-0">
                            <span className="font-bold">{part.done}</span>
                            <span style={SYS_DIM}>/{part.total}</span>
                          </p>
                        </div>
                        <div className="gd-sys-bar mt-1.5">
                          <span style={{ width: part.total > 0 ? pct(part.done / part.total) : "0%" }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </SysSection>

                {/* 전적 그리드 */}
                <SysSection label="전적">
                  <div className="grid grid-cols-2 gap-2">
                    <RecordCell icon={Trophy} label="완주 레슨" value={s.lessonsCompleted.toLocaleString()} />
                    <RecordCell icon={Repeat2} label="재수련" value={s.replays.toLocaleString()} />
                    <RecordCell icon={Swords} label="보스 전적 승-패" value={`${s.bossWins}-${s.bossLosses}`} />
                    <RecordCell icon={Flame} label="최고 콤보" value={s.bestCombo.toLocaleString()} />
                    <RecordCell icon={Heart} label="퍼펙트" value={s.gamePerfects.toLocaleString()} />
                    <RecordCell icon={Shield} label="관문 통과" value={s.memoryGatePasses.toLocaleString()} />
                  </div>
                </SysSection>

                {/* 칭호 컬렉션 — 획득 + 다음에 노릴 것(잠금 실루엣) */}
                <SysSection label="칭호 컬렉션">
                  {data.unlocked.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {data.unlocked.map((t) => (
                        <span
                          key={t.key}
                          className="gd-sys-title-badge"
                          data-active={t.key === data.activeTitle.key ? "true" : undefined}
                        >
                          {t.name}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="gd-t-2xs" style={SYS_DIM}>
                      아직 획득한 칭호가 없습니다. 레슨을 완주하면 첫 칭호가 열립니다.
                    </p>
                  )}
                  {data.nextHints.length > 0 && (
                    <div className="mt-3 flex flex-col gap-2">
                      {data.nextHints.map((t) => (
                        <div key={t.key} className="flex flex-col items-start gap-0.5">
                          <span className="gd-sys-title-badge" data-locked="true">
                            <Lock className="h-3 w-3 shrink-0" strokeWidth={2} />
                            {t.name}
                          </span>
                          {t.hint && (
                            <p className="gd-t-3xs pl-1" style={SYS_DIM}>
                              {t.hint}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </SysSection>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
