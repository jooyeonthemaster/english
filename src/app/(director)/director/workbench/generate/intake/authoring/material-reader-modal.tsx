"use client";

// ============================================================================
// 자료 검토 모달 — "이 자료로 무엇을 어떻게 쓸까"를 한 화면에서 끝내는 작업대.
//
// ⚠️ 문구에 "AI가 읽었다"를 쓰지 않는다(다음 사람이 이 주석을 근거로 삼는다).
//   txt·csv·md·json·docx·xlsx·hwpx 와 글자층이 있는 PDF 는 브라우저가 직접 풀고
//   (material-readers.ts), 붙여넣은 자료는 사용자가 친 글자 그대로다 — 모델 호출이
//   0인 경로가 대부분이다. "AI"는 읽기가 아니라 **쓰기(생성)** 쪽에만 쓴다.
//
// 왜 모달인가:
//   판독본은 6,000자~60,000자짜리 원문이다. 이걸 칩 팝오버(340×224px) 안에서
//   고치라고 내놓았더니 사용자가 "좁아서 아무 의미가 없다"고 했다. 맞는 말이다.
//   팝오버는 "역할 고르기"처럼 몇 번 눌러 끝나는 일에 쓰는 자리지, 원문을
//   훑어 읽으며 오독을 잡는 일에 쓰는 자리가 아니다. → 화면을 통째로 쓴다.
//
// 왜 좌우 2단인가 (구 세로 1단에서 바뀐 점):
//   옛 자료 팝오버가 담던 결정 4개 중 **역할 하나만** material-role-menu 에 남기고
//   나머지(자료별 요청 · 전달 분량 · 원본 페이지 첨부)를 전부 여기로 옮겼다.
//   그런데 그것들을 60,000자 본문 **아래**에 세로로 쌓으면 스크롤 끝에 묻힌다.
//   그래서 세로 rule 로 잘라 낸 320px 사이드에 **각자 자체 제목을 갖고** 놓는다 —
//   본문은 좌측에서 스크롤하고 사이드는 제자리에 남는다. 이것이 "note 를 모달로
//   보내면 묻히지 않느냐"는 정찰 질문에 대한 구조적 답이다.
//
//   자료가 4개 이상이면 좌측에 자료 목록 칼럼이 하나 더 붙어 3단이 된다. 발주
//   밴드가 자료 행을 3개까지만 세우고 4개째부터 "모두 보기"로 접기 때문에(3번째
//   스크롤 금지 계약), **접힌 자료로 들어오는 유일한 문**이 여기다.
//
// 회귀 방지 계약
//  · **저장 버튼을 만들지 않는다.** 타이핑 즉시 onChange 로 상위에 반영하고 "완료"는
//    그냥 닫기다. 저장 개념을 만드는 순간 "안 눌러서 날아갔나?" 불안이 생긴다.
//    역할·요청·전달 분량·원본 페이지 토글도 전부 같은 규칙이다(가짜 커밋 금지).
//  · 스크롤은 **판독 본문 칼럼 하나**다. 사이드는 내용이 다 들어가면 스크롤이
//    생기지 않고, 아주 낮은 뷰포트에서만 자기 안에서 스크롤한다(잘림 방지 바닥값).
//  · "선지 줄 지우기"는 되돌리기로 100% 복구 가능해야 한다. 그래서 정규식은
//    원문 훼손 위험이 없는 범위(줄 첫머리의 동그라미 숫자)로만 좁혀 두고,
//    스냅샷을 **자료 id 별로 한 번만** 떠서 창을 닫아도 버리지 않는다.
//    (닫을 때 버리면 다시 연 순간 "이미 고쳐진 내용"이 새 원본이 돼, 지운 선지
//     줄을 앱 어디서도 되살릴 수 없다 — READY 자료에는 재판독 경로가 없다.)
//    본문이 바뀌는 길은 판독 완료와 이 창뿐이므로, 첫 스냅샷 = 판독 직후 원본이다.
//  · 판독본은 최대 60,000자다. max-h 로 다시 묶지 말 것.
//    ⚠️ 상한은 **여기서도** 막는다 — 투입 경로(material-intake.clampMaterialContent)만
//    막고 편집 경로를 열어 두면, 긴 문서를 이 칸에 붙여넣은 뒤 실행할 때 서버
//    zod 가 영문 메시지로 튕겨(route.ts) 사용자는 무엇을 줄여야 할지 알 수 없다.
//  · 이 모달은 **상위(컴포저)가 연다.** 스스로 열림을 결정하지 않는다 — 보이지 않는
//    상태에서 포털 모달이 열리는 사고(visible 게이트)를 한 곳에서만 막기 위해서다.
//  · 원본 페이지 첨부(sendPages)는 **표면 스위치**다. 판독 결과가 표·도해라고
//    화면이 몰래 켜고 끄지 않는다 — 켜면 편당 페이지 이미지가 실려 원가가 붙는다.
//
// 폐기한 것과 근거 (되돌리지 말 것)
//  · 파란 안내 상자("AI는 여기 보이는 내용만 읽어요") — 문장이 참이 아니었다.
//    60,000자를 붙여도 실제로 실리는 것은 역할별 예산까지다. 같은 자리에서
//    **전달 분량 게이지**가 sent/total 을 숫자로 말한다(정직성 회복).
//  · 12.5px 버튼 5회 · h-8 보조 버튼 — 5단 타이포와 버튼 2종(h-9/h-7)으로 흡수.
//    (구 계약 material-chip.tsx:226 "네 종"의 의도 '제목이 본문보다 커야 한다'는
//     title 14 > body 13 으로 그대로 만족한다.)
//  · 판독 본문 13px — 이 화면의 본업이 영문 원문 읽기인데 13px 은 독서 하한 아래다.
//    15/500 lh1.75(DESK.read)로 올린다. 화면에 15px 은 발주 입력과 여기 둘뿐이다.
// ============================================================================

