"use client";

// ============================================================================
// 간소 모드 툴바 컨트롤 — 분량·편수 팝오버 버튼 2개 (스펙 §3.9v2.8 D10)
//
// 왜 이 파일이 있나:
//   스튜디오 호스트의 AI 지문 생성은 우측 설계 레일 없이 **분량·편수만** 노출한다
//   (오너 지시 D10 — "그 자리에 분량·만들 편수만 설정 노출"). 나머지 7축은 서버
//   기본값(schema.ts authoringSpecSchema — 전 필드 default)으로 나가고, diversify
//   는 기본 true 고정이다. 이 두 컨트롤은 컴포저 툴바의 pasteHint 자리에 앉는다.
//
// 소유권 계약
//  · **스펙 상태는 보드(authoring-board.tsx)가 계속 소유한다.** 이 파일은 값과
//    콜백만 받아 그린다 — 여기나 컴포저에 spec/count useState 를 들이지 말 것.
//    (보드→컴포저로는 조립된 ReactNode 만 내려간다: toolbarExtras 슬롯.)
//  · 팝오버 **내용물은 authoring-spec-panel.tsx 의 정본을 재사용**한다
//    (LengthControls / CountControls — §3.9v2.8 승격 export). 여기서 복제하면
//    분량 프리셋 실측·크레딧 산식이 레일과 갈라진다.
//  · 문구는 전량 passage-authoring-glossary.ts 경유(게이트 ⑤). 버튼 값 표기도
//    레일과 같은 함수(aboutWords/passages)를 써서 두 호스트가 같은 말을 한다.
//
// 회귀 방지 계약
//  · 버튼은 AuthoringButton(md·secondary) — 툴바의 [자료 붙이기]·[예시]와 같은
//    36px 보조 버튼 문법이다. 분량·편수는 되돌릴 수 있는 설정이라 주 CTA 무게를
//    주지 않는다(hero 는 한 표면에 하나 — authoring-primitives 계약).
//  · 팝오버 구조(제목 + 힌트 + 내용물, px-2 인셋)는 SettingRow 의 팝오버와 같은
//    골격이다 — 같은 내용물이 호스트에 따라 다른 그릇에 담기면 안 된다.
//  · 고르고 나서 팝오버를 닫지 않는다(authoring-spec-parts 계약) — 편수는 특히
//    크레딧 합계가 같은 프레임에서 갱신돼야 결제 놀람이 없다.
// ============================================================================

import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";

import { Popover, PopoverTrigger } from "@/components/ui/popover";
import type { AuthoringSpec } from "@/lib/passage-authoring/schema";
import { cn } from "@/lib/utils";
import { AUTHORING_COPY } from "@/lib/wording/passage-authoring-glossary";

import {
  AuthoringButton,
  AuthoringPopover,
  PopoverTitle,
} from "./authoring-primitives";
import { CountControls, LengthControls } from "./authoring-spec-panel";
import { DESK } from "./authoring-tokens";

const COPY = AUTHORING_COPY.SPEC;

/**
 * 툴바용 팝오버 버튼 한 벌 — "라벨(흐림) + 현재값 + ▾". SettingRow 의 줄 문법을
 * 36px 버튼으로 옮긴 것이다: 열지 않고도 "지금 뭐로 돼 있나"가 읽혀야 한다는
 * 원칙은 툴바에서도 같다.
 */
function ToolbarSpecButton({
  label,
  value,
  hint,
  disabled,
  children,
}: {
  label: string;
  /** 지금 값 — 레일의 줄 값과 같은 표기 함수를 쓴다. */
  value: string;
  hint: string;
  disabled: boolean;
  children: ReactNode;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <AuthoringButton variant="secondary" disabled={disabled} title={hint}>
          <span className={cn(DESK.meta, "shrink-0 text-slate-500")}>
            {label}
          </span>
          <span className="min-w-0">{value}</span>
          <ChevronDown className="size-3.5 shrink-0" aria-hidden="true" />
        </AuthoringButton>
      </PopoverTrigger>
      {/* SettingRow 팝오버와 같은 골격(제목 → 힌트 → 내용물). 폭은 md(340) —
          트리거가 ~140px 라 width="trigger"(min 280)보다 안정적이고, 편수 세그먼트
          3열이 한 칸 ~100px 로 넉넉하다. align="start" 로 버튼 왼쪽 모서리에
          맞춘다(툴바가 밴드 좌측에 있어 오른쪽으로 펼쳐야 화면 안에 남는다). */}
      <AuthoringPopover width="md" align="start" aria-label={label}>
        <div className="px-2 py-2">
          <PopoverTitle>{label}</PopoverTitle>
          <p
            className={cn(
              DESK.meta,
              "mt-1 break-keep leading-relaxed text-slate-500",
            )}
          >
            {hint}
          </p>
        </div>
        <div className="px-2 pb-2">{children}</div>
      </AuthoringPopover>
    </Popover>
  );
}

export interface SimplifiedSpecControlsProps {
  /** 보드 소유의 스펙 스냅샷 — 여기서는 targetWords·gradeBand 만 읽는다. */
  spec: AuthoringSpec;
  count: number;
  disabled: boolean;
  onSpecChange: (patch: Partial<AuthoringSpec>) => void;
  onCountChange: (n: number) => void;
}

/**
 * 간소 모드의 툴바 확장 — 보드가 조립해 AuthoringComposer 의 toolbarExtras 슬롯에
 * 내려보낸다. 분량 팝오버가 gradeBand 를 받는 이유: 내용물(LengthControls)의
 * "고2 학생이 읽으면 약 1분 30초" 되먹임이 학년을 알아야 한다 — 간소 모드에서
 * 학년 UI 는 없지만 서버 기본값(HIGH_2)이 그대로 계산 기준이 된다.
 */
export function SimplifiedSpecControls({
  spec,
  count,
  disabled,
  onSpecChange,
  onCountChange,
}: SimplifiedSpecControlsProps) {
  return (
    <>
      <ToolbarSpecButton
        label={COPY.SIMPLE.length}
        value={COPY.aboutWords(spec.targetWords)}
        hint={COPY.HINT.length}
        disabled={disabled}
      >
        <LengthControls
          targetWords={spec.targetWords}
          gradeBand={spec.gradeBand}
          disabled={disabled}
          onChange={(targetWords) => onSpecChange({ targetWords })}
        />
      </ToolbarSpecButton>
      <ToolbarSpecButton
        label={COPY.SIMPLE.count}
        value={COPY.passages(count)}
        hint={COPY.HINT.count}
        disabled={disabled}
      >
        <CountControls
          count={count}
          disabled={disabled}
          onChange={onCountChange}
        />
      </ToolbarSpecButton>
    </>
  );
}
