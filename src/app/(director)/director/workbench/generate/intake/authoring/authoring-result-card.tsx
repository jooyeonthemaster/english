"use client";

// ============================================================================
// AI 지문 만들기 — 결과 지문 1편. **카드가 아니라 모달 본문의 한 '행'이다.**
//
// 이 행의 목적은 "믿고 · 고치고 · 넣는다" 세 동작을 한자리에서 끝내는 것이다.
//   1) 믿는다 — 무엇을 어떻게 설계했는지(plan)와 왜 그렇게 썼는지(rationale)를
//      접지 않고 항상 펼쳐 둔다. 설명이 곧 이 기능의 상품가치다.
//   2) 고친다 — 본문은 읽기 전용 프리뷰가 아니라 곧바로 편집 가능한 에디터다.
//   3) 넣는다 — 선택 토글로 등록 대상을 고른다(선택 상태는 모달이 소유).
//
// ── 조판 계약 (2026-07-26 전면 재조판) ─────────────────────────────────────
//
//  ① **상자가 없다.** 구조는 상자가 아니라 선·여백·머리표가 만든다.
//     구 마크업은 모달(rounded-2xl) > 카드(rounded-lg border p-4) > 회색 블록
//     (rounded-md p-3) 3중 중첩이었고, 중첩 패딩이 좌측 정렬선을 네 개로 쪼갰다
//     (모달 20 / 카드 헤더 33 / 회색 블록 안 글자 45~48). 발주 밴드가 같은 문제를
//     이미 이렇게 풀었다 — authoring-composer.tsx 머리 주석 "상자를 지우고 선과
//     여백만 남긴다". 결과 행에는 그 처방이 적용돼 있지 않았다.
//     → 이 행이 갖는 유일한 가로 패딩은 MODAL_ROW_INSET(셸 거울) 하나다. 그래서
//       행 안의 모든 머리표·본문 상자·지표·행동 칩이 **같은 x** 에서 시작한다.
//       실측(Playwright + 프로젝트 postcss 로 컴파일한 실제 CSS):
//         행 인셋 · 번호 토글 · 본문 상자 · 지표 머리표 · 지표 첫 라벨 · 행동 칩 ·
//         힌트 줄 · 푸터 글자 · 헤더 제목이 전부 한 값(셸에 icon 을 넘기지 않는다 —
//         results-modal 계약 ④).
//     ⚠️ **딱 하나 남는 어긋남: 본문 첫 글자(인셋 +21).** 상자 테두리 1 +
//       공용 PassageContentEditor 의 surface `px-5` 20 이다. 이건 취향이 아니라
//       기하학이다 — 본문이 인셋 안의 테두리 상자에 사는 한 "상자는 인셋 안" 과
//       "글자는 인셋 위"는 동시에 성립할 수 없다(글자를 인셋으로 끌어오면 테두리가
//       인셋 밖으로 나가거나 글자가 테두리에 붙는다). 그래서 정렬의 기준은
//       **상자 테두리**로 두고(다른 모든 블록과 동일), 20px 은 입력칸의
//       안쪽 여백으로 남긴다. 공용 컴포넌트를 고쳐 padding 을 0 으로 만들지 말 것.
//     ⚠️ 아이콘이 이끄는 문장의 들여쓰기는 이 표면에서 **하나뿐이다: size-3.5 +
//       gap-1 = 18px**(경고 줄, 커버리지 과밀 안내). gap-2 로 벌리면 같은 성격의
//       문장이 22 와 18 두 x 에서 시작한다 — 실제로 그랬다.
//
//  ② **제목 입력도 상자를 벗었다.** 구 제목은 `rounded-md border px-2` 라 글자가
//     인셋에서 9px 더 밀렸고, 바로 아래 본문 에디터의 글자는 21px 밀려 있었다 —
//     세로로 붙은 두 입력의 글자 시작점이 12px 어긋났다. 지금 제목은 투명 배경 ·
//     px-0 · 아래 hairline 만 갖는다(hover 에서 slate-300, focus 에서 blue-500).
//     상자를 없앤 대가는 문구가 상환한다: 모달이 "제목과 본문은 지금 바로 고쳐도
//     돼요"(RESULTS_MODAL.pickHint)를 **항상** 띄운다.
//
//  ③ **본문이 지배적 시선 시작점이다.** 구 배치는 위계가 뒤집혀 있었다 — 설계·왜는
//     회색 채움(SURFACE.sunken)으로 가장 무거운데 정작 산출물인 지문은 흰 배경 +
//     1px 테두리로 가장 약했다. 이 화면에서 할 일은 ① 지문을 읽고 ② 쓸지 판단하고
//     ③ 넣기인데, ①의 대상이 가장 안 보였다.
//     → 채움을 걷어내 근거를 kicker + 흐르는 글로 낮추고, 본문만 테두리 있는 흰
//       상자로 남겼다. 이제 행에서 무게 1위는 본문이다.
//     ⚠️ 이 때문에 구 계약 "plan 은 본문보다 먼저 적힌 계획이라 카드에서도 본문
//       위에 온다"를 **파기**했다. 그 근거는 *생성 순서*였고 이 화면의 관심사는
//       *읽는 순서*다. 판단은 산출물을 본 다음에 하는 것이라 근거가 뒤에 온다.
//
//  ④ **1열 문서다 — 카드 안 2단(본문 | 근거)은 반나절 만에 파기됐다(26-07-26).**
//     2단의 가정은 "근거 컬럼이 본문 옆 빈 700px 을 채운다"였는데, 실사용 첫
//     화면(오너 스크린샷: "오른쪽에 다 때려박혀서 문제가 심각해")이 반증했다:
//       · 근거 컬럼(≈490px)은 **긴 산문을 담을 수 없다.** plan 의 다섯 값은 완결된
//         영어 문장이고 rationale 은 한국어 2~4문장이다 — 좁은 레일에서 값 하나가
//         4~6줄로 접혀 컬럼 하나가 세로로 무한히 자랐다.
//       · 좌·우 높이는 **구조적으로 무관하다.** 본문 상자는 220~420px 확정인데
//         근거 길이는 모델 서술량의 함수다. 우가 길면 좌 아래가 통째로 비고
//         (실사용: 본문+지표 ≈510px vs 근거 ≈900px), 그 공백이 "왼쪽이 죽은
//         화면"으로 읽혔다.
//     산문이 필요로 하는 것은 옆자리가 아니라 **폭**이다. 근거는 본문 아래로
//     내려와 같은 측정 컬럼에서 전폭으로 흐른다. 읽는 순서(③)도 이제 시선 왕복
//     없이 위→아래 하나다: 본문 → 숫자 → 설계 → 이유 → 이행 → 행동.
//     ⚠️ 2단을 되살리려면 "완결 문장 여러 개가 340~530px 컬럼에서 몇 줄로
//       접히는가"부터 답할 것. 모달을 넓혀 풀 수 있는 문제도 아니다 — 넓히는
//       순간 ⑤의 행폭 계약이 먼저 깨진다.
//
//  ⑤ **측정 컬럼은 모달 폭이 만든다. 이 파일은 가로 상한(max-w)을 갖지 않는다.**
//     결과 모달이 max-w-[720px] 로 좁혀져(산식은 results-modal 머리 주석):
//       콘텐츠 폭   = 720 − 패널 테두리 2 − 인셋 40 = 678px
//       에디터 내폭 = 678 − 상자 테두리 2 − surface px-5 40 = 636px
//                   ≈ 13.5px 영문 79자/행 < 90 (설계 바이블 §1 행폭 계약)
//     이라 컬럼 자체가 행폭 계약 안이다. 덕분에 행 안 모든 블록의 **좌·우 경계가
//     셸 인셋과 정확히 일치**한다. 구 68ch 상한은 본문에만 걸려 우측 경계를 두
//     개로 갈랐고(1200px 모달에서 본문 769 vs 형제 1279), 전 블록에 걸자니
//     오른쪽 500px 이 통째로 비었다 — 폭이 곧 측정이면 두 문제가 동시에 없다.
//     ⚠️ 이 파일에 max-w 를 다시 들이거나 모달을 넓히고 싶으면, 행폭 계약(§1)과
//       우측 경계 단일성을 **같이** 답해야 한다.
//
//  ⑥ **지표(숫자 줄)는 화면에서 제거됐다(26-07-26 저녁, 오너 지시: "그냥 이거
//     없애").** 단어/문장/평균/기출 대비 9칸이 본문과 해석 사이에 숫자벽을 세워
//     정작 읽어야 할 것을 밀어냈다. 수치가 사라진 것은 아니다 — 서버가 여전히
//     계산해 잡 result(item.metrics)와 로그에 남는다. 화면에 되살리려면 오너
//     승인부터 받을 것. 배치 중복 경고(item.warnings)만 남는다 — 그건 숫자가
//     아니라 판단이 필요한 사실 통지다.
//
//  ⑦ **덩어리 사이 24, 덩어리 안 8~12.** 구 마크업은 성격이 네 갈래인 8개 섹션을
//     균질한 gap-3(12) 으로 쌓아 덩어리가 안 보였다(설정 레일이 SpecGroup 으로
//     이미 푼 문제다 — 묶음 사이만 벌린다). 지금: 머리(제목) → 16 → 본문 이하
//     덩어리들(gap-6 = 24), 머리표 → 내용 8, 문단 사이 8.
//
// ── 회귀 방지 계약 (지금도 유효) ────────────────────────────────────────────
//  - PassageContentEditor 는 `key={item.id}` 로 고정한다. 폴링으로 run.items 가
//    늘어나 행이 리렌더돼도 에디터가 재마운트되지 않아 커서가 튀지 않는다.
//  - 에디터 래퍼는 "확정 높이"를 갖는다. 에디터 루트가 h-full 이라 부모 높이가
//    auto 면 내부 스크롤 계약이 무너진다(passage-input-row 와 동일한 실측 규약).
//    단 그 확정값은 **45vh 를 넘지 않는다** — 넘는 순간 모달 스크롤포트를 통째로
//    덮어 좁은 화면에서 행 밖으로 나갈 길이 사라진다.
//  - **스크롤은 둘뿐이다**: WideModal 본문 하나 + 에디터 자기 하나. 세 번째를
//    만들지 않는다(설계·이유 블록이 길다고 max-h + overflow 를 걸고 싶어지면
//    그것이 세 번째다 — 길면 흐르게 둔다).
//  - overscroll-contain: 안쪽 스크롤이 끝에 닿았을 때 그 관성이 모달 본문으로
//    번져 페이지가 튀는 것(스크롤 체이닝)을 여기서 끊는다.
//  - 행폭(한 줄 90자 이하)은 이 파일이 아니라 **모달 폭(720)이 지킨다**(머리 주석
//    ⑤). 이 파일에 max-w 를 들이지 말 것 — 우측 경계가 다시 갈라진다.
//  - targetWords 는 **모를 수 있다**(새로고침으로 복구한 run 은 spec 이 없다).
//    모르면 기본값으로 채우지 않는다 — 커버리지 패널의 기대 사용량 분모가
//    오염된다. **값·판정을 통째로 렌더 생략**한다(모르는 것을 아는 척하지 않는다).
//  - 배치 중복 경고(item.warnings)는 서버가 이미 계산해 잡 result 에 저장한 값이다.
//    **차단하지 않고 표시만 한다**(PLAN STEP 7-5). 그리는 자리는 여기 한 곳뿐이라,
//    이 블록을 지우면 "같은 소재 3편"이 아무 표시 없이 그대로 등록된다.
//    톤은 안내(slate-600 + Info)다 — rose 는 '실패'로 읽혀 등록을 막는 것처럼 보인다.
//  - 후속 요청 칩은 **실행하지 않는다.** 컴포저를 채우고 스냅샷을 복원할 뿐이다
//    (onFollowUp 미전달이면 칩 자체를 그리지 않는다 — 죽은 버튼을 만들지 않는다).
//  - 글자를 자르지 않는다(truncate 금지). 설명·경고는 접히기만 한다.
//  - `data-authoring-card` 는 힌트 글로우의 유일한 표적이다(모달의 needSelection
//    경로). 상자를 걷어냈어도 이 속성은 남는다 — 글로우는 이제 전폭 띠로 뜬다.
//  - 화면 문구는 전량 passage-authoring-glossary.ts 경유(게이트 ⑤).
// ============================================================================