import { useEffect, useMemo, useRef, useState } from "react";
import { ListX, RotateCcw, ScanText } from "lucide-react";
import { toast } from "sonner";

import { WideModal } from "@/components/layout/wide-modal";
import { triggerHintGlow } from "@/lib/hint-glow";
import type { MaterialSourceKind } from "@/lib/passage-authoring/schema";
import { AUTHORING_COPY } from "@/lib/wording/passage-authoring-glossary";
import { cn } from "@/lib/utils";

import {
  AuthoringButton,
  FieldLabel,
  Gauge,
  Kicker,
} from "./authoring-primitives";
import {
  BTN_MD,
  CHIP_H,
  DESK,
  FOCUS_RING,
  HAIRLINE,
  RULE,
  SEG_ON,
  SURFACE,
} from "./authoring-tokens";
import type { DraftMaterial } from "./authoring-types";
import {
  predictMaterialBudget,
  type MaterialBudgetEntry,
} from "./material-budget";
import { MATERIAL_CONTENT_LIMIT, clampMaterialContent } from "./material-intake";
import type { MaterialReviewSection } from "./material-row";
import { MaterialRoleMenu } from "./material-role-menu";

/**
 * 아직 DraftMaterial 에 실리지 않은 하이브리드 첨부 필드. 타입 소유자는
 * authoring-types.ts / use-material-drafts.ts 이며 다른 작업에서 들어온다.
 * 여기서는 material-row.tsx 와 같은 방식으로 **있으면 그린다**로만 다뤄
 * 배선 순서에 의존하지 않는다.
 */
export type MaterialReviewInput = DraftMaterial & {
  /** 원본 페이지 이미지를 함께 보낼지 — 숨은 자동 결정이 아니라 표면 스위치다. */
  sendPages?: boolean;
  pageCount?: number;
};

/** 자료 목록 칼럼이 붙는 자료 수. 발주 밴드가 3행까지만 세우는 값과 같다. */
const LIST_COLUMN_THRESHOLD = 4;

/**
 * 원본 페이지를 함께 보낼 수 있는 자료 형식. 텍스트·문서·표는 애초에 렌더할
 * 페이지 이미지가 없다(있는 척하면 체크박스가 아무 일도 하지 않는 스위치가 된다).
 */
const HYBRID_SOURCE_KINDS: ReadonlySet<MaterialSourceKind> = new Set<MaterialSourceKind>([
  "FILE_PDF",
  "FILE_IMAGE",
]);

