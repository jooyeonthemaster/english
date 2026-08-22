"use client";

// ============================================================================
// 클래스 스튜디오 — 두 조판 뷰의 **공용** 자료 목록 판
// (docs/class-studio-spec.md §3.10.23 E24 / 구 §3.10.22 E22-UNITS [U10])
//
// 문제(StudioClassQuestionRow)와 학습지(StudioClassWorksheetRow)를 **한 목록**으로
// 합쳐 편다. E24 로 「조판실」 필이 소멸하고 `[학습지 조판 | 시험지 조판]` 2필이
// 그 자리를 받으면서, 축을 각각 돌던 레거시 2판(class-questions-pane.tsx ·
// class-worksheets-pane.tsx)과 이행기 스위치 `SHOW_LEGACY_ASSET_PILLS` 는 **삭제**
// 됐다 — 이제 이 판이 두 축의 **유일** 목록이고, 두 조판 뷰는 **같은 인스턴스**를
// 공유하며 `lockedKind` 로만 갈린다(아래 「축 고정」).
//
// ── 왜 타입별 델타 커밋인가(사라진 2판이 남긴 계약) ─────────────────────────
// 구 두 판은 각각 「선택 = 전량 교체(Set)」 / 「선택 = 담기·빼기 델타(entries,pick)」
// 라는 **서로 다른 커밋 계약**을 갖고 있었다. 한쪽 문법으로 통일하면
//   · 「Set 전량 교체」로 통일 ⇒ `guardSheetPickRemoval` dirty confirm
//     (studio-home-client.tsx)을 우회해 **E21-6-4 의 편집 증발이 재발**
//   · 이미 담긴 학습지가 재삽입되어 조판 순서가 마키 한 번에 뒤집힌다
//     (library-pane.tsx 「이미 담긴 항목은 건드리지 않는다」 계약)
// 그래서 이 판은 **타입별 델타**만 발신하고(onCommit(added, removed)), 호스트가
// 접두(`q:`/`w:`)로 갈라 문항은 handleFlatSelectionChange(Set), 학습지는
// handleSheetPickRows(entries, pick) 로 보낸다(§3.10.23 E24-2-3 무회귀 계약 —
// 「문항은 Set 전량 교체」는 **호스트 하류**를 서술한 것이지 이 판의 발신을
// `onChangeSelection(Set)` 으로 되돌리라는 뜻이 아니다. 되돌리면 위 dirty
// confirm 이 통째로 우회돼 E21 편집 증발이 재발한다).
//
// ── 축 고정(lockedKind) — E24 의 핵심 계약 ──────────────────────────────────
// `lockedKind="question"` 이면 이 판은 **문항 축 전용**으로 동작한다(시험지 조판
// 뷰). null/미전달이면 두 축이 병합돼 보인다(학습지 조판 뷰 — 「학습지 뒤에 문항
// 이어붙이기」 합본의 재료 창구라 **문항이 반드시 함께 보여야 한다**).
//
// ⚠ [E28] §3.10.27 로 **종류 세그먼트 탭 [전체|문제|학습지] 을 삭제**했다. 로컬
//   `kindFilter` 도 함께 소멸했으므로 축의 정본은 `effectiveKind = lockedKind ??
//   "all"` **단 한 줄**이고 값은 `"all" | "question"` 둘뿐이다. 구 계약
//   「고정은 지우지 않고 덮는 override 다 — 초기화하면 뷰를 한 번 다녀오는 것만으로
//   세그먼트 선택이 증발한다」는 **되돌릴 로컬 상태 자체가 없어져** 자동으로
//   만족된다(그래서 지운다). 탭을 되살리지 않는 한 이 자리에 상태를 다시 만들지 마라.
//
// ── [E28] §3.10.27 — 목록 문법의 갈림: 지문 카드 / 평면 ─────────────────────
// 학습지 조판 뷰(두 축이 함께 보임)는 **지문 카드 목록**, 시험지 조판 뷰(문항 축
// 고정)는 **평면 목록**이다. 갈림의 정본은 `cardMode = qIncluded && wIncluded`
// 라는 **렌더 사실** 하나다 — `lockedKind` 로 갈면 판이 뷰를 아는 계층 위반이 된다.
//
// 카드 목록의 3대 계약(어기면 전부 **무증상** 결함이 난다):
//  ⓐ **본문은 `{open && …}` 조건부 언마운트**. DragSelect 의 히트 수집은
//    `root.querySelectorAll("[data-drag-item-id]")` + 순수 rect 비교라 계층·가시성·
//    `inert` 를 **일절 보지 않는다**(drag-select.tsx:440-444). 도시에 카드처럼
//    `grid-rows-[0fr]` 시각 클립으로 접으면 **접힌 카드의 보이지 않는 행이 마키에
//    그대로 잡힌다**. 접힘 애니메이션과 inert 규약은 그 대가로 포기한다 — 둘 다
//    「본문 상시 마운트」를 전제로만 성립하는 장치다.
//  ⓑ **DragSelect 는 판 최상위 1개**. 카드마다 두면 중첩 인스턴스가 같은
//    mousedown 을 받고(drag-select.tsx:319-327) 카드 횡단 마키가 죽는다.
//    카드는 마키를 모르는 **순수 표시 컨테이너**다.
//  ⓒ **픽 배선은 기존 `onCommit` 델타 그대로**. 도시에 카드의 체크 채널
//    (onTogglePick / onToggleSheetPick)은 `pickedQuestions`(도시에 전용 Map)와
//    출처 "dossier" 로 기록된 픽으로 흘러, 조판·시험지 빌더가 읽는 `flatPicked` 에
//    **도달하지 않는다** — 채널째 이식하면 중앙에서 담은 문항이 조판에 0건 실린다.
//    그래서 이식 단위는 「컴포넌트」가 아니라 **마크업·시각 문법**이다. 같은 이유로
//    카드 안 행의 `data-drag-item-id` 는 `q:`/`w:` 접두를 **유지**한다(도시에 행은
//    접두 없는 raw id — 그대로 옮기면 커밋 라우팅과 게이트가 동시에 깨진다).
//
// ── 키 문법: 문자열 태그 `q:{questionId}` / `w:{reportId}` ────────────────────
// DragSelect 는 `Set<string>` 계약(drag-select.tsx:50-56)이라 두 축을 한 인스턴스에
// 얹으려면 키에 타입이 실려야 한다. **복합 객체 키 금지**(E22-4) — Map/Set 은 참조
// 동일성 조회라 렌더마다 새 객체를 만들면 has/delete 가 전부 미스난다.
// 두 id 는 각각 cuid 라 접두 없이도 충돌하지 않지만, 접두가 있어야 커밋 시점에
// **어느 호스트 계약으로 보낼지**를 O(1) 로 되찾을 수 있다.
//
// ── 행 문법 = 항상 2단 고정 ─────────────────────────────────────────────────
// 구 학습지 판의 1단↔2단 사다리 상수 `ROW_STACK_PX=860`(674px 브라우저 실측
// 파생)은 **승계하지 않는다** — 항상 2단이면 그 상수도,
// 히스테리시스도, ResizeObserver 도, 폭 0 고착 가드(E21-7 함정 3)도 전부 소멸한다.
// 1줄 = 제목(무경쟁 flex-1 — 이 줄에 다른 flex/shrink 요소를 절대 두지 마라.
// 학습지 판이 제목 13px 로 붕괴한 원인이 정확히 「같은 줄의 shrink-0 경쟁자들」이다),
// 2줄 = [타입배지][축별 메타][우측 일시]. 액션 클러스터는 두 줄 **바깥**의 행 직계
// 형제라 1줄의 무경쟁을 깨지 않는다(구 문항 판과 동형).
// ⚠ [E28] 이 계약은 **평면 행**의 것이다. 카드 **안쪽** 행은 「컴팩트 1줄」이라
//   예외인데, 위반이 아니라 전제가 다르다: 카드 머리가 지문 제목을 이미 말하므로
//   행에서 제목을 빼고, 제목이 빠지면 2단을 유지할 재료 자체가 없다.
//   같은 붕괴가 **카드 헤더로 이사**하지 않게 하는 것이 그 대가다 — 헤더 1줄의
//   shrink-0 형제는 chevron·배지·X **셋까지**(renderPassageCard 주석).
//
// ── 행 인터랙션(구 두 판에서 승계한 공통 문법 — 4가지) ──────────────────────
//  ① 무롤 div 루트 + data-drag-item-id(루트 role=checkbox 는 ARIA Children
//     Presentational 로 자손 버튼 시맨틱을 통째로 무효화한다)
//  ② role="checkbox" 좌측 실버튼 + 체크 순번 숫자(≤99)
//  ③ DragSelect deferCommit 마키
//  ④ 전체 선택(mixed = Minus) 헤더
// 본문 스팬에 cursor-pointer 금지(drag-select.tsx:124-125 CONTROL_CURSOR_CLASS 가
// 카드 루트가 아닌 자손의 제어 커서를 만나면 마키를 차단한다). chevron <Link> 에는
// `data-drag-select-ignore` 필수 — hardInteractive 첫 항목이 `"a"`
// (drag-select.tsx:275-288)라 조상에 anchor 가 있으면 마키가 아예 시작되지 않는다.
//
// ── memo 계약 ───────────────────────────────────────────────────────────────
// 이 판은 memo 로 감싼다. `pickedQuestionIds`(Set)·`pickedSheets`(Map)·콜백 5종은
// **호스트가 안정 참조로 소유**해야 memo 가 산다(§3.10.21 E21-5 「오케스트레이터
// 소유가 계약」). 여기서 파생하는 배열·Map 은 전부 useMemo 로 묶는다.
//
// §M(26-08-22) 모바일 학습 임시 숨김: 이 판은 플래그를 직접 소비하지 않는다.
// 행 [모바일 배포]는 활성·비활 두 분기가 **통째로** `{onDeploySheet ? … : null}`
// (액션 클러스터) 안에 있어, off 에서 오케스트레이터(감독 소관)가 onSheetDeploy
// 를 내리지 않으면 library-pane 배선(`onSheetDeploy ? handleSheetDeployRow :
// undefined`)이 이 prop 을 undefined 로 만들어 버튼·비활 래퍼·「모바일 배포」
// 자구가 전부 소멸한다(26-08-22 U5 검증 — 사용자 가시 잔재 0, SHOW_MOBILE
// 분기 불요). prop 계약·비활 분기 코드는 그대로 존치한다.
// ============================================================================

import { memo, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  LayoutTemplate,
  Layers,
  Loader2,
  Maximize2,
  Minus,
  RefreshCw,
  RotateCcw,
  Search,
  Smartphone,
  X,
} from "lucide-react";
import { DragSelect } from "@/components/ui/drag-select";
import { cn } from "@/lib/utils";
import { DIFFICULTY_LEVELS } from "@/lib/constants";
import {
  planForDifficulty,
  QUESTION_GENERATION_PLANS,
} from "@/lib/question-generation-plans";
import type { StudioClassWorksheetRow } from "@/actions/studio/worksheets";
import type { StudioClassQuestionRow } from "@/lib/studio/dossier-types";
import { canDeployWorksheetRow } from "@/lib/studio/sheet-deploy-eligibility";
import type { SheetPickMeta } from "@/lib/studio/sheet-pick-types";
import {
  SHEET_PLAN_LABEL,
  SHEET_STATUS_BADGE,
} from "@/lib/studio/sheet-products";
import { fmtDateTime } from "./panel-primitives";
import { questionRowTypeLabel } from "./passage-dossier-pane";
// 조회 상태 타입의 정본은 **판이 아니라 `@/lib/studio/list-states`** 다(E24-U5).
// 타입이 판 파일에 살면 그 판을 지우는 순간 소비처가 통째로 컴파일 불능이 되므로
// 「타입을 판 밖으로 먼저 이사 → import 재조준 → 판 삭제」라는 **순서 강제**가
// 이 import 한 줄이다. 사본을 만들지 마라 — 호스트가 같은 객체를 내리는데
// 타입만 갈리면 `truncated` 같은 additive 필드가 한쪽에서만 보인다.
import type {
  ClassQuestionsState,
  ClassWorksheetsState,
} from "@/lib/studio/list-states";

/**
 * 병합 행 — 키에 타입이 실린다(위 헤더 「키 문법」).
 * `sortAt` 은 **정렬 축 하나(createdAt)** 를 두 축에서 같은 이름으로 들어 올린
 * 값이다. 학습지 행은 이미 createdAt 을 싣고 있어 신규 질의 0
 * (src/actions/studio/worksheets.ts:113 — `createdAt: r.createdAt.toISOString()`).
 */
export type ComposerRow =
  | {
      kind: "question";
      key: `q:${string}`;
      sortAt: string;
      row: StudioClassQuestionRow;
    }
  | {
      kind: "worksheet";
      key: `w:${string}`;
      sortAt: string;
      row: StudioClassWorksheetRow;
    };

const DIFFICULTY_LABEL_MAP: ReadonlyMap<string, string> = new Map(
  DIFFICULTY_LEVELS.map((d) => [d.value, d.label]),
);

const STATUS_BADGE = SHEET_STATUS_BADGE;

/**
 * [E28B §8-1 C5] 카드 셀렉트 옵션의 **정렬 축**.
 *
 * 옵션 **집합**은 반드시 그 카드의 행에서 파생한다(유령 옵션 금지 — 이 파일이
 * passageOptions·planOptions·typeOptions 세 곳에서 이미 규율로 적어 둔 것을
 * 「학습지 상태」·「난이도」 두 셀렉트만 전역 리터럴로 어기고 있었다: 27장 × 최대
 * 7개의 「눌러도 0건이 되는 옵션」). 순서만 이 정본 배열을 따른다 — Set 순회(첫
 * 등장) 순서에 맡기면 같은 클래스에서 카드마다 상태 순서가 달라진다.
 */
const STATUS_ORDER: readonly string[] = [...SHEET_STATUS_BADGE.keys()];
const DIFFICULTY_ORDER: readonly string[] = DIFFICULTY_LEVELS.map(
  (d) => d.value,
);
/** 파생 집합을 정본 순서로 세우고, 정본에 없는 값은 뒤에 붙인다(데이터가 우선). */
const orderSeen = (seen: ReadonlySet<string>, order: readonly string[]) => [
  ...order.filter((v) => seen.has(v)),
  ...[...seen].filter((v) => !order.includes(v)),
];

const SELECT_CLS =
  "h-7 shrink-0 cursor-pointer rounded-md border border-slate-200 bg-white px-1.5 text-[11px] font-medium text-slate-600 outline-none transition-colors hover:border-slate-300 focus:border-blue-400 focus:ring-2 focus:ring-blue-100";

// 체크 시각 토큰 — 도시에 E11 행(PICK_BOX_*)과 **같은 문법**. 저쪽도 모듈 로컬
// 상수라 import 할 길이 없어 리터럴을 복제한다(어느 한쪽을 고칠 땐 두 곳을 함께).
// ※ 구 문항 판·학습지 판에도 같은 복제본이 있었으나 E24 로 두 판이 삭제됐다.
const BOX_BASE =
  "flex size-4 shrink-0 items-center justify-center rounded-[5px] border transition-colors";
const BOX_OFF = `${BOX_BASE} border-slate-300 bg-white text-transparent`;
// 체크 색이 곧 축 색이다(E22-UNITS [U10] 6): 문항 blue / 학습지 violet.
// 통합 번호를 만들지 않는 대신 **색으로** 두 시퀀스를 분리한다 — 한 열에
// 1·2·3 이 두 번 나타나는 것이 정상이고 그 사실이 색으로 즉시 읽혀야 한다.
// (E27 개정) **「눈에 보이는 줄 순서 = 인쇄 순서」는 더 이상 참이 아니다.**
// E24 는 축 우선 정렬(아래 mergedRows sort)로 목록을 「학습지 블록 → 문항 블록」으로
// 만들고, 인쇄도 「학습지 전부 → 문항 전부」였으므로 둘이 일치한다고 적었다.
// E27(§3.10.26 R1)이 인쇄를 **지문 단위 인터리브**로 바꿨다 —
// `[지문1 학습지들][지문1 문제들][지문2 학습지들][지문2 문제들]`. 목록 정렬은 그대로
// 축 우선이므로 두 순서는 다시 갈렸고, 그 갈림이 **정상**이다.
//
// 그래서 색이 다시 필수가 된다: 두 시퀀스가 각자 1부터 세는 데다 이제 인쇄에서 서로
// 끼워지므로, 배지 숫자만으로는 조판 위치를 읽을 수 없다. 순번의 정본은 변함없이
// **픽 Map 의 삽입 순서**(목록 순서가 아니다 — E22-4)이고, E27 은 그 Map 자체를
// 지문 그룹 순서로 재정렬하므로(`studio-home-client.tsx` withPassageGroupedOrder)
// **배지 숫자 = 실제 인쇄 차례**라는 계약은 그대로 유지된다.
// ⚠ 이 근거로 아래 축 우선 정렬을 「인쇄와 맞추려고」 되돌리지 마라 — 정렬의 살아 있는
//   이유는 「전용 탭에서 학습지 9건이 문항 205건 사이에 파묻히던 것」(아래 주석)이다.
const BOX_ON_Q = `${BOX_BASE} border-blue-600 bg-blue-600 text-white`;
const BOX_ON_W = `${BOX_BASE} border-violet-600 bg-violet-600 text-white`;

// 행 액션 — 구 학습지 판의 규격을 그대로 쓰되,
// 라벨은 컨테이너 쿼리로 접는다(아래 ROW_ACTION_LABEL). 뷰포트 유틸(sm:/lg:)은
// 금지 — 조판이 열리면 이 열이 420px 로 눌리는데 뷰포트는 그대로다(E21-4 축).
const ROW_ACTION_BASE =
  "flex h-[26px] shrink-0 items-center justify-center gap-1 overflow-hidden whitespace-nowrap rounded-md px-1.5 text-[10.5px] font-bold transition-colors";
const ROW_ACTION_SECONDARY = `${ROW_ACTION_BASE} cursor-pointer border border-blue-200 bg-blue-50 text-blue-700 hover:border-blue-300 hover:bg-blue-100`;
const ROW_ACTION_PRIMARY = `${ROW_ACTION_BASE} cursor-pointer bg-blue-600 text-white shadow-sm hover:bg-blue-700`;
// disabled 버튼은 포인터 이벤트를 받지 않아 title 툴팁이 뜨지 않는다(실측 —
// 구 학습지 판과 같은 근거). 사유는 래퍼 <span title> 이 띄운다.
const ROW_ACTION_DISABLED = `${ROW_ACTION_BASE} cursor-not-allowed bg-slate-100 text-slate-400`;
/** 라벨은 목록 **컨테이너**가 34rem(544px) 이상일 때만. 그 아래는 아이콘 + 툴팁. */
const ROW_ACTION_LABEL = "hidden @[34rem]:inline";

/**
 * 렌더 상한 — 단일 DragSelect 가 최대 1,900행(문항 1,000 + 학습지 300 절단 상한
 * + 여유)을 덮는 것은 두 판이 각각 돌던 시절에는 **없던 조합**이다. 필터·검색은
 * 전체 rows 를 대상으로 하고 상한은 **렌더에만** 건다(E22-UNITS [U10] 8).
 */
const RENDER_CHUNK = 300;

/**
 * [E28] §3.10.27 — **카드 모드의 렌더 상한 단위**(카드 1장의 섹션 1개당 행 수).
 *
 * 구 아코디언은 300 예산을 **선착순**으로 소진했다. 카드 1장이 60행이면 5장에서
 * 예산이 마르고 6번째부터 `open:true` 인데 `rows:[]` 인 카드 — 배지가 `0/37` 처럼
 * total>0 을 말하는데 본문은 0행인 카드 — 가 나온다. 「더 보기」는 목록 맨 아래에만
 * 있어 사용자는 그것을 **「이 지문엔 문제가 없다」**로 읽는다.
 * → 예산을 **카드당(그리고 카드 안 섹션당) 배분**으로 바꾼다. 잘린 카드는 자기
 *   자리에서 「이 카드에서 더 보기」로 스스로 늘린다.
 */
const CARD_ROW_CHUNK = 20;

