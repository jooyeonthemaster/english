"use client";

// ============================================================================
// AI 지문 만들기 — "요청하신 내용이 이렇게 반영됐어요" 패널
//
// 이 패널이 하는 일은 하나다: **사실과 주장을 눈으로 갈라 놓는 것.**
//   · 단어(words)      — 서버가 본문에서 직접 대조한 **사실**. hit/miss 가 실측이다.
//   · 어법(grammarPoints) — 모델이 "넣었다"고 스스로 보고한 **주장**. 본문 대조를
//     하지 않았고 할 수도 없다(어법 라벨은 문자열 매칭 대상이 아니다).
//   두 층이 같은 모양·같은 채도로 나란히 렌더되던 것이 이 화면의 가장 조용한
//   거짓말이었다. 지금은 층위가 마크업으로 갈린다.
//     사실 = 채운 emerald 칩(+ 사용 횟수)  /  주장 = 점선 테두리 흰 칩 + "본문 대조는
//     하지 않았어요" 한 줄. 색으로 구분하지 않는 이유는 violet 이 금지색이기도 하지만,
//     **채움 여부가 곧 "대조했는가"** 라는 규칙을 화면 전체에서 한 번만 배우면 되게
//     하기 위해서다.
//   (스키마에 verified 플래그가 생기면 이 자리를 그 값으로 바꾼다. 지금은
//    AuthoringCoverage 에 그런 필드가 없어 '대조 가능한 축인가'로 갈랐다.)
//
// 회귀 방지 계약
//  - **이 패널은 상자를 갖지 않는다**(2026-07-26 전면 재조판). 구 마크업은
//    `rounded-md p-3 SURFACE.sunken` 회색 채움이었고, 그 12px 패딩이 결과 모달의
//    네 번째 좌측 정렬선이었다(모달 20 → 카드 33 → 회색 블록 45). 지금은 부모
//    (authoring-result-card 의 1열 측정 컬럼)가 정한 인셋 하나에 그대로 얹힌다.
//    제목도 채운 블록의 제목(13/600)이 아니라 **머리표**(Kicker 11/700)다 — 같은
//    컬럼의 '이렇게 설계했어요'·'왜 이렇게 썼나요'와 같은 층위라야 셋이 형제로
//    읽힌다. 채움을 다시 들이지 말 것: 채움은 이 화면에서 "본문 대조를 했다"는
//    뜻으로 이미 예약돼 있다(아래 fact 칩).
//  - **비었는지 판정하는 함수는 하나다**(hasAuthoringCoverage). 카드가 1열이 되며
//    부모의 사전 판정은 필요 없어졌다 — 패널을 조건 없이 렌더하고 비면 스스로
//    null 을 반환한다(flex 컬럼은 렌더 안 된 자식에 gap 을 주지 않는다). 다음
//    소비자가 생기면 이 함수를 쓰게 하라 — 조건을 손코딩해 두 벌로 가르지 말 것.
//  - **miss 단어를 숨기지 않는다.** 못 넣은 단어를 감추면 커버리지 %가 거짓말이 된다.
//  - hit/miss 는 **두 줄로 분리**한다. 한 줄에 섞어 정렬만 hit 우선으로 두면 정렬
//    기준이 화면에 안 보여 무작위 나열로 읽히고, 줄 그은 회색 칩이 "삭제됨"으로
//    읽힌다(터치 기기에는 hover 도 없어 title= 설명에 닿지 못한다). 줄 제목이
//    그 자리에서 뜻을 말하므로 line-through 같은 암호도 필요 없다.
//  - 칩이 12개를 넘으면 접되, 각 줄이 **자기 접기 상태**를 갖는다. 접기 버튼은
//    AuthoringButton size='sm'(h-7) 이라 손가락으로 실제로 눌린다 — 칩과 같은
//    높이로 두면 못 넣은 단어 목록에 닿는 유일한 통로가 사실상 막힌다.
//  - **분모가 지문 길이보다 크면 반드시 그 사실을 함께 말한다.** 대조 대상은 최대
//    200개(metrics.MAX_VOCAB_TERMS)인데 지문은 기본 165단어라, 200표제어를 다 넣는
//    것은 물리적으로 불가능하다. 설명 없이 "7%"만 찍으면 정상 결과가 실패로 읽힌다.
//    termsTruncated 가 켜져 있으면 "앞 200개만 대조했어요(전체 512개)"도 함께 말한다.
//  - 비율 판정은 **40~70%가 적정**이다. 100%를 목표로 읽히게 만들면 안 된다 —
//    표제어를 억지로 다 밀어 넣은 지문은 문장이 부자연스러워진다(과밀 경고).
//  - 화면 문구는 전량 passage-authoring-glossary.ts 경유(게이트 ⑤).
// ============================================================================

import { useState } from "react";
import { Check, Info } from "lucide-react";

