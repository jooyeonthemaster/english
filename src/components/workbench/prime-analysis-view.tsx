"use client";

import { Loader2, PencilLine, Printer, RefreshCw, Send, Sparkle } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AnalysisReportDocument } from "@/components/workbench/analysis-report/AnalysisReportDocument";
import {
  AnalysisReportEditor,
  type ReportEditorToolbarState,
} from "@/components/workbench/analysis-report/AnalysisReportEditor";
import { InteractivePassageView } from "@/components/workbench/interactive-passage-view";
import { CreditCostChip } from "@/components/credits/credit-cost-chip";
import {
  AssignmentComposer,
  type ComposerPreset,
} from "@/components/study-assignments/assignment-composer";
import { useWorksheetAssignCreatedToast } from "@/components/workbench/use-worksheet-assign";
// 탭 라벨·마커 정본 — 리터럴 복제 금지(복제본은 타입 에러 0 으로 화면에서만 갈린다).
import {
  FINAL_REPORT_MARKER,
  PRACTICE_REPORT_MARKER,
  PRIME_REPORT_MARKER,
  READING_REPORT_MARKER,
} from "@/actions/workbench/passage-constants";
import { SHEET_PLAN_LABEL } from "@/lib/studio/sheet-products";
import { CREDIT_COSTS } from "@/lib/credit-costs";
import { notifyCreditsChanged } from "@/lib/credits-client";
import {
  isFinalOnepageReportShape,
  isReadingAnalysisReportShape,
  type AnalysisReport,
} from "@/lib/passage-report/analysis-report/schema";
import type { PassageAnalysisData } from "@/types/passage-analysis";

/** 이 뷰가 다루는 학습지 축 — 기본(PRIME) / 실전 학습지(PRIME_PRACTICE) /
 *  직독직해 분석본(PRIME_READING) / 파이널(PRIME_FINAL).
 *  [E30 §5 P4] 실전이 3번째 값으로, [reading 스펙 §5.3 F-3] 직독직해가 4번째 값으로
 *  합류했다. 전부 **같은 passageId 를 공유하는 별도 행**이라 탭 = 행이고,
 *  저장 PATCH 의 `?variant` 도 이 값에서 나온다. */
type SheetVariant = "basic" | "practice" | "reading" | "final";

/** 탭 축 → 행 마커. 탭 라벨은 SHEET_PLAN_LABEL(정본 5키)에서 끌어온다 —
 *  조판 목록·도시에·조판 칩과 **같은 문자열**이어야 같은 문서로 읽힌다(E30 §4-1). */
const VARIANT_MARKER: Record<SheetVariant, string> = {
  basic: PRIME_REPORT_MARKER,
  practice: PRACTICE_REPORT_MARKER,
  reading: READING_REPORT_MARKER,
  final: FINAL_REPORT_MARKER,
};
const variantLabel = (v: SheetVariant): string =>
  SHEET_PLAN_LABEL.get(VARIANT_MARKER[v]) ?? "학습지";

interface Props {
  passageId: string;
  /** 생성 직후 호출 (모달이 잔액 갱신 등 후처리할 수 있게) */
  onGenerated?: () => void;
  /** 기존 5-layer 분석 (PRIME 없을 때 옛 인터랙티브 뷰로 폴백 — 기존 유저 호환) */
  legacyAnalysisData?: PassageAnalysisData | null;
  passageContent?: string;
  /** 지문 제목 — "학생에게 배포" 프리셋의 부가 표시(meta)용. */
  passageTitle?: string;
  /** 편집기 저장 상태를 모달 헤더로 끌어올리기 위한 콜백. */
  onToolbarStateChange?: (state: ReportEditorToolbarState | null) => void;
}

/**
 * 분석 등록 모달 안에서 PRIME A4 분석 보고서를 생성/표시.
 * - 기존 보고서 있으면 바로 렌더
 * - 없으면 생성 버튼 (5크레딧) → 생성 → 렌더
 * - 파이널 원페이지(PRIME_FINAL) 행이 따로 있으면:
 *   · 둘 다 있음 → 상단 필 탭 [기본 학습지][파이널 원페이지] (기본 탭 우선)
 *   · final 만 있음 → final 문서를 바로 편집기로
 *   · 기본만 있음 → 기존과 완전 동일 (탭 UI 자체가 안 뜸 — 무회귀)
 */
