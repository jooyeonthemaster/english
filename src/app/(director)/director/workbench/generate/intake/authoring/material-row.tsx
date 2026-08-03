"use client";

// ============================================================================
// 자료 행 — 발주 밴드에 붙은 자료 1건. **칩(pill)이 아니라 행(row)이다.**
//
// 왜 칩을 버렸나 (material-chip.tsx 폐기):
//   pill wrap 격자는 파일명 길이가 제각각이라 **줄마다 좌측 기준선이 달라진다.**
//   화면이 "정렬이 하나도 안 맞다"로 읽히던 가장 큰 원인이었다. 편집 관점에서
//   첨부 자료는 태그가 아니라 **원고 목록**이므로 세로 1열이 정본이다.
//   옛 계약(material-chip.tsx:4-11 "평소에는 한 줄 칩, 세부는 팝오버")의 목적은
//   "자료 카드가 입력창을 화면 밖으로 밀어내는 것을 막는다"였는데, 그 목적은
//   h-10 행 3개 상한 + 4개째부터 자료 검토 모달로 이관하는 쪽이 더 강하게 지킨다
//   (3번째 스크롤을 만들지 않는다 — 스크롤 2개 계약).
//   옛 계약 material-chip.tsx:29 "칩 h-9 · × size-8 로 터치 32px 확보"도 함께
//   파기한다. 실측 트리거 히트박스는 36px 칩 안의 약 20px 띠뿐이었다(쉘이
//   items-center 라 자식이 stretch 되지 않고 트리거에 높이 지정이 없었다) —
//   계약이 주장한 값이 애초에 거짓이었다. 지금은 행 전체가 h-10 이고 각 트리거가
//   h-7(28px) 이상이다.
//
// 진입점이 4개인데 왜 한 행에 다 있나:
//   같은 자료에 대한 서로 다른 질문이라 자리도 달라야 한다.
//    ① 파일명   → 자료 검토 모달(본문을 눈으로 보고 고친다)
//    ② 역할     → 드롭다운(단일 결정. 이 화면에 남는 유일한 자료 팝오버)
//    ③ 전달 분량 → 자료 검토 모달의 예산 섹션(왜 다 안 실렸는지)
//    ④ ✕       → 빼기
//   넷을 한 팝오버에 몰아넣었던 것이 옛 설계의 실패였다(성격이 100배 다른 결정을
//   한 창에서 요구했다).
//
// 회귀 방지 계약
//  · **READING 중에는 세부를 열지 않는다** — 아직 고칠 내용이 없다. 다만 ✕(빼기)는
//    어떤 상태에서도 눌린다(잘못 붙인 큰 파일을 판독이 끝날 때까지 못 빼면
//    12개 상한에 갇힌다).
//  · **FAILED 는 클릭 = 다시 읽기다.** 행 전체가 rose 톤이 되고 "이 자료는 빼고
//    만들어요"를 그 자리에서 말한다 — 실행을 막지는 않는다(사실 통지).
//  · 역할을 사용자가 고르면 roleLocked=true 로 잠근다. 그 뒤 자동분류가 덮지 않는다.
//  · **판독 주체를 'AI'로 적지 않는다.** 텍스트·표·문서·붙여넣기는 브라우저 파싱이라
//    모델 호출이 0이다. "AI"는 쓰기(생성)를 말할 때만 쓴다.
//  · 모달은 이 파일이 소유하지 않는다. onOpenReview 로 **부탁만** 한다 — 보이지
//    않는 상태에서 포털 모달이 열리는 사고(visible 게이트)를 상위 한 곳에서만
//    막을 수 있게 하기 위해서다.
//  · 좁은 폭 분기는 전부 **컨테이너 쿼리**다(@container 는 발주 밴드 루트가 선언).
//    뷰포트 질의(sm:/lg:)를 다시 들이지 않는다 — 이 컴포넌트는 1180px 화면 안의
//    424px 컬럼에도, 좁은 호스트의 300px 컬럼에도 같은 규칙으로 놓인다.
//  · 이 행은 가로 인셋을 갖지 않는다. 16px 단일 인셋은 **발주 밴드**가 준다.
//    여기에 px-4 를 또 얹으면 자료 행만 32px 로 밀려 좌측 기준선이 둘이 된다
//    (그게 바로 이번 리디자인이 없앤 문제다).
// ============================================================================

import { useMemo } from "react";
import {
  FileSpreadsheet,
  FileText,
  FileType2,
  Image as ImageIcon,
  Info,
  Loader2,
  TriangleAlert,
  X,
} from "lucide-react";

import type { MaterialSourceKind } from "@/lib/passage-authoring/schema";
import { AUTHORING_COPY } from "@/lib/wording/passage-authoring-glossary";
import { cn } from "@/lib/utils";

