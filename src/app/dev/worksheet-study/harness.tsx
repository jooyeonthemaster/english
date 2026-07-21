"use client";

// ============================================================================
// 학습지 스터디 모드 — dev 렌더 하네스 (무인증, 픽스처 기반)
//
// 픽스처(RECALL_RECOGNITION_FIXTURE)를 클라이언트에서 그대로 컴파일해
// 플레이어를 렌더한다(컴파일러는 플레인 모듈이라 브라우저에서 동작).
// Playwright 뷰포트 검수·행동 테스트의 계기판. 운영 데이터 아님.
// ============================================================================

import { useMemo } from "react";
import Link from "next/link";
import { compileStudyPlan } from "@/lib/worksheet-study/compile";
import type { StudyMode } from "@/lib/worksheet-study/types";
import { StudyPlayerClient } from "@/components/worksheet-study/player-client";
import { WorksheetStudyHub, type HubStageRow } from "@/app/g/w/[taskId]/hub-client";
import {
  WorksheetStudyReport,
  type ReportSentence,
  type ReportStageRow,
} from "@/app/g/w/[taskId]/report/report-client";
import { StudentVocabClient, type StudentVocabData } from "@/app/g/vocab/vocab-client";
import { DEV_STUDY_FIXTURE } from "./dev-fixture";

const MODES: Exclude<StudyMode, "off">[] = ["light", "standard", "intense"];

