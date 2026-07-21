"use client";

// ============================================================================
// 학습지 스터디 모드 — 아이템 렌더러 공유 계약·프리미티브
//
// 모든 아이템 렌더러(item-*.tsx)는 이 파일의 ItemRendererProps 계약만 의존한다.
// 렌더러끼리 서로 import 금지. 규범: docs/worksheet-study-spec.md §8.3.
//
// 프로토콜: judged === null 인 동안 렌더러가 자체 확인 UI 로 상호작용을 받고,
// 판정 시 onJudge 를 정확히 1회 호출한다. 셸이 verdict 배너·다음 버튼을 맡고,
// 렌더러는 judged 가 채워진 리렌더에서 정답·해설을 인라인 표시한다.
// ============================================================================

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import type { StudyItem } from "@/lib/worksheet-study/types";

export interface ItemJudgement {
  correct?: boolean;
  selfGrade?: "O" | "D" | "X";
  /** 학생 응답 요약 (로그용, ≤500자) */
  response?: string;
  hintUsed?: boolean;
}

export interface ItemRendererProps<T extends StudyItem = StudyItem> {
  item: T;
  /** 1 = 첫 시도, 2 = 재도전 큐 */
  attempt: number;
  /** null = 응답 중, non-null = 판정 완료(피드백 표시) */
  judged: ItemJudgement | null;
  /** 판정 — 시도당 정확히 1회 호출 */
  onJudge: (j: ItemJudgement) => void;
}

/** 렌더러 안 확인 버튼 — 전폭 프라이머리, 판정 후엔 렌더하지 않는다. */
export function ConfirmButton({
  disabled,
  onClick,
  label = "확인",
}: {
  disabled: boolean;
  onClick: () => void;
  label?: string;
}) {
  return (
    <button type="button" className="gd-btn gd-btn-primary mt-4 w-full" disabled={disabled} onClick={onClick}>
      {label}
    </button>
  );
}

/** 지문 참조 문항의 접이식 지문 카드 — 기본 접힘, 탭 펼침. */
export function PassageCollapse({ passage }: { passage: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="gd-card mb-3 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-3.5 py-2.5"
      >
        <span className="gd-label">지문 보기</span>
        <ChevronDown
          className={open ? "gd-chev h-4 w-4 rotate-180" : "gd-chev h-4 w-4"}
          strokeWidth={1.75}
          style={{ color: "var(--gd-ink-3)" }}
          aria-hidden
        />
      </button>
      {open ? (
        <p className="gd-en gd-t-sm px-3.5 pb-3.5" style={{ color: "var(--gd-ink)" }}>
          {passage}
        </p>
      ) : null}
    </div>
  );
}

/** 문항 지시문 라벨 — 상단 소형캡. */
export function ItemInstruction({ children }: { children: ReactNode }) {
  return <p className="gd-label mb-2">{children}</p>;
}

/** 판정 후 해설 박스 — 렌더러가 정답·해설을 인라인 표시할 때 사용. */
export function ExplanationBox({
  tone,
  title,
  children,
}: {
  tone: "good" | "bad";
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="gd-verdict mt-3 px-3.5 py-3" data-tone={tone}>
      <p
        className="gd-t-xs mb-1 font-bold"
        style={{ color: tone === "good" ? "var(--gd-good)" : "var(--gd-bad)" }}
      >
        {title}
      </p>
      <div className="gd-t-sm" style={{ color: "var(--gd-ink)" }}>
        {children}
      </div>
    </div>
  );
}
