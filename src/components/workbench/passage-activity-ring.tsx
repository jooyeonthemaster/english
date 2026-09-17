"use client";

// ============================================================================
// 지문 행/카드 「생성 중」 활동 표식 — 테두리 링 + 인라인 라벨
//
// 계약: src/lib/passage-activity.ts · 모션: globals.css(.passage-activity-*)
// 조립: 호스트(스튜디오 오케스트레이터 등) · 배선: PassageCardGrid rowActivity
//
// 두 조각으로 나뉜 이유는 **붙는 자리가 다르기 때문**이다.
//   · Ring  — 행/카드 루트의 직속 오버레이(absolute inset-0). 루트가 relative
//             + overflow-hidden 이어야 한다(LIST_ROW_CLASS·*_CARD_CLASS 전부 충족).
//   · Label — 행 메타줄 안. 링은 "돈다"만 말하고, "무엇이" 는 이쪽이 말한다.
//
// 둘 다 memo 다: 소비처(PassageListRow·PassageCardGrid 행 루프)가 목록 전체를
// 도는 자리라, activity 참조가 안 바뀌면 여기서 렌더가 끊긴다. 그 전제는
// 조립부의 시그니처 메모(passageActivitySignature)가 지킨다.
// ============================================================================

import { memo } from "react";
import type { PassageActivity, PassageActivityKind } from "@/lib/passage-activity";

/**
 * 테두리 링 — 행/카드 루트 직속에 그대로 얹는다(루트 = relative + overflow-hidden).
 *
 * prop 이 activity 객체가 아니라 **kind 원시값**인 이유: 이 컴포넌트를 쓰는 두
 * 번째 호스트(도시에 접힌 카드)는 PassageActivity 를 만들지 않고 자기 큐 항목에서
 * 종류만 뽑는다. 원시값이면 그쪽이 렌더마다 객체를 새로 지어도 memo 가 산다.
 *
 * aria-hidden: 의미는 Label 이 텍스트로 갖는다(장식을 두 번 읽히지 않게).
 * 색 톤은 CSS 가 data-activity-kind 로 갈린다 — 클래스 조립을 호출부에 두면
 * 톤이 늘 때마다 호출부 전부를 같이 고쳐야 하는 구조가 된다.
 */
export const PassageActivityRing = memo(function PassageActivityRing({
  kind,
}: {
  kind: PassageActivityKind;
}) {
  return (
    <span
      className="passage-activity-ring"
      data-activity-kind={kind}
      aria-hidden="true"
    />
  );
});

/**
 * 인라인 라벨 — "기본 학습지 생성 중…" + 동시 진행분 "외 N".
 *
 * 경과 시계는 의도적으로 없다(계약 파일 머리 주석) — 초당 갱신이 곧 초당
 * 목록 리렌더다. 시계·스트림 꼬리는 우측 도시에 큐 스트립이 갖는다.
 */
export const PassageActivityLabel = memo(function PassageActivityLabel({
  activity,
  className,
}: {
  activity: PassageActivity;
  /** 호스트별 여백/크기 조정용(색·굵기는 여기 고정 — 어휘 통일) */
  className?: string;
}) {
  const extra = activity.jobs - 1;
  return (
    <span
      className={
        // max-w + 안쪽 truncate: 유형이 여럿인 문항 자구("… 외 2유형 · 12문항
        // 생성 중")가 행 메타줄을 밀어내 제목 블록을 압착하는 것을 막는다.
        // 전문은 title 로 남는다.
        "inline-flex max-w-[240px] shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-1.5 py-px text-[10px] font-semibold " +
        (activity.kind === "questions"
          ? "bg-indigo-50 text-indigo-700"
          : "bg-blue-50 text-blue-700") +
        (className ? ` ${className}` : "")
      }
      title={
        extra > 0
          ? `${activity.label} — 이 지문에서 ${activity.jobs}건이 백그라운드로 생성되고 있습니다`
          : `${activity.label} — 백그라운드에서 생성되고 있습니다`
      }
    >
      {/* min-w-0: 이게 없으면 flex 항목의 기본 min-width:auto 가 내용 너비를
          바닥으로 잡아 위 max-w 가 사문화되고 칩이 그대로 넘친다(truncate 는
          줄어들 수 있을 때만 발동한다). */}
      <span className="passage-activity-label min-w-0 truncate">
        {activity.label}
      </span>
      {extra > 0 ? (
        <span className="font-bold tabular-nums opacity-70">외 {extra}</span>
      ) : null}
    </span>
  );
});
