"use client";

// ============================================================================
// 클래스 스튜디오 — 지문 스튜디오 클라이언트 (docs/class-studio-spec.md §3.0·§3.4, 2026-08-10 재작업)
//
// 골격은 공통 셸(StudioShell §3.0 — 브레드크럼·타이틀 행·시트 배경)로 렌더하고,
// xl 이상에서 2컬럼(본문 + 우측 420px sticky 학생 에뮬레이터 §3.6), xl 미만은
// 타이틀 행 「학생 화면 미리보기」 버튼 → 전폭 시트로 같은 에뮬레이터를 띄운다.
//
// 모듈 카드가 1급 표면 — 각 카드가 자기 분석을 스스로 시작한다(섹션 종량제 §3.4.1).
// 카드 4상태(스펙 표 정본): needs → generating → ready → 실패(환불 안내·다시 시도).
// **4상태가 같은 골격을 쓴다**(§3.4 A, 2026-08-10 5렌즈 감사 반영): 좌측 20px 상태 슬롯
// (체크박스/스피너/자리표시) → 제목 좌측선 고정, 부제 2줄 높이 예약, 액션 mt-auto 바닥
// 정렬. 시간 표기는 needs("분석 약 1분 소요", 11px slate-400)와 ready("N문항 · 약 N분",
// 12px slate-600)를 자리·크기·색으로 분리한다 — 같은 슬롯이면 분석 소요가 학습 시간으로
// 오독된다(L4-02·L2-02·L5-08). 크레딧 표기는 「· N크레딧」 한 형식(L2-14).
// "분석 중" 표시는 클릭한 카드 하나만(§3.4.1-11 재개정) — 발사 body 에 sourceModule
// 을 실어 서버 판정(analyzingSourceModule)과 발사 오버레이가 같은 카드를 가리키고,
// 공유 기반으로 함께 열린 카드는 완료 토스트가 덤 해금으로 알린다(문구 정본:
// "{주 모듈} 분석 완료 — {덤 라벨}도 함께 준비되었습니다").
// 분석은 fast 라우트 stream:true SSE(§3.4.1-12)로 발사 — 사고/본문 델타를 공유
// StreamPreviewPane 에 흘리고, done/error 프레임에서 기존 완료·402 처리로 합류한다.
// 스트림 단절은 치명 아님 — 5초 폴링이 실상태를 복원한다.
// 실전 문제 특례: 분석 섹션이 아니라 실전 학습지 생성물(+5크레딧, 기존 워크시트 라우트) —
// targetSections 와 includeWorksheet 는 절대 한 요청에 싣지 않는다(서버 400).
// 배포 바(sticky)·배포 다이얼로그·미리보기 시트·이력(새로 분석=구형 정액 경로)·
// 코치마크 3(run-analysis)·4(pick-modules)·5(deploy)·스테일 고지는 기존 계약 유지.
//
// §M(26-08-22) 모바일 학습 임시 숨김: SHOW_STUDIO_MOBILE_LEARNING=false(기본)면
// 모바일 배포 계열 — sticky 배포 바(+본문 하단 예약 여백)·DeployDialog·deploy
// 코치마크·결과 탭 안내 링크(「자세한 결과는 결과 탭에서」·「결과 보기」)·
// [학생 화면 미리보기] 버튼/시트·우측 420px 에뮬레이터 레일 — 을 렌더하지 않고,
// 본문은 단일 컬럼(wide 해제 = 셸 max-w-5xl)으로 재구성된다. 분석 실행·모듈
// 구성(코치마크 run-analysis/pick-modules)·원문 보기·이력 목록은 존치. 코드
// 경로는 전부 존치 — 복구는 env 1줄(NEXT_PUBLIC_SHOW_STUDIO_MOBILE_LEARNING=true).
// ============================================================================

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BookOpenText,
  Check,
  ChevronDown,
  ChevronRight,
  Eye,
  Loader2,
  Plus,
  RefreshCw,
  ScanSearch,
  Send,
  Smartphone,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  getStudioPassageDetail,
  type StudioModuleCard,
  type StudioPassageDetail,
} from "@/actions/studio/passages";
import {
  StreamPreviewPane,
  type StreamPreview,
} from "@/app/(director)/director/workbench/generate/stream-preview-pane";
import { CoachMark } from "@/components/studio/coach";
import { StudioShell } from "@/components/studio/shell";
import { FULL_ANALYSIS_SECTIONS } from "@/lib/studio/module-sections";
import {
  estMinTone,
  STUDIO_MODULE_BY_ID,
  type StudioModuleId,
} from "@/lib/studio/modules";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import { DeployDialog } from "@/components/studio/deploy-dialog";
import { StudentEmulator } from "./emulator/student-emulator";
import { ModulePreviewSheet } from "./module-preview-sheet";

// §M 모바일 학습 임시 숨김 스위치 — 모듈 상수로만 소비한다(prop 화 금지:
// memo·시그니처 메모 방어선 무접촉). false 가 기본값 = 숨김이 새 정상.
const SHOW_MOBILE = FEATURE_FLAGS.SHOW_STUDIO_MOBILE_LEARNING;

