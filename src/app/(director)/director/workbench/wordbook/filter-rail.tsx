"use client";

// ============================================================================
// 단어장 생성 스튜디오 — 렌즈·필터 레일
//
// 렌즈는 "저장된 시작점"(클릭 = 필터·정렬 통째 교체)이고, 그 아래 필터는
// 현 상태 위 부분 패치다 — 그래서 onLens / onFilter 를 분리해 받는다.
// 데스크톱은 좌측 고정 열, md 미만에서는 오버레이 패널로 동일 내용을 띄운다
// (내용을 RailBody 하나로 묶어 두 표면이 절대 어긋나지 않게 한다).
// 의미 이동 렌즈는 서버 발굴 결과가 고정이라 필터 섹션 전체를 잠근다.
// ============================================================================

import { Check, RotateCcw, X } from "lucide-react";
import { VOCAB_POS_LABELS, VOCAB_TIER_LABELS } from "@/lib/vocab-drill/display";
import { SectionTitle } from "./wordbook-ui";
import {
  WORDBOOK_LENSES,
  type WordbookBoard,
  type WordbookFilter,
  type WordbookLens,
} from "./wordbook-types";

interface FilterRailProps {
  lens: WordbookLens;
  onLens: (lens: WordbookLens) => void;
  filter: WordbookFilter;
  onFilter: (patch: Partial<WordbookFilter>) => void;
  /** 의미 이동 렌즈일 때 true — 필터 섹션 비활성 */
  disabled: boolean;
  mobileOpen: boolean;
  onMobileClose: () => void;
  /** 데스크톱 열 폭(px) — 셸의 리사이저블 패널이 관장. 0 = 접힘(열 미렌더) */
  desktopWidth?: number;
}

/** 추세 필터 선택지 — 적재기 trendLabel 8종 전체(wordbook-ui TREND_CHIP 과 동일 어휘). */
const TREND_OPTIONS = [
  "급증",
  "증가",
  "안정",
  "감소",
  "급감",
  "신규 등장",
  "중간기만 등장",
  "미등장",
] as const;

const GRADE_OPTIONS = ["고1", "고2", "고3"] as const;

/** 시행처는 단일 선택(라디오) — null 이 「없음」(board 필터 해제)을 뜻한다. */
const BOARD_OPTIONS: { label: string; value: WordbookBoard | null }[] = [
  { label: "전체", value: null },
  { label: "수능", value: "수능" },
  { label: "모평", value: "모평" },
  { label: "학평", value: "학평" },
];

/** 멀티토글 공통 규칙 — 빈 배열은 undefined 로 돌려 "필터 없음"과 동치로 만든다. */
function toggleIn<T>(list: T[] | undefined, v: T): T[] | undefined {
  const cur = list ?? [];
  const next = cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v];
  return next.length ? next : undefined;
}

/** 활성 필터 개수 — 그룹 단위 카운트. minTrapRate 는 레일 밖(렌즈 전용)이지만
 *  실제로 질의를 좁히고 있으므로 뱃지에는 정직하게 포함한다. */
function countActive(f: WordbookFilter): number {
  let n = 0;
  if (f.posList?.length) n++;
  if (f.tiers?.length) n++;
  if (f.difficulties?.length) n++;
  if (f.grades?.length) n++;
  if (f.trendLabels?.length) n++;
  if (f.board) n++;
  if (f.excludeStopwords) n++;
  if (f.excludePhrase) n++;
  if (f.allSenses) n++;
  if (typeof f.minTrapRate === "number" && f.minTrapRate > 0) n++;
  return n;
}