import { AuthoringButton } from "./authoring-primitives";
import { DESK, FOCUS_RING, HAIRLINE, ROW_H, SURFACE } from "./authoring-tokens";
import {
  predictMaterialBudget,
  type MaterialBudgetEntry,
} from "./material-budget";
import { MaterialRoleMenu } from "./material-role-menu";
import type { DraftMaterial } from "./authoring-types";

/** 자료 검토 모달에서 곧바로 펼칠 섹션 — 전달 분량을 눌러 들어온 경우. */
export type MaterialReviewSection = "budget";

/**
 * 아직 DraftMaterial 에 실리지 않은 필드들(하이브리드 첨부·자동분류 확신도).
 * 타입 소유자는 authoring-types.ts / material-intake.ts 이며 각각 다른 작업에서
 * 들어온다. 여기서는 **있으면 그린다**로만 다뤄 배선 순서에 의존하지 않는다.
 */
type MaterialRowInput = DraftMaterial & {
  /** 원본 페이지 이미지를 함께 보낼지 — 숨은 자동 결정이 아니라 표면 스위치다. */
  sendPages?: boolean;
  pageCount?: number;
  /** 자동분류 확신이 낮아 사람이 한 번 봐야 하는 자료. */
  roleUncertain?: boolean;
};

const SOURCE_ICONS: Record<MaterialSourceKind, typeof FileText> = {
  TEXT: FileType2,
  FILE_TEXT: FileText,
  FILE_DOC: FileText,
  FILE_SHEET: FileSpreadsheet,
  FILE_PDF: FileText,
  FILE_IMAGE: ImageIcon,
};

export interface MaterialRowProps {
  material: MaterialRowInput;
  /** 실행 중에는 자료를 바꿀 수 없다. ✕(빼기)까지 막지는 않는다. */
  disabled?: boolean;
  /**
   * 이번 생성에 실릴 분량. 목록 전체를 아는 상위(발주 밴드)가
   * predictMaterialBudgets() 로 **한 번에** 계산해 넘긴다.
   * 넘기지 않으면 이 행 혼자만 보고 예측하는데, 그 값은 다른 자료와의
   * 총예산(60,000자) 경쟁을 반영하지 못한다.
   */
  budget?: MaterialBudgetEntry;
  onChange: (id: string, patch: Partial<DraftMaterial>) => void;
  onRemove: (id: string) => void;
  onRetry: (id: string) => void;
  /** 모달을 열어 달라는 요청 — 모달 소유권은 상위에 있다. */
  onOpenReview: (id: string, section?: MaterialReviewSection) => void;
  className?: string;
}

