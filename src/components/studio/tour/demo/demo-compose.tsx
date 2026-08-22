"use client";

// ============================================================================
// 학습지 조판 데모 (U5) — 합본 · 학습 활동 · 인쇄 3모드 (.tmp-studio-tour/spec.md §3)
//
// ch5-combine / ch5-activity / ch5-print 스텝의 스테이지 데모. 실 화면 미러 원장:
// - 「체크 순서 = 문항 번호」·색 문법(학습지 violet·문항 blue):
//   sheet-compose-surface.tsx pickedQuestions(:294-300) — Map 삽입 순서 = 인쇄 순서.
//   여기서는 배열 삽입 순서로 같은 계약을 미러한다(해제 시 재번호까지 동일).
// - 활동 타일·단어 시험지 모드 자구: demo-data.ts 단일 소스(원 출처는 그 주석 참조).
// - 인쇄 헤더 자구: sheet-compose-surface.tsx 헤더(:921-1035) — PrintMode 주석 참조.
// 서버 액션 0 · 스토어 쓰기 0 — 로컬 useState 만. 자율 애니메이션 0(모든 변화가
// 사용자 조작의 즉시 결과)이라 reduced-motion 은 전환류 motion-reduce 로만 대응.
// ============================================================================

import { useState, type ReactNode } from "react";
import { ArrowLeft, Key, LayoutTemplate, Printer, Save } from "lucide-react";
import { DemoBadge, DemoCheck, DemoFrame, DemoLines, DemoPaper, DemoToggle } from "./demo-stage";
// prettier-ignore
import { DEMO_ACTIVITY_TILES, DEMO_PASSAGE_TITLE, DEMO_QUESTIONS, DEMO_VOCAB_MODES, DEMO_WORDS } from "./demo-data";

/** 난이도 배지 톤 — demo-queue 견본과 동일 매핑(중급 violet · 킬러 rose). */
// 실 팔레트 미러(src/lib/difficulty.ts — 기본 blue · 중급 amber · 킬러 red≈rose).
const DIFF_TONE = { 기본: "blue", 중급: "amber", 킬러: "rose" } as const;

/** 활동 카테고리별 프리뷰 밴드 톤. */
const ACTIVITY_TONE: Record<string, { band: string; text: string }> = {
  "빈칸/복원": { band: "border-blue-100 bg-blue-50/70", text: "text-blue-700" },
  직독직해: { band: "border-emerald-100 bg-emerald-50/70", text: "text-emerald-700" },
  "어순/배열": { band: "border-amber-100 bg-amber-50/80", text: "text-amber-700" },
};

const CAPTIONS: Record<"combine" | "activity" | "print", string> = {
  combine: "예시 화면 — 체크를 붙였다 떼면 묶음이 그 자리에서 변합니다",
  activity: "예시 화면 — 활동을 켜면 학습지 뒤 페이지로 쌓입니다",
  print: "예시 화면 — 완성한 묶음은 이렇게 저장하고 인쇄합니다",
};

/** 미니 페이지 — 묶음 스트립·부채꼴 공용 골격(DemoPaper A4 축소). */
function MiniPage({
  bandClass,
  label,
  labelClass = "text-slate-500",
  seed = 0,
  lines = 6,
  className,
  children,
}: {
  bandClass: string;
  label: string;
  labelClass?: string;
  seed?: number;
  lines?: number;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <DemoPaper size="A4" className={className}>
      <div className={`h-1.5 shrink-0 ${bandClass}`} aria-hidden="true" />
      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-hidden p-1.5">
        <p className={`truncate text-[8px] leading-tight font-bold ${labelClass}`}>{label}</p>
        {children ?? <DemoLines count={lines} seed={seed} />}
      </div>
    </DemoPaper>
  );
}

/** 토글 스위치 시각 — 상태·aria 는 감싼 버튼이 소유한다(시각 전용). */
function DemoSwitch({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`relative inline-block h-4 w-7 shrink-0 rounded-full transition-colors motion-reduce:transition-none ${
        on ? "bg-blue-500" : "bg-slate-300"
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 block h-3 w-3 rounded-full bg-white shadow-sm transition-transform motion-reduce:transition-none ${
          on ? "translate-x-3" : ""
        }`}
      />
    </span>
  );
}

