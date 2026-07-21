"use client";

// ============================================================================
// 학생 상세 허브 — "학습 분석" 탭 (학생 축 관제의 본체, spec §4.2)
//
// getStudentStudyAnalytics 소비: 실시간 학습 피드 · 영역별 첫 시도 정답률 ·
// 자주 틀린 단어 · 보충 필요 문장·어법 포인트 · 학습지별 진행 매트릭스. 15초 자동
// 폴링(탭 비가시 시 중단) + 마지막 갱신 시각 + 수동 갱신. 마지막 활동 3분
// 이내면 "지금 학습 중" 라이브 도트. 어휘 상세 이력은 StudyStudentVocabDrawer
// 재사용. 규범: docs/director-console-spec.md §4.2 · §6(밀도).
//
// v3 대개편 A-3(design §D1-3 학습지 탭 — 최소 수정):
//  - 「영역별 숙달도」 → METRIC_LABELS.FIRST_TRY_RATE_BY_AXIS 개칭 + ⓘ(R10).
//  - 취약 단어 카드 우상단 WeakPointCta card형 「이 학습지 다시 보내기」(D2-2
//    WORKSHEET 재배포 — 지문 필터로 학습지 선택 시 활성).
//  - 어법 포인트 행 WeakSpotRow(상시 CTA) — grammar-code-map 으로 GRAMMAR
//    프리셋(개념 매핑 우선, 빈 배열이면 유닛 강등).
//  - onDeploy?: 셸(student-hub-client) openDeployComposer 배선 지점(§D2-1).
//    A-4 배선 전 optional — 미배선 시 CTA 미렌더(현행 렌더 무변경 폴백).
//  - planStale 소생(spec §4.2.2): assignments 행 planHash → 문항 상세 팝업
//    getStudyItemPreview 전달 — 학습지 편집 후 "다를 수 있음" 배지 복구.
//  - 영역별(7축) 카드는 v3 1차 CTA 없음(축→콘텐츠 자동 매핑 부정직 — 2차).
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  BookA,
  BookOpen,
  ChevronDown,
  ChevronRight,
  Info,
  LayoutGrid,
  Lightbulb,
  Loader2,
  MinusCircle,
  Timer,
} from "lucide-react";
import {
  getStudentStudyAnalytics,
  type StudentStudyAnalytics,
  type StudentStudyBreakdown,
  type StudentStudyAssignmentRow,
  type StudentStudyEventRow,
  type StudentStudyStageCell,
  type StudentWeakGrammarRow,
  type StudentWeakWordSummaryRow,
} from "@/actions/students/study-analytics";
import {
  getStudyItemPreview,
  type StudyItemPreview,
} from "@/actions/students/study-item-preview";
import { StudyStudentVocabDrawer } from "@/components/study-assignments/study-student-drawer";
import { WideModal } from "@/components/layout/wide-modal";
import {
  StudyItemPreviewFallback,
  StudyItemPreviewView,
} from "./study-item-preview-view";
import {
  AnalyticsCard,
  CardEmpty,
  DetailRow,
  FilterChip,
  MetricHelpTip,
  RefreshStrip,
  TabEmpty,
  VerdictIcon,
  fmtAt,
  fmtAtSec,
  fmtDay,
  fmtDuration,
  fmtHm,
  fmtSpent,
  scoreBar,
  scoreText,
} from "./analytics/kit";
import { usePollingAction } from "./analytics/use-polling-action";
import { WeakPointCta, WeakSpotRow } from "./analytics/weak-spot-row";
import {
  GRAMMAR_CODE_CONCEPTS,
  GRAMMAR_CODE_UNIT_FALLBACK,
} from "@/lib/grammar-drill/grammar-code-map";
import { GRAMMAR_POINT_CATALOG } from "@/lib/grammar-point-catalog";
import type { WeakDeployTarget, WeakSpot } from "@/lib/student-analytics/types";
import {
  ANALYTICS_CARD_TITLES,
  CTA_DISABLED_TITLES,
  CTA_LABELS,
  EMPTY_STATES,
  HUB_TAB_ONELINERS,
  METRIC_HELP,
  METRIC_LABELS,
  PICKED_CONTENT_META,
  wrongExplain,
} from "@/lib/wording/director-glossary";
import {
  STUDY_SKILL_LABELS,
  STUDY_STAGE_META,
  type StudySkill,
} from "@/lib/worksheet-study/types";
import { cn } from "@/lib/utils";

// ── 표시 헬퍼 ───────────────────────────────────────────────────────────────

/** 스테이지 표시 순서 — 스펙 카탈로그 순(STUDY_STAGE_META 키 순서) */
const STAGE_ORDER = Object.keys(STUDY_STAGE_META);

function stageTitle(id: string): string {
  return (STUDY_STAGE_META as Record<string, { title: string }>)[id]?.title ?? id;
}

function grammarLabel(code: string): string {
  const info = (GRAMMAR_POINT_CATALOG as Record<string, { label: string }>)[code];
  return info ? info.label : code;
}

// 점수 톤·시각 포매터(scoreText/scoreBar/fmt*)는 analytics/kit 로 승격 이동

function skillLabel(skill: string): string {
  return (STUDY_SKILL_LABELS as Record<string, string>)[skill] ?? skill;
}

/**
 * 같은 학습지를 여러 번 배포하면 제목이 완전히 같아 칩·행이 구분되지 않는다 —
 * 중복 제목에만 배포일을 덧붙인다(고유한 제목은 그대로).
 */
function buildLabelMap(assignments: StudentStudyAssignmentRow[]): Map<string, string> {
  const countByTitle = new Map<string, number>();
  for (const a of assignments) {
    countByTitle.set(a.title, (countByTitle.get(a.title) ?? 0) + 1);
  }
  const out = new Map<string, string>();
  for (const a of assignments) {
    const dup = (countByTitle.get(a.title) ?? 0) > 1;
    const day = fmtDay(a.assignedAt);
    out.set(a.assignmentId, dup && day ? `${a.title} · ${day} 배포` : a.title);
  }
  return out;
}

// 정오 아이콘(VerdictIcon)·카드 셸(AnalyticsCard/CardEmpty)은 analytics/kit 로 승격 이동

// ── 취약점 → WeakSpot 사상 (v3 §D2-1·D2-2) ─────────────────────────────────