/*
 * [E28] §3.10.27 — E24-2 「두 축이 동시에 DOM 에 있어야 한다」 방어선의 **승계처**.
 *
 * 구 방어선은 `visibleRows` 축별 배분이었다(학습지 300행이 문항을 DOM 에서 밀어내면
 * 합본 CTA `pickedSheets>0 && flatPicked>0` 가 영원히 안 뜬다). 카드 모드에는 그
 * 배분이 없으므로 **자동 개방**이 그 역할을 승계한다 — 다만 [E28B §8-1 C1-ⓑ] 이후로는
 * 「매 렌더 재평가」가 아니라 **축별 1회 시딩**이다: 선정도 쓰기도 effect 소관이고
 * (axisSeededRef), 그 결과는 `expandOverride` 에 실제로 써 넣는다.
 * 그 뒤로 `open` 의 정본은 오직 그 Map 하나다.
 *
 * ⚠ [E28B §8-1 C3] 구 상한 `AUTO_OPEN_CARDS = 3` 은 **삭제**했다 — 도달 불가한 죽은
 *   손잡이였다. 시드가 늘 때마다 hasW/hasQ 중 하나가 굳고 축은 둘뿐이라 축 커버 시드는
 *   **구조상 최대 2장**이고, `seeded >= 3` 은 한 번도 발화하지 않았다(주석의 「최대
 *   3장」도 그래서 거짓이었다 — 실측 진입 시 열린 카드 1장, _e28-dom.json).
 *   ※ 픽이 있는 카드는 이 축 커버와 무관하게 **전부** 시드된다(G3′).
 */

/** 콜백 무발신 시 참조 안정 빈 배열 — 렌더마다 [] 를 만들면 memo 가 깨진다. */
const NO_ROWS: ComposerRow[] = [];

/**
 * 축 값 — [E28] 로 세그먼트가 사라져 실제 값은 `"all" | "question"` 둘뿐이다
 * (`"worksheet"` 는 `lockedKind` 가 못 갖는 값이라 도달 불가). 그래도 세 값을
 * 남겨 두는 이유: `emptyTitle`·`noMatchLabel`·`selectAllLabel` 이 세 값을
 * **빠짐없이** 덮는 3갈래 구조라, 값을 지우면 `lockedKind` 에 "worksheet" 가
 * 생기는 날 라벨이 조용히 undefined 로 떨어진다(무명 버튼).
 */
type KindFilter = "all" | "question" | "worksheet";

/**
 * 축 해소 — `lockedKind ?? "all"` 을 **함수로** 감싼 이유는 타입 하나뿐이다.
 * 인라인으로 쓰면 TS 가 const 선언에서 초기화식을 리터럴로 좁혀
 * (`"all" | "question"`) 아래 `effectiveKind === "worksheet"` 3갈래가 전부
 * TS2367(겹치지 않는 비교)로 죽는다. 반환 타입을 KindFilter 로 못 박아 3갈래
 * 구조를 살려 둔다 — 위 KindFilter 주석의 「빠짐없이 덮는다」가 그 이유다.
 */
const resolveKind = (locked: "question" | null | undefined): KindFilter =>
  locked ?? "all";

/**
 * [E28] 카드 안 2층 필터 — **카드마다 독립**이다.
 * 판 로컬 state 로만 산다(호스트 prop·콜백 신설 금지 — memo 계약). 전역 하나로
 * 공유하면 카드 하나를 좁힌 것이 40장을 함께 좁혀 「목록이 왜 줄었지」가 된다.
 */
type CardFilter = {
  /** 「생성된 문제」 섹션 */
  type: string;
  diff: string;
  premium: "all" | "premium" | "standard";
  /** 「학습지」 섹션 — 상단 2층 필터에서 내려온 2축(도시에 카드에는 없던 것) */
  plan: string;
  status: string;
};
const CARD_FILTER_NONE: CardFilter = {
  type: "all",
  diff: "all",
  premium: "all",
  plan: "all",
  status: "all",
};
const isCardFilterActive = (f: CardFilter) =>
  f.type !== "all" ||
  f.diff !== "all" ||
  f.premium !== "all" ||
  f.plan !== "all" ||
  f.status !== "all";

/** 카드 안 섹션 필터 셀렉트 — 상단 2층(SELECT_CLS)과 **같은 문법**, 한 단 작게. */
const CARD_SELECT_CLS =
  "h-7 w-0 min-w-0 flex-1 cursor-pointer rounded-md border border-slate-200 bg-white px-1.5 text-[11.5px] font-medium text-slate-600 outline-none transition-colors hover:border-slate-300 focus:border-blue-400";

/** 카드 안 「이 카드에서 더 보기」 — 목록 맨 아래 전역 버튼과 구분되는 자기 폭 버튼. */
const CARD_MORE_CLS =
  "mt-1 w-full cursor-pointer rounded-md border border-dashed border-slate-200 bg-white px-2 py-1.5 text-[11.5px] font-semibold text-slate-500 transition-colors hover:border-slate-300 hover:bg-slate-50";

