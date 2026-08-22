"use client";

// ============================================================================
// 실전 문제 생성 데모 (U4) — .tmp-studio-tour/spec.md §3
//
// mode="types"  : 유형 그룹 카드 3개(스테퍼 타일 2열) + 난이도 세그먼트 +
//                 합계 스트립(초기화) + 하단 CTA 목업. 스테퍼·토글 전부 실동작.
// mode="results": DEMO_QUESTIONS 앞 2문 문제 카드(선지 5개·정답 강조·해설 접기).
//
// 실 화면 자구 미러 원장(자구 드리프트 금지):
// - 「총 {N}문제 · {M}개 유형」·「초기화」·「+ 를 눌러 문제 수를 더하세요.」
//   : generation-config-panel.tsx(:876-899)
// - 「유형을 선택하세요」 / 「다음으로 ({N}문제생성)」
//   : workspace/passage-generate-modal.tsx(:297,309)
// - 유형 그룹·라벨: demo-data DEMO_TYPE_GROUPS(출처 constants.ts)
//
// 초기 프리셋은 demo-queue(questions-running)의 「객관식 4문항 · 서술형 2문항 ·
// 중급」과 일치시켜 CH4 흐름(유형→큐→결과)이 한 이야기로 이어지게 한다.
// 순수 목업: 서버 액션 0 · 스토어 쓰기 0 — 로컬 useState 만.
// ============================================================================

import { useState } from "react";
import { ChevronDown, Cpu, FileText, Minus, Plus, Target } from "lucide-react";
import { DemoBadge, DemoFrame, DemoToggle } from "./demo-stage";
import {
  DEMO_PASSAGE_TITLE,
  DEMO_QUESTIONS,
  DEMO_TYPE_GROUPS,
  type DemoQuestion,
} from "./demo-data";

const MAX_PER_TYPE = 5;

type Difficulty = "기본" | "중급" | "킬러";

const DIFFICULTIES: readonly Difficulty[] = ["기본", "중급", "킬러"];

/**
 * 난이도 → 배지 톤 — 실 팔레트 미러(src/lib/difficulty.ts — 전 표면 통일:
 * 기본 blue · 중급 amber · 킬러 red≈rose). 적대검수 확정: violet/rose 는
 * 실 화면과 정반대 문법이었다.
 */
const DIFFICULTY_TONE: Record<Difficulty, "blue" | "amber" | "rose"> = {
  기본: "blue",
  중급: "amber",
  킬러: "rose",
};

/**
 * CH4 서사 프리셋(적대검수 정합): 객관식 4문항(어법·빈칸·제목·주제 각 1) +
 * 서술형 2문항 = 총 6. 큐 데모(객관식 4 + 서술형 2)·결과 데모·시험지 데모
 * (DEMO_QUESTIONS 4유형 전부 등장)와 수치·유형이 한 이야기로 이어진다.
 */
const INITIAL_COUNTS: Record<string, number> = {
  grammar: 1,
  blank: 1,
  title: 1,
  topic: 1,
  "essay-order": 2,
};

// ── 유형 타일 (스테퍼) ──────────────────────────────────────────────────────