// ── 선지 줄 판별 ────────────────────────────────────────────────────────────
// 줄 첫머리의 ①~⑳ · ❶~❿ 만 본다. "(1)" "1)" "A." 같은 표기는 본문 안에서도
// 흔히 쓰여(연도·목록·인용) 지웠다간 원문을 망친다 — 일부러 제외했다.
// 시험지·문제지를 그대로 붙인 자료에서 선지 줄만 걷어내는 것이 목적이다.
const CHOICE_LINE = /^\s*[①-⑳❶-❿]/u;

function splitChoiceLines(text: string): { kept: string; removed: number } {
  const lines = text.split("\n");
  const survivors = lines.filter((line) => !CHOICE_LINE.test(line));
  return { kept: survivors.join("\n"), removed: lines.length - survivors.length };
}

export interface MaterialReaderModalProps {
  open: boolean;
  material: MaterialReviewInput | null;
  /**
   * 이번 생성에 실릴 분량. 목록 전체를 아는 상위가 predictMaterialBudgets() 로
   * **한 번에** 계산해 넘긴다. 없으면 이 자료 하나만 보고 예측하는데, 그 값은
   * 다른 자료와의 총예산(60,000자) 경쟁을 반영하지 못한다.
   */
  budget?: MaterialBudgetEntry;
  /**
   * 자료 전체 목록. 4개 이상이고 onSelectMaterial 이 있으면 좌측에 목록 칼럼이
   * 붙어 3단이 된다(발주 밴드에서 "모두 보기"로 들어오는 경로).
   */
  materials?: readonly MaterialReviewInput[];
  /** 목록 칼럼에서 다른 자료를 고름 — 무엇을 열지는 상위가 정한다. */
  onSelectMaterial?: (id: string) => void;
  /** 전달 분량을 눌러 들어왔으면 "budget" — 그 섹션에 힌트 글로우를 준다. */
  openSection?: MaterialReviewSection | null;
  onChange: (id: string, patch: Partial<MaterialReviewInput>) => void;
  onClose: () => void;
}

