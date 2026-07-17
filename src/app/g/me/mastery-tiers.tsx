"use client";

// ── 숙달 지도 어휘집 ───────────────────────────────────────────────────────
// 숙달 4티어(색 + 아이콘 형태 + 숫자)와 레슨 상태 배지의 정의를 한곳에 모은다.
// 색은 언제나 보조 채널이다 — 티어·배지는 아이콘 형태와 텍스트만으로도 읽힌다
// (색맹 안전 규약). mastery-map 과 읽는 법 시트가 이 파일을 공유한다.

import type { CSSProperties } from "react";
import {
  AlertCircle,
  AlertTriangle,
  BookOpen,
  Check,
  Circle,
  CircleDot,
  CheckCircle2,
  PlayCircle,
} from "lucide-react";

export type MKey = "mastered" | "learning" | "weak" | "new";

export const M: Record<MKey, { label: string; color: string; Icon: typeof Circle }> = {
  mastered: { label: "완성", color: "var(--gd-good)", Icon: CheckCircle2 },
  learning: { label: "숙달", color: "var(--gd-blue)", Icon: CircleDot },
  weak: { label: "취약", color: "var(--gd-bad)", Icon: AlertTriangle },
  new: { label: "미시작", color: "var(--gd-ink-3)", Icon: Circle },
};

// 숙달 4단계 — heat() 광역밴드·data-tone=good(≥70) 관례와 정합(임계 50/85).
export const mkey = (score: number, attempts: number): MKey =>
  attempts === 0 ? "new" : score < 50 ? "weak" : score < 85 ? "learning" : "mastered";

/** 긴 한 줄 설명은 문단으로 흘리지 않고 2줄에서 자른다(못생긴 줄바꿈 방지). */
export const CLAMP2: CSSProperties = {
  display: "-webkit-box",
  WebkitLineClamp: 2,
  WebkitBoxOrient: "vertical",
  overflow: "hidden",
};

// ── 레슨(개념 학습) 진행 ────────────────────────────────────────────────────
// lesson === null 은 "이 개념에는 아직 레슨 콘텐츠가 없다"는 뜻이며, 그 개념은
// 드릴로만 안내한다(배지를 달지 않는다 — 학생에게 없는 상태를 발명하지 않는다).

export interface LessonState {
  completed: boolean;
  /** 이어보기 지점(0-based). 0 = 아직 첫 블록 = 미시작 취급. */
  lastBlockIndex: number;
  blocksTotal: number;
  /** 1 자신 없음 ~ 3 설명할 수 있음 */
  confidence: number | null;
}

export type LKey = "done" | "doing" | "todo";

export const lkey = (l: LessonState): LKey =>
  l.completed ? "done" : l.lastBlockIndex > 0 ? "doing" : "todo";

export const L: Record<LKey, { label: string; color: string; Icon: typeof Circle }> = {
  done: { label: "학습 완료", color: "var(--gd-good)", Icon: Check },
  doing: { label: "학습 중", color: "var(--gd-blue)", Icon: PlayCircle },
  todo: { label: "레슨 미시작", color: "var(--gd-ink-2)", Icon: BookOpen },
};

/** 레슨 상태 배지 — 미시작 / 학습 중(n/m) / 완료. 아이콘 + 텍스트 이중 부호화. */
export function LessonBadge({ lesson }: { lesson: LessonState }) {
  const k = lkey(lesson);
  const Ic = L[k].Icon;
  const text =
    k === "doing"
      ? `학습 중 ${lesson.lastBlockIndex}/${lesson.blocksTotal}`
      : L[k].label;
  return (
    <span
      className="gd-t-3xs inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 font-semibold"
      style={{
        color: L[k].color,
        background: k === "todo" ? "var(--gd-paper)" : "transparent",
        border: `1px solid ${k === "todo" ? "var(--gd-line)" : L[k].color}`,
      }}
    >
      <Ic size={11} strokeWidth={2.25} />
      {text}
    </span>
  );
}

/**
 * '자신 없음' 배지 — 레슨 끝에서 학생이 스스로 confidence=1 을 눌렀다는 뜻이다.
 * 숙달 점수가 높아도 이 신호는 덮이지 않는다(자가 진단은 별개 채널).
 * 색은 --gd-bad 계열(주황·앰버 금지).
 */
export function LowConfidenceBadge() {
  return (
    <span
      className="gd-t-3xs inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 font-semibold"
      style={{
        color: "var(--gd-bad)",
        background: "var(--gd-bad-soft)",
        border: "1px solid var(--gd-bad)",
      }}
    >
      <AlertCircle size={11} strokeWidth={2.25} />
      자신 없음
    </span>
  );
}

export const isLowConfidence = (l: LessonState | null): boolean => l?.confidence === 1;