import type { AuthoringCoverage } from "@/lib/passage-authoring/schema";
import { AUTHORING_COPY } from "@/lib/wording/passage-authoring-glossary";
import { cn } from "@/lib/utils";

import { AuthoringButton, Kicker } from "./authoring-primitives";
import { CHIP_H, DESK } from "./authoring-tokens";

/** 접기 임계치 — 이 수를 넘으면 "+N개"로 접는다(구 20 → 12: 두 줄로 갈라졌다). */
const CHIP_COLLAPSE_LIMIT = 12;

/** 적정 반영률 구간(%). 아래면 여유, 위면 과밀이다. */
const HEALTHY_LOW = 40;
const HEALTHY_HIGH = 70;

/**
 * 지문 길이 대비 "정상적으로 기대할 수 있는" 표제어 사용량(개). 실측 감각으로
 * 165단어 지문이면 대략 8~16개다 — 단어 10개당 1개 안팎이 상한이라고 본다.
 */
function expectedUseRange(targetWords: number): { low: number; high: number } {
  const high = Math.max(6, Math.round(targetWords / 10));
  return { low: Math.max(3, Math.round(high / 2)), high };
}

// ── 칩 한 줄 ────────────────────────────────────────────────────────────────

interface ChipItem {
  label: string;
  /** 본문에서 발견된 횟수. 주장(어법)에는 없다. */
  count?: number;
}

/**
 * 제목을 가진 칩 한 줄. 제목이 곧 "이 줄이 무엇인지"라, 칩 자체는 아무 암호도
 * 갖지 않는다(줄 긋기·회색조로 뜻을 나르지 않는다).
 *
 * tone
 *   fact  — 채운 emerald. 본문에서 실제로 대조된 것.
 *   plain — 흰 바탕 + 실선. 대조했지만 본문에 없던 것.
 *   claim — 흰 바탕 + **점선**. 대조 자체를 하지 않은 모델의 자기 보고.
 */
