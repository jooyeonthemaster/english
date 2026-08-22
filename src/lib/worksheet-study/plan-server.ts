// ============================================================================
// 학습지 스터디 — 서버 공용 plan 조립 (server-only)
//
// compileStudyPlan(순수) 호출 전에 코퍼스 어휘 오답 자산을 질의해 주입하고
// 배포 설정의 스테이지 화이트리스트를 전달한다. 런타임(server.ts)·교사 문항
// 복원(study-item-preview)·클래스 스튜디오 미리보기가 **반드시 이 함수 하나**를
// 쓴다 — 호출부마다 따로 조립하면 미리보기와 실서빙 문항이 갈린다
// (class-studio-spec §12 "3곳 동시 적용" 계약).
// ============================================================================

import "server-only";

import type { AnalysisReport } from "@/lib/passage-report/analysis-report/schema";
import { extractGenContext } from "@/lib/passage-report/analysis-report/study-activities";
import { compileStudyPlan } from "./compile";
import type { StudyMode, StudyPlan, StudyStageId } from "./types";
import { fetchWorksheetVocabAssets } from "./vocab-assets";

export async function compileServerStudyPlan(opts: {
  report: AnalysisReport;
  mode: Exclude<StudyMode, "off">;
  taskId: string;
  reportTitle: string;
  /** 배포 설정 화이트리스트(resolveStudyConfig(config).stages) — 부재 = 프리셋 전체 */
  stages?: StudyStageId[];
}): Promise<StudyPlan> {
  const vocabAssets = await fetchWorksheetVocabAssets(
    extractGenContext(opts.report).vocab,
  );
  return compileStudyPlan({
    report: opts.report,
    mode: opts.mode,
    taskId: opts.taskId,
    reportTitle: opts.reportTitle,
    stages: opts.stages,
    vocabAssets,
  });
}