function TypeTile({
  label,
  count,
  onAdd,
  onSub,
}: {
  label: string;
  count: number;
  onAdd: () => void;
  onSub: () => void;
}) {
  const active = count > 0;
  const stepBtn =
    "flex h-6 w-6 shrink-0 items-center justify-center rounded-md border transition-colors disabled:cursor-default disabled:opacity-35";
  return (
    <div
      className={`flex items-center justify-between gap-1.5 rounded-lg border px-2 py-1.5 transition-colors ${
        active ? "border-blue-500 bg-blue-50/50" : "border-slate-200 bg-white"
      }`}
    >
      <span
        className={`min-w-0 truncate text-[11.5px] ${
          active ? "font-bold text-blue-700" : "font-semibold text-slate-600"
        }`}
      >
        {label}
      </span>
      <div className="flex shrink-0 items-center gap-0.5">
        <button
          type="button"
          aria-label={`${label} 문항 빼기`}
          disabled={count === 0}
          className={`${stepBtn} border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-700`}
          onClick={onSub}
        >
          <Minus className="h-3 w-3" aria-hidden="true" />
        </button>
        <span
          className={`w-5 text-center text-[12px] font-bold tabular-nums ${
            active ? "text-blue-700" : "text-slate-400"
          }`}
        >
          {count}
        </span>
        <button
          type="button"
          data-demo-type-add
          aria-label={`${label} 문항 더하기`}
          disabled={count === MAX_PER_TYPE}
          className={`${stepBtn} ${
            active
              ? "border-blue-300 bg-blue-50 text-blue-600 hover:border-blue-400"
              : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-700"
          }`}
          onClick={onAdd}
        >
          <Plus className="h-3 w-3" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

// ── mode="types" — 유형 선택 ────────────────────────────────────────────────

function TypesMode() {
  const [counts, setCounts] = useState<Record<string, number>>(INITIAL_COUNTS);
  const [difficulty, setDifficulty] = useState<Difficulty>("중급");

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const typeCount = Object.values(counts).filter((n) => n > 0).length;

  const add = (id: string) =>
    setCounts((c) => ({ ...c, [id]: Math.min(MAX_PER_TYPE, (c[id] ?? 0) + 1) }));
  const sub = (id: string) =>
    setCounts((c) => ({ ...c, [id]: Math.max(0, (c[id] ?? 0) - 1) }));

  return (
    <DemoFrame caption="예시 화면 — 직접 눌러 보며 문항 수를 정해 보세요">
      <div className="space-y-2">
        {/* 합계 스트립 — 자구 미러: generation-config-panel.tsx:876-899 */}
        <div
          data-demo-qtotal
          className="flex h-9 items-center justify-between rounded-lg border border-slate-200 bg-slate-50 pl-3 pr-1.5"
        >
          <span className="text-[12px] font-semibold text-slate-700">
            총 <strong className="font-bold text-slate-900">{total}</strong>문제
            <span className="ml-1 font-medium text-slate-500">
              · {typeCount}개 유형
            </span>
          </span>
          {total > 0 ? (
            <button
              type="button"
              className="h-6 rounded-md px-2 text-[11px] font-semibold text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
              onClick={() => setCounts({})}
            >
              초기화
            </button>
          ) : (
            <span className="pr-1.5 text-[11px] font-semibold text-blue-600">
              + 를 눌러 문제 수를 더하세요.
            </span>
          )}
        </div>

        {/* 유형 그룹 카드 — 그룹 자구: DEMO_TYPE_GROUPS(constants.ts) */}
        {DEMO_TYPE_GROUPS.map((g) => {
          const groupTotal = g.types.reduce(
            (a, t) => a + (counts[t.id] ?? 0),
            0,
          );
          return (
            <div
              key={g.group}
              className="rounded-xl border border-slate-200 bg-white p-2.5"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-[11.5px] font-bold text-slate-700">
                  {g.group}
                </span>
                <DemoBadge tone={groupTotal > 0 ? "blue" : "slate"}>
                  선택 {groupTotal}
                </DemoBadge>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                {g.types.map((t) => (
                  <TypeTile
                    key={t.id}
                    label={t.label}
                    count={counts[t.id] ?? 0}
                    onAdd={() => add(t.id)}
                    onSub={() => sub(t.id)}
                  />
                ))}
              </div>
            </div>
          );
        })}

        {/* 난이도 — 전역 세그먼트 1개 */}
        <div className="rounded-xl border border-slate-200 bg-white p-2.5">
          <div className="flex items-center gap-2">
            <span className="shrink-0 text-[11.5px] font-bold text-slate-700">
              난이도
            </span>
            <div className="flex gap-1">
              {DIFFICULTIES.map((d) => (
                <DemoToggle
                  key={d}
                  active={difficulty === d}
                  label={d}
                  testId={`difficulty-${d}`}
                  onClick={() => setDifficulty(d)}
                />
              ))}
            </div>
          </div>
          {difficulty === "킬러" ? (
            <p className="mt-1.5 text-[11px] font-semibold leading-relaxed text-rose-600 break-keep">
              킬러는 오답 매력도가 높은 최고 난도입니다
            </p>
          ) : null}
        </div>

        {/* 하단 CTA 목업 — 자구 미러: passage-generate-modal.tsx:297,309 */}
        {total > 0 ? (
          <div className="flex h-10 items-center justify-center gap-1.5 rounded-xl bg-blue-600 text-[12.5px] font-bold text-white shadow-sm">
            <Cpu className="h-4 w-4" aria-hidden="true" />
            <span>다음으로 ({total}문제생성)</span>
          </div>
        ) : (
          <div className="flex h-10 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-100 text-[12.5px] font-bold text-slate-400">
            <Target className="h-4 w-4" aria-hidden="true" />
            <span>유형을 선택하세요</span>
          </div>
        )}
      </div>
    </DemoFrame>
  );
}

// ── mode="results" — 생성 결과 ──────────────────────────────────────────────

function QuestionCard({ q, index }: { q: DemoQuestion; index: number }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <DemoBadge tone="blue">{q.type}</DemoBadge>
        <DemoBadge tone={DIFFICULTY_TONE[q.difficulty]}>{q.difficulty}</DemoBadge>
        <DemoBadge tone="emerald">정답 {q.answer}</DemoBadge>
      </div>
      <p className="mt-2 text-[12.5px] font-bold leading-snug text-slate-800 break-keep">
        {index}. {q.stem}
      </p>
      <div className="mt-2 space-y-1">
        {q.choices.map((choice, i) => (
          <p
            key={choice}
            className={`rounded-md px-2 py-1 text-[12px] leading-relaxed ${
              i + 1 === q.answer
                ? "bg-emerald-50 font-semibold text-emerald-700"
                : "text-slate-600"
            }`}
          >
            {choice}
          </p>
        ))}
      </div>
      <button
        type="button"
        aria-expanded={open}
        className="mt-2 inline-flex h-7 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 text-[11.5px] font-semibold text-slate-500 transition-colors hover:border-slate-300 hover:text-slate-700"
        onClick={() => setOpen((v) => !v)}
      >
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
        해설
      </button>
      {open ? (
        <p className="mt-1.5 rounded-lg bg-slate-50 px-2.5 py-2 text-[11.5px] leading-relaxed text-slate-600 break-keep">
          {q.explanation}
        </p>
      ) : null}
    </div>
  );
}

function ResultsMode() {
  return (
    <DemoFrame caption="예시 화면 — 완성된 문제는 이런 모습입니다">
      <div className="space-y-2">
        {/* 지문 카드 헤더 미러 — 문제는 지문마다 정리된다(demo-queue 와 동일 골격) */}
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2">
          <FileText className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          <span className="min-w-0 truncate text-[12px] font-bold text-slate-800">
            {DEMO_PASSAGE_TITLE}
          </span>
          {/* CH4 프리셋(총 6문제)과 수치 정합 — 카드는 그중 2문제 예시만. */}
          <DemoBadge tone="blue">문제 6</DemoBadge>
          <span className="ml-auto shrink-0 text-[10.5px] font-medium text-slate-400">
            아래는 그중 2문제 예시입니다
          </span>
        </div>

        {DEMO_QUESTIONS.slice(0, 2).map((q, i) => (
          <QuestionCard key={q.type} q={q} index={i + 1} />
        ))}

        <p className="px-1 text-[11px] leading-relaxed text-slate-400 break-keep">
          생성된 문제는 조판 재료 목록에 모입니다 — 학습지 뒤에 붙일 수도 있고,
          시험지로 짤 수도 있습니다. 이어서 조판을 보여 드리겠습니다.
        </p>
      </div>
    </DemoFrame>
  );
}

export function DemoQuestionGen({ mode }: { mode: "types" | "results" }) {
  return mode === "types" ? <TypesMode /> : <ResultsMode />;
}