// ── 표시 유틸 ────────────────────────────────────────────────────────────────

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function safeJson(res: Response): Promise<Record<string, unknown>> {
  try {
    const body = (await res.json()) as unknown;
    return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** 분석 발사 대상 — 카드(모듈 id) 또는 전체 버튼/새로 분석(구형 정액 경로). */
type LaunchTarget = StudioModuleId | "full" | "reanalyze";

/**
 * 서버 파생 실패 카드(스펙 §3.4.1-11, 검수 UI-4) — 최근 실패 잡의 대상 섹션으로
 * "그 잡이 만들려던 모듈"(missing ⊆ 실패 대상)을 복원한다. 클라 메모리 전용이면
 * 새로고침·재진입·타기기에서 실패·환불 안내가 소실된다.
 */
function failedModulesFromServer(detail: StudioPassageDetail): StudioModuleId[] {
  const failed = detail.lastFailedSections;
  if (!failed || failed.length === 0) return [];
  const failedSet = new Set(failed);
  return detail.modules
    .filter(
      (m) =>
        m.id !== "exam" &&
        m.state === "needs" &&
        m.missingSections.length > 0 &&
        m.missingSections.every((k) => failedSet.has(k)),
    )
    .map((m) => m.id);
}

// ── 분석 SSE 소비(§3.4.1-12) ─────────────────────────────────────────────────

/**
 * fast 라우트 stream:true 응답을 읽어 미리보기를 흘리고 done/error 프레임을
 * 돌려준다. 프레임 계약(t: phase|r|c|done|error, data: 라인)은 stream-llm.ts 와
 * use-passage-queue.ts 소비처를 미러 — 단 stage 는 발사 모듈 라벨로 고정한다
 * (§3.4.1-12: 스튜디오에서는 내부 섹션명보다 클릭한 모듈이 의미 단위다).
 * 파싱 실패·단절은 여기서 삼키지 않고 throw — 호출부 try/catch 가 5초 폴링으로
 * 실상태를 복원한다(치명 아님).
 */
async function consumeAnalysisSse(
  body: ReadableStream<Uint8Array>,
  stageLabel: string,
  onPreview: (preview: StreamPreview) => void,
): Promise<{
  doneFrame: Record<string, unknown> | null;
  errorFrame: Record<string, unknown> | null;
}> {
  const startedAt = Date.now();
  let outputStartedAt: number | undefined;
  let reasoningTail = "";
  let contentTail = "";
  let lastEmit = 0;

  const emitPreview = (force = false) => {
    const now = Date.now();
    if (!force && now - lastEmit < 120) return;
    lastEmit = now;
    onPreview({
      phase: outputStartedAt ? "generating" : "thinking",
      startedAt,
      outputStartedAt,
      tail: (outputStartedAt ? contentTail : reasoningTail).slice(-420),
      stage: stageLabel,
    });
  };

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let doneFrame: Record<string, unknown> | null = null;
  let errorFrame: Record<string, unknown> | null = null;
  let stop = false;

  // 개통 즉시 패널 마운트 — 델타 0프레임 경로(캐시·이미 준비됨)에서도 스트리밍이
  // "안 되는" 것처럼 보이지 않게 한다(26-07-25 실사고와 동일 원칙).
  emitPreview(true);

  while (!stop) {
    const chunk = await reader.read();
    if (chunk.done) break;
    buffer += decoder.decode(chunk.value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      let event: Record<string, unknown>;
      try {
        event = JSON.parse(payload) as Record<string, unknown>;
      } catch {
        continue;
      }
      if (event.t === "phase") {
        // 단계 전환 — 사고 단계로 되감아 다음 콜의 사고 시간을 다시 센다(소비처 미러).
        outputStartedAt = undefined;
        contentTail = "";
        reasoningTail = "";
        emitPreview(true);
      } else if (event.t === "r" && typeof event.d === "string") {
        reasoningTail = (reasoningTail + event.d).slice(-900);
        emitPreview();
      } else if (event.t === "c" && typeof event.d === "string") {
        if (!outputStartedAt) outputStartedAt = Date.now();
        contentTail = (contentTail + event.d).slice(-900);
        emitPreview();
      } else if (event.t === "error") {
        // 스트림 모드에서는 402 등 HTTP 상태가 프레임(status)으로 온다 — 호출부 분기.
        errorFrame = event;
        stop = true;
        break;
      } else if (event.t === "done") {
        doneFrame = event;
      }
    }
  }
  if (stop) await reader.cancel().catch(() => {});
  return { doneFrame, errorFrame };
}

// ── 모듈 카드 ────────────────────────────────────────────────────────────────

/**
 * 카드 좌측 20px **상태 슬롯** 공통 클래스 — 체크박스(ready)·스피너(generating)·
 * 자리표시(needs/자료없음)가 전부 같은 좌표를 쓴다. 이 슬롯이 없으면 모듈명 좌측선이
 * 카드 상태마다 달라져 한 그리드가 톱니처럼 보인다(감사 L2-01·R3-10).
 */
const CARD_SLOT = "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded";

/**
 * 카드 상단(상태 슬롯 + 모듈명 + 부제) — **4상태가 같은 골격**을 쓰게 하는 조각(§3.4 A).
 * 부제는 2줄 높이를 항상 예약한다(min-h-8 = text-xs 2줄) — 부제 줄 수 차이가 그대로
 * 아래 액션 밑변을 밀어 같은 행의 버튼이 계단으로 어긋나던 결함을 원천 차단(L2-04·L4-13).
 */
function CardHead({
  slot,
  label,
  subtitle,
  labelTone = "text-slate-900",
}: {
  slot: ReactNode;
  label: string;
  subtitle: string;
  labelTone?: string;
}) {
  return (
    <>
      {/* pr-8 = 우상단 미리보기 아이콘 자리(28px + 여백) 확보 — 모듈명은 절대 자르지 않는다 */}
      <span className="flex min-w-0 items-start gap-2.5 pr-8">
        {slot}
        <span className={`text-sm font-bold break-keep ${labelTone}`}>{label}</span>
      </span>
      <span className="mt-2 block min-h-8 text-xs leading-4 text-slate-500 break-keep">
        {subtitle}
      </span>
    </>
  );
}

/** 카드 액션 영역 — `mt-auto` 로 카드 바닥에 고정(높이 stretch 로 생긴 빈 공간 흡수, L4-14). */
function CardFoot({ children }: { children: ReactNode }) {
  return <div className="mt-auto px-4 pb-3.5 pt-2">{children}</div>;
}

function ModuleCard({
  card,
  checked,
  failed,
  analyzeDisabled,
  hasWorksheetSection,
  examLocked,
  onToggle,
  onPreview,
  onAnalyze,
}: {
  card: StudioModuleCard;
  checked: boolean;
  /** 직전 분석 실패(환불됨) — 환불 안내 + 다시 시도 */
  failed: boolean;
  /** 지문당 동시 1잡 — 다른 생성이 진행 중이면 분석 버튼 잠금 */
  analyzeDisabled: boolean;
  hasWorksheetSection: boolean;
  /** 실전 특례 ②(스펙 §3.4) — 리포트가 하나도 없으면 실전 버튼은 막다른 404 라 비활성 */
  examLocked: boolean;
  onToggle: () => void;
  onPreview: () => void;
  /** needs 카드의 생성 시작 — exam 이면 워크시트 라우트, 그 외엔 섹션 종량제 */
  onAnalyze: () => void;
}) {
  const isExam = card.id === "exam";

  // 생성 중 — 이 카드만 스피너(다른 카드의 분석 버튼은 부모가 잠근다).
  // 스피너는 체크박스와 같은 20px 슬롯에 들어간다 — 상태가 바뀌어도 제목이 움직이지 않는다.
  if (card.state === "generating") {
    return (
      <div className="flex h-full flex-col rounded-xl border border-blue-200 bg-white">
        <div className="px-4 pt-4">
          <CardHead
            slot={
              <span aria-hidden className={CARD_SLOT}>
                <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
              </span>
            }
            label={card.label}
            subtitle={card.subtitle}
          />
        </div>
        <CardFoot>
          <p className="text-xs font-medium text-blue-600 break-keep">
            {isExam ? "실전 문제 생성 중…" : `${card.label} 분석 중…`}
          </p>
        </CardFoot>
      </div>
    );
  }

  if (card.state === "needs") {
    // 아직 선택할 수 없는 카드의 체크박스 자리 — 좌측선은 지키되 **점선**으로 두어
    // "지금 누를 수 있는 빈 체크박스"로 오인되지 않게 한다(ready 는 실선 + 흰 배경).
    const placeholderSlot = (
      <span
        aria-hidden
        className={`${CARD_SLOT} border border-dashed border-slate-300 bg-slate-50`}
      />
    );

    // exam 특례의 특례: 실전 학습지는 있는데 성립 문항이 0 — 재과금 유도 금지, 자료 없음 처리
    if (isExam && hasWorksheetSection) {
      return (
        <div className="flex h-full flex-col rounded-xl border border-slate-200 bg-white opacity-60">
          <div className="px-4 pt-4">
            <CardHead
              slot={placeholderSlot}
              label={card.label}
              subtitle={card.subtitle}
              labelTone="text-slate-500"
            />
          </div>
          <CardFoot>
            <p className="text-xs text-slate-400 break-keep">이 지문에는 해당 자료가 없습니다</p>
          </CardFoot>
        </div>
      );
    }
    const locked = isExam && examLocked;
    return (
      <div className="flex h-full flex-col rounded-xl border border-slate-200 bg-white">
        <div className="px-4 pt-4">
          <CardHead slot={placeholderSlot} label={card.label} subtitle={card.subtitle} />
        </div>
        <CardFoot>
          {/* 시간 표기에는 주어("분석")를 붙이고 크기·색·자리를 ready 의 학습 시간과 분리한다.
              같은 슬롯·같은 서체로 두면 "1분짜리 학습"으로 오독된다(감사 L4-02·L2-02·L5-08). */}
          {failed ? (
            <p className="text-[11px] font-medium text-rose-600 break-keep">
              분석에 실패했습니다 — 크레딧은 환불되었습니다
            </p>
          ) : locked ? (
            <p className="text-[11px] text-slate-400 break-keep">
              다른 모듈을 먼저 분석하면 생성할 수 있습니다
            </p>
          ) : isExam ? null : (
            <p className="text-[11px] text-slate-400 break-keep">분석 약 1분 소요</p>
          )}
          <button
            type="button"
            disabled={analyzeDisabled || locked}
            onClick={onAnalyze}
            className="mt-2 flex min-h-11 w-full items-center justify-center rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-blue-700 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-400"
          >
            {/* 라벨은 어절 단위로만 접고(break-keep), 아이콘은 텍스트와 같은 인라인 플로우에
                둔다 — 「2크 / 레딧」 중간 파손과 아이콘 고립을 함께 없앤다(L4-06·L2-03·R3-12).
                가격 숫자는 어떤 폭에서도 숨기지 않는다. 크레딧 표기는 「· N크레딧」 한 형식(L2-14). */}
            <span className="text-center text-xs font-semibold break-keep">
              {isExam ? (
                <>
                  <Plus className="mr-1.5 inline h-3.5 w-3.5 align-[-2px]" aria-hidden />
                  {`실전 문제 생성 · ${card.creditCost}크레딧`}
                </>
              ) : failed ? (
                <>
                  <RefreshCw className="mr-1.5 inline h-3.5 w-3.5 align-[-2px]" aria-hidden />
                  다시 시도
                </>
              ) : (
                <>
                  <ScanSearch className="mr-1.5 inline h-3.5 w-3.5 align-[-2px]" aria-hidden />
                  {`분석하기 · ${card.creditCost}크레딧`}
                </>
              )}
            </span>
          </button>
        </CardFoot>
      </div>
    );
  }

  // 사용 가능 — 기존 체크박스 카드 계약 그대로(itemCount 0 = 자료 없음 비활성).
  // 대화형 컨트롤 중첩 금지(검수 UI-6): 컨테이너는 비대화형, 체크박스는 전용 버튼,
  // 미리보기는 형제 버튼 — role=checkbox 안의 버튼은 스크린리더 접근 트리에서 눌린다.
  const disabled = card.itemCount === 0;

  return (
    <div
      className={`relative flex h-full flex-col rounded-xl border bg-white transition ${
        disabled
          ? "border-slate-200 opacity-60"
          : checked
            ? "border-blue-400 ring-2 ring-blue-100"
            : "border-slate-200 hover:border-blue-300"
      }`}
    >
      {/* 제목·부제는 체크 버튼 안(카드 본문 클릭 = 선택), 메타 행은 형제로 분리 —
          미리보기를 absolute 로 겹치면 좁은 폭(에뮬레이터 레일 동반 3열)에서 제목이
          "어…"·"직…"으로 잘린다(2026-08-10 캡처 실측). 모듈명은 절대 자르지 않는다. */}
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        aria-label={card.label}
        disabled={disabled}
        onClick={onToggle}
        className={`flex flex-col px-4 pt-4 text-left ${disabled ? "cursor-not-allowed" : "cursor-pointer"}`}
      >
        <CardHead
          slot={
            <span
              aria-hidden
              className={`${CARD_SLOT} border transition ${
                checked
                  ? "border-blue-600 bg-blue-600 text-white"
                  : "border-slate-300 bg-white"
              }`}
            >
              {checked && <Check className="h-3.5 w-3.5" />}
            </span>
          }
          label={card.label}
          subtitle={card.subtitle}
        />
      </button>
      {/* 메타 행 — 좁은 폭(에뮬레이터 레일 동반)에서도 "32문항 · 약 10분"이 한 줄로
          들어가도록 행 전체를 텍스트에 준다. 미리보기는 우상단 아이콘(28px)으로 빼고
          제목 행에는 pr-8 만 확보 — 라벨까지 넣으면 제목·메타 둘 중 하나가 반드시 깨진다. */}
      <CardFoot>
        <span
          className={`block text-xs ${disabled ? "break-keep text-slate-400" : "whitespace-nowrap font-medium text-slate-600"}`}
        >
          {disabled
            ? "이 지문에는 해당 자료가 없습니다"
            : `${card.itemCount}문항 · 약 ${card.estMin}분`}
        </span>
      </CardFoot>
      {!disabled && (
        <button
          type="button"
          onClick={onPreview}
          aria-label={`${card.label} 미리보기`}
          title="미리보기"
          // 시각 크기는 28px 그대로, 히트 영역만 ::after 로 44px 까지 넓힌다(터치 기준, R3-08)
          className="absolute right-3 top-3 inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-400 after:absolute after:-inset-2 after:content-[''] hover:bg-slate-50 hover:text-slate-700"
        >
          <Eye className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

// ── 본체 ─────────────────────────────────────────────────────────────────────

export function PassageStudioClient({
  classId,
  passageId,
  classTitle,
  initialDetail,
}: {
  classId: string;
  passageId: string;
  /** 브레드크럼 클래스 조각(§3.0) — page.tsx 가 조회해 내려준다 */
  classTitle: string;
  initialDetail: StudioPassageDetail;
}) {
  const router = useRouter();
  const [detail, setDetail] = useState<StudioPassageDetail>(initialDetail);
  const [showOriginal, setShowOriginal] = useState(false);
  const [selected, setSelected] = useState<StudioModuleId[]>([]);
  const [previewModule, setPreviewModule] = useState<StudioModuleId | null>(null);
  const [deployOpen, setDeployOpen] = useState(false);
  /** xl 미만 「학생 화면 미리보기」 전폭 시트(§3.6) */
  const [emulatorOpen, setEmulatorOpen] = useState(false);
  /** fast 라우트 fetch/SSE 가 열려 있는 동안(잡 행이 아직 안 보일 수 있는 창)의 발사 대상 */
  const [launchTarget, setLaunchTarget] = useState<LaunchTarget | null>(null);
  /** 분석 SSE 미리보기(§3.4.1-12) — 요약 스트립 바로 아래 StreamPreviewPane */
  const [streamPreview, setStreamPreview] = useState<StreamPreview | null>(null);
  const [examPending, setExamPending] = useState(false);
  /** 실패(환불) 표시 카드 — 서버 파생(최근 실패 잡)으로 시드해 새로고침에도 유지되고,
   * 폴링 콜백에서도 최신값을 읽어야 해 ref 미러를 함께 유지 */
  const [failedModules, setFailedModules] = useState<ReadonlySet<StudioModuleId>>(
    () => new Set(failedModulesFromServer(initialDetail)),
  );
  const failedRef = useRef<ReadonlySet<StudioModuleId>>(failedModules);
  const modulesRef = useRef<StudioModuleCard[]>(initialDetail.modules);

  const markFailed = useCallback((ids: readonly StudioModuleId[]) => {
    if (ids.length === 0) return;
    const next = new Set(failedRef.current);
    for (const id of ids) next.add(id);
    failedRef.current = next;
    setFailedModules(next);
  }, []);
  const clearFailed = useCallback((ids: readonly StudioModuleId[]) => {
    const hit = ids.filter((id) => failedRef.current.has(id));
    if (hit.length === 0) return;
    const next = new Set(failedRef.current);
    for (const id of hit) next.delete(id);
    failedRef.current = next;
    setFailedModules(next);
  }, []);

  const backHref = `/director/studio/c/${classId}?tab=passages`;
  /** 지문당 동시 1잡 — 서버 잡 진행 중이거나 발사 fetch/SSE 가 열려 있는 동안 */
  const anyGenerating = detail.analyzing || launchTarget !== null;
  const analyzeDisabled = anyGenerating || examPending;

  const refreshDetail = useCallback(async () => {
    const res = await getStudioPassageDetail({ classId, passageId });
    if (!res.success) return;
    if (!res.data) {
      // 등록 해제·지문 삭제 — 클래스 홈 지문 탭으로
      router.replace(`/director/studio/c/${classId}?tab=passages`);
      return;
    }
    // 카드별 상태 전이 감지 — 서버 판정(modules[].state)만 근거로 삼는다.
    // generating→ready = 주 모듈 완료, 같은 갱신의 needs→ready = 공유 기반으로 함께
    // 열린 덤 모듈(§3.4.1-11 — 서버는 발사 카드 하나만 generating 으로 좁혀 준다).
    // generating→needs = 잡 실패(환불) 표시 — 허위 실패 감지는 이 전이만(기존 유지).
    const prevById = new Map(modulesRef.current.map((m) => [m.id, m]));
    const primaryLabels: string[] = [];
    const bonusLabels: string[] = [];
    const newlyFailed: StudioModuleId[] = [];
    for (const m of res.data.modules) {
      const prev = prevById.get(m.id);
      if (!prev) continue;
      if (prev.state === "generating") {
        if (m.state === "ready") primaryLabels.push(m.label);
        else if (m.state === "needs" && !failedRef.current.has(m.id)) newlyFailed.push(m.id);
      } else if (prev.state === "needs" && m.state === "ready") {
        bonusLabels.push(m.label);
      }
    }
    if (primaryLabels.length > 0) {
      // 완료 토스트 정본(§3.4.1-11): 덤 해금을 함께 알린다.
      const primary = primaryLabels.join("·");
      toast.success(
        bonusLabels.length > 0
          ? `${primary} 분석 완료 — ${bonusLabels.join("·")}도 함께 준비되었습니다`
          : `${primary} 분석이 완료되었습니다`,
      );
    }
    if (newlyFailed.length > 0) {
      markFailed(newlyFailed);
      toast.error("분석에 실패했습니다 — 크레딧은 환불되었습니다. 다시 시도해 주세요.");
    }
    // 서버 파생 실패 병합 — 다른 탭·재진입에서 일어난 실패도 카드에 복원(검수 UI-4)
    markFailed(failedModulesFromServer(res.data));
    clearFailed(res.data.modules.filter((m) => m.state === "ready").map((m) => m.id));
    modulesRef.current = res.data.modules;
    setDetail(res.data);
  }, [classId, clearFailed, markFailed, passageId, router]);

  // 생성 진행 중 5초 폴링 — 이 화면을 떠나도 서버 잡은 계속되고,
  // analyzing=true 로 재진입한 경우도 동일하게 이 폴링이 완료를 감지한다.
  // 스트림 단절 시에도 이 폴링이 실상태를 복원한다(§3.4.1-12 무손실).
  useEffect(() => {
    if (!anyGenerating) return;
    const t = window.setInterval(() => {
      void refreshDetail();
    }, 5000);
    return () => window.clearInterval(t);
  }, [anyGenerating, refreshDetail]);

  /**
   * 분석 발사 — fast 라우트 계약(passageId 필수, stream:true SSE, 실전 학습지 미포함).
   * targetSections 있음 = 섹션 종량제(§3.4.1, 카드 발사는 sourceModule 동봉 —
   * 서버가 그 카드 하나만 "분석 중"으로 판정) / null = 구형 정액 경로(무회귀).
   * 스트림 모드에서는 402·실패가 HTTP 상태 대신 {t:"error"} 프레임으로 온다.
   */
  const startAnalysis = useCallback(
    async (target: LaunchTarget, targetSections: readonly string[] | null) => {
      if (launchTarget !== null || detail.analyzing || examPending) return;
      setLaunchTarget(target);
      const isModule = target !== "full" && target !== "reanalyze";
      if (isModule) clearFailed([target]);
      // 미리보기 stage = 발사 모듈 라벨(§3.4.1-12)
      const stageLabel = isModule
        ? STUDIO_MODULE_BY_ID.get(target)?.label ?? "분석"
        : target === "full"
          ? "전체 분석"
          : "새로 분석";
      try {
        const res = await fetch("/api/workbench/ai-jobs/passage-analysis/fast", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            passageId,
            stream: true,
            ...(targetSections ? { targetSections } : {}),
            // 발사 카드 기록(§3.4.1-11) — 전체/새로 분석은 미포함(부분집합 폴백)
            ...(isModule && targetSections ? { sourceModule: target } : {}),
          }),
        });

        const isSse =
          res.ok &&
          res.body !== null &&
          (res.headers.get("content-type") ?? "").includes("event-stream");
        if (!isSse) {
          // 스트림 개통 전 거절(프록시·미들웨어 등 조기 JSON) — 기존 분기 유지
          if (res.status === 402) {
            const body = await safeJson(res);
            const balance = typeof body.balance === "number" ? body.balance : null;
            toast.error(
              balance !== null
                ? `크레딧이 부족합니다 (보유 ${balance}크레딧). 충전 후 다시 시도해 주세요.`
                : "크레딧이 부족합니다. 충전 후 다시 시도해 주세요.",
            );
            return;
          }
          if (!res.ok) {
            const body = await safeJson(res);
            const msg =
              typeof body.details === "string"
                ? body.details
                : typeof body.error === "string"
                  ? body.error
                  : null;
            toast.error(msg ?? "분석 요청에 실패했습니다.");
            // 실패 카드(환불 안내 문구)는 과금 후 실패(5xx — 서버가 환불함)에만 — 400/404/409
            // 같은 과금 전 거절에 환불 안내를 붙이면 오정보다(검수 UI-5).
            if (res.status >= 500 && isModule) markFailed([target]);
            return;
          }
          const okBody = await safeJson(res);
          if (okBody.cached === true) {
            toast.success("기존 분석을 다시 사용했습니다");
          }
          return;
        }

        // ── SSE 소비(§3.4.1-12) — done/error 프레임에서 기존 처리로 합류 ──
        const { doneFrame, errorFrame } = await consumeAnalysisSse(
          res.body as ReadableStream<Uint8Array>,
          stageLabel,
          setStreamPreview,
        );
        if (errorFrame) {
          const status = typeof errorFrame.status === "number" ? errorFrame.status : null;
          if (status === 402) {
            const balance =
              typeof errorFrame.balance === "number" ? errorFrame.balance : null;
            toast.error(
              balance !== null
                ? `크레딧이 부족합니다 (보유 ${balance}크레딧). 충전 후 다시 시도해 주세요.`
                : "크레딧이 부족합니다. 충전 후 다시 시도해 주세요.",
            );
            return;
          }
          const msg =
            typeof errorFrame.details === "string"
              ? errorFrame.details
              : typeof errorFrame.error === "string"
                ? errorFrame.error
                : null;
          toast.error(msg ?? "분석 요청에 실패했습니다.");
          if (status !== null && status >= 500 && isModule) markFailed([target]);
          return;
        }
        if (doneFrame && doneFrame.cached === true) {
          toast.success("기존 분석을 다시 사용했습니다");
        }
        // done 프레임 부재(스트림 단절) — finally 의 refreshDetail·5초 폴링이 복원
      } catch {
        // 네트워크 단절·스트림 파싱 실패 — 서버 잡은 계속될 수 있으므로 폴링이 실상태를
        // 복원한다(치명 아님 — §3.4.1-12).
      } finally {
        // 서버 상태를 먼저 반영한 뒤 발사 오버레이·미리보기를 내린다 — 역순이면 잡 반영
        // 전 한 박자 동안 카드가 needs 로 되돌아가 깜빡임·이중 클릭 창이 생긴다(검수 UI-7).
        await refreshDetail().catch(() => {});
        setStreamPreview(null);
        setLaunchTarget(null);
      }
    },
    [clearFailed, detail.analyzing, examPending, launchTarget, markFailed, passageId, refreshDetail],
  );

  /** 새로 분석 — confirm 문구는 스펙 §3.4 D 정본(변형 금지). 구형 정액 경로 재사용.
   * 부분 보유(7종 미만)면 캐시 재사용 문장이 거짓이라 변형 문구를 쓴다(스펙 D, 검수 L2-5). */
  const reanalyze = useCallback(() => {
    if (analyzeDisabled) return;
    const partiallyHeld =
      detail.presentSections.length > 0 &&
      detail.presentSections.length < FULL_ANALYSIS_SECTIONS.length;
    const ok = window.confirm(
      partiallyHeld
        ? "부분 분석 상태에서는 저장된 분석을 재사용하지 않고 전체를 새로 생성합니다(5크레딧). 진행 중인 학습의 문항 구성도 바뀔 수 있으나, 학생이 이미 푼 기록은 유지됩니다."
        : "지문 내용이 그대로면 저장된 분석을 다시 사용합니다. 새 결과가 나오면 진행 중인 학습의 문항 구성도 바뀔 수 있으나, 학생이 이미 푼 기록은 유지됩니다.",
    );
    if (!ok) return;
    void startAnalysis("reanalyze", null);
  }, [analyzeDisabled, detail.presentSections.length, startAnalysis]);

  /** 실전 문제 추가 생성 — 기존 워크시트 라우트 계약(body 없음) 그대로(특례 §3.4). */
  const generateExam = useCallback(async () => {
    if (examPending || anyGenerating) return;
    if (!detail.analyzed) {
      // 방어선(검수 M4) — 리포트 부재면 라우트가 404 를 반환하는 막다른 클릭.
      toast.error("다른 모듈을 먼저 분석하면 생성할 수 있습니다.");
      return;
    }
    setExamPending(true);
    try {
      const res = await fetch(
        `/api/workbench/passage-reports/prime/${passageId}/worksheet`,
        { method: "POST" },
      );
      if (res.status === 402) {
        const body = await safeJson(res);
        const balance = typeof body.balance === "number" ? body.balance : null;
        toast.error(
          balance !== null
            ? `크레딧이 부족합니다 (보유 ${balance}크레딧). 충전 후 다시 시도해 주세요.`
            : "크레딧이 부족합니다. 충전 후 다시 시도해 주세요.",
        );
        return;
      }
      if (!res.ok) {
        const body = await safeJson(res);
        toast.error(
          typeof body.error === "string" ? body.error : "실전 문제 생성에 실패했습니다.",
        );
        return;
      }
      toast.success("실전 문제를 추가했습니다.");
      await refreshDetail();
    } catch {
      toast.error("실전 문제 생성에 실패했습니다.");
    } finally {
      setExamPending(false);
    }
  }, [anyGenerating, detail.analyzed, examPending, passageId, refreshDetail]);

  const toggleModule = (id: StudioModuleId) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id],
    );
  };

  // 발사 fetch/SSE 가 열려 있는 동안(서버 잡 행이 아직 안 보이는 창)의 표시 보정 —
  // 서버 판정(§3.4.1-11 재개정)과 동일하게 클릭한 카드 하나만 "생성 중".
  // full/reanalyze 는 모든 needs 카드(서버의 부분집합 폴백과 동일 표시).
  // exam 은 섹션 종량제 대상이 아니므로 examPending 이 대신 스피너를 만든다.
  const effectiveCards: StudioModuleCard[] = detail.modules.map((m) => {
    if (m.id === "exam") {
      return examPending && m.state !== "ready"
        ? { ...m, state: "generating" as const }
        : m;
    }
    if (m.state !== "needs" || launchTarget === null) return m;
    const covered =
      launchTarget === "full" || launchTarget === "reanalyze" || launchTarget === m.id;
    return covered ? { ...m, state: "generating" as const } : m;
  });

  const readyCount = detail.modules.filter((m) => m.state === "ready").length;
  const hasUsableModule = detail.modules.some(
    (m) => m.state === "ready" && m.itemCount > 0,
  );

  // 배포 바 요약 — 선택 카드 estMin 합(로컬 즉시 계산), 라벨은 모듈 카탈로그 순서
  const selectedCards = detail.modules.filter(
    (m) => selected.includes(m.id) && m.state === "ready" && m.itemCount > 0,
  );
  const totalMin = selectedCards.reduce((acc, c) => acc + c.estMin, 0);
  const tone = estMinTone(totalMin);
  const summaryLabel = selectedCards.map((c) => c.label).join(" + ");

  // 에뮬레이터 계약(§3.6) — readyModules=서빙 가능 모듈, selectedModules=체크 선택
  // (배포 바 요약과 동일 필터), refreshKey=분석 갱신 시각(재분석 반영).
  const readyModuleIds = detail.modules
    .filter((m) => m.state === "ready" && m.itemCount > 0)
    .map((m) => m.id);
  const emulator = (
    <StudentEmulator
      passageId={passageId}
      title={detail.title}
      readyModules={readyModuleIds}
      selectedModules={selectedCards.map((c) => c.id)}
      refreshKey={detail.reportUpdatedAt ?? ""}
    />
  );

  return (
    <StudioShell
      // §M wide 는 우측 에뮬레이터 레일 전제의 본문 폭 확장(§3.0) — off 면 레일이
      // 없으므로 셸 기본 폭(max-w-5xl)으로 돌려 본문이 과도하게 퍼지지 않게 한다.
      wide={SHOW_MOBILE}
      crumbs={[
        { label: "클래스 스튜디오", href: "/director/studio" },
        { label: classTitle, href: backHref },
        { label: detail.title },
      ]}
      backHref={backHref}
      title={detail.title}
      titleMeta={
        detail.source || (detail.analyzed && detail.reportUpdatedAt) ? (
          <>
            {detail.source && <span className="truncate">{detail.source}</span>}
            {detail.analyzed && detail.reportUpdatedAt && (
              <span>분석 {formatDateTime(detail.reportUpdatedAt)}</span>
            )}
          </>
        ) : undefined
      }
      actions={
        <>
          <button
            type="button"
            onClick={() => setShowOriginal((v) => !v)}
            aria-expanded={showOriginal}
            // 폰에서는 44px 터치 타깃(R3-08) — 데스크톱에서는 타이틀 행 밀도를 유지한다
            className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 md:min-h-0"
          >
            <BookOpenText className="h-3.5 w-3.5 text-slate-400" />
            원문 보기
            <ChevronDown
              className={`h-3.5 w-3.5 text-slate-400 transition-transform ${
                showOriginal ? "rotate-180" : ""
              }`}
            />
          </button>
          {/* xl 미만 전용 — xl 이상은 우측 레일이 상시 표시라 버튼이 중복이다(§3.6).
              §M off 면 미렌더(학생 화면 미리보기 = 모바일 학습 계열). */}
          {SHOW_MOBILE ? (
            <button
              type="button"
              onClick={() => setEmulatorOpen(true)}
              className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 md:min-h-0 xl:hidden"
            >
              <Smartphone className="h-3.5 w-3.5 text-slate-400" />
              학생 화면 미리보기
            </button>
          ) : null}
        </>
      }
    >
      {/* ── xl 2컬럼: 본문 + 우측 sticky 에뮬레이터 레일(§3.6) —
          §M off 면 레일이 없으므로 그리드를 걷어 단일 컬럼으로 재구성한다 ── */}
      <div
        className={
          SHOW_MOBILE
            ? "xl:grid xl:grid-cols-[minmax(0,1fr)_420px] xl:items-start xl:gap-6"
            : undefined
        }
      >
        {/* 배포 바(sticky)가 뜨는 동안에는 바 높이만큼 본문 하단 여백을 예약한다 —
            없으면 마지막 카드·이력 헤더가 바 아래에 영구히 깔린다(감사 L2-10·R3-02).
            폰은 바가 2행(요약 + 전폭 CTA)이라 더 큰 값을 쓴다.
            §M off 면 배포 바 자체가 없으므로 예약 여백도 함께 걷는다. */}
        <div
          className={`min-w-0 ${SHOW_MOBILE && hasUsableModule ? "pb-28 sm:pb-24" : ""}`}
        >
          {/* ── 접이식 원문 카드 ── */}
          {showOriginal && (
            <div className="mt-3 rounded-xl border border-slate-200 bg-white p-4 md:p-5">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                {detail.content}
              </p>
            </div>
          )}

          {/* ── A. 모듈 그리드(항상 표시 — 분석 여부와 무관) ── */}
          <div className="mt-6 flex items-end justify-between gap-2">
            <div>
              <h2 data-coach="pick-modules" className="text-sm font-bold text-slate-900">
                학습 모듈
              </h2>
              {/* 분석 안내는 아래 요약 스트립이 맡는다 — 24px 간격 안에서 같은 지시를
                  두 번 쓰지 않는다(감사 L4-11). 여기는 선택(배포) 지시만.
                  §M off 면 배포 동선이 없으므로 중립 자구(구성)로 바꾼다. */}
              <p className="mt-0.5 text-xs text-slate-400 break-keep">
                {SHOW_MOBILE
                  ? "배포할 모듈을 선택해 주세요"
                  : "구성할 모듈을 선택해 주세요"}
              </p>
            </div>
          </div>

          {/* 스테일 고지(스펙 스테일 규칙) — 본문 수정으로 기존 분석 무효, 재분석 파급 사전 안내.
              §M off 면 "배포된 학습" 자구를 중립 문장으로 재작성(반토막 금지 — T4). */}
          {detail.stale && (
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5">
              <p className="text-xs text-amber-800 break-keep">
                {SHOW_MOBILE
                  ? "본문이 수정되어 기존 분석이 무효화되었습니다. 다시 분석하면 배포된 학습의 문항 구성도 바뀝니다."
                  : "본문이 수정되어 기존 분석이 무효화되었습니다. 다시 분석하면 이미 만든 학습의 문항 구성도 바뀝니다."}
              </p>
            </div>
          )}

          {/* 얇은 요약 스트립 — 남은 전체 분석(전부 보유면 숨김, 대형 히어로 금지).
              분석이 도는 동안에는 **이 자리를** 스트리밍 패널이 대신한다(§3.4.1-12) —
              분석 중에도 결제 유도 버튼이 남아 있지 않게 한다(감사 L5-12). */}
          {streamPreview ? (
            <StreamPreviewPane preview={streamPreview} />
          ) : detail.fullAnalysisCost > 0 ? (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5">
              {/* 문장은 안내만, 버튼은 행동 + 가격 — 한 줄에 「남은 전체 분석」을 두 번
                  쓰지 않는다(감사 L2-13). 가격은 버튼으로 옮겨 「· N크레딧」 한 형식(L2-14). */}
              <p className="text-xs text-slate-500 break-keep">필요한 모듈만 골라 분석하세요</p>
              <button
                type="button"
                disabled={analyzeDisabled}
                onClick={() => void startAnalysis("full", [...FULL_ANALYSIS_SECTIONS])}
                className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 break-keep hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 md:min-h-0"
              >
                {launchTarget === "full" ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    분석 중…
                  </>
                ) : (
                  `남은 전체 분석 · ${detail.fullAnalysisCost}크레딧`
                )}
              </button>
            </div>
          ) : null}

          {/* 모듈 그리드 열 수(§3.4 A 정본) — xl 부터는 우측 에뮬레이터 레일(420px)이
              본문을 좁히므로 오히려 2열로 낮춰야 카드가 판독 가능하다(감사 L2-11·R3-04). */}
          <div
            data-coach="run-analysis"
            className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-2"
          >
            {effectiveCards.map((m) => (
              <ModuleCard
                key={m.id}
                card={m}
                checked={selected.includes(m.id)}
                failed={failedModules.has(m.id)}
                analyzeDisabled={analyzeDisabled}
                hasWorksheetSection={detail.hasWorksheetSection}
                examLocked={!detail.analyzed}
                onToggle={() => toggleModule(m.id)}
                onPreview={() => setPreviewModule(m.id)}
                onAnalyze={
                  m.id === "exam"
                    ? () => void generateExam()
                    : () => void startAnalysis(m.id, m.missingSections)
                }
              />
            ))}
          </div>
          <CoachMark
            stepId="run-analysis"
            when={readyCount === 0 && !anyGenerating}
            text="필요한 모듈만 골라 분석하세요 — 어휘만, 직독직해만도 가능합니다. 이미 만든 분석은 다시 쓰여 더 저렴해집니다"
          />
          <CoachMark
            stepId="pick-modules"
            when={
              readyCount > 0 &&
              detail.deployments.length === 0 &&
              selected.length === 0 &&
              previewModule === null &&
              !deployOpen
            }
            // §M off 면 합계 시간 표시면(배포 바·에뮬레이터)이 전부 숨어 "아래에
            // 계산됩니다"가 거짓 약속이 된다 — off 세계에 실재하는 미리보기로 안내.
            text={
              SHOW_MOBILE
                ? "원하는 모듈만 골라 보세요. 아래에 예상 학습 시간이 계산됩니다 — 10~15분이 적당합니다"
                : "원하는 모듈만 골라 보세요. 분석이 끝난 모듈은 미리보기로 바로 확인할 수 있습니다"
            }
          />

          {/* ── D. 이력 섹션 — §M off 면 모바일 학습 이력(행·지표)을 걷어내고
              「새로 분석」(분석 기능 — 이 화면의 유일한 재분석 진입점)만 남긴다.
              결과 탭·결과 보기가 숨은 세계에서 학생 수·완료율 지표는 어디로도
              이어지지 않는 막다른 표면이다(적대 검수 visual-major 수리). ── */}
          <section className="mt-8">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-slate-900">
                {SHOW_MOBILE ? "이 지문으로 만든 학습" : "분석 관리"}
              </h2>
              <div className="flex items-center gap-2">
                {/* §M off 면 결과 탭 자체가 숨으므로(U10) 결과 안내 링크도 미렌더 */}
                {SHOW_MOBILE && (
                  <Link
                    href={`/director/studio/c/${classId}?tab=results`}
                    className="inline-flex min-h-11 items-center gap-0.5 text-xs font-medium text-slate-400 break-keep hover:text-blue-600 md:min-h-0"
                  >
                    자세한 결과는 결과 탭에서
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Link>
                )}
                {detail.analyzed && (
                  <button
                    type="button"
                    onClick={reanalyze}
                    disabled={analyzeDisabled}
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 break-keep hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 md:min-h-0"
                  >
                    {anyGenerating ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        분석 중…
                      </>
                    ) : (
                      <>
                        <RefreshCw className="h-3.5 w-3.5" />
                        새로 분석
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
            {!SHOW_MOBILE ? null : detail.deployments.length === 0 ? (
              <p className="mt-3 rounded-xl border border-dashed border-slate-200 bg-white/60 px-4 py-5 text-center text-xs text-slate-400">
                아직 이 지문으로 배포한 학습이 없습니다
              </p>
            ) : (
              <div className="mt-3 space-y-2">
                {detail.deployments.map((row) => (
                  <div
                    key={row.assignmentId}
                    className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-slate-200 bg-white px-4 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[13px] font-semibold text-slate-900">
                          {formatDateTime(row.createdAt)}
                        </span>
                        {row.modules.map((mid) => {
                          const label = STUDIO_MODULE_BY_ID.get(mid)?.label;
                          if (!label) return null;
                          return (
                            <span
                              key={mid}
                              className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600"
                            >
                              {label}
                            </span>
                          );
                        })}
                      </div>
                      <p className="mt-1 truncate text-xs text-slate-400">{row.title}</p>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                      <span>학생 {row.taskCount}명</span>
                      <span>
                        완료 {row.doneCount}/{row.taskCount}
                      </span>
                      <span>
                        평균 첫 시도 정답률{" "}
                        {row.avgFirstTryPct !== null ? `${row.avgFirstTryPct}%` : "—"}
                      </span>
                      {/* §M off 면 결과 탭 자체가 숨으므로(U10) 결과 안내 링크도 미렌더 */}
                      {SHOW_MOBILE && (
                        <Link
                          href={`/director/studio/c/${classId}?tab=results`}
                          className="font-medium text-blue-600 hover:text-blue-700"
                        >
                          결과 보기
                        </Link>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* ── 우측 sticky 에뮬레이터 레일(xl 이상, §3.6) ──
            프레임이 뷰포트보다 크면(태블릿 1000px 등) 잘리는 대신 레일 안에서
            스크롤한다 — 잘린 베젤은 "고장난 화면"으로 읽힌다(캡처 실측).
            §M off 면 레일째 미렌더(학생 화면 = 모바일 학습 계열). */}
        {SHOW_MOBILE ? (
          <aside className="mt-6 hidden xl:block">
            <div className="sticky top-20 max-h-[calc(100vh-7rem)] overflow-y-auto pb-2">
              {emulator}
            </div>
          </aside>
        ) : null}
      </div>

      {/* ── C. 배포 바 (sticky bottom) ──
          폰·태블릿: 셸 패딩을 음수 마진으로 상쇄한 전폭 바(§3.5) + 요약/CTA 2행 —
          요약을 위로 올려 좌하단 고정 위젯이 겹쳐도 핵심 정보가 가려지지 않게 하고(L5-10),
          CTA 는 전폭 44px 터치 타깃이 된다(R3-08).
          xl 이상: 좌우 모두 본문 컬럼 정렬(ml-0·px-0 + mr-444) — 좌측만 넘치고 우측은
          레일을 침범하던 "어떤 정렬선과도 안 맞는" 상태를 없앤다(L4-17).
          §M off 면 바째 미렌더(내부 deploy 코치마크도 함께 소멸) — 본문 하단
          예약 여백(pb-28 sm:pb-24)도 위에서 같이 걷었다. */}
      {SHOW_MOBILE && hasUsableModule && (
        // 폰 블리드는 **-mx-3**(12px) — 셸 컨테이너의 px-4 가 전역 large-ui 오버라이드
        // (globals.css `:where(.px-4){padding:.75rem!important}`)로 폰에서 12px 이 되므로
        // -mx-4 를 쓰면 좌우 4px 씩 넘친다(실측: 바 -4..394 / 뷰포트 390). shell.tsx 가
        // 같은 이유로 -mx-3 을 쓴다. md 이상은 px-8 이 오버라이드 대상이 아니라 -mx-8 그대로.
        <div className="sticky bottom-0 z-30 -mx-3 -mb-8 mt-8 border-t border-slate-200 bg-white/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur md:-mx-8 md:px-8 xl:ml-0 xl:mr-[444px] xl:px-0">
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-3">
            <div className="min-w-0 sm:flex-1">
              {selectedCards.length === 0 ? (
                // 두 표면은 **역할이 다르다**(재검증 N-1): 에뮬레이터 배지는 "지금 무엇을
                // 보여주는가"(범위), 배포 바는 "무엇을 해야 하는가"(행동). 같은 문장을 쓰면
                // xl 에서 한 화면에 두 번 찍히고, 레일이 없는 폰·태블릿에서는 화면에 없는
                // 미리보기를 가리키게 된다. 비활성 CTA 의 이유를 알려주는 유일한 상시 표면이라
                // 행동 지시를 되돌린다.
                <p className="text-xs text-slate-500 break-keep">
                  모듈을 선택하면 배포할 수 있습니다
                </p>
              ) : (
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="text-[13px] font-semibold text-slate-900 break-keep">
                    {summaryLabel} ·{" "}
                    <span
                      className={
                        tone === "good"
                          ? "text-emerald-600"
                          : tone === "warn"
                            ? "text-rose-600"
                            : "text-slate-600"
                      }
                    >
                      약 {totalMin}분
                    </span>
                  </span>
                  {tone === "warn" && (
                    <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-600">
                      길어요
                    </span>
                  )}
                </div>
              )}
            </div>
            {/* 비활성은 명도가 아니라 **색**으로 구분한다 — opacity 만 낮춘 파란 채움은
                폰의 좁은 바에서 여전히 "지금 누르면 배포된다"로 읽힌다(L2-15·L5-18). */}
            <button
              type="button"
              data-coach="deploy"
              disabled={selectedCards.length === 0}
              onClick={() => setDeployOpen(true)}
              className="inline-flex min-h-11 w-full shrink-0 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm break-keep transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none sm:w-auto"
            >
              <Send className="h-4 w-4" aria-hidden />이 구성으로 배포
            </button>
          </div>
          <CoachMark
            stepId="deploy"
            when={selectedCards.length >= 1 && !deployOpen && previewModule === null}
            text="이 구성 그대로 학생들 폰에 전송됩니다. 채점과 오답 분석까지 자동입니다"
          />
        </div>
      )}

      {/* ── xl 미만 「학생 화면 미리보기」 전폭 시트(§3.6) ──
          §M off 면 미렌더 — 여는 버튼도 숨어 도달 불가지만 이중 봉인한다. */}
      {SHOW_MOBILE && emulatorOpen && (
        <div
          className="fixed inset-0 z-50 xl:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="학생 화면 미리보기"
        >
          <button
            type="button"
            aria-label="닫기"
            onClick={() => setEmulatorOpen(false)}
            className="absolute inset-0 bg-slate-900/40"
          />
          <div className="absolute inset-x-0 bottom-0 flex max-h-[94dvh] flex-col rounded-t-2xl border border-slate-200 bg-white shadow-xl">
            {/* 시트 헤더는 **지문**을 밝힌다 — "학생 화면 미리보기"는 이 시트를 연 버튼과
                에뮬레이터 캡션(§3.6 정본)이 이미 말한다. 헤더까지 같은 말을 하면 한 화면에
                같은 문자열이 3번 뜬다(감사 L5-13). 다이얼로그 접근명은 aria-label 이 유지. */}
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
              <h2 className="min-w-0 truncate text-sm font-bold text-slate-900">
                {detail.title}
              </h2>
              <button
                type="button"
                aria-label="닫기"
                onClick={() => setEmulatorOpen(false)}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-50 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">{emulator}</div>
          </div>
        </div>
      )}

      {/* ── 배포 다이얼로그 (U4b 소유 — 임포트 계약) ──
          §M off 면 미렌더 — 여는 CTA(배포 바)도 숨어 도달 불가지만 이중 봉인한다. */}
      {SHOW_MOBILE && deployOpen && (
        <DeployDialog
          open
          onClose={() => setDeployOpen(false)}
          classId={classId}
          passageId={passageId}
          passageTitle={detail.title}
          modules={selectedCards.map((c) => c.id)}
          onDeployed={() => {
            // 완료 토스트("N명에게 배포했습니다…")는 DeployDialog 가 스펙 문구로 띄운다
            setDeployOpen(false);
            setSelected([]);
            void refreshDetail();
          }}
        />
      )}

      {/* ── 모듈 미리보기 시트 ── */}
      <ModulePreviewSheet
        passageId={passageId}
        moduleId={previewModule}
        onClose={() => setPreviewModule(null)}
      />
    </StudioShell>
  );
}
