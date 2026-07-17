"use client";

// 준비 중 트랙(듣기·어휘·내신) — "준비 중입니다" 한 줄로 끝내지 않는다.
// 무엇이 준비되고 있는지 · 지금 대신 무엇을 할지를 반드시 준다(docs/study-os-spec.md §1).

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BookA,
  ChevronLeft,
  Headphones,
  School,
  SpellCheck,
} from "lucide-react";
import type { StudyTrack } from "@/lib/study-os/tracks";

const ICONS = {
  SpellCheck,
  Headphones,
  BookA,
  School,
} as const;

export function PreparingTrack({ track }: { track: StudyTrack }) {
  const router = useRouter();
  const Icon = ICONS[track.icon];
  const what = track.preparing?.what ?? [];
  const insteadHref = track.preparing?.insteadHref ?? "/g/track/grammar";
  const insteadLabel = track.preparing?.insteadLabel ?? "어법 훈련 이어서 하기";

  return (
    <div className="gd-page mx-auto min-h-dvh px-5 pb-14">
      <header className="flex items-center gap-1 pt-[max(1rem,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={() => router.push("/g/home")}
          className="-ml-2 flex h-11 w-11 items-center justify-center rounded-full"
          style={{ color: "var(--gd-ink-2)" }}
          aria-label="홈으로"
        >
          <ChevronLeft className="h-5 w-5" strokeWidth={2} />
        </button>
        <p className="gd-label">학습 트랙</p>
      </header>

      <div className="mt-2 flex items-center gap-3">
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl"
          style={{ background: "var(--gd-paper)", color: "var(--gd-ink-2)" }}
        >
          <Icon className="h-5 w-5" strokeWidth={1.75} />
        </span>
        <div className="min-w-0">
          <h1 className="gd-t-xl font-bold tracking-tight">{track.name}</h1>
          <p className="gd-t-xs mt-0.5" style={{ color: "var(--gd-ink-3)" }}>
            준비 중인 트랙입니다
          </p>
        </div>
      </div>
      <p className="gd-prose-2 mt-2.5">{track.tagline}</p>

      {/* ── 무엇이 준비되고 있는가 ── */}
      <section className="gd-block mt-5">
        <span className="gd-block-head">준비 중인 내용</span>
        <ul className="mt-3 flex flex-col gap-2.5">
          {what.map((line, i) => (
            <li key={line} className="flex items-start gap-2.5">
              <span
                className="gd-mono gd-t-2xs mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md font-bold"
                style={{ background: "var(--gd-paper)", color: "var(--gd-ink-3)" }}
              >
                {i + 1}
              </span>
              <p className="gd-prose">{line}</p>
            </li>
          ))}
        </ul>
        <p
          className="gd-hairline-t gd-t-xs mt-3.5 pt-3"
          style={{ color: "var(--gd-ink-3)" }}
        >
          준비가 끝나면 홈 화면 최상단에서 먼저 알려드립니다.
        </p>
      </section>

      {/* ── 지금 대신 할 것 ── */}
      <section className="gd-block mt-4" data-tone="accent">
        <p className="gd-label mb-1.5" style={{ color: "var(--gd-blue)" }}>
          지금 할 수 있는 것
        </p>
        <p className="gd-prose font-bold">{insteadLabel}</p>
        <p className="gd-prose-2 mt-0.5">
          어법 트랙은 기초 골격 7유닛과 수능 판별 12유닛이 모두 열려 있습니다.
        </p>
        <Link href={insteadHref} className="gd-btn gd-btn-primary mt-3 w-full">
          어법 트랙으로 이동
          <ArrowRight className="h-4 w-4" strokeWidth={2} />
        </Link>
      </section>

      <Link href="/g/home" className="gd-btn gd-btn-ghost mt-3 w-full">
        홈으로 돌아가기
      </Link>
    </div>
  );
}