// ── 합본 모드 — 학습지 뒤에 문항 페이지가 붙었다 떨어지는 시연 ────────────────
function CombineMode() {
  const [sheetOn, setSheetOn] = useState(true);
  // 체크 순서 원장 — 실 화면 pickedQuestions Map 의 삽입 순서 미러.
  // 해제 = 배열에서 삭제 → 뒤 문항이 앞 번호로 당겨진다(Map delete 와 동형).
  const [picked, setPicked] = useState<number[]>([]);
  const toggleQuestion = (i: number) =>
    setPicked((prev) => (prev.includes(i) ? prev.filter((v) => v !== i) : [...prev, i]));
  const rows = DEMO_QUESTIONS.slice(0, 3);
  const total = (sheetOn ? 2 : 0) + picked.length;

  return (
    <div className="flex gap-3">
      {/* 좌: 미니 목록 — 학습지 1행 + 문항 3행 */}
      <div className="w-[240px] shrink-0 space-y-1.5">
        <p className="text-[10.5px] font-bold text-slate-400">왼쪽 목록</p>
        <div
          className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2 py-1.5 transition-colors ${
            sheetOn
              ? "border-violet-300 bg-violet-50/50"
              : "border-slate-200 bg-white hover:border-slate-300"
          }`}
          onClick={() => setSheetOn((v) => !v)}
        >
          {/* stopPropagation 래퍼: 행 클릭과 체크 클릭의 이중 토글 방지 */}
          <span className="contents" onClick={(e) => e.stopPropagation()}>
            <DemoCheck
              tone="violet"
              checked={sheetOn}
              onToggle={() => setSheetOn((v) => !v)}
              label="기본 학습지 선택"
            />
          </span>
          <span className="min-w-0 flex-1 truncate text-[11.5px] font-semibold text-slate-700">
            기본 학습지 · {DEMO_PASSAGE_TITLE}
          </span>
          <DemoBadge tone="violet">학습지</DemoBadge>
        </div>
        {rows.map((q, i) => {
          const ord = picked.indexOf(i);
          return (
            <div
              key={q.type}
              className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2 py-1.5 transition-colors ${
                ord >= 0
                  ? "border-blue-300 bg-blue-50/50"
                  : "border-slate-200 bg-white hover:border-slate-300"
              }`}
              onClick={() => toggleQuestion(i)}
            >
              <span className="contents" onClick={(e) => e.stopPropagation()}>
                <DemoCheck
                  tone="blue"
                  checked={ord >= 0}
                  order={ord >= 0 ? ord + 1 : undefined}
                  onToggle={() => toggleQuestion(i)}
                  label={`${q.type} 선택`}
                />
              </span>
              <span className="min-w-0 flex-1 truncate text-[11.5px] font-medium text-slate-600">
                {q.type}
              </span>
              <DemoBadge tone={DIFF_TONE[q.difficulty]}>{q.difficulty}</DemoBadge>
            </div>
          );
        })}
        <p className="px-1 text-[11px] leading-relaxed break-keep text-slate-400">
          문항 번호는 체크한 순서 그대로 매겨집니다.
        </p>
      </div>

      {/* 우: 페이지 스트립 — 체크 즉시 페이지가 붙고 떨어진다 */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10.5px] font-bold text-slate-400">묶음 미리보기</p>
          <span className="shrink-0 text-[11px] font-bold text-blue-700 tabular-nums">
            총 {total}쪽 · A4 한 묶음
          </span>
        </div>
        <div
          data-demo-combine-pages
          data-count={total}
          className="mt-1.5 flex items-start gap-1.5 overflow-x-auto pb-1"
        >
          {sheetOn ? (
            <>
              {/* 색축 정합(적대검수): 학습지 violet · 문항 blue — 좌측 체크 색 문법과 동일 */}
              <MiniPage className="w-[72px] shrink-0" bandClass="bg-violet-200" label="기본 학습지 1 · 원문 분석" seed={1} />
              <MiniPage className="w-[72px] shrink-0" bandClass="bg-violet-200" label="기본 학습지 2 · 어법·어휘" seed={4} />
            </>
          ) : null}
          {picked.map((qi, ord) => (
            <MiniPage key={qi} className="w-[72px] shrink-0" bandClass="bg-blue-200" label={`문항 ${ord + 1} · ${rows[qi].type}`} seed={qi + 7} lines={5} />
          ))}
          {picked.length === 0 ? (
            <div
              className="flex w-[72px] shrink-0 items-center justify-center rounded border border-dashed border-slate-300 bg-slate-50/60 px-1 text-center text-[8.5px] leading-snug font-semibold text-slate-400"
              style={{ aspectRatio: "210 / 297" }}
            >
              문제를 체크해 보세요
            </div>
          ) : null}
        </div>
        <p className="mt-1 text-[11px] leading-relaxed break-keep text-slate-400">
          학습지 뒤에 체크한 문항 페이지가 이어 붙어 그대로 한 묶음으로 인쇄됩니다.
        </p>
      </div>
    </div>
  );
}