import { Check, Info, TriangleAlert } from "lucide-react";

import { PassageContentEditor } from "@/components/workbench/editor/passage-content-editor";
import {
  PASSAGE_SKELETON_LABELS,
  type AuthoringResultItem,
  type PassageSkeleton,
} from "@/lib/passage-authoring/schema";
import { AUTHORING_COPY } from "@/lib/wording/passage-authoring-glossary";
import { cn } from "@/lib/utils";

import { AuthoringButton, Kicker } from "./authoring-primitives";
import {
  BTN_MD,
  CHIP_H,
  DESK,
  FOCUS_RING,
  SEG_OFF,
  SEG_ON,
} from "./authoring-tokens";

/**
 * 결과 모달 본문 한 행의 좌우 인셋 — WideModal 헤더/푸터(wide-modal.tsx:135,162)의
 * `px-4 sm:px-5` 를 **글자 그대로** 거울로 받는다. 값이 아니라 문자열을 복사하는
 * 이유는 20px 이 6단 간격 그리드(4/8/12/16/24/32) 밖이기 때문이다 — 여기서 16 을
 * 고집하는 순간 모달의 인셋이 다시 두 개가 되고, 오너가 지적한 "좌우 여백이 하나도
 * 안 맞음"이 그대로 돌아온다. 공용 셸은 수정 금지 대상이므로 이쪽이 맞춘다.
 *
 * ⚠️ 조판대에서 `sm:` 가 허용되는 유일한 자리다. 이건 분기가 아니라 **셸 따라가기**다.
 * ⚠️ 이 상수는 모달 본문의 다른 직속 자식(진행 줄·힌트 줄·빈 상태)도 함께 쓴다.
 *   authoring-tokens.ts 가 아니라 여기 사는 것은 공용 토큰 파일이 병행 작업의 충돌
 *   지점이기 때문이고, 모달이 이 파일을 이미 import 하고 있어 역방향 순환이 생기지
 *   않기 때문이다.
 */
