"use client";

import { useMemo, useState } from "react";
import type { ForecastPackView, ForecastQuestionSummary } from "@/lib/exam-forecast/queries";
import type { ForecastPassage, ForecastSet } from "@/lib/exam-forecast/types";
import type { ForecastAnalysis, ForecastRangeInfo } from "@/lib/exam-forecast/analysis-types";
import { FC, serif } from "./theme";
import { useForecastSelection } from "./use-forecast-selection";
import { SelectionTray } from "./selection-tray";
import { OverviewTab } from "./overview-tab";
import { TrendTab } from "./trend-tab";
import { PassagesTab } from "./passages-tab";
import { BankTab } from "./bank-tab";
import { SetsTab } from "./sets-tab";
import { ReferenceTab } from "./reference-tab";
import { FidelityTab } from "./fidelity-tab";

export interface DashboardData {
  pack: ForecastPackView;
  passages: ForecastPassage[];
  sets: ForecastSet[];
  questions: ForecastQuestionSummary[];
}

const TABS = [
  { key: "overview", label: "개요·범위" },
  { key: "trend", label: "출제 경향 해부" },
  { key: "passages", label: "지문별 예측" },
  { key: "bank", label: "문항 은행" },
  { key: "sets", label: "봉투 모의고사" },
  { key: "fidelity", label: "동형 대조" },
  { key: "reference", label: "기출 원본" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export function ForecastDashboard(data: DashboardData) {
  const { pack, passages, sets, questions } = data;
  const [tab, setTab] = useState<TabKey>("overview");
  const [focusPassage, setFocusPassage] = useState<string | null>(null);
  const selection = useForecastSelection(pack.slug, questions);
  const analysis = pack.analysis as ForecastAnalysis;
  const rangeInfo = pack.rangeInfo as ForecastRangeInfo;

  const rangePassages = useMemo(() => passages.filter((p) => p.sourceGroup !== "기출"), [passages]);
  const forecastCount = useMemo(() => questions.filter((q) => q.role === "forecast").length, [questions]);

  const openPassage = (code: string) => {
    setFocusPassage(code);
    setTab("passages");
  };

  return (
    <div className="min-h-full pb-28" style={{ background: FC.paper, color: FC.ink }}>
      <header className="border-b" style={{ borderColor: FC.rule, background: FC.card }}>
        <div className="mx-auto max-w-[1400px] px-6 pt-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-[11px] font-bold tracking-[0.22em]" style={{ color: FC.red }}>
                EXAM FORECAST · {pack.schoolName}
              </p>
              <h1 className={`${serif} mt-1 text-[28px] font-extrabold leading-tight`}>{pack.title}</h1>
              {pack.subtitle ? <p className="mt-1 text-[13px]" style={{ color: FC.sub }}>{pack.subtitle}</p> : null}
            </div>
            <dl className="flex gap-6 text-right">
              <Kpi label="범위 지문" value={rangePassages.length} />
              <Kpi label="예측 문항" value={forecastCount} />
              <Kpi label="봉투 모의고사" value={sets.length} suffix="회" />
              <Kpi label="해부한 기출" value={questions.filter((q) => q.role === "reference").length} suffix="문항" />
            </dl>
          </div>
          <nav className="mt-5 flex gap-1 overflow-x-auto" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={tab === t.key}
                onClick={() => setTab(t.key)}
                className="relative shrink-0 px-4 pb-3 pt-2 text-[14px] font-semibold transition"
                style={{ color: tab === t.key ? FC.ink : FC.sub }}
              >
                {t.label}
                {tab === t.key ? <span className="absolute inset-x-3 bottom-0 h-[3px] rounded-t" style={{ background: FC.red }} /> : null}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-6 py-8">
        {tab === "overview" ? (
          <OverviewTab pack={pack} analysis={analysis} rangeInfo={rangeInfo} passages={rangePassages} questions={questions} sets={sets} onOpenPassage={openPassage} onGo={(k) => setTab(k as TabKey)} />
        ) : null}
        {tab === "trend" ? <TrendTab analysis={analysis} /> : null}
        {tab === "passages" ? (
          <PassagesTab slug={pack.slug} passages={rangePassages} questions={questions} selection={selection} focus={focusPassage} onFocus={setFocusPassage} />
        ) : null}
        {tab === "bank" ? <BankTab slug={pack.slug} passages={rangePassages} questions={questions} sets={sets} selection={selection} /> : null}
        {tab === "sets" ? <SetsTab slug={pack.slug} sets={sets} questions={questions} passages={passages} pdfFiles={Array.isArray(pack.examMeta.pdfFiles) ? (pack.examMeta.pdfFiles as string[]) : []} /> : null}
        {tab === "fidelity" ? <FidelityTab slug={pack.slug} fidelity={analysis.fidelity} sets={sets} pdfFiles={Array.isArray(pack.examMeta.pdfFiles) ? (pack.examMeta.pdfFiles as string[]) : []} /> : null}
        {tab === "reference" ? <ReferenceTab slug={pack.slug} analysis={analysis} passages={passages} questions={questions} /> : null}
      </main>

      <SelectionTray slug={pack.slug} selection={selection} />
    </div>
  );
}

function Kpi({ label, value, suffix }: { label: string; value: number; suffix?: string }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold" style={{ color: FC.sub }}>{label}</dt>
      <dd className={`${serif} text-[26px] font-extrabold leading-none`}>
        {value}
        {suffix ? <span className="ml-0.5 text-[13px] font-bold">{suffix}</span> : null}
      </dd>
    </div>
  );
}