/**
 * 「이 학습지 다시 보내기」 WORKSHEET 배포 타깃 — 같은 학습지 재배포(D2-2).
 * refId = 원본 학습지(PassageReport.id) 정식 서버 필드 — 컴포저가 content.refId
 * 를 passageReportId 로 직결 사용한다. 과제 원본이 삭제·스코프 밖이면 null
 * (CTA 비활성 + 사유 툴팁 — 배포 경로 없음, §D2-1).
 */
function worksheetDeployOf(row: StudentStudyAssignmentRow | null): WeakDeployTarget | null {
  if (!row?.refId) return null;
  return {
    kind: "WORKSHEET",
    content: { refId: row.refId, title: row.title, meta: PICKED_CONTENT_META.RESEND_FROM_STUDY },
    studyMode: "standard",
  };
}

/**
 * 어법 포인트 코드(a~m) → GRAMMAR 배포 타깃 — 개념 매핑(GRAMMAR_CODE_CONCEPTS)
 * 우선, 빈 배열이면 유닛 추천(GRAMMAR_CODE_UNIT_FALLBACK)으로 강등(§D2-2).
 * 둘 다 없으면 null — 배포 경로 없음(사유 툴팁만, §D2-1).
 */
function grammarDeployOf(code: string): WeakDeployTarget | null {
  const conceptIds =
    (GRAMMAR_CODE_CONCEPTS as Record<string, string[] | undefined>)[code] ?? [];
  if (conceptIds.length > 0) {
    return { kind: "GRAMMAR", grammarSpec: { conceptIds, count: 10 }, weakConcepts: [] };
  }
  const unitIds =
    (GRAMMAR_CODE_UNIT_FALLBACK as Record<string, string[] | undefined>)[code] ?? [];
  if (unitIds.length > 0) {
    return { kind: "GRAMMAR", grammarSpec: { unitIds, count: 10 }, weakConcepts: [] };
  }
  return null;
}

/** 어법 포인트 행 → WeakSpot — metric 은 첫 시도 정답률(100-오답률, D6 정직 명명) */
function toGrammarCodeSpot(g: StudentWeakGrammarRow): WeakSpot {
  return {
    domain: "study",
    axis: "grammar-code",
    key: g.code,
    label: grammarLabel(g.code),
    metric: { kind: "first-try", value: Math.min(100, Math.max(0, 100 - g.wrongRate)) },
    evidence: { attempts: g.attempts, wrong: g.wrongCount },
    deploy: grammarDeployOf(g.code),
  };
}

/** 취약 단어 행 → WeakSpot — 카드 CTA 시드(같은 학습지 WORKSHEET 배포 공유) */
function toWordSpot(w: StudentWeakWordSummaryRow, deploy: WeakDeployTarget | null): WeakSpot {
  const rate =
    w.totalCount > 0
      ? Math.round(((w.totalCount - w.wrongCount) / w.totalCount) * 100)
      : 0;
  return {
    domain: "study",
    axis: "word",
    key: w.word,
    label: w.word,
    metric: { kind: "first-try", value: Math.min(100, Math.max(0, rate)) },
    evidence: { attempts: w.totalCount, wrong: w.wrongCount },
    deploy,
  };
}

const LIVE_WINDOW_MS = 3 * 60_000;

// ── 지문(학습지) 필터 ───────────────────────────────────────────────────────

/**
 * 탭 전역 스코프 필터 — 지문을 고르면 피드뿐 아니라 숙달도·취약 단어·문장·어법이
 * 전부 그 지문 기준으로 바뀐다(spec §4.2.1). 학습지 1개면 렌더하지 않는다.
 */
function WorksheetFilterBar({
  assignments,
  labels,
  selectedId,
  onSelect,
}: {
  assignments: StudentStudyAssignmentRow[];
  /** assignmentId → 표시 라벨(중복 제목은 배포일 포함) */
  labels: Map<string, string>;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  // 학습지가 1개여도 렌더한다 — 지금 어느 범위를 보고 있는지가 항상 보여야 한다
  if (assignments.length === 0) return null;
  const totalWrong = assignments.reduce((acc, a) => acc + a.wrongCount, 0);
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-slate-200 bg-white px-3 py-2">
      <span className="flex shrink-0 items-center gap-1.5 text-[12.5px] font-semibold text-slate-500">
        <BookOpen className="size-3.5 text-slate-300" aria-hidden />
        학습지
      </span>
      <div
        className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto pb-0.5"
        role="group"
        aria-label="학습지 필터"
      >
        <FilterChip
          label="전체"
          count={totalWrong}
          active={selectedId === null}
          onClick={() => onSelect(null)}
        />
        {assignments.map((a) => (
          <FilterChip
            key={a.assignmentId}
            label={labels.get(a.assignmentId) ?? a.title}
            title={labels.get(a.assignmentId) ?? a.title}
            count={a.wrongCount}
            active={selectedId === a.assignmentId}
            onClick={() => onSelect(selectedId === a.assignmentId ? null : a.assignmentId)}
          />
        ))}
      </div>
    </div>
  );
}

// 필터 칩(FilterChip)은 analytics/kit 로 승격 이동

// ── 피드 행 ─────────────────────────────────────────────────────────────────

/** 피드 표시 단위 — 무판정 연속 로그는 group 으로 접는다(spec §4.2.2) */
type FeedItem =
  | { kind: "event"; key: string; ev: StudentStudyEventRow }
  | { kind: "group"; key: string; stageId: string; events: StudentStudyEventRow[] };

const eventKey = (ev: StudentStudyEventRow) =>
  `${ev.at}-${ev.stageId}-${ev.itemKey}-${ev.attempt}`;

/** 최신순 이벤트 → 표시 단위. 같은 단계의 무판정 로그가 2건 이상 연속이면 압축. */
function buildFeedItems(events: StudentStudyEventRow[]): FeedItem[] {
  const out: FeedItem[] = [];
  let run: StudentStudyEventRow[] = [];
  const flush = () => {
    if (run.length === 0) return;
    if (run.length === 1) {
      out.push({ kind: "event", key: eventKey(run[0]), ev: run[0] });
    } else {
      out.push({
        kind: "group",
        key: `g-${eventKey(run[0])}-${run.length}`,
        stageId: run[0].stageId,
        events: run,
      });
    }
    run = [];
  };
  for (const ev of events) {
    const groupable = ev.correct === null;
    if (groupable) {
      if (run.length > 0 && (run[0].stageId !== ev.stageId || run[0].assignmentId !== ev.assignmentId)) {
        flush();
      }
      run.push(ev);
      continue;
    }
    flush();
    out.push({ kind: "event", key: eventKey(ev), ev });
  }
  flush();
  return out;
}