// ── 로컬 부품 ────────────────────────────────────────────────────────────────

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex h-6 items-center rounded border px-1.5 text-[11px] font-medium whitespace-nowrap transition-colors ${
        active
          ? "border-slate-900 bg-slate-900 text-white"
          : "border-slate-200 text-slate-500 hover:border-slate-300"
      }`}
    >
      {children}
    </button>
  );
}

/** 체크박스 스타일 스위치 행 — 라벨 포함 행 전체가 클릭 영역. */
function ToggleRow({
  checked,
  onToggle,
  label,
}: {
  checked: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={checked}
      className="flex w-full items-center gap-2 rounded py-1.5 text-left hover:bg-slate-50"
    >
      <span
        className={`inline-flex size-3.5 shrink-0 items-center justify-center rounded border transition-colors ${
          checked ? "border-blue-600 bg-blue-600" : "border-slate-300 bg-white"
        }`}
      >
        {checked ? <Check className="size-2.5 text-white" strokeWidth={3} /> : null}
      </span>
      <span className="text-[12px] text-slate-600">{label}</span>
    </button>
  );
}

// ── 본체(데스크톱·모바일 공용) ───────────────────────────────────────────────

function RailBody({
  lens,
  onLens,
  filter,
  onFilter,
  disabled,
}: Pick<
  FilterRailProps,
  "lens" | "onLens" | "filter" | "onFilter" | "disabled"
>) {
  const activeCount = countActive(filter);

  return (
    <div className="pb-6">
      {/* ── ① 렌즈 ── */}
      <div className="px-3 pt-3">
        <SectionTitle>추천 보기</SectionTitle>
      </div>
      <nav>
        {WORDBOOK_LENSES.map((def) => {
          const active = lens === def.key;
          return (
            <button
              key={def.key}
              type="button"
              onClick={() => onLens(def.key)}
              aria-current={active ? "true" : undefined}
              className={`relative w-full px-3 py-2 text-left transition-colors ${
                active ? "bg-blue-50" : "hover:bg-slate-50"
              }`}
            >
              {/* 인디케이터는 절대요소 — border-l 방식은 본문이 2px 밀려 끝선이 어긋난다 */}
              {active ? (
                <span className="absolute inset-y-1 left-0 w-[2px] rounded-r bg-blue-600" />
              ) : null}
              <span
                className={`block text-[12.5px] font-semibold ${
                  active ? "text-blue-700" : "text-slate-700"
                }`}
              >
                {def.label}
              </span>
              <span className="mt-0.5 block break-keep text-[10.5px] leading-snug text-slate-400">
                {def.desc}
              </span>
            </button>
          );
        })}
      </nav>

      {/* ── ② 필터 ── */}
      <div className="mt-3 border-t border-slate-200 px-3 pt-3">
        <SectionTitle>
          조건
          {activeCount > 0 ? (
            <span className="ml-1.5 inline-flex size-4 items-center justify-center rounded-full bg-blue-600 align-text-bottom text-[9.5px] font-bold tabular-nums text-white">
              {activeCount}
            </span>
          ) : null}
        </SectionTitle>

        {disabled ? (
          <p className="mb-2 break-keep text-[10.5px] leading-snug text-slate-400">
            이 보기는 찾아낸 결과라 조건을 바꿀 수 없습니다.
          </p>
        ) : null}

        <div
          className={`space-y-4 ${disabled ? "pointer-events-none opacity-40" : ""}`}
          aria-disabled={disabled}
        >
          {/* 품사 */}
          <div>
            <SectionTitle>품사</SectionTitle>
            <div className="flex flex-wrap gap-1">
              {Object.entries(VOCAB_POS_LABELS).map(([pos, label]) => (
                <Chip
                  key={pos}
                  active={!!filter.posList?.includes(pos)}
                  onClick={() =>
                    onFilter({ posList: toggleIn(filter.posList, pos) })
                  }
                >
                  {label}
                </Chip>
              ))}
            </div>
          </div>

          {/* 티어 */}
          <div>
            <SectionTitle>수준</SectionTitle>
            <div className="flex flex-wrap gap-1">
              {Object.entries(VOCAB_TIER_LABELS).map(([tier, label]) => (
                <Chip
                  key={tier}
                  active={!!filter.tiers?.includes(tier)}
                  onClick={() => onFilter({ tiers: toggleIn(filter.tiers, tier) })}
                >
                  {label}
                </Chip>
              ))}
            </div>
          </div>

          {/* 난이도 */}
          <div>
            <SectionTitle>난이도</SectionTitle>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((d) => {
                const active = !!filter.difficulties?.includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() =>
                      onFilter({
                        difficulties: toggleIn(filter.difficulties, d),
                      })
                    }
                    aria-pressed={active}
                    className={`size-7 rounded border text-[11px] font-medium tabular-nums transition-colors ${
                      active
                        ? "border-slate-900 bg-slate-900 text-white"
                        : "border-slate-200 text-slate-500 hover:border-slate-300"
                    }`}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 주 출현 학년 */}
          <div>
            <SectionTitle>주로 나온 학년</SectionTitle>
            <div className="flex flex-wrap gap-1">
              {GRADE_OPTIONS.map((g) => (
                <Chip
                  key={g}
                  active={!!filter.grades?.includes(g)}
                  onClick={() => onFilter({ grades: toggleIn(filter.grades, g) })}
                >
                  {g}
                </Chip>
              ))}
            </div>
          </div>

          {/* 추세 */}
          <div>
            <SectionTitle>추세</SectionTitle>
            <div className="flex flex-wrap gap-1">
              {TREND_OPTIONS.map((t) => (
                <Chip
                  key={t}
                  active={!!filter.trendLabels?.includes(t)}
                  onClick={() =>
                    onFilter({ trendLabels: toggleIn(filter.trendLabels, t) })
                  }
                >
                  {t}
                </Chip>
              ))}
            </div>
          </div>

          {/* 시행처 — 단일 선택(없음 = 해제) */}
          <div>
            <SectionTitle>시험 종류</SectionTitle>
            <div className="flex flex-wrap gap-1" role="radiogroup">
              {BOARD_OPTIONS.map((o) => (
                <Chip
                  key={o.label}
                  active={(filter.board ?? null) === o.value}
                  onClick={() => onFilter({ board: o.value ?? undefined })}
                >
                  {o.label}
                </Chip>
              ))}
            </div>
          </div>

          {/* 스위치 — 켜짐=true, 꺼짐=undefined(필터 해제와 동치) */}
          <div>
            <ToggleRow
              checked={!!filter.excludeStopwords}
              onToggle={() =>
                onFilter({
                  excludeStopwords: filter.excludeStopwords ? undefined : true,
                })
              }
              label="the·of 같은 기본 단어 빼기"
            />
            <ToggleRow
              checked={!!filter.excludePhrase}
              onToggle={() =>
                onFilter({
                  excludePhrase: filter.excludePhrase ? undefined : true,
                })
              }
              label="숙어·구동사 빼기"
            />
            <ToggleRow
              checked={!!filter.allSenses}
              onToggle={() =>
                onFilter({ allSenses: filter.allSenses ? undefined : true })
              }
              label="한 단어의 모든 뜻 보기"
            />
          </div>

          {/* 초기화 — minTrapRate(렌즈 전용)까지 함께 비워 완전한 백지로 만든다 */}
          <button
            type="button"
            onClick={() =>
              onFilter({
                posList: undefined,
                tiers: undefined,
                difficulties: undefined,
                grades: undefined,
                trendLabels: undefined,
                board: undefined,
                excludeStopwords: undefined,
                excludePhrase: undefined,
                allSenses: undefined,
                minTrapRate: undefined,
              })
            }
            className="inline-flex items-center gap-1 text-[11.5px] font-medium text-slate-400 transition-colors hover:text-slate-600"
          >
            <RotateCcw className="size-3" />
            조건 모두 지우기
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 컨테이너(반응형 두 표면) ─────────────────────────────────────────────────

export function FilterRail({
  lens,
  onLens,
  filter,
  onFilter,
  disabled,
  mobileOpen,
  onMobileClose,
  desktopWidth,
}: FilterRailProps) {
  const body = (
    <RailBody
      lens={lens}
      onLens={onLens}
      filter={filter}
      onFilter={onFilter}
      disabled={disabled}
    />
  );

  return (
    <>
      {/* 데스크톱 — 좌측 열, 독립 스크롤. 폭은 셸의 핸들이 조절(0=접힘).
          pl-2 — 창 끝에 텍스트가 딱 붙지 않게 숨 여백(유저 피드백 2026-08-05). */}
      {desktopWidth !== 0 ? (
        <aside
          className="hidden shrink-0 overflow-y-auto border-r border-slate-200 pl-2 md:block"
          style={{ width: desktopWidth ?? 216 }}
        >
          {body}
        </aside>
      ) : null}

      {/* 모바일 — 백드롭 + 좌측 패널 오버레이 */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            aria-label="조건 닫기"
            onClick={onMobileClose}
            className="absolute inset-0 bg-slate-900/25"
          />
          <div className="relative h-full w-[264px] overflow-y-auto bg-white shadow-xl">
            <div className="sticky top-0 z-10 flex h-10 items-center justify-between border-b border-slate-200 bg-white px-3">
              <span className="text-[12.5px] font-bold text-slate-700">
                추천 보기 · 조건
              </span>
              <button
                type="button"
                onClick={onMobileClose}
                aria-label="닫기"
                className="flex size-7 items-center justify-center rounded text-slate-400 hover:bg-slate-50 hover:text-slate-600"
              >
                <X className="size-4" />
              </button>
            </div>
            {body}
          </div>
        </div>
      ) : null}
    </>
  );
}