// ── 학습 활동 모드 — 단어 시험지 + 활동 타일 6종 토글 시연 ────────────────────
function ActivityMode() {
  const [vocabOn, setVocabOn] = useState(true);
  const [modeIdx, setModeIdx] = useState(0);
  // 켠 순서 원장 — 프리뷰 섹션 적재 순서(끄면 빠지고 순서가 당겨진다).
  const [onTiles, setOnTiles] = useState<string[]>([]);
  const toggleTile = (kind: string) =>
    setOnTiles((prev) => (prev.includes(kind) ? prev.filter((k) => k !== kind) : [...prev, kind]));
  const vocabMode = DEMO_VOCAB_MODES[modeIdx];

  return (
    <div className="space-y-2">
      <div className="flex gap-3">
        <div className="min-w-0 flex-1 space-y-1.5">
          {/* 단어 시험지 고정 카드 — 토글 + 모드 4버튼 */}
          <div className="rounded-lg border border-blue-200 bg-blue-50/40 p-2">
            <button
              type="button"
              aria-pressed={vocabOn}
              className="flex w-full cursor-pointer items-center gap-2"
              onClick={() => setVocabOn((v) => !v)}
            >
              <DemoSwitch on={vocabOn} />
              <span className="text-[12px] font-bold text-slate-700">단어 시험지</span>
              {vocabOn ? (
                <DemoBadge tone="blue">{vocabMode}</DemoBadge>
              ) : (
                <DemoBadge tone="slate">꺼짐</DemoBadge>
              )}
            </button>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {DEMO_VOCAB_MODES.map((m, i) => (
                <DemoToggle
                  key={m}
                  label={m}
                  active={vocabOn && i === modeIdx}
                  testId={`vocab-${m}`}
                  onClick={() => {
                    setModeIdx(i);
                    setVocabOn(true);
                  }}
                />
              ))}
            </div>
          </div>
          {/* 활동 타일 6종 (2열) — data-demo-activity-tile 훅 */}
          <div className="grid grid-cols-2 gap-1.5">
            {DEMO_ACTIVITY_TILES.map((t) => {
              const on = onTiles.includes(t.kind);
              return (
                <button
                  key={t.kind}
                  type="button"
                  data-demo-activity-tile={t.kind}
                  aria-pressed={on}
                  className={`cursor-pointer rounded-lg border p-2 text-left transition-colors ${
                    on
                      ? "border-blue-300 bg-blue-50/50"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                  onClick={() => toggleTile(t.kind)}
                >
                  <span className="flex items-center justify-between gap-1.5">
                    <span className="min-w-0 truncate text-[11.5px] font-bold text-slate-700">
                      {t.labelKo}
                    </span>
                    <DemoSwitch on={on} />
                  </span>
                  <span className="mt-0.5 block truncate text-[10.5px] font-medium text-slate-400">
                    {t.desc}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 우: 미니 프리뷰 — 켠 활동이 섹션 밴드로 쌓인다 */}
        <div className="w-[168px] shrink-0">
          <p className="mb-1.5 text-[10.5px] font-bold text-slate-400">뒤에 붙는 페이지</p>
          <DemoPaper size="A4" className="w-full">
            <div className="h-1.5 shrink-0 bg-slate-200" aria-hidden="true" />
            <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-hidden p-1.5">
              <p className="truncate text-[7.5px] font-bold text-slate-500">
                {DEMO_PASSAGE_TITLE}
              </p>
              {vocabOn ? (
                <div className="rounded-sm border border-blue-100 bg-blue-50/70 p-1">
                  <p className="text-[7.5px] font-bold text-blue-700">단어 시험지 · {vocabMode}</p>
                  {DEMO_WORDS.slice(0, 4).map((w) => (
                    <p key={w.word} className="truncate text-[7px] font-medium text-slate-600">
                      {vocabMode === "단어 쓰기" ? w.meaning : w.word} → ______
                    </p>
                  ))}
                </div>
              ) : null}
              {onTiles.map((kind) => {
                const tile = DEMO_ACTIVITY_TILES.find((t) => t.kind === kind);
                if (!tile) return null;
                const tone = ACTIVITY_TONE[tile.category];
                return (
                  <div key={kind} className={`rounded-sm border p-1 ${tone.band}`}>
                    <p className={`truncate text-[7.5px] font-bold ${tone.text}`}>{tile.labelKo}</p>
                    <DemoLines count={2} seed={kind.length} className="mt-0.5" />
                  </div>
                );
              })}
              {!vocabOn && onTiles.length === 0 ? (
                <p className="m-auto text-center text-[8px] leading-snug font-semibold text-slate-400">
                  왼쪽에서 활동을 켜 보세요
                </p>
              ) : null}
            </div>
          </DemoPaper>
        </div>
      </div>
      {/* 자구 미러: activity-palette-modal.tsx:79-82 — 앞 구절 그대로, 어미만 합니다체. */}
      <p className="text-[11px] leading-relaxed break-keep text-slate-400">
        추출된 지문 데이터로 즉석 생성 · AI 없음 · 무제한 다시 섞기 — 켠 활동은 추가 비용 없이 그
        자리에서 만들어집니다.
      </p>
    </div>
  );
}

// ── 인쇄 모드 — 헤더 버튼 열 + 완성 묶음 부채꼴 ──────────────────────────────
const HEADER_ICON =
  "inline-flex size-7 shrink-0 cursor-default items-center justify-center rounded-md border";

function PrintMode() {
  const circled = "①②③④⑤";
  return (
    <div className="space-y-2.5">
      {/* 헤더 목업 — 자구·구성 미러: sheet-compose-surface.tsx 헤더(:921-1035)
          (돌아가기 · 「학습지 조판」 · aria-label 저장/문항 정답표/인쇄).
          투어 견본이므로 클릭 무동작(시각 전용) — tabIndex -1 로 포커스 흐름에서도 뺀다. */}
      <div className="flex h-10 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2">
        <span className="flex h-7 shrink-0 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-[11.5px] font-semibold text-slate-600">
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          돌아가기
        </span>
        <LayoutTemplate className="size-3.5 shrink-0 text-blue-600" aria-hidden="true" />
        <span className="text-[12px] font-bold tracking-tight text-slate-800">학습지 조판</span>
        <span className="flex-1" aria-hidden="true" />
        <button type="button" tabIndex={-1} aria-label="저장" className={`${HEADER_ICON} border-slate-200 bg-white text-slate-600`}>
          <Save className="size-3.5" aria-hidden="true" />
        </button>
        <button type="button" tabIndex={-1} aria-label="문항 정답표" aria-pressed className={`${HEADER_ICON} border-blue-300 bg-blue-50 text-blue-700`}>
          <Key className="size-3.5" aria-hidden="true" />
        </button>
        <button type="button" tabIndex={-1} aria-label="인쇄" className={`${HEADER_ICON} border-slate-200 bg-white text-slate-600`}>
          <Printer className="size-3.5" aria-hidden="true" />
        </button>
      </div>

      {/* 완성 묶음 부채꼴 — 학습지 2 + 문항 1 + 문항 정답표 1 */}
      <div className="flex items-start justify-center pt-3 pb-1">
        <div className="w-[76px] shrink-0 -rotate-6">
          <MiniPage bandClass="bg-violet-200" label="기본 학습지 1 · 원문 분석" seed={1} />
        </div>
        <div className="-ml-5 w-[76px] shrink-0 translate-y-1 -rotate-2">
          <MiniPage bandClass="bg-violet-200" label="기본 학습지 2 · 어법·어휘" seed={4} />
        </div>
        <div className="-ml-5 w-[76px] shrink-0 translate-y-1 rotate-2">
          <MiniPage
            bandClass="bg-blue-200"
            label={`문항 1 · ${DEMO_QUESTIONS[0].type}`}
            seed={7}
            lines={5}
          />
        </div>
        <div className="-ml-5 w-[76px] shrink-0 rotate-6">
          <MiniPage bandClass="bg-emerald-200" label="문항 정답표" labelClass="text-emerald-700">
            {DEMO_QUESTIONS.slice(0, 3).map((q, i) => (
              <p key={q.type} className="truncate text-[7px] font-semibold text-slate-600">
                {i + 1}. {circled[q.answer - 1]}{" "}
                <span className="font-medium text-slate-400">{q.type}</span>
              </p>
            ))}
          </MiniPage>
        </div>
      </div>

      <p className="text-[11px] leading-relaxed break-keep text-slate-400">
        저장해 두면 「학습지 조판」 목록에서 언제든 이 묶음을 다시 열 수 있습니다.
      </p>
    </div>
  );
}

export function DemoCompose({ mode }: { mode: "combine" | "activity" | "print" }) {
  return (
    <DemoFrame caption={CAPTIONS[mode]}>
      {mode === "combine" ? <CombineMode /> : null}
      {mode === "activity" ? <ActivityMode /> : null}
      {mode === "print" ? <PrintMode /> : null}
    </DemoFrame>
  );
}