function FeedRow({
  ev,
  labels,
  onOpen,
  compact,
}: {
  ev: StudentStudyEventRow;
  labels: Map<string, string>;
  onOpen: (ev: StudentStudyEventRow) => void;
  /** 그룹 펼침 내부 행 — 들여쓰기·약한 톤 */
  compact?: boolean;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(ev)}
        className={cn(
          "group flex w-full items-start gap-2 rounded-md px-1.5 py-1.5 text-left transition-colors hover:bg-blue-50/60",
          compact && "pl-7",
        )}
      >
        <VerdictIcon correct={ev.correct} className="mt-0.5 size-4" />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline gap-x-1.5 text-[13px] text-slate-700">
            <span className="font-semibold">{stageTitle(ev.stageId)}</span>
            {ev.wordKey ? (
              <span className="font-serif font-medium text-slate-600">{ev.wordKey}</span>
            ) : ev.sentenceNo ? (
              <span className="text-slate-600">문장 {ev.sentenceNo}</span>
            ) : null}
            {ev.attempt >= 2 ? (
              <span className="rounded bg-blue-50 px-1 py-0.5 text-[10px] font-bold text-blue-600">
                재도전
              </span>
            ) : null}
            {ev.correct === null ? (
              <span className="text-[12px] text-slate-400">확인 완료</span>
            ) : null}
          </span>
          <span className="block truncate text-[12px] text-slate-400">
            <span className="tabular-nums">{fmtAt(ev.at)}</span> ·{" "}
            {labels.get(ev.assignmentId) ?? ev.assignmentTitle}
          </span>
          {ev.correct === false && ev.response ? (
            <span className="mt-0.5 block truncate text-[12px] text-rose-500">
              답: <span className="font-serif">{ev.response}</span>
            </span>
          ) : null}
        </span>
        <ChevronRight
          className="mt-1 size-3.5 shrink-0 text-slate-300 transition-colors group-hover:text-blue-500"
          aria-hidden
        />
      </button>
    </li>
  );
}

/** 무판정 연속 로그 압축 행 — 클릭하면 인라인 펼침(데이터를 숨기지 않는다) */
function FeedGroupRow({
  item,
  labels,
  expanded,
  onToggle,
  onOpen,
}: {
  item: Extract<FeedItem, { kind: "group" }>;
  labels: Map<string, string>;
  expanded: boolean;
  onToggle: () => void;
  onOpen: (ev: StudentStudyEventRow) => void;
}) {
  const newest = item.events[0];
  const oldest = item.events[item.events.length - 1];
  return (
    <>
      <li>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="flex w-full items-start gap-2 rounded-md px-1.5 py-1.5 text-left transition-colors hover:bg-slate-50"
        >
          <MinusCircle className="mt-0.5 size-4 shrink-0 text-slate-300" strokeWidth={2} aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-baseline gap-x-1.5 text-[13px] text-slate-600">
              <span className="font-semibold">{stageTitle(item.stageId)}</span>
              <span className="text-[12px] text-slate-400">확인 완료</span>
              <span className="rounded bg-slate-100 px-1.5 text-[11px] font-bold tabular-nums text-slate-500">
                ×{item.events.length}
              </span>
            </span>
            <span className="block truncate text-[12px] text-slate-400">
              <span className="tabular-nums">
                {fmtAt(oldest.at)}~{fmtHm(newest.at)}
              </span>{" "}
              · {labels.get(newest.assignmentId) ?? newest.assignmentTitle}
            </span>
          </span>
          <ChevronDown
            className={cn(
              "mt-1 size-3.5 shrink-0 text-slate-300 transition-transform",
              expanded && "rotate-180",
            )}
            aria-hidden
          />
        </button>
      </li>
      {expanded
        ? item.events.map((ev) => (
            <FeedRow key={eventKey(ev)} ev={ev} labels={labels} onOpen={onOpen} compact />
          ))
        : null}
    </>
  );
}

// ── 문항 상세 팝업 ──────────────────────────────────────────────────────────
// 라벨-값 행(DetailRow)은 analytics/kit 로 승격 이동

/**
 * 피드 문항 클릭 상세 — 좌: 학생이 본 문항 원형(서버가 컴파일러로 복원),
 * 우: 메타·학생 답·같은 단어 최근 기록. 중앙 팝업 셸(WideModal), spec §4.2.2.
 */