export function PrimeAnalysisView({ passageId, onGenerated, legacyAnalysisData, passageContent, passageTitle, onToolbarStateChange }: Props) {
  // 기본(PRIME) / 파이널(PRIME_FINAL) 문서를 병행 보관 — 편집기 key 를 variant 로 갈라
  // 히스토리·dirty 가 탭 사이에서 섞이지 않게 한다.
  const [basicReport, setBasicReport] = useState<AnalysisReport | null>(null);
  const [basicReportId, setBasicReportId] = useState<string | null>(null);
  // [E30 §5 P4] 실전 학습지 — 기본의 **자식 행**이라 기본 없이 단독으로 뜨는 일은 없다(§2-4).
  const [practiceReport, setPracticeReport] = useState<AnalysisReport | null>(null);
  const [practiceReportId, setPracticeReportId] = useState<string | null>(null);
  // [reading] 직독직해 분석본 — 파이널처럼 부모 없이도 성립하는 자기완결 행(스펙 §5.2 A-1).
  const [readingReport, setReadingReport] = useState<AnalysisReport | null>(null);
  const [readingReportId, setReadingReportId] = useState<string | null>(null);
  const [finalReport, setFinalReport] = useState<AnalysisReport | null>(null);
  const [finalReportId, setFinalReportId] = useState<string | null>(null);
  const [variant, setVariant] = useState<SheetVariant>("basic");
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 모달 진입 시 편집 모드 기본 활성화 (요청)
  const [mode, setMode] = useState<"view" | "edit">("edit");
  // "학생에게 배포" — 과제 컴포저 (U6)
  const [assignOpen, setAssignOpen] = useState(false);
  const onAssignCreated = useWorksheetAssignCreatedToast();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    // 지문이 바뀌면 이전 지문의 문서가 남지 않게 전부 비운다 — 특히 stale finalReport 가
    // 남으면 새 지문에서 탭이 잘못 뜬다(로딩 중에는 스피너가 화면을 덮어 깜빡임 없음).
    setBasicReport(null);
    setBasicReportId(null);
    setPracticeReport(null);
    setPracticeReportId(null);
    setReadingReport(null);
    setReadingReportId(null);
    setFinalReport(null);
    setFinalReportId(null);
    setVariant("basic");
    // 기본 로더만 **행 id 를 되돌려준다** — 아래 실전 로더의 구서버 가드가 그 값을 쓴다.
    const loadBasic = fetch(`/api/workbench/passage-reports/prime/${passageId}`)
      .then((r) => r.json())
      .then((j): string | null => {
        if (cancelled) return null;
        if (j?.report) setBasicReport(j.report as AnalysisReport);
        if (typeof j?.reportId === "string") {
          setBasicReportId(j.reportId);
          return j.reportId as string;
        }
        return null;
      })
      .catch((): string | null => null);
    const loadFinal = fetch(`/api/workbench/passage-reports/prime/${passageId}?variant=final`)
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        // 서버가 variant 파라미터를 모르는(구버전) 경우 기본 보고서가 그대로 돌아올 수
        // 있다 — 실제 final 모양일 때만 받아들여 탭 오염을 막는다.
        if (j?.report && isFinalOnepageReportShape(j.report as AnalysisReport)) {
          setFinalReport(j.report as AnalysisReport);
          if (typeof j?.reportId === "string") setFinalReportId(j.reportId);
        }
      })
      .catch(() => {});
    // [E30 §5 P4] 실전 학습지 로더.
    // ⚠ 구서버 가드를 **모양으로 할 수 없다** — 기본 문서도 실전 문서도 learning-worksheet 를
    // 가지므로, `variant` 를 모르는 서버가 기본 행을 돌려줘도 모양은 똑같다(파이널 로더가 쓴
    // isFinalOnepageReportShape 가드는 실전에 적용 불가). 대신 **행 id 가 기본과 같으면 그건
    // 기본 행**이라는 사실로 가른다 — 같은 지문의 두 행은 언제나 서로 다른 id 다.
    // 가드가 없으면 기본 문서가 「실전 학습지」 탭에 복제돼 뜨고, 그 탭에서 저장하면
    // 없는 실전 행을 찾다 404 가 난다.
    const loadPractice = fetch(`/api/workbench/passage-reports/prime/${passageId}?variant=practice`)
      .then((r) => r.json())
      .then(async (j) => {
        if (cancelled) return;
        // 이미 진행 중인 프라미스를 기다릴 뿐이라 두 요청이 직렬화되지는 않는다.
        const basicId = await loadBasic;
        if (cancelled) return;
        const id = typeof j?.reportId === "string" ? (j.reportId as string) : null;
        if (j?.report && id && id !== basicId) {
          setPracticeReport(j.report as AnalysisReport);
          setPracticeReportId(id);
        }
      })
      .catch(() => {});
    // [reading] 직독직해 분석본 로더 — 구서버 가드는 **모양 검사로 충분**하다(스펙 §5.3 F-3):
    // `variant=reading` 을 모르는 서버가 기본 행을 돌려줘도 기본 문서는 reading-analysis
    // 섹션을 절대 갖지 않아 여기서 걸러진다(파이널 로더의 isFinalOnepageReportShape 가드와
    // 동형). 실전 로더가 쓴 행 id 대조가 필요했던 이유(기본=실전 모양 동일)가 여기엔 없다 —
    // 가드가 없으면 기본 행이 「직독직해 학습지」 탭에 복제돼 뜨는 사고가 난다.
    const loadReading = fetch(`/api/workbench/passage-reports/prime/${passageId}?variant=reading`)
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        if (j?.report && isReadingAnalysisReportShape(j.report as AnalysisReport)) {
          setReadingReport(j.report as AnalysisReport);
          if (typeof j?.reportId === "string") setReadingReportId(j.reportId);
        }
      })
      .catch(() => {});
    void Promise.allSettled([loadBasic, loadFinal, loadPractice, loadReading]).then(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [passageId]);

  // 탭 실효값 — 고른 탭에 문서가 있으면 그것, 없으면 **기본 → 실전 → 직독직해 → 파이널**
  // 순 폴백(= SHEET_PLAN_RANK 표시 순서, pick-order.ts:184-198).
  // [E30] 2탭 시절의 결과와 전부 일치한다(기본만=기본 · 파이널만=파이널 · 둘 다=기본 ·
  // 파이널을 골랐는데 파이널이 없음=기본). 실전·직독직해가 그 사이에 끼어들 뿐이다 — 무회귀.
  const reportByVariant: Record<SheetVariant, AnalysisReport | null> = {
    basic: basicReport,
    practice: practiceReport,
    reading: readingReport,
    final: finalReport,
  };
  const effectiveVariant: SheetVariant = reportByVariant[variant]
    ? variant
    : basicReport
      ? "basic"
      : practiceReport
        ? "practice"
        : readingReport
          ? "reading"
          : finalReport
            ? "final"
            : "basic";
  const report = reportByVariant[effectiveVariant];
  // 배포 프리셋의 refId — StudyAssignment(WORKSHEET)는 PassageReport.id 를 참조.
  // 현재 탭 문서의 행 id 를 쓴다(자식 탭 GET 응답의 reportId 를 각각 따로 저장).
  const reportId =
    effectiveVariant === "final"
      ? finalReportId
      : effectiveVariant === "practice"
        ? practiceReportId
        : effectiveVariant === "reading"
          ? readingReportId
          : basicReportId;

  // 탭 전환 시 미저장 편집 경고용 — 편집기 툴바 상태를 이 계층에서도 들여다본 뒤
  // 부모(모달 헤더)로 그대로 전달한다. 부모가 콜백을 안 줬으면 기존처럼 undefined 를
  // 편집기에 넘겨야 한다(편집기가 인라인 저장 버튼 노출 여부를 콜백 유무로 판정 — 무회귀).
  const toolbarStateRef = useRef<ReportEditorToolbarState | null>(null);
  const handleToolbarStateChange = useCallback(
    (state: ReportEditorToolbarState | null) => {
      toolbarStateRef.current = state;
      onToolbarStateChange?.(state);
    },
    [onToolbarStateChange],
  );

  const switchVariant = useCallback(
    (next: SheetVariant) => {
      if (next === effectiveVariant) return;
      // 편집기는 탭별 key 로 갈아끼우므로 저장하지 않은 편집은 전환 시 사라진다 — 먼저 확인.
      if (
        toolbarStateRef.current?.dirty &&
        !window.confirm("저장하지 않은 편집이 있어요. 탭을 전환하면 사라집니다. 계속할까요?")
      )
        return;
      setVariant(next);
    },
    [effectiveVariant],
  );

  // 기본 학습지 생성/재생성 — POST 는 PRIME(기본) 행 전용 엔드포인트라 결과를 basic 에만 반영.
  const generate = useCallback(async () => {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch(`/api/workbench/passage-reports/prime/${passageId}`, { method: "POST" });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error ?? "생성에 실패했습니다.");
      setBasicReport(j.report as AnalysisReport);
      if (typeof j?.reportId === "string") setBasicReportId(j.reportId);
      onGenerated?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGenerating(false);
      // 성공(차감)·실패(서버 자동 환급) 모두 잔액이 바뀌었을 수 있으니 사이드바 뱃지 즉시 갱신
      notifyCreditsChanged();
    }
  }, [passageId, onGenerated]);

  // 배포 프리셋 — 현재 탭 문서의 보고서 id 가 있을 때만(레거시 분석만 있으면 버튼 자체를 숨김).
  // [E30 §1-5 · §0-3] 실전 분리 문서는 **인쇄 전용**이다 — 배포·스터디 플랜 축은 단수 마커
  // PRIME 만 보고(deploy.ts·worksheet-study/server.ts), 조판 표면도 실전 행에
  // 「인쇄용이라 모바일 배포 대상이 아닙니다」를 붙인다(sheet-deploy-eligibility BLOCKED_REASON).
  // 여기서만 배포 버튼을 열어 두면 그 안내가 거짓말이 되므로 실전 탭에서는 프리셋을 만들지 않는다.
  // (파이널 탭은 기존 동작 그대로 둔다 — 이번 범위에서 건드릴 축이 아니다.)
  // [reading] 직독직해도 같은 이유로 배포 프리셋을 만들지 않는다 — 조판 표면의 배포
  // 판정(sheet-deploy-eligibility)이 reading 행을 fail-closed 로 「인쇄용」 잠그므로
  // (canDeployWorksheetRow 는 PRIME 단수 마커만 ok), 여기서만 버튼을 열면 그 안내가
  // 거짓말이 된다. 디지털 스터디 축도 1차 범위에서 reading 을 배제한다(스펙 §5.3 F-8).
  const assignPreset = useMemo<ComposerPreset | null>(() => {
    if (effectiveVariant === "practice" || effectiveVariant === "reading") return null;
    if (!reportId || !report) return null;
    const rawTitle = (report as { meta?: { titleKo?: string } }).meta?.titleKo;
    return {
      kind: "WORKSHEET",
      content: {
        refId: reportId,
        title: rawTitle?.trim() || passageTitle || "학습지",
        meta: passageTitle ?? "",
      },
    };
  }, [effectiveVariant, reportId, report, passageTitle]);

  // 문서가 **2장 이상일 때만** 필 탭 — 1장뿐이면 탭 UI 자체가 안 뜬다(기본만 있는 지문 무회귀).
  // 순서는 인쇄·표시 랭크와 같다: 기본 → 실전 → 직독직해 → 파이널(E30 §4-2 + [reading]
  // SHEET_PLAN_RANK 1.5 — pick-order.ts:184-198). 라벨은 SHEET_PLAN_LABEL 정본에서
  // 끌어오므로 조판 목록·도시에와 글자가 갈리지 않는다.
  const tabVariants = (["basic", "practice", "reading", "final"] as const).filter(
    (v) => !!reportByVariant[v],
  );
  const variantTabs =
    tabVariants.length > 1 ? (
      <div className="flex shrink-0 items-center gap-1.5 border-b border-slate-200 bg-white px-4 py-1.5">
        {tabVariants.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => switchVariant(key)}
            aria-pressed={effectiveVariant === key}
            className={
              effectiveVariant === key
                ? "inline-flex h-7 items-center rounded-full bg-blue-600 px-3 text-[12px] font-semibold text-white"
                : "inline-flex h-7 items-center rounded-full border border-slate-200 px-3 text-[12px] font-medium text-slate-600 hover:bg-slate-50"
            }
          >
            {variantLabel(key)}
          </button>
        ))}
      </div>
    ) : null;

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-slate-400 gap-2 text-sm">
        <Loader2 className="w-4 h-4 animate-spin" /> 불러오는 중…
      </div>
    );
  }

  // PRIME 없음 + 기존 5-layer 분석 있음 → 옛 인터랙티브 뷰 그대로 (기존 유저 호환)
  if (!report && legacyAnalysisData) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-200 bg-blue-50/60">
          <span className="text-[12px] font-medium text-slate-600">기존 분석 (인터랙티브 보기)</span>
          <div className="flex-1" />
          <button
            type="button"
            onClick={generate}
            disabled={generating}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-blue-600 text-[12px] font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkle className="w-3.5 h-3.5" />}
            {generating ? "생성 중…" : "지문 학습자료로 새로 만들기"}
            {!generating && (
              <CreditCostChip
                amount={CREDIT_COSTS.PASSAGE_ANALYSIS}
                className="rounded bg-white/20 px-1.5 py-0.5 text-[10px]"
              />
            )}
          </button>
        </div>
        <div className="flex-1 overflow-auto px-6 py-5">
          <InteractivePassageView content={passageContent ?? ""} analysisData={legacyAnalysisData} />
        </div>
        {error ? <p className="px-4 py-1 text-xs text-red-500">{error}</p> : null}
      </div>
    );
  }

  // PRIME 없음 + 기존 분석도 없음 → 생성 CTA
  if (!report) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="text-sm text-slate-500 max-w-md">
          이 지문으로 <b>A4 심층 분석 보고서</b>를 생성합니다.<br />
          원문·해석, 구조도, 어법, 출제포인트, 어휘, 구문분석이 학생 눈높이로 한 번에 정리돼요.
        </div>
        <button
          type="button"
          onClick={generate}
          disabled={generating}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkle className="w-4 h-4" />}
          {generating ? "생성 중… (20~30초 소요)" : "A4 분석 보고서 생성"}
          {!generating && (
            <CreditCostChip
              amount={CREDIT_COSTS.PASSAGE_ANALYSIS}
              className="rounded bg-white/20 px-1.5 py-0.5 text-[11px]"
            />
          )}
        </button>
        {error ? <p className="text-xs text-red-500 max-w-md">{error}</p> : null}
      </div>
    );
  }

  // 편집 모드 — 레이아웃 편집기 (보기와 동일한 렌더러를 edit 컨텍스트로 구동)
  if (mode === "edit") {
    const editor = (
      <AnalysisReportEditor
        // 탭별로 편집기 인스턴스를 분리(히스토리·dirty·선택 상태 오염 방지).
        key={effectiveVariant}
        passageId={passageId}
        initialReport={report}
        // 활동 생성 소스는 "지문"이지 "문서"가 아니다 — **자식 탭**(파이널·실전)에서만 이미
        // 로드된 기본(PRIME) 문서를 소스로 전달. 기본 문서가 없으면 null(편집기가 T1 폴백으로
        // 강등). 기본 탭에는 전달하지 않는다(undefined = 현행 렌더와 동일).
        // [E30 §5 P4] 실전 문서도 파이널과 같은 컨텍스트 공백을 갖는다 — sections 가
        // learning-worksheet 하나뿐이라 문장 ko·청크가 없다(extractGenContext 는 lw 를 안 읽는다).
        // [reading] 직독직해 탭도 이 산식이 그대로 포섭한다(basic 이 아니면 전부 자식 탭) —
        // 승격 주입 단어시험지(F-5)의 소스가 부모 기본 리포트다. 기본이 없으면 null = 잠김
        // 카드가 사유를 고지한다(활동 자체는 reading 본문의 chunks 실데이터로 판정 — F-4).
        activitySource={effectiveVariant === "basic" ? undefined : basicReport}
        // [E30 §5 P4] 저장 PATCH 의 `?variant` 정본. **실전 탭에서 이걸 빠뜨리면 저장이
        // 부모 기본 학습지 행을 통째로 덮어쓴다**(문서 모양으로는 가를 수 없다).
        docVariant={effectiveVariant}
        onSaved={(saved) => {
          // 저장 결과는 그 variant 상태만 갱신한다(다른 탭 문서는 불변).
          if (effectiveVariant === "final") setFinalReport(saved);
          else if (effectiveVariant === "practice") setPracticeReport(saved);
          else if (effectiveVariant === "reading") setReadingReport(saved);
          else setBasicReport(saved);
          onGenerated?.();
        }}
        // [E30 §5 P4] 실전은 **별도 행**으로 생기므로 편집기가 현재 문서를 갈아끼우지 않는다 —
        // 여기서 새 탭으로 착지시킨다. 미저장 편집 확인을 다시 묻지 않는 이유: 편집기의
        // generateWorksheet 가 dirty 면 이미 저장 여부를 물어 처리한 뒤에 발사한다.
        onPracticeCreated={({ report: created, reportId: createdId }) => {
          setPracticeReport(created);
          if (createdId) setPracticeReportId(createdId);
          setVariant("practice");
          onGenerated?.();
        }}
        onExit={() => setMode("view")}
        onToolbarStateChange={onToolbarStateChange ? handleToolbarStateChange : undefined}
      />
    );
    if (!variantTabs) return editor;
    return (
      <div className="flex h-full flex-col">
        {variantTabs}
        <div className="min-h-0 flex-1">{editor}</div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {variantTabs}
      <div className="prime-view-toolbar flex items-center gap-2 px-4 py-2 border-b border-slate-200 bg-white">
        <span className="text-[12px] font-semibold text-slate-600">
          {effectiveVariant === "basic" ? "A4 분석 보고서" : variantLabel(effectiveVariant)}
        </span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => setMode("edit")}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-blue-200 text-[12px] font-semibold text-blue-600 hover:bg-blue-50"
        >
          <PencilLine className="w-3.5 h-3.5" /> 레이아웃 편집
        </button>
        {/* 재생성 POST 는 기본(PRIME) 행 전용 엔드포인트 — 파이널 탭에서는 숨긴다. */}
        {effectiveVariant === "basic" ? (
          <button
            type="button"
            onClick={generate}
            disabled={generating}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-slate-200 text-[12px] font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60"
          >
            {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            재생성
          </button>
        ) : null}
        {/* 학생에게 배포 — 학생 앱(/g) 과제로 이 학습지를 보낸다 (U6). */}
        {assignPreset ? (
          <button
            type="button"
            onClick={() => setAssignOpen(true)}
            title="학생 앱으로 배포"
            aria-label="학생 앱으로 배포"
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-blue-200 text-[12px] font-semibold text-blue-600 hover:bg-blue-50"
          >
            <Send className="w-3.5 h-3.5" /> 학생에게 배포
          </button>
        ) : null}
        <button
          type="button"
          onClick={() =>
            // 인쇄 전 웹폰트 로드 완료 대기 — 미로드 상태 인쇄로 인한 프린트 준비 지연 방지.
            void document.fonts.ready.then(() => window.print())
          }
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-blue-600 text-[12px] font-semibold text-white hover:bg-blue-700"
        >
          <Printer className="w-3.5 h-3.5" /> 인쇄 / PDF
        </button>
      </div>
      <div className="flex-1 overflow-auto bg-slate-200 py-6">
        <AnalysisReportDocument report={report} />
      </div>
      {error ? <p className="px-4 py-1 text-xs text-red-500">{error}</p> : null}

      {/* 과제 배포 컴포저 (U6) */}
      <AssignmentComposer
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        preset={assignPreset}
        onCreated={onAssignCreated}
      />
    </div>
  );
}