export const MODAL_ROW_INSET = "px-4 sm:px-5";

/** 후속 요청 "N편 더"의 기본 편수. 한 화면에서 늘 같은 수여야 예측 가능하다. */
const FOLLOWUP_MORE_COUNT = 3;

/** 본문 길이에 맞춰 에디터 높이를 확정한다(220~420px). 값은 편집 중 흔들리지
 *  않도록 "생성 시점 metrics" 기준으로 한 번만 정한다.
 *  targetWords 는 없을 수 있다(복구 run) — 그때는 150단어 폴백으로 떨어진다.
 *  높이는 사실 주장이 아니라 상자 크기라 폴백이 화면을 거짓말하게 만들지 않는다. */
function editorHeightPx(
  item: AuthoringResultItem,
  targetWords: number | undefined,
): number {
  const basis = item.metrics?.words || targetWords || 150;
  return Math.min(420, Math.max(220, Math.round(basis * 1.9)));
}

/** 이번 편에 실제로 실린 자료 분량 합계. 없으면 null(모르는 것을 말하지 않는다). */
function sumCharsSent(
  item: AuthoringResultItem,
): { sent: number; total: number } | null {
  const table = item.perMaterialCharsSent;
  if (!table) return null;
  let sent = 0;
  let total = 0;
  for (const entry of Object.values(table)) {
    sent += entry?.sent ?? 0;
    total += entry?.total ?? 0;
  }
  return total > 0 ? { sent, total } : null;
}