export function MaterialReaderModal({
  open,
  material,
  budget,
  materials,
  onSelectMaterial,
  openSection = null,
  onChange,
  onClose,
}: MaterialReaderModalProps) {
  const [confirmRevert, setConfirmRevert] = useState(false);
  // 지금 어떤 자료를 열고 있는지 — 렌더 중 조정의 기준값.
  const [trackedKey, setTrackedKey] = useState<string | null>(null);
  // 자료 id → 처음 담겼던 본문. **창을 닫아도 비우지 않는다.** 이 컴포넌트는
  // 컴포저에 상주하므로(열림 여부만 prop) 세션 내내 살아 있고, 그래서 두 번째로 연
  // 창에서도 "원래대로"가 판독 직후 원본을 가리킨다. 자료 12개 × 60,000자가
  // 상한이라 메모리 부담은 없다. 객체 동일성이 아니라 id 로 판정하는 이유:
  // material 객체는 타이핑마다 새로 만들어져 온다(객체로 보면 매 글자마다
  // 스냅샷이 갱신돼 되돌리기가 영원히 "변경 없음"이 된다).
  // ref 가 아니라 상태인 이유: 되돌리기 버튼의 활성 여부가 이 값에 달려 있어
  // 화면이 다시 그려져야 한다(렌더 중 ref 를 읽으면 그 갱신이 반영되지 않는다).
  const [baselines, setBaselines] = useState<Record<string, string>>({});
  const materialId = material?.id ?? null;
  // 상한 초과 안내는 자료당 한 번만. 매 글자마다 토스트가 쌓이면 화면이 잠긴다.
  // 상한 초과 안내를 이미 띄운 자료 id. boolean + 리셋 대신 "누구에게 알렸나"를
  // 들고 있으면 자료가 바뀔 때 리셋할 필요가 없다(렌더 중 ref 접근 위반 제거).
  const overLimitNoticedForRef = useRef<string | null>(null);
  // 전달 분량 섹션 — 자료 행의 "3,000/13,786자"를 눌러 들어왔을 때 글로우 대상.
  const budgetSectionRef = useRef<HTMLDivElement | null>(null);

  // ── 스냅샷·확인상태 갱신은 effect 가 아니라 **렌더 중 조정**으로 한다 ──
  // React 공식 "props 가 바뀔 때 state 조정" 패턴이다. effect 로 하면
  //   (1) 첫 페인트가 낡은 값으로 한 번 나갔다가 곧바로 다시 그려지고,
  //   (2) 타이핑마다 도는 효과 안에서 setState 를 부르게 돼 갱신 루프가 되기 쉽다.
  // 렌더 중 조정은 React 가 커밋 전에 즉시 재실행하므로 중간 상태가 화면에 안 샌다.
  const openKey = open ? materialId : null;
  if (openKey !== trackedKey) {
    setTrackedKey(openKey);
    setConfirmRevert(false);
    // 이 자료의 "처음 담긴 내용"을 아직 모르면 지금 값을 원본으로 박아 둔다.
    // 이미 있으면 절대 덮지 않는다 — 덮는 순간 "원래대로 되돌리기"가 거짓말이 된다.
    if (open && material && !(material.id in baselines)) {
      setBaselines((prev) =>
        material.id in prev ? prev : { ...prev, [material.id]: material.content },
      );
    }
  }

  const content = material?.content ?? "";
  const role = material?.role ?? "OTHER";

  const stats = useMemo(() => {
    const chars = content.length;
    const lines = content ? content.split("\n").length : 0;
    const choiceLines = content ? splitChoiceLines(content).removed : 0;
    return { chars, lines, choiceLines };
  }, [content]);

  // useMemo 는 장식이 아니다 — 폴백 경로는 60,000자 본문을 정화해 길이를 재므로
  // 판독 칸에 타자를 칠 때마다 돌면 입력이 눈에 띄게 끊긴다.
  const spend = useMemo(
    () => budget ?? predictMaterialBudget(role, content),
    [budget, role, content],
  );

  // 전달 분량을 눌러 들어온 경우에만 그 섹션을 한 번 반짝인다. 사이드가 세 덩어리라
  // "내가 누른 것이 어디로 갔나"를 화면이 스스로 말해 줘야 한다.
  useEffect(() => {
    if (!open || openSection !== "budget") return;
    triggerHintGlow(budgetSectionRef.current);
  }, [open, materialId, openSection]);

  if (!open || !material) return null;

  const name = material.name || AUTHORING_COPY.MATERIAL.pastedName;
  // 스냅샷은 위 렌더 중 조정에서 이미 박혔다. 혹시 없으면 "고친 곳 없음"이 맞다.
  const baseline = baselines[material.id];
  const dirty = baseline !== undefined && content !== baseline;
  /**
   * 판독본 없이 **원본 지면만으로** 실리는 자료인가(사진의 기본 경로).
   * 본문이 비었다는 사실만으로는 판정할 수 없다 — 판독에 실패한 PDF 도 본문이
   * 비므로, 실제로 보낼 원본이 있는지(storagePath)를 함께 본다.
   */
  const originalOnly = content.trim().length === 0 && Boolean(material?.storagePath);
  const hybrid = HYBRID_SOURCE_KINDS.has(material.sourceKind);
  const pageCount = material.pageCount ?? 0;
  const listItems =
    materials && materials.length >= LIST_COLUMN_THRESHOLD && onSelectMaterial
      ? materials
      : null;

  /** 상한을 넘긴 만큼 잘라서 반영한다 — 넘긴 사실은 자료당 한 번만 알린다. */
  const handleContentChange = (next: string) => {
    const { content: clamped, truncated } = clampMaterialContent(next);
    if (truncated && overLimitNoticedForRef.current !== material.id) {
      overLimitNoticedForRef.current = material.id;
      toast.warning(
        AUTHORING_COPY.TOAST.materialOverLimit(MATERIAL_CONTENT_LIMIT),
      );
    }
    if (!truncated && overLimitNoticedForRef.current === material.id) {
      overLimitNoticedForRef.current = null;
    }
    onChange(material.id, { content: clamped });
  };

  const handleStripChoices = () => {
    const { kept, removed } = splitChoiceLines(content);
    if (!removed) return;
    onChange(material.id, { content: kept });
    toast.success(AUTHORING_COPY.TOAST.choiceLinesRemoved(removed));
  };

  const handleRevert = () => {
    if (baseline === undefined) return;
    onChange(material.id, { content: baseline });
    setConfirmRevert(false);
    toast.success(AUTHORING_COPY.TOAST.reverted);
  };

  return (
    <WideModal
      open={open}
      onClose={onClose}
      icon={ScanText}
      title={AUTHORING_COPY.MATERIAL.reviewTitleOf(name)}
      // description 을 넘기지 않는다 — WideModal 은 부제를 slate-400(흰 배경 2.63:1)로
      // 그린다. "무슨 자료를 열었나·몇 자인가"는 이 화면에서 회색 얼룩이면 안 되는
      // 정보라, 본문 안에 slate-500 이상으로 직접 적는다(아래 판독 칼럼 머리줄).
      maxWidthClassName="max-w-[1100px]"
      // 본문 스크롤을 끄고(판독 칼럼이 유일한 스크롤) 가로 2~3단으로 만든다.
      // bg-white 는 WideModal 기본 bg-[#F8FAFB] 를 덮는다 — 이 화면의 표면은
      // 흰 바탕과 세로 rule 뿐이고, 칼럼마다 다른 배경을 깔지 않는다.
      bodyClassName="flex min-h-0 flex-1 overflow-hidden bg-white"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className={cn(DESK.meta, "tabular-nums text-slate-600")}>
              {AUTHORING_COPY.MATERIAL.charLineCount(stats.chars, stats.lines)}
            </span>
            {/* 상한을 미리 보여 준다 — 넘긴 뒤에 토스트로만 알면 늦다. */}
            <span
              className={cn(DESK.meta, "shrink-0 tabular-nums text-slate-500")}
            >
              {AUTHORING_COPY.MATERIAL.charLimit(MATERIAL_CONTENT_LIMIT)}
            </span>
            {dirty ? (
              <span
                className={cn(
                  DESK.kicker,
                  CHIP_H,
                  SURFACE.info,
                  "inline-flex shrink-0 items-center rounded-full px-2 text-blue-700",
                )}
              >
                {AUTHORING_COPY.MATERIAL.dirty}
              </span>
            ) : null}
          </div>

          {confirmRevert ? (
            // 되돌리기는 사용자의 편집을 통째로 버리는 동작이라 한 번 더 묻는다.
            <div className="flex items-center gap-2">
              <span className={cn(DESK.meta, "text-slate-600")}>
                {AUTHORING_COPY.MATERIAL.revertConfirm}
              </span>
              <AuthoringButton
                size="md"
                variant="secondary"
                onClick={() => setConfirmRevert(false)}
              >
                {AUTHORING_COPY.CTA.keep}
              </AuthoringButton>
              <AuthoringButton size="md" variant="danger" onClick={handleRevert}>
                <RotateCcw className="size-3.5" aria-hidden="true" />
                {AUTHORING_COPY.CTA.revert}
              </AuthoringButton>
            </div>
          ) : (
            // 「저장」은 없다(계약). 좌 = 되돌리기, 우 = 그냥 닫기.
            <div className="flex items-center gap-2">
              <AuthoringButton
                size="md"
                variant="secondary"
                onClick={() => setConfirmRevert(true)}
                disabled={!dirty}
                title={
                  dirty
                    ? AUTHORING_COPY.MATERIAL.revertTitle
                    : AUTHORING_COPY.MATERIAL.revertNothing
                }
              >
                <RotateCcw className="size-3.5" aria-hidden="true" />
                {AUTHORING_COPY.CTA.revert}
              </AuthoringButton>
              <AuthoringButton size="md" variant="primary" onClick={onClose}>
                {AUTHORING_COPY.CTA.done}
              </AuthoringButton>
            </div>
          )}
        </div>
      }
    >
      {/* ── ⓪ 자료 목록 칼럼 — 자료 4개 이상일 때만(“모두 보기” 진입로) ───── */}
      {listItems ? (
        <nav
          aria-labelledby="material-review-list-title"
          className={cn(
            "flex w-[240px] shrink-0 flex-col gap-2 overflow-y-auto border-r p-4",
            RULE,
          )}
        >
          <Kicker id="material-review-list-title">
            {AUTHORING_COPY.MATERIAL.countLine(listItems.length)}
          </Kicker>
          <ul className="flex flex-col gap-1">
            {listItems.map((item) => {
              const on = item.id === material.id;
              const itemName = item.name || AUTHORING_COPY.MATERIAL.pastedName;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => onSelectMaterial?.(item.id)}
                    title={itemName}
                    aria-current={on ? "true" : undefined}
                    className={cn(
                      DESK.body,
                      BTN_MD,
                      "flex w-full cursor-pointer items-center rounded-md border px-2 text-left transition-colors",
                      on
                        ? SEG_ON
                        : "border-transparent text-slate-700 hover:bg-slate-100 hover:text-slate-900",
                      FOCUS_RING,
                    )}
                  >
                    <span className="min-w-0 truncate">{itemName}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
      ) : null}

      {/* ── ① 판독 본문 칼럼 — 이 화면의 유일한 스크롤 ───────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col gap-3 overflow-hidden p-4">
        <div className="flex shrink-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <FieldLabel
              htmlFor="material-review-text"
              className="block text-slate-700"
            >
              {AUTHORING_COPY.MATERIAL.readTextLabel}
            </FieldLabel>
            {/* 헤더 부제(slate-400)가 못 하던 일 — 무슨 자료를 열었고 몇 자인지. */}
            <p
              className={cn(
                DESK.meta,
                "mt-1 flex items-center gap-1 tabular-nums text-slate-500",
              )}
            >
              <span>{AUTHORING_COPY.MATERIAL.SOURCE[material.sourceKind]}</span>
              <span aria-hidden="true">·</span>
              <span>{AUTHORING_COPY.MATERIAL.charCount(stats.chars)}</span>
            </p>
            {/* 사진은 OCR 을 돌지 않는다(26-08-04) — 본문 칸이 비어 있는 것이
                정상이고, 모델은 원본을 그대로 본다. 이 한 줄이 없으면 빈 칸이
                "AI 가 글자를 못 읽었다"로 읽혀 선생님이 직접 타이핑하기 시작한다. */}
            {originalOnly ? (
              <p className={cn(DESK.meta, "mt-1 leading-snug text-slate-600")}>
                {AUTHORING_COPY.MATERIAL.originalOnly}
              </p>
            ) : null}
          </div>
          {/* 문제지를 통째로 붙인 자료가 흔하다 — 선지 줄이 있을 때만 나타난다.
              (0줄인데 눌리는 버튼은 사용자에게 "내가 뭘 잘못했나"를 묻게 만든다.) */}
          {stats.choiceLines > 0 ? (
            <AuthoringButton
              size="md"
              variant="secondary"
              onClick={handleStripChoices}
              title={AUTHORING_COPY.MATERIAL.stripChoicesTitle}
              className="shrink-0"
            >
              <ListX className="size-3.5" aria-hidden="true" />
              {AUTHORING_COPY.MATERIAL.stripChoices(stats.choiceLines)}
            </AuthoringButton>
          ) : null}
        </div>

        {/* 유일한 스크롤 영역. 높이는 flex-1(=남은 높이)이 정하고, min-h 는 그게
            못 잡히는 상황의 바닥일 뿐이다.
            ⚠️ min-h 를 vh 로 두지 말 것 — 본문 래퍼는 overflow-hidden(스크롤 없음)이라
            뷰포트가 낮으면(노트북 1366×768 ≈ 640px, 주소창 뜬 폰) 52vh 가 남은 높이를
            넘겨 아래쪽이 스크롤 없이 잘린다. 220px 은 "그래도 몇 줄은 보인다"의
            바닥값이고, 상한(max-h)은 여전히 두지 않는다(60,000자 계약).
            max-w-[76ch] 는 읽기 폭 상한이다 — 1100px 모달에서 한 줄이 100자를 넘어가면
            눈이 다음 줄 첫머리를 잃는다. */}
        <div className="flex min-h-0 flex-1 flex-col">
          <textarea
            id="material-review-text"
            value={content}
            onChange={(e) => handleContentChange(e.target.value)}
            spellCheck={false}
            placeholder={AUTHORING_COPY.MATERIAL.readTextPlaceholder}
            aria-label={AUTHORING_COPY.MATERIAL.readTextLabel}
            // placeholder 는 자료가 비었을 때(사진 판독 0자 등) 화면에 남는 유일한
            // 안내문이다 — slate-400(2.63:1)이면 빈 상자가 된다. slate-500(4.77:1).
            className={cn(
              DESK.read,
              "h-full min-h-[220px] w-full max-w-[76ch] resize-none rounded-lg border border-slate-200 bg-white p-4 text-slate-800 outline-none transition-colors placeholder:text-slate-500 focus:border-blue-400 focus:ring-2 focus:ring-blue-100",
            )}
          />
        </div>
      </div>

      {/* ── ② 사이드 320px — 결정 세 덩어리가 각자 제목을 갖는다 ──────────── */}
      <aside
        className={cn(
          "flex w-[320px] shrink-0 flex-col gap-4 overflow-y-auto border-l p-4",
          RULE,
        )}
      >
        {/* 역할 — 자료 행과 **같은 컴포넌트**를 쓴다(두 자리가 갈라지지 않게). */}
        <div className="flex flex-col gap-1">
          <FieldLabel>{AUTHORING_COPY.MATERIAL.roleLabel}</FieldLabel>
          <MaterialRoleMenu
            value={material.role}
            onChange={(next) =>
              onChange(material.id, { role: next, roleLocked: true })
            }
            materialName={name}
            className="-ml-2 self-start"
          />
        </div>

        <div className={cn("border-t", HAIRLINE)} />

        {/* 자료별 요청 — 60,000자 본문 "옆"이 아니라 세로 rule 로 잘린 전용 칼럼에
            자체 제목을 갖고 놓인다. 그래서 묻히지 않는다(정찰 질문에 대한 답). */}
        <div className="flex flex-col gap-1">
          <FieldLabel htmlFor="material-review-note">
            {AUTHORING_COPY.MATERIAL.noteLabel}
          </FieldLabel>
          <textarea
            id="material-review-note"
            rows={5}
            maxLength={500}
            value={material.note}
            onChange={(e) => onChange(material.id, { note: e.target.value })}
            placeholder={AUTHORING_COPY.MATERIAL.notePlaceholder}
            className={cn(
              DESK.meta,
              "w-full resize-none rounded-md border border-slate-200 bg-white p-3 leading-relaxed text-slate-800 outline-none transition-colors placeholder:text-slate-500 focus:border-blue-400 focus:ring-2 focus:ring-blue-100",
            )}
          />
        </div>

        <div className={cn("border-t", HAIRLINE)} />

        {/* 전달 분량 — 옛 파란 안내 상자("AI는 여기 보이는 내용만 읽어요")를 대체하는
            정직성 장치. 60,000자를 붙여도 실리는 것은 역할별 예산까지다.
            -mx-2 px-2 는 힌트 글로우가 글자에 닿지 않게 만드는 여백이다(상쇄되므로
            좌측 기준선은 그대로다). */}
        <div
          ref={budgetSectionRef}
          className="-mx-2 flex flex-col gap-2 rounded-md px-2"
        >
          <FieldLabel>{AUTHORING_COPY.MATERIAL.budgetLabel}</FieldLabel>
          <Gauge
            value={spend.sent}
            total={spend.total}
            ariaLabel={AUTHORING_COPY.MATERIAL.budgetLabel}
          />
          <p className={cn(DESK.meta, "leading-snug text-slate-500")}>
            {AUTHORING_COPY.MATERIAL.budgetBody(spend.sent, spend.total)}
          </p>
        </div>

        {/* 원본 페이지 첨부 — PDF·사진일 때만. 밑줄·굵게·박스·표는 글자로 옮기는
            순간 사라지므로, 그 자료는 페이지 그림도 함께 보내야 정확해진다.
            켜고 끄는 것은 **사람**이다(숨은 자동 결정 금지 — 원가가 붙는다). */}
        {hybrid ? (
          <>
            <div className={cn("border-t", HAIRLINE)} />
            <div className="flex flex-col gap-2">
              <label className="flex cursor-pointer items-start gap-2">
                <input
                  type="checkbox"
                  checked={material.sendPages === true}
                  onChange={(e) =>
                    onChange(material.id, { sendPages: e.target.checked })
                  }
                  className={cn(
                    "mt-px size-4 shrink-0 cursor-pointer accent-blue-600",
                    FOCUS_RING,
                  )}
                />
                <span className={cn(DESK.body, "text-slate-700")}>
                  {AUTHORING_COPY.MATERIAL.sendPages(pageCount)}
                </span>
              </label>
              <p className={cn(DESK.meta, "leading-snug text-slate-500")}>
                {AUTHORING_COPY.MATERIAL.sendPagesHint}
              </p>
            </div>
          </>
        ) : null}
      </aside>
    </WideModal>
  );
}
