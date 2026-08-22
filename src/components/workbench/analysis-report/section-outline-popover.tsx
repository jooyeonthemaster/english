"use client";

import { FileText, ListTree } from "lucide-react";
import { useState } from "react";

import {
  Popover,
  PopoverArrow,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

import { ActivityToggleSwitch } from "./activity-palette-modal";
import type { ComposeOutlineEntry, ComposeOutlineGroup } from "./compose/outline-types";
import type { OutlineEntry } from "./report-sections";

/**
 * 목차의 두 번째 축 — '삽입한 블록'(학습 활동·웹툰 이미지·자유 텍스트·여백).
 * 섹션(hiddenSections 슬롯키)과 달리 이쪽은 blockMeta[id].hidden 축이다.
 * 커스텀 블록은 헤더 슬롯을 만들지 않으므로 섹션 번호를 소비하지 않는다.
 */
export type OutlineCustomEntry = {
  id: string;
  label: string;
  hidden: boolean;
};

/** 마지막 남은 섹션을 끄려 할 때 보여줄 이유(스위치 title). */
const LAST_SECTION_HINT = "마지막 남은 섹션이라 끌 수 없어요 — 본문이 통째로 비어버립니다.";

/**
 * `composeGroups` 미전달 시의 고정 빈 배열.
 *
 * 기본값을 `= []` 로 쓰면 렌더마다 새 배열이 생겨 하위 memo 를 무의미하게 깨뜨린다.
 * 이 컴포넌트는 지금 memo 가 아니지만, 조판 목차는 본문이 수십~수백 항목이 될 수 있어
 * 나중에 memo 로 감쌀 때 이 상수 하나가 계약을 지켜 준다(리포 관용구).
 */
const NO_COMPOSE_GROUPS: ComposeOutlineGroup[] = [];

/**
 * 섹션 목차 팝오버 — 상단바 좌측 슬롯(outlineSlot)에 꽂혀 편집기 문서의
 * '헤더 슬롯' 목록을 보여주고, 섹션/삽입 블록을 비파괴로 켜고 끈다.
 *
 * 설계 메모
 *  · 목록·번호·제목은 전부 reportOutline()(report-sections/section-slots)이 계산한
 *    최종 표시값이다. 여기서 라벨 폴백을 다시 하지 않는다(이중 진실원 금지).
 *  · 토글은 부모(편집기)의 setReport 히스토리 reducer 를 타므로 Ctrl+Z 로 되돌아간다.
 *  · 팝오버 껍데기는 공용 Radix Popover 재사용 — 외부 클릭/Esc/포커스 복귀가 이미 검증돼 있다.
 *
 * ── [E27] 조판 트리 흡수 (`.tmp-worksheet-compose/E27-SPEC.md` §4 R3-0) ──────────
 * 사용자 확정: 「버튼이 많아지는 건 별로 — 기존 목차 기능에 다 포함해도 된다」.
 * 그래서 조판 목차는 **새 버튼·새 팝오버가 아니라 이 팝오버가 흡수**한다.
 *
 * ★ E21-2 계약은 그대로 지킨다: 조판 항목을 `entries`/`customEntries`(= 활성 report
 *   기반 descriptors 축)에 **섞지 않는다**. `composeGroups` 는 조판 표면이 소유한
 *   완전히 별개의 데이터 원천이고, 클릭은 `onJumpCompose` 라는 별개 채널로만 나간다.
 *   섞는 순간 「활성 report 에 없는 id 를 편집하려 든다」는 이미 수리된 결함이 재발한다.
 * ★ 조판 항목 클릭은 **스크롤 + 1회 글로우뿐**이다. 활성 문서 전환(= 편집기 재마운트 =
 *   미저장 편집 증발 + dirty confirm)은 표면 헤더의 문서 칩이 계속 담당한다(E27 절대금지 6).
 *
 * ── [E28] 조판 항목 이름 규약 (§3.10.27 · `.tmp-worksheet-compose/E28-SPEC.md` §7 R7) ──
 * 이 팝오버는 라벨을 **만들지 않는다**(위 「이중 진실원 금지」와 같은 규약). 값은 전부
 * `sheet-compose-surface.tsx` 의 `composeOutline` 이 정하고, 여기서는 **어디에 그리는지**만
 * 정한다. E28 이 바꾼 것은 그 「어디」 두 곳뿐이다:
 *   · doc 항목 1줄(`label`) = **플랜 라벨**(기본 학습지 / 파이널 원페이지 / 국어 워크북).
 *     그룹 헤더가 이미 지문 제목을 말하므로 항목이 그걸 되풀이하면 형제가 구분되지 않는다.
 *   · doc 항목의 `sub` = **AI 생성 제목** → 배지가 아니라 `title` 툴팁으로 강등.
 * 「편집 중」 배지·`data-compose-outline-entry`·`data-entry-kind` 는 **무접촉**(E27 프로브 계약).
 */
export function SectionOutlinePopover({
  entries,
  customEntries,
  pageCount,
  onToggleSection,
  onToggleCustom,
  onJump,
  composeGroups = NO_COMPOSE_GROUPS,
  onJumpCompose,
}: {
  entries: OutlineEntry[];
  customEntries: OutlineCustomEntry[];
  /** 트리거 칩에 노출할 총 페이지 수 — 모바일은 좌측 페이지 레일이 숨겨져 여기가 유일한 표시처다. */
  pageCount: number;
  onToggleSection: (key: string) => void;
  onToggleCustom: (id: string) => void;
  onJump: (blockId: string) => void;
  /**
   * [E27] 조판(합성 스트림)의 인쇄 순서 트리. 지문 그룹 → 그 지문의 학습지 문서 + 문항.
   * **미전달·빈 배열이면 조판 블록을 렌더조차 하지 않아 기존과 픽셀 동일**하다(additive 계약).
   */
  composeGroups?: ComposeOutlineGroup[];
  /**
   * [E27] 조판 항목 점프. 호출부(편집기)는 **`setActiveId` 를 하지 않는** 스크롤 전용
   * 경로여야 한다 — activeId 를 건드리면 Delete 토스트 오발화·속성 패널 공백·전 페이지
   * 리렌더 3종이 함께 온다(E27-SPEC R3-2 의 ①②③).
   */
  onJumpCompose?: (entry: ComposeOutlineEntry) => void;
}) {
  const [open, setOpen] = useState(false);

  const onCount = entries.filter((entry) => !entry.hidden).length;
  const offCount = entries.length - onCount + customEntries.filter((entry) => entry.hidden).length;
  // 마지막 하나까지 끄면 본문이 빈 문서가 된다 — 그 항목의 OFF 만 막는다(켜기는 항상 허용).
  const lockLastSection = onCount <= 1;

  const isEmpty = entries.length === 0 && customEntries.length === 0;
  // 조판 중인가 = 조판 트리를 그릴 것인가. 이 한 플래그가 「기존과 픽셀 동일」의 게이트다.
  const hasCompose = composeGroups.length > 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-haspopup="dialog"
          aria-expanded={open}
          // [E27] 조판 중에는 자구가 반쪽 진실이 되므로 갈아 끼운다. 단 **`목차` 로 시작하는
          // 것은 계약**이다 — 행동 게이트가 `button[title^="목차"]` 로 이 트리거를 잡는다
          // (`.tmp-worksheet-compose/probe-e27.mjs` G3). 비조판이면 문자열이 기존과 동일하다.
          title={hasCompose ? "목차 — 조판 순서 · 섹션 켜고 끄기" : "목차 — 섹션 켜고 끄기"}
          className={cn(
            "flex h-8 min-w-0 shrink-0 items-center gap-1.5 rounded-md border px-2 text-[11.5px] font-bold transition-colors",
            open
              ? "border-blue-300 bg-blue-50 text-blue-700"
              : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
          )}
        >
          <ListTree className="size-3.5 shrink-0" aria-hidden />
          {/* 모바일(<sm)은 상단바 우측 컨트롤과 폭을 다투므로 라벨을 접는다.
              `are-tb-label`/`-compact` 는 §3.10.21 E21-4 의 **컨테이너 폭** 훅이다 —
              `sm:` 는 뷰포트 기준이라 넓은 화면의 좁은 임베드(우측 조판 패널)에서는
              장문 라벨이 그대로 남아 트리거가 ~110px 를 먹는다. 클래스 마킹만 더할 뿐
              `data-embed-narrow` 가 없으면 규칙이 하나도 걸리지 않아 렌더는 현행과 동일. */}
          <span className="are-tb-label hidden sm:inline">목차</span>
          <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-px text-[10px] font-semibold tabular-nums text-slate-500">
            {pageCount || 1}
            <span className="are-tb-label hidden sm:inline">페이지</span>
            <span className="are-tb-label-compact sm:hidden">p</span>
          </span>
          {offCount > 0 ? (
            <span className="shrink-0 rounded-full bg-amber-50 px-1.5 py-px text-[10px] font-semibold tabular-nums text-amber-700">
              {offCount}
              <span className="are-tb-label hidden sm:inline">개 꺼짐</span>
            </span>
          ) : null}
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        sideOffset={6}
        // 인쇄 규칙(.no-print 강제 숨김)에 편승 — 편집기 컨텍스트에서 뜨는 레이어는 지면에 나오면 안 된다.
        className="no-print w-[302px] max-w-[calc(100vw-1.5rem)] border-slate-200 p-0"
      >
        <PopoverArrow />
        <div className="border-b border-slate-100 px-3 py-2.5">
          <p className="text-[12px] font-black text-slate-800">목차</p>
          <p className="mt-0.5 text-[10.5px] font-medium leading-relaxed text-slate-500">
            끈 항목은 <span className="font-bold text-slate-600">인쇄물에서 통째로 빠지고</span> 남은 섹션
            번호가 다시 매겨집니다. 제목을 누르면 그 위치로 이동해요.
          </p>
          {hasCompose ? (
            // 「눌렀는데 편집 대상이 안 바뀐다」는 오해를 먼저 끊는다 — 조판 항목 클릭은 의도적으로
            // 스크롤 전용이고, 편집 문서 전환은 표면 헤더의 문서 칩이 담당한다.
            <p className="mt-1 text-[10.5px] font-medium leading-relaxed text-slate-500">
              <span className="font-bold text-slate-600">조판 순서</span>의 항목은 그 위치로{" "}
              <span className="font-bold text-slate-600">이동만</span> 합니다. 편집 대상 문서를 바꾸려면
              위쪽 문서 칩을 누르세요.
            </p>
          ) : null}
        </div>

        {hasCompose ? (
          <div className="border-b border-slate-100">
            <p className="px-3 pb-1 pt-2 text-[10px] font-black uppercase tracking-wider text-slate-400">
              조판 순서
            </p>
            {/* 지문 × 문서 × 문항이라 항목 수가 쉽게 수십 개가 된다 — 팝오버 **폭은 그대로 두고**
                이 블록에만 높이 상한 + 자체 스크롤을 준다. 아래 섹션 축도 조판 중에는 상한을
                낮춰(cn 조건부) 팝오버 전체가 뷰포트를 넘지 않게 한다. */}
            <div className="max-h-[34vh] space-y-1.5 overflow-y-auto px-2 pb-2 [scrollbar-gutter:stable]">
              {composeGroups.map((group) => (
                <div
                  key={group.key}
                  role="group"
                  aria-label={`지문 ${group.passageTitle}`}
                  className="rounded-md border border-slate-200 bg-slate-50/70 p-1.5"
                >
                  <p className="flex items-baseline gap-1.5 px-1 pb-1">
                    <span className="shrink-0 rounded bg-slate-200 px-1 py-px text-[9px] font-black tracking-wide text-slate-600">
                      지문
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[11px] font-bold text-slate-700">
                      {group.passageTitle}
                    </span>
                  </p>
                  <div className="space-y-0.5">
                    {group.entries.map((entry) => (
                      <button
                        key={entry.key}
                        type="button"
                        // ★ 프로브 계약 — 지우면 게이트가 죽는다.
                        //   `.tmp-worksheet-compose/probe-e27.mjs` G3 가
                        //   `[data-compose-outline-entry]` 로 항목을 세고
                        //   `[data-entry-kind="question"]` 로 문항 항목을 고른다.
                        data-compose-outline-entry={entry.key}
                        data-entry-kind={entry.kind}
                        onClick={() => {
                          onJumpCompose?.(entry);
                          setOpen(false);
                        }}
                        // [E28] §3.10.27 R7 — doc 항목의 `sub` 는 **AI 생성 제목**이고
                        // 시각 배지가 아니라 이 툴팁이 그 유일한 노출처다(표면
                        // `sheet-compose-surface.tsx` composeOutline 주석과 짝).
                        // 「강등」이지 「삭제」가 아니어야 하므로 여기서 반드시 실어야 한다.
                        // question 항목은 예전 그대로 — 자구가 한 글자도 안 바뀐다.
                        title={
                          entry.kind === "doc" && entry.sub
                            ? `${entry.label}(으)로 이동 · AI 제목: ${entry.sub}`
                            : `${entry.label}(으)로 이동`
                        }
                        // 키보드 이동 시에도 어느 항목인지 보이게 hover 와 같은 강조를
                        // focus-visible 로 준다(팝오버는 Radix 가 포커스를 가둔다).
                        className="flex w-full min-w-0 items-center gap-1.5 rounded border border-transparent bg-white/80 px-1.5 py-1 text-left transition-colors hover:border-blue-200 hover:bg-blue-50 focus-visible:border-blue-300 focus-visible:bg-blue-50"
                      >
                        {/* 배지에도 같은 data-entry-kind 를 단다 — 게이트가 Playwright
                            `filter({ has: … })` 로 고르는데 그 매칭은 **자손** 기준이라
                            바깥 요소에만 달면 문항 항목을 못 집는다(전체 last() 로 폴백돼
                            판정이 픽스처 순서에 흔들린다). 시각 배지 = 계약 마커. */}
                        {entry.kind === "doc" ? (
                          // 스펙 mock 의 「📄」 자리. 이모지 대신 lucide 를 쓰는 이유는 폭이다 —
                          // 이모지는 플랫폼마다 어드밴스가 달라 9~11px 밀도의 이 트리에서 라벨
                          // 시작선이 항목마다 어긋난다(아이콘은 16px 고정).
                          <span
                            data-entry-kind="doc"
                            className="flex w-4 shrink-0 items-center justify-center text-slate-400"
                          >
                            <FileText className="size-3.5" aria-hidden />
                          </span>
                        ) : (
                          <span
                            data-entry-kind="question"
                            className="min-w-4 shrink-0 rounded-full bg-blue-600 px-1 text-center text-[9px] font-black leading-4 tabular-nums text-white"
                          >
                            {entry.no}
                          </span>
                        )}
                        <span className="min-w-0 flex-1 truncate text-[11.5px] font-semibold text-slate-700">
                          {entry.label}
                        </span>
                        {/* [E28] §3.10.27 R7 — **doc 은 여기서 제외한다.**
                            doc 항목의 1줄(`label`)이 이제 플랜 라벨이고 `sub` 는 AI 제목인데,
                            이 배지는 `shrink-0` 이라 20자가 넘는 AI 제목이 들어오면 302px
                            팝오버에서 라벨과 「편집 중」 배지를 통째로 밀어낸다. AI 제목은
                            위 `title` 툴팁이 담는다.
                            ⚠ 조건을 `entry.sub` 단독으로 되돌리지 마라 — 그 순간 위 붕괴가
                              그대로 재발한다. question 축은 계약상 `sub` 를 가질 수 있어
                              (`compose/outline-types.ts`) 렌더 경로를 남겨 둔다. */}
                        {entry.kind === "question" && entry.sub ? (
                          <span className="shrink-0 rounded bg-slate-100 px-1 py-px text-[9px] font-bold text-slate-500">
                            {entry.sub}
                          </span>
                        ) : null}
                        {entry.kind === "doc" && entry.active ? (
                          <span className="shrink-0 rounded bg-blue-100 px-1 py-px text-[9px] font-black text-blue-700">
                            편집 중
                          </span>
                        ) : null}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div
          className={cn(
            "max-h-[52vh] space-y-1 overflow-y-auto p-2 [scrollbar-gutter:stable]",
            // 조판 중에는 위 트리가 34vh 를 먹으므로 이쪽을 낮춰 팝오버가 화면을 넘지 않게 한다.
            hasCompose && "max-h-[30vh]",
          )}
        >
          {hasCompose && entries.length > 0 ? (
            // E21-2: 이 축은 **활성(편집 중) 문서**의 섹션만이다. 부착 문서 섹션은 여기 안 나온다.
            <p className="px-1 pb-0.5 text-[10px] font-black uppercase tracking-wider text-slate-400">
              섹션{" "}
              <span className="font-bold normal-case tracking-normal text-slate-400">
                · 편집 중 문서
              </span>
            </p>
          ) : null}

          {isEmpty ? (
            <p className="px-1 py-6 text-center text-[11px] font-semibold text-slate-400">
              켜고 끌 섹션이 없습니다.
            </p>
          ) : null}

          {entries.map((entry) => {
            const blocked = !entry.hidden && lockLastSection;
            return (
              <div
                key={entry.key}
                className={cn(
                  "flex items-center gap-2 rounded-md border px-2 py-1.5 transition-colors",
                  entry.hidden
                    ? "border-slate-200 bg-slate-50"
                    : "border-slate-200 bg-white hover:border-blue-200 hover:bg-blue-50/40",
                )}
              >
                <button
                  type="button"
                  disabled={entry.hidden}
                  onClick={() => {
                    onJump(entry.headId);
                    setOpen(false);
                  }}
                  title={entry.hidden ? "꺼진 섹션 — 켜면 이동할 수 있어요" : `${entry.titleKo}(으)로 이동`}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left disabled:cursor-default"
                >
                  <span
                    className={cn(
                      "w-5 shrink-0 text-[11px] font-black tabular-nums",
                      entry.hidden ? "text-slate-300" : "text-blue-600",
                    )}
                  >
                    {entry.no ? String(entry.no).padStart(2, "0") : "—"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        "block truncate text-[12px] font-bold",
                        entry.hidden ? "text-slate-400 line-through" : "text-slate-800",
                      )}
                    >
                      {entry.titleKo}
                    </span>
                    <span
                      className={cn(
                        "block truncate text-[10px] font-medium italic tracking-wide",
                        entry.hidden ? "text-slate-300" : "text-slate-400",
                      )}
                    >
                      {entry.titleEn}
                    </span>
                  </span>
                </button>
                <span className={cn("flex shrink-0", blocked && "cursor-not-allowed opacity-40")}>
                  <ActivityToggleSwitch
                    on={!entry.hidden}
                    title={
                      blocked
                        ? LAST_SECTION_HINT
                        : entry.hidden
                          ? `${entry.titleKo} 켜기`
                          : `${entry.titleKo} 끄기`
                    }
                    onClick={(event) => {
                      event.stopPropagation();
                      if (blocked) return;
                      onToggleSection(entry.key);
                    }}
                  />
                </span>
              </div>
            );
          })}

          {customEntries.length ? (
            <>
              <p className="px-1 pb-0.5 pt-2 text-[10px] font-black uppercase tracking-wider text-slate-400">
                삽입한 블록
              </p>
              {customEntries.map((entry) => (
                <div
                  key={entry.id}
                  className={cn(
                    "flex items-center gap-2 rounded-md border px-2 py-1.5 transition-colors",
                    entry.hidden
                      ? "border-slate-200 bg-slate-50"
                      : "border-slate-200 bg-white hover:border-blue-200 hover:bg-blue-50/40",
                  )}
                >
                  <button
                    type="button"
                    disabled={entry.hidden}
                    onClick={() => {
                      onJump(entry.id);
                      setOpen(false);
                    }}
                    title={entry.hidden ? "꺼진 블록 — 켜면 이동할 수 있어요" : `${entry.label}(으)로 이동`}
                    className={cn(
                      "min-w-0 flex-1 truncate text-left text-[12px] font-bold disabled:cursor-default",
                      entry.hidden ? "text-slate-400 line-through" : "text-slate-800",
                    )}
                  >
                    {entry.label}
                  </button>
                  <ActivityToggleSwitch
                    on={!entry.hidden}
                    title={entry.hidden ? `${entry.label} 켜기` : `${entry.label} 끄기`}
                    onClick={(event) => {
                      event.stopPropagation();
                      onToggleCustom(entry.id);
                    }}
                  />
                </div>
              ))}
            </>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