export function WorksheetStudyHarness({
  view,
  stage,
  mode,
}: {
  view: string;
  stage: string;
  mode: string;
}) {
  const activeMode = (MODES as string[]).includes(mode) ? (mode as Exclude<StudyMode, "off">) : "standard";
  const plan = useMemo(
    () =>
      compileStudyPlan({
        report: DEV_STUDY_FIXTURE,
        mode: activeMode,
        taskId: "dev-harness-task",
        reportTitle: "기억의 두 얼굴 : 회상 vs. 재인",
      }),
    [activeMode],
  );

  const activeStage = plan.stages.find((s) => s.id === stage) ?? null;

  if ((view === "player" || view === "") && activeStage) {
    return (
      <StudyPlayerClient
        taskId="dev-harness-task"
        stage={activeStage}
        planHash={plan.planHash}
        backHref={`/dev/worksheet-study?mode=${activeMode}`}
        nextStageHref={null}
        harness
      />
    );
  }

  // ── 학생 누적 취약 단어장 — 목업 데이터로 렌더 ─────────────────────────────
  if (view === "vocab") {
    const now = 1_752_900_000_000; // 고정 타임스탬프(하네스 결정론)
    const day = 86_400_000;
    const vocabData: StudentVocabData = {
      totalWrongWords: 5,
      newThisWeek: 2,
      recoveredCount: 1,
      entries: [
        {
          word: "reconstruct",
          meaning: "재구성하다, 복원하다",
          wrongCount: 3,
          totalCount: 4,
          lastWrongAt: new Date(now).toISOString(),
          recovered: false,
          history: [
            { worksheetTitle: "기억의 두 얼굴 : 회상 vs. 재인", at: new Date(now).toISOString(), correct: false, response: "reconstuct", attempt: 1 },
            { worksheetTitle: "빨간색의 독점적 지위", at: new Date(now - 2 * day).toISOString(), correct: false, response: "reconstract", attempt: 1 },
            { worksheetTitle: "기억의 두 얼굴 : 회상 vs. 재인", at: new Date(now - 5 * day).toISOString(), correct: true, response: "reconstruct", attempt: 2 },
          ],
        },
        {
          word: "retrieval",
          meaning: "인출, 회수",
          wrongCount: 2,
          totalCount: 3,
          lastWrongAt: new Date(now - 1 * day).toISOString(),
          recovered: false,
          history: [
            { worksheetTitle: "기억의 두 얼굴 : 회상 vs. 재인", at: new Date(now - 1 * day).toISOString(), correct: false, response: null, attempt: 1 },
            { worksheetTitle: "기억의 두 얼굴 : 회상 vs. 재인", at: new Date(now - 3 * day).toISOString(), correct: false, response: "retrival", attempt: 1 },
          ],
        },
        {
          word: "cognitive",
          meaning: "인지의, 인식의",
          wrongCount: 1,
          totalCount: 3,
          lastWrongAt: new Date(now - 10 * day).toISOString(),
          recovered: true,
          history: [
            { worksheetTitle: "빨간색의 독점적 지위", at: new Date(now - 4 * day).toISOString(), correct: true, response: "cognitive", attempt: 1 },
            { worksheetTitle: "기억의 두 얼굴 : 회상 vs. 재인", at: new Date(now - 10 * day).toISOString(), correct: false, response: "cognative", attempt: 1 },
          ],
        },
        {
          word: "supremacy",
          meaning: null,
          wrongCount: 1,
          totalCount: 1,
          lastWrongAt: new Date(now - 2 * day).toISOString(),
          recovered: false,
          history: [
            { worksheetTitle: "빨간색의 독점적 지위", at: new Date(now - 2 * day).toISOString(), correct: false, response: null, attempt: 1 },
          ],
        },
      ],
    };
    return <StudentVocabClient data={vocabData} />;
  }

  // ── 허브 뷰 — 진행 절반 가정한 목업 상태로 렌더 ────────────────────────────
  if (view === "hub") {
    const hubStages: HubStageRow[] = plan.stages.map((s, i) => ({
      id: s.id,
      title: s.title,
      subtitle: s.subtitle,
      estMin: s.estMin,
      itemCount: s.items.length,
      graded: s.graded,
      status: i < 3 ? "done" : i === 3 ? "in-progress" : "todo",
      score: s.graded && i < 3 ? 85 - i * 10 : undefined,
    }));
    return (
      <WorksheetStudyHub
        taskId="dev-harness-task"
        title="기억의 두 얼굴 : 회상 vs. 재인"
        instructions="이번 주 수업 범위입니다. 어휘 시험까지는 수요일까지 꼭 마쳐 주세요."
        dDay="D-3"
        stages={hubStages}
        masteryPct={78}
        doneCount={3}
        taskDone={false}
        requiredMode
        legacyCompleteAllowed={false}
        initialLegacyDone={false}
      />
    );
  }

  // ── 리포트 뷰 — 취약점 목업으로 렌더 ───────────────────────────────────────
  if (view === "report") {
    const repStages: ReportStageRow[] = plan.stages.map((s, i) => ({
      id: s.id,
      title: s.title,
      graded: s.graded,
      status: i < 6 ? "done" : "todo",
      score: s.graded && i < 6 ? 90 - i * 8 : undefined,
      timeMs: i < 6 ? (i + 1) * 150_000 : undefined,
    }));
    const sentences: ReportSentence[] = [];
    const reading = plan.stages.find((s) => s.id === "reading");
    if (reading) {
      for (const it of reading.items) {
        if (it.type === "read" && it.n > 0) sentences.push({ n: it.n, en: it.en, ko: it.ko });
      }
    }
    const wordMeanings = plan.vocabMeanings;
    return (
      <WorksheetStudyReport
        taskId="dev-harness-task"
        title="기억의 두 얼굴 : 회상 vs. 재인"
        masteryPct={72}
        totalTimeMs={38 * 60_000}
        stages={repStages}
        weakness={{
          skills: {
            vocab: { correct: 14, total: 16 },
            chunk: { correct: 15, total: 22 },
            grammar: { correct: 5, total: 10 },
            cloze: { correct: 18, total: 21 },
            order: { correct: 7, total: 9 },
            production: { correct: 3, total: 8 },
            comprehension: { correct: 6, total: 8 },
          },
          sentences: { "4": { correct: 1, total: 4 }, "5": { correct: 2, total: 3 }, "9": { correct: 0, total: 2 }, "2": { correct: 3, total: 3 } },
          words: [
            { word: "reconstruct", wrong: 3, total: 4 },
            { word: "retrieval", wrong: 2, total: 3 },
            { word: "cognitive", wrong: 1, total: 2 },
          ],
          grammar: { i: { correct: 1, total: 4 }, c: { correct: 2, total: 3 } },
        }}
        sentences={sentences}
        wordMeanings={wordMeanings}
      />
    );
  }

  // 스테이지 인덱스 (기본 화면)
  return (
    <div className="gd-page px-4 py-6">
      <p className="gd-label">DEV HARNESS · 학습지 스터디</p>
      <h1 className="gd-t-xl mt-1 font-bold tracking-tight">{plan.reportTitle}</h1>
      <p className="gd-t-xs mt-1" style={{ color: "var(--gd-ink-2)" }}>
        모드 {plan.mode} · 스테이지 {plan.stages.length}개 · 총 {plan.totalItems}문항 · planHash{" "}
        <span className="gd-mono">{plan.planHash}</span>
      </p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {MODES.map((m) => (
          <Link
            key={m}
            href={`/dev/worksheet-study?mode=${m}`}
            className="gd-btn-chip"
            data-active={m === activeMode ? "true" : undefined}
          >
            {m}
          </Link>
        ))}
        <Link href={`/dev/worksheet-study?view=hub&mode=${activeMode}`} className="gd-btn-chip">
          허브 뷰
        </Link>
        <Link href={`/dev/worksheet-study?view=report&mode=${activeMode}`} className="gd-btn-chip">
          리포트 뷰
        </Link>
        <Link href={`/dev/worksheet-study?view=vocab&mode=${activeMode}`} className="gd-btn-chip">
          단어장 뷰
        </Link>
      </div>
      <div className="mt-4 flex flex-col gap-2">
        {plan.stages.map((s) => (
          <Link
            key={s.id}
            href={`/dev/worksheet-study?view=player&mode=${activeMode}&stage=${s.id}`}
            className="gd-card flex items-center gap-3 px-4 py-3"
            data-stage={s.id}
          >
            <div className="min-w-0 flex-1">
              <p className="gd-t-sm font-bold">{s.title}</p>
              <p className="gd-t-xs" style={{ color: "var(--gd-ink-2)" }}>
                {s.subtitle}
              </p>
            </div>
            <span className="gd-mono gd-t-xs shrink-0" style={{ color: "var(--gd-ink-3)" }}>
              {s.items.length}문항 · {s.estMin}분{s.graded ? "" : " · 무채점"}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