export interface AuthoringResultCardProps {
  item: AuthoringResultItem;
  /** 1-based 표시 번호. */
  order: number;
  selected: boolean;
  onToggleSelect: () => void;
  title: string;
  content: string;
  onTitleChange: (v: string) => void;
  onContentChange: (v: string) => void;
  disabled: boolean;
  /**
   * 이 실행의 목표 분량(단어). 목표 대비 %·offTarget 안내·커버리지 기대 사용량의
   * 기준이라 **모르면 판정하지 않는다** — 기본값(165)으로 대신 판정하면 240단어로
   * 발주한 실행이 "목표 165단어 대비 +45%"로 찍히고 offTarget 경고까지 뜬다.
   * 실측 단어 수·문장 수처럼 목표와 무관한 사실은 그대로 보여 준다.
   */
  targetWords?: number;
  /** 후속 요청 — 컴포저를 채울 뿐 실행하지 않는다. 없으면 칩을 그리지 않는다. */
  onFollowUp?: (prompt: string) => void;
}

export function AuthoringResultCard(props: AuthoringResultCardProps) {
  // 상태 분기를 최상위에서 끝낸다 — 훅은 전부 아래 OK 행 안에 있어 조건부
  // 호출이 구조적으로 불가능하다(FAILED 편이 섞인 목록에서 훅 순서가 깨지지 않는다).
  if (props.item.status === "FAILED") {
    return <AuthoringResultFailedCard item={props.item} order={props.order} />;
  }
  return <AuthoringResultOkCard {...props} />;
}