export function MaterialRow({
  material,
  disabled = false,
  budget,
  onChange,
  onRemove,
  onRetry,
  onOpenReview,
  className,
}: MaterialRowProps) {
  const Icon = SOURCE_ICONS[material.sourceKind] ?? FileText;
  const reading = material.status === "READING";
  const failed = material.status === "FAILED";
  const name = material.name || AUTHORING_COPY.MATERIAL.pastedName;
  const ready = !reading && !failed;

  // 상위가 계산해 준 값이 있으면 그것이 참이다(총예산 경쟁까지 반영된 값).
  // useMemo 는 장식이 아니다 — 폴백 경로는 60,000자 본문을 정화해 길이를 재므로
  // 발주 textarea 키 입력마다 돌면 입력이 눈에 띄게 끊긴다.
  const spend = useMemo(
    () => budget ?? predictMaterialBudget(material.role, material.content),
    [budget, material.role, material.content],
  );
  const showBudget = ready && spend.total > 0;
  const pageCount = material.pageCount ?? 0;

  return (
    <li
      className={cn(
        "group flex items-center gap-3 border-b",
        ROW_H,
        HAIRLINE,
        failed ? SURFACE.danger : null,
        className,
      )}
    >
      {reading ? (
        <Loader2
          className="size-3.5 shrink-0 animate-spin text-blue-600"
          aria-hidden="true"
        />
      ) : failed ? (
        <TriangleAlert
          className="size-3.5 shrink-0 text-rose-600"
          aria-hidden="true"
        />
      ) : (
        <Icon className="size-3.5 shrink-0 text-slate-400" aria-hidden="true" />
      )}

      {/* ① 파일명 — READY 면 자료 검토, FAILED 면 다시 읽기(계약), READING 이면 글자. */}
      {reading ? (
        <span
          className={cn(DESK.body, "min-w-0 flex-1 truncate text-slate-500")}
          title={name}
        >
          {name}
        </span>
      ) : (
        <button
          type="button"
          onClick={() =>
            failed ? onRetry(material.id) : onOpenReview(material.id)
          }
          // 실행 중에 막는 것은 자료를 **바꾸는** 행동뿐이다. READY 자료를 열어
          // 보는 것(검토 모달)까지 막으면, 생성이 도는 4분 동안 "무엇을 보냈는지"를
          // 확인할 길이 사라진다. FAILED 는 클릭이 곧 다시 읽기(변경)라 막는다.
          disabled={disabled && failed}
          title={name}
          aria-label={
            failed
              ? AUTHORING_COPY.MATERIAL.retry
              : AUTHORING_COPY.A11Y.openMaterial(name)
          }
          className={cn(
            DESK.body,
            "min-w-0 flex-1 cursor-pointer truncate rounded-md text-left underline-offset-2",
            failed
              ? "text-rose-700 hover:underline"
              : "text-slate-800 hover:text-blue-700 hover:underline",
            "disabled:cursor-not-allowed disabled:opacity-50",
            FOCUS_RING,
          )}
        >
          {name}
        </button>
      )}

      {/* READING — 진행 문구는 데이터(판독기가 준 문장)라 사전 경유가 아니다. */}
      {reading ? (
        <span
          className={cn(
            DESK.meta,
            "shrink-0 truncate text-slate-500 @max-[420px]:hidden",
          )}
        >
          {material.progressLabel || AUTHORING_COPY.MATERIAL.reading}
        </span>
      ) : null}

      {/* FAILED — 실행을 막지 않는다. "이 자료는 빼고 만들어요"라는 사실 통지다. */}
      {failed ? (
        <>
          <span
            className={cn(
              DESK.meta,
              "shrink-0 truncate text-rose-700 @max-[480px]:hidden",
            )}
            title={material.error || AUTHORING_COPY.MATERIAL.failed}
          >
            {AUTHORING_COPY.MATERIAL.failed}
          </span>
          <AuthoringButton
            size="sm"
            variant="secondary"
            onClick={() => onRetry(material.id)}
            disabled={disabled}
            className="shrink-0"
          >
            {AUTHORING_COPY.MATERIAL.retry}
          </AuthoringButton>
        </>
      ) : null}

      {/* ② 역할 — 이 화면에 남는 유일한 자료 팝오버. */}
      {ready ? (
        <MaterialRoleMenu
          value={material.role}
          onChange={(role) => onChange(material.id, { role, roleLocked: true })}
          disabled={disabled}
          materialName={name}
        />
      ) : null}

      {/* 자동분류 확신이 낮은 자료 — 고르라고 시키지 않고 "확인해 주세요"만 말한다. */}
      {ready && material.roleUncertain && !material.roleLocked ? (
        <span
          role="img"
          aria-label={AUTHORING_COPY.WARN.roleUncertain}
          title={AUTHORING_COPY.WARN.roleUncertain}
          className="shrink-0"
        >
          <Info className="size-3.5 text-slate-500" aria-hidden="true" />
        </span>
      ) : null}

      {/* ③ 전달 분량 — 정직성 회복 지점. "13,786자"만 적으면 전부 실렸다고 읽힌다. */}
      {showBudget ? (
        <button
          type="button"
          onClick={() => onOpenReview(material.id, "budget")}
          title={AUTHORING_COPY.MATERIAL.budgetTitle}
          className={cn(
            DESK.meta,
            "shrink-0 cursor-pointer rounded-md tabular-nums text-slate-500 hover:text-blue-700 @max-[480px]:hidden",
            FOCUS_RING,
          )}
        >
          {AUTHORING_COPY.MATERIAL.budgetShort(spend.sent, spend.total)}
        </button>
      ) : null}

      {/* 하이브리드 첨부 표시 — 켜져 있을 때만. 끄고 켜는 곳은 자료 검토 모달이다. */}
      {ready && material.sendPages ? (
        <span
          role="img"
          aria-label={AUTHORING_COPY.A11Y.sendPages(pageCount)}
          title={AUTHORING_COPY.MATERIAL.sendPages(pageCount)}
          className="shrink-0"
        >
          <ImageIcon className="size-3.5 text-slate-500" aria-hidden="true" />
        </span>
      ) : null}

      {/* ④ 빼기 — 어떤 상태에서도 눌린다(READING 중 큰 파일을 되돌릴 유일한 길). */}
      <AuthoringButton
        size="sm"
        variant="ghost"
        onClick={() => onRemove(material.id)}
        aria-label={AUTHORING_COPY.A11Y.removeMaterial(name)}
        className="size-7 shrink-0 px-0 text-slate-400 hover:text-slate-700"
      >
        <X className="size-3.5" aria-hidden="true" />
      </AuthoringButton>
    </li>
  );
}