function ChipRow({
  label,
  tone,
  items,
  chipTitle,
  note,
}: {
  label: string;
  tone: "fact" | "plain" | "claim";
  items: ChipItem[];
  chipTitle?: (item: ChipItem) => string;
  /** 줄 제목 옆에 붙는 한 줄 — 지금은 "본문 대조는 하지 않았어요"만 쓴다. */
  note?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  if (items.length === 0) return null;

  const collapsible = items.length > CHIP_COLLAPSE_LIMIT;
  const visible = expanded || !collapsible ? items : items.slice(0, CHIP_COLLAPSE_LIMIT);
  const hiddenCount = items.length - visible.length;

  return (
    <div className="mt-3 min-w-0">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        {/* 줄 제목이 곧 이 줄의 뜻이다. 개수는 위 요약 줄("표제어 200개 중 24개
            · 12%")이 이미 말하므로 여기서 되풀이하지 않는다. */}
        <span className={cn(DESK.meta, "text-slate-600")}>{label}</span>
        {note ? (
          <span className={cn(DESK.meta, "inline-flex items-center gap-1 text-slate-500")}>
            <Info className="size-3.5 shrink-0" aria-hidden="true" />
            {note}
          </span>
        ) : null}
      </div>

      <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2">
        {visible.map((item) => (
          <span
            key={`${label}-${item.label}`}
            title={chipTitle ? chipTitle(item) : undefined}
            className={cn(
              DESK.kicker,
              CHIP_H,
              "inline-flex items-center gap-1 rounded-full border px-2",
              tone === "fact"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : tone === "plain"
                  ? "border-slate-200 bg-white text-slate-600"
                  : "border-dashed border-slate-300 bg-white text-slate-600",
            )}
          >
            {tone === "fact" ? (
              <Check className="size-3.5 shrink-0" aria-hidden="true" />
            ) : null}
            {item.label}
            {tone === "fact" && (item.count ?? 0) > 1 ? (
              <span className="tabular-nums text-emerald-600">{`×${item.count}`}</span>
            ) : null}
          </span>
        ))}

        {hiddenCount > 0 ? (
          <AuthoringButton size="sm" variant="secondary" onClick={() => setExpanded(true)}>
            {AUTHORING_COPY.CTA.expandAll(hiddenCount)}
          </AuthoringButton>
        ) : null}
        {expanded && collapsible ? (
          <AuthoringButton size="sm" variant="ghost" onClick={() => setExpanded(false)}>
            {AUTHORING_COPY.CTA.collapse}
          </AuthoringButton>
        ) : null}
      </div>
    </div>
  );
}

// ── 패널 ────────────────────────────────────────────────────────────────────

/**
 * 이 패널이 무언가를 그리는가. **판정의 유일한 소유자**다.
 *
 * 카드가 1열이 되면서(카드 머리 주석 ④) 호출부는 이 판정을 미리 알 필요가
 * 없어졌다 — 패널을 조건 없이 렌더하고, 비면 스스로 null 을 반환한다. export 를
 * 유지하는 이유: "커버리지가 있는가"를 물어야 하는 다음 소비자가 조건을 손코딩해
 * 두 벌로 가르는 것을 막는 단일 판정점이다.
 */
export function hasAuthoringCoverage(coverage: AuthoringCoverage): boolean {
  const words = coverage.words ?? [];
  const grammarPoints = (coverage.grammarPoints ?? []).filter((label) => label.trim());
  return words.length > 0 || grammarPoints.length > 0;
}

export function AuthoringCoveragePanel({
  coverage,
  targetWords,
}: {
  coverage: AuthoringCoverage;
  /** 이 지문의 목표 분량(단어). 기대 사용량 안내를 계산하는 데 쓴다. */
  targetWords?: number;
}) {
  const words = coverage.words ?? [];
  const grammarPoints = (coverage.grammarPoints ?? []).filter((label) => label.trim());
  if (!hasAuthoringCoverage(coverage)) return null;

  const hits = words.filter((word) => word.hit);
  const misses = words.filter((word) => !word.hit);
  const percent =
    coverage.wordCoveragePercent ??
    (words.length ? Math.round((hits.length / words.length) * 100) : null);
  const healthy = percent !== null && percent >= HEALTHY_LOW && percent <= HEALTHY_HIGH;
  const dense = percent !== null && percent > HEALTHY_HIGH;

  const expected =
    typeof targetWords === "number" && targetWords > 0 ? expectedUseRange(targetWords) : null;
  const showExpected = Boolean(expected && words.length > expected.high);
  // 분모 정직성 — 클리핑이 걸렸다는 사실은 비율보다 먼저 읽혀야 한다.
  const totalDetected = coverage.termsTotalDetected ?? 0;
  const showTruncated =
    coverage.termsTruncated === true && totalDetected > words.length && words.length > 0;

  return (
    // 상자 없음 — 부모(근거 컬럼)의 인셋 하나에 그대로 얹힌다.
    <section className="min-w-0">
      <Kicker>{AUTHORING_COPY.COVERAGE.title}</Kicker>

      {words.length > 0 ? (
        <div className="mt-2 min-w-0">
          {/* 라벨을 "단어 반영률"이 아니라 "문맥에 녹인 표제어"로 부른다 — 반영률은
              100%를 목표로 읽히지만, 실제 목표는 문맥에 자연스럽게 녹는 것이다. */}
          <div className="flex min-w-0 flex-wrap items-baseline gap-2">
            <span className={cn(DESK.meta, "text-slate-500")}>
              {AUTHORING_COPY.COVERAGE.wordsLabel}
            </span>
            <span className={cn(DESK.num, healthy ? "text-emerald-600" : "text-slate-700")}>
              {AUTHORING_COPY.COVERAGE.summary(hits.length, words.length, percent ?? 0)}
            </span>
            {healthy ? (
              <span className={cn(DESK.meta, "text-emerald-700")}>
                {AUTHORING_COPY.COVERAGE.healthy}
              </span>
            ) : null}
          </div>

          {dense ? (
            <p className={cn(DESK.meta, "mt-2 inline-flex items-center gap-1 text-slate-600")}>
              <Info className="size-3.5 shrink-0" aria-hidden="true" />
              {AUTHORING_COPY.COVERAGE.dense}
            </p>
          ) : null}
          {showTruncated ? (
            <p className={cn(DESK.meta, "mt-2 leading-snug text-slate-600")}>
              {AUTHORING_COPY.COVERAGE.truncated(words.length, totalDetected)}
            </p>
          ) : null}
          {showExpected && expected ? (
            <p className={cn(DESK.meta, "mt-2 leading-snug text-slate-500")}>
              {AUTHORING_COPY.COVERAGE.expected(
                targetWords as number,
                expected.low,
                expected.high,
              )}
            </p>
          ) : null}

          <ChipRow
            label={AUTHORING_COPY.COVERAGE.hitLabel}
            tone="fact"
            items={hits.map((word) => ({ label: word.label, count: word.count }))}
            chipTitle={(item) => AUTHORING_COPY.COVERAGE.hitTitle(item.count ?? 0)}
          />
          <ChipRow
            label={AUTHORING_COPY.COVERAGE.missLabel}
            tone="plain"
            items={misses.map((word) => ({ label: word.label }))}
            chipTitle={() => AUTHORING_COPY.COVERAGE.missTitle}
          />
        </div>
      ) : null}

      {/* 모델 자기 보고 — 대조하지 않았다는 사실을 줄 제목 옆에서 곧바로 말한다. */}
      {grammarPoints.length > 0 ? (
        <ChipRow
          label={AUTHORING_COPY.COVERAGE.grammarLabel}
          tone="claim"
          items={grammarPoints.map((label) => ({ label }))}
          note={AUTHORING_COPY.COVERAGE.grammarUnverified}
        />
      ) : null}
    </section>
  );
}