function EventDetailModal({
  event,
  related,
  labels,
  studentId,
  planHash,
  onClose,
  onFilterAssignment,
  assignmentFiltered,
}: {
  event: StudentStudyEventRow | null;
  related: StudentStudyEventRow[];
  labels: Map<string, string>;
  studentId: string;
  /**
   * 이 이벤트 학습지의 학생 state planHash(assignments 행 룩업) — 현재 컴파일과
   * 다르면 서버가 planStale 로 응답해 "수정되어 다를 수 있음" 배지를 켠다
   * (spec §4.2.2 계약 소생 — v3 A-3).
   */
  planHash: string | null;
  onClose: () => void;
  onFilterAssignment: (id: string) => void;
  assignmentFiltered: boolean;
}) {
  const ev = event;
  const [preview, setPreview] = useState<StudyItemPreview | null>(null);
  const [previewError, setPreviewError] = useState(false);
  const [loading, setLoading] = useState(false);

  // 문항 원형 복원 — 이벤트가 바뀔 때마다 조회(컴파일은 순수·결정론이라 캐시 불필요)
  const evKey = ev ? `${ev.assignmentId}::${ev.stageId}::${ev.itemKey}` : null;
  useEffect(() => {
    if (!ev || !evKey) return;
    let cancelled = false;
    setPreview(null);
    setPreviewError(false);
    setLoading(true);
    void (async () => {
      const res = await getStudyItemPreview({
        studentId,
        assignmentId: ev.assignmentId,
        stageId: ev.stageId,
        itemKey: ev.itemKey,
        planHash,
      });
      if (cancelled) return;
      if (res.success && res.data) setPreview(res.data);
      else setPreviewError(true);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // evKey 가 문항 동일성의 정본 — ev 객체 참조는 폴링마다 새로 생성된다.
    // planHash 는 판정 입력이라 deps 포함(학생 재플러시로 바뀌면 재판정).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evKey, studentId, planHash]);

  const verdictText =
    ev?.correct === true
      ? "정답"
      : ev?.correct === false
        ? ev.selfGrade === "D"
          ? "부분 정답(세모)"
          : "오답"
        : "채점 없는 학습 기록";

  if (!ev) return null;

  return (
    <WideModal
      open
      onClose={onClose}
      title={`${stageTitle(ev.stageId)}${ev.wordKey ? ` · ${ev.wordKey}` : ""}`}
      description={`${verdictText} · ${skillLabel(ev.skill)} · ${fmtAtSec(ev.at)}`}
      maxWidthClassName="max-w-[min(1180px,94vw)]"
      bodyClassName="bg-white"
      footer={
        <div className="flex items-center justify-between gap-2">
          <p className="text-[12px] text-slate-400">
            학생이 풀 때 본 화면 그대로 복원한 문항입니다.
          </p>
          {!assignmentFiltered && ev.assignmentId ? (
            <button
              type="button"
              onClick={() => {
                onFilterAssignment(ev.assignmentId);
                onClose();
              }}
              className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-white px-3.5 text-[13px] font-semibold text-slate-600 transition-colors hover:bg-slate-50 hover:text-blue-700"
            >
              이 학습지만 보기
              <ArrowRight className="size-3.5" aria-hidden />
            </button>
          ) : null}
        </div>
      }
    >
      {/* 넉넉한 최소 높이 + 상한 스크롤 — 짧은 문항은 빈 상자가 되지 않고,
          긴 문항(지문·배열)은 열 안에서만 스크롤된다 */}
      <div className="grid min-h-[min(60vh,520px)] grid-cols-1 lg:max-h-[min(78vh,860px)] lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        {/* 좌: 문항 원형 */}
        <div className="min-h-0 overflow-y-auto border-slate-100 p-5 lg:border-r">
          <div className="mb-3 flex items-center gap-2">
            <VerdictIcon correct={ev.correct} className="size-4" />
            <p className="text-[13px] font-semibold text-slate-700">문항</p>
            {preview?.planStale ? (
              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                학습지가 수정되어 현재 구성과 다를 수 있습니다
              </span>
            ) : null}
          </div>
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-[13px] text-slate-400">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              문항을 불러오는 중입니다
            </div>
          ) : previewError ? (
            <StudyItemPreviewFallback reason="error" />
          ) : preview?.item ? (
            <StudyItemPreviewView item={preview.item} response={ev.response} correct={ev.correct} />
          ) : (
            <StudyItemPreviewFallback reason="missing" />
          )}
        </div>

        {/* 우: 기록 메타 */}
        <div className="flex min-h-0 flex-col gap-4 overflow-y-auto bg-slate-50/60 p-5">
          {ev.response ? (
            <div
              className={cn(
                "rounded-lg border px-3 py-2.5",
                ev.correct === false
                  ? "border-rose-200 bg-rose-50/60"
                  : "border-slate-200 bg-white",
              )}
            >
              <p className="text-[12px] font-semibold text-slate-500">학생이 제출한 답</p>
              <p
                className={cn(
                  "mt-1 font-serif text-[14px] leading-relaxed",
                  ev.correct === false ? "text-rose-700" : "text-slate-800",
                )}
              >
                {ev.response}
              </p>
            </div>
          ) : null}

          <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                <DetailRow
                  label="학습지"
                  value={
                    <span className="font-medium">
                      {labels.get(ev.assignmentId) ?? ev.assignmentTitle}
                    </span>
                  }
                />
                <DetailRow label="단계" value={stageTitle(ev.stageId)} />
                <DetailRow label="영역" value={skillLabel(ev.skill)} />
                {ev.wordKey ? (
                  <DetailRow
                    label="단어"
                    value={
                      <>
                        <span className="font-serif font-semibold">{ev.wordKey}</span>
                        {ev.wordMeaning ? (
                          <span className="text-slate-500"> · {ev.wordMeaning}</span>
                        ) : null}
                      </>
                    }
                  />
                ) : null}
                {ev.sentenceNo ? <DetailRow label="문장" value={`${ev.sentenceNo}번 문장`} /> : null}
                {ev.grammarCode ? (
                  <DetailRow
                    label="어법"
                    value={
                      <>
                        <span className="font-bold text-slate-400">({ev.grammarCode})</span>{" "}
                        {grammarLabel(ev.grammarCode)}
                      </>
                    }
                  />
                ) : null}
                <DetailRow
                  label="시도"
                  value={ev.attempt >= 2 ? `${ev.attempt}회차(재도전)` : "첫 시도"}
                />
                <DetailRow
                  label="소요"
                  value={
                    <span className="inline-flex items-center gap-1.5 tabular-nums">
                      <Timer className="size-3.5 text-slate-300" aria-hidden />
                      {fmtSpent(ev.timeMs)}
                    </span>
                  }
                />
                {ev.hintUsed ? (
                  <DetailRow
                    label="힌트"
                    value={
                      <span className="inline-flex items-center gap-1.5 text-amber-600">
                        <Lightbulb className="size-3.5" aria-hidden />
                        힌트를 사용했습니다
                      </span>
                    }
                  />
                ) : null}
              </div>

              {/* 같은 단어(없으면 같은 문항)의 최근 기록 */}
              <div>
                <p className="mb-1.5 text-[12.5px] font-semibold text-slate-600">
                  {ev.wordKey ? `"${ev.wordKey}" 최근 기록` : "이 문항의 최근 기록"}
                </p>
                {related.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center text-[12.5px] text-slate-400">
                    다른 기록이 없습니다.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2">
                    {related.map((r) => (
                      <li key={eventKey(r)} className="flex items-start gap-2 py-1">
                        <VerdictIcon correct={r.correct} className="mt-0.5 size-3.5" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[12.5px] text-slate-600">
                            {labels.get(r.assignmentId) ?? r.assignmentTitle}
                          </span>
                          <span className="text-[11px] tabular-nums text-slate-400">
                            {fmtAtSec(r.at)}
                            {r.attempt >= 2 ? " · 재도전" : ""}
                          </span>
                          {r.response ? (
                            <span className="mt-0.5 block truncate text-[12px] text-slate-500">
                              답: <span className="font-serif">{r.response}</span>
                            </span>
                          ) : null}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
            <p className="mt-1.5 text-[11px] text-slate-400">최근 기록 200건 기준입니다.</p>
          </div>
        </div>
      </div>
    </WideModal>
  );
}

// ── 매트릭스 셀 ─────────────────────────────────────────────────────────────

function MatrixCell({ cell }: { cell?: StudentStudyStageCell }) {
  if (!cell || cell.status === "todo") {
    return <span className="text-slate-300">—</span>;
  }
  if (cell.status === "in-progress") {
    const label =
      cell.answered != null && cell.total != null ? `${cell.answered}/${cell.total}` : "진행";
    return (
      <span
        title={
          cell.firstCorrect != null ? `진행 중 · 첫 시도 정답 ${cell.firstCorrect}개` : "진행 중"
        }
        className="inline-flex rounded-full border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-blue-700"
      >
        {label}
      </span>
    );
  }
  if (typeof cell.score === "number") {
    return (
      <span className={cn("text-[13px] font-bold tabular-nums", scoreText(cell.score))}>
        {cell.score}%
      </span>
    );
  }
  return (
    <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-700">
      완료
    </span>
  );
}

// ── 본체 ────────────────────────────────────────────────────────────────────

export function StudentStudyAnalyticsTab({
  studentId,
  studentName,
  onDeploy,
}: {
  studentId: string;
  studentName: string;
  /**
   * 취약점 → 과제 배포 배선 지점(v3 §D2-1) — 셸(student-hub-client)의
   * openDeployComposer. A-4 배선 전 optional — 미배선 시 취약 단어 카드
   * CTA·어법 포인트 WeakSpotRow 를 렌더하지 않는다(현행 렌더 무변경 폴백).
   */
  onDeploy?: (spots: WeakSpot[], source: "study") => void;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  /** 지문(학습지) 스코프 — null = 전체 (spec §4.2.1) */
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** 피드 보조 필터 */
  const [feedMode, setFeedMode] = useState<"all" | "graded" | "wrong">("all");
  /** 압축된 무판정 그룹 중 펼친 것 */
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set());
  /** 클릭한 문항 — 상세 시트 */
  const [detailEvent, setDetailEvent] = useState<StudentStudyEventRow | null>(null);

  // 15초 폴링 — 탭 비가시 시 중단, 재가시 시 즉시 1회 갱신 (spec §3.3 준용,
  // 인라인 이펙트를 usePollingAction 으로 추출 — 동작 계약 동일)
  const { data, error, fetchedAt, refresh } = usePollingAction<StudentStudyAnalytics>(
    async () => {
      const res = await getStudentStudyAnalytics({ studentId });
      return res.success && res.data
        ? { ok: true, data: res.data }
        : { ok: false, error: res.error ?? "학습지 기록을 불러오지 못했습니다." };
    },
    [studentId],
  );

  // "지금 학습 중" — 마지막 활동이 갱신 시점 기준 3분 이내
  const isLive = useMemo(() => {
    if (!data?.lastActivityAt || fetchedAt == null) return false;
    const t = Date.parse(data.lastActivityAt);
    return Number.isFinite(t) && fetchedAt - t < LIVE_WINDOW_MS;
  }, [data, fetchedAt]);

  // 선택한 학습지가 폴링 갱신에서 사라졌으면 전체로 되돌린다(spec §4.2.1)
  const activeId = useMemo(() => {
    if (!selectedId || !data) return null;
    return data.assignments.some((a) => a.assignmentId === selectedId) ? selectedId : null;
  }, [selectedId, data]);
  /** 현재 스코프의 취약점 집계 — 전체 또는 선택한 학습지 */
  const view: StudentStudyBreakdown = useMemo(() => {
    const empty: StudentStudyBreakdown = {
      skills: {},
      sentences: [],
      grammarCodes: [],
      words: [],
    };
    if (!data) return empty;
    if (!activeId) return data;
    return data.byAssignment[activeId] ?? empty;
  }, [data, activeId]);

  // 「이 학습지 다시 보내기」 — 선택한 학습지의 WORKSHEET 배포 타깃(§D2-2).
  // 시드는 현재 스코프 취약 단어(view.words) 전량이 같은 타깃을 공유한다.
  const activeRow = useMemo(
    () =>
      activeId
        ? (data?.assignments.find((a) => a.assignmentId === activeId) ?? null)
        : null,
    [data, activeId],
  );
  const worksheetDeploy = useMemo(() => worksheetDeployOf(activeRow), [activeRow]);
  const resendWorksheet = useCallback(() => {
    if (!onDeploy || !worksheetDeploy) return;
    const spots = view.words.map((w) => toWordSpot(w, worksheetDeploy));
    if (spots.length === 0) return;
    onDeploy(spots, "study");
  }, [onDeploy, worksheetDeploy, view]);

  // 피드 — 지문 스코프 + 보조 필터. 건수는 스코프 기준으로 센다.
  const scopedEvents = useMemo(() => {
    if (!data) return [];
    return activeId
      ? data.recentEvents.filter((e) => e.assignmentId === activeId)
      : data.recentEvents;
  }, [data, activeId]);

  const feedCounts = useMemo(() => {
    let graded = 0;
    let wrong = 0;
    for (const e of scopedEvents) {
      if (e.correct === null) continue;
      graded += 1;
      if (e.correct === false) wrong += 1;
    }
    return { all: scopedEvents.length, graded, wrong };
  }, [scopedEvents]);

  const feedItems = useMemo(() => {
    const filtered =
      feedMode === "all"
        ? scopedEvents
        : feedMode === "graded"
          ? scopedEvents.filter((e) => e.correct !== null)
          : scopedEvents.filter((e) => e.correct === false);
    return buildFeedItems(filtered);
  }, [scopedEvents, feedMode]);

  // 상세 시트의 "같은 단어(없으면 같은 문항) 최근 기록"
  const relatedEvents = useMemo(() => {
    if (!detailEvent || !data) return [];
    const self = eventKey(detailEvent);
    return data.recentEvents
      .filter((e) => {
        if (eventKey(e) === self) return false;
        return detailEvent.wordKey
          ? e.wordKey === detailEvent.wordKey
          : e.itemKey === detailEvent.itemKey && e.assignmentId === detailEvent.assignmentId;
      })
      .slice(0, 8);
  }, [detailEvent, data]);

  // planStale 소생(spec §4.2.2 계약 복구) — 이벤트 행이 아니라 assignments 행에서
  // 이 학습지의 학생 state planHash 를 룩업해 문항 상세 팝업에 전달한다.
  const detailPlanHash = useMemo(() => {
    if (!detailEvent || !data) return null;
    return (
      data.assignments.find((a) => a.assignmentId === detailEvent.assignmentId)?.planHash ?? null
    );
  }, [detailEvent, data]);

  /** 중복 제목 구분 라벨 — 칩·매트릭스 공용 */
  const labels = useMemo(
    () => buildLabelMap(data?.assignments ?? []),
    [data],
  );

  const toggleGroup = useCallback((key: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // 영역별 숙달도 행 — STUDY_SKILL_LABELS 순서, 기록 있는 스킬만
  const skillRows = useMemo(() => {
    return (Object.keys(STUDY_SKILL_LABELS) as StudySkill[])
      .map((skill) => {
        const agg = view.skills[skill];
        if (!agg || agg.total === 0) return null;
        return {
          skill,
          label: STUDY_SKILL_LABELS[skill],
          correct: agg.correct,
          total: agg.total,
          pct: Math.round((agg.correct / agg.total) * 100),
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);
  }, [view]);

  // 매트릭스 열 — 등장하는 스테이지만, 카탈로그 순서 + 미지 스테이지는 뒤에
  const stageIds = useMemo(() => {
    if (!data) return [];
    const present = new Set<string>();
    for (const a of data.assignments) {
      for (const id of Object.keys(a.stages)) present.add(id);
    }
    const ordered = STAGE_ORDER.filter((id) => present.has(id));
    const extras = [...present].filter((id) => !STAGE_ORDER.includes(id)).sort();
    return [...ordered, ...extras];
  }, [data]);

  if (!data && !error) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white py-16 text-[13px] text-slate-400">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        학습지 기록을 불러오는 중입니다
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-slate-200 bg-white py-12">
        <p className="text-[13px] text-slate-500">{error}</p>
        <button
          type="button"
          onClick={refresh}
          className="h-8 rounded-md border border-slate-200 bg-white px-3 text-[13px] font-semibold text-slate-600 transition-colors hover:bg-slate-50"
        >
          다시 시도
        </button>
      </div>
    );
  }

  // 빈 상태 — 학습지 스터디 기록 0 (spec §4.2 · R9 TabEmpty 정본, C-1).
  // 문구는 D6-3 사전 단일 소스 — 문장 경계에서만 제목/설명으로 나눈다(리터럴 금지).
  if (data.assignments.length === 0 && data.recentEvents.length === 0) {
    const [emptyTitle, emptyDescription] = EMPTY_STATES.STUDY_TAB.message.split(". ");
    return (
      <TabEmpty
        icon={BookOpen}
        title={emptyTitle}
        description={emptyDescription}
        cta={
          // 허브 탭 상태는 부모 소유 — 전체 내비게이션으로 ?tab=tasks 딥링크 진입
          <a
            href="?tab=tasks"
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-blue-600 px-4 text-[13px] font-semibold text-white transition-colors hover:bg-blue-700"
          >
            {EMPTY_STATES.STUDY_TAB.ctaLabel}
            <ArrowRight className="size-4" aria-hidden />
          </a>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* 헤더 한 줄 — 좌: 탭 한 문장(HUB_TAB_ONELINERS 단일 소스 — 허브 공통
          스트립 대신 여기서 렌더, §4.1) · 우: 갱신 상태(kit RefreshStrip 정본,
          규칙 R6). 두 요소가 각자 한 줄을 차지하지 않게 한 줄로 합친다 */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[13px] text-slate-500">
          <Info className="size-3.5 shrink-0 text-slate-300" aria-hidden />
          {HUB_TAB_ONELINERS.study}
        </p>
        <RefreshStrip fetchedAt={fetchedAt} error={error} onRefresh={refresh} />
      </div>

      {/* 지문(학습지) 스코프 필터 — 탭 전체에 적용 */}
      <WorksheetFilterBar
        assignments={data.assignments}
        labels={labels}
        selectedId={activeId}
        onSelect={setSelectedId}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        {/* 실시간 학습 피드 */}
        <AnalyticsCard
          className="h-[420px]"
          icon={<Activity className="size-4 text-blue-600" aria-hidden />}
          title="실시간 학습 피드"
          aside={
            isLive ? (
              <span className="flex items-center gap-1.5 text-[12px] font-semibold text-blue-700">
                <span className="relative flex size-2" aria-hidden>
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
                  <span className="relative inline-flex size-2 rounded-full bg-blue-600" />
                </span>
                지금 학습 중
              </span>
            ) : data.lastActivityAt ? (
              <span className="text-[12px] tabular-nums text-slate-400">
                마지막 활동 {fmtAt(data.lastActivityAt)}
              </span>
            ) : null
          }
          toolbar={
            <div className="inline-flex rounded-md border border-slate-200 bg-slate-50 p-0.5">
              {(
                [
                  ["all", "전체", feedCounts.all],
                  ["graded", "채점", feedCounts.graded],
                  ["wrong", "오답", feedCounts.wrong],
                ] as const
              ).map(([mode, label, count]) => (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={feedMode === mode}
                  onClick={() => setFeedMode(mode)}
                  className={cn(
                    "rounded px-2 py-1 text-[12px] font-semibold transition-colors",
                    feedMode === mode
                      ? "bg-white text-blue-700 shadow-sm"
                      : "text-slate-500 hover:text-slate-700",
                  )}
                >
                  {label}
                  <span className="ml-1 tabular-nums text-slate-400">{count}</span>
                </button>
              ))}
            </div>
          }
        >
          {feedItems.length === 0 ? (
            <CardEmpty
              text={
                scopedEvents.length === 0
                  ? activeId
                    ? "이 학습지에는 아직 문항 기록이 없습니다."
                    : "아직 문항 기록이 없습니다."
                  : feedMode === "wrong"
                    ? "이 범위에서 틀린 문항이 없습니다."
                    : "채점된 문항이 없습니다."
              }
            />
          ) : (
            <>
              <ul className="flex flex-col">
                {feedItems.map((item) =>
                  item.kind === "event" ? (
                    <FeedRow key={item.key} ev={item.ev} labels={labels} onOpen={setDetailEvent} />
                  ) : (
                    <FeedGroupRow
                      key={item.key}
                      item={item}
                      labels={labels}
                      expanded={expandedGroups.has(item.key)}
                      onToggle={() => toggleGroup(item.key)}
                      onOpen={setDetailEvent}
                    />
                  ),
                )}
              </ul>
              {data.eventsTruncated ? (
                <p className="pt-2 text-center text-[11px] text-slate-400">
                  최근 200건 기준입니다.
                </p>
              ) : null}
            </>
          )}
        </AnalyticsCard>

        {/* 영역별 첫 시도 정답률 — 구 「영역별 숙달도」 개칭(D6 동음이의 해소) +
            첫 노출 ⓘ(규칙 R10). v3 1차 CTA 없음(축→콘텐츠 자동 매핑 부정직) */}
        <AnalyticsCard
          className="h-[420px]"
          icon={<BarChart3 className="size-4 text-blue-600" aria-hidden />}
          title={METRIC_LABELS.FIRST_TRY_RATE_BY_AXIS}
          aside={
            <span className="flex items-center gap-1.5 text-[12px] text-slate-400">
              {activeId ? "이 학습지 기준" : "전체 학습지 누적"}
              <MetricHelpTip text={METRIC_HELP.FIRST_TRY_RATE} />
            </span>
          }
        >
          {skillRows.length === 0 ? (
            <CardEmpty
              text={
                activeId
                  ? "이 학습지에는 아직 채점된 문항이 없습니다."
                  : "아직 채점된 문항이 없습니다."
              }
            />
          ) : (
            <div className="flex flex-col gap-3 pt-1">
              {skillRows.map((row) => (
                <div key={row.skill} className="flex items-center gap-2.5">
                  <span className="w-[72px] shrink-0 text-[13px] text-slate-600">{row.label}</span>
                  <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <span
                      className={cn("block h-full rounded-full", scoreBar(row.pct))}
                      style={{ width: `${Math.min(100, Math.max(0, row.pct))}%` }}
                    />
                  </span>
                  <span className="w-24 shrink-0 text-right text-[12px] tabular-nums text-slate-500">
                    <span className={cn("text-[13px] font-bold", scoreText(row.pct))}>
                      {row.pct}%
                    </span>{" "}
                    · {row.correct}/{row.total}
                  </span>
                </div>
              ))}
            </div>
          )}
        </AnalyticsCard>

        {/* 자주 틀린 단어 — 카드 제목은 M-6 개칭 사전(ANALYTICS_CARD_TITLES) 소비 */}
        <AnalyticsCard
          className="h-[360px]"
          icon={<BookA className="size-4 text-rose-500" aria-hidden />}
          title={
            activeId
              ? ANALYTICS_CARD_TITLES.WEAK_WORDS_SCOPED
              : ANALYTICS_CARD_TITLES.WEAK_WORDS_ALL
          }
          aside={
            <span className="flex items-center gap-1.5">
              {/* 「이 학습지 다시 보내기」 — 지문 필터로 학습지 선택 시 활성(§D2-2).
                  비활성 사유는 툴팁으로만(§D2-1): 미선택 / refId 미확보 / 취약 기록 없음 */}
              {onDeploy ? (
                <WeakPointCta
                  variant="card"
                  label={CTA_LABELS.RESEND_WORKSHEET}
                  onClick={resendWorksheet}
                  disabled={!activeId || !worksheetDeploy || view.words.length === 0}
                  disabledTitle={
                    !activeId
                      ? CTA_DISABLED_TITLES.RESEND_WORKSHEET_NEEDS_SCOPE
                      : !worksheetDeploy
                        ? CTA_DISABLED_TITLES.RESEND_WORKSHEET_UNAVAILABLE
                        : CTA_DISABLED_TITLES.RESEND_WORKSHEET_NO_WEAKNESS
                  }
                />
              ) : null}
              <button
                type="button"
                onClick={() => setDrawerOpen(true)}
                className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 text-[12px] font-semibold text-slate-600 transition-colors hover:bg-slate-50 hover:text-blue-700"
              >
                전체 보기
                <ArrowRight className="size-3" aria-hidden />
              </button>
            </span>
          }
        >
          {view.words.length === 0 ? (
            <CardEmpty
              text={activeId ? "이 학습지에서 틀린 단어가 없습니다." : "아직 틀린 단어가 없습니다."}
            />
          ) : (
            <ul className="flex flex-col divide-y divide-slate-50">
              {view.words.map((w) => (
                <li key={w.word} className="flex items-center gap-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-serif text-[14px] font-semibold text-slate-900">
                      {w.word}
                    </p>
                    <p className="truncate text-[12px] text-slate-500">
                      {w.meaning ?? "뜻 정보 없음"}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-bold tabular-nums text-rose-600">
                    오답 {w.wrongCount}회
                  </span>
                  <span className="shrink-0 text-[12px] tabular-nums text-slate-400">
                    시도 {w.totalCount}회
                  </span>
                </li>
              ))}
            </ul>
          )}
        </AnalyticsCard>

        {/* 보충 필요 문장·어법 포인트 — 카드 제목은 M-6 개칭 사전 소비 */}
        <AnalyticsCard
          className="h-[360px]"
          icon={<AlertTriangle className="size-4 text-rose-500" aria-hidden />}
          title={ANALYTICS_CARD_TITLES.WEAK_POINTS}
          aside={
            <span className="text-[12px] text-slate-400">
              첫 시도 오답률 순 · {activeId ? "이 학습지 기준" : "전체 누적"}
            </span>
          }
        >
          {view.sentences.length === 0 && view.grammarCodes.length === 0 ? (
            <CardEmpty
              text={
                activeId ? "이 학습지에는 집계된 오답이 없습니다." : "아직 집계된 오답이 없습니다."
              }
            />
          ) : (
            <div className="flex flex-col gap-4">
              <div>
                <p className="mb-2 text-[12px] font-semibold text-slate-500">
                  {ANALYTICS_CARD_TITLES.WEAK_SENTENCES_SUBHEAD}
                </p>
                {view.sentences.length === 0 ? (
                  <p className="text-[12px] text-slate-400">문장 단위 오답이 없습니다.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {view.sentences.map((s) => (
                      <span
                        key={s.sentenceNo}
                        className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-2 py-1 text-[11.5px] font-medium text-rose-700"
                      >
                        <span className="font-bold">문장 {s.sentenceNo}</span>
                        <span className="tabular-nums">
                          오답률 {s.wrongRate}% · {s.attempts}회
                        </span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <p className="mb-2 text-[12px] font-semibold text-slate-500">어법 포인트</p>
                {view.grammarCodes.length === 0 ? (
                  <p className="text-[12px] text-slate-400">어법 문항 기록이 없습니다.</p>
                ) : onDeploy ? (
                  // v3 §D1-3 ② — 상시 CTA 행. metric 은 첫 시도 정답률(100-오답률),
                  // 말 설명은 오답률 문맥(wrongExplain — 「첫 시도 A회 중 W회 오답」).
                  // 배포는 grammar-code-map 개념 프리셋(빈 배열이면 유닛 강등, §D2-2).
                  <div className="flex flex-col divide-y divide-slate-50">
                    {view.grammarCodes.map((g) => (
                      <WeakSpotRow
                        key={g.code}
                        spot={toGrammarCodeSpot(g)}
                        scoreExplain={wrongExplain({
                          attempts: g.attempts,
                          wrong: g.wrongCount,
                        })}
                        onDeploy={(spot) => onDeploy([spot], "study")}
                        disabledTitle={CTA_DISABLED_TITLES.GRAMMAR_CODE_UNMAPPED}
                        labelClassName="w-36"
                      />
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {view.grammarCodes.map((g) => (
                      <div key={g.code} className="flex items-center gap-2">
                        <span className="w-36 shrink-0 truncate text-[13px] text-slate-600">
                          <span className="font-bold text-slate-400">({g.code})</span>{" "}
                          {grammarLabel(g.code)}
                        </span>
                        <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-100">
                          <span
                            className={cn(
                              "block h-full rounded-full",
                              g.wrongRate >= 50 ? "bg-rose-500" : "bg-blue-600",
                            )}
                            style={{ width: `${Math.min(100, Math.max(0, g.wrongRate))}%` }}
                          />
                        </span>
                        <span className="w-20 shrink-0 text-right text-[12px] tabular-nums text-slate-500">
                          <span
                            className={cn(
                              "font-bold",
                              g.wrongRate >= 50 ? "text-rose-600" : "text-slate-700",
                            )}
                          >
                            {g.wrongRate}%
                          </span>{" "}
                          · {g.attempts}회
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </AnalyticsCard>
      </div>

      {/* 학습지별 진행 매트릭스 — 하단 전폭. 카드 셸은 kit AnalyticsCard 정본
          (규칙 R2, N-21) — 세로 상한·가로 스크롤은 내부 단일 컨테이너가 계속
          소유한다(sticky thead 의 스크롤 조상 유지, 시험 탭 테이블 카드 관용 동형) */}
      <AnalyticsCard
        icon={<LayoutGrid className="size-4 text-blue-600" aria-hidden />}
        title="학습지별 진행 매트릭스"
        aside={
          <span className="text-[12px] text-slate-400">
            학습지를 누르면 그 지문만 분석합니다 · 완료 단계는 첫 시도 정답률(%) · 진행 중은 푼
            문항/전체
          </span>
        }
      >
        <div className="max-h-[440px] overflow-auto">
          <table className="w-full min-w-[720px] text-left">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-slate-100 bg-slate-50 text-[12px] text-slate-500">
                <th className="whitespace-nowrap px-3 py-2 font-medium">학습지</th>
                {stageIds.map((id) => (
                  <th key={id} className="whitespace-nowrap px-2 py-2 text-center font-medium">
                    {stageTitle(id)}
                  </th>
                ))}
                <th className="whitespace-nowrap px-3 py-2 text-right font-medium">숙달도</th>
                <th className="whitespace-nowrap px-3 py-2 text-right font-medium">총 학습</th>
                <th className="whitespace-nowrap px-3 py-2 font-medium">마지막 활동</th>
              </tr>
            </thead>
            <tbody>
              {data.assignments.map((a) => (
                <tr
                  key={a.assignmentId}
                  aria-selected={activeId === a.assignmentId}
                  className={cn(
                    "cursor-pointer border-b border-slate-50 text-[13px] text-slate-700 transition-colors last:border-0 hover:bg-blue-50/40",
                    activeId === a.assignmentId && "bg-blue-50/70",
                  )}
                  onClick={() =>
                    setSelectedId(activeId === a.assignmentId ? null : a.assignmentId)
                  }
                >
                  <td className="max-w-[260px] px-3 py-2">
                    <button
                      type="button"
                      aria-pressed={activeId === a.assignmentId}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedId(activeId === a.assignmentId ? null : a.assignmentId);
                      }}
                      className={cn(
                        "flex w-full items-center gap-1.5 truncate text-left font-semibold transition-colors",
                        activeId === a.assignmentId
                          ? "text-blue-700"
                          : "text-slate-800 hover:text-blue-700",
                      )}
                      title={labels.get(a.assignmentId) ?? a.title}
                    >
                      <span className="truncate">{labels.get(a.assignmentId) ?? a.title}</span>
                      {a.wrongCount > 0 ? (
                        <span className="shrink-0 rounded-full bg-rose-50 px-1.5 text-[11px] font-bold tabular-nums text-rose-600">
                          {a.wrongCount}
                        </span>
                      ) : null}
                    </button>
                  </td>
                  {stageIds.map((id) => (
                    <td key={id} className="px-2 py-2 text-center">
                      <MatrixCell cell={a.stages[id]} />
                    </td>
                  ))}
                  <td className="px-3 py-2 text-right">
                    {a.masteryPct != null ? (
                      <span
                        className={cn("text-[13px] font-bold tabular-nums", scoreText(a.masteryPct))}
                      >
                        {a.masteryPct}%
                      </span>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right text-[12px] tabular-nums text-slate-500">
                    {fmtDuration(a.totalTimeMs)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-[12px] tabular-nums text-slate-500">
                    {fmtAt(a.lastActivityAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </AnalyticsCard>

      {/* 취약 단어 상세 이력 — 기존 드로어 재사용. assignmentId="" 는
          getStudentWeakWords 의 `input.assignmentId ? … : {}` 분기에서 falsy 로
          강등되어 두 스코프 모두 전체 누적으로 동작한다(확인 완료). */}
      <StudyStudentVocabDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        studentId={studentId}
        studentName={studentName}
        assignmentId=""
      />

      {/* 피드 문항 클릭 상세 (spec §4.2.2) */}
      <EventDetailModal
        event={detailEvent}
        related={relatedEvents}
        labels={labels}
        studentId={studentId}
        planHash={detailPlanHash}
        onClose={() => setDetailEvent(null)}
        onFilterAssignment={setSelectedId}
        assignmentFiltered={activeId !== null}
      />
    </div>
  );
}