function ComposerListPaneInner({
  classId,
  lockedKind,
  questionsState,
  worksheetsState,
  onRefreshQuestions,
  onRefreshWorksheets,
  pickedQuestionIds,
  pickedSheets,
  onCommit,
  onOpenQuestion,
  onDeploySheet,
  onComposeSheet,
}: {
  /** 행 딥링크 목적지(`/director/studio/c/[classId]/p/[passageId]`) 재료 */
  classId: string;
  /**
   * 축 고정(§3.10.23 E24-1④). null/미전달 = **두 축 병합**(학습지 조판 뷰)이고
   * `"question"` = **문항 축 고정**(시험지 조판 뷰).
   *
   * [E28] 로 종류 세그먼트가 사라져 이 prop 이 축의 **유일한 입력**이 됐다.
   * 그리고 이 값이 목록 문법까지 가른다 — 두 축이 함께 보이면 지문 카드,
   * 한 축뿐이면 평면(아래 `cardMode`). ⚠ 그 갈림을 `lockedKind` 로 직접 쓰지
   * 마라: 판은 뷰를 몰라야 하고, 정본은 「두 축이 함께 보이는가」라는 렌더 사실이다.
   */
  lockedKind?: "question" | null;
  /** 호스트(LibraryPane) 소유 조회 상태 — 두 축 독립 */
  questionsState: ClassQuestionsState;
  worksheetsState: ClassWorksheetsState;
  /** 축별 재조회(부분 실패 재시도 겸용) — fetch 는 호스트 소유 */
  onRefreshQuestions: () => void;
  onRefreshWorksheets: () => void;
  /** 문항 대기열(삽입 순서 = 시험지 조판 순서) */
  pickedQuestionIds: ReadonlySet<string>;
  /** 학습지 대기열(삽입 순서 = 학습지 조판 순서) */
  pickedSheets: ReadonlyMap<string, SheetPickMeta>;
  /**
   * **타입별 델타 커밋 단일 통로**(위 헤더 「왜 신규 파일인가」).
   * 호스트가 `kind` 로 갈라 문항은 Set 재구성, 학습지는 담기/빼기로 보낸다.
   * `added` 순서 = 마키가 훑은 순서 = 조판 순서라 **호출자가 준 순서 그대로**
   * 뒤에 이어 붙여야 한다.
   */
  onCommit: (added: ComposerRow[], removed: ComposerRow[]) => void;
  /** 문항 행 상세 모달(미전달 시 상세 버튼 미렌더) */
  onOpenQuestion?: (questionId: string) => void;
  /** 학습지 행 [모바일 배포] — PRIME 행만 활성(정본 판정 1곳) */
  onDeploySheet?: (row: StudioClassWorksheetRow) => void;
  /** 학습지 행 [학습지 조판] — 뷰 전환은 호스트 소관 */
  onComposeSheet?: (row: StudioClassWorksheetRow) => void;
}) {
  // ── 상단 공통 축 — [E28] 로 여기 남는 것은 **지문 필터 + 검색**뿐이다 ──
  // (세그먼트 탭은 삭제, 유형·난이도·킬러 / 플랜·상태는 카드 안으로 내려갔다.)
  const [passageFilter, setPassageFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  // ── 2층: 문제 축 — **평면 모드(시험지 조판 뷰) 전용** ──
  // 카드 모드에서는 같은 세 축이 카드 안 「생성된 문제」 섹션으로 내려간다
  // (cardFilters). 두 곳이 같은 state 를 공유하면 카드 하나를 좁힌 것이 다른
  // 카드까지 좁히므로 **의도적으로 분리**돼 있다.
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [diffFilter, setDiffFilter] = useState<string>("all");
  const [premiumFilter, setPremiumFilter] = useState<
    "all" | "premium" | "standard"
  >("all");
  // ※ 「검수」 축은 만들지 않는다 — 다만 **근거가 E14 라는 것은 거짓**이었다
  //   ([E28B §8-1 C4] 주석 정정). E14(docs/class-studio-spec.md §3.10.15)가 폐기한
  //   것은 **지문(Passage) 추출 검수**이고, 문항 `approved` 축은 도시에에 멀쩡히
  //   살아 있다(passage-dossier-pane.tsx 의 검수완료 카운터·「검수 상태 필터」·행 배지).
  //   이 판이 검수를 안 그리는 진짜 이유는 **결정이 없기 때문**이다: E28B-SPEC §5 의
  //   이관 명시 목록(「카드로 내린다: 유형·난이도·프리미엄 / 플랜·상태」)에 검수가
  //   없고, 중앙 판은 평면 시절에도 검수를 **그린 적이 없다**(렌더 코드 0건) — 즉
  //   미구현 자체는 회귀가 아니다. 도입 여부는 감독 별건이다.
  //   ⚠ E28B-SPEC §3 의 카드 **그림**에 [검수 ▾]·「검수 0/17」이 있는 것은 도시에
  //     카드를 그대로 베낀 삽화다 — 정본은 같은 스펙 §5 의 명시 목록이다.
  //     (데이터 `approved` 는 이미 행에 실려 있으므로 기술 장벽은 없다 — 결정만 없다.)

  // ── [E28] 카드 안 2층 필터 — 카드마다 독립(판 로컬 state) ──
  const [cardFilters, setCardFilters] = useState<
    ReadonlyMap<string, CardFilter>
  >(() => new Map<string, CardFilter>());
  const patchCardFilter = (passageId: string, patch: Partial<CardFilter>) => {
    // 새 Map 으로 교체 — 제자리 변형은 참조가 같아 리렌더가 아예 안 온다.
    setCardFilters((prev) => {
      const next = new Map(prev);
      next.set(passageId, {
        ...(prev.get(passageId) ?? CARD_FILTER_NONE),
        ...patch,
      });
      return next;
    });
  };

  // ── 축 고정(§3.10.23 E24-1④ · [E28] 로 세그먼트 소멸) ────────────────────
  // 축의 정본은 이 한 줄이다. 세그먼트가 사라져 로컬 fallback 이 리터럴 "all" 로
  // 굳었으므로 「원본(kindFilter)을 잘못 읽는 경로」 자체가 구조적으로 소멸했다.
  const effectiveKind: KindFilter = resolveKind(lockedKind);
  const qIncluded = effectiveKind !== "worksheet";
  const wIncluded = effectiveKind !== "question";
  // 2층 필터는 **선택 축일 때만** 적용된다(그리고 그때만 노출된다). 상태가
  // 남아 있어도 「전체」에서는 조용히 거르지 않는다 — 안 보이는 필터가
  // 목록을 깎으면 「0건인데 이유를 모른다」가 된다.
  // 고정 축에서는 이게 곧 「그 축의 2층 필터가 상시 펴진다」는 뜻이다 —
  // 시험지 조판 뷰가 구 「문제관리」 판의 유형·난이도·킬러 필터를 그대로 흡수한다.
  const qAxis = effectiveKind === "question";
  // ⚠ 구 `wAxis`(= effectiveKind === "worksheet")는 **삭제**했다. 세그먼트가 사라진
  //   지금 그 값은 도달 불가이고(lockedKind 는 "question" | null), 학습지 축의 2층
  //   필터(플랜·상태)는 카드 안 「학습지」 섹션으로 내려갔다. 되살리려면 축을
  //   되살려야 하고, 그건 이 개편의 정반대다.
  // ── [E28] §3.10.27 — 지문 카드 목록의 점화 조건 ────────────────────────────
  // ⚠ `lockedKind == null`(= 학습지 조판 뷰) 으로 갈라서는 **안 된다**. 이 판은
  //   뷰를 몰라야 한다(아래 mergedRows 주석 「판이 뷰를 아는 것은 계층 위반」).
  //   갈림의 정본은 **「두 축이 함께 보이는가」라는 렌더 사실** 하나다: 두 축이
  //   함께 있어야 카드가 [학습지][생성된 문제] 두 섹션을 가질 수 있고, 한 축뿐인
  //   방에서 카드를 그리면 「반대 축 이름이 새거나(E24-4 명시 금지) 지문 이름만
  //   반복되는 껍데기」 둘 중 하나가 된다.
  //   지금은 `lockedKind == null` 과 값이 같지만 **근거가 다르면 이름도 다르다** —
  //   한 이름을 두 의미로 쓰면 한쪽 규칙이 바뀌는 날 다른 쪽이 조용히 따라 바뀐다.
  const cardMode = qIncluded && wIncluded;
  // 축 총계 — 「빈 상태 / 스켈레톤 / 헤더 건수」의 분모. 병합 총계
  // (mergedRows.length)를 그대로 쓰면 **반대 축 행이 분모에 섞인다**: 시험지 조판
  // 뷰(문항 고정)에서 문항 0건·학습지 8건이면 병합 총계가 8 이라 「자산은 있는데
  // 조건에 안 맞는다」 분기로 떨어져, 필터를 하나도 안 건 사용자에게 눌러도 아무
  // 일이 없는 「필터 초기화」 버튼만 뜬다(고정 축은 필터가 아니라 방의 정체성이라
  // resetFilters 가 되돌릴 수 없다). 로딩 판정도 같은 이유로 이 값을 쓴다.
  const axisTotal =
    (qIncluded ? questionsState.rows.length : 0) +
    (wIncluded ? worksheetsState.rows.length : 0);
  // ⚠ 구 `kindNarrowed`(세그먼트로 좁혔는가)는 **삭제**했다 — 좁힐 세그먼트가
  //   없다. 「N개 중 M개」의 사유는 이제 `filterActive` 하나뿐이다.

  // ── 병합 + 정렬(createdAt desc 단일) ──────────────────────────────────────
  // 두 축의 시간 의미를 섞지 않기 위해 정렬 축은 **생성 시각 하나**로 못 박는다.
  // 「마지막 수정(updatedAt)」은 학습지에만 있는 개념이라 정렬 축이 되면 같은
  // 목록에서 두 행이 서로 다른 의미의 시간으로 줄을 서게 된다.
  const mergedRows = useMemo<ComposerRow[]>(() => {
    const out: ComposerRow[] = [];
    for (const r of questionsState.rows) {
      out.push({ kind: "question", key: `q:${r.id}`, sortAt: r.createdAt, row: r });
    }
    for (const r of worksheetsState.rows) {
      out.push({
        kind: "worksheet",
        key: `w:${r.reportId}`,
        sortAt: r.createdAt,
        row: r,
      });
    }
    // ── 정렬 = **축 우선(학습지 → 문항), 축 안에서 최신순**(§3.10.23 E24) ─────
    // 구조에서는 순수 createdAt 단일 축이었고, 그 결과 「학습지 조판」 탭에서
    // 학습지 9건이 문항 205건 사이에 흩어져 파묻혔다(26-08-21 실측 스크린샷).
    // 전용 탭을 만들어 놓고 주인공이 안 보이면 탭을 가른 의미가 없다.
    //
    // ⚠ (E27 정정) E24 는 두 번째 근거로 「인쇄 순서와의 정합」을 들었다 — 합본 인쇄가
    //   언제나 「학습지 전부 → 문항 전부」라 축 우선 정렬이 그것과 일치한다는 것이었다.
    //   **그 근거는 §3.10.26 R1 로 소멸했다**: 인쇄는 이제 지문 단위 인터리브
    //   (`[지문1 학습지들][지문1 문제들][지문2 …]` — `compose-flow.ts` questionsAfterDoc)라
    //   목록 순서와 일치하지 않는다. 위 체크 색 문법 주석의 (E27 개정) 절 참조.
    //   살아 있는 근거는 **위 첫 번째 것 하나**(주인공이 파묻히는 문제)이고, 그것만으로
    //   이 정렬은 유지된다.
    //
    // 이 정렬은 **두 축이 함께 보일 때만** 효과가 있다(고정 축·세그먼트 좁힘
    // 상태에서는 한 종류뿐이라 무동작) — 그래서 뷰를 인자로 받지 않는다.
    // 판이 뷰를 아는 것은 계층 위반이고, `lockedKind` 로 그 사실을 유추하면
    // 세그먼트 좁힘과 뷰 고정이 뒤섞인다.
    //
    // ⚠ 선택 순번 배지는 이 정렬과 **무관**하다 — 순번은 픽 Map 의 삽입 순서이고
    //   그것이 곧 조판 순서다(E22-4). 목록을 어떻게 정렬해도 그 계약은 불변이다.
    //
    // ISO 8601(UTC, 고정 자릿수)이라 사전식 비교 = 시각 비교. 동시각 타이는
    // key 로 결정해 **정렬을 전순서로** 만든다 — 안 그러면 재조회마다 순서가
    // 흔들려 체크 순번 배지와 눈에 보이는 줄 순서가 어긋난다.
    const kindRank = (r: ComposerRow) => (r.kind === "worksheet" ? 0 : 1);
    out.sort((a, b) => {
      const ka = kindRank(a);
      const kb = kindRank(b);
      if (ka !== kb) return ka - kb;
      return a.sortAt === b.sortAt
        ? a.key.localeCompare(b.key)
        : a.sortAt < b.sortAt
          ? 1
          : -1;
    });
    return out;
  }, [questionsState.rows, worksheetsState.rows]);

  // 옵션은 **현재 데이터에 실존하는 값만**(빈 옵션 나열 금지).
  const typeOptions = useMemo(() => {
    const seen = new Map<string, number>();
    for (const r of questionsState.rows) {
      const label = questionRowTypeLabel(r.type, r.subType);
      seen.set(label, (seen.get(label) ?? 0) + 1);
    }
    return [...seen.entries()].sort((a, b) => b[1] - a[1]);
  }, [questionsState.rows]);

  // ⚠ [E28] 구 전역 `planOptions` 는 **삭제**했다 — 플랜 필터가 카드 안으로
  //   내려가면서 옵션의 모집단도 「그 카드의 학습지 행」으로 좁아졌다(아래 cards
  //   메모가 카드마다 만든다). 전역 목록을 카드 셀렉트에 먹이면 고르는 순간 0건이
  //   되는 유령 옵션이 카드마다 뜬다 — 위 passageOptions 주석과 같은 규율이다.

  // ── 지문 옵션 = **축 필터를 통과한 행에서만**(§3.10.23 E24, 적대 검수 minor) ──
  // 구판은 「두 축 union」이었다. 그 결과 시험지 조판 뷰(`lockedKind="question"`)의
  // 드롭다운에 **문항이 0건인 지문**(= 학습지만 있는 지문)이 그대로 떴다. 고르면
  // 목록이 「조건에 맞는 문항이 없습니다」로 비는데, 사용자는 그것을 필터의 결과가
  // 아니라 **「이 지문의 문항이 지워졌다」**로 읽는다 — 없는 유실을 만드는 옵션이다.
  // 옵션은 자기가 선 방의 모집단만 가리켜야 한다.
  //
  // ⚠ 판정에서 `passageFilter` **자신은 반드시 제외**한다. 옵션 생성에 현재 선택을
  //   먹이면 하나를 고르는 순간 드롭다운이 그 한 개로 접혀 **다른 지문으로 갈아탈
  //   길이 사라진다**(「지문 전체」로 되돌리는 것 말고는 탈출구가 없다). 같은 이유로
  //   검색어·2층 필터도 넣지 않는다 — 옵션의 모집단은 「축」까지이고, 그보다 좁히면
  //   드롭다운이 자기 결과에 갇힌다.
  // 순서는 병합 행 순서(축 우선 → 축 안에서 최신 생성) 기준 첫 등장 순.
  const passageOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const it of mergedRows) {
      // 축 술어는 filteredRows 첫 줄과 **글자 단위로 같은 식**이어야 한다 — 갈리면
      // 「옵션에는 있는데 목록은 0건」이라는 비대칭이 그대로 되살아난다.
      if (it.kind === "question" ? !qIncluded : !wIncluded) continue;
      if (!seen.has(it.row.passageId)) {
        seen.set(it.row.passageId, it.row.passageTitle);
      }
    }
    return [...seen.entries()];
  }, [mergedRows, qIncluded, wIncluded]);

  const searchNorm = search.trim().toLowerCase();
  const filteredRows = useMemo(
    () =>
      mergedRows.filter((it) => {
        if (it.kind === "question" ? !qIncluded : !wIncluded) return false;
        if (passageFilter !== "all" && it.row.passageId !== passageFilter) {
          return false;
        }
        if (it.kind === "question") {
          const r = it.row;
          if (qAxis) {
            if (
              typeFilter !== "all" &&
              questionRowTypeLabel(r.type, r.subType) !== typeFilter
            ) {
              return false;
            }
            if (diffFilter !== "all" && r.difficulty !== diffFilter) return false;
            if (
              premiumFilter !== "all" &&
              (premiumFilter === "premium" ? !r.premium : r.premium)
            ) {
              return false;
            }
          }
          if (
            searchNorm !== "" &&
            !r.stem.toLowerCase().includes(searchNorm) &&
            !r.passageTitle.toLowerCase().includes(searchNorm)
          ) {
            return false;
          }
          return true;
        }
        const r = it.row;
        // [E28] 학습지 축의 플랜·상태 필터는 **카드 안**으로 내려갔다(cardFilters).
        // 전역 필터분에서 미리 깎으면 카드 배지 분모와 상단 「N개 중 M개」가 서로
        // 다른 모집단을 말하게 된다 — 카드 필터의 사정거리는 그 카드 하나다.
        if (
          searchNorm !== "" &&
          !r.title.toLowerCase().includes(searchNorm) &&
          !r.passageTitle.toLowerCase().includes(searchNorm)
        ) {
          return false;
        }
        return true;
      }),
    [
      mergedRows,
      qIncluded,
      wIncluded,
      qAxis,
      passageFilter,
      typeFilter,
      diffFilter,
      premiumFilter,
      searchNorm,
    ],
  );

  // 고정 축(`lockedKind`)은 필터가 아니라 **방의 정체성**이다: `filterActive` 도
  // `resetFilters` 도 축을 건드리지 않으므로 고정이 초기화로 풀릴 경로가
  // **구조적으로** 없다. [E28] 로 로컬 축 상태가 아예 사라져 그 성질이 더 강해졌다 —
  // 여기에 축을 다시 끼워 넣으면 시험지 조판 뷰에서 「필터 초기화」 한 번에
  // 학습지가 되살아난다.
  // ⚠ [E28] `filterActive` 는 **전역 필터만** 본다. 이 값이 곧 「N개 중 M개」
  //   카운트의 점화 조건이고 그 M 은 `filteredRows.length`(카드 필터 적용 **전**)
  //   이기 때문이다 — 카드 필터를 여기 섞으면 숫자는 그대로인데 「좁혔다」고 말한다.
  //   카드 필터가 깎은 사실은 그 카드가 자기 섹션 머리에서 고지한다.
  const filterActive =
    passageFilter !== "all" ||
    searchNorm !== "" ||
    (qAxis &&
      (typeFilter !== "all" || diffFilter !== "all" || premiumFilter !== "all"));
  // 반면 「필터 초기화」의 사정거리는 **카드 필터까지**다 — 카드 40장에 흩어 놓은
  // 셀렉트를 하나씩 되돌리게 하면 그것이 곧 「목록이 왜 줄었지」의 재발이다.
  const anyCardFilterActive = useMemo(() => {
    for (const f of cardFilters.values()) if (isCardFilterActive(f)) return true;
    return false;
  }, [cardFilters]);
  const resetActive = filterActive || anyCardFilterActive;
  const resetFilters = () => {
    setPassageFilter("all");
    setSearch("");
    setTypeFilter("all");
    setDiffFilter("all");
    setPremiumFilter("all");
    setCardFilters(new Map<string, CardFilter>());
  };

  // ── 렌더 상한 + 「더 보기」(effect 금지 파생) ──────────────────────────────
  // 필터가 바뀌면 상한이 자동으로 초기화돼야 한다. useEffect + setState 로
  // 되돌리면 React Compiler 가 경고하는 「effect 안 동기 setState」가 되고
  // 렌더 1회가 헛돈다 — 그래서 **필터 시그니처를 상태에 함께 저장**하고
  // 불일치면 순수 파생으로 초기값을 돌려준다.
  // join 이 아니라 JSON.stringify 인 이유: 검색어에 어떤 구분자를 넣어도
  // 인접 필드와 뭉개지지 않는다(join("|") 이면 검색어 "a|b" 가 다른 필터 조합과
  // 같은 시그니처가 되어 상한이 초기화되지 않는 조용한 버그가 난다).
  // ⚠ 첫 항의 `effectiveKind` 를 빼지 마라. 뷰 전환은 `lockedKind` 만 바꾸므로
  // 축이 시그니처에 없으면 렌더 상한이 **이전 뷰에서 「더 보기」로 확장한 값 그대로**
  // 남는다(시험지 뷰에서 900행까지 펴 둔 상태가 학습지 뷰로 새어 들어와 첫 페인트가
  // 통째로 무거워진다). [E28] 이후로는 그 위에 「상한의 **단위**가 모드마다 다르다」
  // 는 이유가 하나 더 붙는다 — 아래 capChunk 주석.
  // ⚠ [E28] 카드 필터는 여기 **넣지 않는다**. 이 시그니처가 하는 일은 「필터가
  //   바뀌면 렌더 상한을 초기값으로 되돌린다」인데, 카드 필터는 카드 1장의 사정이라
  //   판 전체 상한을 되돌릴 이유가 없다. 넣으면 카드 하나의 셀렉트를 만질 때마다
  //   다른 39장이 방금 「더 보기」로 펴 둔 만큼 도로 접힌다.
  const filterSig = JSON.stringify([
    effectiveKind,
    passageFilter,
    searchNorm,
    typeFilter,
    diffFilter,
    premiumFilter,
  ]);
  // sig 초기값은 실제 시그니처와 절대 같을 수 없는 값(JSON 배열이 아니다) →
  // 첫 렌더는 항상 RENDER_CHUNK 로 떨어진다.
  const [capState, setCapState] = useState<{ sig: string; cap: number }>({
    sig: "",
    cap: RENDER_CHUNK,
  });
  /**
   * [E28] 상한의 **단위가 모드에 따라 다르다**.
   *  · 평면 모드: 목록 전체의 행 수(구 동작 그대로 — RENDER_CHUNK=300).
   *  · 카드 모드: **카드 1장의 섹션 1개당** 행 수(CARD_ROW_CHUNK=20). 목록 맨
   *    아래 「더 보기」는 이 기준선을 **전 카드에 대해** 한 단 올린다.
   * filterSig 첫 항이 `effectiveKind` 라 뷰를 오갈 때 두 단위가 섞이지 않는다
   * (다른 단위의 cap 이 새어 들어오면 첫 페인트가 통째로 무거워진다).
   */
  const capChunk = cardMode ? CARD_ROW_CHUNK : RENDER_CHUNK;
  const renderCap = capState.sig === filterSig ? capState.cap : capChunk;
  // ── 평면 모드의 렌더 상한 = **단순 절단** ─────────────────────────────────
  // ⚠ [E28] 구 **축별 배분**(학습지/문항 반반 예약 + 잔량 회수)은 **삭제**했다.
  //   지워도 되는 이유: 배분이 막던 사고는 「E24 축 우선 정렬(학습지 블록 → 문항
  //   블록) × 선착순 300」이 `q:` 행을 DOM 에서 통째로 밀어내 합본 CTA
  //   (`pickedSheets>0 && flatPicked>0`)가 영원히 안 뜨는 것이었는데, 평면 경로는
  //   이제 `cardMode === false` 일 때만 도는 경로이고 그 조건은 곧
  //   `wIncluded === false`(= 시험지 조판 뷰)다. 즉 **평면 목록에 학습지 행이
  //   들어올 길이 원리적으로 없다** — 배분할 두 축이 존재하지 않는다.
  //   E24-2 「두 축이 동시에 DOM 에 있어야 한다」 계약 자체를 폐기한 것이 아니다:
  //   카드 모드의 **축별 1회 개방 시딩**(cards 메모 아래의 axisSeededRef effect)이
  //   그 방어선을 승계한다.
  const visibleRows = useMemo(
    () =>
      filteredRows.length <= renderCap
        ? filteredRows
        : filteredRows.slice(0, renderCap),
    [filteredRows, renderCap],
  );
  // ⚠ [E28] `capped` 는 여기서 **떠났다** — 카드 렌더분이 정해진 뒤라야
  //   「상한에 걸렸는가」를 말할 수 있다. 아래 renderedRows 블록을 보라.

  // ── 선택 ──────────────────────────────────────────────────────────────────
  const selectedKeys = useMemo(() => {
    const s = new Set<string>();
    for (const id of pickedQuestionIds) s.add(`q:${id}`);
    for (const id of pickedSheets.keys()) s.add(`w:${id}`);
    return s;
  }, [pickedQuestionIds, pickedSheets]);

  // 체크 순번은 **타입별 시퀀스**(E22-UNITS [U10] 6). 통합 번호를 만들지 마라 —
  // 인쇄는 「학습지 전부 → 문항 전부」라 목록 순서와 애초에 다르다.
  // 순번의 원천은 **호스트 대기열의 삽입 순서**라, 이 목록에 없는(다른 표면에서
  // 담은) 항목까지 포함한 전역 순서가 그대로 보인다 — 부분 목록 기준으로 다시
  // 매기면 「3번으로 체크했는데 1번으로 보이는」 불일치가 난다.
  const questionOrder = useMemo(() => {
    const m = new Map<string, number>();
    let i = 0;
    for (const id of pickedQuestionIds) m.set(id, ++i);
    return m;
  }, [pickedQuestionIds]);
  const sheetOrder = useMemo(() => {
    const m = new Map<string, number>();
    let i = 0;
    for (const id of pickedSheets.keys()) m.set(id, ++i);
    return m;
  }, [pickedSheets]);

  // ══════════════════════════════════════════════════════════════════════════
  // [E28] §3.10.27 — 중앙 목록판 = **지문 카드 목록**
  // (정본: .tmp-worksheet-compose/E28B-SPEC.md · 정찰 원장: E28B-RECON.txt)
  //
  // 평면 목록은 지문 205개분 자산이 한 줄씩 흘러 「이 지문 것만 보고 싶다」가 지문
  // 필터 드롭다운 **왕복**으로만 가능했다. 카드는 그 왕복을 접기/펴기로 바꾸고,
  // 지문 1개를 [학습지][생성된 문제] 두 섹션으로 한 화면에 세운다.
  //
  // 판이 지는 3대 계약은 파일 머리주석 ⓐⓑⓒ(언마운트 접힘 · 단일 DragSelect ·
  // onCommit 델타). 아래 메모는 그중 ⓐ를 **물리적으로** 강제하는 자리다 —
  // 접힌 카드는 `rows: NO_ROWS` 라 렌더분에도 없고 DOM 에도 없다.
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * 펼침 override — **이 판의 로컬 상태**(호스트 prop 신설 금지, memo 계약.
   * 콜백/값을 호스트로 올리면 memo(ComposerListPane) 가 죽어 지문 300개분이 매
   * 렌더 재조립된다).
   *
   * 【[E28B §8-1 C1] 이 Map 은 `open` 의 **유일한 정본**이다】
   * effective = `override.get(pid) ?? false`. 이름은 여전히 "override" 지만 덮을
   * 하위 파생이 이제 없다 — 구 fallback `?? picked > 0` 은 **삭제**됐다.
   *
   * 구 설계는 「픽이 생기면 저절로 펴진다」를 렌더 파생으로 얻었고, 그 대가로
   * 「픽이 사라지면 저절로 접힌다」를 함께 샀다(마지막 픽 해제·헤더 X·전체선택
   * 해제 세 경로에서 방금 클릭한 카드의 본문이 통째로 언마운트됐다). 그 「저절로
   * 펴진다」는 이제 두 개의 **쓰기**가 대신 만든다:
   *   ⓐ 픽 래치(latchPickedCards) — 픽이 느는 커밋 경로에서 `has` 가드와 함께 쓴다.
   *      가드 덕에 「사용자가 손으로 접은 카드는 픽이 늘어도 접힌 채」가 유지된다.
   *   ⓑ 자동 개방 시딩(아래 effect) — 픽 보유 카드 + 두 축 커버분을 써 넣는다.
   * ⛔ `open` 판정에 `picked` 를 **다시 끌어들이지 마라**(C2 수리와 이중 보정).
   *
   * ⚠ 필터·검색·픽 변화로 이 Map 을 **초기화하지 마라**. 초기화하면 사용자가 접어
   *   둔 40장이 검색어 한 글자에 전부 되펴진다. 그래서 이 상태는 filterSig(렌더
   *   상한)와 달리 어떤 파생에도 묶여 있지 않다.
   */
  const [expandOverride, setExpandOverride] = useState<
    ReadonlyMap<string, boolean>
  >(() => new Map<string, boolean>());
  const toggleCard = (passageId: string, open: boolean) => {
    // 새 Map 으로 교체 — 제자리 변형은 참조가 같아 리렌더가 아예 안 온다.
    setExpandOverride((prev) => {
      const next = new Map(prev);
      next.set(passageId, open);
      return next;
    });
  };

  /**
   * 【[E28B §8-1 C1-ⓐ] 픽 래치】 — 픽이 **느는** 커밋 경로에서만 부른다.
   *
   * 구 구현은 `open = override.get(pid) ?? picked > 0` 이라 「픽이 생기면 저절로
   * 펴진다」를 **렌더 파생**으로 얻고 있었다. 그 대가가 정확히 그 반대편이다 —
   * 마지막 픽을 해제하거나(toggleRow) 헤더 X 를 누르거나(clearCardPicks) 전체선택을
   * 해제하는(toggleAll) 순간, 사용자가 방금 클릭한 카드의 **본문이 통째로 언마운트**
   * 됐다. 접힘이 시각 클립이 아니라 언마운트라(머리주석 ⓐ) 증상이 특히 크다.
   *
   * → 「펴진다」는 여기서 **상태에 굳혀** 얻고, `open` 판정에서는 픽을 완전히 뺀다.
   *   `prev.has(pid)` 가드가 「손으로 접은 카드는 픽이 늘어도 접힌 채」라는 구 계약
   *   (override 의 존재 이유)을 글자 그대로 지킨다.
   *
   * ⚠ 렌더 중이 아니라 **커밋 경로**에서 부른다(렌더 중 setState = React Compiler
   *   error 레벨). 호출처는 셋뿐이다: toggleRow(담기) · handleMarquee · toggleAll.
   * ⚠ 해제 경로에서는 **절대** 부르지 않는다 — 래치는 여는 쪽 한 방향이다.
   */
  const latchPickedCards = (added: readonly ComposerRow[]) => {
    if (!cardMode || added.length === 0) return;
    setExpandOverride((prev) => {
      let next: Map<string, boolean> | null = null;
      for (const it of added) {
        const pid = it.row.passageId;
        if (prev.has(pid)) continue;
        if (next === null) next = new Map(prev);
        next.set(pid, true);
      }
      return next ?? prev;
    });
  };

  /**
   * 카드별 렌더 상한 override — 「이 카드에서 더 보기」.
   * 전역 기준선(renderCap)과 **max** 로 합쳐진다: 목록 맨 아래 「더 보기」로
   * 기준선이 올라가도, 이 카드에서 이미 더 펴 둔 값은 줄어들지 않는다.
   * 필터가 바뀌어도 초기화하지 않는다 — 이건 필터가 아니라 **상한**이라
   * 되돌릴 이유가 없고, effect 없이 유지되는 순수 상태다.
   */
  const [cardRowCap, setCardRowCap] = useState<ReadonlyMap<string, number>>(
    () => new Map<string, number>(),
  );
  const growCard = (passageId: string, next: number) => {
    setCardRowCap((prev) => {
      const m = new Map(prev);
      m.set(passageId, next);
      return m;
    });
  };

  /** 카드 1장의 **렌더 사실** — 배지 분모/분자와 실제 렌더분을 분리한다. */
  type PassageCardView = {
    passageId: string;
    passageTitle: string;
    /**
     * 배지 분모 = 이 지문의 **행 수(두 축 합)** — 카드 필터 적용 **전**.
     * ⚠ [E28B §8-1 C2] 분자가 필터 전 모집단(pickedAll)이 됐으므로 분모도 같은
     *   모집단이어야 한다. 한쪽만 필터 통과분으로 두면 픽을 가리는 셀렉트 한 번에
     *   `3/2` 같은 분수가 나온다. 카드 필터가 깎은 사실은 **섹션 머리**가 말한다.
     */
    total: number;
    /**
     * 배지 분자 = 그중 체크된 수 — **카드 필터 적용 전(pickedAll)**.
     * 접혀 있어도 **살아 있다**(접힌 카드의 픽이 남아 있다는 유일한 시각 증거 —
     * 여기를 렌더분으로 바꾸면 G4 가 눈멀게 된다).
     * ⚠ [E28B §8-1 C2] 구현은 이 값을 `wShown`/`qShown`(필터 통과분) 위에서 셌다.
     *   그러면 셀렉트 하나로 픽이 가려지는 순간 배지가 `0/N` 회색으로 거짓 고지를
     *   하고, 파란 테두리·상단 고정이 풀리고, **X 가 미렌더돼 카드 단위 해제 수단이
     *   0** 이 된다(렌더분 밖이라 「전체 선택」 해제로도 못 닿는다). 그런데 그 픽은
     *   호스트 `flatPicked`/`pickedSheets` 에 그대로 살아 상단 카운터와 조판 표면에
     *   실린다 — 화면이 서로 다른 말을 하는 상태다.
     * ⚠ 상단 고정(hoist)도 **같은 값**으로 판정한다. 구 아코디언은
     *   hoist 를 `picked + sheetPicked`, 배지를 `picked`(문항만)로 재서
     *   「학습지만 담은 지문이 맨 위로 올라와 자동으로 펴지는데 배지는 회색 0/N」
     *   이었다 — 화면이 자기가 왜 그렇게 생겼는지를 설명하지 못하는 상태다.
     *   그 비대칭을 카드로 복제하지 마라.
     */
    picked: number;
    /**
     * 헤더 X 가 보낼 행 = 배지 분자와 **같은 집합**(= 필터 전 픽 전량).
     * 픽 0이면 빈 배열(버튼 미렌더). 라벨이 「전부」라 말하면 사정거리도 전부여야
     * 한다 — 3건 중 1건만 가려진 상태에서 2건만 보내는 것이 가장 나쁜 경우다.
     */
    pickedRows: ComposerRow[];
    /**
     * 카드 필터가 **가린** 픽 수(섹션별). 섹션 머리가 「필터에 가려진 담긴 항목
     * N건」으로 고지한다 — 사정거리는 줄이지 않되 가린 사실을 숨기지도 않는다.
     */
    wHiddenPicked: number;
    qHiddenPicked: number;
    open: boolean;
    filter: CardFilter;
    /** 섹션 **존재** 판정용(카드 필터 적용 **전**). 0 이면 섹션 자체를 미렌더. */
    wCount: number;
    qCount: number;
    /** 카드 필터 통과분(섹션 머리 고지 + 잔량 계산의 분모). */
    wShown: number;
    qShown: number;
    /** 실제 렌더분 — 접힘이면 빈 배열, 상한에 걸리면 절단분. */
    wRows: ComposerRow[];
    qRows: ComposerRow[];
    /**
     * 이 카드의 셀렉트 옵션 — 모집단은 **이 카드의 행**뿐(유령 옵션 금지).
     * [E28B §8-1 C5] 상태·난이도도 여기 합류했다(구 전역 리터럴 하드코딩 폐기).
     */
    planOptions: string[];
    typeOptions: [string, number][];
    statusOptions: string[];
    diffOptions: string[];
    /** 이 카드에 적용된 섹션당 상한. 「이 카드에서 더 보기」의 다음 값 계산용. */
    cap: number;
  };

  /**
   * 카드 모델 + 정렬 + 펼침 + 렌더 상한을 **한 번에** 산출한다.
   * 넷을 따로 계산하면 「카드는 펴져 있는데 상한이 그 카드를 잘랐다」를 서로 모르는
   * 배열들이 생기고, 그게 곧 「렌더분에는 있는데 DOM 에는 없는 행」이다.
   *
   * ⛔ [E28B §8-1 C1] 이 메모는 **순수**하다 — `open` 을 여기서 계산해 넣지 마라.
   *   `open` 은 `expandOverride` 를 읽기만 한다. 자동 개방은 선정도 쓰기도 아래
   *   effect 소관이다 — 구 구현이 여기서 `d.open = true` 로 렌더 중 판정을 덮어써
   *   두더지잡기를 만들었다.
   *
   * 평면 모드에서는 `null` 을 돌려준다 — 아래 renderedRows 가 그때 `visibleRows`
   * **그 참조 그대로**를 쓰므로 시험지 조판 뷰의 동작은 바이트 동일이다.
   */
  const cards = useMemo(() => {
    if (!cardMode) return null;

    type Bucket = {
      passageId: string;
      passageTitle: string;
      /** 첫 등장 순서 — 미조판 카드의 정렬 축이자 조판 카드의 타이브레이크. */
      seq: number;
      q: ComposerRow[];
      w: ComposerRow[];
    };
    // ⚠ 버킷 모집단은 반드시 **「문항 ∪ 학습지」**다. 문항만으로 만들면(구 아코디언이
    //   그랬다) 「학습지만 있는 지문」의 카드가 아예 생기지 않아 그 학습지가 학습지
    //   조판 뷰에서 **통째로 사라진다** — E24 가 만든 「학습지 조판 = 학습지의 방」
    //   계약의 정면 위반이고, 사용자는 그것을 절단이 아니라 유실로 읽는다.
    //   (자산이 0인 지문까지 카드로 세우는 것은 이 판의 사정거리 밖이다 — 이 판의
    //    지문 축은 행에서 역파생한 것뿐이고, 지문 전량은 별도 배선
    //    `listStudioClassPassages` 가 필요하다. 1차 제외.)
    const buckets = new Map<string, Bucket>();
    for (const it of filteredRows) {
      let g = buckets.get(it.row.passageId);
      if (g === undefined) {
        g = {
          passageId: it.row.passageId,
          passageTitle: it.row.passageTitle,
          seq: buckets.size,
          q: [],
          w: [],
        };
        buckets.set(it.row.passageId, g);
      }
      if (it.kind === "question") g.q.push(it);
      else g.w.push(it);
    }

    type Draft = {
      b: Bucket;
      filter: CardFilter;
      wShown: ComposerRow[];
      qShown: ComposerRow[];
      /** [E28B §8-1 C2] 픽 집계는 카드 필터 **전** 모집단 위에서 한다. */
      pickedAll: number;
      pickedRows: ComposerRow[];
      wHiddenPicked: number;
      qHiddenPicked: number;
      /** 이 카드의 **최소 픽 순번**(상단 정렬 축). */
      minOrder: number;
      planOptions: string[];
      typeOptions: [string, number][];
      statusOptions: string[];
      diffOptions: string[];
      open: boolean;
    };
    const drafts: Draft[] = [];
    for (const b of buckets.values()) {
      const filter = cardFilters.get(b.passageId) ?? CARD_FILTER_NONE;
      // 옵션은 **이 카드에 실존하는 값만**(상단 passageOptions 와 같은 규율).
      const planSeen = new Set<string>();
      for (const it of b.w) {
        if (it.kind === "worksheet") planSeen.add(it.row.planMarker);
      }
      const typeSeen = new Map<string, number>();
      for (const it of b.q) {
        if (it.kind !== "question") continue;
        const label = questionRowTypeLabel(it.row.type, it.row.subType);
        typeSeen.set(label, (typeSeen.get(label) ?? 0) + 1);
      }
      // [E28B §8-1 C5] 상태·난이도도 **이 카드의 행**에서 파생한다(플랜·유형과 같은
      // 규율). 전역 리터럴을 그대로 두면 카드마다 「눌러도 0건이 되는 옵션」이 생기고,
      // 그 0건 전이가 C1·C2 증상의 가장 흔한 방아쇠였다.
      const statusSeen = new Set<string>();
      for (const it of b.w) {
        if (it.kind === "worksheet") statusSeen.add(it.row.status);
      }
      const diffSeen = new Set<string>();
      for (const it of b.q) {
        if (it.kind !== "question") continue;
        if (it.row.difficulty) diffSeen.add(it.row.difficulty);
      }
      const wShown = b.w.filter((it) => {
        if (it.kind !== "worksheet") return false;
        if (filter.plan !== "all" && it.row.planMarker !== filter.plan) {
          return false;
        }
        if (filter.status !== "all" && it.row.status !== filter.status) {
          return false;
        }
        return true;
      });
      const qShown = b.q.filter((it) => {
        if (it.kind !== "question") return false;
        const r = it.row;
        if (
          filter.type !== "all" &&
          questionRowTypeLabel(r.type, r.subType) !== filter.type
        ) {
          return false;
        }
        if (filter.diff !== "all" && r.difficulty !== filter.diff) return false;
        if (
          filter.premium !== "all" &&
          (filter.premium === "premium" ? !r.premium : r.premium)
        ) {
          return false;
        }
        return true;
      });
      // ── 픽 집계 = **카드 필터 적용 전**(pickedAll) ────────────────────────
      // ⚠ [E28B §8-1 C2] 구현은 `wShown`/`qShown` 위에서만 셌고, 그 한 값이 배지
      //   분자 · X 렌더 조건 · X 사정거리 · hoist 를 **동시에** 지배했다. 카드 안
      //   셀렉트 하나로 픽된 행이 가려지면 배지가 `0/N` 회색으로 거짓 고지를 하고,
      //   파란 테두리·상단 고정이 풀리고, **X 가 미렌더돼 카드 단위 해제 수단이 0**
      //   이 됐다(렌더분 밖이라 「전체 선택」 해제로도 못 닿는다). 그런데 그 픽은
      //   호스트 `flatPicked`/`pickedSheets` 에 살아 상단 카운터와 조판 표면에 계속
      //   실린다 — 「배지는 접힌 카드의 픽이 살아 있다는 유일한 시각 증거」 계약의
      //   정면 위반이다.
      // → 배지 분자 · X 의 렌더 조건 · X 가 보내는 rows · hoist 는 전부 pickedAll.
      //   가려진 픽은 **숨기지 않고 섹션 머리에서 건수로 고지**한다(wHidden/qHidden).
      const shownKeys = new Set<string>();
      for (const it of wShown) shownKeys.add(it.key);
      for (const it of qShown) shownKeys.add(it.key);
      let pickedAll = 0;
      let wHiddenPicked = 0;
      let qHiddenPicked = 0;
      let minOrder = Number.POSITIVE_INFINITY;
      const pickedRows: ComposerRow[] = [];
      for (const it of b.w) {
        if (it.kind !== "worksheet" || !selectedKeys.has(it.key)) continue;
        pickedAll += 1;
        pickedRows.push(it);
        if (!shownKeys.has(it.key)) wHiddenPicked += 1;
        const o = sheetOrder.get(it.row.reportId);
        if (o !== undefined && o < minOrder) minOrder = o;
      }
      for (const it of b.q) {
        if (it.kind !== "question" || !selectedKeys.has(it.key)) continue;
        pickedAll += 1;
        pickedRows.push(it);
        if (!shownKeys.has(it.key)) qHiddenPicked += 1;
        const o = questionOrder.get(it.row.id);
        if (o !== undefined && o < minOrder) minOrder = o;
      }
      drafts.push({
        b,
        filter,
        wShown,
        qShown,
        pickedAll,
        pickedRows,
        wHiddenPicked,
        qHiddenPicked,
        minOrder,
        planOptions: [...planSeen],
        typeOptions: [...typeSeen.entries()].sort((x, y) => y[1] - x[1]),
        statusOptions: orderSeen(statusSeen, STATUS_ORDER),
        diffOptions: orderSeen(diffSeen, DIFFICULTY_ORDER),
        // ⚠ [E28B §8-1 C1] `open` 은 **영속 상태의 투영**이지 픽의 라이브 파생이
        //   아니다. 구 `?? picked > 0` 은 마지막 픽을 해제하는 순간(toggleRow ·
        //   clearCardPicks · toggleAll 세 경로 전부) 사용자가 방금 클릭한 카드
        //   **본문을 통째로 언마운트**시켰고, 카드 필터로 두 섹션이 0건이 되면
        //   방금 만진 셀렉트째 카드가 스스로 접혔다.
        //   픽이 **느는** 쪽 보정은 렌더가 아니라 커밋 경로의 픽 래치
        //   (latchPickedCards)가 담당한다 — 렌더 중 상태 변형은 React Compiler
        //   error 레벨이기도 하다.
        open: expandOverride.get(b.passageId) ?? false,
      });
    }

    // ── 정렬: 조판된(픽 있는) 카드가 맨 위 ────────────────────────────────
    // ⚠ 두 픽 시퀀스(questionOrder·sheetOrder)는 **각자 1부터** 센다(위 체크 색
    //   문법 주석 — 통합 번호는 만들지 않는다). 그래서 minOrder 는 「정확한 조판
    //   차례」가 아니라 **조판 방향의 근사**다. 동률은 seq 로 깨 정렬을 전순서로
    //   만든다 — 안 그러면 재조회마다 상단 블록 순서가 흔들린다.
    drafts.sort((a, b) => {
      // [E28B §8-1 C2] hoist 판정도 pickedAll — 필터가 픽을 가렸다고 카드가 상단
      // 블록에서 떨어지면 「담은 것이 사라졌다」로 읽힌다.
      const ap = a.pickedAll > 0 ? 0 : 1;
      const bp = b.pickedAll > 0 ? 0 : 1;
      if (ap !== bp) return ap - bp;
      if (ap === 0 && a.minOrder !== b.minOrder) return a.minOrder - b.minOrder;
      return a.b.seq - b.b.seq;
    });

    // ── E24-2 방어선 승계 — 「두 축이 동시에 DOM 에 있어야 한다」 ──────────────
    // 픽이 0이면 펼쳐진 카드가 하나도 없어 목록이 **헤더만 늘어선 화면**이 되고,
    // 두 축의 행이 DOM 에서 동시에 사라져 합본(학습지 뒤에 문항 이어붙이기)의
    // 재료 창구가 「스크롤해서 카드를 찾아 펴라」로 후퇴한다. 구 축별 배분이 하던
    // 일을 여기서 대신한다.
    //
    // ⚠ [E28B §8-1 C1-ⓑ] 구 구현은 이 자리에서 **다른 카드들의 open 을 훑어**
    //   판정하고 결과를 `d.open = true` 로 **렌더 중에** 덮어썼다(그리고 그것을
    //   `expandOverride` 에 쓰지 않았다). 그래서:
    //     · 다른 카드를 손으로 펴 두 축이 채워지면 자동 개방이 아예 안 돌고,
    //       건드리지도 않은 선두 카드가 접히며 목록이 위로 튀었다.
    //     · 자동 개방된 카드를 접으면 다음 카드가 대신 열려 **전부 접기가 원리적으로
    //       불가능**했다(두더지잡기).
    // → 이 메모에는 자동 개방이 **한 줄도 없다**. 시드 선정과 쓰기는 둘 다 아래
    //   effect 소관이고, 선정 재료(정렬된 list · picked · wCount/qCount)는 그대로
    //   여기서 나간다. 이 메모는 순수하고, `open` 은 expandOverride 의 투영이다.

    // ── 렌더 상한 = **카드당·섹션당 배분**(선착순 소진 금지) ─────────────────
    // 카드 헤더는 상한 대상이 아니다(1줄·자식 3개로 싸다) — 헤더까지 자르면
    // 「지문이 사라졌다」로 읽힌다. 두 섹션에 **각자** cap 을 주는 이유: 한 예산을
    // 나눠 쓰면 학습지 20건이 문항을 0행으로 굶겨 「학습지의 방인데 문제 섹션이
    // 빈 카드」가 나오고, 반대도 성립한다.
    let poolCount = 0;
    const rendered: ComposerRow[] = [];
    const list: PassageCardView[] = [];
    for (const d of drafts) {
      const cap = Math.max(renderCap, cardRowCap.get(d.b.passageId) ?? 0);
      const base = {
        passageId: d.b.passageId,
        passageTitle: d.b.passageTitle,
        // [E28B §8-1 C2] 분자·분모는 **같은 모집단**(카드 필터 전)이어야 한다.
        total: d.b.w.length + d.b.q.length,
        picked: d.pickedAll,
        pickedRows: d.pickedAll > 0 ? d.pickedRows : NO_ROWS,
        wHiddenPicked: d.wHiddenPicked,
        qHiddenPicked: d.qHiddenPicked,
        filter: d.filter,
        wCount: d.b.w.length,
        qCount: d.b.q.length,
        wShown: d.wShown.length,
        qShown: d.qShown.length,
        planOptions: d.planOptions,
        typeOptions: d.typeOptions,
        statusOptions: d.statusOptions,
        diffOptions: d.diffOptions,
        cap,
      };
      if (!d.open) {
        // 접힘 = **본문 언마운트**(머리주석 ⓐ). 잔량 모집단(poolCount)에도 넣지
        // 않는다 — 「더 보기」를 눌러도 접힌 카드는 안 펴지므로 영원히 줄지 않는
        // 숫자를 고지하게 된다.
        list.push({ ...base, open: false, wRows: NO_ROWS, qRows: NO_ROWS });
        continue;
      }
      poolCount += d.wShown.length + d.qShown.length;
      const wRows = d.wShown.length <= cap ? d.wShown : d.wShown.slice(0, cap);
      const qRows = d.qShown.length <= cap ? d.qShown : d.qShown.slice(0, cap);
      // rendered 의 순서 = **DOM 순서**(카드 순 → 학습지 섹션 → 문제 섹션).
      // 「전체 선택」이 담는 순서가 곧 조판 순서라, 눈에 보이는 순서와 어긋나면 안 된다.
      for (const r of wRows) rendered.push(r);
      for (const r of qRows) rendered.push(r);
      list.push({ ...base, open: true, wRows, qRows });
    }
    return { list, rendered, poolCount };
  }, [
    cardMode,
    filteredRows,
    cardFilters,
    selectedKeys,
    questionOrder,
    sheetOrder,
    expandOverride,
    cardRowCap,
    renderCap,
  ]);

  /**
   * 【[E28B §8-1 C1-ⓑ] 자동 개방 = 시드를 `expandOverride` 에 **써 넣는다**】
   *
   * 이 쓰기가 「open 은 영속 상태의 투영」 계약을 성립시킨다 — 이후 어떤 픽 변화도
   * open 을 내리지 못하고(C1 증상 1), 자동 개방이 **다른 카드의 현재 open 을 훑어**
   * 매 렌더 재평가되지 않으므로 두더지잡기도 사라진다(C1 증상 2·3).
   *
   * 시드는 두 갈래이고, **되풀이를 막는 기억이 서로 다르다**:
   *  ⓐ 픽 보유 카드 — 기억은 `expandOverride` **그 자신**이다. 시드하면 키가 생기고,
   *    그 뒤로는 `prev.has` 가 막는다. 사용자가 그 카드를 손으로 접어도(키 = false)
   *    같은 가드가 막아 **다시 펴지지 않는다**.
   *  ⓑ 두 축 커버(E24-2 방어선 승계) — 기억은 아래 `axisSeededRef` 다. 「지금 열려
   *    있는 카드가 그 축을 그리는가」로 판정하면, 사용자가 그 카드를 접는 순간 축이
   *    비어 **다른 카드가 대신 열린다**(= 전부 접기 불가능). 그래서 판정을 「이 축에
   *    시드를 이미 한 번 냈는가」라는 **되돌아오지 않는 사실**로 바꾼다.
   *
   * ⚠ 전역 1회 플래그(구현 1차)는 **틀렸다** — 두 축은 서로 다른 액션으로 **비동기
   *   도착**한다(questionsState / worksheetsState 독립). 문항이 먼저 오면 그 순간
   *   시딩이 끝나 버려, 뒤에 온 학습지 축이 화면에 **영영 안 올라온다**(실측: G8 이
   *   「펼친 카드에 w: 행이 없다」로 SKIP). 그래서 가드는 전역이 아니라 **축별**이다.
   *
   * · 렌더 중이 아니라 effect 에서 쓴다(렌더 중 상태·ref 변형 = React Compiler error).
   * · 재실행되어도 더 할 일이 없으면 setter 가 **같은 참조**를 돌려주고 React 가
   *   그 자리에서 bail out 한다 — 캐스케이딩 렌더로 자라지 않는다.
   * · 뷰 전환(cardMode=false)에서는 cards 가 null 이라 무동작이고, 돌아와도 두 기억이
   *   그대로라 재시딩하지 않는다 — 접어 둔 카드가 되펴지지 않는다.
   */
  const axisSeededRef = useRef({ w: false, q: false });
  useEffect(() => {
    if (cards === null || cards.list.length === 0) return;
    const axis = axisSeededRef.current;
    // 목록은 이미 「픽 보유 → seq」 순으로 정렬돼 있다(위 drafts.sort) — 축 커버
    // 시드가 집는 「선두 미개봉 카드」의 정본이 그 순서다.
    const seeds: string[] = [];
    for (const c of cards.list) if (c.picked > 0) seeds.push(c.passageId);
    if (!axis.w || !axis.q) {
      for (const c of cards.list) {
        if (axis.w && axis.q) break;
        if (c.picked > 0) continue;
        // 축 판정은 카드 필터 **전**(wCount/qCount) — 「이 지문에 그 축의 자산이
        // 있는가」이지 「지금 필터를 통과하는가」가 아니다.
        const needW = !axis.w && c.wCount > 0;
        const needQ = !axis.q && c.qCount > 0;
        if (!needW && !needQ) continue;
        seeds.push(c.passageId);
        // 시드를 **냈다는 사실**을 굳힌다. 그 카드를 사용자가 곧바로 접어도 이 축은
        // 다시 사냥하지 않는다(두더지잡기 차단). 축은 둘뿐이라 여기 시드는 최대 2장
        // ([E28B §8-1 C3] — 구 AUTO_OPEN_CARDS=3 은 그래서 죽은 손잡이였다).
        if (needW) axis.w = true;
        if (needQ) axis.q = true;
      }
    }
    if (seeds.length === 0) return;
    // 이 setState 는 「파생 상태 동기화」가 아니라 **초기 개방 시딩**이다(위 계약).
    // 데이터 도착 전에는 시드를 고를 수 없어 lazy initializer 로 옮길 수 없고,
    // 위 두 기억이 있어 수렴한다(더 낼 시드가 없으면 setter 가 prev 를 돌려준다).
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 개방 시딩(수렴 보장)
    setExpandOverride((prev) => {
      let next: Map<string, boolean> | null = null;
      for (const pid of seeds) {
        // 이미 키가 있으면 **사용자의 손**(또는 앞선 시드)이 정본이다 — 덮지 않는다.
        if (prev.has(pid)) continue;
        if (next === null) next = new Map(prev);
        next.set(pid, true);
      }
      // 바뀐 것이 없으면 **같은 참조**를 돌려준다(리렌더 자체가 일어나지 않는다).
      return next ?? prev;
    });
  }, [cards]);

  /**
   * 【[E28B §8-1 C6] 「모두 펼치기 / 모두 접기」 — **버튼 1개**】
   *
   * 회수하는 기능: 평면 시절 「전체 선택」 1클릭이 학습지 9 + 문항 205 를 담았는데,
   * 카드 모드의 모집단은 `renderedRows`(= 열린 카드의 행)라 실측 18행으로 줄었다.
   * 카드를 27번 펴야 같은 일을 하는 것은 기능 소실이다.
   *
   * ⚠ 버튼을 둘로 쪼개지 마라(사용자 명시: 「버튼이 많아지는 건 별로」). 상태에 따라
   *   라벨이 바뀌는 **토글 1개**이고, 증설은 이 하나로 끝이다.
   * ⚠ 쓰기 정본은 C1 수리와 **같은** `expandOverride` 다 — 별도의 「일괄 펼침」
   *   상태를 만들면 두 정본이 생겨 곧 어긋난다.
   */
  const allCardsOpen =
    cards !== null && cards.list.length > 0 && cards.list.every((c) => c.open);
  const toggleAllCards = () => {
    if (cards === null) return;
    const open = !allCardsOpen;
    setExpandOverride((prev) => {
      const next = new Map(prev);
      for (const c of cards.list) next.set(c.passageId, open);
      return next;
    });
  };

  /**
   * 【[E28] §6 재조준의 단일 정본】 **실제로 DOM 에 렌더되는 행**의 평탄 배열.
   *
   * 카드 목록은 「필터에는 있는데 DOM 에는 없는 행」(접힌 카드)을 만든다.
   * 그래서 아래 6개가 **전부** 이 배열을 봐야 한다 — 하나라도 `visibleRows` 에
   * 남으면:
   *   · `visibleRowByKey` : 접힌 카드의 픽이 사전에 남아, 다른 곳에서 마키를 한 번
   *     긋는 것만으로 handleMarquee 의 removed 루프가 **보이지도 않는 픽을 해제**한다.
   *   · `toggleAll`/`allChecked`/`someChecked`/`visibleCounts`/`unpickedVisible` :
   *     「전체 선택」이 보이지 않는 수백 행을 담고, 헤더의 「n개 표시」 고지가 거짓이 된다.
   * 평면 축에서는 `visibleRows` **그 참조 그대로**라 기존 동작과 바이트 동일이다.
   */
  const renderedRows = cards === null ? visibleRows : cards.rendered;
  /**
   * 렌더 상한의 **모집단** — 평면은 필터분 전체, 카드 모드는 「펼친 카드의 행」.
   * 접힌 카드를 여기 넣으면 「더 보기」가 되돌릴 수 없는 잔량을 고지하게 된다
   * (눌러도 접힌 카드는 안 펴지므로 영원히 줄지 않는 숫자가 뜬다).
   */
  const renderPoolCount =
    cards === null ? filteredRows.length : cards.poolCount;
  const capped = renderPoolCount > renderedRows.length;

  /**
   * 커밋 해소용 사전 — **렌더된 행만** 담는다.
   * 왜 전체 rows 가 아닌가: 2026-08-20 누적 개편 **전에는** 마키의 `next` 가
   * 「히트한 것만」이라 value 의 나머지가 전부 removed 후보로 떨어졌고, 여기에
   * 전체 rows 를 쓰면 **필터로 감춰진 픽·렌더 상한 밖의 픽**까지 마키 한 번에
   * 증발했다(상한이 없던 두 판에는 없던 조합 — 위 RENDER_CHUNK 주석).
   * 지금은 removed ⊆ 이번 드래그가 훑은 히트라 그 경로가 원리적으로 막혔지만,
   * 이 사전을 렌더분으로 좁혀 두는 것은 「마키가 닿지 못한 것은 이 마키의 권한
   * 밖」이라는 불변식을 코드로 못 박는 회귀 방어선이라 그대로 둔다.
   * 마키가 물리적으로 닿을 수 있는 것은 렌더된 행뿐이므로, 그 밖은 이 마키의
   * 권한 밖으로 둔다. 다른 표면(도시에)에서 담긴 항목이 조용히 스킵되는 것도
   * 같은 이유·같은 동작이다(구 학습지 판 선례).
   */
  const visibleRowByKey = useMemo(() => {
    const m = new Map<string, ComposerRow>();
    // [E28] 카드 이후 「렌더된 행」의 정본은 renderedRows 다(접힌 카드 제외).
    for (const it of renderedRows) m.set(it.key, it);
    return m;
  }, [renderedRows]);

  /** DragSelect(deferCommit) 릴리스 1회 커밋 → 타입 태그가 실린 델타로 환산. */
  const handleMarquee = (next: Set<string>) => {
    const added: ComposerRow[] = [];
    // 순회 순서 = DragSelect 의 enteredOrder(마키가 훑은 순서)라 담기 순서가
    // 그대로 조판 순서로 보존된다.
    for (const key of next) {
      if (selectedKeys.has(key)) continue; // 재삽입 금지(순서 뒤집힘 차단)
      const it = visibleRowByKey.get(key);
      if (it) added.push(it);
    }
    const removed: ComposerRow[] = [];
    for (const key of selectedKeys) {
      if (next.has(key)) continue;
      const it = visibleRowByKey.get(key);
      if (it) removed.push(it);
    }
    if (added.length > 0 || removed.length > 0) {
      // [E28B §8-1 C1-ⓐ] 마키가 새로 담은 지문의 카드는 그 순간 펼침으로 굳는다.
      latchPickedCards(added);
      onCommit(added, removed);
    }
  };

  const toggleRow = (it: ComposerRow) => {
    if (selectedKeys.has(it.key)) {
      // 해제는 래치하지 않는다 — 그리고 **카드를 접지도 않는다**
      // ([E28B §8-1 C1] 증상 1: 마지막 픽 해제로 본문이 사라지던 것).
      onCommit(NO_ROWS, [it]);
      return;
    }
    latchPickedCards([it]);
    onCommit([it], NO_ROWS);
  };

  // ── 전체 선택(**렌더분** 기준 — mixed = Minus) ────────────────────────────
  // 필터분이 아니라 렌더분인 이유: 상한 아래에 감춰진 수백 행이 클릭 한 번에
  // 대기열로 쏟아지면 「눌렀는데 뭐가 담겼는지 모른다」가 된다. 헤더 카운트가
  // 「n개 표시」로 그 범위를 명시한다.

  // 「전체 선택」이 **실제로 담는 모집단**의 축 내역(고지 전용 — 담는 동작은 불변).
  // 왜 필요한가: 필 라벨이 「학습지 조판 (9)」인 방에서 이 버튼 한 번이 학습지 9 +
  // 문항 205 를 함께 담는다. 담는 것 자체는 합본 조판(학습지 뒤에 문항 이어붙이기)의
  // 재료라 **옳다** — 여기에 상한을 되살리거나 축을 잘라내지 마라(사용자가 이미
  // 기각했고 §2-1 무회귀 계약이다). 문제는 고지가 「전체 선택」 넉 자뿐이라 사용자가
  // 필의 9 를 모집단으로 읽는다는 것이다.
  // ⚠ 되돌릴 길이 **없지는 않다** — allChecked 면 같은 버튼이 곧 해제 버튼이다
  //   (바로 아래 toggleAll). 그러니 이 수리는 「취소 지점을 새로 만든다」가 아니라
  //   **고지만 정확하게**다. 다만 그 한 번의 해제는 `onCommit(NO_ROWS, visibleRows)`
  //   라 **원래 손으로 담아 두었던 픽까지 통째로** 비우고, 픽 Map 의 삽입 순서가 곧
  //   조판 순서(E22-4)라 그 순서는 되돌아오지 않는다. 취소가 있어도 **무해하지는
  //   않다** — 그래서 범위는 누르기 **전에** 숫자로 밝혀야 한다.
  // [E28] 모집단은 **렌더분**(renderedRows) — 접힌 카드는 분모에 없다.
  // 접힌 행을 세면 헤더가 「n개 표시」로 거짓 모집단을 고지하고, 바로 아래
  // toggleAll 이 **보이지 않는 수백 행**을 담는다.
  const visibleCounts = useMemo(() => {
    let worksheet = 0;
    for (const it of renderedRows) if (it.kind === "worksheet") worksheet += 1;
    return { worksheet, question: renderedRows.length - worksheet };
  }, [renderedRows]);

  const unpickedVisible = useMemo(
    () => renderedRows.filter((it) => !selectedKeys.has(it.key)),
    [renderedRows, selectedKeys],
  );
  const allChecked = renderedRows.length > 0 && unpickedVisible.length === 0;
  const someChecked = unpickedVisible.length < renderedRows.length;
  const toggleAll = () => {
    if (allChecked) {
      onCommit(NO_ROWS, renderedRows);
      return;
    }
    // 이미 담긴 행은 다시 보내지 않는다(재삽입 = 조판 순서 뒤집힘).
    latchPickedCards(unpickedVisible);
    onCommit(unpickedVisible, NO_ROWS);
  };

  /**
   * [E28] §3.10.27 — 카드 **안쪽** 문항 행 = 컴팩트 1줄.
   *
   * 문법의 정본은 도시에 문항 행(`passage-dossier-pane.tsx` 「무롤 div 루트 +
   * 좌측 실버튼 + 본문 무버튼 스팬 + 자기 폭 액션」)이다 — 마크업만 **베껴 온 것**
   * 이라 두 표면이 같은 물건으로 보인다(체크 채널은 베끼지 않았다 — 머리주석 ⓒ).
   * 평면 행(아래 2단 문법)과 갈리는 이유는 하나뿐: 카드 머리가 이미 지문 제목을
   * 말하므로 **행에서 제목을 뺀다**. 제목이 빠지면 2단을 유지할 재료가 없다.
   *
   * 마키 계약(헤더 주석 ①~④)은 글자 단위로 승계한다:
   *  ① 루트는 **무롤 div** + `data-drag-item-id`(루트 role=checkbox 는 ARIA
   *    Children Presentational 로 자손 버튼 시맨틱을 통째로 죽인다)
   *  ② 체크 시맨틱·키보드는 좌측 `role="checkbox"` 실버튼 소유
   *  ④ 본문 스팬에 **cursor-pointer 금지**(마키 시작면). 액션은 전부
   *    `data-drag-select-ignore` — 특히 `<Link>` 는 hardInteractive 첫 항목이
   *    `"a"` 라 조상에 anchor 가 있으면 마키가 아예 시작되지 않는다.
   *
   * ⚠ 프로브 계약: 게이트 다수가 `div[data-drag-item-id]:has(> button[aria-label$=
   *   "문항 선택"])` 처럼 **직계 자식**(`>`)으로 체크박스를 집는다
   *   (_a22-verify-13.mjs:67 · probe-baseline.mjs:98). 체크 버튼을 래퍼로 한 겹
   *   더 감싸지 마라 — 계기가 조용히 0을 보고한다.
   *
   * 검수완료(`approved`) 배지는 **싣지 않는다**: 이 판은 「검수」를 축으로 갖지
   * 않는다 — 그 근거는 **E14 가 아니라 「결정 부재」**다([E28B §8-1 C4] 주석 정정,
   * 위 2층 필터 주석 참조). 평면 행도 안 그리므로 여기만 그리면 같은 문항이 두
   * 문법에서 다른 정보를 갖는다.
   */
  const renderGroupedRow = (it: ComposerRow) => {
    // 축 계약상 도달 불가(cards 메모가 문항 아닌 행을 이미 걸러 낸다).
    // 그래도 좁힘 없이 필드를 읽지 않는다 — 축 계약이 바뀌면 컴파일이 잡는다.
    if (it.kind !== "question") return null;
    const r = it.row;
    const checked = selectedKeys.has(it.key);
    const order = checked ? questionOrder.get(r.id) : undefined;
    const typeLabel = questionRowTypeLabel(r.type, r.subType);
    return (
      <div
        key={it.key}
        data-drag-item-id={it.key}
        onClick={() => toggleRow(it)}
        className={cn(
          "group flex w-full cursor-pointer items-center rounded-md transition-colors",
          checked
            ? "bg-blue-50/70 ring-1 ring-inset ring-blue-100"
            : "hover:bg-slate-50",
        )}
      >
        <button
          type="button"
          role="checkbox"
          aria-checked={checked}
          // 접미 「문항 선택」은 게이트 계약(위 ⚠) — 평면 행과 **같은 자구**를
          // 쓴다. 행에서 제목을 뺐어도 접근성 이름에는 지문이 남아야 한다:
          // 스크린리더 사용자에게는 카드 머리가 「위쪽 어딘가」일 뿐이다.
          aria-label={`${r.passageTitle} · ${typeLabel} 문항 선택`}
          title={order !== undefined ? `문제 조판 ${order}번째` : undefined}
          onClick={(e) => {
            e.stopPropagation();
            toggleRow(it);
          }}
          className="flex shrink-0 cursor-pointer items-center self-stretch py-2 pl-2 pr-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
        >
          <span className={checked ? BOX_ON_Q : BOX_OFF} aria-hidden="true">
            {order !== undefined && order <= 99 ? (
              // 순번 = 픽 Map 삽입 순서(E22-4) — 목록 정렬과 무관하다.
              <span className="text-[9px] font-bold leading-none tabular-nums">
                {order}
              </span>
            ) : checked ? (
              <Check className="size-3" strokeWidth={3} />
            ) : null}
          </span>
        </button>
        {/* 본문 = 무버튼 스팬(마키 시작면). 클릭 토글은 루트가 소유. */}
        {/* (26-08-22 확대) 문항 행은 **1줄 유지**다 — 유형 라벨은 짧아 잘리지 않고,
            카드 하나에 문항이 십수 개라 2줄로 바꾸면 카드가 통째로 길어진다.
            글자·여백만 학습지 행과 같은 단으로 올린다. */}
        <span className="flex min-w-0 flex-1 items-center gap-2 py-2 pr-1 text-left">
          <span className="min-w-0 truncate text-[13px] font-semibold text-slate-700">
            {typeLabel}
          </span>
          {r.difficulty && DIFFICULTY_LABEL_MAP.has(r.difficulty) ? (
            <span
              className={cn(
                "shrink-0 rounded-[4px] px-1.5 py-0.5 text-[10.5px] font-bold",
                r.difficulty === "KILLER"
                  ? "bg-rose-50 text-rose-600"
                  : "bg-slate-100 text-slate-500",
              )}
            >
              {DIFFICULTY_LABEL_MAP.get(r.difficulty)}
            </span>
          ) : null}
          {/* 26-08-18 난이도 기반 티어: 난이도 배지가 같은 티어를 말하면 이중
              표기라 숨김 — 레거시(비킬러 프리미엄)만 남는다(평면 행과 같은 판정). */}
          {r.premium && planForDifficulty(r.difficulty) !== "PREMIUM" ? (
            <span className="shrink-0 rounded-[4px] border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[10.5px] font-bold text-violet-700">
              {QUESTION_GENERATION_PLANS.PREMIUM.shortLabel}
            </span>
          ) : null}
          <span className="min-w-0 flex-1" aria-hidden="true" />
          <span className="shrink-0 text-[11px] tabular-nums text-slate-400">
            {fmtDateTime(it.sortAt)}
          </span>
        </span>

        {/* ── 액션 클러스터(평면 행과 같은 구성 — 유지 계약) ── */}
        {onOpenQuestion ? (
          <button
            type="button"
            data-drag-select-ignore="true"
            onClick={(e) => {
              e.stopPropagation();
              onOpenQuestion(r.id);
            }}
            title={r.stem || "문항 상세보기"}
            aria-label="문항 상세보기"
            className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-slate-300 transition-colors hover:bg-blue-50 hover:text-blue-600"
          >
            <Maximize2 className="size-3.5" aria-hidden="true" />
          </button>
        ) : null}
        <Link
          href={`/director/studio/c/${classId}/p/${r.passageId}`}
          data-drag-select-ignore="true"
          onClick={(e) => e.stopPropagation()}
          title={`${r.passageTitle} — 지문 스튜디오에서 열기`}
          aria-label={`${r.passageTitle} 지문 스튜디오에서 열기`}
          className="mr-1 flex size-6 shrink-0 items-center justify-center rounded-md text-slate-300 transition-colors hover:bg-blue-50 hover:text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
        >
          <ChevronRight className="size-3.5" aria-hidden="true" />
        </Link>
      </div>
    );
  };

  // ── 상태(부분 실패 = 전면 에러 금지) ──────────────────────────────────────
  const qLoading =
    (questionsState.status === "loading" || questionsState.status === "idle") &&
    questionsState.rows.length === 0;
  const wLoading =
    (worksheetsState.status === "loading" ||
      worksheetsState.status === "idle") &&
    worksheetsState.rows.length === 0;
  // 로딩 분모도 **축 총계**다. 병합 총계를 쓰면 시험지 조판 뷰에서 학습지 8건이
  // 이미 도착해 있다는 이유로 로딩이 조기 종료돼, 문항이 아직 오는 중인데
  // 「조건에 맞는 문항이 없습니다」가 먼저 뜬다(사용자는 유실로 읽는다).
  const loading =
    axisTotal === 0 &&
    ((qIncluded && qLoading) || (wIncluded && wLoading));
  const qError =
    qIncluded && questionsState.status === "error"
      ? (questionsState.error ?? "문제 목록을 불러오지 못했습니다.")
      : null;
  const wError =
    wIncluded && worksheetsState.status === "error"
      ? (worksheetsState.error ?? "학습지 목록을 불러오지 못했습니다.")
      : null;
  // 한 축만 실패하면 **인라인 배너 + 그 축만 재시도**. 전면 에러 분기를 그대로
  // 쓰면 학습지 실패가 문항 128건을 통째로 가린다(E22-UNITS [U10] 7).
  // ⚠ 판정은 「두 축이 다 실패」가 아니라 「**포함된** 축이 전부 실패」다. 구
  // `qError && wError` 를 그대로 두면 고정 축 뷰에서 반대 축 에러가 애초에 null
  // 이라 전면 에러가 **영원히 안 뜨고**, 대신 「아직 조판할 문항이 없습니다」라는
  // 거짓 빈 상태가 뜬다 — 조회 실패를 데이터 유실로 오독하게 만드는 최악의 자구다.
  const allAxesFailed =
    (qIncluded ? qError !== null : true) &&
    (wIncluded ? wError !== null : true) &&
    (qError !== null || wError !== null);

  const refreshing =
    (qIncluded && questionsState.status === "loading") ||
    (wIncluded && worksheetsState.status === "loading");
  const refreshAll = () => {
    if (qIncluded) onRefreshQuestions();
    if (wIncluded) onRefreshWorksheets();
  };

  const statusOf = (s: string) =>
    STATUS_BADGE.get(s) ?? {
      label: s,
      cls: "border-slate-200 bg-slate-50 text-slate-500",
    };

  /**
   * [E28] 카드 헤더 X — 「이 지문에서 담은 것 전부 빼기」.
   *
   * ⛔ **파괴적 액션에 배선하지 마라.** 중앙 판에는 도시에가 쓰는 `selectedIds`
   *   공급원이 없어(이 판의 props 에 선택 계열이 한 개도 없다) X 의 「자연스러운」
   *   후보가 클래스 링크 삭제(`removePassageFromStudioClass` — deleteMany +
   *   revalidate)뿐이다. 그대로 물면 「선택 해제」 아이콘이 **지문을 클래스에서 뺀다**.
   * → 의미는 **픽 해제 하나**다. 보내는 것은 이 카드가 아는 픽 전량(= 배지 분자와
   *   같은 집합)이고, 통로는 다른 모든 해제와 똑같은 `onCommit(NO_ROWS, rows)` 다 —
   *   학습지 축의 dirty confirm(guardSheetPickRemoval)이 그 안에서 그대로 걸린다.
   * → 픽이 0건인 카드에는 **버튼 자체를 렌더하지 않는다**(무동작 버튼 금지).
   */
  const clearCardPicks = (rows: readonly ComposerRow[]) => {
    if (rows.length === 0) return;
    onCommit(NO_ROWS, [...rows]);
  };

  /**
   * [E28] 카드 **안쪽** 학습지 행 = 컴팩트 1줄.
   *
   * 1줄 제목은 **AI 제목(`row.title`)** 이다(사용자 재확정). 카드 머리가 지문
   * 이름을 맡으므로 행까지 지문 이름을 말하면 한 카드 안에서 같은 글자가 N번
   * 반복되고, 같은 지문의 PRIME/PRIME_FINAL 두 행이 **글자 단위로 같아진다**
   * (두 행의 passageId 는 같다 — sheet-pick-types.ts 의 E27 정정).
   * 구분 재료는 AI 제목 + 앞의 플랜 배지 둘이다 — 어느 쪽도 지우지 마라.
   *
   * 마키 계약(파일 머리주석 ①~④)은 글자 단위로 승계한다:
   *  ① 루트는 **무롤 div** + `data-drag-item-id` — 접두 `w:` **유지**(도시에
   *    SheetRowView 는 raw reportId 를 쓴다. 그대로 옮기면 handleMarquee 의
   *    `visibleRowByKey.get(key)` 가 전부 미스나고 `[data-drag-item-id^="w:"]` 로
   *    세는 게이트가 0을 보고한다)
   *  ② 체크 시맨틱·키보드는 좌측 `role="checkbox"` 실버튼 소유. **래퍼로 한 겹 더
   *    감싸지 마라** — 게이트 다수가 행 루트의 **직계 자식**으로 체크 버튼을 집는다
   *  ④ 액션은 전부 `data-drag-select-ignore`. `<Link>` 는 특히 필수(hardInteractive
   *    첫 항목이 `"a"` 라 조상에 anchor 가 있으면 마키가 아예 시작되지 않는다)
   *
   * §M(모바일 학습 임시 숨김): [모바일 배포]는 활성·비활 두 분기가 통째로
   * `{onDeploySheet ? … : null}` 안에 있다 — 이 옵셔널 게이트 구조를 풀지 마라
   * (풀면 off 에서 「모바일 배포」 자구가 카드로 되살아난다).
   */
  const renderCardSheetRow = (it: ComposerRow) => {
    if (it.kind !== "worksheet") return null;
    const r = it.row;
    const checked = selectedKeys.has(it.key);
    const order = checked ? sheetOrder.get(r.reportId) : undefined;
    const status = statusOf(r.status);
    const planLabel = SHEET_PLAN_LABEL.get(r.planMarker) ?? r.planMarker;
    // 판정 정본은 sheet-deploy-eligibility 한 곳 — 로컬 재판정 금지(E21-5).
    const deployable = canDeployWorksheetRow(r.planMarker);
    return (
      // ── 2줄 **그리드** (26-08-22 재설계) ────────────────────────────────────
      // 왜 flex 가 아니라 grid 인가: flex 행에서는 액션 열이 **두 줄 모두**의 폭을
      // 깎아 제목이 420px 에서 감긴다. 감긴 제목 2줄 + 메타 1줄 = **3줄**이 되고,
      // 그때 체크박스·액션의 중앙정렬이 어느 줄과도 안 맞아 「뒤죽박죽」이 된다
      // (1차 시도 실측 — 사용자 반려). grid 면 제목이 **액션 열까지 가로질러**
      // 1줄에 들어가고, 액션은 메타 줄로 내려가 두 줄이 딱 맞는다.
      //   col1(auto)  = 체크박스 — 두 줄에 걸쳐 세로 중앙
      //   col2(1fr)   = 1줄 제목(col2~col3 가로질러) / 2줄 메타
      //   col3(auto)  = 액션 클러스터(메타 줄 오른쪽)
      // ⚠ 체크박스는 여전히 **행 루트의 직계 자식**이다(게이트 셀렉터 계약).
      <div
        key={it.key}
        data-drag-item-id={it.key}
        onClick={() => toggleRow(it)}
        className={cn(
          "group grid w-full cursor-pointer grid-cols-[auto_1fr_auto] items-center gap-x-1.5 gap-y-0.5 rounded-md py-1.5 pl-1.5 pr-1.5 transition-colors",
          checked
            ? "bg-violet-50/70 ring-1 ring-inset ring-violet-100"
            : "hover:bg-slate-50",
        )}
      >
        <button
          type="button"
          role="checkbox"
          aria-checked={checked}
          // 접미 「학습지 선택」 + 두 제목 병기는 평면 행과 **같은 자구**다
          // (게이트 계약 · 행별 고유). 행에서 지문 이름을 뺐어도 접근성 이름에는
          // 남아야 한다 — 스크린리더에게 카드 머리는 「위쪽 어딘가」일 뿐이다.
          aria-label={`${r.title} · ${r.passageTitle} 학습지 선택`}
          title={order !== undefined ? `학습지 조판 ${order}번째` : undefined}
          onClick={(e) => {
            e.stopPropagation();
            toggleRow(it);
          }}
          className="col-start-1 row-span-2 flex shrink-0 cursor-pointer items-start self-start pr-0.5 pt-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
        >
          <span className={checked ? BOX_ON_W : BOX_OFF} aria-hidden="true">
            {order !== undefined && order <= 99 ? (
              // 순번 = 픽 Map 삽입 순서(E22-4) — 목록 정렬과 무관하다.
              <span className="text-[9px] font-bold leading-none tabular-nums">
                {order}
              </span>
            ) : checked ? (
              <Check className="size-3" strokeWidth={3} />
            ) : null}
          </span>
        </button>
        {/* 본문 = 무버튼 스팬(마키 시작면). 클릭 토글은 루트가 소유. */}
        {/* 1줄 = 제목. **col2~col3 을 가로질러** 액션 열까지 폭을 쓴다 —
            그래서 420px 에서도 감기지 않는다. 그래도 넘치면 truncate 가 아니라
            줄바꿈(사용자 지시: 이름은 잘리면 안 된다). */}
        <span
          className="col-span-2 col-start-2 row-start-1 min-w-0 break-keep [overflow-wrap:anywhere] text-[13px] font-semibold leading-snug text-slate-700"
          title={`${r.title} · ${r.passageTitle}`}
        >
          {r.title}
        </span>
        {/* 2줄 = 메타. 왼쪽 배지 2개 · 오른쪽 일시. 오른쪽 끝은 액션 열과 맞닿는다. */}
        <span className="col-start-2 row-start-2 flex min-w-0 items-center gap-2">
          {/* 플랜 라벨은 **칩이 아니라 글자**다 — 칩으로 두면 좌우 padding(6px)만큼
              첫 글자가 안으로 밀려 **1줄 제목과 좌측 정렬이 어긋난다**(실측).
              상태(발행됨)는 테두리 있는 알약이라 칩으로 남긴다 — 두 개가 나란히
              칩이면 무엇이 분류이고 무엇이 상태인지 구분도 안 된다.
              ⚠ 자구 「기본 학습지」는 게이트 계약이다
                (probe-sheet-compose.mjs `:has-text("기본 학습지")`) — 지우지 마라. */}
          <span className="shrink-0 text-[10.5px] font-bold text-blue-600">
            {planLabel}
          </span>
          <span
            className={cn(
              "shrink-0 rounded-full border px-2 py-0.5 text-[10.5px] font-semibold",
              status.cls,
            )}
          >
            {status.label}
          </span>
          <span className="min-w-0 flex-1" aria-hidden="true" />
          <span className="shrink-0 text-[11px] tabular-nums text-slate-400">
            {fmtDateTime(it.sortAt)}
          </span>
        </span>

        {/* ── 액션 클러스터(평면 행과 같은 구성 — 유지 계약) ──
            그리드 col3·**메타 줄**에 놓는다. 두 줄에 걸치게 하면(row-span-2) 제목이
            다시 이 열만큼 좁아져 감긴다 — 이 배치가 「제목 무절단」의 전제다.
            래퍼에도 `data-drag-select-ignore` 를 둔다(자식 버튼들은 각자 유지). */}
        <span
          data-drag-select-ignore="true"
          className="col-start-3 row-start-2 flex shrink-0 items-center gap-0.5 self-center"
        >
        {onDeploySheet ? (
          deployable.ok ? (
            <button
              type="button"
              data-drag-select-ignore="true"
              onClick={(e) => {
                e.stopPropagation();
                onDeploySheet(r);
              }}
              title="모바일 배포 — 학생 앱 과제로 보냅니다"
              aria-label={`${r.title} 모바일 배포`}
              className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-slate-300 transition-colors hover:bg-blue-50 hover:text-blue-600"
            >
              <Smartphone className="size-3.5" aria-hidden="true" />
            </button>
          ) : (
            // disabled 버튼은 포인터 이벤트를 안 받아 title 이 안 뜬다 — 래퍼가 든다.
            <span
              title={deployable.reason}
              data-drag-select-ignore="true"
              className="flex shrink-0"
            >
              <button
                type="button"
                disabled
                aria-label={`${r.title} 모바일 배포 — ${deployable.reason}`}
                className="flex size-6 shrink-0 cursor-not-allowed items-center justify-center rounded-md text-slate-200"
              >
                <Smartphone className="size-3.5" aria-hidden="true" />
              </button>
            </span>
          )
        ) : null}
        {onComposeSheet ? (
          <button
            type="button"
            data-drag-select-ignore="true"
            onClick={(e) => {
              e.stopPropagation();
              onComposeSheet(r);
            }}
            title="학습지 조판 — 오른쪽에서 A4 학습지를 만듭니다"
            // 접미 「학습지 조판」은 게이트 셀렉터 계약
            // (probe-sheet-compose.mjs `button[aria-label$="학습지 조판"]`).
            aria-label={`${r.title} 학습지 조판`}
            className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-slate-300 transition-colors hover:bg-blue-50 hover:text-blue-600"
          >
            <LayoutTemplate className="size-3.5" aria-hidden="true" />
          </button>
        ) : null}
        <Link
          href={`/director/studio/c/${classId}/p/${r.passageId}`}
          data-drag-select-ignore="true"
          onClick={(e) => e.stopPropagation()}
          title={`${r.passageTitle} — 지문 스튜디오에서 열기`}
          aria-label={`${r.passageTitle} 지문 스튜디오에서 열기`}
          className="flex size-7 shrink-0 items-center justify-center rounded-md text-slate-300 transition-colors hover:bg-blue-50 hover:text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
        >
          <ChevronRight className="size-3.5" aria-hidden="true" />
        </Link>
        </span>
      </div>
    );
  };

  /**
   * 카드 안 섹션 머리 — [제목 ─ (가려진 담김) ─ 건수] 한 줄(필터 셀렉트는 **아래 줄**).
   * 셀렉트를 이 줄에 함께 넣으면 3개짜리 문제 섹션이 조판 폭 420px 에서 제목을
   * 압착한다 — 행에서 막아 둔 붕괴를 섹션 머리로 이사시키는 꼴이다.
   * 단위(`건`/`개`)는 축을 따른다: 같은 카드 안에서 두 섹션이 같은 단위를 쓰면
   * 학습지 3건과 문제 3개가 같은 물건으로 읽힌다(이 파일의 산문 표준).
   *
   * [E28B §8-1 C2] `hiddenPicked` = 이 섹션에서 **카드 필터가 가린 픽 수**.
   * 배지 분자와 X 의 사정거리는 가려진 픽까지 포함하므로(그게 수리의 요점이다),
   * 「배지 3인데 눈에 보이는 체크는 1」의 사유를 여기서 반드시 말해야 한다 —
   * 말하지 않으면 이번엔 배지가 거짓말하는 것처럼 읽힌다.
   */
  const cardSectionHead = (
    title: string,
    shown: number,
    total: number,
    unit: string,
    hiddenPicked: number,
  ) => (
    <div className="flex items-center gap-2 bg-slate-50/80 px-2.5 py-1.5">
      <h3 className="min-w-0 flex-1 truncate text-[11.5px] font-bold tracking-wide text-slate-600">
        {title}
      </h3>
      {hiddenPicked > 0 ? (
        <span
          className="shrink-0 rounded-full bg-amber-100/80 px-2 py-0.5 text-[10.5px] font-bold text-amber-700"
          title={`이 섹션의 필터가 담긴 항목 ${hiddenPicked}${unit}을 가리고 있습니다 — 배지 분자와 헤더 X 의 사정거리에는 그대로 포함됩니다`}
        >
          가려진 담김 {hiddenPicked}
          {unit}
        </span>
      ) : null}
      {/* 카드 필터가 깎은 사실은 **그 카드가 자기 자리에서** 고지한다(상단
          「N개 중 M개」는 전역 필터만 센다 — filterActive 주석). */}
      <span className="shrink-0 text-[11px] tabular-nums text-slate-400">
        {shown === total
          ? `${total}${unit}`
          : `${total}${unit} 중 ${shown}${unit}`}
      </span>
    </div>
  );

  /**
   * [E28] 지문 카드 1장.
   *
   * 헤더는 [토글(flex-1) | X] **형제** 구조다 — 버튼 안에 버튼을 넣을 수 없다.
   * ⚠ 파일 머리주석의 「1줄에 shrink-0 형제는 배지 1개가 한계」는 **행**의 계약이다.
   *   카드 헤더는 chevron(14px) + 배지(~34px) + X(20px, 픽이 있을 때만)까지만
   *   허용한다 — 여기에 넷째를 더하면 좁은 조판 폭(420px)에서 지문 제목이 다시
   *   압착된다. 큐 링·「본문 수정됨」 배지·마지막 분석 시각을 얹고 싶다면 그 전에
   *   이 줄이 아니라 **다른 줄**을 만들어라(그리고 그 재료는 중앙 행 데이터에 없다).
   */
  const renderPassageCard = (c: PassageCardView) => {
    const panelId = `e28-card-${c.passageId}`;
    const wMore = c.wShown - c.wRows.length;
    const qMore = c.qShown - c.qRows.length;
    return (
      <div
        key={c.passageId}
        data-passage-card={c.passageId}
        className={cn(
          "flex shrink-0 flex-col overflow-hidden rounded-lg border transition-colors",
          // 조판된 카드 = 축 색 계열. 「왜 위로 올라왔는지」를 색으로도 말한다 —
          // 위치만으로는 정렬 규칙을 알 수 없다.
          c.picked > 0
            ? "border-blue-300 bg-blue-50/40"
            : "border-slate-200 bg-white",
        )}
      >
        <div className="group flex w-full items-center transition-colors hover:bg-slate-50/80">
          <button
            type="button"
            // ⚠ `data-drag-select-ignore` **필수** — 없으면 blocksMarqueeStart 가
            //   헤더를 마키 시작면으로 오인한다. <button> 이라 buttonLike 경로로도
            //   한 번 더 막히지만, 계약은 속성 쪽이 정본이다.
            data-drag-select-ignore="true"
            aria-expanded={c.open}
            // 닫혀 있으면 패널이 DOM 에 없다 — 없는 id 를 가리키는 aria-controls 는
            // 무효 참조라 그때만 뗀다.
            aria-controls={c.open ? panelId : undefined}
            // 펼침/접힘은 aria-expanded 가 이미 읽어 준다(라벨에 「접기/펼치기」를
            // 또 넣으면 이중 낭독). 보이는 글자(지문 제목)를 이름이 **포함**해야
            // 음성 제어가 「<지문 제목> 클릭」으로 닿는다(WCAG 2.5.3).
            aria-label={`${c.passageTitle} — 자산 ${c.total}건 중 ${c.picked}건 선택`}
            onClick={() => toggleCard(c.passageId, !c.open)}
            className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 py-2 pl-2.5 pr-2 text-left"
          >
            <ChevronDown
              className={cn(
                "size-4 shrink-0 text-slate-400 transition-transform duration-200 motion-reduce:transition-none",
                c.open ? "" : "-rotate-90",
              )}
              aria-hidden="true"
            />
            {/* ⚠ **truncate 금지**(사용자 지시 26-08-22) — 조판이 열리면 이 열이
                420px 로 줄어 지문 제목이 잘렸다. 대신 **줄바꿈**을 허용한다.
                (`truncate` = overflow-hidden + ellipsis + whitespace-nowrap 세 개
                 묶음이라 하나만 빼는 것으로는 안 되고 통째로 빼야 한다.)
                ⚠ 감길 때의 정렬 규율 — 헤더의 네 요소(chevron·제목·배지·X)는 **전부
                  세로 중앙**이다. 1차 시도에서 배지·X 에만 `self-start` 를 걸었다가
                  chevron 만 중앙이 되어 「뒤죽박죽」이 됐다(사용자 반려).
                  정렬 축을 섞지 마라 — 넷 다 중앙이거나 넷 다 위쪽이거나다.
                ⚠ `break-keep` 과 `break-words` 를 **함께 쓰지 마라** — `cn()` 의
                  tailwind-merge 가 둘을 같은 그룹으로 보고 **뒤엣것만 남긴다**
                  (실측: `twMerge("break-keep break-words")` → `break-words`).
                  그래서 소스에는 있는데 DOM 에는 없는 유령 클래스가 됐다. 안전망인
                  overflow-wrap 은 **임의 속성**으로 적어 병합 그룹을 피한다.
                `text-balance` 는 감길 때 「… 30번 ·」/「어휘」처럼 한 조각만 남는
                 것을 막아 두 줄 길이를 고르게 나눈다. */}
            <span
              className={cn(
                "min-w-0 flex-1 text-balance break-keep [overflow-wrap:anywhere] text-[13.5px] font-bold leading-snug",
                c.picked > 0 ? "text-blue-800" : "text-slate-700",
              )}
              title={c.passageTitle}
            >
              {c.passageTitle}
            </span>
            {/* 배지 = `{pickedAll}/{총 행 수}` — **둘 다 카드 필터 적용 전**
                (렌더 상한·접힘 무관, [E28B §8-1 C2]). 접힌 카드의 픽이 살아 있다는
                유일한 시각 증거라 여기를 렌더분·필터 통과분으로 바꾸지 마라.
                필터가 가린 픽은 섹션 머리가 「가려진 담김 N건」으로 따로 말한다.
                통계 타일(학습지 N / 문제 M)을 없앤 자리를 이 배지가 대신한다. */}
            <span
              className={cn(
                "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums",
                c.picked > 0
                  ? "bg-blue-600 text-white"
                  : "bg-slate-200/80 text-slate-500",
              )}
            >
              {c.picked}/{c.total}
            </span>
          </button>
          {/* X = 「이 지문에서 담은 것 전부 빼기」(clearCardPicks 주석 참조).
              픽 0이면 **렌더하지 않는다** — 무동작 버튼은 「눌러도 안 먹는다」다.
              hover 는 rose(제거 의미축) — slate hover 는 토글과 구분이 안 된다. */}
          {c.picked > 0 ? (
            <button
              type="button"
              data-drag-select-ignore="true"
              title="이 지문에서 담은 것 전부 빼기 — 대기열에서만 빠집니다(지문·자산은 그대로)"
              aria-label={`${c.passageTitle}에서 담은 ${c.picked}건 전부 빼기`}
              onClick={() => clearCardPicks(c.pickedRows)}
              className="mr-2 flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md border border-slate-200 bg-white text-slate-400 transition-colors hover:border-rose-300 hover:bg-rose-50 hover:text-rose-600"
            >
              <X className="size-3.5" aria-hidden="true" />
            </button>
          ) : null}
        </div>

        {/* ⚠ 본문은 **조건부 언마운트**다(머리주석 ⓐ). `grid-rows-[0fr]` 시각 클립
            이나 `inert` 로 바꾸지 마라 — DragSelect 는 가시성을 보지 않아 접힌
            카드의 행이 마키에 그대로 잡힌다. */}
        {c.open ? (
          <div id={panelId} className="border-t border-slate-100">
            {/* ⚠ 섹션은 **그 축의 행이 이 지문에 있을 때만** 렌더한다. 0건인데
                그리면 시험지 조판 뷰(축 고정)에서 「학습지」라는 반대 축 이름이
                새어 나오고, 그것이 E24-4 가 명시 금지한 사고다.
                판정 축은 `wCount`(카드 필터 **전**)다 — 필터로 0이 됐다고 섹션을
                지우면 방금 건 필터를 되돌릴 셀렉트까지 함께 사라진다. */}
            {c.wCount > 0 ? (
              <section className="border-b border-slate-100">
                {cardSectionHead(
                  "학습지",
                  c.wShown,
                  c.wCount,
                  "건",
                  c.wHiddenPicked,
                )}
                <div className="flex items-center gap-1 px-1.5 pt-1">
                  {/* ⚠ 이 2셀렉트는 **신설**이다 — 도시에 카드에는 플랜·상태
                      필터가 없어, 상단 2층 필터를 그냥 지우면 학습지를 상태로
                      좁힐 방법이 통째로 사라진다. 문법은 문제 섹션 3셀렉트와 동일. */}
                  <select
                    aria-label={`${c.passageTitle} 학습지 종류 필터`}
                    value={c.filter.plan}
                    onChange={(e) =>
                      patchCardFilter(c.passageId, { plan: e.target.value })
                    }
                    className={CARD_SELECT_CLS}
                  >
                    <option value="all">종류 전체</option>
                    {c.planOptions.map((m) => (
                      <option key={m} value={m}>
                        {SHEET_PLAN_LABEL.get(m) ?? m}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label={`${c.passageTitle} 학습지 상태 필터`}
                    value={c.filter.status}
                    onChange={(e) =>
                      patchCardFilter(c.passageId, { status: e.target.value })
                    }
                    className={CARD_SELECT_CLS}
                  >
                    {/* [E28B §8-1 C5] 옵션은 **이 카드의 학습지 행**에 실존하는
                        상태만(구 DRAFT/PUBLISHED/ARCHIVED 하드코딩 폐기 — 카드마다
                        「눌러도 0건」 유령 옵션을 만들었고, 그 0건 전이가 C1·C2
                        증상의 가장 흔한 방아쇠였다). 라벨 정본은 STATUS_BADGE. */}
                    <option value="all">상태 전체</option>
                    {c.statusOptions.map((s) => (
                      <option key={s} value={s}>
                        {STATUS_BADGE.get(s)?.label ?? s}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-0.5 px-1.5 py-1">
                  {c.wRows.length === 0 ? (
                    <p className="px-1 py-1 text-[11px] text-slate-400 break-keep">
                      조건에 맞는 학습지가 없습니다
                    </p>
                  ) : (
                    c.wRows.map(renderCardSheetRow)
                  )}
                  {wMore > 0 ? (
                    <button
                      type="button"
                      data-drag-select-ignore="true"
                      onClick={() =>
                        growCard(c.passageId, c.cap + CARD_ROW_CHUNK)
                      }
                      className={CARD_MORE_CLS}
                    >
                      이 카드에서 더 보기 (학습지 {wMore}건 남음)
                    </button>
                  ) : null}
                </div>
              </section>
            ) : null}

            {c.qCount > 0 ? (
              <section>
                {cardSectionHead(
                  "생성된 문제",
                  c.qShown,
                  c.qCount,
                  "개",
                  c.qHiddenPicked,
                )}
                <div className="flex items-center gap-1 px-1.5 pt-1">
                  <select
                    aria-label={`${c.passageTitle} 유형 필터`}
                    value={c.filter.type}
                    onChange={(e) =>
                      patchCardFilter(c.passageId, { type: e.target.value })
                    }
                    className={CARD_SELECT_CLS}
                  >
                    <option value="all">유형 전체</option>
                    {c.typeOptions.map(([label, n]) => (
                      <option key={label} value={label}>
                        {label} ({n})
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label={`${c.passageTitle} 난이도 필터`}
                    value={c.filter.diff}
                    onChange={(e) =>
                      patchCardFilter(c.passageId, { diff: e.target.value })
                    }
                    className={CARD_SELECT_CLS}
                  >
                    {/* [E28B §8-1 C5] 전역 DIFFICULTY_LEVELS 전량 나열 폐기 —
                        옵션은 이 카드의 문항에 실존하는 난이도만(유령 옵션 금지).
                        순서는 DIFFICULTY_ORDER 가 정본이라 카드마다 흔들리지 않는다. */}
                    <option value="all">난이도 전체</option>
                    {c.diffOptions.map((v) => (
                      <option key={v} value={v}>
                        {DIFFICULTY_LABEL_MAP.get(v) ?? v}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label={`${c.passageTitle} 프리미엄 여부 필터`}
                    value={c.filter.premium}
                    onChange={(e) =>
                      patchCardFilter(c.passageId, {
                        premium: e.target.value as
                          | "all"
                          | "premium"
                          | "standard",
                      })
                    }
                    className={CARD_SELECT_CLS}
                  >
                    {/* 26-08-18 난이도 기반 티어: 라벨만 일반/킬러(값·로직 불변) */}
                    <option value="all">일반·킬러</option>
                    <option value="standard">일반</option>
                    <option value="premium">킬러</option>
                  </select>
                </div>
                <div className="space-y-0.5 px-1.5 py-1">
                  {c.qRows.length === 0 ? (
                    <p className="px-1 py-1 text-[11px] text-slate-400 break-keep">
                      조건에 맞는 문제가 없습니다
                    </p>
                  ) : (
                    c.qRows.map(renderGroupedRow)
                  )}
                  {qMore > 0 ? (
                    <button
                      type="button"
                      data-drag-select-ignore="true"
                      onClick={() =>
                        growCard(c.passageId, c.cap + CARD_ROW_CHUNK)
                      }
                      className={CARD_MORE_CLS}
                    >
                      이 카드에서 더 보기 (문제 {qMore}개 남음)
                    </button>
                  ) : null}
                </div>
              </section>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  };

  // ── 축에 맞는 자구(§3.10.23 E24-4) ────────────────────────────────────────
  // 고정 축 뷰에서 반대 축 이름이 새어 나오면 사용자는 「내가 어느 방에 있는지」를
  // 다시 잃는다 — 이 개편이 없애려던 바로 그 증상이다. 시험지 조판 뷰에서
  // 「아직 조판할 학습지가 없습니다」가 뜨는 것이 대표 사고.
  // 조사(이/가)가 명사마다 달라 템플릿 연결이 아니라 **완성 문장**으로 가른다 —
  // `${명사}이 없습니다` 로 만들면 「학습지이 없습니다」가 나온다.
  const qOnly = effectiveKind === "question";
  const wOnly = effectiveKind === "worksheet";
  const emptyTitle = qOnly
    ? "아직 조판할 문항이 없습니다"
    : wOnly
      ? "아직 조판할 학습지가 없습니다"
      : "아직 조판할 자산이 없습니다";
  const emptyHint = qOnly
    ? "지문관리에서 지문을 고르고 「실전 문제 생성」을 누르면 여기에 모입니다"
    : wOnly
      ? "지문관리에서 지문을 고르고 「학습지 생성」을 누르면 여기에 모입니다"
      : "지문관리에서 지문을 고르고 「실전 문제 생성」·「학습지 생성」을 누르면 여기에 모입니다";
  const noMatchLabel = qOnly
    ? "조건에 맞는 문항이 없습니다"
    : wOnly
      ? "조건에 맞는 학습지가 없습니다"
      : "조건에 맞는 항목이 없습니다";

  // ⚠ [E28] 구 `splitScope`(선택 헤더의 축 내역 병기 「학습지 9 · 문제 205」)는
  //   **삭제**했다. 지워도 되는 이유: 그 병기가 있던 자리는 카드 모드에서 카드마다
  //   `{picked}/{total}` 배지가 **지문 단위로** 같은 말을 더 정확하게 하고, 아래
  //   `selectAllLabel`(접근성 이름)이 「표시된 학습지 N건 + 문항 M개 전체 선택」으로
  //   같은 두 숫자를 이미 든다. 상단을 「검색 + 지문 필터」로 비우는 것이 이번
  //   개편의 요구라 남길 자리도 없다.
  // 접근성 이름은 **버튼이 담는 범위와 같은 말을 해야** 한다. 구 "표시된 항목 전체
  // 선택"의 「항목」은 축 중립어라, 화면의 필 라벨(학습지 9)과 실제 범위(학습지 9 +
  // 문항 205)가 갈리는 바로 그 자리에서 스크린리더 사용자에게 아무 단서도 주지
  // 못했다 — 되돌릴 때 [선택 해제]를 두 곳에서 눌러야 한다는 사실을 누르기 전에는
  // 알 길이 없었다. 세 갈래는 effectiveKind 의 세 값을 **빠짐없이** 덮는다(사각 =
  // 라벨이 undefined 로 떨어지는 무명 버튼).
  // ⚠ 이 자구는 E22 시절 1회성 조사물 2개
  //   (.tmp-worksheet-compose/_a22-stress.mjs:42 · _a22-falsify21-ab2.mjs:38)가
  //   `button[aria-label="표시된 항목 전체 선택"]` **정확 일치**로 잡던 값이다. 두
  //   스크립트는 E24 로 소멸한 「조판실」 필을 눌러 진입하므로 이미 무효고(전자는
  //   머리 주석이 스스로 그렇게 적어 두었다), E24 게이트(probe-e24-split ·
  //   probe-compose-room)는 이 라벨을 쓰지 않는다. 되살릴 때 정확 일치로 되돌리지
  //   말고 `[aria-label^="표시된"]` 접두 일치로 이행하라.
  const selectAllLabel = qOnly
    ? `표시된 문항 ${visibleCounts.question}개 전체 선택`
    : wOnly
      ? `표시된 학습지 ${visibleCounts.worksheet}건 전체 선택`
      : `표시된 학습지 ${visibleCounts.worksheet}건 + 문항 ${visibleCounts.question}개 전체 선택`;

  return (
    // data-tour="composer-list": 온보딩 투어(E26) 앵커 — 정적 속성, memo 무접촉.
    <div data-tour="composer-list" className="flex h-full min-h-0 flex-col">
      {/* ── 1층 필터 — 「지문 필터 | 검색 | 새로고침」 한 줄 ── */}
      {/* ⚠ [E28] 구 세그먼트 줄 [전체|문제|학습지] 은 **삭제**했다(사용자 확정 1).
          지워도 되는 이유: ⓐ 시험지 조판 뷰는 축이 고정이라 지금도 이 줄을
          미렌더하고 있었고(바뀌는 것은 학습지 조판 뷰 하나뿐), ⓑ E24 게이트 G1 은
          자산 필을 「정확히 3개」로 세는데 이 그룹은 그 컨테이너 밖이라 계수에
          섞이지 않았으므로 소멸이 오히려 계기를 단순하게 만들며, ⓒ 「이 지문 것만
          보고 싶다」는 이제 카드 접기/펴기가 받는다.
          ⚠ 온보딩 투어 CH5 의 목록 스텝 본문이 아직 「위의 「전체·문제·학습지」로
            종류를 거를 수 있습니다」라고 **없어진 UI 를 설명**한다
            (src/components/studio/tour/steps/ch5-sheet-compose.tsx). 그 파일은 이
            작업의 소유 범위 밖이라 손대지 않았다 — 같은 흐름에서 고쳐야 한다. */}
      <div className="shrink-0 space-y-1.5 border-b border-slate-100 bg-slate-50/60 px-3 py-2">
        {/* 줄 높이는 **컨테이너 h-9 하나**가 정본 — 자식은 stretch 로 꽉 채운다.
            자식마다 h-9/size-9 를 따로 주면 배율(윈도우 125·150%) 반올림이 요소별로
            갈려 1px 어긋난 줄이 된다. 여기에 h-* 를 다시 넣지 마라. */}
        <div className="flex h-9 items-stretch gap-1.5">
          <select
            aria-label="지문 필터"
            data-tour="composer-passage-filter"
            value={passageFilter}
            onChange={(e) => setPassageFilter(e.target.value)}
            className={cn(
              "w-0 flex-1 cursor-pointer rounded-md border-2 px-2 text-[12px] font-semibold outline-none transition-colors focus:ring-2 focus:ring-blue-100",
              // 지문이 걸려 있으면(≠all) 파랗게 — 「목록이 왜 줄었지」의 답이 이 박스다
              passageFilter === "all"
                ? "border-slate-300 bg-white text-slate-700 hover:border-slate-400 focus:border-blue-400"
                : "border-blue-500 bg-blue-50/70 text-blue-800 hover:border-blue-600 focus:border-blue-500",
            )}
          >
            <option value="all">지문 전체</option>
            {passageOptions.map(([id, title]) => (
              <option key={id} value={id}>
                {title}
              </option>
            ))}
          </select>
          <label className="relative flex w-0 flex-1 items-center">
            <Search
              className="pointer-events-none absolute left-2.5 size-3.5 text-slate-400"
              aria-hidden="true"
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              // 축에 맞는 힌트 — 고정 축에서 「제목」은 학습지에만 있는 필드라
              // 문항만 있는 방에서 검색되지 않는 것을 검색하라고 시킨다.
              placeholder={
                qOnly
                  ? "문두·지문 검색"
                  : wOnly
                    ? "제목·지문 검색"
                    : "제목·문두·지문 검색"
              }
              // 「조판실 검색」은 E24 로 **소멸한 필 이름**이라 접근성 이름이 유령을
              // 가리켰다. 두 조판 뷰가 같은 판을 공유하므로 이름도 축 중립이어야
              // 한다 — 뷰마다 접근성 이름이 갈리면 셀렉터가 뷰 의존이 된다.
              aria-label="자료 검색"
              className="h-full w-full min-w-0 rounded-md border-2 border-slate-300 bg-white pl-8 pr-2 text-[12px] text-slate-700 outline-none transition-colors placeholder:text-slate-300 hover:border-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
          </label>
          <button
            type="button"
            onClick={refreshAll}
            title="목록 새로고침"
            aria-label="목록 새로고침"
            className="flex w-9 shrink-0 cursor-pointer items-center justify-center rounded-md border-2 border-slate-300 bg-white text-slate-500 transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600"
          >
            {refreshing ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCw className="size-4" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      {/* ── 2층 필터 — **평면 모드(시험지 조판 뷰) 전용** ──────────────────
          [E28] 카드 모드에서는 이 줄이 통째로 없다. 유형·난이도·킬러는 카드 안
          「생성된 문제」 섹션으로, 플랜·상태는 카드 안 「학습지」 섹션으로
          내려갔다(사용자 확정 5 — 상단은 검색 + 지문 필터만).
          ⚠ 「전체」에서 이 줄이 없는 것은 예전과 같지만 **이유가 달라졌다**:
            예전엔 「어느 축의 필터를 펼지 모른다」였고 지금은 「두 축이 함께 보이면
            카드가 그 필터를 지문마다 갖는다」다.
          라벨은 개명 그대로 — 문항 축 「프리미엄 여부」(예전엔 「종류」). ── */}
      {qAxis ? (
        <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-slate-100 bg-white px-3 py-1.5">
          <select
            aria-label="유형 필터"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className={SELECT_CLS}
          >
            <option value="all">유형 전체</option>
            {typeOptions.map(([label, n]) => (
              <option key={label} value={label}>
                {label} ({n})
              </option>
            ))}
          </select>
          <select
            aria-label="난이도 필터"
            value={diffFilter}
            onChange={(e) => setDiffFilter(e.target.value)}
            className={SELECT_CLS}
          >
            <option value="all">난이도 전체</option>
            {DIFFICULTY_LEVELS.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
          <select
            aria-label="프리미엄 여부 필터"
            value={premiumFilter}
            onChange={(e) =>
              setPremiumFilter(e.target.value as "all" | "premium" | "standard")
            }
            className={SELECT_CLS}
          >
            {/* 26-08-18 난이도 기반 티어: 라벨만 일반/킬러(값·로직 불변) */}
            <option value="all">일반·킬러</option>
            <option value="standard">일반</option>
            <option value="premium">킬러</option>
          </select>
        </div>
      ) : null}

      {/* ── 선택 헤더 — 전체 선택 + 카운트 + 필터 초기화 + 축별 선택 수 ── */}
      <div className="flex shrink-0 items-center gap-2 border-b border-slate-100 px-3 py-1.5">
        <button
          type="button"
          role="checkbox"
          aria-checked={allChecked ? true : someChecked ? "mixed" : false}
          aria-label={selectAllLabel}
          onClick={toggleAll}
          className="flex cursor-pointer items-center gap-1.5"
        >
          <span
            className={
              allChecked || someChecked
                ? `${BOX_BASE} border-slate-600 bg-slate-600 text-white`
                : BOX_OFF
            }
            aria-hidden="true"
          >
            {someChecked && !allChecked ? (
              <Minus className="size-3" strokeWidth={3} />
            ) : (
              <Check className="size-3" strokeWidth={3} />
            )}
          </span>
          <span className="text-[11px] font-semibold text-slate-500">
            전체 선택
          </span>
        </button>
        <span
          className="text-[10.5px] tabular-nums text-slate-400"
          title={
            capped
              ? // [E28] 분모는 **상한의 모집단**(renderPoolCount)이다. 카드 모드에서
                // filteredRows 를 쓰면 「더 보기」가 되돌릴 수 없는 접힌 카드까지
                // 잔량으로 세어, 눌러도 줄지 않는 숫자를 고지하게 된다.
                `${renderPoolCount}개 중 ${renderedRows.length}개만 렌더 중 — 「더 보기」로 확장`
              : undefined
          }
        >
          {/* 분모는 **축 총계**다(§3.10.23 E24-4 「고정 축이면 그 축만」).
              병합 총계를 쓰면 시험지 조판 뷰에 「167개 중 159개」가 떠, 보이지도
              않는 학습지 8건이 「내가 뭘 놓쳤나」로 읽힌다. */}
          {filterActive
            ? `${axisTotal}개 중 ${filteredRows.length}개`
            : `${axisTotal}개`}
          {capped ? ` · ${renderedRows.length}개 표시` : ""}
        </span>
        {resetActive ? (
          <button
            type="button"
            onClick={resetFilters}
            className="flex cursor-pointer items-center gap-1 rounded px-1 py-0.5 text-[10.5px] font-semibold text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-600"
          >
            <RotateCcw className="size-2.5" aria-hidden="true" />
            필터 초기화
          </button>
        ) : null}
        {/* [E28B §8-1 C6] 「모두 펼치기 / 모두 접기」 — 카드 모드 전용 **버튼 1개**.
            바로 왼쪽 「전체 선택」의 모집단이 렌더분(= 열린 카드의 행)이라, 전량
            담기를 되찾는 유일한 손잡이가 이것이다(평면 시절 1클릭 = 학습지 9 +
            문항 205). 상태에 따라 라벨만 바뀐다 — 버튼을 둘로 쪼개지 마라.
            ⚠ `data-drag-select-ignore` 필수(없으면 마키 시작면으로 오인된다). */}
        {cards !== null && cards.list.length > 0 ? (
          <button
            type="button"
            data-drag-select-ignore="true"
            onClick={toggleAllCards}
            title={
              allCardsOpen
                ? "모든 지문 카드를 접습니다(담은 항목은 그대로 남습니다)"
                : `지문 카드 ${cards.list.length}장을 모두 펼칩니다 — 「전체 선택」의 범위가 그만큼 넓어집니다`
            }
            className="flex cursor-pointer items-center gap-1 rounded px-1 py-0.5 text-[10.5px] font-semibold text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-600"
          >
            <ChevronDown
              className={cn(
                "size-2.5 transition-transform motion-reduce:transition-none",
                allCardsOpen ? "-rotate-90" : "",
              )}
              aria-hidden="true"
            />
            {allCardsOpen ? "모두 접기" : "모두 펼치기"}
          </button>
        ) : null}
        <span className="flex-1" aria-hidden="true" />
        {/* 축별 선택 수를 **따로** 적는다 — 합계 하나는 「학습지 없이 문항만
            골랐다」(합본 CTA 미노출 조건)를 못 보여 준다. */}
        {pickedQuestionIds.size > 0 || pickedSheets.size > 0 ? (
          <span className="flex items-center gap-1.5 text-[11px] font-bold tabular-nums">
            {pickedQuestionIds.size > 0 ? (
              <span className="text-blue-600">
                문제 {pickedQuestionIds.size}
              </span>
            ) : null}
            {pickedSheets.size > 0 ? (
              <span className="text-violet-600">
                학습지 {pickedSheets.size}
              </span>
            ) : null}
          </span>
        ) : (
          <span className="hidden text-[10.5px] text-slate-300 sm:block">
            클릭·드래그로 선택
          </span>
        )}
      </div>

      {/* ── 부분 실패 배너 — 한 축만 죽었을 때(전면 에러 금지) ── */}
      {!allAxesFailed && (qError || wError) ? (
        <div className="flex shrink-0 items-center gap-2 border-b border-amber-100 bg-amber-50/70 px-3 py-1.5">
          <AlertTriangle
            className="size-3.5 shrink-0 text-amber-500"
            aria-hidden="true"
          />
          <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-amber-700">
            {qError ? `문제 목록: ${qError}` : `학습지 목록: ${wError}`}
          </span>
          <button
            type="button"
            onClick={qError ? onRefreshQuestions : onRefreshWorksheets}
            className="shrink-0 cursor-pointer rounded-md border border-amber-200 bg-white px-2 py-0.5 text-[10.5px] font-bold text-amber-700 transition-colors hover:bg-amber-100"
          >
            {qError ? "문제 다시 시도" : "학습지 다시 시도"}
          </button>
        </div>
      ) : null}

      {/* ── 본문 ── */}
      {loading ? (
        <div
          aria-busy="true"
          className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-hidden px-3 py-2"
        >
          {/* 스켈레톤 = 2단 행(~56px) 근사 — 로드 완료 시 점프 최소화 */}
          {Array.from({ length: 8 }, (_, i) => (
            <div
              key={i}
              className="h-14 shrink-0 animate-pulse rounded-md border border-slate-100 bg-slate-50"
            />
          ))}
        </div>
      ) : allAxesFailed ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-6">
          {/* 고정 축에서는 반대 축 에러가 null 이므로 **있는 것만** 편다 —
              무조건 두 줄을 렌더하면 빈 <p> 가 남아 여백만 벌어진다. */}
          {qError ? (
            <p className="text-center text-[12px] text-slate-400 break-keep">
              {qError}
            </p>
          ) : null}
          {wError ? (
            <p className="text-center text-[12px] text-slate-400 break-keep">
              {wError}
            </p>
          ) : null}
          <button
            type="button"
            onClick={refreshAll}
            className="cursor-pointer rounded-md border border-slate-200 bg-white px-3 py-1.5 text-[11.5px] font-semibold text-slate-600 transition-colors hover:bg-slate-50"
          >
            다시 시도
          </button>
        </div>
      ) : axisTotal === 0 ? (
        // 「이 축에 자산이 0」과 「필터로 0」은 다른 화면이어야 한다. 분모를
        // 병합 총계로 두면 시험지 조판 뷰(문항 0·학습지 8)가 아래 「조건에 맞는
        // …」 분기로 떨어져, 필터를 건 적 없는 사용자에게 눌러도 아무 일이 없는
        // 「필터 초기화」 버튼만 내민다.
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-6">
          <Layers className="h-8 w-8 text-slate-300" aria-hidden="true" />
          <p className="text-center text-[13px] font-medium text-slate-400 break-keep">
            {emptyTitle}
          </p>
          <p className="text-center text-[11px] leading-relaxed text-slate-400 break-keep">
            {emptyHint}
          </p>
        </div>
      ) : filteredRows.length === 0 ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-6">
          <p className="text-center text-[12px] text-slate-400 break-keep">
            {noMatchLabel}
          </p>
          <button
            type="button"
            onClick={resetFilters}
            className="cursor-pointer rounded-md border border-slate-200 bg-white px-3 py-1.5 text-[11.5px] font-semibold text-slate-600 transition-colors hover:bg-slate-50"
          >
            필터 초기화
          </button>
        </div>
      ) : (
        // @container: 액션 라벨 접힘 축은 **컨테이너 폭**이다(뷰포트 아님) —
        // 조판이 열리면 이 열이 420px 로 눌리는데 뷰포트는 그대로다(E21-4).
        <div className="@container min-h-0 flex-1 overflow-y-auto px-3 py-2">
          <DragSelect
            deferCommit
            value={selectedKeys}
            onChange={handleMarquee}
            className="flex flex-col gap-1.5"
          >
            {/* ── [E28] §3.10.27 — 지문 카드 목록(두 축이 함께 보이는 방) ──
                평면 경로(아래 visibleRows.map)는 **손대지 않았다**(1줄 제목 R6
                되돌림 제외). 두 분기를 삼항으로 감싸 한 덩어리로 만들지 마라 —
                평면 블록을 통째로 들여쓰기하는 순간 diff 가 읽히지 않는다. */}
            {cards !== null ? cards.list.map(renderPassageCard) : null}
            {cards !== null ? null : visibleRows.map((it) => {
              const checked = selectedKeys.has(it.key);
              const isQ = it.kind === "question";
              const order = checked
                ? isQ
                  ? questionOrder.get(it.row.id)
                  : sheetOrder.get(it.row.reportId)
                : undefined;
              // ── 1줄 제목 = 문항은 지문 이름 / 학습지는 **AI 제목** ──────────
              // ⚠ [E28] 구 R6(「학습지 1줄도 지문 이름」)은 **되돌렸다**(사용자
              //   재확정). R6 의 근거는 「사용자는 목록에서 지문을 찾는데 목록이
              //   AI 작명을 말한다」였는데, 지문 이름은 이제 **카드 머리**가 맡는다
              //   — 행까지 지문 이름을 말하면 한 카드 안에서 같은 글자가 N번
              //   반복되고, 같은 지문의 PRIME/PRIME_FINAL 두 행이 글자 단위로
              //   같아진다(두 행의 passageId 는 같다 — sheet-pick-types.ts E27 정정).
              //
              // ⓝ 참고: 평면 경로는 `cardMode === false`(= 시험지 조판 뷰)에서만
              //   도는데 그 뷰는 `wIncluded === false` 라 **학습지 행이 애초에
              //   오지 않는다**. 즉 이 되돌림은 지금 화면을 바꾸지 않는다. 그래도
              //   되돌리는 이유: 두 문법이 같은 값을 말해야 평면 경로가 되살아나는
              //   날 두 표면이 어긋나지 않는다.
              const title =
                it.kind === "worksheet" ? it.row.title : it.row.passageTitle;
              // 1줄에서 밀려난 나머지 한쪽(학습지 = 지문 이름). 2줄과 툴팁이 쓴다.
              const subTitle =
                it.kind === "worksheet" ? it.row.passageTitle : null;
              // 학습지 축 파생은 **행당 1회**로 모은다(JSX 안에서 같은 술어를
              // 3번 부르면 조건이 갈릴 여지가 생긴다). 판정 정본은
              // sheet-deploy-eligibility 한 곳 — 로컬 재판정 금지(§3.10.21 E21-5).
              const sheet = it.kind === "worksheet" ? it.row : null;
              const status = sheet ? statusOf(sheet.status) : null;
              const deployable = sheet
                ? canDeployWorksheetRow(sheet.planMarker)
                : null;
              return (
                // 행 루트 = 무롤 div(마키 시작면 + 포인터 토글) — 체크 시맨틱·
                // 키보드는 좌측 실버튼 소유(헤더 주석 ①).
                <div
                  key={it.key}
                  data-drag-item-id={it.key}
                  onClick={() => toggleRow(it)}
                  className={cn(
                    "group flex shrink-0 cursor-pointer items-start gap-2 rounded-md border px-2.5 py-2 transition-colors",
                    checked
                      ? isQ
                        ? "border-blue-300/80 bg-blue-50/60"
                        : "border-violet-300/80 bg-violet-50/60"
                      : "border-slate-100 bg-white hover:border-slate-200 hover:bg-slate-50/60",
                  )}
                >
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={checked}
                    // 접미 「문항 선택」/「학습지 선택」은 구 두 판의 게이트
                    // 계약을 그대로 승계한다(체크 상태 무관·행별 고유).
                    aria-label={
                      isQ
                        ? `${it.row.passageTitle} · ${questionRowTypeLabel(it.row.type, it.row.subType)} 문항 선택`
                        : `${it.row.title} · ${it.row.passageTitle} 학습지 선택`
                    }
                    title={
                      order !== undefined
                        ? isQ
                          ? `문제 조판 ${order}번째`
                          : `학습지 조판 ${order}번째`
                        : undefined
                    }
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleRow(it);
                    }}
                    className={cn(
                      checked ? (isQ ? BOX_ON_Q : BOX_ON_W) : BOX_OFF,
                      // mt-0.5: 한글 글리프 박스(실측 19px)가 line-height 를
                      // 넘쳐 첫 줄 시각 중심이 2.5px 아래(구 문항 판 실측).
                      "mt-0.5 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400",
                    )}
                  >
                    {order !== undefined && order <= 99 ? (
                      <span className="text-[9px] font-bold leading-none tabular-nums">
                        {order}
                      </span>
                    ) : (
                      <Check className="size-3" strokeWidth={3} />
                    )}
                  </button>

                  {/* 2단 본문 — 본문 스팬에 cursor-pointer 금지(마키 차단). */}
                  <span className="min-w-0 flex-1">
                    {/* 1줄 = 제목 단독. **이 줄에 형제를 추가하지 마라** —
                        경쟁자가 생기는 순간 제목이 먼저 압착된다. */}
                    <span
                      className={cn(
                        "line-clamp-2 block text-[12px] font-semibold leading-snug break-keep",
                        checked ? "text-slate-800" : "text-slate-700",
                      )}
                      // 툴팁에는 **두 제목이 다 보인다**(학습지 행 한정) — 1줄이
                      // 어느 쪽이든 나머지 한쪽을 마우스만으로 확인할 수 있어야 한다.
                      title={
                        subTitle === null ? title : `${title} · ${subTitle}`
                      }
                    >
                      {title}
                    </span>
                    <span className="mt-1 flex items-center gap-1.5">
                      {/* 타입 배지 = 2줄 맨 앞 **고정폭 1개**. 종류 토큰을
                          w-[2rem] 로 고정해 문제/학습지 행이 섞여도 좌측
                          리듬이 어긋나지 않는다. 학습지의 기존 planLabel
                          배지는 뒤로 밀지 않고 **이 배지 안에 접는다**
                          (「학습지 · 파이널 원페이지」) — 배지가 둘이면 2줄이
                          배지로 먼저 차서 축별 메타가 밀려난다. */}
                      <span
                        className={cn(
                          "flex shrink-0 items-center gap-1 rounded-[4px] px-1 py-px text-[9.5px] font-bold",
                          isQ
                            ? "bg-slate-100 text-slate-600"
                            : "bg-blue-50 text-blue-600",
                        )}
                      >
                        <span className="w-[2rem] shrink-0 text-center">
                          {isQ ? "문제" : "학습지"}
                        </span>
                        {isQ ? null : (
                          <span className="max-w-[6.5rem] truncate opacity-80">
                            ·{" "}
                            {SHEET_PLAN_LABEL.get(it.row.planMarker) ??
                              it.row.planMarker}
                          </span>
                        )}
                      </span>

                      {/* ── 축별 메타 ── */}
                      {isQ ? (
                        <>
                          <span className="shrink-0 text-[11px] font-medium text-slate-500">
                            {questionRowTypeLabel(it.row.type, it.row.subType)}
                          </span>
                          {it.row.difficulty &&
                          DIFFICULTY_LABEL_MAP.has(it.row.difficulty) ? (
                            <span
                              className={cn(
                                "shrink-0 rounded-[4px] px-1 py-px text-[9.5px] font-bold",
                                it.row.difficulty === "KILLER"
                                  ? "bg-rose-50 text-rose-600"
                                  : "bg-slate-100 text-slate-500",
                              )}
                            >
                              {DIFFICULTY_LABEL_MAP.get(it.row.difficulty)}
                            </span>
                          ) : null}
                          {/* 난이도 뱃지(KILLER rose)가 같은 티어를 말하면 이중
                              표기라 숨김 — 레거시(비킬러 프리미엄)만 남는다
                              (구 문항 판과 같은 판정). */}
                          {it.row.premium &&
                          planForDifficulty(it.row.difficulty) !== "PREMIUM" ? (
                            <span className="shrink-0 rounded-[4px] border border-violet-200 bg-violet-50 px-1 py-px text-[9.5px] font-bold text-violet-700">
                              {QUESTION_GENERATION_PLANS.PREMIUM.shortLabel}
                            </span>
                          ) : null}
                        </>
                      ) : status ? (
                        <>
                          <span
                            className={cn(
                              "shrink-0 rounded-full border px-1.5 py-px text-[9.5px] font-semibold",
                              status.cls,
                            )}
                          >
                            {status.label}
                          </span>
                          {/* [E28] 구 R6 **되돌림** — 1줄이 AI 제목을 되찾았으므로
                              여기 내려오는 것은 지문 이름이다(개편 전 원형).
                              같은 지문의 두 학습지(PRIME/PRIME_FINAL)를 가르는
                              것은 1줄 AI 제목과 앞의 플랜 배지 둘이다. */}
                          <span
                            className="min-w-0 truncate text-[10.5px] font-medium text-slate-400"
                            title={it.row.passageTitle}
                          >
                            {it.row.passageTitle}
                          </span>
                        </>
                      ) : null}
                      <span className="min-w-0 flex-1" aria-hidden="true" />
                      {/* 우측 일시 = **정렬 축과 같은 값(createdAt)**. 학습지의
                          「마지막 수정」은 표시 필드로만 남겨 툴팁에 싣는다 —
                          정렬 축과 다른 시각을 열에 세우면 「최신순인데 날짜가
                          거꾸로」로 읽힌다. */}
                      <span
                        className="shrink-0 text-[10px] tabular-nums text-slate-400"
                        title={
                          sheet
                            ? `마지막 수정 ${fmtDateTime(sheet.updatedAt)}`
                            : undefined
                        }
                      >
                        {fmtDateTime(it.sortAt)}
                      </span>
                    </span>
                  </span>

                  {/* ── 액션 클러스터(행 직계 형제 — 1줄 무경쟁 유지) ── */}
                  {isQ ? (
                    onOpenQuestion ? (
                      <button
                        type="button"
                        data-drag-select-ignore="true"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenQuestion(it.row.id);
                        }}
                        title={it.row.stem || "문항 상세보기"}
                        aria-label="문항 상세보기"
                        // -mt-1: 24px 버튼 중심을 제목 첫 줄 시각 중심에 정렬
                        // (구 문항 판 프로브 P2 정본).
                        className="-mt-1 flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-slate-300 transition-colors hover:bg-blue-50 hover:text-blue-600"
                      >
                        <Maximize2 className="size-3.5" aria-hidden="true" />
                      </button>
                    ) : null
                  ) : sheet ? (
                    <>
                      {onDeploySheet ? (
                        deployable?.ok ? (
                          <button
                            type="button"
                            data-drag-select-ignore="true"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeploySheet(sheet);
                            }}
                            title="모바일 배포 — 학생 앱 과제로 보냅니다"
                            aria-label={`${sheet.title} 모바일 배포`}
                            className={ROW_ACTION_SECONDARY}
                          >
                            <Smartphone
                              className="size-3 shrink-0"
                              aria-hidden="true"
                            />
                            <span className={ROW_ACTION_LABEL}>모바일 배포</span>
                          </button>
                        ) : (
                          // 비활성 래퍼가 툴팁을 대신 띄운다(위 ROW_ACTION_DISABLED).
                          <span
                            title={deployable?.reason}
                            data-drag-select-ignore="true"
                            className="flex shrink-0"
                          >
                            <button
                              type="button"
                              disabled
                              aria-label={`${sheet.title} 모바일 배포 — ${deployable?.reason ?? ""}`}
                              className={ROW_ACTION_DISABLED}
                            >
                              <Smartphone
                                className="size-3 shrink-0"
                                aria-hidden="true"
                              />
                              <span className={ROW_ACTION_LABEL}>
                                모바일 배포
                              </span>
                            </button>
                          </span>
                        )
                      ) : null}
                      {onComposeSheet ? (
                        <button
                          type="button"
                          data-drag-select-ignore="true"
                          onClick={(e) => {
                            e.stopPropagation();
                            onComposeSheet(sheet);
                          }}
                          title="학습지 조판 — 오른쪽에서 A4 학습지를 만듭니다"
                          // 접미 「학습지 조판」은 게이트 셀렉터 계약
                          // (probe-sheet-compose.mjs:285,302
                          //  `button[aria-label$="학습지 조판"]`) — 바꾸지 마라.
                          aria-label={`${sheet.title} 학습지 조판`}
                          className={ROW_ACTION_PRIMARY}
                        >
                          <LayoutTemplate
                            className="size-3 shrink-0"
                            aria-hidden="true"
                          />
                          <span className={ROW_ACTION_LABEL}>학습지 조판</span>
                        </button>
                      ) : null}
                    </>
                  ) : null}

                  {/* 지문 스튜디오 이동 — 근육기억 보존용 잔존 링크(E21-5).
                      data-drag-select-ignore + stopPropagation 필수: 조상에
                      anchor 가 있으면 마키가 시작조차 안 된다(헤더 주석). */}
                  <Link
                    href={`/director/studio/c/${classId}/p/${it.row.passageId}`}
                    data-drag-select-ignore="true"
                    onClick={(e) => e.stopPropagation()}
                    title={`${it.row.passageTitle} — 지문 스튜디오에서 열기`}
                    aria-label={`${it.row.passageTitle} 지문 스튜디오에서 열기`}
                    className="-mt-1 flex size-6 shrink-0 items-center justify-center rounded-md text-slate-300 transition-colors hover:bg-blue-50 hover:text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                  >
                    <ChevronRight className="size-3.5" aria-hidden="true" />
                  </Link>
                </div>
              );
            })}
          </DragSelect>

          {capped ? (
            <div className="flex flex-col items-center gap-1 px-1 pt-2">
              <button
                type="button"
                onClick={() =>
                  setCapState({ sig: filterSig, cap: renderCap + capChunk })
                }
                className="cursor-pointer rounded-md border border-slate-200 bg-white px-3 py-1.5 text-[11.5px] font-semibold text-slate-600 transition-colors hover:bg-slate-50"
              >
                {/* [E28] 잔량도 상한 모집단 기준(펼친 카드의 행) — 위 title
                    주석과 같은 근거. 카드 모드에서 이 버튼은 **전 카드의 섹션당
                    기준선**을 한 단(CARD_ROW_CHUNK) 올린다. 카드 하나만 늘리고
                    싶으면 그 카드 안 「이 카드에서 더 보기」를 쓴다. */}
                더 보기 ({renderPoolCount - renderedRows.length}개 남음)
              </button>
              <p className="text-[10.5px] text-slate-400 break-keep">
                {/* 여기도 축 총계 — 고정 축 뷰에서 「전체 167개」는 보이지도
                    않는 반대 축을 세는 거짓말이다. */}
                필터·검색은 전체 {axisTotal}개를 대상으로 동작합니다
              </p>
            </div>
          ) : null}
          {/* ── 절단 각주 = 「서버가 **애초에 보내지 않은 행**」의 고지 ──────
              각주는 **그 축이 보일 때만** 뜬다. 축이 빠진 뷰에서 반대 축 각주가
              뜨면(시험지 조판 뷰에 「학습지는 …」) 방을 다시 헷갈리게 한다.

              ⚠ 처방으로 **필터를 시키지 마라**(§3.10.23 E24, 적대 검수 minor).
              구 자구는 두 축 모두 「지문 필터로 좁혀 확인하세요」였는데, 여기서
              잘린 행은 서버 `take` 에 걸려 **응답에 오지도 않은 행**이라 클라이언트
              필터의 사정거리 밖이다. 시키는 대로 지문을 고르면 잘린 행 대신
              「조건에 맞는 …이 없습니다」 빈 화면이 뜬다 — 절단을 알리려던 각주가
              **유실의 증거처럼** 읽히는 정반대 결과이고, 그 오독은 문의가 아니라
              재생성(=과금)으로 이어진다. 실행 가능한 유일한 처방은 **축이 다른
              질의**, 즉 지문관리의 지문별 도시에다: 그쪽은 지문 1개 스코프라
              문항 take 1000 · 리포트 take 10 을 그 지문 하나에 통째로 쓴다
              (src/actions/studio/dossier.ts:175·212).

              ⚠ 자구를 고칠 때는 반드시 **액션의 `orderBy` 를 먼저 읽어라**. 구
              학습지 자구가 절단 방향을 통째로 뒤집어 말하고 있었던 것이 정확히
              이 절차를 건너뛴 결과다(아래 각 각주의 「방향 근거」 참조). */}
          {qIncluded && questionsState.truncated ? (
            <p className="px-1 pt-2 text-[10.5px] leading-relaxed text-slate-400 break-keep">
              {/* 방향 근거: questions.ts:104-105 `orderBy: { createdAt: "desc" }`
                  + `take: QUESTION_TAKE(1000)` → **최근 만든 1,000개**가 살고
                  오래된 것이 잘린다. 이 축은 방향은 구 자구도 맞았고 결함이
                  처방뿐이라 방향 문장은 보존한다(E24 이전부터 있던 결함이다).
                  ⚠ 같은 액션의 링크 절단(questions.ts:76 `take: 300`)은
                  `truncated` 판정식(questions.ts:185)에 **들어 있지 않다** — 문항
                  축은 지문 300개 초과분을 지금도 무고지로 버린다. 이 판에서 고칠
                  수 없는 서버 쪽 결함이라 각주는 그 축을 주장하지 않는다(모르는
                  것을 아는 척하면 그것이 다음 거짓 자구가 된다). */}
              문항은 최근 만든 1,000개까지만 옵니다 — 그보다 오래된 문항은 이 목록에
              오지 않아 필터로도 찾을 수 없습니다. 지문관리에서 해당 지문을 열면 그
              지문의 문항이 전부 보입니다
            </p>
          ) : null}
          {/* 학습지 축 각주 — §3.10.23 E24-1⑩ 신설(구조상 문항 축에만 있었다).
              「학습지 조판」이라는 전용 방을 만들어 놓고 목록이 조용히 잘리면
              사용자는 그것을 **절단이 아니라 유실/버그로 해석**한다. */}
          {wIncluded && worksheetsState.truncated ? (
            <p className="px-1 pt-2 text-[10.5px] leading-relaxed text-slate-400 break-keep">
              {/* 방향 근거(worksheets.ts 를 읽고 쓸 것 — 구 자구가 여기서 정확히
                  뒤집혀 있었다). 이 축의 절단은 **두 개**이고 `truncated` 는 그
                  OR(worksheets.ts:147-148)이라 클라이언트가 어느 쪽인지 구분할
                  방법이 없다 — 그래서 둘 다 적는다:
                   ① 링크축 `orderBy: [{sortOrder:"asc"},{createdAt:"asc"}]` +
                      `take: CLASS_LINK_TAKE(300)` → **먼저 등록한 지문 300개**가
                      살아남는다. 잘리는 것은 「오래된 것」이 아니라 **나중에 등록한
                      지문**의 학습지다. 구 자구 「최근 지문 300개분까지 — 더 오래된
                      학습지는」은 방향이 통째로 뒤집힌 거짓 서술이었고, 그 말을 믿은
                      사용자는 **살아 있는 쪽**을 찾아 헤매게 된다.
                   ② 리포트축 `orderBy: { updatedAt: "desc" }` + `take:
                      REPORT_TAKE(900)` → 최근 수정 900건이 살고 **오래 손대지 않은**
                      학습지가 잘린다.
                  숫자 300·900 은 CLASS_LINK_TAKE·REPORT_TAKE 의 사본이다 — 상한을
                  고치면 이 자구도 **같은 커밋에서** 고쳐라(계기가 죽은 채 초록인
                  상태를 만들지 마라 — worksheets.ts 머리 주석과 같은 계약). */}
              학습지는 이 클래스에 먼저 등록한 지문 300개분까지, 그중에서도 최근
              수정한 900건까지만 옵니다 — 뒤에 등록한 지문의 학습지나 오래 손대지
              않은 학습지는 이 목록에 오지 않아 필터로도 찾을 수 없습니다. 지문관리
              에서 해당 지문을 열어 확인하세요
            </p>
          ) : null}
          {/* 하단 여백 — 마지막 행이 픽바 등장에 가리지 않게 */}
          <div className="h-2" aria-hidden="true" />
        </div>
      )}
    </div>
  );
}

export const ComposerListPane = memo(ComposerListPaneInner);