// ── 완성된 편 ───────────────────────────────────────────────────────────────

function AuthoringResultOkCard({
  item,
  order,
  selected,
  onToggleSelect,
  title,
  content,
  onTitleChange,
  onContentChange,
  disabled,
  targetWords,
  onFollowUp,
}: AuthoringResultCardProps) {
  // (hasTarget 은 커버리지 패널의 "N단어 지문에는 보통 …" 안내 전용이었다 —
  //  패널과 함께 사라졌다. targetWords 자체는 편집기 높이 계산에 여전히 쓴다.)

  // 서버가 배치 후처리에서 붙인 표시용 경고. 비면 아무것도 그리지 않는다.
  const warnings = (item.warnings ?? [])
    .map((warning) => warning.trim())
    .filter((warning) => warning.length > 0);
  const rationale = item.rationale.trim();
  const summary = item.koreanSummary.trim();
  const topicLabel = item.topicLabel.trim();
  const materialCount = item.usedMaterialIds?.length ?? 0;
  const charsSent = sumCharsSent(item);
  const plan = item.plan;
  const planSkeletonLabel = plan?.skeleton
    ? PASSAGE_SKELETON_LABELS[plan.skeleton as PassageSkeleton]
    : undefined;
  const hasWhyBlock = Boolean(summary || rationale);

  return (
    <article
      data-authoring-card={item.id}
      className={cn(
        "relative min-w-0",
        MODAL_ROW_INSET,
        // 선택 = 좌측 2px accent bar. 배경을 물들이거나 테두리 색을 바꾸지 않는다
        // (선은 간격 그리드의 대상이 아니라는 §1 명시 예외). left-0 은 인셋 **밖**
        // 이라 패널 x=0 에 앉는다 — 글자 시작점을 한 픽셀도 밀지 않는다.
        selected
          ? "before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-blue-600"
          : null,
      )}
    >
      {/* 1. 머리 — 선택 토글(번호 뱃지와 병합) + 제목.
          구 마크업은 체크박스 button 과 번호 뱃지 button 두 개가 같은 onToggleSelect
          를 들고 있었고 뒤엣것은 aria-hidden 이었다(스크린리더에는 없는 버튼을 눈은
          보고 누른다). 하나의 h-9 토글로 합쳐 조작점과 표시를 일치시킨다. */}
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          onClick={onToggleSelect}
          disabled={disabled}
          aria-pressed={selected}
          aria-label={AUTHORING_COPY.A11Y.selectPassage(order, selected)}
          className={cn(
            DESK.body,
            BTN_MD,
            // tabular-nums 가 없으면 토글 폭이 번호 글리프 폭을 따라 흔들리고, 그
            // 차액이 그대로 **제목 입력의 시작 x** 로 옮겨간다(실측 Δ1.86px). 같은
            // 목록에서 같은 성격의 글자가 편마다 다른 x 에서 시작하는 것이 오너가
            // 지적한 "들쭉날쭉"의 미시 형태다.
            "inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-md border px-2 tabular-nums transition-colors",
            selected ? SEG_ON : SEG_OFF,
            FOCUS_RING,
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
        >
          <Check
            className={cn("size-3.5 shrink-0", selected ? null : "text-transparent")}
            aria-hidden="true"
          />
          {AUTHORING_COPY.RESULT.order(order)}
        </button>
        {/* 상자 없는 제목 입력(머리 주석 ②). px-0 이라 글자가 인셋에서 정확히
            시작한다. 어포던스는 아래 hairline 이 진다 — 평상시 투명, hover 에서
            slate-300, focus 에서 blue-500. 테두리 폭은 항상 1px 이라 상태가 바뀌어도
            줄 높이가 흔들리지 않는다. */}
        <input
          value={title}
          onChange={(event) => onTitleChange(event.target.value)}
          disabled={disabled}
          placeholder={AUTHORING_COPY.RESULT.titlePlaceholder}
          aria-label={AUTHORING_COPY.A11Y.passageTitle(order)}
          className={cn(
            DESK.title,
            BTN_MD,
            "min-w-0 flex-1 border-b border-transparent bg-transparent px-0 text-slate-900 outline-none transition-colors",
            "placeholder:font-medium placeholder:text-slate-400",
            "hover:border-slate-300 focus:border-blue-500",
            "disabled:text-slate-400",
          )}
        />
      </div>

      {/* 2. 본문 → 숫자 → 설계 → 이유 → 이행 → 행동. 위→아래 한 줄이다(머리 주석 ④).
          덩어리 사이 24(gap-6)는 ⑦의 값. 폭 상한이 없는 이유는 ⑤ — 측정 컬럼은
          모달 폭(720)이 만들고, 그래서 모든 블록의 우측 경계가 셸 인셋과 일치한다. */}
      <div className="mt-4 flex min-w-0 flex-col gap-6">
        {/* 본문 — 확정 높이 래퍼 안의 편집기(툴바 없음). 이 행에서 유일하게
            테두리를 갖는 그릇이고, 그래서 시선이 여기서 시작한다(머리 주석 ③). */}
        <div
          className="w-full overflow-hidden overscroll-contain rounded-md border border-slate-200 bg-white"
          style={{ height: `min(${editorHeightPx(item, targetWords)}px, 45vh)` }}
        >
          <PassageContentEditor
            key={item.id}
            content={content}
            onChange={onContentChange}
            readOnly={disabled}
            hideToolbar
            placeholder={AUTHORING_COPY.RESULT.bodyPlaceholder}
          />
        </div>

        {/* 배치 중복 경고 — 서버(run-job.annotateBatchOverlap)가 편 간 소재
            라벨 일치·핵심어 자카드·고유명사 중복·골격 중복을 세어 담아 둔 값이다.
            문구는 서버가 이미 한국어 해요체로 완성해 내려보내므로 사전을 거치지
            않는다(리터럴이 아니라 런타임 데이터다). **차단하지 않고 표시만 한다** —
            "3편 다 같은 소재"를 등록 직전에 눈으로 잡는 유일한 자리이며, 판단과
            다음 행동은 선생님이 고른다. 그래서 rose 가 아니라 slate-600 + Info 다. */}
        {warnings.length > 0 ? (
          <ul className="flex min-w-0 flex-col gap-1">
            {warnings.map((warning) => (
              <li
                key={warning}
                className={cn(
                  DESK.meta,
                  "flex min-w-0 items-start gap-1 leading-snug text-slate-600",
                )}
              >
                <Info className="mt-px size-3.5 shrink-0" aria-hidden="true" />
                <span className="min-w-0 break-words">{warning}</span>
              </li>
            ))}
          </ul>
        ) : null}

        {/* 설계(plan) — 오너가 요구한 "강박적 설계"의 가시화. 회색 채움에서 꺼내
            kicker + 정의목록으로 흘린다(머리 주석 ①·③). 전폭이라 완결 문장인
            값들이 1~2줄에 눕는다 — 좁은 레일에서 4~6줄로 접히던 것(④)과 대비. */}
        {plan ? (
          <section className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <Kicker>{AUTHORING_COPY.RESULT.planTitle}</Kicker>
              {plan.skeleton ? (
                <span
                  className={cn(
                    DESK.kicker,
                    CHIP_H,
                    "inline-flex items-center rounded-full border border-slate-200 bg-white px-2 text-slate-600",
                  )}
                >
                  {planSkeletonLabel
                    ? `${plan.skeleton} · ${planSkeletonLabel}`
                    : plan.skeleton}
                </span>
              ) : null}
            </div>
            {/* closingMove 는 구 마크업이 통째로 빼먹고 있었다(사전에 라벨
                RESULT.planClosing 은 있는데 소비처가 없었다). 모델이 적은 다섯
                결정 중 하나를 화면에서 지우면 "강박적 설계"의 근거가 줄어든다.
                grounding 은 여전히 그리지 않는다 — 값이 a/b/c 코드라 사람이
                읽을 문장이 아니다. */}
            <dl className="mt-2 grid gap-2">
              <PlanLine
                label={AUTHORING_COPY.RESULT.planThesis}
                value={plan.thesis}
              />
              <PlanLine
                label={AUTHORING_COPY.RESULT.planWarrantA}
                value={plan.warrantA}
              />
              <PlanLine
                label={AUTHORING_COPY.RESULT.planWarrantB}
                value={plan.warrantB}
              />
              <PlanLine label={AUTHORING_COPY.RESULT.planTurn} value={plan.turn} />
              <PlanLine
                label={AUTHORING_COPY.RESULT.planClosing}
                value={plan.closingMove}
              />
            </dl>
          </section>
        ) : null}

        {/* 왜 이 지문인가 — 접지 않고 전문을 흘린다. 절대 truncate 하지 않는다. */}
        {hasWhyBlock ? (
          <section className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <Kicker>{AUTHORING_COPY.RESULT.whyTitle}</Kicker>
              {topicLabel ? (
                <span
                  className={cn(
                    DESK.kicker,
                    CHIP_H,
                    "inline-flex items-center rounded-full border border-slate-200 bg-white px-2 text-slate-600",
                  )}
                >
                  {topicLabel}
                </span>
              ) : null}
              {/* "자료 N건 반영"은 무엇이 얼마나 실렸는지 아무것도 말하지 않는다.
                  실제로 실린 글자 수를 알면 그 사실을 그대로 적는다. */}
              {materialCount > 0 ? (
                <span className={cn(DESK.meta, "tabular-nums text-slate-500")}>
                  {charsSent
                    ? AUTHORING_COPY.RESULT.materialsUsedWithChars(
                        materialCount,
                        charsSent.sent,
                        charsSent.total,
                      )
                    : AUTHORING_COPY.RESULT.materialsUsed(materialCount)}
                </span>
              ) : null}
            </div>
            {summary ? (
              <p
                className={cn(
                  DESK.body,
                  "mt-2 break-words leading-snug text-slate-800",
                )}
              >
                {summary}
              </p>
            ) : null}
            {rationale ? (
              <p
                className={cn(
                  DESK.meta,
                  "mt-2 whitespace-pre-wrap break-words leading-relaxed text-slate-600",
                )}
              >
                {rationale}
              </p>
            ) : null}
          </section>
        ) : null}

        {/* ⚠️ 여기 있던 커버리지 패널("요청하신 내용이 이렇게 반영됐어요" — 표제어
            N개 중 M개 · %)은 26-08-04 오너 결정으로 **화면에서만** 제거했다.
            근거: 선생님이 그 숫자를 보고 할 행동이 없었고, 분모가 올린 단어장
            크기라 지문 길이와 무관해서(200표제어 vs 165단어) 정상 결과가 늘
            실패처럼 읽혔다 — 패널 자체가 그 오독을 막으려고 안내 문구 세 줄을
            달고 있었다는 사실이 곧 지표가 화면에 맞지 않는다는 증거였다.
            item.coverage 는 **그대로 살아 있다**(서버 계산·스키마·DB 저장 불변).
            되살릴 때는 사전(COVERAGE 묶음)을 먼저 복구할 것 — 문구를 여기 손코딩
            하면 게이트 ⑤ 에 걸린다. */}

        {/* 행동 — 누르면 컴포저가 채워질 뿐 실행되지 않는다. 행의 마지막 덩어리. */}
        {onFollowUp ? (
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <AuthoringButton
              size="sm"
              variant="secondary"
              disabled={disabled}
              onClick={() =>
                onFollowUp(AUTHORING_COPY.FOLLOWUP.PROMPT.more(FOLLOWUP_MORE_COUNT))
              }
            >
              {AUTHORING_COPY.FOLLOWUP.more(FOLLOWUP_MORE_COUNT)}
            </AuthoringButton>
            <AuthoringButton
              size="sm"
              variant="secondary"
              disabled={disabled}
              onClick={() => onFollowUp(AUTHORING_COPY.FOLLOWUP.PROMPT.harder)}
            >
              {AUTHORING_COPY.FOLLOWUP.harder}
            </AuthoringButton>
            <AuthoringButton
              size="sm"
              variant="secondary"
              disabled={disabled}
              onClick={() => onFollowUp(AUTHORING_COPY.FOLLOWUP.PROMPT.otherSpine)}
            >
              {AUTHORING_COPY.FOLLOWUP.otherSpine}
            </AuthoringButton>
          </div>
        ) : null}
      </div>
    </article>
  );
}

// ── 조각 ────────────────────────────────────────────────────────────────────

function PlanLine({ label, value }: { label: string; value?: string }) {
  const text = (value ?? "").trim();
  if (!text) return null;
  return (
    <div className="flex min-w-0 items-baseline gap-2">
      <dt className={cn(DESK.meta, "w-16 shrink-0 text-slate-500")}>{label}</dt>
      <dd className={cn(DESK.meta, "min-w-0 break-words leading-snug text-slate-700")}>
        {text}
      </dd>
    </div>
  );
}

// ── 실패한 편 ───────────────────────────────────────────────────────────────

function AuthoringResultFailedCard({
  item,
  order,
}: {
  item: AuthoringResultItem;
  order: number;
}) {
  return (
    // 실패도 상자를 갖지 않는다(머리 주석 ①). 구 rose-50 채움 + rose 테두리는
    // 성공 편과 다른 인셋을 만들었다. 실패 신호는 좌측 rose accent bar + rose
    // 아이콘 + rose 본문이 충분히 낸다 — 발주 밴드가 쓰는 것과 같은 처방이다.
    <article
      data-authoring-card={item.id}
      className={cn(
        "relative min-w-0",
        MODAL_ROW_INSET,
        "before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-rose-600",
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        {/* 번호 표식은 성공 편의 토글과 **같은 상자**다(BTN_MD · rounded-md · px-2 ·
            gap-1 · tabular-nums). 구 마크업은 아이콘 하나 + h-6 라운드 pill 이라 뒤따르는
            제목이 성공 편 제목과 최대 2.81px 어긋났다 — 같은 목록에서 '지문 제목'이
            세 개의 x 에서 시작한 것이다. 누를 수 없으므로 button 이 아니라 span 이고,
            실패 신호는 좌측 rose accent bar + rose 테두리·글자·아이콘이 낸다(채움은
            쓰지 않는다). */}
        <span
          className={cn(
            DESK.body,
            BTN_MD,
            "inline-flex shrink-0 items-center gap-1 rounded-md border border-rose-200 bg-white px-2 tabular-nums text-rose-700",
          )}
        >
          <TriangleAlert className="size-3.5 shrink-0" aria-hidden="true" />
          {AUTHORING_COPY.RESULT.order(order)}
        </span>
        {/* 길이가 고정된 문장이라 truncate 는 정보를 잃기만 한다(자를 여지가
            생기는 건 좁은 폭뿐인데, 그때가 바로 이 문장이 필요한 순간이다). */}
        <p className={cn(DESK.title, "min-w-0 text-slate-900")}>
          {AUTHORING_COPY.RESULT.failedOne}
        </p>
      </div>
      <p className={cn(DESK.meta, "mt-2 break-words leading-relaxed text-rose-700")}>
        {item.error?.trim() || AUTHORING_COPY.RESULT.failedBody}
      </p>
      <p className={cn(DESK.meta, "mt-2 leading-snug text-slate-600")}>
        {AUTHORING_COPY.RESULT.failedCredit}
      </p>
    </article>
  );
}
